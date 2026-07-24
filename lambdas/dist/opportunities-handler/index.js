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

const VALID_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'nextdoor', 'other'];
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
  if (body.sourcePlatform && !VALID_PLATFORMS.includes(body.sourcePlatform)) {
    errors.push(`sourcePlatform must be one of: ${VALID_PLATFORMS.join(', ')}`);
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
    keywordText: item.keywordId === 'manual-entry' ? (item.leadSource || 'Manual') : item.keywordId,
    sourceContent: item.sourceContent,
    sourcePlatform: item.sourcePlatform,
    sourceUrl: item.sourceUrl || '',
    sourceAuthor: item.sourceAuthor,
    leadSource: item.leadSource || null,
    leadSourceGroup: item.leadSourceGroup || null,
    policyType: item.policyType || null,
    assignedTo: item.assignedTo || null,
    bucket: item.bucket || null,
    expectedPremium: item.expectedPremium || null,
    leadNotes: item.leadNotes || null,
    leadColor: item.leadColor || null,
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
        keywordId: body.keywordId || 'manual-entry',
        sourceContent: body.sourceContent.substring(0, 5000),
        sourcePlatform: body.sourcePlatform || 'other',
        sourceUrl: body.sourceUrl || '',
        sourceAuthor: body.sourceAuthor,
        leadSource: body.leadSource || null,
        leadSourceGroup: body.leadSourceGroup || null,
        policyType: body.policyType || null,
        assignedTo: body.assignedTo || null,
        bucket: body.bucket || null,
        expectedPremium: body.expectedPremium || null,
        status: 'new',
        createdAt: now,
      },
    })
  );

  // Auto-create follow-up protocol from user's saved template
  try {
    const templateResult = await dynamo.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'LEAD_PROTOCOL_TEMPLATE' },
    }));
    const template = (templateResult.Items || [])[0];
    if (template && template.steps && template.steps.length > 0) {
      const startDate = new Date(now);
      const steps = template.steps.map((s, i) => {
        const eventDate = new Date(startDate);
        eventDate.setDate(eventDate.getDate() + (s.day || 0));
        const scheduledDate = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
        return {
          idx: i,
          day: s.day || 0,
          type: s.type || 'call',
          task: s.task || '',
          completed: false,
          completedAt: null,
          scheduledDate,
        };
      });

      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: `LEAD_PROTOCOL#${opportunityId}`,
          opportunityId,
          leadName: body.sourceAuthor,
          steps,
          createdAt: now,
          updatedAt: now,
        },
      }));
    }
  } catch (e) {
    console.error('Failed to auto-create protocol:', e);
  }

  return respond(201, { id: opportunityId, status: 'new', createdAt: now });
}

// PUT /opportunities/{id}/status
async function handleUpdateStatus(userId, opportunityId, body) {
  const { status, assignedTo, policyType, expectedPremium, bucket } = body || {};

  // At least one field must be provided
  if (!status && assignedTo === undefined && policyType === undefined && expectedPremium === undefined && bucket === undefined) {
    return respond(400, { error: { code: 'INVALID_INPUT', message: 'At least one field is required' } });
  }

  if (status && !VALID_STATUSES.includes(status)) {
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

  // Build dynamic update expression
  const updates = [];
  const names = {};
  const values = {};
  if (status) {
    updates.push('#status = :status');
    names['#status'] = 'status';
    values[':status'] = status;
  }
  if (assignedTo !== undefined) {
    updates.push('assignedTo = :assignedTo');
    values[':assignedTo'] = assignedTo || null;
  }
  if (policyType !== undefined) {
    updates.push('policyType = :policyType');
    values[':policyType'] = policyType || null;
  }
  if (expectedPremium !== undefined) {
    updates.push('expectedPremium = :expectedPremium');
    values[':expectedPremium'] = expectedPremium || null;
  }
  if (bucket !== undefined) {
    updates.push('bucket = :bucket');
    values[':bucket'] = bucket || null;
  }
  if (body.leadNotes !== undefined) {
    updates.push('leadNotes = :leadNotes');
    values[':leadNotes'] = body.leadNotes || null;
  }
  if (body.leadColor !== undefined) {
    updates.push('leadColor = :leadColor');
    values[':leadColor'] = body.leadColor || null;
  }

  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: item.PK, SK: item.SK },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {}),
      ExpressionAttributeValues: values,
    })
  );

  return respond(200, { id: opportunityId, status: status || item.status, assignedTo: assignedTo !== undefined ? assignedTo : item.assignedTo, policyType: policyType !== undefined ? policyType : item.policyType, expectedPremium: expectedPremium !== undefined ? expectedPremium : item.expectedPremium, bucket: bucket !== undefined ? bucket : item.bucket });
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

    // GET /opportunities/{id}/followups — get follow-up protocol for a lead
    const followupsGetMatch = path.match(/^\/opportunities\/([^/]+)\/followups$/);
    if (method === 'GET' && followupsGetMatch) {
      const oppId = followupsGetMatch[1];
      const result = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': `LEAD_PROTOCOL#${oppId}` },
      }));
      const item = (result.Items || [])[0];
      return respond(200, { steps: item?.steps || [] });
    }

    // PUT /opportunities/{id}/followups/{stepIdx} — mark step complete/incomplete
    const followupStepMatch = path.match(/^\/opportunities\/([^/]+)\/followups\/(\d+)$/);
    if (method === 'PUT' && followupStepMatch) {
      const oppId = followupStepMatch[1];
      const stepIdx = parseInt(followupStepMatch[2]);
      const body = event.body ? JSON.parse(event.body) : {};

      // Get existing protocol
      const result = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': `LEAD_PROTOCOL#${oppId}` },
      }));
      const item = (result.Items || [])[0];
      if (!item) return respond(404, { error: { code: 'NOT_FOUND', message: 'Protocol not found for this lead' } });

      const steps = item.steps || [];
      if (stepIdx < 0 || stepIdx >= steps.length) return respond(400, { error: { code: 'INVALID_INDEX', message: 'Invalid step index' } });

      steps[stepIdx] = { ...steps[stepIdx], completed: body.completed !== false, completedAt: body.completed !== false ? new Date().toISOString() : null };

      await dynamo.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `LEAD_PROTOCOL#${oppId}` },
        UpdateExpression: 'SET steps = :s',
        ExpressionAttributeValues: { ':s': steps },
      }));

      return respond(200, { steps });
    }

    // PUT /opportunities/{id}/protocol — save/update full protocol for a lead
    const protocolMatch = path.match(/^\/opportunities\/([^/]+)\/protocol$/);
    if (method === 'PUT' && protocolMatch) {
      const oppId = protocolMatch[1];
      const body = event.body ? JSON.parse(event.body) : {};
      const steps = (body.steps || []).map((s, i) => ({
        idx: i,
        day: s.day || 0,
        type: s.type || 'call',
        task: s.task || '',
        completed: s.completed || false,
        completedAt: s.completedAt || null,
        scheduledDate: s.scheduledDate || null,
      }));

      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: `LEAD_PROTOCOL#${oppId}`,
          opportunityId: oppId,
          steps,
          updatedAt: new Date().toISOString(),
        },
      }));

      return respond(200, { steps });
    }

    // GET /opportunities/protocol-template — get user's saved default protocol
    if (method === 'GET' && path === '/opportunities/protocol-template') {
      const result = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'LEAD_PROTOCOL_TEMPLATE' },
      }));
      const item = (result.Items || [])[0];
      return respond(200, { steps: item?.steps || [] });
    }

    // PUT /opportunities/protocol-template — save user's default protocol template
    if (method === 'PUT' && path === '/opportunities/protocol-template') {
      const body = event.body ? JSON.parse(event.body) : {};
      const steps = (body.steps || []).map((s) => ({
        day: s.day || 0,
        type: s.type || 'call',
        task: s.task || '',
      }));

      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: 'LEAD_PROTOCOL_TEMPLATE',
          steps,
          updatedAt: new Date().toISOString(),
        },
      }));

      return respond(200, { steps });
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
