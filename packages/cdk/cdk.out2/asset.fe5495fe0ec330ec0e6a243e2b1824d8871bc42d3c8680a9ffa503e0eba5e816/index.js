'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});
const TABLE_NAME = process.env.TABLE_NAME;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function err(status, code, message) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: { code, message } }),
  };
}

function getUserId(event) {
  return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null;
}

let cachedSecret = null;
async function getBundleSocialSecret() {
  if (cachedSecret) return cachedSecret;
  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: 'SocialLeadGen/BundleSocial' })
  );
  cachedSecret = JSON.parse(result.SecretString);
  return cachedSecret;
}

async function getUser(userId) {
  const result = await dynamo.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
    })
  );
  return result.Item ?? null;
}

// Auto-create profile if it doesn't exist (safety net)
async function getOrCreateUser(userId, event) {
  let user = await getUser(userId);
  if (user) return user;

  // Extract email from JWT claims
  const email = event.requestContext?.authorizer?.jwt?.claims?.email ?? '';
  const now = new Date().toISOString();

  const newProfile = {
    PK: `USER#${userId}`,
    SK: 'PROFILE',
    userId,
    email,
    createdAt: now,
    subscriptionTier: 'free',
    subscriptionStatus: 'none',
    aiGenerationsUsed: 0,
    selectedTradeId: null,
  };

  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: newProfile,
    ConditionExpression: 'attribute_not_exists(PK)',
  })).catch(() => {}); // ignore if race condition

  return newProfile;
}

// ─── Bundle.social API helpers ────────────────────────────────────────────────

async function bundleApiCall(method, path, body = null) {
  const { BUNDLE_SOCIAL_API_KEY } = await getBundleSocialSecret();

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': BUNDLE_SOCIAL_API_KEY,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`https://api.bundle.social/api/v1${path}`, options);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(`Bundle.social API error: ${response.status} — ${JSON.stringify(result)}`);
  }

  return result;
}

// Create a Bundle.social team for a user
async function createTeamForUser(userId, email) {
  const result = await bundleApiCall('POST', '/team', {
    name: `User ${email}`,
  });

  const teamId = result.id;

  // Save teamId to user profile
  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      UpdateExpression: 'SET bundleSocialTeamId = :teamId',
      ExpressionAttributeValues: { ':teamId': teamId },
    })
  );

  return teamId;
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

/**
 * GET /social/accounts
 * Returns the list of connected social accounts for the user's team.
 */
async function handleGetAccounts(userId, event) {
  const user = await getOrCreateUser(userId, event);

  const teamId = user.bundleSocialTeamId;
  if (!teamId) {
    // No team yet — return empty list
    return ok({ accounts: [], teamId: null });
  }

  try {
    const result = await bundleApiCall('GET', `/team/${teamId}`);
    // socialAccounts is part of the team response
    const accounts = (result.socialAccounts || []).map((acct) => ({
      id: acct.id,
      type: acct.type, // e.g. FACEBOOK, INSTAGRAM, LINKEDIN
      name: acct.displayName || acct.username || acct.type,
      username: acct.username || null,
      imageUrl: acct.avatarUrl || null,
      connected: true,
    }));

    return ok({ accounts, teamId });
  } catch (e) {
    console.error('Failed to fetch social accounts:', e);
    return ok({ accounts: [], teamId, error: e.message });
  }
}

/**
 * POST /social/connect
 * Creates a hosted connect portal link for the user.
 * Body: { platforms: ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN'] }
 */
async function handleConnect(userId, body, origin, event) {
  const user = await getOrCreateUser(userId, event);

  // Create team if user doesn't have one yet
  let teamId = user.bundleSocialTeamId;
  if (!teamId) {
    teamId = await createTeamForUser(userId, user.email);
  }

  const platforms = body?.platforms || ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN'];
  const baseUrl = origin || 'https://do8mke590kd4p.cloudfront.net';
  const redirectUrl = `${baseUrl}/settings?social=connected`;

  const result = await bundleApiCall('POST', '/social-account/create-portal-link', {
    teamId,
    socialAccountTypes: platforms,
    redirectUrl,
    expiresIn: 30, // 30 minutes
    language: 'en',
  });

  return ok({ connectUrl: result.url });
}

/**
 * DELETE /social/accounts/{id}
 * Disconnects a social account.
 */
async function handleDisconnect(userId, accountId) {
  const user = await getUser(userId);
  if (!user) return err(404, 'USER_NOT_FOUND', 'User not found');

  const teamId = user.bundleSocialTeamId;
  if (!teamId) return err(400, 'NO_TEAM', 'No social accounts connected');

  await bundleApiCall('DELETE', `/social-account/${accountId}?teamId=${teamId}`);

  return ok({ message: 'Account disconnected' });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);

    if (!userId) return err(401, 'UNAUTHORIZED', 'Missing user identity');

    // GET /social/accounts
    if (method === 'GET' && path === '/social/accounts') {
      return handleGetAccounts(userId, event);
    }

    // POST /social/connect
    if (method === 'POST' && path === '/social/connect') {
      const body = event.body ? JSON.parse(event.body) : {};
      const origin = event.headers?.origin ?? event.headers?.Origin ?? null;
      return handleConnect(userId, body, origin, event);
    }

    // DELETE /social/accounts/{id}
    if (method === 'DELETE' && path.startsWith('/social/accounts/')) {
      const accountId = path.split('/social/accounts/')[1];
      return handleDisconnect(userId, accountId);
    }

    return err(404, 'NOT_FOUND', `No route for ${method} ${path}`);
  } catch (e) {
    console.error('social-accounts-handler error:', e);
    return err(500, 'INTERNAL_ERROR', e.message || 'An unexpected error occurred');
  }
};
