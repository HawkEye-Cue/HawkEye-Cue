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

  // Safety-net profile creation must mirror the canonical signup path
  // (auth-post-confirmation): a brand-new account gets a one-time 7-day Soar trial.
  // This path only runs when NO profile exists yet (getUser returned null) and writes
  // with attribute_not_exists(PK), so it can never re-grant a trial to an existing
  // account or downgrade a paid subscriber — the conditional write loses the race and
  // we re-read the authoritative profile below.
  const newProfile = {
    PK: `USER#${userId}`,
    SK: 'PROFILE',
    userId,
    email,
    createdAt: now,
    subscriptionTier: 'soar',
    subscriptionStatus: 'trial',
    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    aiGenerationsUsed: 0,
    selectedTradeId: null,
  };

  try {
    await dynamo.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: newProfile,
      ConditionExpression: 'attribute_not_exists(PK)',
    }));
    return newProfile;
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      // A profile was created concurrently (likely by auth-post-confirmation). Return
      // the authoritative stored profile rather than our would-be new one.
      const existing = await getUser(userId);
      if (existing) return existing;
    }
    // Any other error: fall back to returning the intended profile shape.
    return newProfile;
  }
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
  const baseUrl = origin || 'https://hawkeyecue.com';
  const redirectUrl = `${baseUrl}/settings?social=connected`;

  console.log(`[Connect] User ${userId}, teamId=${teamId}, platforms=${platforms.join(',')}, redirect=${redirectUrl}`);

  const result = await bundleApiCall('POST', '/social-account/create-portal-link', {
    teamId,
    socialAccountTypes: platforms,
    redirectUrl,
    expiresIn: 30, // 30 minutes
    language: 'en',
  });

  console.log(`[Connect] Portal link created: ${result.url ? 'OK' : 'MISSING URL'}`);

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
