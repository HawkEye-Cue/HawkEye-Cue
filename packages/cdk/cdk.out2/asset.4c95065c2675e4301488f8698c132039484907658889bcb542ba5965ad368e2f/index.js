'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, DeleteCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(body) {
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function err(status, code, message) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: { code, message } }) };
}

function getUserId(event) {
  return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null;
}

function getUserEmail(event) {
  return event.requestContext?.authorizer?.jwt?.claims?.email ?? '';
}

async function getUserProfile(userId) {
  const result = await dynamo.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
  }));
  return result.Item ?? null;
}

// ─── Network Posts ────────────────────────────────────────────────────────────

/**
 * GET /network/posts?trade=Roofing
 * Returns network posts for all of the user's regions (shared feed, location-based).
 */
async function handleGetPosts(userId, event) {
  const trade = event.queryStringParameters?.trade || null;

  // Get user's regions from profile
  const profile = await getUserProfile(userId);
  const regions = profile?.regions || (profile?.region ? [profile.region] : []);

  if (regions.length === 0) {
    return ok({ posts: [], needsRegion: true, regions: [] });
  }

  // Query each region and merge results
  let allPosts = [];
  for (const region of regions) {
    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `NETWORK#${region.toUpperCase()}` },
      ScanIndexForward: false,
      Limit: 50,
    };

    if (trade) {
      // Support comma-separated trades
      const trades = trade.split(',').map((t) => t.trim()).filter(Boolean);
      if (trades.length === 1) {
        params.FilterExpression = 'tradeFilter = :trade OR tradeFilter = :all';
        params.ExpressionAttributeValues[':trade'] = trades[0];
        params.ExpressionAttributeValues[':all'] = 'all';
      } else if (trades.length > 1) {
        const conditions = trades.map((_, i) => `tradeFilter = :t${i}`).join(' OR ');
        params.FilterExpression = `(${conditions}) OR tradeFilter = :all`;
        params.ExpressionAttributeValues[':all'] = 'all';
        trades.forEach((t, i) => { params.ExpressionAttributeValues[`:t${i}`] = t; });
      }
    }

    const result = await dynamo.send(new QueryCommand(params));
    const posts = (result.Items || []).map((item) => ({
      id: item.postId,
      userId: item.userId,
      authorName: item.authorName,
      authorTrade: item.authorTrade,
      content: item.content,
      type: item.postType || 'referral',
      tradeFilter: item.tradeFilter || 'all',
      replies: item.replies || [],
      createdAt: item.createdAt,
      region: item.region,
    }));
    allPosts = allPosts.concat(posts);
  }

  // Sort by newest first and limit
  allPosts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  allPosts = allPosts.slice(0, 50);

  return ok({ posts: allPosts, regions });
}

/**
 * POST /network/posts
 * Body: { content, type, tradeFilter }
 */
async function handleCreatePost(userId, event) {
  const body = event.body ? JSON.parse(event.body) : {};
  const { content, type, tradeFilter } = body;

  if (!content || !content.trim()) {
    return err(400, 'INVALID_INPUT', 'Content is required');
  }

  const profile = await getUserProfile(userId);
  const regions = profile?.regions || (profile?.region ? [profile.region] : []);

  if (regions.length === 0) {
    return err(400, 'NO_REGION', 'Please set your state(s) in Settings before posting');
  }

  const region = regions[0]; // Post to primary region

  const email = getUserEmail(event);
  const authorName = profile?.displayName || email.split('@')[0] || 'Anonymous';
  const authorTrade = profile?.selectedTradeName || profile?.selectedTradeId || 'Unknown';

  const postId = crypto.randomUUID();
  const now = new Date().toISOString();

  const sortKey = `POST#${now}#${postId}`;

  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `NETWORK#${region.toUpperCase()}`,
      SK: sortKey,
      postId,
      userId,
      authorName,
      authorTrade,
      content: content.trim(),
      postType: type || 'referral',
      tradeFilter: tradeFilter || 'all',
      region: region.toUpperCase(),
      replies: [],
      createdAt: now,
    },
  }));

  return ok({
    id: postId,
    userId,
    authorName,
    authorTrade,
    content: content.trim(),
    type: type || 'referral',
    tradeFilter: tradeFilter || 'all',
    replies: [],
    createdAt: now,
    region: region.toUpperCase(),
  });
}

/**
 * POST /network/posts/{id}/reply
 * Body: { content }
 */
async function handleReplyToPost(userId, postId, event) {
  const body = event.body ? JSON.parse(event.body) : {};
  const { content } = body;

  if (!content || !content.trim()) {
    return err(400, 'INVALID_INPUT', 'Reply content is required');
  }

  // Get user's regions to find the post
  const profile = await getUserProfile(userId);
  const regions = profile?.regions || (profile?.region ? [profile.region] : []);
  if (regions.length === 0) return err(400, 'NO_REGION', 'Please set your state(s) in Settings');

  // Search for the post across user's regions
  let post = null;
  for (const r of regions) {
    const queryResult = await dynamo.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      FilterExpression: 'postId = :pid',
      ExpressionAttributeValues: { ':pk': `NETWORK#${r.toUpperCase()}`, ':pid': postId },
    }));
    post = (queryResult.Items || [])[0];
    if (post) break;
  }
  if (!post) return err(404, 'NOT_FOUND', 'Post not found');

  const email = getUserEmail(event);
  const authorName = profile?.displayName || email.split('@')[0] || 'Anonymous';
  const authorTrade = profile?.selectedTradeName || profile?.selectedTradeId || 'Unknown';

  const replyId = crypto.randomUUID();
  const now = new Date().toISOString();

  const reply = {
    id: replyId,
    userId,
    authorName,
    authorTrade,
    content: content.trim(),
    createdAt: now,
  };

  await dynamo.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: post.PK, SK: post.SK },
    UpdateExpression: 'SET replies = list_append(if_not_exists(replies, :empty), :reply)',
    ExpressionAttributeValues: {
      ':reply': [reply],
      ':empty': [],
    },
  }));

  return ok(reply);
}

/**
 * DELETE /network/posts/{id}
 * User deletes their own post.
 */
async function handleDeletePost(userId, postId) {
  const profile = await getUserProfile(userId);
  const regions = profile?.regions || (profile?.region ? [profile.region] : []);
  if (regions.length === 0) return err(400, 'NO_REGION', 'No region set');

  let post = null;
  for (const r of regions) {
    const queryResult = await dynamo.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      FilterExpression: 'postId = :pid',
      ExpressionAttributeValues: { ':pk': `NETWORK#${r.toUpperCase()}`, ':pid': postId },
    }));
    post = (queryResult.Items || [])[0];
    if (post) break;
  }

  if (!post) return err(404, 'NOT_FOUND', 'Post not found');
  if (post.userId !== userId) return err(403, 'FORBIDDEN', 'You can only delete your own posts');

  await dynamo.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: post.PK, SK: post.SK },
  }));

  return ok({ message: 'Post deleted' });
}

// ─── Network Contacts (per-user referral directory) ───────────────────────────

/**
 * PUT /network/region
 * Body: { regions: ["CO", "WY"] }
 * Sets the user's states/regions for location-based feed (multiple allowed).
 */
async function handleSetRegion(userId, event) {
  const body = event.body ? JSON.parse(event.body) : {};
  const { regions, region } = body;

  // Support both single region (legacy) and multiple regions
  let regionList = regions || (region ? [region] : []);
  if (typeof regionList === 'string') regionList = [regionList];
  regionList = regionList.map((r) => r.trim().toUpperCase()).filter(Boolean);

  if (regionList.length === 0) {
    return err(400, 'INVALID_INPUT', 'At least one state is required');
  }

  await dynamo.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
    UpdateExpression: 'SET #regions = :regions, #region = :primary',
    ExpressionAttributeNames: { '#regions': 'regions', '#region': 'region' },
    ExpressionAttributeValues: { ':regions': regionList, ':primary': regionList[0] },
  }));

  return ok({ regions: regionList });
}

/**
 * GET /network/region
 * Returns user's current regions.
 */
async function handleGetRegion(userId) {
  const profile = await getUserProfile(userId);
  const regions = profile?.regions || (profile?.region ? [profile.region] : []);
  return ok({ regions, region: profile?.region || null });
}

// ─── Network Contacts ─────────────────────────────────────────────────────────

/**
 * GET /network/contacts
 */
async function handleGetContacts(userId) {
  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'CONTACT#',
    },
  }));

  const contacts = (result.Items || []).map((item) => ({
    id: item.contactId,
    userId: item.userId,
    name: item.contactName,
    trade: item.trade,
    phone: item.phone || '',
    email: item.contactEmail || '',
    notes: item.notes || '',
    createdAt: item.createdAt,
  }));

  return ok({ contacts });
}

/**
 * POST /network/contacts
 * Body: { name, trade, phone?, email?, notes? }
 */
async function handleAddContact(userId, event) {
  const body = event.body ? JSON.parse(event.body) : {};
  const { name, trade, phone, email, notes } = body;

  if (!name || !name.trim()) {
    return err(400, 'INVALID_INPUT', 'Contact name is required');
  }

  const contactId = crypto.randomUUID();
  const now = new Date().toISOString();

  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${userId}`,
      SK: `CONTACT#${contactId}`,
      contactId,
      userId,
      contactName: name.trim(),
      trade: trade || 'Unknown',
      phone: phone || '',
      contactEmail: email || '',
      notes: notes || '',
      createdAt: now,
    },
  }));

  return ok({
    id: contactId,
    userId,
    name: name.trim(),
    trade: trade || 'Unknown',
    phone: phone || '',
    email: email || '',
    notes: notes || '',
    createdAt: now,
  });
}

/**
 * DELETE /network/contacts/{id}
 */
async function handleDeleteContact(userId, contactId) {
  await dynamo.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: `USER#${userId}`, SK: `CONTACT#${contactId}` },
  }));

  return ok({ message: 'Contact removed' });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);

    if (!userId) return err(401, 'UNAUTHORIZED', 'Missing user identity');

    // --- Posts ---
    if (method === 'GET' && path === '/network/posts') {
      return handleGetPosts(userId, event);
    }
    if (method === 'POST' && path === '/network/posts') {
      return handleCreatePost(userId, event);
    }
    if (method === 'POST' && path.match(/^\/network\/posts\/[^/]+\/reply$/)) {
      const postId = path.split('/network/posts/')[1].split('/reply')[0];
      return handleReplyToPost(userId, postId, event);
    }
    if (method === 'DELETE' && path.match(/^\/network\/posts\/[^/]+$/)) {
      const postId = path.split('/network/posts/')[1];
      return handleDeletePost(userId, postId);
    }

    // --- Region ---
    if (method === 'GET' && path === '/network/region') {
      return handleGetRegion(userId);
    }
    if (method === 'PUT' && path === '/network/region') {
      return handleSetRegion(userId, event);
    }

    // --- Contacts ---
    if (method === 'GET' && path === '/network/contacts') {
      return handleGetContacts(userId);
    }
    if (method === 'POST' && path === '/network/contacts') {
      return handleAddContact(userId, event);
    }
    if (method === 'DELETE' && path.match(/^\/network\/contacts\/[^/]+$/)) {
      const contactId = path.split('/network/contacts/')[1];
      return handleDeleteContact(userId, contactId);
    }

    return err(404, 'NOT_FOUND', `No route for ${method} ${path}`);
  } catch (e) {
    console.error('network-handler error:', e);
    return err(500, 'INTERNAL_ERROR', e.message || 'An unexpected error occurred');
  }
};
