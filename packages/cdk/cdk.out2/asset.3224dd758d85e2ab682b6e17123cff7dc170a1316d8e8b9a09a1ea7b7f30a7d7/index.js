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

const VALID_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'nextdoor'];
const VALID_STATUSES = ['new', 'followed_up', 'converted', 'dismissed'];

function validateOpportunity(body) {
  const errors = [];
  if (!body) return ['Request body is required'];

  if (typeof body.sourceContent !== 'string' || body.sourceContent.length < 1) {
    errors.push('sourceContent is required');
  }
  if (typeof body.sourceContent === 'string' && body.sourceContent.length > 5000) {
    errors.push('sourceContent must be at most 5000 characters');
  }
  if (!VALID_PLATFORMS.includes(body.sourcePlatform)) {
    errors.push(`sourcePlatform must be one of: ${VALID_PLATFORMS.join(', ')}`);
  }
  if (typeof body.sourceUrl !== 'string' || body.sourceUrl.length < 1) {
    errors.push('sourceUrl is required');
  }
  if (typeof body.sourceAuthor !== 'string' || body.sourceAuthor.length < 1) {
    errors.push('sourceAuthor is required');
  }

  return errors;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// GET /opportunities
async function handleGetOpportunities(userId) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'OPP#',
      },
      ScanIndexForward: false,
    })
  );

  const opportunities = (result.Items || []).map((item) => ({
    id: item.opportunityId,
    keywordId: item.keywordId,
    sourceContent: item.sourceContent,
    sourcePlatform: item.sourcePlatform,
    sourceUrl: item.sourceUrl,
    sourceAuthor: item.sourceAuthor,
    status: item.status,
    createdAt: item.createdAt,
  }));

  return respond(200, { opportunities });
}

// POST /opportunities
async function handleCreateOpportunity(userId, body) {
  const errors = validateOpportunity(body);
  if (errors.length > 0) {
    return respond(400, { error: { code: 'VALIDATION_ERROR', message: errors.join('; ') } });
  }

  const opportunityId = randomUUID();
  const now = new Date().toISOString();

  await dynamo.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `OPP#${now}#${opportunityId}`,
        opportunityId,
        keywordId: body.keywordId,
        sourceContent: body.sourceContent.substring(0, 5000),
        sourcePlatform: body.sourcePlatform,
        sourceUrl: body.sourceUrl,
        sourceAuthor: body.sourceAuthor,
        status: 'new',
        createdAt: now,
      },
    })
  );

  return respond(201, { id: opportunityId, status: 'new', createdAt: now });
}

// PUT /opportunities/{id}/status
async function handleUpdateStatus(userId, opportunityId, body) {
  const { status } = body || {};

  if (!VALID_STATUSES.includes(status)) {
    return respond(400, { error: { code: 'INVALID_STATUS', message: `status must be one of: ${VALID_STATUSES.join(', ')}` } });
  }

  // Query to find the full SK for this opportunity
  const queryResult = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      FilterExpression: 'opportunityId = :oppId',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'OPP#',
        ':oppId': opportunityId,
      },
    })
  );

  const item = (queryResult.Items || [])[0];
  if (!item) return respond(404, { error: { code: 'NOT_FOUND', message: 'Opportunity not found' } });

  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: item.PK, SK: item.SK },
      UpdateExpression: 'SET #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
    })
  );

  return respond(200, { id: opportunityId, status });
}

// DELETE /opportunities/{id}
async function handleDeleteOpportunity(userId, opportunityId) {
  const queryResult = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      FilterExpression: 'opportunityId = :oppId',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'OPP#',
        ':oppId': opportunityId,
      },
    })
  );

  const item = (queryResult.Items || [])[0];
  if (!item) return respond(404, { error: { code: 'NOT_FOUND', message: 'Opportunity not found' } });

  await dynamo.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: item.PK, SK: item.SK } })
  );

  return respond(200, { deleted: true });
}

// GET /opportunities/stats
async function handleGetStats(userId) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'OPP#',
      },
    })
  );

  const items = result.Items || [];
  const stats = {
    total: items.length,
    new: items.filter((i) => i.status === 'new').length,
    followed_up: items.filter((i) => i.status === 'followed_up').length,
    converted: items.filter((i) => i.status === 'converted').length,
    dismissed: items.filter((i) => i.status === 'dismissed').length,
  };

  return respond(200, { stats });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);

    if (!userId) return respond(401, { error: { code: 'UNAUTHORIZED', message: 'Missing user identity' } });

    // GET /opportunities/stats
    if (method === 'GET' && path === '/opportunities/stats') {
      return handleGetStats(userId);
    }

    // GET /opportunities
    if (method === 'GET' && path === '/opportunities') {
      return handleGetOpportunities(userId);
    }

    // POST /opportunities
    if (method === 'POST' && path === '/opportunities') {
      const body = event.body ? JSON.parse(event.body) : null;
      return handleCreateOpportunity(userId, body);
    }

    // PUT /opportunities/{id}/status
    const statusMatch = path.match(/^\/opportunities\/([^/]+)\/status$/);
    if (method === 'PUT' && statusMatch) {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleUpdateStatus(userId, statusMatch[1], body);
    }

    // DELETE /opportunities/{id}
    const deleteMatch = path.match(/^\/opportunities\/([^/]+)$/);
    if (method === 'DELETE' && deleteMatch) {
      return handleDeleteOpportunity(userId, deleteMatch[1]);
    }

    return respond(404, { error: { code: 'NOT_FOUND', message: `No route for ${method} ${path}` } });
  } catch (e) {
    console.error('opportunities-handler error:', e);
    return respond(500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
};
