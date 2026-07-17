'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { randomUUID } = require('crypto');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});
const TABLE_NAME = process.env.TABLE_NAME;
const FROM_EMAIL = 'HawkEye-Cue <notifications@hawkeyecue.com>';

// ─── Resend Email Helper ──────────────────────────────────────────────────────
let resendApiKey = null;
async function getResendKey() {
  if (resendApiKey) return resendApiKey;
  const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: 'SocialLeadGen/Resend' }));
  const secret = JSON.parse(result.SecretString);
  resendApiKey = secret.RESEND_API_KEY;
  return resendApiKey;
}

async function sendEmail(to, subject, text) {
  const apiKey = await getResendKey();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: Array.isArray(to) ? to : [to], subject, text }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend error (${response.status}): ${err}`);
  }
  return response.json();
}

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function err(status, code, message) { return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: { code, message } }) }; }
function getUserId(event) { return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null; }

const STAGES = ['prospect', 'contacted', 'quoted', 'closing', 'won', 'lost'];

// GET /sales/deals
async function handleGetDeals(userId) {
  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'DEAL#' },
    ScanIndexForward: false,
  }));

  const deals = (result.Items || []).map((item) => ({
    id: item.dealId,
    name: item.dealName,
    value: item.dealValue || 0,
    stage: item.stage,
    policyType: item.policyType || '',
    folio: item.folio || '',
    contactName: item.contactName || '',
    contactEmail: item.contactEmail || '',
    contactPhone: item.contactPhone || '',
    notes: item.notes || '',
    trade: item.trade || '',
    leadSource: item.leadSource || '',
    leadSourceNote: item.leadSourceNote || '',
    bundleItems: item.bundleItems || undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));

  return ok({ deals });
}

// POST /sales/deals
async function handleCreateDeal(userId, body) {
  const { name, value, stage, policyType, folio, contactName, contactEmail, contactPhone, notes, trade, leadSource, leadSourceNote, bundleItems } = body || {};
  if (!name || !name.trim()) return err(400, 'INVALID_INPUT', 'Deal name is required');

  const dealId = randomUUID();
  const now = new Date().toISOString();

  // For bundles, auto-sum the value from bundle items
  const dealValue = (policyType === 'Bundle' && Array.isArray(bundleItems))
    ? bundleItems.reduce((sum, i) => sum + (parseFloat(i.value) || 0), 0)
    : (value || 0);

  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${userId}`,
      SK: `DEAL#${now}#${dealId}`,
      dealId,
      dealName: name.trim(),
      dealValue,
      stage: STAGES.includes(stage) ? stage : 'prospect',
      policyType: policyType || '',
      folio: folio || new Date().toISOString().slice(0, 7),
      contactName: contactName || '',
      contactEmail: contactEmail || '',
      contactPhone: contactPhone || '',
      notes: notes || '',
      trade: trade || '',
      leadSource: leadSource || '',
      leadSourceNote: leadSourceNote || '',
      bundleItems: (policyType === 'Bundle' && Array.isArray(bundleItems)) ? bundleItems.filter((i) => i.type && i.value) : undefined,
      createdAt: now,
      updatedAt: now,
    },
  }));

  return ok({ id: dealId, name: name.trim(), value: dealValue, stage: stage || 'prospect', policyType: policyType || '', leadSource: leadSource || '', leadSourceNote: leadSourceNote || '', bundleItems: bundleItems || undefined, createdAt: now });
}

// PUT /sales/deals/{id}
async function handleUpdateDeal(userId, dealId, body) {
  const queryResult = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: 'dealId = :did',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'DEAL#', ':did': dealId },
  }));

  const item = (queryResult.Items || [])[0];
  if (!item) return err(404, 'NOT_FOUND', 'Deal not found');

  const updates = {};
  if (body.name) updates.dealName = body.name;
  if (body.value !== undefined) updates.dealValue = body.value;
  if (body.stage && STAGES.includes(body.stage)) updates.stage = body.stage;
  if (body.policyType !== undefined) updates.policyType = body.policyType;
  if (body.folio !== undefined) updates.folio = body.folio;
  if (body.contactName !== undefined) updates.contactName = body.contactName;
  if (body.contactEmail !== undefined) updates.contactEmail = body.contactEmail;
  if (body.contactPhone !== undefined) updates.contactPhone = body.contactPhone;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.leadSource !== undefined) updates.leadSource = body.leadSource;
  if (body.leadSourceNote !== undefined) updates.leadSourceNote = body.leadSourceNote;
  updates.updatedAt = new Date().toISOString();

  const expressions = Object.keys(updates).map((k) => `#${k} = :${k}`);
  const names = {}; const values = {};
  for (const [k, v] of Object.entries(updates)) { names[`#${k}`] = k; values[`:${k}`] = v; }

  await dynamo.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: item.PK, SK: item.SK },
    UpdateExpression: `SET ${expressions.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));

  return ok({ id: dealId, ...updates });
}

// DELETE /sales/deals/{id}
async function handleDeleteDeal(userId, dealId) {
  const queryResult = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: 'dealId = :did',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'DEAL#', ':did': dealId },
  }));

  const item = (queryResult.Items || [])[0];
  if (!item) return err(404, 'NOT_FOUND', 'Deal not found');

  await dynamo.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: item.PK, SK: item.SK } }));
  return ok({ deleted: true });
}

// GET /sales/stats
async function handleGetStats(userId) {
  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'DEAL#' },
  }));

  const items = result.Items || [];
  const stats = {
    total: items.length,
    totalValue: items.reduce((sum, i) => sum + (i.dealValue || 0), 0),
    won: items.filter((i) => i.stage === 'won').length,
    wonValue: items.filter((i) => i.stage === 'won').reduce((sum, i) => sum + (i.dealValue || 0), 0),
    byStage: {},
  };
  for (const s of STAGES) {
    stats.byStage[s] = items.filter((i) => i.stage === s).length;
  }
  return ok({ stats });
}

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);
    if (!userId) return err(401, 'UNAUTHORIZED', 'Missing user identity');

    if (method === 'GET' && path === '/sales/deals') return handleGetDeals(userId);
    if (method === 'POST' && path === '/sales/deals') {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleCreateDeal(userId, body);
    }
    if (method === 'GET' && path === '/sales/stats') return handleGetStats(userId);

    // GET /sales/team-emails
    if (method === 'GET' && path === '/sales/team-emails') {
      const result = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'TEAM_EMAILS' },
      }));
      const item = (result.Items || [])[0];
      return ok({ emails: item?.emails || [] });
    }

    // PUT /sales/team-emails
    if (method === 'PUT' && path === '/sales/team-emails') {
      const body = event.body ? JSON.parse(event.body) : {};
      const emails = (body.emails || []).filter(Boolean);
      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { PK: `USER#${userId}`, SK: 'TEAM_EMAILS', emails },
      }));
      return ok({ emails });
    }

    // GET /sales/folio-config — get user's folio date range
    if (method === 'GET' && path === '/sales/folio-config') {
      const result = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'FOLIO_CONFIG' },
      }));
      const item = (result.Items || [])[0];
      return ok({ folioStart: item?.folioStart || '', folioEnd: item?.folioEnd || '' });
    }

    // PUT /sales/folio-config — save user's folio date range
    if (method === 'PUT' && path === '/sales/folio-config') {
      const body = event.body ? JSON.parse(event.body) : {};
      const { folioStart, folioEnd } = body;
      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: 'FOLIO_CONFIG',
          folioStart: folioStart || '',
          folioEnd: folioEnd || '',
          updatedAt: new Date().toISOString(),
        },
      }));
      return ok({ folioStart, folioEnd });
    }

    // POST /sales/notify — send Sale-Cue email to team
    if (method === 'POST' && path === '/sales/notify') {
      const body = event.body ? JSON.parse(event.body) : {};
      const { emails, dealName, dealValue, policyType, folio, soldBy } = body;
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return err(400, 'INVALID_INPUT', 'emails array is required');
      }
      try {
        for (const email of emails.slice(0, 10)) { // max 10 emails
          await sendEmail(email, `🦅 Sale-Cue! ${dealName} — WON!`, `🎉 A deal was just closed!\n\nDeal: ${dealName}\nValue: $${dealValue || 0}\nPolicy Type: ${policyType || 'N/A'}\nSold By: ${soldBy || 'N/A'}\nFolio: ${folio || 'N/A'}\n\nGreat work team! 🦅\n\n— HawkEye-Cue`);
        }
        return ok({ sent: emails.length });
      } catch (e) {
        console.error('Failed to send Sale-Cue emails:', e);
        return err(500, 'EMAIL_FAILED', 'Failed to send notification emails');
      }
    }

    const idMatch = path.match(/^\/sales\/deals\/([^/]+)$/);
    if (method === 'PUT' && idMatch) {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleUpdateDeal(userId, idMatch[1], body);
    }
    if (method === 'DELETE' && idMatch) return handleDeleteDeal(userId, idMatch[1]);

    return err(404, 'NOT_FOUND', `No route for ${method} ${path}`);
  } catch (e) {
    console.error('sales-handler error:', e);
    return err(500, 'INTERNAL_ERROR', e.message || 'An unexpected error occurred');
  }
};
