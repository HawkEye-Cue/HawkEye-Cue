'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');

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

// Default cues when user has none for today
function getDefaultCues() {
  const today = new Date().toISOString().split('T')[0];
  return [
    { id: `cue-1-${today}`, text: 'Engage with 3 posts in your trade community', completed: false },
    { id: `cue-2-${today}`, text: 'Share one piece of helpful advice in a group', completed: false },
    { id: `cue-3-${today}`, text: 'Comment on a potential lead\'s post', completed: false },
    { id: `cue-4-${today}`, text: 'Post one piece of content (tip, story, or update)', completed: false },
    { id: `cue-5-${today}`, text: 'Send a follow-up message to a warm lead', completed: false },
  ];
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// GET /cues
async function handleGetCues(userId) {
  const today = new Date().toISOString().split('T')[0];

  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': `CUE#${today}`,
      },
    })
  );

  const cues = result.Items && result.Items.length > 0
    ? result.Items.map((item) => ({
        id: item.cueId,
        text: item.text,
        completed: item.completed || false,
      }))
    : getDefaultCues();

  return respond(200, { cues, date: today });
}

// PUT /cues/{id}/complete
async function handleCompleteCue(userId, cueId) {
  if (typeof cueId !== 'string' || cueId.length < 1) {
    return respond(400, { error: { code: 'VALIDATION_ERROR', message: 'Cue ID is required' } });
  }

  const today = new Date().toISOString().split('T')[0];

  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `CUE#${today}#${cueId}` },
        UpdateExpression: 'SET completed = :completed',
        ExpressionAttributeValues: { ':completed': true },
      })
    );
  } catch (e) {
    console.error('Failed to mark cue complete:', e);
  }

  return respond(200, { id: cueId, completed: true });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);

    if (!userId) return respond(401, { error: { code: 'UNAUTHORIZED', message: 'Missing user identity' } });

    if (method === 'GET' && path === '/cues') {
      return handleGetCues(userId);
    }

    const completeMatch = path.match(/^\/cues\/([^/]+)\/complete$/);
    if (method === 'PUT' && completeMatch) {
      return handleCompleteCue(userId, completeMatch[1]);
    }

    return respond(404, { error: { code: 'NOT_FOUND', message: `No route for ${method} ${path}` } });
  } catch (e) {
    console.error('daily-cues-handler error:', e);
    return respond(500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
};
