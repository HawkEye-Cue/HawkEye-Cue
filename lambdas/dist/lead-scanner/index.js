'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  ScanCommand,
  TransactWriteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { randomUUID } = require('crypto');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});
const sns = new SNSClient({});
const TABLE_NAME = process.env.TABLE_NAME;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Author quality (mirror of packages/shared opportunity-intake.ts). Reject UI labels,
// URLs/domains as identities; junk → null so the UI shows "Author unavailable".
const INTAKE_UI_LABELS = new Set([
  'unknown', 'unnamed', 'photos', 'photo', 'videos', 'video', 'reels', 'reel',
  'see more', 'see less', 'like', 'comment', 'share', 'follow', 'following',
  'message', 'sponsored', 'suggested for you', 'shared post', 'facebook',
  'write a comment', 'active', 'admin', 'top contributor', 'author',
  'see what you’ve been waiting for', "see what you've been waiting for",
]);
const INTAKE_URL_OR_DOMAIN = /(https?:\/\/|www\.|m\.me\b|\bfb\.me\b|@|\.com\b|\.net\b|\.org\b|\.io\b|\.co\b|\.lc\b|\.gov\b|\.edu\b|\.biz\b|\.info\b|\.us\b|\.ca\b|\.uk\b)/i;
function isUsableAuthor(author) {
  const a = (author == null ? '' : String(author)).trim();
  if (a.length < 2) return false;
  if (INTAKE_UI_LABELS.has(a.toLowerCase())) return false;
  if (INTAKE_URL_OR_DOMAIN.test(a)) return false;
  if (!/[a-z\u00c0-\u024f]/i.test(a)) return false;
  if (a.length > 60) return false;
  return true;
}
// Cross-path dedupe key — IDENTICAL logic to the opportunities-handler (post id →
// canonical URL → author+content). This lets the background scanner and the extension
// path share ONE per-user OPPDEDUPE# sentinel namespace so the same post can't be saved
// twice across the two write paths. Mirror of packages/shared opportunity-intake.ts.
function intakeCanonicalizePostUrl(url) {
  const raw = (url == null ? '' : String(url)).trim();
  if (!raw) return null;
  const noProto = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
  if (/^(m\.|mobile\.)?facebook\.com$/i.test(noProto)) return null;
  try {
    const u = new URL(raw);
    const fbid = u.searchParams.get('story_fbid') || u.searchParams.get('fbid');
    const path = u.pathname.replace(/\/+$/, '');
    const postMatch = path.match(/\/(posts|permalink|videos|reel|p)\/([^/]+)/i);
    if (postMatch) return (u.hostname.replace(/^www\./i, '') + path).toLowerCase();
    if (fbid) return (u.hostname.replace(/^www\./i, '') + '/' + fbid).toLowerCase();
    if (path && path !== '') return (u.hostname.replace(/^www\./i, '') + path).toLowerCase();
    return null;
  } catch (e) { return null; }
}
function intakeDedupeKey(input) {
  const id = (input.postId == null ? '' : String(input.postId)).trim();
  if (id) return 'id:' + id.toLowerCase();
  const canon = intakeCanonicalizePostUrl(input.sourceUrl);
  if (canon) return 'url:' + canon;
  const author = (input.sourceAuthor == null ? '' : String(input.sourceAuthor)).trim().toLowerCase();
  const content = (input.sourceContent == null ? '' : String(input.sourceContent)).replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
  if (content) return 'ac:' + author + '|' + content;
  return null;
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

  // Backward-compatible fast pre-check (UNCHANGED): skip if we already saved this comment
  // in this path. Kept so existing scanner behavior + the sourceCommentId contract hold.
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

  // Author quality: only persist a usable identity (junk UI labels/URLs → null).
  const canonicalAuthor = isUsableAuthor(lead.authorName) ? String(lead.authorName).trim() : null;

  // The opportunity item. Writes the CANONICAL fields used by the HTTP + extension path
  // while RETAINING scanner compatibility fields (platform/authorName/postContent/
  // matchedKeywords/source/sourceCommentId) so the notification-sender stream + team views
  // keep working. Review-first: background-scan leads enter the Opportunity Inbox.
  const oppItem = {
    PK: `USER#${userId}`,
    SK: `OPP#${now}#${id}`,
    opportunityId: id,
    sourceCommentId: lead.commentId,
    platform: lead.platform.toLowerCase(),
    authorName: lead.authorName,
    postContent: lead.text,
    matchedKeywords: lead.matchedKeywords,
    source: 'background-scan',
    keywordId: 'extension-detected',
    sourcePlatform: lead.platform.toLowerCase(),
    sourceAuthor: canonicalAuthor,
    sourceContent: lead.text,
    sourceUrl: '',
    leadSource: 'extension-detected',
    status: 'inbox',
    detectedAt: now,
    createdAt: now,
  };

  // CROSS-PATH dedupe: write the OPP item AND the SHARED per-user OPPDEDUPE# sentinel in
  // ONE atomic transaction, using the SAME key logic as the opportunities-handler. Because
  // both write paths now reserve the same sentinel namespace, the same post cannot be
  // saved twice even if the extension and this background scan detect it (and the
  // conditional write serializes concurrent attempts). The scanner's stable key is the
  // comment id (→ 'id:<commentId>'), falling back to author+content. If no reliable key
  // exists we fall back to a plain Put (never block blindly) — the Query pre-check above
  // still guards the common case.
  const dedupeKey = intakeDedupeKey({
    postId: lead.commentId,
    sourceUrl: '',
    sourceAuthor: canonicalAuthor,
    sourceContent: lead.text,
  });

  if (dedupeKey) {
    try {
      await dynamo.send(new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              Item: { PK: `USER#${userId}`, SK: `OPPDEDUPE#${dedupeKey}`, opportunityId: id, createdAt: now },
              ConditionExpression: 'attribute_not_exists(SK)',
            },
          },
          { Put: { TableName: TABLE_NAME, Item: oppItem } },
        ],
      }));
    } catch (e) {
      // Sentinel already reserved (by the extension path or a concurrent scan) → the whole
      // txn rolls back (no OPP, no orphaned sentinel). Treat as an already-saved duplicate.
      const name = e && (e.name || e.code);
      if (name === 'TransactionCanceledException' || name === 'ConditionalCheckFailedException') {
        return false;
      }
      throw e;
    }
  } else {
    await dynamo.send(new PutCommand({ TableName: TABLE_NAME, Item: oppItem }));
  }

  // Send push notification via DynamoDB stream → notification-sender
  // The INSERT of an OPP# record triggers the notification-sender Lambda
  // which is already set up on the DynamoDB stream

  console.log(`Lead saved for user ${userId}: "${lead.text.slice(0, 60)}..." (${lead.matchedKeywords.join(', ')})`);
  return true;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

// ─── Save Engagement Stats ────────────────────────────────────────────────────

async function saveEngagementStats(userId, teamId) {
  // Fetch recent posts with their engagement data
  const posts = await bundleApiCall('GET', `/post?teamId=${teamId}&limit=10`);
  if (!posts || !posts.data) return;

  let totalLikes = 0;
  let totalComments = 0;
  let totalShares = 0;
  const postStats = [];

  for (const post of posts.data) {
    const likes = post.likes || post.reactions || 0;
    const comments = post.comments || 0;
    const shares = post.shares || 0;
    totalLikes += likes;
    totalComments += comments;
    totalShares += shares;
    postStats.push({
      postId: post.id,
      content: (post.text || post.title || '').slice(0, 80),
      platform: (post.socialAccountType || 'unknown').toLowerCase(),
      likes, comments, shares,
      createdAt: post.createdAt || post.postDate || '',
    });
  }

  // Save engagement summary to user's profile
  const now = new Date().toISOString();
  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${userId}`,
      SK: 'ENGAGEMENT#LATEST',
      totalLikes, totalComments, totalShares,
      postStats: postStats.slice(0, 5),
      updatedAt: now,
    },
  }));
}

// ─── Save Comment as Engagement Notification ──────────────────────────────────

async function saveCommentNotification(userId, comment) {
  const id = randomUUID();
  const now = new Date().toISOString();

  // Deduplicate by commentId
  const existing = await dynamo.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: 'commentId = :cid',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'NOTIFY#', ':cid': comment.commentId },
    Limit: 1,
  }));
  if ((existing.Items || []).length > 0) return false;

  await dynamo.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${userId}`,
      SK: `NOTIFY#${now}#${id}`,
      notificationId: id,
      type: 'comment',
      commentId: comment.commentId,
      authorName: comment.authorName,
      text: comment.text,
      platform: comment.platform,
      createdAt: now,
    },
  }));
  return true;
}

/**
 * EventBridge Scheduled Lambda — runs every 15 minutes.
 * Scans connected social accounts for new comments/mentions matching user keywords.
 * Also tracks engagement stats and notifies on all new comments.
 */
exports.handler = async () => {
  console.log('Lead scanner starting...');

  try {
    const users = await getUsersWithKeywords();
    console.log(`Found ${users.length} users with keywords and connected accounts`);

    let totalLeads = 0;
    let totalNotifications = 0;

    for (const user of users) {
      try {
        const comments = await getRecentComments(user.teamId);
        console.log(`User ${user.email}: ${comments.length} recent comments to scan`);

        // Save engagement stats
        try {
          await saveEngagementStats(user.userId, user.teamId);
        } catch (e) {
          console.error(`Failed to save engagement stats for ${user.email}:`, e.message);
        }

        for (const comment of comments) {
          // Save ALL comments as notifications (not just keyword matches)
          const notified = await saveCommentNotification(user.userId, comment);
          if (notified) totalNotifications++;

          // Check keywords for lead detection
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

    console.log(`Lead scanner complete. ${totalLeads} leads, ${totalNotifications} notifications.`);
    return { statusCode: 200, body: `Scanned ${users.length} users, found ${totalLeads} leads, ${totalNotifications} notifications` };
  } catch (e) {
    console.error('Lead scanner error:', e);
    return { statusCode: 500, body: e.message };
  }
};
