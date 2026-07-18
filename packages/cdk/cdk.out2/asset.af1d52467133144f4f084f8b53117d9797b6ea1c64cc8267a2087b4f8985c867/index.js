'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function getUserId(event) {
  return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null;
}

// Input validation
function validateKeyword(keyword) {
  if (typeof keyword !== 'string') return 'Keyword must be a string';
  if (keyword.length < 1) return 'Keyword cannot be empty';
  if (keyword.length > 100) return 'Keyword must be at most 100 characters';
  return null;
}

function validateTradeId(tradeId) {
  if (typeof tradeId !== 'string' || tradeId.length < 1) return 'Trade ID is required';
  return null;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// GET /keywords
async function handleGetKeywords(userId) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'KW#',
      },
    })
  );

  const keywords = (result.Items || []).map((item) => ({
    id: item.keywordId,
    keyword: item.keyword,
    tradeId: item.tradeId,
    createdAt: item.createdAt,
  }));

  return respond(200, { keywords });
}

// POST /keywords
async function handleCreateKeyword(userId, body) {
  const { keyword, tradeId } = body || {};

  const kwError = validateKeyword(keyword);
  if (kwError) return respond(400, { error: { code: 'INVALID_KEYWORD', message: kwError } });

  const tradeError = validateTradeId(tradeId);
  if (tradeError) return respond(400, { error: { code: 'INVALID_TRADE_ID', message: tradeError } });

  // ─── Tier Limit Check ─────────────────────────────────────────────────
  const { GetCommand } = require('@aws-sdk/lib-dynamodb');
  const profileResult = await dynamo.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
    })
  );
  const profile = profileResult.Item || {};
  const tier = profile.subscriptionTier || 'free';
  const LIMITS = { free: 5, base: 20, growth: 50, soar: Infinity, pro: Infinity, team: Infinity };
  const limit = LIMITS[tier] ?? 5;

  // Count existing keywords
  const countResult = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'KW#' },
      Select: 'COUNT',
    })
  );
  const currentCount = countResult.Count || 0;

  if (currentCount >= limit) {
    return respond(403, {
      error: {
        code: 'TIER_LIMIT_REACHED',
        message: `You've reached the ${limit} keyword limit on the ${tier} plan. Upgrade for more.`,
        limit,
        used: currentCount,
        tier,
      },
    });
  }

  const keywordId = randomUUID();
  const now = new Date().toISOString();

  await dynamo.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `KW#${keywordId}`,
        keywordId,
        keyword: keyword.trim().toLowerCase(),
        tradeId,
        createdAt: now,
        GSI1PK: `TRADE#${tradeId}`,
        GSI1SK: `KW#${keyword.trim().toLowerCase()}`,
      },
    })
  );

  return respond(201, { id: keywordId, keyword: keyword.trim().toLowerCase(), tradeId, createdAt: now });
}

// PUT /keywords/{id}
async function handleUpdateKeyword(userId, keywordId, body) {
  const { keyword } = body || {};

  const kwError = validateKeyword(keyword);
  if (kwError) return respond(400, { error: { code: 'INVALID_KEYWORD', message: kwError } });

  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `KW#${keywordId}` },
      UpdateExpression: 'SET keyword = :kw',
      ExpressionAttributeValues: { ':kw': keyword.trim().toLowerCase() },
      ConditionExpression: 'attribute_exists(PK)',
    })
  );

  return respond(200, { id: keywordId, keyword: keyword.trim().toLowerCase() });
}

// DELETE /keywords/{id}
async function handleDeleteKeyword(userId, keywordId) {
  await dynamo.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `KW#${keywordId}` },
      ConditionExpression: 'attribute_exists(PK)',
    })
  );

  return respond(200, { deleted: true });
}

// GET /keywords/defaults
async function handleGetDefaults() {
  // Return trade-agnostic default keywords for new users
  const defaults = [
    'looking for recommendations',
    'anyone know a good',
    'need help with',
    'can someone recommend',
    'who do you use for',
    'looking for a contractor',
    'need a quote',
    'does anyone do',
  ];

  return respond(200, { defaults });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);

    if (!userId) return respond(401, { error: { code: 'UNAUTHORIZED', message: 'Missing user identity' } });

    // GET /keywords/defaults (must be before /keywords to avoid path collision)
    if (method === 'GET' && path === '/keywords/defaults') {
      return handleGetDefaults();
    }

    // GET /keywords
    if (method === 'GET' && path === '/keywords') {
      return handleGetKeywords(userId);
    }

    // POST /keywords
    if (method === 'POST' && path === '/keywords') {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleCreateKeyword(userId, body);
    }

    // PUT /keywords/{id}
    const putMatch = path.match(/^\/keywords\/([^/]+)$/);
    if (method === 'PUT' && putMatch) {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleUpdateKeyword(userId, putMatch[1], body);
    }

    // DELETE /keywords/{id}
    const deleteMatch = path.match(/^\/keywords\/([^/]+)$/);
    if (method === 'DELETE' && deleteMatch) {
      return handleDeleteKeyword(userId, deleteMatch[1]);
    }

    return respond(404, { error: { code: 'NOT_FOUND', message: `No route for ${method} ${path}` } });
  } catch (e) {
    console.error('keywords-handler error:', e);
    if (e.name === 'ConditionalCheckFailedException') {
      return respond(404, { error: { code: 'NOT_FOUND', message: 'Keyword not found' } });
    }
    return respond(500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
};
