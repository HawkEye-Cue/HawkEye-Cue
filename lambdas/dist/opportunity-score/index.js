'use strict';

/**
 * HawkEye Radar — Opportunity Score Handler
 *
 * - POST /radar/score        — AI-classify a captured post into an opportunity score
 * - POST /radar/learn        — record Won/Lost outcome to improve future scoring
 * - GET  /radar/insights     — surface learned patterns (which phrases/groups convert)
 * - POST /radar/memory       — record an interaction with a person (Hawk Memory)
 * - GET  /radar/memory       — look up prior interactions with a person (by name)
 * - GET/POST/DELETE /radar/testimonials — manage the user's social-proof library
 * - POST /radar/proof-match  — AI-pick the best testimonial for a lead's need
 * - POST /radar/read-image   — OCR a screenshot into post text + author (OpenAI vision)
 * - GET/POST /flight-plan     — the user's ready-to-use Industry Flight Plan (AI-generated, cached)
 *
 * Uses Amazon Bedrock (Nova Lite) for classification. Learning is done by
 * aggregating Won/Lost signals per user (phrases, groups, neighborhoods, post types).
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });
const TABLE_NAME = process.env.TABLE_NAME;

// ─── OpenAI vision (screenshot → text) ───────────────────────────────────────
let _openAiKey = null;
async function getOpenAiKey() {
  if (_openAiKey) return _openAiKey;
  const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
  const sm = new SecretsManagerClient({ region: 'us-east-1' });
  const result = await sm.send(new GetSecretValueCommand({ SecretId: 'SocialLeadGen/OpenAI' }));
  _openAiKey = JSON.parse(result.SecretString).OPENAI_API_KEY;
  return _openAiKey;
}

// Extract the post text + likely author from a screenshot data URL.
async function readImage(dataUrl) {
  const apiKey = await getOpenAiKey();
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'This is a screenshot of a social media post, comment, message, or email. Extract the main message text a customer wrote, and the author\'s name if visible. Ignore UI chrome (likes, timestamps, buttons). Return ONLY valid JSON: {"author": "name or empty", "text": "the message content"}' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
      max_tokens: 500,
      temperature: 0,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Vision request failed');
  }
  const content = data.choices?.[0]?.message?.content || '';
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return { author: '', text: content.trim() };
  try { return JSON.parse(m[0]); } catch { return { author: '', text: content.trim() }; }
}

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

CRITICAL — first decide WHO is posting and WHAT they want:
- A BUYER is someone who NEEDS the service (asking for help, a recommendation, or has a problem to solve).
- A COMPETITOR / PROVIDER is someone who SELLS or OFFERS this same service — another ${tradeName || 'business'}, agent, or professional promoting themselves, advertising, prospecting, or offering quotes/help to others. They are NOT a customer.

If the author is promoting their own ${tradeName || 'business'} / agency / services, offering quotes, saying things like "I own…", "I'm a…", "I help people with…", "message me for a quote", "my agency", or otherwise advertising the SAME service the user provides — they are a COMPETITOR. Classify as competitor, score 0-5, isLead=false, and DO NOT write a suggested reply.

Examples:
- "Does anyone know a good roofer?" → BUYER, strong lead (actively seeking)
- "My roof is leaking after the storm" → BUYER, urgent lead (immediate need)
- "Thinking about replacing our roof next year" → BUYER, nurture lead (future intent)
- "My husband is a roofer" → NOT a lead (household already has a provider, score near 0)
- "Hi, I'm Sara and I own Brownell Insurance Agency — happy to give anyone a free quote!" → COMPETITOR (they SELL insurance; score 0-5, isLead=false, no reply)
- "I'm a local realtor, DM me if you're buying or selling!" → COMPETITOR (score 0-5)

Return ONLY valid JSON:
{
  "score": 0-100,
  "classification": "buyer" | "competitor" | "provider" | "off_topic",
  "urgency": "now" | "soon" | "nurture" | "not_a_lead",
  "isLead": true | false,
  "isCompetitor": true | false,
  "reason": "one plain-English sentence on why you scored it this way",
  "factors": [
    {"label": "short factor name", "points": number (can be negative)}
  ],
  "suggestedResponse": "a friendly, genuine reply the BUYER could receive (leave EMPTY string if not a buyer)",
  "followUpDays": number (days from now to follow up; 0 for now, 1 for soon, 30 for nurture),
  "estimatedValue": number (rough $ value of the potential sale/policy, best guess for a ${tradeName || 'business'}; 0 if not a buyer)
}

The "factors" array MUST explain the score transparently — each item is a reason with a point value, and the points should roughly add up to the score. Use factors like these (only include the ones that apply):
- "Strong buying language" (they're clearly ready to buy)
- "Immediate timing" (urgent / needs it now)
- "Service area match" (in the business's area) — only if location is evident
- "Direct recommendation request" (asking who to hire)
- "Future intent" (thinking about it later)
- "Existing relationship" (mentions knowing the business)
- "Competitor promoting" (NEGATIVE — they sell the same service)
- "Provider, not a buyer" (NEGATIVE points — they do this job themselves)
- "Off-topic / no intent" (NEGATIVE or low points)
Give 2-5 factors. Keep labels short (2-4 words).

Rules:
- Score 0-5 for COMPETITORS (someone selling/advertising the same service). isLead=false, isCompetitor=true, urgency="not_a_lead", empty suggestedResponse.
- Score 0-15 for other non-leads (providers, unrelated chatter).
- Score 80-100 for urgent active buyers.
- Score 50-79 for people actively asking for recommendations.
- Score 20-49 for future/nurture intent.
- NEVER write a suggested reply for a competitor or non-buyer — leave it as an empty string.
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
  const parsed = JSON.parse(jsonMatch[0]);

  // Normalize factors: ensure it's a clean array of {label, points}.
  if (!Array.isArray(parsed.factors)) parsed.factors = [];
  parsed.factors = parsed.factors
    .filter((f) => f && typeof f.label === 'string')
    .map((f) => ({ label: f.label.trim(), points: Math.round(Number(f.points) || 0) }))
    .slice(0, 6);
  // Fallback: if the AI gave no breakdown, synthesize one from the reason/score.
  if (parsed.factors.length === 0) {
    parsed.factors = [{ label: parsed.isLead ? 'Buying signal detected' : 'Low buying intent', points: parsed.score || 0 }];
  }

  // ── Competitor safety net ──────────────────────────────────────────────────
  // Belt-and-suspenders: if the AI (or an obvious text pattern) says the author is
  // selling the same service, force a non-lead result and drop any drafted reply so
  // we never suggest replying to a competitor as if they were a customer.
  const lower = String(postText || '').toLowerCase();
  const SELF_PROMO = [
    'i own', 'i am the owner', "i'm the owner", 'my agency', 'my business', 'my company',
    'i am a', "i'm a", 'i am an', "i'm an", 'dm me for a quote', 'message me for a quote',
    'free quote', 'give anyone a', 'i help people', 'i help folks', 'licensed agent',
    'contact me for', 'reach out to me', 'i sell', 'i offer', 'we offer', 'our agency',
    'book with me', 'my rates', 'i can help you save',
  ];
  const looksSelfPromo = SELF_PROMO.some((p) => lower.includes(p));
  if (parsed.isCompetitor === true || parsed.classification === 'competitor' || (looksSelfPromo && parsed.score > 15)) {
    parsed.isCompetitor = true;
    parsed.classification = 'competitor';
    parsed.isLead = false;
    parsed.urgency = 'not_a_lead';
    parsed.score = Math.min(parsed.score || 0, 5);
    parsed.estimatedValue = 0;
    parsed.suggestedResponse = '';
    parsed.followUpDays = 0;
    if (!parsed.factors.some((f) => /competitor/i.test(f.label))) {
      parsed.factors = [{ label: 'Competitor promoting', points: parsed.score }];
    }
    if (!/competitor/i.test(parsed.reason || '')) {
      parsed.reason = 'This person is promoting their own competing service — not a customer.';
    }
  }

  return parsed;
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

// ─── Hawk Memory ────────────────────────────────────────────────────────────
// Normalize a person's name into a stable memory key (lowercase, trimmed).
function memoryKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');
}

// Number of whole days between an ISO date and now.
function daysAgo(iso) {
  try {
    const then = new Date(iso).getTime();
    return Math.max(0, Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24)));
  } catch { return null; }
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

    // POST /radar/memory — record an interaction with a person (Hawk Memory)
    if (method === 'POST' && path === '/radar/memory') {
      const body = event.body ? JSON.parse(event.body) : {};
      const { personName, kind, note, group, postUrl, platform } = body;
      if (!personName || !personName.trim()) return err(400, 'INVALID_INPUT', 'personName is required');

      const key = memoryKey(personName);
      if (!key) return err(400, 'INVALID_INPUT', 'personName is required');

      const now = new Date().toISOString();
      const existing = (await dynamo.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `MEMORY#${key}` },
      })))?.Item;

      // kind: 'commented' | 'saved' | 'responded' | 'messaged' | 'scored' | 'note'
      const interaction = {
        kind: kind || 'note',
        note: (note || '').slice(0, 500),
        group: group || '',
        postUrl: postUrl || '',
        platform: platform || '',
        at: now,
      };

      const interactions = (existing?.interactions || []).slice(-40); // cap history
      interactions.push(interaction);

      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: `MEMORY#${key}`,
          displayName: personName.trim(),
          interactions,
          firstSeen: existing?.firstSeen || now,
          lastSeen: now,
          count: (existing?.count || 0) + 1,
          updatedAt: now,
        },
      }));

      return ok({ saved: true, count: interactions.length });
    }

    // GET /radar/memory?name=... — look up prior interactions with a person
    if (method === 'GET' && path === '/radar/memory') {
      const qs = event.queryStringParameters || {};
      const key = memoryKey(qs.name);
      if (!key) return ok({ memory: null });

      const res = await dynamo.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `MEMORY#${key}` },
      }));
      const data = res.Item;
      if (!data) return ok({ memory: null });

      const interactions = (data.interactions || []).slice().reverse(); // newest first
      const last = interactions[0];
      // Build a friendly one-line summary for the extension panel
      let summary = '';
      if (last) {
        const d = daysAgo(last.at);
        const when = d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
        const verb = {
          commented: 'You commented on', saved: 'You saved a lead from',
          responded: 'You responded to', messaged: 'You messaged',
          scored: 'HawkEye scored a post from', note: 'You noted about',
        }[last.kind] || 'You interacted with';
        summary = `${verb} ${data.displayName} ${when}`;
        if (last.note) summary += ` — "${last.note}"`;
      }

      return ok({
        memory: {
          displayName: data.displayName,
          count: data.count || interactions.length,
          firstSeen: data.firstSeen,
          lastSeen: data.lastSeen,
          summary,
          interactions: interactions.slice(0, 15),
        },
      });
    }

    // GET /radar/testimonials — list the user's saved testimonials/reviews
    if (method === 'GET' && path === '/radar/testimonials') {
      const res = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'TESTIMONIAL#' },
      }));
      const testimonials = (res.Items || []).map((t) => ({
        id: t.SK.replace('TESTIMONIAL#', ''),
        author: t.author || 'A happy customer',
        text: t.text || '',
        tags: t.tags || [],
        createdAt: t.createdAt,
      })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return ok({ testimonials });
    }

    // POST /radar/testimonials — add a testimonial to the social-proof library
    if (method === 'POST' && path === '/radar/testimonials') {
      const body = event.body ? JSON.parse(event.body) : {};
      const text = (body.text || '').trim();
      if (!text) return err(400, 'INVALID_INPUT', 'text is required');
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: `TESTIMONIAL#${id}`,
          author: (body.author || '').trim().slice(0, 80) || 'A happy customer',
          text: text.slice(0, 800),
          tags: Array.isArray(body.tags) ? body.tags.slice(0, 8) : [],
          createdAt: now,
        },
      }));
      return ok({ id, saved: true });
    }

    // DELETE /radar/testimonials/{id}
    const testimonialDel = path.match(/^\/radar\/testimonials\/([^/]+)$/);
    if (method === 'DELETE' && testimonialDel) {
      await dynamo.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `TESTIMONIAL#${testimonialDel[1]}` },
        UpdateExpression: 'SET deletedAt = :d',
        ExpressionAttributeValues: { ':d': new Date().toISOString() },
      })).catch(() => {});
      // Hard delete
      await dynamo.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `TESTIMONIAL#${testimonialDel[1]}` },
      }));
      return ok({ deleted: true });
    }

    // POST /radar/proof-match — pick the best testimonial for a lead's need
    if (method === 'POST' && path === '/radar/proof-match') {
      const body = event.body ? JSON.parse(event.body) : {};
      const leadNeed = (body.postText || body.need || '').trim();
      if (!leadNeed) return err(400, 'INVALID_INPUT', 'postText (the lead\'s need) is required');

      const res = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'TESTIMONIAL#' },
      }));
      const testimonials = (res.Items || []).map((t) => ({
        id: t.SK.replace('TESTIMONIAL#', ''),
        author: t.author || 'A happy customer',
        text: t.text || '',
      }));
      if (testimonials.length === 0) {
        return ok({ match: null, message: 'Add a few testimonials in HawkEye Radar to enable Social Proof Match.' });
      }
      if (testimonials.length === 1) {
        return ok({ match: testimonials[0], reason: 'Your only saved testimonial.' });
      }

      // Ask the AI to pick the most relevant testimonial by index
      const list = testimonials.map((t, i) => `[${i}] "${t.text}" — ${t.author}`).join('\n');
      const prompt = `A potential customer wrote: "${leadNeed}"

Here are testimonials/reviews from past happy customers:
${list}

Pick the ONE testimonial most relevant and reassuring for this customer's specific situation.
Return ONLY valid JSON: {"index": <number>, "reason": "one short sentence why this proof fits"}`;

      try {
        const command = new InvokeModelCommand({
          modelId: 'amazon.nova-lite-v1:0',
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            messages: [{ role: 'user', content: [{ text: prompt }] }],
            inferenceConfig: { maxTokens: 200, temperature: 0.2 },
          }),
        });
        const response = await bedrock.send(command);
        const rb = JSON.parse(new TextDecoder().decode(response.body));
        const aiText = rb.output.message.content[0].text.trim();
        const m = aiText.match(/\{[\s\S]*\}/);
        const parsed = m ? JSON.parse(m[0]) : { index: 0 };
        const idx = Math.max(0, Math.min(testimonials.length - 1, parseInt(parsed.index) || 0));
        return ok({ match: testimonials[idx], reason: parsed.reason || 'Best match for this lead.' });
      } catch (e) {
        console.error('[radar] proof-match failed:', e.message);
        return ok({ match: testimonials[0], reason: 'Suggested testimonial.' });
      }
    }

    // GET /flight-plan — return the cached Industry Flight Plan (if any)
    if (method === 'GET' && path === '/flight-plan') {
      const res = await dynamo.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'FLIGHT_PLAN' },
      }));
      return ok({ plan: res.Item?.plan || null, tradeName: res.Item?.tradeName || null, generatedAt: res.Item?.generatedAt || null });
    }

    // POST /flight-plan — generate (or regenerate) the Industry Flight Plan for a trade
    if (method === 'POST' && path === '/flight-plan') {
      const body = event.body ? JSON.parse(event.body) : {};
      const tradeName = (body.tradeName || '').trim();
      if (!tradeName) return err(400, 'INVALID_INPUT', 'tradeName is required');

      // Return the cached plan unless the caller forces a regenerate for the same trade
      if (!body.regenerate) {
        const cached = await dynamo.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${userId}`, SK: 'FLIGHT_PLAN' },
        }));
        if (cached.Item?.plan && cached.Item?.tradeName === tradeName) {
          return ok({ plan: cached.Item.plan, tradeName, generatedAt: cached.Item.generatedAt, cached: true });
        }
      }

      const prompt = `You are building a ready-to-use sales & marketing system ("Industry Flight Plan") for a ${tradeName}. Base everything on how customers for this trade actually behave on social media and how this business wins deals.

Return ONLY valid JSON with this exact shape:
{
  "keywords": [8 short search terms this business should track on social media],
  "opportunitySignals": [6 real phrases a potential customer would post when they need this service],
  "responseTemplates": [
    {"name": "short label", "text": "a warm, human 2-3 sentence reply the business could send/post (no hard sell)"} (give 3)
  ],
  "pipelineStages": [5-6 stage names from first contact to closed],
  "followUpSequence": [
    {"day": number, "channel": "call|text|email", "task": "what to do"} (give 5-7 steps over ~14-21 days)
  ],
  "contentIdeas": [5 post ideas tailored to this trade],
  "intakeQuestions": [6 questions to ask a new lead to qualify and quote them],
  "referralPartners": [5 complementary local business types that refer customers to this trade]
}

Keep everything specific to a ${tradeName}. Keep strings concise. No markdown, JSON only.`;

      let plan;
      try {
        const command = new InvokeModelCommand({
          modelId: 'amazon.nova-lite-v1:0',
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            messages: [{ role: 'user', content: [{ text: prompt }] }],
            inferenceConfig: { maxTokens: 1600, temperature: 0.6 },
          }),
        });
        const response = await bedrock.send(command);
        const rb = JSON.parse(new TextDecoder().decode(response.body));
        const aiText = rb.output.message.content[0].text.trim();
        const m = aiText.match(/\{[\s\S]*\}/);
        if (!m) throw new Error('no json');
        plan = JSON.parse(m[0]);
      } catch (e) {
        console.error('[flight-plan] generation failed:', e.message);
        return err(500, 'AI_FAILED', 'Could not build your Flight Plan. Try again.');
      }

      const generatedAt = new Date().toISOString();
      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { PK: `USER#${userId}`, SK: 'FLIGHT_PLAN', plan, tradeName, generatedAt },
      }));
      return ok({ plan, tradeName, generatedAt });
    }

    // POST /radar/read-image — OCR a screenshot into post text + author
    if (method === 'POST' && path === '/radar/read-image') {
      const body = event.body ? JSON.parse(event.body) : {};
      const dataUrl = body.image || body.dataUrl;
      if (!dataUrl || !/^data:image\//.test(dataUrl)) {
        return err(400, 'INVALID_INPUT', 'A base64 image data URL is required');
      }
      try {
        const result = await readImage(dataUrl);
        return ok({ author: result.author || '', text: result.text || '' });
      } catch (e) {
        console.error('[radar] read-image failed:', e.message);
        return err(500, 'VISION_FAILED', 'Could not read that screenshot. Try pasting the text instead.');
      }
    }

    return err(404, 'NOT_FOUND', `No route for ${method} ${path}`);
  } catch (e) {
    console.error('[opportunity-score] Error:', e.message, e.stack);
    return err(500, 'INTERNAL_ERROR', e.message || 'An unexpected error occurred');
  }
};
