'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});
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

// Map internal platform names to Bundle.social platform names (uppercase)
const PLATFORM_MAP = {
  facebook: 'FACEBOOK',
  instagram: 'INSTAGRAM',
  linkedin: 'LINKEDIN',
  tiktok: 'TIKTOK',
  youtube: 'YOUTUBE',
  twitter: 'X',
  x: 'X',
  pinterest: 'PINTEREST',
  threads: 'THREADS',
  nextdoor: 'NEXTDOOR',
};

/**
 * EventBridge Scheduler-triggered Lambda
 * Publishes a scheduled post via Bundle.social API.
 * Input: { postId, userId }
 *
 * Requires a Secrets Manager secret "SocialLeadGen/BundleSocial" with:
 *   - BUNDLE_SOCIAL_API_KEY: your pk_live_... key
 *   - BUNDLE_SOCIAL_TEAM_ID: the team ID to publish under
 */
exports.handler = async (event) => {
  const { postId, userId } = event;

  if (!postId || !userId) {
    console.error('Missing postId or userId in event:', event);
    return { statusCode: 400, body: 'Missing postId or userId' };
  }

  console.log(`Publishing post ${postId} for user ${userId}`);

  // Find the post in DynamoDB
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

  const post = (queryResult.Items || [])[0];
  if (!post) {
    console.error(`Post ${postId} not found for user ${userId}`);
    return { statusCode: 404, body: 'Post not found' };
  }

  if (post.status === 'published') {
    console.log(`Post ${postId} already published, skipping`);
    return { statusCode: 200, body: 'Already published' };
  }

  try {
    const { BUNDLE_SOCIAL_API_KEY, BUNDLE_SOCIAL_TEAM_ID } = await getBundleSocialSecret();

    // Try to get the user's own Bundle.social team ID first, fall back to shared team
    let teamId = BUNDLE_SOCIAL_TEAM_ID;
    try {
      const userResult = await dynamo.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND SK = :sk',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': 'PROFILE',
          },
          Limit: 1,
        })
      );
      const userProfile = (userResult.Items || [])[0];
      if (userProfile?.bundleSocialTeamId) {
        teamId = userProfile.bundleSocialTeamId;
      }
    } catch (e) {
      console.warn('Could not look up user team, using default:', e.message);
    }

    let platforms = (post.platforms || []).map((p) => PLATFORM_MAP[p]).filter(Boolean);

    if (platforms.length === 0) {
      throw new Error('No valid platforms specified for this post');
    }

    // Skip platforms that require media if no media is attached
    const hasMedia = (post.mediaUrls && post.mediaUrls.length > 0) || (post.bundleUploadIds && post.bundleUploadIds.length > 0);
    if (!hasMedia) {
      const mediaRequiredPlatforms = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE'];
      const skipped = platforms.filter((p) => mediaRequiredPlatforms.includes(p));
      platforms = platforms.filter((p) => !mediaRequiredPlatforms.includes(p));
      if (skipped.length > 0) {
        console.log(`Skipping ${skipped.join(', ')} — no media attached`);
      }
      if (platforms.length === 0) {
        throw new Error('All selected platforms require media (image/video). Add media to post.');
      }
    }

    // Build per-platform data payload
    const data = {};
    for (const platform of platforms) {
      const platformData = { text: post.content };

      // If media was uploaded to Bundle.social, reference via uploadIds
      if (post.bundleUploadIds && post.bundleUploadIds.length > 0) {
        platformData.uploadIds = post.bundleUploadIds;
      } else if (post.mediaUrls && post.mediaUrls.length > 0) {
        // Fall back to S3 media URLs
        platformData.mediaUrls = post.mediaUrls;
      }

      data[platform] = platformData;
    }

    const bundlePayload = {
      teamId,
      title: post.title || post.content.slice(0, 80),
      status: 'SCHEDULED',
      postDate: new Date().toISOString(), // publish immediately
      socialAccountTypes: platforms,
      data,
    };

    console.log('Bundle.social payload:', JSON.stringify(bundlePayload, null, 2));

    const response = await fetch('https://api.bundle.social/api/v1/post', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BUNDLE_SOCIAL_API_KEY,
      },
      body: JSON.stringify(bundlePayload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Bundle.social API error: ${response.status} — ${JSON.stringify(result)}`);
    }

    console.log(`Post ${postId} published successfully:`, result.id);

    // Update post status to published
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: post.PK, SK: post.SK },
        UpdateExpression: 'SET #status = :status, publishedAt = :now, bundleSocialId = :bsId',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'published',
          ':now': new Date().toISOString(),
          ':bsId': result.id || null,
        },
      })
    );

    return { statusCode: 200, body: 'Published' };
  } catch (e) {
    console.error(`Failed to publish post ${postId}:`, e);

    // Mark as failed
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: post.PK, SK: post.SK },
        UpdateExpression: 'SET #status = :status, failureReason = :reason',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'failed',
          ':reason': e.message || 'Unknown error',
        },
      })
    );

    return { statusCode: 500, body: e.message };
  }
};
