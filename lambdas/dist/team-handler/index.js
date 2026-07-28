'use strict';
// v2 - eventDate fix + posts filter

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, GetCommand, UpdateCommand, DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
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

// ─── Get user's team info ─────────────────────────────────────────────────────
async function getUserTeam(userId) {
  // Check if user is a team admin (owns a team)
  const adminResult = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: 'TEAM_ADMIN' },
  }));
  if (adminResult.Item) {
    return { ...adminResult.Item, role: 'admin' };
  }

  // Check if user is a team member
  const memberResult = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: 'TEAM_MEMBER' },
  }));
  if (memberResult.Item) {
    return { ...memberResult.Item, role: 'member' };
  }

  return null;
}

// ─── Get team members ─────────────────────────────────────────────────────────
async function getTeamMembers(teamId) {
  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `TEAM#${teamId}`, ':sk': 'MEMBER#' },
  }));
  return result.Items || [];
}

// ─── Get pending invites ──────────────────────────────────────────────────────
async function getTeamInvites(teamId) {
  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `TEAM#${teamId}`, ':sk': 'INVITE#' },
  }));
  return result.Items || [];
}

// ─── Create team (called when admin subscribes to team tier) ──────────────────
async function createTeam(userId, teamName) {
  const teamId = randomUUID();
  const now = new Date().toISOString();

  // Get user profile for email
  const profile = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
  }));
  const email = profile.Item?.email || '';

  // Create team record
  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `TEAM#${teamId}`,
      SK: 'INFO',
      teamId,
      teamName: teamName || `${email.split('@')[0]}'s Team`,
      adminUserId: userId,
      adminEmail: email,
      maxMembers: 5,
      createdAt: now,
    },
  }));

  // Add admin as first member
  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `TEAM#${teamId}`,
      SK: `MEMBER#${userId}`,
      userId,
      email,
      role: 'admin',
      joinedAt: now,
    },
  }));

  // Mark user as team admin
  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${userId}`,
      SK: 'TEAM_ADMIN',
      teamId,
      teamName: teamName || `${email.split('@')[0]}'s Team`,
      role: 'admin',
      createdAt: now,
    },
  }));

  return { teamId, teamName: teamName || `${email.split('@')[0]}'s Team` };
}

// ─── Invite a member ──────────────────────────────────────────────────────────
async function inviteMember(teamId, adminUserId, inviteEmail) {
  // Verify team exists and user is admin
  const teamInfo = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `TEAM#${teamId}`, SK: 'INFO' },
  }));
  if (!teamInfo.Item) return err(404, 'TEAM_NOT_FOUND', 'Team not found');
  if (teamInfo.Item.adminUserId !== adminUserId) return err(403, 'NOT_ADMIN', 'Only the team admin can invite members');

  // Check member count
  const members = await getTeamMembers(teamId);
  const invites = await getTeamInvites(teamId);
  if (members.length + invites.length >= teamInfo.Item.maxMembers) {
    return err(400, 'TEAM_FULL', `Team is at max capacity (${teamInfo.Item.maxMembers} members)`);
  }

  // Check if already a member
  if (members.some((m) => m.email === inviteEmail)) {
    return err(400, 'ALREADY_MEMBER', 'This person is already on your team');
  }

  // Check if already invited
  if (invites.some((i) => i.email === inviteEmail && i.status === 'pending')) {
    return err(400, 'ALREADY_INVITED', 'This person already has a pending invite');
  }

  const inviteId = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Create invite record
  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `TEAM#${teamId}`,
      SK: `INVITE#${inviteId}`,
      inviteId,
      email: inviteEmail,
      status: 'pending',
      invitedBy: adminUserId,
      createdAt: now,
      expiresAt,
    },
  }));

  // Send invite email
  try {
    await sendEmail(inviteEmail, `🦅 You've been invited to join a team on HawkEye-Cue!`, `You've been invited to join "${teamInfo.Item.teamName}" on HawkEye-Cue!\n\nSign up or log in at https://hawkeyecue.com to accept the invite.\n\nYour invite code: ${inviteId}\n\n— HawkEye-Cue`);
  } catch (e) {
    console.error('Failed to send invite email:', e.message);
  }

  return ok({ inviteId, email: inviteEmail, status: 'pending' });
}

// ─── Accept invite ────────────────────────────────────────────────────────────
async function acceptInvite(userId, inviteId) {
  // Check if user already belongs to a team
  const existingTeam = await getUserTeam(userId);
  if (existingTeam) {
    return err(400, 'ALREADY_IN_TEAM', 'You are already part of a team. Leave your current team first.');
  }

  // Get user profile
  const profile = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
  }));
  const userEmail = profile.Item?.email || '';

  // Find the invite by scanning teams (in production, use a GSI)
  let invite = null;
  let teamId = null;
  let lastKey = undefined;

  do {
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'inviteId = :iid AND #status = :s',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':iid': inviteId, ':s': 'pending' },
      ExclusiveStartKey: lastKey,
    }));
    const found = (result.Items || [])[0];
    if (found) {
      invite = found;
      teamId = found.PK.replace('TEAM#', '');
      break;
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  if (!invite) return err(404, 'INVITE_NOT_FOUND', 'Invite not found or already accepted');

  // Check invite expiration (7-day TTL)
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return err(410, 'INVITE_EXPIRED', 'This invite has expired. Ask your team admin for a new one.');
  }

  // Verify email matches (case-insensitive)
  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    return err(403, 'EMAIL_MISMATCH', 'This invite was sent to a different email address');
  }

  const now = new Date().toISOString();

  // Add user as team member
  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `TEAM#${teamId}`,
      SK: `MEMBER#${userId}`,
      userId,
      email: userEmail,
      role: 'member',
      joinedAt: now,
    },
  }));

  // Mark user as team member on their profile
  const teamInfo = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `TEAM#${teamId}`, SK: 'INFO' },
  }));

  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${userId}`,
      SK: 'TEAM_MEMBER',
      teamId,
      teamName: teamInfo.Item?.teamName || 'Team',
      role: 'member',
      joinedAt: now,
    },
  }));

  // Update invite status
  await dynamo.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `TEAM#${teamId}`, SK: `INVITE#${inviteId}` },
    UpdateExpression: 'SET #status = :s, acceptedBy = :u, acceptedAt = :t',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':s': 'accepted', ':u': userId, ':t': now },
  }));

  // Upgrade member's subscription tier to team
  await dynamo.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
    UpdateExpression: 'SET subscriptionTier = :t, subscriptionStatus = :s',
    ExpressionAttributeValues: { ':t': 'team', ':s': 'active' },
  }));

  return ok({ teamId, teamName: teamInfo.Item?.teamName, role: 'member' });
}

// ─── Remove member ────────────────────────────────────────────────────────────
async function removeMember(teamId, adminUserId, memberUserId) {
  const teamInfo = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `TEAM#${teamId}`, SK: 'INFO' },
  }));
  if (!teamInfo.Item) return err(404, 'TEAM_NOT_FOUND', 'Team not found');
  if (teamInfo.Item.adminUserId !== adminUserId) return err(403, 'NOT_ADMIN', 'Only the team admin can remove members');
  if (memberUserId === adminUserId) return err(400, 'CANNOT_REMOVE_SELF', 'Admin cannot remove themselves');

  // Remove from team
  await dynamo.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: `TEAM#${teamId}`, SK: `MEMBER#${memberUserId}` },
  }));

  // Remove team membership from user
  await dynamo.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${memberUserId}`, SK: 'TEAM_MEMBER' },
  }));

  // Downgrade member back to free
  await dynamo.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${memberUserId}`, SK: 'PROFILE' },
    UpdateExpression: 'SET subscriptionTier = :t, subscriptionStatus = :s',
    ExpressionAttributeValues: { ':t': 'free', ':s': 'none' },
  }));

  return ok({ removed: memberUserId });
}

// ─── Update team name ─────────────────────────────────────────────────────────
async function updateTeamName(teamId, adminUserId, newName) {
  const teamInfo = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `TEAM#${teamId}`, SK: 'INFO' },
  }));
  if (!teamInfo.Item) return err(404, 'TEAM_NOT_FOUND', 'Team not found');
  if (teamInfo.Item.adminUserId !== adminUserId) return err(403, 'NOT_ADMIN', 'Only the team admin can rename the team');

  await dynamo.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `TEAM#${teamId}`, SK: 'INFO' },
    UpdateExpression: 'SET teamName = :n',
    ExpressionAttributeValues: { ':n': newName },
  }));

  // Also update the admin's TEAM_ADMIN record
  await dynamo.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${adminUserId}`, SK: 'TEAM_ADMIN' },
    UpdateExpression: 'SET teamName = :n',
    ExpressionAttributeValues: { ':n': newName },
  }));

  return ok({ teamName: newName });
}

// ─── Get team stats (admin only — sees all members' deals) ───────────────────
async function getTeamStats(teamId, adminUserId) {
  const teamInfo = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `TEAM#${teamId}`, SK: 'INFO' },
  }));
  if (!teamInfo.Item) return err(404, 'TEAM_NOT_FOUND', 'Team not found');
  if (teamInfo.Item.adminUserId !== adminUserId) return err(403, 'NOT_ADMIN', 'Only team admin can view team stats');

  const members = await getTeamMembers(teamId);
  const memberStats = [];

  for (const member of members) {
    const deals = await dynamo.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${member.userId}`, ':sk': 'DEAL#' },
    }));
    const items = deals.Items || [];
    const wonDeals = items.filter((d) => d.stage === 'won');
    memberStats.push({
      userId: member.userId,
      email: member.email,
      role: member.role,
      totalDeals: items.length,
      wonDeals: wonDeals.length,
      wonValue: wonDeals.reduce((sum, d) => sum + (d.dealValue || 0), 0),
      activeDeals: items.filter((d) => !['won', 'lost'].includes(d.stage)).length,
    });
  }

  // Sort by won value descending
  memberStats.sort((a, b) => b.wonValue - a.wonValue);

  const totalWonValue = memberStats.reduce((sum, m) => sum + m.wonValue, 0);
  const totalDeals = memberStats.reduce((sum, m) => sum + m.totalDeals, 0);

  return ok({ teamName: teamInfo.Item.teamName, members: memberStats, totalWonValue, totalDeals });
}

// ─── Handler ──────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);
    if (!userId) return err(401, 'UNAUTHORIZED', 'Missing user identity');

    // GET /team — get current user's team info + members
    if (method === 'GET' && path === '/team') {
      const teamRecord = await getUserTeam(userId);
      if (!teamRecord) return ok({ team: null });

      const members = await getTeamMembers(teamRecord.teamId);
      const invites = await getTeamInvites(teamRecord.teamId);

      // Get team info
      const teamInfo = await dynamo.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `TEAM#${teamRecord.teamId}`, SK: 'INFO' },
      }));

      return ok({
        team: {
          teamId: teamRecord.teamId,
          teamName: teamInfo.Item?.teamName || 'My Team',
          role: teamRecord.role,
          maxMembers: teamInfo.Item?.maxMembers || 5,
          members: members.map((m) => ({ userId: m.userId, email: m.email, role: m.role, joinedAt: m.joinedAt })),
          invites: invites.filter((i) => i.status === 'pending').map((i) => ({ inviteId: i.inviteId, email: i.email, createdAt: i.createdAt })),
        },
      });
    }

    // POST /team — create a team (for users who just subscribed to team tier)
    if (method === 'POST' && path === '/team') {
      const existing = await getUserTeam(userId);
      if (existing) return err(400, 'ALREADY_HAS_TEAM', 'You already have a team');

      // Verify user has team subscription
      const profile = await dynamo.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      }));
      if (profile.Item?.subscriptionTier !== 'team') {
        return err(403, 'NOT_TEAM_TIER', 'You need a Team subscription to create a team. Upgrade in Settings.');
      }

      const body = event.body ? JSON.parse(event.body) : {};
      const trimmedName = (body.teamName || '').trim();
      if (!trimmedName || trimmedName.length < 3 || trimmedName.length > 50) {
        return err(400, 'INVALID_TEAM_NAME', 'Team name must be between 3 and 50 characters');
      }

      const result = await createTeam(userId, trimmedName);
      return ok({ team: result });
    }

    // POST /team/invite — invite a member (admin only)
    if (method === 'POST' && path === '/team/invite') {
      const teamRecord = await getUserTeam(userId);
      if (!teamRecord || teamRecord.role !== 'admin') return err(403, 'NOT_ADMIN', 'Only team admin can invite');

      const body = event.body ? JSON.parse(event.body) : {};
      if (!body.email) return err(400, 'INVALID_INPUT', 'Email is required');

      return inviteMember(teamRecord.teamId, userId, body.email.trim().toLowerCase());
    }

    // POST /team/accept — accept an invite
    if (method === 'POST' && path === '/team/accept') {
      const body = event.body ? JSON.parse(event.body) : {};
      if (!body.inviteId) return err(400, 'INVALID_INPUT', 'inviteId is required');

      return acceptInvite(userId, body.inviteId);
    }

    // DELETE /team/members/{memberId} — remove a member (admin only)
    const memberMatch = path.match(/^\/team\/members\/([^/]+)$/);
    if (method === 'DELETE' && memberMatch) {
      const teamRecord = await getUserTeam(userId);
      if (!teamRecord || teamRecord.role !== 'admin') return err(403, 'NOT_ADMIN', 'Only team admin can remove members');

      return removeMember(teamRecord.teamId, userId, memberMatch[1]);
    }

    // PUT /team/name — rename the team
    if (method === 'PUT' && path === '/team/name') {
      const teamRecord = await getUserTeam(userId);
      if (!teamRecord || teamRecord.role !== 'admin') return err(403, 'NOT_ADMIN', 'Only team admin can rename');

      const body = event.body ? JSON.parse(event.body) : {};
      const trimmedName = (body.teamName || '').trim();
      if (!trimmedName || trimmedName.length < 3 || trimmedName.length > 50) {
        return err(400, 'INVALID_TEAM_NAME', 'Team name must be between 3 and 50 characters');
      }

      return updateTeamName(teamRecord.teamId, userId, trimmedName);
    }

    // GET /team/stats — team performance dashboard (admin only)
    if (method === 'GET' && path === '/team/stats') {
      const teamRecord = await getUserTeam(userId);
      if (!teamRecord || teamRecord.role !== 'admin') return err(403, 'NOT_ADMIN', 'Only team admin can view stats');

      return getTeamStats(teamRecord.teamId, userId);
    }

    // POST /team/leave — leave the current team
    if (method === 'POST' && path === '/team/leave') {
      const teamRecord = await getUserTeam(userId);
      if (!teamRecord) return err(400, 'NO_TEAM', 'You are not in a team');

      const members = await getTeamMembers(teamRecord.teamId);

      // Remove the member from the team
      await dynamo.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `TEAM#${teamRecord.teamId}`, SK: `MEMBER#${userId}` },
      }));

      // Remove team record from user
      const skToDelete = teamRecord.role === 'admin' ? 'TEAM_ADMIN' : 'TEAM_MEMBER';
      await dynamo.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: skToDelete },
      }));

      // Downgrade subscription
      await dynamo.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
        UpdateExpression: 'SET subscriptionTier = :t, subscriptionStatus = :s',
        ExpressionAttributeValues: { ':t': 'free', ':s': 'none' },
      }));

      // If admin left and others remain, transfer admin role
      if (teamRecord.role === 'admin' && members.length > 1) {
        const remaining = members.filter((m) => m.userId !== userId).sort((a, b) => (a.joinedAt || '').localeCompare(b.joinedAt || '') || (a.email || '').localeCompare(b.email || ''));
        const newAdmin = remaining[0];
        if (newAdmin) {
          // Update team info
          await dynamo.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `TEAM#${teamRecord.teamId}`, SK: 'INFO' },
            UpdateExpression: 'SET adminUserId = :u, adminEmail = :e',
            ExpressionAttributeValues: { ':u': newAdmin.userId, ':e': newAdmin.email },
          }));
          // Update member record to admin
          await dynamo.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `TEAM#${teamRecord.teamId}`, SK: `MEMBER#${newAdmin.userId}` },
            UpdateExpression: 'SET #role = :r',
            ExpressionAttributeNames: { '#role': 'role' },
            ExpressionAttributeValues: { ':r': 'admin' },
          }));
          // Move user record from TEAM_MEMBER to TEAM_ADMIN
          await dynamo.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${newAdmin.userId}`, SK: 'TEAM_MEMBER' },
          }));
          const teamInfo = await dynamo.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `TEAM#${teamRecord.teamId}`, SK: 'INFO' },
          }));
          await dynamo.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: `USER#${newAdmin.userId}`,
              SK: 'TEAM_ADMIN',
              teamId: teamRecord.teamId,
              teamName: teamInfo.Item?.teamName || 'Team',
              role: 'admin',
              createdAt: new Date().toISOString(),
            },
          }));
        }
      }

      // If last member, delete the team
      if (members.length <= 1) {
        await dynamo.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { PK: `TEAM#${teamRecord.teamId}`, SK: 'INFO' },
        }));
      }

      return ok({ left: true });
    }

    // GET /team/calendar — shared team calendar events
    if (method === 'GET' && path === '/team/calendar') {
      const teamRecord = await getUserTeam(userId);
      if (!teamRecord) return err(403, 'NO_TEAM', 'You are not in a team');

      const members = await getTeamMembers(teamRecord.teamId);
      const params = event.queryStringParameters || {};
      const start = params.start || new Date().toISOString().split('T')[0];
      const end = params.end || (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();

      const allEvents = [];
      for (const member of members) {
        const result = await dynamo.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': `USER#${member.userId}`, ':sk': 'CAL#' },
        }));
        const memberEvents = (result.Items || [])
          .filter((e) => (e.eventDate || e.date || '') >= start && (e.eventDate || e.date || '') <= end)
          .map((e) => ({
            id: e.eventId || e.SK.replace('CAL#', '').split('#').pop() || e.SK,
            title: e.title || 'Untitled',
            date: e.eventDate || e.date || '',
            type: e.eventType || e.type || 'post',
            memberEmail: member.email,
            memberName: member.email.split('@')[0],
            startTime: e.startTime || null,
            endTime: e.endTime || null,
          }));
        allEvents.push(...memberEvents);
      }

      // Sort by date then time
      allEvents.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));

      return ok({ events: allEvents });
    }

    // GET /team/leads — combined lead pool from all team members
    if (method === 'GET' && path === '/team/leads') {
      const teamRecord = await getUserTeam(userId);
      if (!teamRecord) return err(403, 'NO_TEAM', 'You are not in a team');

      const members = await getTeamMembers(teamRecord.teamId);
      const params = event.queryStringParameters || {};
      const limit = Math.min(parseInt(params.limit) || 25, 25);
      const cursor = params.cursor ? JSON.parse(Buffer.from(params.cursor, 'base64').toString()) : null;
      const allLeads = [];

      for (const member of members) {
        const result = await dynamo.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': `USER#${member.userId}`, ':sk': 'OPP#' },
        }));
        const memberLeads = (result.Items || []).map((l) => ({
          id: l.opportunityId || l.SK.replace('OPP#', '').split('#').pop() || l.SK,
          name: l.name || l.authorName || l.sourceAuthor || 'Unknown Lead',
          sourcePlatform: l.sourcePlatform || l.platform || 'unknown',
          status: l.status || 'new',
          createdAt: l.createdAt || l.detectedAt || '',
          addedBy: member.email.split('@')[0],
          addedByEmail: member.email,
          policyType: l.policyType || null,
        }));
        allLeads.push(...memberLeads);
      }

      // Sort by createdAt descending
      allLeads.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      // Apply cursor-based pagination
      let startIndex = 0;
      if (cursor && cursor.createdAt && cursor.id) {
        startIndex = allLeads.findIndex((l) => l.createdAt === cursor.createdAt && l.id === cursor.id);
        if (startIndex === -1) startIndex = 0;
        else startIndex += 1; // Start after the cursor
      }

      const page = allLeads.slice(startIndex, startIndex + limit);
      const hasMore = startIndex + limit < allLeads.length;
      const nextCursor = hasMore ? Buffer.from(JSON.stringify({ createdAt: page[page.length - 1].createdAt, id: page[page.length - 1].id })).toString('base64') : undefined;

      return ok({ leads: page, nextCursor });
    }

    // GET /team/analytics — merged team analytics
    if (method === 'GET' && path === '/team/analytics') {
      const teamRecord = await getUserTeam(userId);
      if (!teamRecord) return err(403, 'NO_TEAM', 'You are not in a team');

      const members = await getTeamMembers(teamRecord.teamId);
      const memberAnalytics = [];
      let totalDeals = 0, wonDeals = 0, totalRevenue = 0;
      let totalFlockScheduled = 0, totalFlockCompleted = 0;

      for (const member of members) {
        // Get deals
        const dealsResult = await dynamo.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': `USER#${member.userId}`, ':sk': 'DEAL#' },
        }));
        const deals = dealsResult.Items || [];
        const won = deals.filter((d) => d.stage === 'won');
        const memberRevenue = won.reduce((sum, d) => sum + (d.dealValue || 0), 0);

        totalDeals += deals.length;
        wonDeals += won.length;
        totalRevenue += memberRevenue;

        // Get flock/calendar posts for completion rate
        const calResult = await dynamo.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': `USER#${member.userId}`, ':sk': 'CAL#' },
        }));
        const calEvents = (calResult.Items || []).filter((e) => e.type === 'post');
        const today = new Date().toISOString().split('T')[0];
        const pastPosts = calEvents.filter((e) => e.date < today);
        const completedPosts = pastPosts.filter((e) => e.completed);

        totalFlockScheduled += pastPosts.length;
        totalFlockCompleted += completedPosts.length;

        const memberFlockRate = pastPosts.length > 0 ? Math.round((completedPosts.length / pastPosts.length) * 100) : 0;

        memberAnalytics.push({
          email: member.email,
          deals: deals.length,
          wonDeals: won.length,
          revenue: memberRevenue,
          flockRate: memberFlockRate,
        });
      }

      const flockCompletionRate = totalFlockScheduled > 0 ? Math.round((totalFlockCompleted / totalFlockScheduled) * 100) : 0;

      return ok({
        totalDeals,
        wonDeals,
        totalRevenue,
        flockCompletionRate,
        members: memberAnalytics,
      });
    }

    // GET /team/notifications — deal close notifications from teammates
    if (method === 'GET' && path === '/team/notifications') {
      const teamRecord = await getUserTeam(userId);
      if (!teamRecord) return err(403, 'NO_TEAM', 'You are not in a team');

      // Get notifications for this user
      const result = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'TEAM_NOTIF#' },
      }));

      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const notifications = (result.Items || [])
        .filter((n) => n.createdAt >= cutoff && !n.dismissed)
        .map((n) => ({
          id: n.notifId || n.SK.replace('TEAM_NOTIF#', ''),
          memberEmail: n.memberEmail,
          memberName: n.memberName || n.memberEmail?.split('@')[0] || 'Teammate',
          dealName: n.dealName || 'Deal',
          dealValue: n.dealValue || 0,
          closedAt: n.createdAt,
          dismissed: n.dismissed || false,
        }))
        .sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || ''));

      return ok({ notifications });
    }

    // POST /team/notifications/{id}/dismiss — dismiss a notification
    const dismissMatch = path.match(/^\/team\/notifications\/([^/]+)\/dismiss$/);
    if (method === 'POST' && dismissMatch) {
      const notifId = dismissMatch[1];
      await dynamo.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `TEAM_NOTIF#${notifId}` },
        UpdateExpression: 'SET dismissed = :d',
        ExpressionAttributeValues: { ':d': true },
      }));
      return ok({ dismissed: true });
    }

    return err(404, 'NOT_FOUND', `No route for ${method} ${path}`);
  } catch (e) {
    console.error('team-handler error:', e);
    return err(500, 'INTERNAL_ERROR', e.message || 'An unexpected error occurred');
  }
};
