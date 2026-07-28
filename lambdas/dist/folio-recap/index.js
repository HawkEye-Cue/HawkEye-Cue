'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

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

async function sendEmail(to, subject, textOrHtml) {
  const apiKey = await getResendKey();
  const isHtml = textOrHtml.includes('<');
  const payload = { from: FROM_EMAIL, to: Array.isArray(to) ? to : [to], subject };
  if (isHtml) { payload.html = textOrHtml; } else { payload.text = textOrHtml; }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend error (${response.status}): ${err}`);
  }
  return response.json();
}

/**
 * Folio Recap Lambda — runs daily via EventBridge.
 * Checks each user's folio end date. If today is the day AFTER their
 * folio ended (i.e. the first day of their new folio), sends a recap
 * email to their team with last folio's stats.
 */

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getYesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function getAllFolioConfigs() {
  // Scan for all users who have a FOLIO_CONFIG record
  const configs = [];
  let lastKey = undefined;

  do {
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: { ':sk': 'FOLIO_CONFIG' },
      ExclusiveStartKey: lastKey,
    }));
    configs.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return configs;
}

async function getTeamEmails(userId) {
  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK = :sk',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'TEAM_EMAILS' },
  }));
  const item = (result.Items || [])[0];
  return item?.emails || [];
}

async function getDealsForUser(userId) {
  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'DEAL#' },
  }));
  return result.Items || [];
}

function computeStats(deals, folioStart, folioEnd) {
  const folioLabel = `${folioStart} to ${folioEnd}`;

  // Filter deals that belong to this folio period
  const relevantDeals = deals.filter((d) => {
    // Match by folio string
    if (d.folio === folioLabel) return true;
    // Match won deals updated within the folio date range
    if (d.stage === 'won' && d.updatedAt) {
      const updated = d.updatedAt.slice(0, 10);
      return updated >= folioStart && updated <= folioEnd;
    }
    // Match by creation date within folio range
    if (d.createdAt) {
      const created = d.createdAt.slice(0, 10);
      return created >= folioStart && created <= folioEnd;
    }
    return false;
  });

  const wonDeals = relevantDeals.filter((d) => d.stage === 'won');
  const totalSold = wonDeals.reduce((sum, d) => sum + (d.dealValue || 0), 0);

  // Pipeline breakdown by policyType (deal type)
  const pipelineMap = {};
  for (const deal of wonDeals) {
    const type = deal.policyType || 'Unspecified';
    if (!pipelineMap[type]) pipelineMap[type] = { type, value: 0, count: 0 };
    pipelineMap[type].value += deal.dealValue || 0;
    pipelineMap[type].count += 1;
  }
  const pipelineBreakdown = Object.values(pipelineMap).sort((a, b) => b.value - a.value);

  // Team member breakdown by deal name (the contact/agent who closed)
  const teamMap = {};
  for (const deal of wonDeals) {
    const name = deal.contactName || deal.dealName || 'Unknown';
    if (!teamMap[name]) teamMap[name] = { name, value: 0, count: 0 };
    teamMap[name].value += deal.dealValue || 0;
    teamMap[name].count += 1;
  }
  const teamBreakdown = Object.values(teamMap).sort((a, b) => b.value - a.value);

  return {
    totalSold,
    wonDeals: wonDeals.length,
    totalDeals: relevantDeals.length,
    topPipelineType: pipelineBreakdown[0]?.type || null,
    topPipelineValue: pipelineBreakdown[0]?.value || 0,
    topEmployee: teamBreakdown[0]?.name || null,
    topEmployeeValue: teamBreakdown[0]?.value || 0,
    pipelineBreakdown,
    teamBreakdown,
  };
}

function buildRecapEmail(stats, folioLabel) {
  const { totalSold, wonDeals, totalDeals, topPipelineType, topPipelineValue, topEmployee, topEmployeeValue } = stats;

  // Build a simple text bar chart for pipeline types
  const pipelineChart = stats.pipelineBreakdown
    .slice(0, 5)
    .map((p) => {
      const barLength = Math.max(1, Math.round((p.value / (totalSold || 1)) * 20));
      const bar = '█'.repeat(barLength);
      return `  ${p.type.padEnd(22)} ${bar} $${p.value.toLocaleString()} (${p.count} deals)`;
    })
    .join('\n');

  // Build team performance chart
  const teamChart = stats.teamBreakdown
    .slice(0, 5)
    .map((t) => {
      const barLength = Math.max(1, Math.round((t.value / (totalSold || 1)) * 20));
      const bar = '█'.repeat(barLength);
      return `  ${t.name.padEnd(22)} ${bar} $${t.value.toLocaleString()} (${t.count} won)`;
    })
    .join('\n');

  const subject = `🦅 Folio Recap: $${totalSold.toLocaleString()} sold last folio!`;

  const body = `
🦅 HawkEye-Cue — Folio Recap
${'═'.repeat(45)}

📅 Folio Period: ${folioLabel}
💰 Premium Sold: $${totalSold.toLocaleString()}
🎯 Deals Won: ${wonDeals} of ${totalDeals} total

${'─'.repeat(45)}
📊 TOP PERFORMING PIPELINE
${'─'.repeat(45)}
${pipelineChart || '  No deals closed this folio'}

  ⭐ #1: ${topPipelineType || 'N/A'} — $${(topPipelineValue || 0).toLocaleString()}

${'─'.repeat(45)}
👥 TOP PERFORMING EMPLOYEE
${'─'.repeat(45)}
${teamChart || '  No team data'}

  ⭐ #1: ${topEmployee || 'N/A'} — $${(topEmployeeValue || 0).toLocaleString()}

${'═'.repeat(45)}
New folio starts today — let's get after it! 🦅

— HawkEye-Cue Sales Tracker
`;

  return { subject, body };
}

exports.handler = async () => {
  console.log('Folio Recap Lambda triggered');

  const today = getTodayStr();
  const yesterday = getYesterdayStr();
  console.log(`Today: ${today}, checking for folios that ended yesterday: ${yesterday}`);

  try {
    // Get all users who have folio configs
    const folioConfigs = await getAllFolioConfigs();
    console.log(`Found ${folioConfigs.length} users with folio configurations`);

    let emailsSent = 0;

    for (const config of folioConfigs) {
      const userId = config.PK.replace('USER#', '');
      const { folioStart, folioEnd } = config;

      if (!folioEnd) continue;

      // Check if yesterday was this user's folio end date
      // This means today is the first day of their NEW folio — time to send recap
      if (folioEnd !== yesterday) continue;

      console.log(`User ${userId}: folio ended yesterday (${folioStart} to ${folioEnd}). Sending recap.`);

      // Get team emails
      const emails = await getTeamEmails(userId);
      if (emails.length === 0) {
        console.log(`User ${userId}: no team emails configured, skipping.`);
        continue;
      }

      // Get all deals and compute stats for the ended folio
      const deals = await getDealsForUser(userId);
      if (deals.length === 0) continue;

      const stats = computeStats(deals, folioStart, folioEnd);
      if (stats.totalSold === 0 && stats.wonDeals === 0) {
        console.log(`User ${userId}: no won deals in folio, skipping.`);
        continue;
      }

      // Build and send recap email
      const folioLabel = `${folioStart} to ${folioEnd}`;
      const { subject, body } = buildRecapEmail(stats, folioLabel);

      for (const email of emails.slice(0, 10)) {
        try {
          await sendEmail(email, subject, body);
          emailsSent++;
          console.log(`Recap sent to ${email} for user ${userId}`);
        } catch (e) {
          console.error(`Failed to send recap to ${email}:`, e.message);
        }
      }
    }

    console.log(`Folio Recap complete. ${emailsSent} emails sent.`);

    // ─── Daily Morning Digest Emails ──────────────────────────────────────
    let digestsSent = 0;
    try {
      const today = getTodayStr();
      // Scan all users who have profiles
      let lastKey = undefined;
      const allProfiles = [];
      do {
        const scanResult = await dynamo.send(new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':sk': 'PROFILE' },
          ExclusiveStartKey: lastKey,
        }));
        allProfiles.push(...(scanResult.Items || []));
        lastKey = scanResult.LastEvaluatedKey;
      } while (lastKey);

      for (const profile of allProfiles) {
        const userId = profile.PK.replace('USER#', '');
        const email = profile.email;
        if (!email) continue;

        // Check notification preferences
        const emailNotifs = profile.emailNotifications || {};
        if (emailNotifs.dailyDigest === false) continue;

        // Get today's calendar events
        try {
          const calResult = await dynamo.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': `CAL#${today}` },
          }));
          const events = calResult.Items || [];
          if (events.length === 0) continue; // No events today — skip

          const meetings = events.filter((e) => e.eventType === 'meeting');
          const reminders = events.filter((e) => e.eventType === 'reminder' || e.eventType === 'task');
          const posts = events.filter((e) => e.eventType === 'post');

          const subject = `🦅 Today: ${meetings.length} meeting${meetings.length !== 1 ? 's' : ''}, ${posts.length} flock${posts.length !== 1 ? 's' : ''}, ${reminders.length} follow-up${reminders.length !== 1 ? 's' : ''}`;
          const html = `
            <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
              <h2 style="color:#1e40af;margin:0 0 16px 0;">🦅 Good Morning!</h2>
              <p style="font-size:14px;color:#334155;margin:0 0 16px 0;">Here's what's on your plate today:</p>
              <div style="background:#f1f5f9;border-radius:12px;padding:16px;margin-bottom:16px;">
                ${meetings.length > 0 ? `<p style="margin:0 0 8px 0;font-size:14px;">🤝 <strong>${meetings.length}</strong> meeting${meetings.length !== 1 ? 's' : ''}</p>` : ''}
                ${posts.length > 0 ? `<p style="margin:0 0 8px 0;font-size:14px;">📤 <strong>${posts.length}</strong> flock${posts.length !== 1 ? 's' : ''} to post</p>` : ''}
                ${reminders.length > 0 ? `<p style="margin:0 0 8px 0;font-size:14px;">🔔 <strong>${reminders.length}</strong> follow-up${reminders.length !== 1 ? 's' : ''}</p>` : ''}
              </div>
              <a href="https://hawkeyecue.com/" style="display:inline-block;background:#1e40af;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Open HawkEye-Cue →</a>
              <p style="font-size:11px;color:#94a3b8;margin:16px 0 0 0;">Manage notifications in Settings → Email Notifications.</p>
            </div>
          `;
          await sendEmail(email, subject, html);
          digestsSent++;
        } catch (e) {
          console.error(`[digest] Error for user ${userId}:`, e.message);
        }
      }
      console.log(`Daily digests sent: ${digestsSent}`);
    } catch (e) {
      console.error('[digest] Error:', e.message);
    }

    return { statusCode: 200, body: `Sent ${emailsSent} recap emails, ${digestsSent} daily digests` };
  } catch (e) {
    console.error('Folio Recap error:', e);
    return { statusCode: 500, body: e.message };
  }
};
