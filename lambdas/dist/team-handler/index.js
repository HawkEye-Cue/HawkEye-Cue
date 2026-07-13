'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, GetCommand, UpdateCommand, DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { randomUUID } = require('crypto');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({ region: 'us-east-1' });
const TABLE_NAME = process.env.TABLE_NAME;
const ADMIN_EMAIL = 'notifications@hawkeyecue.com';

function ok(body) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function err(status, code, message) { return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: { code, message } }) }; }
function getUserId(event) { return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null; }

// ─── Get user's team info ─────────────────────────────────────────────────────
async function getUserTeam(userId) {
  // Check if user is a team admin (owns a team)
  const adminResult = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK = :sk',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'TEAM_ADMIN' },
  }));
  if ((adminResult.Items || []).length > 0) {
    return { ...adminResult.Items[0], role: 'admin' };
  }

  // Check if user is a team member
  const memberResult = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK = :sk',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'TEAM_MEMBER' },
  }));
  if ((memberResult.Items || []).length > 0) {
    return { ...memberResult.Items[0], role: 'member' };
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

  const inviteId = randomUUID();
  const now = new Date().toISOString();

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
    },
  }));

  // Send invite email
  try {
    await ses.send(new SendEmailCommand({
      Source: ADMIN_EMAIL,
      Destination: { ToAddresses: [inviteEmail] },
      Message: {
        Subject: { Data: `🦅 You've been invited to join a team on HawkEye-Cue!` },
        Body: {
          Text: { Data: `You've been invited to join "${teamInfo.Item.teamName}" on HawkEye-Cue!\n\nSign up or log in at https://hawkeyecue.com to accept the invite.\n\nYour invite code: ${inviteId}\n\n— HawkEye-Cue` },
        },
      },
    }));
  } catch (e) {
    console.error('Failed to send invite email:', e.message);
  }

  return ok({ inviteId, email: inviteEmail, status: 'pending' });
}

// ─── Accept invite ────────────────────────────────────────────────────────────
async function acceptInvite(userId, inviteId) {
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

      const body = event.body ? JSON.parse(event.body) : {};
      const result = await createTeam(userId, body.teamName);
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
      if (!body.teamName) return err(400, 'INVALID_INPUT', 'teamName is required');

      return updateTeamName(teamRecord.teamId, userId, body.teamName.trim());
    }

    // GET /team/stats — team performance dashboard (admin only)
    if (method === 'GET' && path === '/team/stats') {
      const teamRecord = await getUserTeam(userId);
      if (!teamRecord || teamRecord.role !== 'admin') return err(403, 'NOT_ADMIN', 'Only team admin can view stats');

      return getTeamStats(teamRecord.teamId, userId);
    }

    return err(404, 'NOT_FOUND', `No route for ${method} ${path}`);
  } catch (e) {
    console.error('team-handler error:', e);
    return err(500, 'INTERNAL_ERROR', e.message || 'An unexpected error occurred');
  }
};
