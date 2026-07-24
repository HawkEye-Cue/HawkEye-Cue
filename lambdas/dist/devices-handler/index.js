'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { SNSClient, CreatePlatformEndpointCommand, DeleteEndpointCommand } = require('@aws-sdk/client-sns');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});
const TABLE_NAME = process.env.TABLE_NAME;
const SNS_IOS_PLATFORM_ARN = process.env.SNS_IOS_PLATFORM_ARN;
const SNS_ANDROID_PLATFORM_ARN = process.env.SNS_ANDROID_PLATFORM_ARN;

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

const VALID_PLATFORMS = ['ios', 'android'];

// ─── Route handlers ───────────────────────────────────────────────────────────

// POST /devices/register
async function handleRegister(userId, body) {
  const { platform, pushToken } = body || {};

  if (!VALID_PLATFORMS.includes(platform)) {
    return respond(400, { error: { code: 'VALIDATION_ERROR', message: `platform must be one of: ${VALID_PLATFORMS.join(', ')}` } });
  }
  if (typeof pushToken !== 'string' || pushToken.length < 1) {
    return respond(400, { error: { code: 'VALIDATION_ERROR', message: 'pushToken is required' } });
  }

  // Create SNS platform endpoint
  const platformArn = platform === 'ios' ? SNS_IOS_PLATFORM_ARN : SNS_ANDROID_PLATFORM_ARN;
  let endpointArn = null;

  if (platformArn && platformArn !== 'PLACEHOLDER') {
    try {
      const result = await sns.send(
        new CreatePlatformEndpointCommand({
          PlatformApplicationArn: platformArn,
          Token: pushToken,
        })
      );
      endpointArn = result.EndpointArn;
    } catch (e) {
      console.error('Failed to create SNS endpoint:', e);
    }
  }

  const deviceId = `${platform}-${Buffer.from(pushToken).toString('base64url').substring(0, 20)}`;
  const now = new Date().toISOString();

  await dynamo.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `DEVICE#${deviceId}`,
        deviceId,
        platform,
        pushToken,
        endpointArn,
        registeredAt: now,
        preferences: {
          opportunitiesEnabled: true,
          scheduledPostReminders: true,
          dailyCueReminders: true,
          marketingEnabled: false,
        },
      },
    })
  );

  return respond(201, { deviceId, platform, endpointArn });
}

// GET /devices
async function handleListDevices(userId) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'DEVICE#',
      },
    })
  );

  const devices = (result.Items || []).map((item) => ({
    deviceId: item.deviceId,
    platform: item.platform,
    registeredAt: item.registeredAt,
    preferences: item.preferences,
  }));

  return respond(200, { devices });
}

// DELETE /devices/{deviceId}
async function handleUnregister(userId, deviceId) {
  if (typeof deviceId !== 'string' || deviceId.length < 1) {
    return respond(400, { error: { code: 'VALIDATION_ERROR', message: 'deviceId is required' } });
  }

  // Get the device to find the SNS endpoint ARN
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': `DEVICE#${deviceId}`,
      },
    })
  );

  const item = (result.Items || [])[0];
  if (!item) return respond(404, { error: { code: 'NOT_FOUND', message: 'Device not found' } });

  // Delete SNS endpoint
  if (item.endpointArn) {
    try {
      await sns.send(new DeleteEndpointCommand({ EndpointArn: item.endpointArn }));
    } catch (e) {
      console.error('Failed to delete SNS endpoint:', e);
    }
  }

  await dynamo.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: `USER#${userId}`, SK: `DEVICE#${deviceId}` } })
  );

  return respond(200, { deleted: true });
}

// PUT /devices/{deviceId}/preferences
async function handleUpdatePreferences(userId, deviceId, body) {
  const prefs = body || {};

  // Validate preferences
  const validKeys = ['opportunitiesEnabled', 'scheduledPostReminders', 'dailyCueReminders', 'marketingEnabled'];
  const updates = {};
  for (const key of validKeys) {
    if (key in prefs) {
      if (typeof prefs[key] !== 'boolean') {
        return respond(400, { error: { code: 'VALIDATION_ERROR', message: `${key} must be a boolean` } });
      }
      updates[key] = prefs[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return respond(400, { error: { code: 'NO_UPDATES', message: 'No valid preference fields provided' } });
  }

  const expressions = Object.keys(updates).map((k) => `preferences.#${k} = :${k}`);
  const names = {};
  const values = {};
  for (const [k, v] of Object.entries(updates)) {
    names[`#${k}`] = k;
    values[`:${k}`] = v;
  }

  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `DEVICE#${deviceId}` },
      UpdateExpression: `SET ${expressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(PK)',
    })
  );

  return respond(200, { deviceId, preferences: updates });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);

    if (!userId) return respond(401, { error: { code: 'UNAUTHORIZED', message: 'Missing user identity' } });

    if (method === 'POST' && path === '/devices/register') {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleRegister(userId, body);
    }

    if (method === 'GET' && path === '/devices') {
      return handleListDevices(userId);
    }

    // DELETE /devices/{deviceId}
    const deleteMatch = path.match(/^\/devices\/([^/]+)$/);
    if (method === 'DELETE' && deleteMatch) {
      return handleUnregister(userId, deleteMatch[1]);
    }

    // PUT /devices/{deviceId}/preferences
    const prefsMatch = path.match(/^\/devices\/([^/]+)\/preferences$/);
    if (method === 'PUT' && prefsMatch) {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleUpdatePreferences(userId, prefsMatch[1], body);
    }

    return respond(404, { error: { code: 'NOT_FOUND', message: `No route for ${method} ${path}` } });
  } catch (e) {
    console.error('devices-handler error:', e);
    if (e.name === 'ConditionalCheckFailedException') {
      return respond(404, { error: { code: 'NOT_FOUND', message: 'Device not found' } });
    }
    return respond(500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
};
