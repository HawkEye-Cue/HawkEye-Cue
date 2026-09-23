'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  GetCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');

const { DESTINATIONS, getDestination, assertConnectable } = require('./destinations');
const { encryptCredential, decryptCredential, sanitizeConnectionForRead } = require('./crypto');
const { canActivate, unmappedRequired, buildPayload, toCsv } = require('./mapping');
const { runPush, pushDecision, detectDuplicate } = require('./push-core');

const adapters = {
  webhook: require('./adapters/webhook'),
  hubspot: require('./adapters/hubspot'),
  zoho: require('./adapters/zoho'),
  gohighlevel: require('./adapters/gohighlevel'),
};

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME;

function respond(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function getUserId(event) {
  return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null;
}
function err(statusCode, code, message, extra) {
  return respond(statusCode, { error: { code, message, ...(extra || {}) } });
}

// ─── Connection storage helpers ─────────────────────────────────────────────

async function getConnection(userId, connectionId) {
  const res = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: `CRM_CONN#${connectionId}` },
  }));
  return res.Item || null;
}

async function listConnections(userId) {
  const res = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'CRM_CONN#' },
  }));
  return res.Items || [];
}

async function activeConnection(userId) {
  const conns = await listConnections(userId);
  return conns.find((c) => c.active) || null;
}

// Validate a connection's credential against its destination.
async function validateConnection(destinationType, credentialOrUrl) {
  const adapter = adapters[destinationType];
  // CSV has no remote validation.
  if (destinationType === 'csv') return { ok: true };
  if (!adapter) return { ok: false, reason: `No adapter for ${destinationType}` };
  try {
    return await adapter.validate(credentialOrUrl);
  } catch (e) {
    return { ok: false, reason: e && e.message ? e.message : 'Validation failed' };
  }
}

// ─── Route handlers ─────────────────────────────────────────────────────────

// GET /crm/destinations
function handleListDestinations() {
  return respond(200, { destinations: DESTINATIONS });
}

// GET /crm/connections — masked
async function handleListConnections(userId) {
  const items = await listConnections(userId);
  return respond(200, { connections: items.map((i) => sanitizeConnectionForRead(i)) });
}

// POST /crm/connections
async function handleCreateConnection(userId, body) {
  const { destinationType, connectionMethod, credential, webhookUrl, fieldMapping } = body || {};
  if (!destinationType) return err(400, 'INVALID_INPUT', 'destinationType is required');

  const gate = assertConnectable(destinationType);
  if (!gate.ok) return err(409, 'DESTINATION_UNAVAILABLE', gate.reason);

  const dest = getDestination(destinationType);
  const secret = destinationType === 'webhook' ? (webhookUrl || '') : (credential || '');

  // Validate before storing (Req 7.4).
  const validation = await validateConnection(destinationType, secret);
  const now = new Date().toISOString();
  const connectionId = randomUUID();

  let credentialCiphertext = null;
  if (destinationType !== 'webhook' && destinationType !== 'csv' && secret) {
    credentialCiphertext = await encryptCredential(secret);
  }

  const item = {
    PK: `USER#${userId}`,
    SK: `CRM_CONN#${connectionId}`,
    connectionId,
    destinationType,
    connectionMethod: connectionMethod || dest.method,
    availability: dest.availability,
    fieldMapping: fieldMapping || {},
    credentialCiphertext,
    webhookUrl: destinationType === 'webhook' ? (webhookUrl || null) : null,
    active: false, // becomes true only after activation
    lastValidatedAt: validation.ok ? now : null,
    createdAt: now,
  };
  await dynamo.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

  return respond(201, {
    connection: sanitizeConnectionForRead(item),
    valid: !!validation.ok,
    reason: validation.ok ? undefined : validation.reason,
  });
}

// PUT /crm/connections/{id}
async function handleUpdateConnection(userId, connectionId, body) {
  const existing = await getConnection(userId, connectionId);
  if (!existing) return err(404, 'NOT_FOUND', 'Connection not found');

  const updates = {};
  if (body.fieldMapping !== undefined) updates.fieldMapping = body.fieldMapping;
  if (body.webhookUrl !== undefined && existing.destinationType === 'webhook') updates.webhookUrl = body.webhookUrl;

  let revalidate = false;
  let secretForValidation = existing.destinationType === 'webhook'
    ? (body.webhookUrl !== undefined ? body.webhookUrl : existing.webhookUrl)
    : null;

  if (body.credential !== undefined && existing.destinationType !== 'webhook' && existing.destinationType !== 'csv') {
    updates.credentialCiphertext = body.credential ? await encryptCredential(body.credential) : null;
    secretForValidation = body.credential;
    revalidate = true;
  }
  if (body.webhookUrl !== undefined && existing.destinationType === 'webhook') revalidate = true;

  const now = new Date().toISOString();
  if (revalidate) {
    const v = await validateConnection(existing.destinationType, secretForValidation);
    updates.lastValidatedAt = v.ok ? now : null;
    if (!v.ok) updates.active = false; // invalid creds deactivate
  }

  const setParts = Object.keys(updates).map((k, i) => `#k${i} = :v${i}`);
  const names = {}; const values = {};
  Object.keys(updates).forEach((k, i) => { names[`#k${i}`] = k; values[`:v${i}`] = updates[k]; });

  if (setParts.length > 0) {
    await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `CRM_CONN#${connectionId}` },
      UpdateExpression: `SET ${setParts.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));
  }
  const updated = await getConnection(userId, connectionId);
  return respond(200, { connection: sanitizeConnectionForRead(updated) });
}

// POST /crm/connections/{id}/activate
async function handleActivateConnection(userId, connectionId) {
  const conn = await getConnection(userId, connectionId);
  if (!conn) return err(404, 'NOT_FOUND', 'Connection not found');

  const dest = getDestination(conn.destinationType);
  const missing = unmappedRequired(conn.fieldMapping || {}, dest.requiredFields || []);
  if (missing.length > 0) {
    return err(409, 'MAPPING_INCOMPLETE', 'Required fields are not mapped', { unmappedRequired: missing });
  }
  if (!canActivate(conn.fieldMapping || {}, dest.requiredFields || [])) {
    return err(409, 'MAPPING_INCOMPLETE', 'Required fields are not mapped');
  }

  // Deactivate any other active connection (one active at a time) then activate this.
  const all = await listConnections(userId);
  for (const c of all) {
    if (c.active && c.connectionId !== connectionId) {
      await dynamo.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `CRM_CONN#${c.connectionId}` },
        UpdateExpression: 'SET active = :f',
        ExpressionAttributeValues: { ':f': false },
      }));
    }
  }
  await dynamo.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: `CRM_CONN#${connectionId}` },
    UpdateExpression: 'SET active = :t',
    ExpressionAttributeValues: { ':t': true },
  }));
  const updated = await getConnection(userId, connectionId);
  return respond(200, { connection: sanitizeConnectionForRead(updated) });
}

// DELETE /crm/connections/{id}
async function handleDeleteConnection(userId, connectionId) {
  const conn = await getConnection(userId, connectionId);
  if (!conn) return err(404, 'NOT_FOUND', 'Connection not found');

  await dynamo.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: `CRM_CONN#${connectionId}` },
  }));

  // Mark leads pushed through this connection as orphaned (Req 7.7).
  const leads = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: 'pushedConnectionId = :cid',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'OPP#', ':cid': connectionId },
  }));
  for (const l of (leads.Items || [])) {
    await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: l.PK, SK: l.SK },
      UpdateExpression: 'SET crmRecordId = :n, pushConnectionRemoved = :t',
      ExpressionAttributeValues: { ':n': null, ':t': true },
    }));
  }
  return respond(200, { deleted: true });
}

// Fetch a lead (opportunity) by id.
async function getLead(userId, opportunityId) {
  const res = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: 'opportunityId = :oid',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'OPP#', ':oid': opportunityId },
  }));
  return (res.Items || [])[0] || null;
}

async function setLeadPushStatus(userId, lead, patch) {
  const setParts = Object.keys(patch).map((k, i) => `#k${i} = :v${i}`);
  const names = {}; const values = {};
  Object.keys(patch).forEach((k, i) => { names[`#k${i}`] = k; values[`:v${i}`] = patch[k]; });
  await dynamo.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: lead.PK, SK: lead.SK },
    UpdateExpression: `SET ${setParts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

// POST /crm/push  { opportunityId, connectionId?, confirmRepush? }
async function handlePush(userId, body) {
  const { opportunityId, confirmRepush } = body || {};
  if (!opportunityId) return err(400, 'INVALID_INPUT', 'opportunityId is required');

  let connectionId = body.connectionId;
  let conn;
  if (connectionId) {
    conn = await getConnection(userId, connectionId);
  } else {
    conn = await activeConnection(userId);
    connectionId = conn ? conn.connectionId : null;
  }
  if (!conn || !conn.active) {
    return err(409, 'NO_ACTIVE_CONNECTION', 'No active CRM connection. Configure one first.');
  }

  const lead = await getLead(userId, opportunityId);
  if (!lead) return err(404, 'NOT_FOUND', 'Lead not found');

  const dest = getDestination(conn.destinationType);
  const supportsUpsert = !!(dest && dest.supportsUpsert);

  // Dedup: decide create vs upsert vs confirm (Req 10.2–10.4).
  const decision = pushDecision({ crmRecordId: lead.crmRecordId }, supportsUpsert);
  if (decision === 'confirm_duplicate' && !confirmRepush) {
    return err(409, 'NEEDS_CONFIRMATION', 'Re-pushing may create a duplicate in your CRM.', {
      needsConfirmation: true, reason: 'repush_may_duplicate',
    });
  }

  // Contact-match duplicate warning across already-pushed leads (Req 10.5).
  if (decision === 'create' && !confirmRepush && (lead.contactEmail || lead.contactPhone)) {
    const pushedRes = await dynamo.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      FilterExpression: 'pushedConnectionId = :cid',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'OPP#', ':cid': connectionId },
    }));
    const match = detectDuplicate(
      { contactEmail: lead.contactEmail, contactPhone: lead.contactPhone },
      (pushedRes.Items || []).filter((o) => o.opportunityId !== opportunityId),
    );
    if (match) {
      return err(409, 'NEEDS_CONFIRMATION', 'Another lead with the same contact was already pushed.', {
        needsConfirmation: true,
        reason: 'contact_match',
        matchingLead: { id: match.opportunityId, name: match.sourceAuthor || 'Unknown' },
      });
    }
  }

  // Begin: mark pending (Req 11.2).
  await setLeadPushStatus(userId, lead, { pushStatus: 'pending', lastPushError: null });

  // Build payload from the active mapping (Req 8.5).
  const payload = buildPayload(lead, conn.fieldMapping || {});

  // Resolve the credential.
  let credential = null;
  if (conn.destinationType === 'webhook') credential = conn.webhookUrl;
  else if (conn.destinationType === 'csv') credential = null;
  else if (conn.credentialCiphertext) credential = await decryptCredential(conn.credentialCiphertext);

  const adapter = adapters[conn.destinationType];
  if (!adapter) {
    await setLeadPushStatus(userId, lead, { pushStatus: 'failed', lastPushError: 'Unsupported destination' });
    return respond(200, { pushStatus: 'failed', reason: 'Unsupported destination' });
  }

  try {
    const result = await runPush(adapter, payload, credential, {
      existingRecordId: decision === 'upsert' ? lead.crmRecordId : null,
    });
    const now = new Date().toISOString();
    await setLeadPushStatus(userId, lead, {
      pushStatus: 'pushed',
      crmRecordId: result.recordId || lead.crmRecordId || null,
      pushedConnectionId: connectionId,
      pushedAt: now,
      lastPushError: null,
      pushConnectionRemoved: false,
    });
    return respond(200, { pushStatus: 'pushed', crmRecordId: result.recordId || null });
  } catch (e) {
    const reason = e && e.message ? e.message : 'Push failed';
    await setLeadPushStatus(userId, lead, { pushStatus: 'failed', lastPushError: reason });
    return respond(200, { pushStatus: 'failed', reason });
  }
}

// POST /crm/export/csv  { opportunityIds: [], connectionId? }
async function handleExportCsv(userId, body) {
  const ids = Array.isArray(body?.opportunityIds) ? body.opportunityIds : [];
  if (ids.length === 0) return err(400, 'NO_LEADS_SELECTED', 'Select at least one lead to export.');

  // Use the active/CSV connection's mapping if present, else a sensible default mapping.
  let mapping = null;
  if (body.connectionId) {
    const conn = await getConnection(userId, body.connectionId);
    if (conn) mapping = conn.fieldMapping;
  }
  if (!mapping || Object.keys(mapping).length === 0) {
    mapping = {
      name: 'sourceAuthor',
      email: 'contactEmail',
      platform: 'sourcePlatform',
      source_url: 'sourceUrl',
      lead_source: 'leadSource',
      consent_basis: 'consentBasis',
      flight_score: 'flightScore',
      drafted_response: 'suggestedResponse',
      notes: 'leadNotes',
      status: 'status',
    };
  }

  const leads = [];
  for (const id of ids) {
    const lead = await getLead(userId, id);
    if (lead) leads.push(lead);
  }

  let csv;
  try {
    csv = toCsv(leads, mapping);
  } catch (e) {
    return err(500, 'EXPORT_FAILED', 'Could not generate the CSV. Try again.');
  }
  const filename = `hawkeye-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  return respond(200, { csv, filename });
}

// ─── Handler ─────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);
    if (!userId) return err(401, 'UNAUTHORIZED', 'Missing user identity');

    if (method === 'GET' && path === '/crm/destinations') return handleListDestinations();
    if (method === 'GET' && path === '/crm/connections') return handleListConnections(userId);
    if (method === 'POST' && path === '/crm/connections') {
      return handleCreateConnection(userId, event.body ? JSON.parse(event.body) : {});
    }

    const connMatch = path.match(/^\/crm\/connections\/([^/]+)$/);
    if (connMatch) {
      const id = connMatch[1];
      if (method === 'PUT') return handleUpdateConnection(userId, id, event.body ? JSON.parse(event.body) : {});
      if (method === 'DELETE') return handleDeleteConnection(userId, id);
    }

    const activateMatch = path.match(/^\/crm\/connections\/([^/]+)\/activate$/);
    if (method === 'POST' && activateMatch) return handleActivateConnection(userId, activateMatch[1]);

    if (method === 'POST' && path === '/crm/push') {
      return handlePush(userId, event.body ? JSON.parse(event.body) : {});
    }
    if (method === 'POST' && path === '/crm/export/csv') {
      return handleExportCsv(userId, event.body ? JSON.parse(event.body) : {});
    }

    return err(404, 'NOT_FOUND', `No route for ${method} ${path}`);
  } catch (e) {
    console.error('crm-handler error:', e);
    return err(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
