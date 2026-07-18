'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { randomUUID } = require('crypto');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});
const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });
const TABLE_NAME = process.env.TABLE_NAME;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(body) {
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function err(status, code, message) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: { code, message } }) };
}
function getUserId(event) {
  return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null;
}

let cachedSecret = null;
async function getBundleSocialSecret() {
  if (cachedSecret) return cachedSecret;
  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: 'SocialLeadGen/BundleSocial' })
  );
  cachedSecret = JSON.parse(result.SecretString);
  return cachedSecret;
}

async function bundleApiCall(method, path, body = null) {
  const { BUNDLE_SOCIAL_API_KEY } = await getBundleSocialSecret();
  const options = {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': BUNDLE_SOCIAL_API_KEY },
  };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(`https://api.bundle.social/api/v1${path}`, options);
  const result = await response.json();
  if (!response.ok) throw new Error(`Bundle.social error: ${response.status} — ${JSON.stringify(result)}`);
  return result;
}

// ─── AI Reply Generation ──────────────────────────────────────────────────────

async function generateReply(commentText, taggerName, tradeName, customTemplate) {
  if (customTemplate) {
    // Use user's custom template with simple variable substitution
    return customTemplate
      .replace(/\{name\}/gi, taggerName)
      .replace(/\{trade\}/gi, tradeName);
  }

  const prompt = `You are a friendly ${tradeName} professional. Someone named ${taggerName} left this comment or mention about your business:

"${commentText}"

Write a short, warm, and genuine thank-you reply (2-3 sentences max). Be professional but personable. Don't use excessive emojis (1-2 max). Make it feel human, not corporate.

Reply with ONLY the comment text, nothing else.`;

  const requestBody = {
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 200, temperature: 0.8 },
  };

  const command = new InvokeModelCommand({
    modelId: 'amazon.nova-lite-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(requestBody),
  });

  const response = await bedrock.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  return responseBody.output.message.content[0].text.trim().replace(/^["']|["']$/g, '');
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

/**
 * GET /appreciations/settings
 * Returns auto-reply settings for the user.
 */
async function handleGetSettings(userId) {
  const result = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: 'APPRECIATION_SETTINGS' },
  }));

  const settings = result.Item || {
    autoReplyEnabled: true,
    customReplyTemplate: '',
    replyMode: 'ai', // 'ai' | 'template' | 'off'
  };

  return ok({
    autoReplyEnabled: settings.autoReplyEnabled ?? true,
    customReplyTemplate: settings.customReplyTemplate ?? '',
    replyMode: settings.replyMode ?? 'ai',
  });
}

/**
 * PUT /appreciations/settings
 * Updates auto-reply settings.
 */
async function handleUpdateSettings(userId, body) {
  const now = new Date().toISOString();

  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${userId}`,
      SK: 'APPRECIATION_SETTINGS',
      autoReplyEnabled: body.autoReplyEnabled ?? true,
      customReplyTemplate: body.customReplyTemplate ?? '',
      replyMode: body.replyMode ?? 'ai',
      updatedAt: now,
    },
  }));

  return ok({ message: 'Settings updated' });
}

/**
 * GET /appreciations
 * Returns recent appreciations/mentions for the user.
 * Supports query params: ?platform=facebook&tagger=Mike
 */
async function handleGetAppreciations(userId, event) {
  const platform = event.queryStringParameters?.platform || null;
  const tagger = event.queryStringParameters?.tagger || null;

  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'APPRECIATION#',
    },
    ScanIndexForward: false,
    Limit: 100,
  }));

  let items = (result.Items || []).map((item) => ({
    id: item.appreciationId,
    taggerName: item.taggerName,
    taggerTrade: item.taggerTrade || null,
    platform: item.platform,
    postContent: item.postContent,
    postUrl: item.postUrl || null,
    detectedAt: item.detectedAt,
    thanked: item.thanked || false,
    autoReplied: item.autoReplied || false,
    replyText: item.replyText || null,
    replyStatus: item.replyStatus || 'pending',
  }));

  // Apply filters
  if (platform) {
    items = items.filter((i) => i.platform.toLowerCase() === platform.toLowerCase());
  }
  if (tagger) {
    items = items.filter((i) => i.taggerName.toLowerCase().includes(tagger.toLowerCase()));
  }

  // Build advocate profiles (grouped by tagger name)
  const advocateMap = {};
  for (const item of items) {
    const name = item.taggerName;
    if (!advocateMap[name]) {
      advocateMap[name] = {
        name,
        trade: item.taggerTrade,
        platforms: new Set(),
        count: 0,
        firstSeen: item.detectedAt,
        lastSeen: item.detectedAt,
      };
    }
    advocateMap[name].platforms.add(item.platform);
    advocateMap[name].count++;
    if (item.detectedAt < advocateMap[name].firstSeen) advocateMap[name].firstSeen = item.detectedAt;
    if (item.detectedAt > advocateMap[name].lastSeen) advocateMap[name].lastSeen = item.detectedAt;
    if (item.taggerTrade && !advocateMap[name].trade) advocateMap[name].trade = item.taggerTrade;
  }

  const advocates = Object.values(advocateMap).map((a) => ({
    name: a.name,
    trade: a.trade,
    platforms: Array.from(a.platforms),
    count: a.count,
    firstSeen: a.firstSeen,
    lastSeen: a.lastSeen,
  })).sort((a, b) => b.count - a.count);

  return ok({ items, advocates });
}

/**
 * POST /appreciations
 * Manually adds an appreciation (e.g., from browser extension).
 */
async function handleCreateAppreciation(userId, body) {
  const id = randomUUID();
  const now = new Date().toISOString();

  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${userId}`,
      SK: `APPRECIATION#${now}#${id}`,
      appreciationId: id,
      taggerName: body.taggerName || 'Unknown',
      taggerTrade: body.taggerTrade || null,
      platform: body.platform || 'unknown',
      postContent: body.postContent || '',
      postUrl: body.postUrl || null,
      detectedAt: now,
      thanked: false,
      autoReplied: false,
      replyStatus: 'pending',
    },
  }));

  return ok({ id, createdAt: now });
}

/**
 * PUT /appreciations/{id}/thank
 * Marks an appreciation as thanked and optionally auto-replies.
 */
async function handleThank(userId, appreciationId, body) {
  // Find the appreciation
  const queryResult = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: 'appreciationId = :aid',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'APPRECIATION#',
      ':aid': appreciationId,
    },
  }));

  const item = (queryResult.Items || [])[0];
  if (!item) return err(404, 'NOT_FOUND', 'Appreciation not found');

  // Get user profile for trade name
  const userResult = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
  }));
  const tradeName = userResult.Item?.selectedTradeName || 'professional';

  // Generate or use provided reply
  let replyText = body?.replyText || null;
  if (!replyText) {
    try {
      replyText = await generateReply(
        item.postContent,
        item.taggerName,
        tradeName,
        null // AI-generated
      );
    } catch (e) {
      console.error('Failed to generate reply:', e);
      replyText = `Thank you so much for the kind words, ${item.taggerName}! We really appreciate it. 🙏`;
    }
  }

  // Update the appreciation record
  await dynamo.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: item.PK, SK: item.SK },
    UpdateExpression: 'SET thanked = :t, replyText = :rt, replyStatus = :rs, thankedAt = :now',
    ExpressionAttributeValues: {
      ':t': true,
      ':rt': replyText,
      ':rs': 'sent',
      ':now': new Date().toISOString(),
    },
  }));

  // TODO: If user has connected social accounts via Bundle.social,
  // post the reply as a comment via Bundle.social's comment API
  // For now, we return the reply text for the user to copy/post manually

  return ok({ thanked: true, replyText });
}

/**
 * POST /appreciations/generate-reply
 * Generates an AI reply without sending it (preview).
 */
async function handleGenerateReply(userId, body) {
  const userResult = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
  }));
  const tradeName = userResult.Item?.selectedTradeName || 'professional';

  const replyText = await generateReply(
    body.postContent || '',
    body.taggerName || 'them',
    tradeName,
    body.useTemplate ? body.template : null
  );

  return ok({ replyText });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);

    if (!userId) return err(401, 'UNAUTHORIZED', 'Missing user identity');

    // GET /appreciations/settings
    if (method === 'GET' && path === '/appreciations/settings') {
      return handleGetSettings(userId);
    }

    // PUT /appreciations/settings
    if (method === 'PUT' && path === '/appreciations/settings') {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleUpdateSettings(userId, body);
    }

    // GET /appreciations
    if (method === 'GET' && path === '/appreciations') {
      return handleGetAppreciations(userId, event);
    }

    // POST /appreciations
    if (method === 'POST' && path === '/appreciations') {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleCreateAppreciation(userId, body);
    }

    // PUT /appreciations/{id}/thank
    const thankMatch = path.match(/^\/appreciations\/([^/]+)\/thank$/);
    if (method === 'PUT' && thankMatch) {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleThank(userId, thankMatch[1], body);
    }

    // DELETE /appreciations/{id}
    const deleteMatch = path.match(/^\/appreciations\/([^/]+)$/);
    if (method === 'DELETE' && deleteMatch && deleteMatch[1] !== 'settings') {
      const appreciationId = deleteMatch[1];
      const queryResult = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'appreciationId = :aid',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'APPRECIATION#',
          ':aid': appreciationId,
        },
      }));
      const item = (queryResult.Items || [])[0];
      if (!item) return err(404, 'NOT_FOUND', 'Appreciation not found');
      const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');
      await dynamo.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: item.PK, SK: item.SK } }));
      return ok({ deleted: true });
    }

    // POST /appreciations/generate-reply
    if (method === 'POST' && path === '/appreciations/generate-reply') {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleGenerateReply(userId, body);
    }

    return err(404, 'NOT_FOUND', `No route for ${method} ${path}`);
  } catch (e) {
    console.error('appreciations-handler error:', e);
    return err(500, 'INTERNAL_ERROR', e.message || 'An unexpected error occurred');
  }
};
