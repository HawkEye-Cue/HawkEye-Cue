'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
  ScanCommand,
  DeleteCommand,
  GetCommand,
} = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityProviderClient, AdminDeleteUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});
const secretsClient = new SecretsManagerClient({});
const TABLE_NAME = process.env.TABLE_NAME;
const USER_POOL_ID = process.env.USER_POOL_ID || 'us-east-1_33Q0cOjOf';

// ─── Stripe helper (lazy-loaded) ──────────────────────────────────────────────
let stripeInstance = null;
async function getStripe() {
  if (stripeInstance) return stripeInstance;
  try {
    const result = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: 'SocialLeadGen/Stripe' })
    );
    const secret = JSON.parse(result.SecretString);
    const Stripe = require('stripe');
    stripeInstance = new Stripe(secret.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    return stripeInstance;
  } catch (e) {
    console.error('Failed to load Stripe:', e);
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function getUserId(event) {
  return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// GET /trade/list — returns all available trades
async function handleListTrades() {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': 'SYSTEM',
        ':sk': 'TRADE#',
      },
    })
  );

  const trades = (result.Items || []).map((item) => ({
    id: item.tradeId,
    name: item.tradeName,
    category: item.category,
  }));

  return respond(200, { trades });
}

// PUT /trade/select — user selects their trade(s)
async function handleSelectTrade(userId, body) {
  const { tradeId, tradeIds } = body || {};

  // Support both single tradeId (backward compat) and array of tradeIds
  const ids = tradeIds || (tradeId ? [tradeId] : []);

  if (!Array.isArray(ids) || ids.length === 0) {
    return respond(400, { error: { code: 'VALIDATION_ERROR', message: 'tradeId or tradeIds is required' } });
  }

  // Validate all IDs
  for (const id of ids) {
    if (typeof id !== 'string' || id.length < 1 || id.length > 100) {
      return respond(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid tradeId' } });
    }
  }

  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      UpdateExpression: 'SET selectedTradeId = :tid, selectedTradeIds = :tids',
      ExpressionAttributeValues: { ':tid': ids[0], ':tids': ids },
      ConditionExpression: 'attribute_exists(PK)',
    })
  );

  return respond(200, { tradeId: ids[0], tradeIds: ids });
}

// PUT /profile/mfa — update MFA delivery preference
async function handleUpdateMfa(userId, body) {
  const { mfaMethod } = body || {};

  if (!['email', 'sms'].includes(mfaMethod)) {
    return respond(400, { error: { code: 'VALIDATION_ERROR', message: 'mfaMethod must be "email" or "sms"' } });
  }

  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      UpdateExpression: 'SET mfaMethod = :m',
      ExpressionAttributeValues: { ':m': mfaMethod },
      ConditionExpression: 'attribute_exists(PK)',
    })
  );

  return respond(200, { mfaMethod });
}

// GET /profile — get user profile info
async function handleGetProfile(userId) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'PROFILE',
      },
    })
  );

  const item = (result.Items || [])[0];
  if (!item) return respond(404, { error: { code: 'NOT_FOUND', message: 'Profile not found' } });

  return respond(200, {
    email: item.email,
    mfaMethod: item.mfaMethod || 'email',
    selectedTradeId: item.selectedTradeId || null,
    selectedTradeIds: item.selectedTradeIds || (item.selectedTradeId ? [item.selectedTradeId] : []),
    preferences: item.preferences || {},
  });
}

// GET /profile/preferences
async function handleGetPreferences(userId) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'PROFILE' },
    })
  );
  const item = (result.Items || [])[0];
  return respond(200, item?.preferences || {});
}

// PUT /profile/preferences
async function handleUpdatePreferences(userId, body) {
  // Merge incoming preferences with existing ones
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'PROFILE' },
    })
  );
  const item = (result.Items || [])[0];
  const existing = item?.preferences || {};
  const merged = { ...existing, ...body };

  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      UpdateExpression: 'SET preferences = :p',
      ExpressionAttributeValues: { ':p': merged },
    })
  );

  return respond(200, merged);
}
}

// DELETE /profile/delete — permanently delete user account
async function handleDeleteAccount(userId, event) {
  const email = event.requestContext?.authorizer?.jwt?.claims?.email ?? '';

  // 1. Cancel Stripe subscription if active
  try {
    const profileResult = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      })
    );
    const profile = profileResult.Item;
    if (profile && profile.stripeSubscriptionId) {
      const stripe = await getStripe();
      if (stripe) {
        await stripe.subscriptions.cancel(profile.stripeSubscriptionId);
        console.log(`Cancelled Stripe subscription ${profile.stripeSubscriptionId} for user ${userId}`);
      }
    }
  } catch (e) {
    console.error('Failed to cancel Stripe subscription:', e);
    // Continue with deletion even if Stripe cancel fails
  }

  // 2. Delete all user data from DynamoDB (PK = USER#<userId>)
  try {
    const result = await dynamo.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}` },
      })
    );

    // Delete all items belonging to this user
    for (const item of (result.Items || [])) {
      await dynamo.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: item.PK, SK: item.SK },
      }));
    }
  } catch (e) {
    console.error('Failed to delete user data:', e);
  }

  // 3. Delete user's network posts (stored under region partition keys)
  try {
    const networkResult = await dynamo.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': `NETUSER#${userId}` },
      })
    );

    for (const item of (networkResult.Items || [])) {
      await dynamo.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: item.PK, SK: item.SK },
      }));
    }
  } catch (e) {
    console.error('Failed to delete network posts:', e);
    // Non-critical — continue
  }

  // 4. Delete from Cognito
  try {
    await cognito.send(new AdminDeleteUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: userId,
    }));
  } catch (e) {
    console.error('Failed to delete Cognito user:', e);
    // Still return success — data is gone even if Cognito fails
  }

  return respond(200, { message: 'Account deleted' });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);

    if (!userId) return respond(401, { error: { code: 'UNAUTHORIZED', message: 'Missing user identity' } });

    if (method === 'GET' && path === '/trade/list') {
      return handleListTrades();
    }

    if (method === 'PUT' && path === '/trade/select') {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleSelectTrade(userId, body);
    }

    if (method === 'GET' && path === '/profile') {
      return handleGetProfile(userId);
    }

    if (method === 'GET' && path === '/profile/preferences') {
      return handleGetPreferences(userId);
    }

    if (method === 'PUT' && path === '/profile/preferences') {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleUpdatePreferences(userId, body);
    }

    if (method === 'PUT' && path === '/profile/mfa') {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleUpdateMfa(userId, body);
    }

    if (method === 'DELETE' && path === '/profile/delete') {
      return handleDeleteAccount(userId, event);
    }

    return respond(404, { error: { code: 'NOT_FOUND', message: `No route for ${method} ${path}` } });
  } catch (e) {
    console.error('trade-handler error:', e);
    if (e.name === 'ConditionalCheckFailedException') {
      return respond(404, { error: { code: 'USER_NOT_FOUND', message: 'User profile not found' } });
    }
    return respond(500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
};
