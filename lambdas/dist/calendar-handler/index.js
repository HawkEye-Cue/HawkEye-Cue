'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME;

function ok(body) {
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function err(status, code, message) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: { code, message } }) };
}
function getUserId(event) {
  return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null;
}

// GET /calendar/events
async function handleGetEvents(userId) {
  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'CAL#' },
  }));

  const events = (result.Items || []).map((item) => ({
    id: item.eventId,
    date: item.eventDate,
    title: item.title,
    type: item.eventType,
    completed: item.completed || false,
    link: item.link || null,
    notes: item.notes || '',
    notesSavedAt: item.notesSavedAt || null,
  }));

  return ok({ events });
}

// POST /calendar/events
async function handleCreateEvent(userId, body) {
  const { date, title, type, link } = body || {};
  if (!date || !title || !type) {
    return err(400, 'INVALID_INPUT', 'date, title, and type are required');
  }

  const eventId = randomUUID();
  const now = new Date().toISOString();

  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${userId}`,
      SK: `CAL#${date}#${eventId}`,
      eventId,
      eventDate: date,
      title: title.trim(),
      eventType: type,
      completed: false,
      link: link || null,
      createdAt: now,
    },
  }));

  return ok({ id: eventId, date, title: title.trim(), type, completed: false, link: link || null });
}

// PUT /calendar/events/{id}/toggle
async function handleToggle(userId, eventId) {
  const queryResult = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: 'eventId = :eid',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'CAL#', ':eid': eventId },
  }));

  const item = (queryResult.Items || [])[0];
  if (!item) return err(404, 'NOT_FOUND', 'Event not found');

  const newCompleted = !item.completed;
  await dynamo.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: item.PK, SK: item.SK },
    UpdateExpression: 'SET completed = :c',
    ExpressionAttributeValues: { ':c': newCompleted },
  }));

  return ok({ id: eventId, completed: newCompleted });
}

// DELETE /calendar/events/{id}
async function handleDeleteEvent(userId, eventId) {
  const queryResult = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: 'eventId = :eid',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'CAL#', ':eid': eventId },
  }));

  const item = (queryResult.Items || [])[0];
  if (!item) return err(404, 'NOT_FOUND', 'Event not found');

  await dynamo.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: item.PK, SK: item.SK },
  }));

  return ok({ deleted: true });
}

// DELETE /calendar/events/bulk?title=xxx
async function handleBulkDelete(userId, title) {
  const queryResult = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: 'contains(title, :t)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'CAL#', ':t': title },
  }));

  for (const item of (queryResult.Items || [])) {
    await dynamo.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: item.PK, SK: item.SK },
    }));
  }

  return ok({ deleted: (queryResult.Items || []).length });
}

// PUT /calendar/events/{id}/notes
async function handleUpdateNotes(userId, eventId, body) {
  const { notes } = body || {};

  const queryResult = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: 'eventId = :eid',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'CAL#', ':eid': eventId },
  }));

  const item = (queryResult.Items || [])[0];
  if (!item) return err(404, 'NOT_FOUND', 'Event not found');

  const now = new Date().toISOString();
  await dynamo.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: item.PK, SK: item.SK },
    UpdateExpression: 'SET notes = :n, notesSavedAt = :t',
    ExpressionAttributeValues: { ':n': notes || '', ':t': now },
  }));

  return ok({ id: eventId, notes: notes || '', notesSavedAt: now });
}

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);

    if (!userId) return err(401, 'UNAUTHORIZED', 'Missing user identity');

    if (method === 'GET' && path === '/calendar/events') {
      return handleGetEvents(userId);
    }
    if (method === 'POST' && path === '/calendar/events') {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleCreateEvent(userId, body);
    }
    if (method === 'PUT' && path.match(/^\/calendar\/events\/[^/]+\/toggle$/)) {
      const eventId = path.split('/calendar/events/')[1].split('/toggle')[0];
      return handleToggle(userId, eventId);
    }
    if (method === 'PUT' && path.match(/^\/calendar\/events\/[^/]+\/notes$/)) {
      const eventId = path.split('/calendar/events/')[1].split('/notes')[0];
      const body = event.body ? JSON.parse(event.body) : {};
      return handleUpdateNotes(userId, eventId, body);
    }
    if (method === 'DELETE' && path === '/calendar/events/bulk') {
      const title = event.queryStringParameters?.title;
      if (!title) return err(400, 'INVALID_INPUT', 'title query param required');
      return handleBulkDelete(userId, title);
    }
    if (method === 'DELETE' && path.match(/^\/calendar\/events\/[^/]+$/)) {
      const eventId = path.split('/calendar/events/')[1];
      return handleDeleteEvent(userId, eventId);
    }

    return err(404, 'NOT_FOUND', `No route for ${method} ${path}`);
  } catch (e) {
    console.error('calendar-handler error:', e);
    return err(500, 'INTERNAL_ERROR', e.message || 'An unexpected error occurred');
  }
};
