'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { randomUUID } = require('crypto');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});
const TABLE_NAME = process.env.TABLE_NAME;
const FROM_EMAIL = 'HawkEye-Cue <notifications@hawkeyecue.com>';

// Resend email helper
let resendApiKey = null;
async function getResendKey() {
  if (resendApiKey) return resendApiKey;
  const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: 'SocialLeadGen/Resend' }));
  const secret = JSON.parse(result.SecretString);
  resendApiKey = secret.RESEND_API_KEY;
  return resendApiKey;
}

async function sendEmail(to, subject, html) {
  const apiKey = await getResendKey();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: Array.isArray(to) ? to : [to], subject, html }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend error (${response.status}): ${err}`);
  }
  return response.json();
}

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
    inviteStatus: item.inviteStatus || null,
    inviteEmail: item.inviteEmail || null,
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

// POST /calendar/events/{id}/invite — send meeting invite email
async function handleSendInvite(userId, eventId, body) {
  const { email, meetingTitle, meetingDate, location, zoomLink, notes } = body || {};
  if (!email) return err(400, 'INVALID_INPUT', 'email is required');

  // Get the user's email for display
  const profileResult = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK = :sk',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'PROFILE' },
  }));
  const profile = (profileResult.Items || [])[0];
  const senderEmail = profile?.email || 'A HawkEye-Cue user';

  // Generate confirm token
  const confirmToken = randomUUID();

  // Store invite in DynamoDB
  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `INVITE#${confirmToken}`,
      SK: 'MEETING',
      userId,
      eventId,
      recipientEmail: email,
      meetingTitle: meetingTitle || 'Meeting',
      meetingDate,
      location: location || null,
      zoomLink: zoomLink || null,
      notes: notes || null,
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  }));

  // Update event with invite status
  const queryResult = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: 'eventId = :eid',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'CAL#', ':eid': eventId },
  }));
  const item = (queryResult.Items || [])[0];
  if (item) {
    await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: item.PK, SK: item.SK },
      UpdateExpression: 'SET inviteStatus = :s, inviteEmail = :e, inviteToken = :t',
      ExpressionAttributeValues: { ':s': 'pending', ':e': email, ':t': confirmToken },
    }));
  }

  // Build confirmation URL
  const confirmUrl = `https://hawkeyecue.com/confirm-meeting?token=${confirmToken}`;

  // Send email
  const dateFormatted = new Date(meetingDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1e293b;">🤝 Meeting Invitation</h2>
      <p style="color: #475569;"><strong>${senderEmail}</strong> has invited you to a meeting.</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 16px 0;">
        <p style="margin: 4px 0; color: #1e293b;"><strong>📋 ${meetingTitle || 'Meeting'}</strong></p>
        <p style="margin: 4px 0; color: #475569;">📅 ${dateFormatted}</p>
        ${location ? `<p style="margin: 4px 0; color: #475569;">📍 ${location}</p>` : ''}
        ${zoomLink ? `<p style="margin: 4px 0;"><a href="${zoomLink}" style="color: #2563eb;">🔗 Join Zoom Meeting</a></p>` : ''}
        ${notes ? `<p style="margin: 8px 0; color: #64748b; font-size: 14px;">📝 ${notes}</p>` : ''}
      </div>
      <a href="${confirmUrl}" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 12px;">✓ Confirm Meeting</a>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 16px;">Powered by HawkEye-Cue</p>
    </div>
  `;

  await sendEmail(email, `🤝 Meeting Invite: ${meetingTitle || 'Meeting'} — ${dateFormatted}`, html);

  return ok({ sent: true, inviteStatus: 'pending' });
}

// GET /calendar/invite/confirm?token=xxx — public endpoint to confirm meeting
async function handleConfirmInvite(token) {
  if (!token) return err(400, 'INVALID_INPUT', 'token is required');

  // Look up invite
  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK = :sk',
    ExpressionAttributeValues: { ':pk': `INVITE#${token}`, ':sk': 'MEETING' },
  }));

  const invite = (result.Items || [])[0];
  if (!invite) return err(404, 'NOT_FOUND', 'Invite not found or already confirmed');

  // Update invite status
  await dynamo.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `INVITE#${token}`, SK: 'MEETING' },
    UpdateExpression: 'SET #status = :s, confirmedAt = :t',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':s': 'confirmed', ':t': new Date().toISOString() },
  }));

  // Update the calendar event (if eventId exists)
  if (invite.eventId) {
    try {
      const eventQuery = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'eventId = :eid',
        ExpressionAttributeValues: { ':pk': `USER#${invite.userId}`, ':sk': 'CAL#', ':eid': invite.eventId },
      }));

      const calEvent = (eventQuery.Items || [])[0];
      if (calEvent) {
        await dynamo.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: calEvent.PK, SK: calEvent.SK },
          UpdateExpression: 'SET inviteStatus = :s',
          ExpressionAttributeValues: { ':s': 'confirmed' },
        }));
      }
    } catch { /* skip if event lookup fails */ }
  }

  return ok({ confirmed: true, meetingTitle: invite.meetingTitle, meetingDate: invite.meetingDate });
}

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;

    // Public endpoint — no auth required
    if (method === 'GET' && path === '/calendar/invite/confirm') {
      const token = event.queryStringParameters?.token;
      return handleConfirmInvite(token);
    }

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
    if (method === 'POST' && path.match(/^\/calendar\/events\/[^/]+\/invite$/)) {
      const eventId = path.split('/calendar/events/')[1].split('/invite')[0];
      const body = event.body ? JSON.parse(event.body) : {};
      console.log(`[Invite] eventId=${eventId}, email=${body.email}`);
      return handleSendInvite(userId, eventId, body);
    }
    if (method === 'POST' && path === '/calendar/invite') {
      let body = {};
      try {
        const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body;
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch { body = {}; }
      const { email, meetingTitle, meetingDate, location, zoomLink, notes, eventId } = body;
      if (!email) return err(400, 'INVALID_INPUT', 'email is required');

      // Get sender info
      const profileResult = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'PROFILE' },
      }));
      const senderEmail = (profileResult.Items || [])[0]?.email || 'A HawkEye-Cue user';

      const confirmToken = randomUUID();
      const confirmUrl = `https://hawkeyecue.com/confirm-meeting?token=${confirmToken}`;
      const dateFormatted = meetingDate ? new Date(meetingDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD';

      const html = `<div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:20px;"><h2 style="color:#1e293b;">🤝 Meeting Invitation</h2><p style="color:#475569;"><strong>${senderEmail}</strong> has invited you to a meeting.</p><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:16px 0;"><p style="margin:4px 0;color:#1e293b;"><strong>📋 ${meetingTitle || 'Meeting'}</strong></p><p style="margin:4px 0;color:#475569;">📅 ${dateFormatted}</p>${location ? `<p style="margin:4px 0;color:#475569;">📍 ${location}</p>` : ''}${zoomLink ? `<p style="margin:4px 0;"><a href="${zoomLink}" style="color:#2563eb;">🔗 Join Video Call</a></p>` : ''}${notes ? `<p style="margin:8px 0;color:#64748b;font-size:14px;">📝 ${notes}</p>` : ''}</div><a href="${confirmUrl}" style="display:inline-block;background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:12px;">✓ Confirm Meeting</a><p style="color:#94a3b8;font-size:12px;margin-top:16px;">Powered by HawkEye-Cue</p></div>`;

      await sendEmail(email, `🤝 Meeting Invite: ${meetingTitle || 'Meeting'} — ${dateFormatted}`, html);

      // Store invite token for confirmation (include eventId for status tracking)
      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { PK: `INVITE#${confirmToken}`, SK: 'MEETING', userId, eventId: eventId || null, recipientEmail: email, meetingTitle: meetingTitle || 'Meeting', meetingDate, status: 'pending', createdAt: new Date().toISOString() },
      }));

      // Update the calendar event with pending status
      if (eventId) {
        try {
          const evtQuery = await dynamo.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            FilterExpression: 'eventId = :eid',
            ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'CAL#', ':eid': eventId },
          }));
          const evt = (evtQuery.Items || [])[0];
          if (evt) {
            await dynamo.send(new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { PK: evt.PK, SK: evt.SK },
              UpdateExpression: 'SET inviteStatus = :s, inviteEmail = :e',
              ExpressionAttributeValues: { ':s': 'pending', ':e': email },
            }));
          }
        } catch { /* skip */ }
      }

      return ok({ sent: true, inviteStatus: 'pending' });
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

    // POST /calendar/engagement — log engagement from a group
    if (method === 'POST' && path === '/calendar/engagement') {
      let body = {};
      try {
        const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body;
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch { body = {}; }
      const { groupName, engagementType, note, date } = body;
      if (!groupName || !engagementType) return err(400, 'INVALID_INPUT', 'groupName and engagementType are required');

      const id = randomUUID();
      const now = new Date().toISOString();
      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: `ENGAGEMENT#${now}#${id}`,
          engagementId: id,
          groupName,
          engagementType,
          note: note || '',
          engagementDate: date || now.split('T')[0],
          createdAt: now,
        },
      }));
      return ok({ id, groupName, engagementType, date: date || now.split('T')[0] });
    }

    // GET /calendar/engagement — get all engagement logs
    if (method === 'GET' && path === '/calendar/engagement') {
      const result = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'ENGAGEMENT#' },
      }));
      const items = (result.Items || []).map((item) => ({
        id: item.engagementId,
        groupName: item.groupName,
        engagementType: item.engagementType,
        note: item.note || '',
        date: item.engagementDate,
        createdAt: item.createdAt,
      }));
      return ok({ engagements: items });
    }

    console.log(`[CalendarHandler] No route: ${method} ${path}`);
    return err(404, 'NOT_FOUND', `No route for ${method} ${path}`);
  } catch (e) {
    console.error('calendar-handler error:', e);
    return err(500, 'INTERNAL_ERROR', e.message || 'An unexpected error occurred');
  }
};
