'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({ region: 'us-east-1' });
const TABLE_NAME = process.env.TABLE_NAME;
const ADMIN_EMAIL = 'notifications@hawkeyecue.com';

/**
 * Folio Recap Lambda — runs daily via EventBridge.
 * On the first day of a new folio period, sends a recap email to team members
 * with: total premium/value sold last month, top performing pipeline type,
 * and top performing team member (by won deal value).
 */

function getLastMonthFolio() {
  const now = new Date();
  // Last month range: first day of last month to last day of last month
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth(); // 1-indexed
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).toISOString().slice(0, 10);
  return { firstDay, lastDay, label: `${firstDay} to ${lastDay}` };
}

function isFolioFirstDay() {
  const now = new Date();
  return now.getDate() === 1;
}

async function getAllUsersWithDeals() {
  // Scan for all users who have team emails configured
  const users = [];
  let lastKey = undefined;

  do {
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: { ':sk': 'TEAM_EMAILS' },
      ExclusiveStartKey: lastKey,
    }));
    users.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return users;
}

async function getDealsForUser(userId) {
  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'DEAL#' },
  }));
  return result.Items || [];
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

function buildRecapEmail(stats, folioLabel) {
  const { totalSold, wonDeals, topPipelineType, topPipelineValue, topEmployee, topEmployeeValue } = stats;

  // Build a simple ASCII bar chart for pipeline types
  const pipelineChart = stats.pipelineBreakdown
    .slice(0, 5)
    .map((p) => {
      const barLength = Math.max(1, Math.round((p.value / (stats.totalSold || 1)) * 20));
      const bar = '█'.repeat(barLength);
      return `  ${p.type.padEnd(20)} ${bar} $${p.value.toLocaleString()} (${p.count} deals)`;
    })
    .join('\n');

  // Build team performance chart
  const teamChart = stats.teamBreakdown
    .slice(0, 5)
    .map((t) => {
      const barLength = Math.max(1, Math.round((t.value / (stats.totalSold || 1)) * 20));
      const bar = '█'.repeat(barLength);
      return `  ${t.name.padEnd(20)} ${bar} $${t.value.toLocaleString()} (${t.count} won)`;
    })
    .join('\n');

  const subject = `🦅 Folio Recap: $${totalSold.toLocaleString()} sold last month!`;

  const body = `
🦅 HawkEye-Cue — Monthly Folio Recap
${'═'.repeat(45)}

📅 Folio Period: ${folioLabel}
💰 Total Sold: $${totalSold.toLocaleString()}
🎯 Deals Won: ${wonDeals}

${'─'.repeat(45)}
🏆 TOP PERFORMING PIPELINE
${'─'.repeat(45)}
${pipelineChart || '  No data yet'}

  ⭐ #1: ${topPipelineType || 'N/A'} — $${(topPipelineValue || 0).toLocaleString()}

${'─'.repeat(45)}
👥 TOP PERFORMING TEAM MEMBER
${'─'.repeat(45)}
${teamChart || '  No data yet'}

  ⭐ #1: ${topEmployee || 'N/A'} — $${(topEmployeeValue || 0).toLocaleString()}

${'═'.repeat(45)}
Keep up the great work! 🦅

— HawkEye-Cue Sales Tracker
`;

  return { subject, body };
}

function computeStats(deals, folioLabel) {
  // Filter deals that match last month's folio OR were won during last month
  const lastMonth = getLastMonthFolio();
  const relevantDeals = deals.filter((d) => {
    // Match by folio string if it contains the month
    if (d.folio && d.folio.includes(lastMonth.firstDay.slice(0, 7))) return true;
    // Match by folio label
    if (d.folio === folioLabel) return true;
    // Match won deals by date
    if (d.stage === 'won' && d.updatedAt) {
      const updated = d.updatedAt.slice(0, 10);
      return updated >= lastMonth.firstDay && updated <= lastMonth.lastDay;
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

  // Team member breakdown by contactName (the person who closed)
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
    topPipelineType: pipelineBreakdown[0]?.type || null,
    topPipelineValue: pipelineBreakdown[0]?.value || 0,
    topEmployee: teamBreakdown[0]?.name || null,
    topEmployeeValue: teamBreakdown[0]?.value || 0,
    pipelineBreakdown,
    teamBreakdown,
  };
}

exports.handler = async () => {
  console.log('Folio Recap Lambda triggered');

  // Only send recap on the 1st of the month
  if (!isFolioFirstDay()) {
    console.log('Not the first day of the month — skipping.');
    return { statusCode: 200, body: 'Not folio first day, skipping' };
  }

  const lastMonth = getLastMonthFolio();
  console.log(`Generating recap for folio: ${lastMonth.label}`);

  try {
    // Find all users with team emails configured
    const teamEmailRecords = await getAllUsersWithDeals();
    console.log(`Found ${teamEmailRecords.length} users with team email configurations`);

    let emailsSent = 0;

    for (const record of teamEmailRecords) {
      const userId = record.PK.replace('USER#', '');
      const emails = record.emails || [];
      if (emails.length === 0) continue;

      // Get all deals for this user
      const deals = await getDealsForUser(userId);
      if (deals.length === 0) continue;

      // Compute stats for last month
      const stats = computeStats(deals, lastMonth.label);
      if (stats.totalSold === 0 && stats.wonDeals === 0) continue; // Nothing to report

      // Build and send email
      const { subject, body } = buildRecapEmail(stats, lastMonth.label);

      for (const email of emails.slice(0, 10)) {
        try {
          await ses.send(new SendEmailCommand({
            Source: ADMIN_EMAIL,
            Destination: { ToAddresses: [email] },
            Message: {
              Subject: { Data: subject },
              Body: { Text: { Data: body } },
            },
          }));
          emailsSent++;
        } catch (e) {
          console.error(`Failed to send recap to ${email}:`, e.message);
        }
      }
    }

    console.log(`Folio Recap complete. ${emailsSent} emails sent.`);
    return { statusCode: 200, body: `Sent ${emailsSent} recap emails` };
  } catch (e) {
    console.error('Folio Recap error:', e);
    return { statusCode: 500, body: e.message };
  }
};
