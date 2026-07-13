'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { randomUUID } = require('crypto');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});
const sns = new SNSClient({});
const TABLE_NAME = process.env.TABLE_NAME;

// ─── Helpers ──────────────────────────────────────────────────────────────────

let cachedSecret = null;
async function getBundleSocialSecret() {
  if (cachedSecret) return cachedSecret;
  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: 'SocialLeadGen/BundleSocial' })
  );
  cachedSecret = JSON.parse(result.SecretString);
  return cachedSecret;
}

async function bundleApiCall(method, path, body = null) {
  const { BUNDLE_SOCIAL_API_KEY } = await getBundleSocialSecret();
  const options = {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': BUNDLE_SOCIAL_API_KEY },
  };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(`https://api.bundle.social/api/v1${path}`, options);
  if (!response.ok) {
    const text = await response.text();
    console.error(`Bundle.social ${method} ${path} failed: ${response.status} — ${text}`);
    return null;
  }
  return response.json();
}

// ─── Get All Users With Keywords & Connected Accounts ─────────────────────────

async function getUsersWithKeywords() {
  // Scan for users who have keywords and a bundleSocialTeamId
  // In production, this should use a GSI. For now, scan profiles.
  const profiles = [];
  let lastKey = undefined;

  do {
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'SK = :sk AND attribute_exists(bundleSocialTeamId)',
      ExpressionAttributeValues: { ':sk': 'PROFILE' },
      ExclusiveStartKey: lastKey,
    }));
    profiles.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  // For each user with a team, fetch their keywords
  const usersWithKeywords = [];
  for (const profile of profiles) {
    const keywordsResult = await dynamo.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': profile.PK,
        ':sk': 'KW#',
      },
    }));

    const keywords = (keywordsResult.Items || []).map((k) => k.keyword).filter(Boolean);
    if (keywords.length > 0) {
      usersWithKeywords.push({
        userId: profile.userId,
        email: profile.email,
        teamId: profile.bundleSocialTeamId,
        tradeName: profile.selectedTradeName || 'professional',
        keywords,
      });
    }
  }

  return usersWithKeywords;
}

// ─── Fetch Recent Comments/Posts From Bundle.social ────────────────────────────

async function getRecentComments(teamId) {
  // Fetch recent posts and their comments for this team
  const posts = await bundleApiCall('GET', `/post?teamId=${teamId}&limit=20`);
  if (!posts || !posts.data) return [];

  const comments = [];
  for (const post of posts.data) {
    if (post.id) {
      const postComments = await bundleApiCall('GET', `/post/${post.id}/comments?teamId=${teamId}`);
      if (postComments && postComments.data) {
        for (const comment of postComments.data) {
          comments.push({
            commentId: comment.id,
            postId: post.id,
            authorName: comment.authorName || comment.username || 'Unknown',
            text: comment.text || comment.message || '',
            platform: post.socialAccountType || 'unknown',
            createdAt: comment.createdAt || new Date().toISOString(),
          });
        }
      }
    }
  }

  return comments;
}

// ─── Match Comments Against Keywords ──────────────────────────────────────────

function matchKeywords(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
}

// ─── Save Lead & Notify User ──────────────────────────────────────────────────

async function saveLeadAndNotify(userId, lead) {
  const id = randomUUID();
  const now = new Date().toISOString();

  // Check if we already saved this comment as a lead (deduplicate)
  const existing = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: 'sourceCommentId = :cid',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'OPP#',
      ':cid': lead.commentId,
    },
    Limit: 1,
  }));

  if ((existing.Items || []).length > 0) {
    return false; // Already saved
  }

  // Save as opportunity
  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${userId}`,
      SK: `OPP#${now}#${id}`,
      opportunityId: id,
      sourceCommentId: lead.commentId,
      platform: lead.platform.toLowerCase(),
      authorName: lead.authorName,
      postContent: lead.text,
      matchedKeywords: lead.matchedKeywords,
      status: 'new',
      source: 'background-scan',
      detectedAt: now,
      createdAt: now,
    },
  }));

  // Send push notification via DynamoDB stream → notification-sender
  // The INSERT of an OPP# record triggers the notification-sender Lambda
  // which is already set up on the DynamoDB stream

  console.log(`Lead saved for user ${userId}: "${lead.text.slice(0, 60)}..." (${lead.matchedKeywords.join(', ')})`);
  return true;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * EventBridge Scheduled Lambda — runs every 15 minutes.
 * Scans connected social accounts for new comments/mentions matching user keywords.
 */
exports.handler = async () => {
  console.log('Lead scanner starting...');

  try {
    const users = await getUsersWithKeywords();
    console.log(`Found ${users.length} users with keywords and connected accounts`);

    let totalLeads = 0;

    for (const user of users) {
      try {
        const comments = await getRecentComments(user.teamId);
        console.log(`User ${user.email}: ${comments.length} recent comments to scan`);

        for (const comment of comments) {
          const matched = matchKeywords(comment.text, user.keywords);
          if (matched.length > 0) {
            const saved = await saveLeadAndNotify(user.userId, {
              ...comment,
              matchedKeywords: matched,
            });
            if (saved) totalLeads++;
          }
        }
      } catch (e) {
        console.error(`Error scanning for user ${user.email}:`, e.message);
      }
    }

    console.log(`Lead scanner complete. ${totalLeads} new leads found.`);
    return { statusCode: 200, body: `Scanned ${users.length} users, found ${totalLeads} leads` };
  } catch (e) {
    console.error('Lead scanner error:', e);
    return { statusCode: 500, body: e.message };
  }
};
