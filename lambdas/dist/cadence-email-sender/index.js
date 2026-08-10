'use strict';

/**
 * Cadence Email Sender — EventBridge scheduled Lambda (runs daily at 2pm UTC / 8am Mountain)
 * 
 * Scans all users' flight projection protocols for steps due TODAY that:
 *  - Are type "email" 
 *  - Are not yet completed
 *  - Have a scheduledDate matching today
 * 
 * Then sends the appropriate template email via the user's connected Gmail/Outlook.
 * Marks the step as completed after sending.
 * Respects: no Sundays, user opt-out, connected email requirement.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME;

// Google OAuth credentials
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Microsoft OAuth credentials
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

exports.handler = async () => {
  const today = new Date();
  // Never send on Sundays
  if (today.getDay() === 0) {
    console.log('[cadence-email] Today is Sunday — skipping.');
    return { sent: 0 };
  }

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  console.log(`[cadence-email] Checking for due cadence emails on ${todayStr}`);

  let sent = 0;
  let lastKey = undefined;

  // Scan for all LEAD_PROTOCOL# records
  do {
    const scanResult = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':prefix': 'LEAD_PROTOCOL#' },
      ExclusiveStartKey: lastKey,
    }));

    const protocols = scanResult.Items || [];
    lastKey = scanResult.LastEvaluatedKey;

    for (const protocol of protocols) {
      const userId = protocol.PK.replace('USER#', '');
      const steps = protocol.steps || [];
      const leadName = protocol.leadName || 'there';
      const oppId = protocol.opportunityId;

      // Find email steps due today that are not completed
      const dueEmailSteps = steps.filter(
        (s) => s.type === 'email' && !s.completed && s.scheduledDate === todayStr
      );

      if (dueEmailSteps.length === 0) continue;

      // Check if user has email automation enabled (not opted out)
      try {
        const prefsResult = await dynamo.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${userId}`, SK: 'PREFERENCES' },
        }));
        const prefs = prefsResult.Item;
        if (prefs?.emailAutomation === false) {
          console.log(`[cadence-email] User ${userId} has automation disabled — skipping.`);
          continue;
        }
      } catch { /* continue if prefs not found */ }

      // Get user's connected email (try Microsoft first, then Google)
      let tokenRecord = null;
      let provider = null;

      try {
        const msResult = await dynamo.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${userId}`, SK: 'EMAIL_OAUTH#microsoft' },
        }));
        if (msResult.Item) {
          tokenRecord = msResult.Item;
          provider = 'microsoft';
        } else {
          const googleResult = await dynamo.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${userId}`, SK: 'EMAIL_OAUTH#google' },
          }));
          if (googleResult.Item) {
            tokenRecord = googleResult.Item;
            provider = 'google';
          }
        }
      } catch { continue; }

      if (!tokenRecord) {
        console.log(`[cadence-email] User ${userId} has no connected email — skipping.`);
        continue;
      }

      // Get lead's email (from opportunity record)
      let leadEmail = '';
      try {
        const oppResult = await dynamo.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${userId}`, SK: `OPP#${oppId}` },
        }));
        leadEmail = oppResult.Item?.contactEmail || oppResult.Item?.email || '';
      } catch { /* ignore */ }

      if (!leadEmail) {
        console.log(`[cadence-email] Lead ${oppId} has no email — skipping auto-send.`);
        continue;
      }

      // Get user's saved email templates
      let templates = {};
      try {
        const templateResult = await dynamo.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${userId}`, SK: 'PREFERENCES' },
        }));
        const item = templateResult.Item || {};
        templates = {
          0: item.emailTemplate0 || '',
          1: item.emailTemplate1 || '',
          2: item.emailTemplate2 || '',
          3: item.emailTemplate3 || '',
        };
      } catch { /* use defaults */ }

      // Refresh token if needed
      let accessToken = tokenRecord.accessToken;
      if (tokenRecord.expiresAt && new Date(tokenRecord.expiresAt) < new Date() && tokenRecord.refreshToken) {
        accessToken = await refreshToken(provider, tokenRecord, userId);
        if (!accessToken) {
          console.log(`[cadence-email] Token refresh failed for user ${userId} — skipping.`);
          continue;
        }
      }

      // Send email for each due step
      for (const step of dueEmailSteps) {
        const templateIdx = Math.min(step.idx, 3); // templates 0-3
        let emailBody = templates[templateIdx] || getDefaultTemplate(templateIdx);
        const subject = getSubjectForStep(step, templateIdx, leadName);

        // Replace {name} placeholder
        emailBody = emailBody.replace(/\{name\}/g, leadName);

        try {
          if (provider === 'google') {
            await sendGmail(accessToken, leadEmail, subject, emailBody);
          } else {
            await sendOutlook(accessToken, leadEmail, subject, emailBody);
          }

          // Mark step as completed
          const updatedSteps = [...steps];
          const stepIndex = updatedSteps.findIndex((s) => s.idx === step.idx);
          if (stepIndex >= 0) {
            updatedSteps[stepIndex] = { ...updatedSteps[stepIndex], completed: true, completedAt: new Date().toISOString(), autoSent: true };
          }
          await dynamo.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${userId}`, SK: `LEAD_PROTOCOL#${oppId}` },
            UpdateExpression: 'SET steps = :s, updatedAt = :u',
            ExpressionAttributeValues: { ':s': updatedSteps, ':u': new Date().toISOString() },
          }));

          sent++;
          console.log(`[cadence-email] Sent email to ${leadEmail} for lead ${leadName} (user ${userId}, step ${step.idx})`);
        } catch (e) {
          console.error(`[cadence-email] Failed to send to ${leadEmail}:`, e.message);
        }
      }
    }
  } while (lastKey);

  console.log(`[cadence-email] Done. Sent ${sent} cadence email(s).`);
  return { sent };
};

// ─── Helper Functions ─────────────────────────────────────────────────────────

async function refreshToken(provider, tokenRecord, userId) {
  try {
    if (provider === 'google') {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: tokenRecord.refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      });
      const data = await res.json();
      if (data.access_token) {
        await dynamo.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${userId}`, SK: 'EMAIL_OAUTH#google' },
          UpdateExpression: 'SET accessToken = :a, expiresAt = :e',
          ExpressionAttributeValues: {
            ':a': data.access_token,
            ':e': new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
          },
        }));
        return data.access_token;
      }
    } else if (provider === 'microsoft') {
      const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          refresh_token: tokenRecord.refreshToken,
          grant_type: 'refresh_token',
          scope: 'openid profile email Mail.Send offline_access',
        }).toString(),
      });
      const data = await res.json();
      if (data.access_token) {
        await dynamo.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `USER#${userId}`, SK: 'EMAIL_OAUTH#microsoft' },
          UpdateExpression: 'SET accessToken = :a, refreshToken = :r, expiresAt = :e',
          ExpressionAttributeValues: {
            ':a': data.access_token,
            ':r': data.refresh_token || tokenRecord.refreshToken,
            ':e': new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
          },
        }));
        return data.access_token;
      }
    }
  } catch (e) {
    console.error(`[cadence-email] Token refresh error for ${provider}:`, e.message);
  }
  return null;
}

async function sendGmail(accessToken, to, subject, body) {
  const rawEmail = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  const encoded = Buffer.from(rawEmail).toString('base64url');
  const res = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail send failed: ${res.status} ${errText}`);
  }
}

async function sendOutlook(accessToken, to, subject, body) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: body },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Outlook send failed: ${res.status} ${errText}`);
  }
}

function getSubjectForStep(step, templateIdx, leadName) {
  const subjects = [
    `Introduction from HawkEye-Cue`,
    `Following up — ${leadName}`,
    `Checking in — ${leadName}`,
    `One more thing — ${leadName}`,
  ];
  return subjects[templateIdx] || `Follow up — ${leadName}`;
}

function getDefaultTemplate(idx) {
  const defaults = [
    `<p>Hi {name},</p><p>I saw your post and wanted to reach out. I'd love to help — let me know if you have any questions!</p><p>Best regards</p>`,
    `<p>Hi {name},</p><p>Just following up on my previous message. I wanted to make sure you got it. Happy to chat whenever works for you.</p><p>Thanks!</p>`,
    `<p>Hi {name},</p><p>Checking in to see if you had any questions or if there's anything I can help with. No pressure — just wanted to stay connected.</p><p>Best</p>`,
    `<p>Hi {name},</p><p>I wanted to touch base one more time. If now isn't the right time, no worries at all. I'm here whenever you need me.</p><p>Take care!</p>`,
  ];
  return defaults[idx] || defaults[0];
}
