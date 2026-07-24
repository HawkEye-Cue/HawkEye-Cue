'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const {
  SchedulerClient,
  CreateScheduleCommand,
  DeleteScheduleCommand,
} = require('@aws-sdk/client-scheduler');
const { randomUUID } = require('crypto');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const scheduler = new SchedulerClient({});
const TABLE_NAME = process.env.TABLE_NAME;
const SCHEDULER_ROLE_ARN = process.env.SCHEDULER_ROLE_ARN;
const PUBLISHER_FUNCTION_ARN = process.env.PUBLISHER_FUNCTION_ARN;

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

const VALID_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'nextdoor'];

function validateScheduleRequest(body) {
  const errors = [];
  if (!body) return ['Request body is required'];

  if (typeof body.contentId !== 'string' || body.contentId.length < 1) {
    errors.push('contentId is required');
  }
  if (typeof body.content !== 'string' || body.content.length < 1) {
    errors.push('Post content is required');
  }
  if (!Array.isArray(body.platforms) || body.platforms.length < 1) {
    errors.push('At least one platform must be selected');
  } else if (body.platforms.some((p) => !VALID_PLATFORMS.includes(p))) {
    errors.push(`platforms must be from: ${VALID_PLATFORMS.join(', ')}`);
  }
  if (typeof body.scheduledAt !== 'string') {
    errors.push('scheduledAt is required');
  } else {
    const date = new Date(body.scheduledAt);
    if (isNaN(date.getTime())) {
      errors.push('scheduledAt must be a valid ISO date string');
    } else if (date.getTime() <= Date.now()) {
      errors.push('scheduledAt must be in the future');
    }
  }
  if (body.mediaUrls !== undefined) {
    if (!Array.isArray(body.mediaUrls)) {
      errors.push('mediaUrls must be an array');
    } else if (body.mediaUrls.some((u) => typeof u !== 'string' || !/^https?:\/\/.+/.test(u))) {
      errors.push('Each mediaUrl must be a valid URL');
    }
  }

  return errors;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// POST /posts/schedule
async function handleSchedulePost(userId, body) {
  const errors = validateScheduleRequest(body);
  if (errors.length > 0) {
    return respond(400, { error: { code: 'VALIDATION_ERROR', message: errors.join('; ') } });
  }

  const postId = randomUUID();
  const now = new Date().toISOString();
  const scheduledAt = new Date(body.scheduledAt).toISOString();

  // Store in DynamoDB
  await dynamo.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `POST#${scheduledAt}#${postId}`,
        postId,
        contentId: body.contentId,
        content: body.content,
        platforms: body.platforms,
        scheduledAt,
        mediaUrls: body.mediaUrls || [],
        status: 'scheduled',
        createdAt: now,
      },
    })
  );

  // Create EventBridge schedule
  const scheduleName = `post-${postId}`;
  try {
    await scheduler.send(
      new CreateScheduleCommand({
        Name: scheduleName,
        ScheduleExpression: `at(${scheduledAt.replace(/\.\d{3}Z$/, '')})`,
        FlexibleTimeWindow: { Mode: 'OFF' },
        Target: {
          Arn: PUBLISHER_FUNCTION_ARN,
          RoleArn: SCHEDULER_ROLE_ARN,
          Input: JSON.stringify({ postId, userId }),
        },
        ActionAfterCompletion: 'DELETE',
      })
    );
  } catch (schedErr) {
    console.error('Failed to create EventBridge schedule:', schedErr);
    // Post is saved but schedule failed — mark it
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `POST#${scheduledAt}#${postId}` },
        UpdateExpression: 'SET #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'failed' },
      })
    );
    return respond(500, { error: { code: 'SCHEDULE_FAILED', message: 'Post saved but scheduling failed' } });
  }

  return respond(201, { id: postId, status: 'scheduled', scheduledAt });
}

// GET /posts
async function handleGetPosts(userId) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'POST#',
      },
      ScanIndexForward: false,
    })
  );

  const posts = (result.Items || []).map((item) => ({
    id: item.postId,
    contentId: item.contentId,
    content: item.content,
    platforms: item.platforms,
    scheduledAt: item.scheduledAt,
    mediaUrls: item.mediaUrls,
    status: item.status,
    createdAt: item.createdAt,
    publishedAt: item.publishedAt,
  }));

  return respond(200, { posts });
}

// DELETE /posts/{id}
async function handleDeletePost(userId, postId) {
  const queryResult = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      FilterExpression: 'postId = :pid',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'POST#',
        ':pid': postId,
      },
    })
  );

  const item = (queryResult.Items || [])[0];
  if (!item) return respond(404, { error: { code: 'NOT_FOUND', message: 'Post not found' } });

  // Delete EventBridge schedule if scheduled
  if (item.status === 'scheduled') {
    try {
      await scheduler.send(new DeleteScheduleCommand({ Name: `post-${postId}` }));
    } catch {
      // Schedule may not exist or already fired
    }
  }

  await dynamo.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: item.PK, SK: item.SK } })
  );

  return respond(200, { deleted: true });
}

// PUT /posts/{id}
async function handleUpdatePost(userId, postId, body) {
  const queryResult = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      FilterExpression: 'postId = :pid',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'POST#',
        ':pid': postId,
      },
    })
  );

  const item = (queryResult.Items || [])[0];
  if (!item) return respond(404, { error: { code: 'NOT_FOUND', message: 'Post not found' } });

  if (item.status !== 'scheduled' && item.status !== 'draft') {
    return respond(400, { error: { code: 'CANNOT_EDIT', message: 'Only scheduled or draft posts can be edited' } });
  }

  const updates = {};
  if (body.content && typeof body.content === 'string') updates.content = body.content;
  if (body.platforms && Array.isArray(body.platforms)) {
    if (body.platforms.some((p) => !VALID_PLATFORMS.includes(p))) {
      return respond(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid platform' } });
    }
    updates.platforms = body.platforms;
  }

  if (Object.keys(updates).length === 0) {
    return respond(400, { error: { code: 'NO_UPDATES', message: 'No valid fields to update' } });
  }

  const expressions = Object.keys(updates).map((k) => `#${k} = :${k}`);
  const names = {};
  const values = {};
  for (const [k, v] of Object.entries(updates)) {
    names[`#${k}`] = k;
    values[`:${k}`] = v;
  }

  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: item.PK, SK: item.SK },
      UpdateExpression: `SET ${expressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );

  return respond(200, { id: postId, ...updates });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);

    if (!userId) return respond(401, { error: { code: 'UNAUTHORIZED', message: 'Missing user identity' } });

    if (method === 'POST' && path === '/posts/schedule') {
      const body = event.body ? JSON.parse(event.body) : null;
      return handleSchedulePost(userId, body);
    }

    if (method === 'GET' && path === '/posts') {
      return handleGetPosts(userId);
    }

    const idMatch = path.match(/^\/posts\/([^/]+)$/);

    if (method === 'DELETE' && idMatch) {
      return handleDeletePost(userId, idMatch[1]);
    }

    if (method === 'PUT' && idMatch) {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleUpdatePost(userId, idMatch[1], body);
    }

    // POST /posts/{id}/publish — manual immediate publish
    const publishMatch = path.match(/^\/posts\/([^/]+)\/publish$/);
    if (method === 'POST' && publishMatch) {
      // Trigger the post-publisher directly — for now mark as published
      return respond(501, { error: { code: 'NOT_IMPLEMENTED', message: 'Immediate publish not yet available' } });
    }

    return respond(404, { error: { code: 'NOT_FOUND', message: `No route for ${method} ${path}` } });
  } catch (e) {
    console.error('posts-handler error:', e);
    return respond(500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
};
