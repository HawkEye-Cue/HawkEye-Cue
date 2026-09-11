'use strict';

/**
 * Policy Comparison Handler
 * - POST /policy/compare — AI-generate a layman's-terms side-by-side comparison of two policies
 * - GET /policy/comparison/{leadId} — fetch a saved comparison for a lead
 * - PUT /policy/comparison/{leadId} — save/update a comparison (AI or manual)
 * - DELETE /policy/comparison/{leadId} — remove a comparison
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });
const TABLE_NAME = process.env.TABLE_NAME;

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function err(status, code, message) { return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: { code, message } }) }; }
function getUserId(event) { return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null; }

async function generateComparison(currentPolicy, quotedPolicy, tradeName) {
  const prompt = `You are an insurance expert who explains things in plain, simple language that anyone can understand — no jargon.

Compare these two ${tradeName || 'insurance'} policies for a customer. The first is their CURRENT policy, the second is the NEW QUOTE being offered.

=== CURRENT POLICY ===
${currentPolicy}

=== NEW QUOTE ===
${quotedPolicy}

Produce a clear, side-by-side comparison in LAYMAN'S TERMS. Return ONLY valid JSON in this exact shape:
{
  "summary": "2-3 sentence plain-English summary of the key difference and whether the new quote is a good deal",
  "rows": [
    { "label": "Monthly Premium", "current": "...", "quoted": "...", "better": "current" | "quoted" | "same" },
    { "label": "Coverage / limits", "current": "...", "quoted": "...", "better": "current" | "quoted" | "same" }
  ],
  "pros": ["plain-English benefits of switching to the new quote"],
  "cons": ["plain-English downsides or things to watch out for"],
  "recommendation": "one clear sentence: should they switch or not, and why"
}

Rules:
- Use everyday words a 10th grader would understand. Avoid insurance jargon; if you must use a term, explain it.
- Include rows for: premium/cost, deductible, coverage limits, and any notable extras or gaps.
- "better" marks which policy wins that row (lower cost = better, more coverage = better).
- Be honest — if the current policy is better in some areas, say so.
- Keep each field concise.`;

  const command = new InvokeModelCommand({
    modelId: 'amazon.nova-lite-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 2000, temperature: 0.4 },
    }),
  });

  const response = await bedrock.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const aiText = responseBody.output.message.content[0].text.trim();

  const jsonMatch = aiText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse AI response');
  return JSON.parse(jsonMatch[0]);
}

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);
    if (!userId) return err(401, 'UNAUTHORIZED', 'Not authenticated');

    // POST /policy/compare — AI generate
    if (method === 'POST' && path === '/policy/compare') {
      const body = event.body ? JSON.parse(event.body) : {};
      const { currentPolicy, quotedPolicy, tradeName } = body;
      if (!currentPolicy || !quotedPolicy) {
        return err(400, 'INVALID_INPUT', 'Both currentPolicy and quotedPolicy text are required');
      }
      try {
        const comparison = await generateComparison(
          String(currentPolicy).slice(0, 8000),
          String(quotedPolicy).slice(0, 8000),
          tradeName
        );
        return ok({ comparison });
      } catch (e) {
        console.error('[policy-compare] AI error:', e.message);
        return err(500, 'AI_FAILED', 'Could not generate comparison. Try again or fill it in manually.');
      }
    }

    // GET /policy/comparison/{leadId}
    const getMatch = path.match(/^\/policy\/comparison\/([^/]+)$/);
    if (method === 'GET' && getMatch) {
      const leadId = getMatch[1];
      const result = await dynamo.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `POLICY_COMPARE#${leadId}` },
      }));
      return ok({ comparison: result.Item?.comparison || null, currentPolicy: result.Item?.currentPolicy || '', quotedPolicy: result.Item?.quotedPolicy || '' });
    }

    // PUT /policy/comparison/{leadId} — save (AI or manual)
    const putMatch = path.match(/^\/policy\/comparison\/([^/]+)$/);
    if (method === 'PUT' && putMatch) {
      const leadId = putMatch[1];
      const body = event.body ? JSON.parse(event.body) : {};
      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: `POLICY_COMPARE#${leadId}`,
          leadId,
          comparison: body.comparison || null,
          currentPolicy: (body.currentPolicy || '').slice(0, 8000),
          quotedPolicy: (body.quotedPolicy || '').slice(0, 8000),
          updatedAt: new Date().toISOString(),
        },
      }));
      return ok({ saved: true });
    }

    // DELETE /policy/comparison/{leadId}
    const delMatch = path.match(/^\/policy\/comparison\/([^/]+)$/);
    if (method === 'DELETE' && delMatch) {
      const leadId = delMatch[1];
      await dynamo.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `POLICY_COMPARE#${leadId}` },
      }));
      return ok({ deleted: true });
    }

    return err(404, 'NOT_FOUND', `No route for ${method} ${path}`);
  } catch (e) {
    console.error('[policy-comparison] Error:', e.message, e.stack);
    return err(500, 'INTERNAL_ERROR', e.message || 'An unexpected error occurred');
  }
};
