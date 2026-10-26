'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand, PutCommand, DeleteCommand, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});
const TABLE_NAME = process.env.TABLE_NAME;
const FROM_EMAIL = 'HawkEye-Cue <notifications@hawkeyecue.com>';

// ─── Email idempotency: recoverable pending → sent lease ────────────────────
// State machine on EMAILSENT#<key>:
//   (absent)                → claimable
//   status='pending', lease not expired → BLOCKED (another worker is sending now)
//   status='pending', lease EXPIRED     → claimable (prior worker crashed mid-send;
//                                          recover rather than suppress for 30 days)
//   status='sent'                        → BLOCKED permanently (TTL 30d) — already sent
//
// claimEmailSend returns { ok, token }. The token (leaseOwner) must be passed to
// confirmEmailSent/releaseEmailClaim; their conditional updates REQUIRE the stored
// leaseOwner to still equal the token, so an expired worker that wakes up late can
// NEVER overwrite a newer worker's claim.
//
// NOTE on ambiguous outcomes: if the provider ACCEPTS the send but we crash before
// confirmEmailSent, the lease expires and a retry may resend (at-least-once). True
// exactly-once requires a provider-level idempotency key — see sendEmail (Resend
// 'Idempotency-Key' header) which we set to the claim key as the smallest safe guard.
const LEASE_SECONDS = 120;
function newLeaseToken() {
  // crypto.randomUUID is available in Node 20 (Lambda runtime).
  try { return require('crypto').randomUUID(); } catch (e) { return String(Date.now()) + Math.random(); }
}
async function claimEmailSend(claimKey) {
  const nowSec = Math.floor(Date.now() / 1000);
  const token = newLeaseToken();
  try {
    await dynamo.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { PK: `EMAILSENT#${claimKey}`, SK: 'CLAIM', status: 'pending', leaseOwner: token, leaseUntil: nowSec + LEASE_SECONDS, claimedAt: new Date().toISOString() },
      // Claimable when: no item exists, OR the item is a pending claim whose lease has
      // expired (crash recovery). A 'sent' item (no leaseUntil, or status sent) blocks.
      ConditionExpression: 'attribute_not_exists(PK) OR (#st = :pending AND leaseUntil < :now)',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':pending': 'pending', ':now': nowSec },
    }));
    return { ok: true, token };
  } catch (e) {
    if (e && e.name === 'ConditionalCheckFailedException') return { ok: false, token: null };
    throw e;
  }
}
// Mark a successful send as permanently sent (30-day TTL). Guarded by leaseOwner so a
// stale worker cannot flip a newer claim to sent.
async function confirmEmailSent(claimKey, token) {
  const ttl = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  try {
    await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `EMAILSENT#${claimKey}`, SK: 'CLAIM' },
      UpdateExpression: 'SET #st = :sent, #ttl = :ttl REMOVE leaseUntil',
      ConditionExpression: 'leaseOwner = :tok',
      ExpressionAttributeNames: { '#st': 'status', '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':sent': 'sent', ':ttl': ttl, ':tok': token },
    }));
  } catch (e) { /* lost the lease to a newer worker — safe to ignore */ }
}
// Release a pending claim on failure so a retry can resend. Guarded by leaseOwner.
async function releaseEmailClaim(claimKey, token) {
  try {
    await dynamo.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `EMAILSENT#${claimKey}`, SK: 'CLAIM' },
      ...(token ? { ConditionExpression: 'leaseOwner = :tok', ExpressionAttributeValues: { ':tok': token } } : {}),
    }));
  } catch (e) { /* best-effort / lost lease */ }
}

// ─── Resend Email Helper ──────────────────────────────────────────────────────
let resendApiKey = null;
async function getResendKey() {
  if (resendApiKey) return resendApiKey;
  const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: process.env.RESEND_SECRET_ID || 'SocialLeadGen/Resend' }));
  const secret = JSON.parse(result.SecretString);
  resendApiKey = secret.RESEND_API_KEY;
  return resendApiKey;
}

async function sendEmail(to, subject, textOrHtml, idempotencyKey) {
  const apiKey = await getResendKey();
  const isHtml = textOrHtml.includes('<');
  const payload = { from: FROM_EMAIL, to: Array.isArray(to) ? to : [to], subject };
  if (isHtml) { payload.html = textOrHtml; } else { payload.text = textOrHtml; }
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  // Smallest safe provider-level guard against duplicates after an ambiguous outcome:
  // Resend honors an Idempotency-Key header (same key within 24h → one send).
  if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey).slice(0, 256);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
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

function buildRecapEmail(stats, folioLabel, agencyTotal, teamMemberStats) {
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

  const subject = `🦅 Folio Recap: $${totalSold.toLocaleString()} sold | Agency Total: $${(agencyTotal || totalSold).toLocaleString()}`;

  // Build the team comparison / leaderboard section (only for team/Summit users)
  let teamSection = '';
  if (teamMemberStats && teamMemberStats.length > 1) {
    const teamMax = Math.max(...teamMemberStats.map((m) => m.premium), 1);
    const medals = ['🥇', '🥈', '🥉'];
    const rows = teamMemberStats.map((m, i) => {
      const rank = medals[i] || `${i + 1}.`;
      const barLen = Math.max(1, Math.round((m.premium / teamMax) * 18));
      const bar = '█'.repeat(barLen);
      return `  ${rank} ${m.name.padEnd(16)} ${bar} $${m.premium.toLocaleString()} (${m.deals} won)`;
    }).join('\n');

    teamSection = `
${'─'.repeat(45)}
🏆 TEAM LEADERBOARD — this folio
${'─'.repeat(45)}
${rows}

  🏢 Team Total: $${(agencyTotal || 0).toLocaleString()}
`;
  }

  const body = `
🦅 HawkEye-Cue — Folio Recap
${'═'.repeat(45)}

📅 Folio Period: ${folioLabel}
💰 Premium Sold (You): $${totalSold.toLocaleString()}
🏢 Total Agency Premium: $${(agencyTotal || totalSold).toLocaleString()}
🎯 Deals Won: ${wonDeals} of ${totalDeals} total
${teamSection}
${'─'.repeat(45)}
📊 TOP PERFORMING PIPELINE
${'─'.repeat(45)}
${pipelineChart || '  No deals closed this folio'}

  ⭐ #1: ${topPipelineType || 'N/A'} — $${(topPipelineValue || 0).toLocaleString()}

${'═'.repeat(45)}
${teamMemberStats && teamMemberStats.length > 1 ? 'Great work team — new folio starts today! 🦅' : "New folio starts today — let's get after it! 🦅"}

— HawkEye-Cue Sales Tracker
`;

  return { subject, body };
}

// ─── Daily Team Recap aggregation (reuses existing deal reads) ──────────────
// Aggregates ONE team for a given reporting day. "Today's closed sales" use the WON
// transition date (updatedAt on a won deal) when available — NOT the deal/lead creation
// date — so a sale counts on the day it actually closed. New-lead count uses OPP# items
// created that day. Returns null if the team has no members. Computed once per team and
// reused for every recipient (agency isolation: only this team's members are read).
async function aggregateTeamToday(members, dayStr) {
  if (!members || members.length === 0) return null;
  const perEmployee = [];
  let agencySales = 0;        // total won premium today
  let agencyDealCount = 0;    // # won deals today
  let agencyNewLeads = 0;     // # OPP# created today
  const closedToday = [];     // { salesperson, dealName, value }

  for (const m of members) {
    const uid = m.userId;
    const name = (m.email || '').split('@')[0] || 'Member';
    const deals = await getDealsForUser(uid);
    let empSales = 0, empDeals = 0;
    for (const d of deals) {
      if (d.stage !== 'won') continue;
      // WON-transition date proxy: updatedAt on a won deal. Fall back to createdAt ONLY
      // if updatedAt is absent (legacy rows). We never count by creation date alone when
      // a won-transition date exists.
      const wonDay = (d.updatedAt || d.createdAt || '').slice(0, 10);
      if (wonDay !== dayStr) continue;
      const val = d.dealValue || 0;
      empSales += val; empDeals += 1;
      agencySales += val; agencyDealCount += 1;
      closedToday.push({ salesperson: name, dealName: d.dealName || 'Deal', value: val });
    }
    // New leads today for this member (OPP# items created today).
    try {
      const oppResult = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `USER#${uid}`, ':sk': 'OPP#' },
      }));
      agencyNewLeads += (oppResult.Items || []).filter((o) => (o.createdAt || '').slice(0, 10) === dayStr).length;
    } catch (e) { /* best-effort */ }
    perEmployee.push({ name, sales: empSales, deals: empDeals });
  }
  perEmployee.sort((a, b) => b.sales - a.sales);
  const topPerformer = perEmployee.find((e) => e.sales > 0) || null;
  return { perEmployee, agencySales, agencyDealCount, agencyNewLeads, closedToday, topPerformer };
}

// Build the daily team recap email (HawkEye-Cue branding). Every recipient sees the
// same team-wide + per-employee view (per requirement). Goals are rendered ONLY if a
// supported goal field is present on the team record; otherwise omitted (no new goal
// system invented).
function buildTeamRecapEmail(agg, teamName, dayStr, teamGoal) {
  const money = (n) => `$${(n || 0).toLocaleString()}`;
  const empRows = agg.perEmployee.map((e, i) =>
    `<tr><td style="padding:6px 10px;color:#e2e8f0;">${i === 0 && e.sales > 0 ? '⭐ ' : ''}${e.name}</td><td style="padding:6px 10px;text-align:right;color:#fbbf24;font-weight:700;">${money(e.sales)}</td><td style="padding:6px 10px;text-align:right;color:#94a3b8;">${e.deals}</td></tr>`
  ).join('');
  const closedRows = agg.closedToday.length
    ? agg.closedToday.map((c) => `<li style="margin:2px 0;color:#cbd5e1;">${c.salesperson} — ${c.dealName} (${money(c.value)})</li>`).join('')
    : '<li style="color:#94a3b8;">No sales closed today yet</li>';
  const goalBlock = (typeof teamGoal === 'number' && teamGoal > 0)
    ? `<div style="background:#0b1220;border:1px solid #1e293b;border-radius:10px;padding:12px;margin:12px 0;"><p style="margin:0;color:#93c5fd;font-size:13px;">🎯 Agency goal: ${money(teamGoal)} · ${Math.min(100, Math.round((agg.agencySales / teamGoal) * 100))}% today</p></div>`
    : '';
  const subject = `🦅 ${teamName} — Daily Team Recap: ${money(agg.agencySales)} sold today`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:20px;background:#0f172a;">
      <h2 style="color:#f97316;margin:0 0 4px 0;">🦅 Daily Team Recap</h2>
      <p style="color:#94a3b8;font-size:12px;margin:0 0 16px 0;">${teamName} · ${dayStr}</p>
      <div style="display:flex;gap:10px;margin-bottom:16px;">
        <div style="flex:1;background:#111827;border:1px solid #1f2937;border-radius:10px;padding:12px;text-align:center;">
          <p style="margin:0;color:#fbbf24;font-size:20px;font-weight:800;">${money(agg.agencySales)}</p>
          <p style="margin:2px 0 0 0;color:#94a3b8;font-size:11px;">Agency Sales Today</p>
        </div>
        <div style="flex:1;background:#111827;border:1px solid #1f2937;border-radius:10px;padding:12px;text-align:center;">
          <p style="margin:0;color:#e2e8f0;font-size:20px;font-weight:800;">${agg.agencyDealCount}</p>
          <p style="margin:2px 0 0 0;color:#94a3b8;font-size:11px;">Deals Won</p>
        </div>
        <div style="flex:1;background:#111827;border:1px solid #1f2937;border-radius:10px;padding:12px;text-align:center;">
          <p style="margin:0;color:#e2e8f0;font-size:20px;font-weight:800;">${agg.agencyNewLeads}</p>
          <p style="margin:2px 0 0 0;color:#94a3b8;font-size:11px;">New Leads</p>
        </div>
      </div>
      ${goalBlock}
      ${agg.topPerformer ? `<p style="color:#fbbf24;font-size:14px;margin:0 0 12px 0;">🏆 Top performer today: <strong style="color:#fff;">${agg.topPerformer.name}</strong> — ${money(agg.topPerformer.sales)}</p>` : ''}
      <h3 style="color:#fff;font-size:14px;margin:12px 0 6px 0;">Individual Production</h3>
      <table style="width:100%;border-collapse:collapse;background:#111827;border:1px solid #1f2937;border-radius:10px;overflow:hidden;">
        <tr style="background:#1f2937;"><th style="padding:6px 10px;text-align:left;color:#94a3b8;font-size:11px;">Employee</th><th style="padding:6px 10px;text-align:right;color:#94a3b8;font-size:11px;">Sales</th><th style="padding:6px 10px;text-align:right;color:#94a3b8;font-size:11px;">Deals</th></tr>
        ${empRows}
      </table>
      <h3 style="color:#fff;font-size:14px;margin:16px 0 6px 0;">Today's Closed Sales</h3>
      <ul style="margin:0;padding-left:18px;font-size:13px;">${closedRows}</ul>
      <p style="color:#64748b;font-size:11px;margin:18px 0 0 0;">Daily team recap · manage in Settings → Notifications. — HawkEye-Cue</p>
    </div>
  `;
  return { subject, html };
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

      // Compute agency total + per-member breakdown for team/Summit users
      let agencyTotal = stats.totalSold;
      let teamMemberStats = null; // array of { name, premium, deals } when on a team
      try {
        // Check if user belongs to a team (member or admin)
        const memberResult = await dynamo.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND SK = :sk',
          ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'TEAM_MEMBER' },
        }));
        const adminResult = await dynamo.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND SK = :sk',
          ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'TEAM_ADMIN' },
        }));
        const teamId = (memberResult.Items || [])[0]?.teamId || (adminResult.Items || [])[0]?.teamId;

        if (teamId) {
          // Get all team members from the TEAM#<id> MEMBER# records
          let teamLastKey = undefined;
          const allTeamMembers = [];
          do {
            const teamScan = await dynamo.send(new QueryCommand({
              TableName: TABLE_NAME,
              KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
              ExpressionAttributeValues: { ':pk': `TEAM#${teamId}`, ':sk': 'MEMBER#' },
              ExclusiveStartKey: teamLastKey,
            }));
            allTeamMembers.push(...(teamScan.Items || []));
            teamLastKey = teamScan.LastEvaluatedKey;
          } while (teamLastKey);

          // Load display names for friendly labels
          let displayNames = {};
          try {
            const prefsRes = await dynamo.send(new QueryCommand({
              TableName: TABLE_NAME,
              KeyConditionExpression: 'PK = :pk AND SK = :sk',
              ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'PREFERENCES' },
            }));
            displayNames = (prefsRes.Items || [])[0]?.displayNames || {};
          } catch { /* ignore */ }

          // Compute each member's premium for this folio
          const perMember = [];
          let totalAgency = 0;
          for (const member of allTeamMembers) {
            const memberId = member.userId || member.PK?.replace('USER#', '');
            if (!memberId) continue;
            const memberDeals = await getDealsForUser(memberId);
            const memberStats = computeStats(memberDeals, folioStart, folioEnd);
            totalAgency += memberStats.totalSold;
            const email = member.email || '';
            const name = displayNames[email] || (email ? email.split('@')[0] : 'Teammate');
            perMember.push({ name, premium: memberStats.totalSold, deals: memberStats.wonDeals });
          }
          agencyTotal = totalAgency;
          if (perMember.length > 1) {
            teamMemberStats = perMember.sort((a, b) => b.premium - a.premium);
          }
        }
      } catch (e) {
        console.error(`[folio] Failed to compute team breakdown for user ${userId}:`, e.message);
      }

      // Build and send recap email
      const folioLabel = `${folioStart} to ${folioEnd}`;
      const { subject, body } = buildRecapEmail(stats, folioLabel, agencyTotal, teamMemberStats);

      for (const email of emails.slice(0, 10)) {
        const claim = `foliorecap|${email}|${folioEnd}`;
        const lease = await claimEmailSend(claim);
        if (!lease.ok) { console.log(`Folio recap already sent/in-progress for ${email} ${folioEnd} — skip`); continue; }
        try {
          await sendEmail(email, subject, body, claim);
          await confirmEmailSent(claim, lease.token);
          emailsSent++;
          console.log(`Recap sent to ${email} for user ${userId}`);
        } catch (e) {
          await releaseEmailClaim(claim, lease.token); // allow retry
          console.error(`Failed to send recap to ${email}:`, e.message);
        }
      }
    }

    console.log(`Folio Recap complete. ${emailsSent} emails sent.`);

    // Shared across Morning Digest, Lead-Going-Cold, Weekly Recap, and Daily Team Recap.
    // Declared in the handler scope (NOT inside the digest try-block) so the later blocks
    // can read it — a const inside the digest block died with it, throwing
    // "allProfiles is not defined" and silently suppressing cold-lead/weekly/team-recap sends.
    let allProfiles = [];

    // ─── Daily Morning Digest Emails ──────────────────────────────────────
    let digestsSent = 0;
    try {
      const today = getTodayStr();
      // Scan all users who have profiles
      let lastKey = undefined;
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
          const digestClaim = `digest|${email}|${today}`;
          const digestLease = await claimEmailSend(digestClaim);
          if (!digestLease.ok) { continue; } // already sent/in-progress today
          try {
            await sendEmail(email, subject, html, digestClaim);
            await confirmEmailSent(digestClaim, digestLease.token);
            digestsSent++;
          } catch (sendErr) {
            await releaseEmailClaim(digestClaim, digestLease.token); // allow retry
            throw sendErr;
          }
        } catch (e) {
          console.error(`[digest] Error for user ${userId}:`, e.message);
        }
      }
      console.log(`Daily digests sent: ${digestsSent}`);
    } catch (e) {
      console.error('[digest] Error:', e.message);
    }

    // ─── Lead Going Cold Emails ───────────────────────────────────────────
    let coldLeadsSent = 0;
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const cutoff = threeDaysAgo.toISOString();

      for (const profile of allProfiles) {
        const userId = profile.PK.replace('USER#', '');
        const email = profile.email;
        if (!email) continue;
        const emailNotifs = profile.emailNotifications || {};
        if (emailNotifs.leadGoingCold === false) continue;

        try {
          const leadsResult = await dynamo.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'OPP#' },
          }));
          const coldLeads = (leadsResult.Items || []).filter((l) =>
            l.status === 'new' && l.createdAt && l.createdAt < cutoff
          );
          if (coldLeads.length === 0) continue;

          const names = coldLeads.slice(0, 5).map((l) => l.sourceAuthor || 'Unknown').join(', ');
          const subject = `⚠️ ${coldLeads.length} lead${coldLeads.length !== 1 ? 's' : ''} going cold`;
          const html = `
            <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
              <h2 style="color:#dc2626;margin:0 0 16px 0;">⚠️ Leads Going Cold</h2>
              <p style="font-size:14px;color:#334155;margin:0 0 12px 0;">You have <strong>${coldLeads.length}</strong> lead${coldLeads.length !== 1 ? 's' : ''} that haven't been followed up in 3+ days:</p>
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:12px;margin-bottom:16px;">
                <p style="margin:0;font-size:13px;color:#991b1b;">${names}${coldLeads.length > 5 ? ` (+${coldLeads.length - 5} more)` : ''}</p>
              </div>
              <a href="https://hawkeyecue.com/opportunities" style="display:inline-block;background:#dc2626;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Follow Up Now →</a>
              <p style="font-size:11px;color:#94a3b8;margin:16px 0 0 0;">Manage notifications in Settings → Email Notifications.</p>
            </div>
          `;
          await sendEmail(email, subject, html);
          coldLeadsSent++;
        } catch (e) {
          console.error(`[cold-leads] Error for user ${userId}:`, e.message);
        }
      }
      console.log(`Cold lead emails sent: ${coldLeadsSent}`);
    } catch (e) {
      console.error('[cold-leads] Error:', e.message);
    }

    // ─── Weekly Recap (Mondays only) ──────────────────────────────────────
    let weeklyRecapsSent = 0;
    const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon
    if (dayOfWeek === 1) {
      try {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekStart = weekAgo.toISOString().slice(0, 10);

        for (const profile of allProfiles) {
          const userId = profile.PK.replace('USER#', '');
          const email = profile.email;
          if (!email) continue;
          const emailNotifs = profile.emailNotifications || {};
          if (emailNotifs.weeklyRecap === false) continue;

          try {
            // Count leads created this week
            const leadsResult = await dynamo.send(new QueryCommand({
              TableName: TABLE_NAME,
              KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
              ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'OPP#' },
            }));
            const weekLeads = (leadsResult.Items || []).filter((l) => l.createdAt && l.createdAt >= weekStart);
            const wonLeads = weekLeads.filter((l) => l.status === 'converted');

            // Count deals closed this week
            const dealsResult = await dynamo.send(new QueryCommand({
              TableName: TABLE_NAME,
              KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
              ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'DEAL#' },
            }));
            const weekDeals = (dealsResult.Items || []).filter((d) => d.stage === 'won' && d.updatedAt && d.updatedAt >= weekStart);
            const weekRevenue = weekDeals.reduce((s, d) => s + (d.dealValue || 0), 0);

            if (weekLeads.length === 0 && weekDeals.length === 0) continue;

            const subject = `📊 Your Week: ${weekLeads.length} leads, ${weekDeals.length} deals, $${weekRevenue.toLocaleString()} revenue`;
            const html = `
              <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
                <h2 style="color:#1e40af;margin:0 0 16px 0;">📊 Weekly Recap</h2>
                <p style="font-size:14px;color:#334155;margin:0 0 16px 0;">Here's how your week went:</p>
                <div style="background:#f1f5f9;border-radius:12px;padding:16px;margin-bottom:16px;">
                  <p style="margin:0 0 8px 0;font-size:14px;">🎯 <strong>${weekLeads.length}</strong> new lead${weekLeads.length !== 1 ? 's' : ''}</p>
                  <p style="margin:0 0 8px 0;font-size:14px;">✓ <strong>${wonLeads.length}</strong> converted</p>
                  <p style="margin:0 0 8px 0;font-size:14px;">💰 <strong>${weekDeals.length}</strong> deal${weekDeals.length !== 1 ? 's' : ''} closed</p>
                  <p style="margin:0;font-size:14px;">💵 <strong>$${weekRevenue.toLocaleString()}</strong> revenue</p>
                </div>
                <a href="https://hawkeyecue.com/hawk-insights" style="display:inline-block;background:#1e40af;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">View Full Insights →</a>
                <p style="font-size:11px;color:#94a3b8;margin:16px 0 0 0;">Manage notifications in Settings → Email Notifications.</p>
              </div>
            `;
            const weekClaim = `weekly|${email}|${getTodayStr()}`;
            const weekLease = await claimEmailSend(weekClaim);
            if (!weekLease.ok) { continue; } // already sent/in-progress this Monday
            try {
              await sendEmail(email, subject, html, weekClaim);
              await confirmEmailSent(weekClaim, weekLease.token);
              weeklyRecapsSent++;
            } catch (sendErr) {
              await releaseEmailClaim(weekClaim, weekLease.token); // allow retry
              throw sendErr;
            }
          } catch (e) {
            console.error(`[weekly] Error for user ${userId}:`, e.message);
          }
        }
        console.log(`Weekly recaps sent: ${weeklyRecapsSent}`);
      } catch (e) {
        console.error('[weekly] Error:', e.message);
      }
    }

    // ─── Daily Team Recap (Summit teams) ──────────────────────────────────
    // Every active team member (incl. owner) gets the SAME complete team recap once/day.
    // Aggregated ONCE per team and reused for all recipients. Agency-isolated: only the
    // team's own MEMBER# rows are read. Reporting day uses the team's timezone field if
    // present, else the handler's UTC day (documented limitation — no new tz infra).
    let teamRecapsSent = 0;
    try {
      // Resolve distinct teams from admin/member link records across all profiles.
      const teamIds = new Set();
      for (const profile of allProfiles) {
        const uid = profile.PK.replace('USER#', '');
        for (const sk of ['TEAM_ADMIN', 'TEAM_MEMBER']) {
          const r = await dynamo.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND SK = :sk',
            ExpressionAttributeValues: { ':pk': `USER#${uid}`, ':sk': sk },
          }));
          const tId = (r.Items || [])[0]?.teamId;
          if (tId) teamIds.add(tId);
        }
      }
      for (const teamId of teamIds) {
        // Team info (name + optional timezone/goal — used only if already present).
        const infoRes = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `TEAM#${teamId}`, SK: 'INFO' } }));
        const info = infoRes.Item || {};
        const teamName = info.teamName || 'Your Team';
        const teamGoal = typeof info.dailyGoal === 'number' ? info.dailyGoal : (typeof info.goal === 'number' ? info.goal : undefined);
        const reportDay = info.timezone ? new Date(new Date().toLocaleString('en-US', { timeZone: info.timezone })).toISOString().slice(0, 10) : today;

        // All active members (incl. owner — the admin has a MEMBER# row).
        const membersRes = await dynamo.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': `TEAM#${teamId}`, ':sk': 'MEMBER#' },
        }));
        const members = (membersRes.Items || []).filter((m) => m.userId && m.email);
        if (members.length === 0) continue;

        // Aggregate ONCE per team, reuse for every recipient.
        const agg = await aggregateTeamToday(members, reportDay);
        if (!agg) continue;
        const { subject, html } = buildTeamRecapEmail(agg, teamName, reportDay, teamGoal);

        for (const m of members) {
          // Respect teamRecap preference (default ON). Read the member's profile prefs.
          const profRes = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `USER#${m.userId}`, SK: 'PROFILE' } }));
          const prefs = (profRes.Item && profRes.Item.emailNotifications) || {};
          if (prefs.teamRecap === false) continue;
          const claim = `teamrecap|${m.email}|${reportDay}`;
          const lease = await claimEmailSend(claim);
          if (!lease.ok) continue; // already sent/in-progress today
          try {
            await sendEmail(m.email, subject, html, claim);
            await confirmEmailSent(claim, lease.token);
            teamRecapsSent++;
          } catch (sendErr) {
            await releaseEmailClaim(claim, lease.token); // retryable
            console.error(`[team-recap] send failed for ${m.email}:`, sendErr.message);
          }
        }
      }
      console.log(`Daily team recaps sent: ${teamRecapsSent}`);
    } catch (e) {
      console.error('[team-recap] Error:', e.message);
    }

    return { statusCode: 200, body: `Folio: ${emailsSent}, Digests: ${digestsSent}, Cold: ${coldLeadsSent}, Weekly: ${weeklyRecapsSent}, TeamRecap: ${teamRecapsSent}` };
  } catch (e) {
    console.error('Folio Recap error:', e);
    return { statusCode: 500, body: e.message };
  }
};
