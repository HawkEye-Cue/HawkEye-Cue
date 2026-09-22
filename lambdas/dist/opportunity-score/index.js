'use strict';

/**
 * HawkEye Radar — Opportunity Score Handler
 *
 * - POST /radar/score        — AI-classify a captured post into an opportunity score
 * - POST /radar/learn        — record Won/Lost outcome to improve future scoring
 * - GET  /radar/insights     — surface learned patterns (which phrases/groups convert)
 *
 * Uses Amazon Bedrock (Nova Lite) for classification. Learning is done by
 * aggregating Won/Lost signals per user (phrases, groups, neighborhoods, post types).
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });
const TABLE_NAME = process.env.TABLE_NAME;

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function err(status, code, message) { return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: { code, message } }) }; }
function getUserId(event) { return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null; }

// ─── AI Classification ──────────────────────────────────────────────────────
async function classifyPost({ postText, tradeName, userCity, learnedContext }) {
  const prompt = `You are HawkEye Radar, an expert at spotting sales opportunities in social media posts for a ${tradeName || 'local business'}.

Analyze this post and decide how likely it is to become a PAYING CUSTOMER.

POST: "${postText}"
${userCity ? `The business serves the ${userCity} area.` : ''}
${learnedContext ? `\nWhat has historically converted well for this business: ${learnedContext}` : ''}

Distinguish real buying signals from noise. Examples:
- "Does anyone know a good roofer?" → strong lead (actively seeking)
- "My roof is leaking after the storm" → urgent lead (immediate need)
- "Thinking about replacing our roof next year" → nurture lead (future intent)
- "My husband is a roofer" → NOT a lead (they are a provider, score near 0)

Return ONLY valid JSON:
{
  "score": 0-100,
  "urgency": "now" | "soon" | "nurture" | "not_a_lead",
  "isLead": true | false,
  "reason": "one plain-English sentence on why you scored it this way",
  "suggestedResponse": "a friendly, genuine reply the user could post (no hard selling, sound human)",
  "followUpDays": number (days from now to follow up; 0 for now, 1 for soon, 30 for nurture),
  "estimatedValue": number (rough $ value of the potential sale/policy, best guess for a ${tradeName || 'business'})
}

Rules:
- Score 0-15 for non-leads (providers, unrelated chatter).
- Score 80-100 for urgent active buyers.
- Score 50-79 for people actively asking for recommendations.
- Score 20-49 for future/nurture intent.
- Keep the suggested response short, warm, and human — not salesy.`;

  const command = new InvokeModelCommand({
    modelId: 'amazon.nova-lite-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 800, temperature: 0.3 },
    }),
  });

  const response = await bedrock.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const aiText = responseBody.output.message.content[0].text.trim();
  const jsonMatch = aiText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse classification');
  return JSON.parse(jsonMatch[0]);
}

// Build a short "what converts" context string from the user's learned patterns
async function getLearnedContext(userId) {
  try {
    const res = await dynamo.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'RADAR_LEARNING' },
    }));
    const data = res.Item;
    if (!data) return '';
    const parts = [];
    // Top converting phrases
    const phrases = Object.entries(data.wonPhrases || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p]) => p);
    if (phrases.length) parts.push(`phrases like: ${phrases.join(', ')}`);
    const groups = Object.entries(data.wonGroups || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
    if (groups.length) parts.push(`groups: ${groups.join(', ')}`);
    return parts.join('; ');
  } catch { return ''; }
}

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);
    if (!userId) return err(401, 'UNAUTHORIZED', 'Not authenticated');

    // POST /radar/score
    if (method === 'POST' && path === '/radar/score') {
      const body = event.body ? JSON.parse(event.body) : {};
      const { postText, tradeName, userCity, group } = body;
      if (!postText || !postText.trim()) return err(400, 'INVALID_INPUT', 'postText is required');

      const learnedContext = await getLearnedContext(userId);
      let result;
      try {
        result = await classifyPost({ postText, tradeName, userCity, learnedContext });
      } catch (e) {
        console.error('[radar] classify failed:', e.message);
        return err(500, 'AI_FAILED', 'Could not score this post. Try again.');
      }

      // Compute a suggested follow-up date
      const followUp = new Date();
      followUp.setDate(followUp.getDate() + (result.followUpDays || 0));
      // Never on Sundays
      if (followUp.getDay() === 0) followUp.setDate(followUp.getDate() + 1);
      result.followUpDate = `${followUp.getFullYear()}-${String(followUp.getMonth() + 1).padStart(2, '0')}-${String(followUp.getDate()).padStart(2, '0')}`;
      result.group = group || '';

      return ok({ result });
    }

    // POST /radar/learn — record a Won/Lost outcome to improve future scoring
    if (method === 'POST' && path === '/radar/learn') {
      const body = event.body ? JSON.parse(event.body) : {};
      const { postText, group, outcome } = body; // outcome: 'won' | 'lost'
      if (!postText || !outcome) return err(400, 'INVALID_INPUT', 'postText and outcome are required');

      // Extract meaningful phrases (2-4 word chunks) from the post
      const words = String(postText).toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      const phrases = [];
      for (let i = 0; i < words.length - 1; i++) {
        phrases.push(words.slice(i, i + 2).join(' '));
      }

      const existing = (await dynamo.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'RADAR_LEARNING' },
      })))?.Item || { wonPhrases: {}, lostPhrases: {}, wonGroups: {}, lostGroups: {}, wonCount: 0, lostCount: 0 };

      const phraseKey = outcome === 'won' ? 'wonPhrases' : 'lostPhrases';
      const groupKey = outcome === 'won' ? 'wonGroups' : 'lostGroups';
      existing[phraseKey] = existing[phraseKey] || {};
      existing[groupKey] = existing[groupKey] || {};
      for (const p of phrases.slice(0, 30)) existing[phraseKey][p] = (existing[phraseKey][p] || 0) + 1;
      if (group) existing[groupKey][group] = (existing[groupKey][group] || 0) + 1;
      existing[outcome === 'won' ? 'wonCount' : 'lostCount'] = (existing[outcome === 'won' ? 'wonCount' : 'lostCount'] || 0) + 1;

      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { PK: `USER#${userId}`, SK: 'RADAR_LEARNING', ...existing, updatedAt: new Date().toISOString() },
      }));
      return ok({ learned: true });
    }

    // GET /radar/insights — surface learned conversion patterns
    if (method === 'GET' && path === '/radar/insights') {
      const res = await dynamo.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'RADAR_LEARNING' },
      }));
      const data = res.Item;
      if (!data || (data.wonCount || 0) < 3) {
        return ok({ insights: [], message: 'Mark a few leads as Won or Lost and HawkEye Radar will start spotting your winning patterns.' });
      }

      const insights = [];
      const topGroups = Object.entries(data.wonGroups || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
      for (const [group, count] of topGroups) {
        insights.push(`Leads from "${group}" convert well — ${count} closed here.`);
      }
      const topPhrases = Object.entries(data.wonPhrases || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (topPhrases.length) {
        insights.push(`Winning phrases: ${topPhrases.map(([p]) => `"${p}"`).join(', ')}`);
      }
      const total = (data.wonCount || 0) + (data.lostCount || 0);
      if (total > 0) {
        insights.push(`Your close rate on scored leads: ${Math.round((data.wonCount / total) * 100)}%`);
      }
      return ok({ insights });
    }

    return err(404, 'NOT_FOUND', `No route for ${method} ${path}`);
  } catch (e) {
    console.error('[opportunity-score] Error:', e.message, e.stack);
    return err(500, 'INTERNAL_ERROR', e.message || 'An unexpected error occurred');
  }
};
