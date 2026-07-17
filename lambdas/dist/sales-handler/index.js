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
    soldBy: item.soldBy || '',
    bundleItems: item.bundleItems || undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));

  return ok({ deals });
}

// POST /sales/deals
async function handleCreateDeal(userId, body) {
  const { name, value, stage, policyType, folio, contactName, contactEmail, contactPhone, notes, trade, leadSource, leadSourceNote, soldBy, bundleItems } = body || {};
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
      soldBy: soldBy || '',
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

    // ─── Linked Accounts ────────────────────────────────────────────────────

    // GET /sales/linked — get all linked partners + incoming invites
    if (method === 'GET' && path === '/sales/linked') {
      // Get links stored under this user's PK
      const result = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'LINK#' },
      }));
      const links = (result.Items || []).map((item) => ({
        id: item.linkId,
        partnerEmail: item.partnerEmail,
        partnerUserId: item.partnerUserId,
        partnerName: item.partnerName || item.partnerEmail,
        status: item.linkStatus,
        createdAt: item.createdAt,
        direction: 'outgoing',
      }));

      // Also check for incoming pending invites (stored under other users, indexed by this user's email)
      const profileResult = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'PROFILE' },
      }));
      const userEmail = (profileResult.Items || [])[0]?.email || '';

      if (userEmail) {
        const incomingResult = await dynamo.send(new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: { ':pk': `LINKINVITE#${userEmail.toLowerCase()}` },
        }));
        for (const item of (incomingResult.Items || [])) {
          if (item.linkStatus === 'pending') {
            const inviterUserId = item.PK.replace('USER#', '');
            // Get inviter's email
            const inviterResult = await dynamo.send(new QueryCommand({
              TableName: TABLE_NAME,
              KeyConditionExpression: 'PK = :pk AND SK = :sk',
              ExpressionAttributeValues: { ':pk': item.PK, ':sk': 'PROFILE' },
            }));
            const inviterEmail = (inviterResult.Items || [])[0]?.email || 'Unknown';
            links.push({
              id: item.linkId,
              partnerEmail: inviterEmail,
              partnerUserId: inviterUserId,
              partnerName: inviterEmail,
              status: 'incoming',
              createdAt: item.createdAt,
              direction: 'incoming',
            });
          }
        }
      }

      return ok({ links });
    }

    // POST /sales/linked/invite — send a link invite
    if (method === 'POST' && path === '/sales/linked/invite') {
      const body = event.body ? JSON.parse(event.body) : {};
      const { email: inviteEmail } = body;
      if (!inviteEmail || typeof inviteEmail !== 'string') {
        return err(400, 'INVALID_INPUT', 'email is required');
      }

      // Get inviter's email from profile
      const profileResult = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'PROFILE' },
      }));
      const profile = (profileResult.Items || [])[0];
      const inviterEmail = profile?.email || 'Unknown';

      const linkId = require('crypto').randomUUID();
      const now = new Date().toISOString();

      // Save pending link on inviter's side
      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: `LINK#${linkId}`,
          linkId,
          partnerEmail: inviteEmail.trim().toLowerCase(),
          partnerUserId: null,
          partnerName: inviteEmail.trim().toLowerCase(),
          linkStatus: 'pending',
          createdAt: now,
          GSI1PK: `LINKINVITE#${inviteEmail.trim().toLowerCase()}`,
          GSI1SK: `FROM#${userId}`,
        },
      }));

      // Send invite email
      try {
        await sendEmail(inviteEmail.trim(), '🦅 You\'ve been invited to link accounts on HawkEye-Cue!', `${inviterEmail} wants to link their Sales Tracker with yours on HawkEye-Cue!\n\nWhen linked, you'll both see each other's deals and get Sale-Cue notifications when either of you closes a deal.\n\nLog in at https://hawkeyecue.com/sales to accept.\n\n— HawkEye-Cue`);
      } catch (e) {
        console.error('Failed to send link invite email:', e.message);
      }

      return ok({ linkId, email: inviteEmail, status: 'pending' });
    }

    // POST /sales/linked/accept — accept a pending link invite
    if (method === 'POST' && path === '/sales/linked/accept') {
      const body = event.body ? JSON.parse(event.body) : {};
      const { linkId: acceptLinkId } = body;

      // Get current user's email
      const myProfileResult = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'PROFILE' },
      }));
      const myProfile = (myProfileResult.Items || [])[0];
      const myEmail = (myProfile?.email || '').toLowerCase();

      console.log(`Accept invite: user=${userId}, email=${myEmail}, linkId=${acceptLinkId}`);

      if (!myEmail) return err(400, 'NO_EMAIL', 'Could not determine your email address');
      if (!acceptLinkId) return err(400, 'NO_LINK_ID', 'linkId is required');

      // Find pending invites for this user's email via GSI1
      const invitesResult = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': `LINKINVITE#${myEmail}` },
      }));

      console.log(`Found ${(invitesResult.Items || []).length} invites for ${myEmail}`, (invitesResult.Items || []).map((i) => i.linkId));

      let invite = (invitesResult.Items || []).find((i) => i.linkId === acceptLinkId);

      // Fallback: if not found by linkId, accept the first pending invite for this email
      if (!invite && (invitesResult.Items || []).length > 0) {
        invite = (invitesResult.Items || []).find((i) => i.linkStatus === 'pending');
        console.log('Fallback: accepting first pending invite');
      }

      if (!invite) return err(404, 'NOT_FOUND', `Invite not found for ${myEmail} with linkId ${acceptLinkId}`);

      const inviterUserId = invite.PK.replace('USER#', '');
      const now = new Date().toISOString();

      // Update inviter's link to active
      await dynamo.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: invite.PK, SK: invite.SK },
        UpdateExpression: 'SET linkStatus = :s, partnerUserId = :uid, partnerName = :name',
        ExpressionAttributeValues: { ':s': 'active', ':uid': userId, ':name': myEmail },
      }));

      // Create reciprocal link on accepter's side
      const reciprocalId = require('crypto').randomUUID();
      const inviterProfile = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: { ':pk': `USER#${inviterUserId}`, ':sk': 'PROFILE' },
      }));
      const inviterEmail = (inviterProfile.Items || [])[0]?.email || 'Unknown';

      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: `LINK#${reciprocalId}`,
          linkId: reciprocalId,
          partnerEmail: inviterEmail,
          partnerUserId: inviterUserId,
          partnerName: inviterEmail,
          linkStatus: 'active',
          createdAt: now,
        },
      }));

      return ok({ accepted: true });
    }

    // DELETE /sales/linked/{id} — remove a link (mutual — removes from both sides)
    const linkedDeleteMatch = path.match(/^\/sales\/linked\/([^/]+)$/);
    if (method === 'DELETE' && linkedDeleteMatch) {
      const linkId = linkedDeleteMatch[1];
      // Find and delete the link on this user's side
      const linkResult = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'linkId = :lid',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'LINK#', ':lid': linkId },
      }));
      const linkItem = (linkResult.Items || [])[0];
      if (linkItem) {
        await dynamo.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: linkItem.PK, SK: linkItem.SK } }));

        // Also remove the reciprocal link on the partner's side
        if (linkItem.partnerUserId) {
          const partnerLinksResult = await dynamo.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            FilterExpression: 'partnerUserId = :uid',
            ExpressionAttributeValues: { ':pk': `USER#${linkItem.partnerUserId}`, ':sk': 'LINK#', ':uid': userId },
          }));
          for (const partnerLink of (partnerLinksResult.Items || [])) {
            await dynamo.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: partnerLink.PK, SK: partnerLink.SK } }));
          }
        }
      }
      return ok({ deleted: true });
    }

    // GET /sales/linked/deals — get deals from all linked partners
    if (method === 'GET' && path === '/sales/linked/deals') {
      // Get active links
      const linksResult = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'linkStatus = :s',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'LINK#', ':s': 'active' },
      }));

      const allDeals = [];
      for (const link of (linksResult.Items || [])) {
        if (!link.partnerUserId) continue;
        const dealsResult = await dynamo.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': `USER#${link.partnerUserId}`, ':sk': 'DEAL#' },
        }));
        for (const deal of (dealsResult.Items || [])) {
          allDeals.push({
            id: deal.dealId,
            name: deal.dealName,
            value: deal.dealValue || 0,
            stage: deal.stage,
            policyType: deal.policyType || '',
            soldBy: deal.soldBy || '',
            createdAt: deal.createdAt,
            partnerName: link.partnerName || link.partnerEmail,
          });
        }
      }

      return ok({ deals: allDeals });
    }

    // POST /sales/notify — send Sale-Cue email to linked partners
    if (method === 'POST' && path === '/sales/notify') {
      const body = event.body ? JSON.parse(event.body) : {};
      const { emails = [], dealName, dealValue, policyType, folio, soldBy } = body;

      try {
        // Get linked partners' emails automatically
        const linksResult = await dynamo.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          FilterExpression: 'linkStatus = :s',
          ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'LINK#', ':s': 'active' },
        }));
        const linkedEmails = (linksResult.Items || []).map((l) => l.partnerEmail).filter(Boolean);
        const allEmails = [...new Set([...emails, ...linkedEmails])]; // deduplicate

        if (allEmails.length === 0) {
          return ok({ sent: 0, message: 'No linked partners to notify' });
        }

        for (const email of allEmails.slice(0, 20)) {
          const soldByLine = soldBy ? `\nSold By: ${soldBy}` : '';
          await sendEmail(email, `🦅 Sale-Cue! ${dealName} — WON!`, `🎉 A deal was just closed!\n\nDeal: ${dealName}\nValue: $${dealValue || 0}\nPolicy Type: ${policyType || 'N/A'}${soldByLine}\nFolio: ${folio || 'N/A'}\n\nGreat work team! 🦅\n\n— HawkEye-Cue`);
        }
        return ok({ sent: allEmails.length });
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
