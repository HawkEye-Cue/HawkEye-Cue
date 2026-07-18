'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { randomUUID } = require('crypto');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });
const TABLE_NAME = process.env.TABLE_NAME;
const MEDIA_BUCKET = process.env.MEDIA_BUCKET;

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

const VALID_TONES = ['professional', 'casual', 'educational', 'urgent'];
const VALID_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'nextdoor'];

function validateGenerateRequest(body) {
  const errors = [];
  if (!body) return ['Request body is required'];

  if (!VALID_TONES.includes(body.tone)) {
    errors.push(`tone must be one of: ${VALID_TONES.join(', ')}`);
  }
  if (typeof body.postType !== 'string' || body.postType.length < 1) {
    errors.push('postType is required');
  }
  if (!Array.isArray(body.platforms) || body.platforms.length < 1) {
    errors.push('At least one platform must be selected');
  } else if (body.platforms.some((p) => !VALID_PLATFORMS.includes(p))) {
    errors.push(`platforms must be from: ${VALID_PLATFORMS.join(', ')}`);
  }
  if (body.baseText !== undefined && typeof body.baseText !== 'string') {
    errors.push('baseText must be a string');
  }

  return errors;
}

// ─── AI Content Generation ────────────────────────────────────────────────────

const PLATFORM_GUIDELINES = {
  facebook: 'Facebook: conversational, can be longer (up to 300 words), use emojis sparingly, include a call to action, can use hashtags moderately (2-3).',
  instagram: 'Instagram: visual-first, use more emojis, keep text concise (under 150 words), heavy on hashtags (5-10 relevant ones at the end), engaging first line as a hook.',
  linkedin: 'LinkedIn: professional, thought-leadership style, no excessive emojis (1-2 max), focus on value and expertise, include industry-relevant hashtags (3-5), can be longer and more detailed.',
  tiktok: 'TikTok: ultra-casual, trendy, short and punchy (under 100 words), use trending language, lots of emojis, 3-5 hashtags including trending ones, speak like talking to a friend.',
  nextdoor: 'Nextdoor: neighborhood-focused, friendly and helpful, position yourself as a trusted local professional, mention your service area, no excessive hashtags (1-2 max), conversational but professional, focus on community value.',
};

async function generateWithAI(tone, postType, platforms, baseText, tradeName, postLength) {
  const platformInstructions = platforms
    .map((p) => PLATFORM_GUIDELINES[p])
    .join('\n');

  const lengthInstruction = postLength === 'short' ? 'Keep it SHORT — 1-2 sentences max per platform. Quick, punchy, to the point.'
    : postLength === 'long' ? 'Make it LONG — a full detailed paragraph per platform. Be thorough, tell a story, add context and value.'
    : 'Keep it MEDIUM length — 3-5 sentences per platform. Balanced detail without being too wordy.';

  const prompt = `You are a social media content expert for a ${tradeName} business. Generate a ${tone} ${postType} post.

${lengthInstruction}

${baseText ? `The user provided this base text to adapt:\n"${baseText}"\n\nAdapt this message for each platform while preserving the core message.` : `Create an original ${postType} post that would resonate with the target audience of a ${tradeName}.`}

Generate a SEPARATE version for each of these platforms, adapting the vocabulary, length, style, and hashtags to fit each platform's culture:

${platformInstructions}

Respond in JSON format like this (no markdown, just raw JSON):
{
  ${platforms.map((p) => `"${p}": "the post content for ${p}"`).join(',\n  ')}
}

Important rules:
- Each platform version should feel native to that platform
- Maintain the same core message across all platforms
- Adjust tone, length, emoji usage, and hashtag strategy per platform
- Make content feel authentic, not generic or AI-generated
- Use the ${tone} tone consistently but adapted to each platform's style`;

  const requestBody = {
    messages: [
      { role: 'user', content: [{ text: prompt }] },
    ],
    inferenceConfig: {
      maxTokens: 2000,
      temperature: 0.7,
    },
  };

  const command = new InvokeModelCommand({
    modelId: 'amazon.nova-lite-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(requestBody),
  });

  const response = await bedrock.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const aiText = responseBody.output.message.content[0].text.trim();

  // Parse the JSON response from the AI
  try {
    // Try to extract JSON if it's wrapped in code fences
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(aiText);
  } catch (e) {
    console.error('Failed to parse AI JSON response:', aiText);
    // Fallback: use the same text for all platforms
    const fallback = {};
    for (const p of platforms) {
      fallback[p] = aiText;
    }
    return fallback;
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// POST /content/generate
async function handleGenerate(userId, body) {
  const errors = validateGenerateRequest(body);
  if (errors.length > 0) {
    return respond(400, { error: { code: 'VALIDATION_ERROR', message: errors.join('; ') } });
  }

  // ─── Tier Limit Check ─────────────────────────────────────────────────
  const profileResult = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'PROFILE' },
      Limit: 1,
    })
  );
  const profile = (profileResult.Items || [])[0] || {};
  const tier = profile.subscriptionTier || 'free';
  const LIMITS = { free: 2, base: 50, growth: 200, soar: 300, pro: Infinity, team: 500 };
  const limit = LIMITS[tier] ?? 5;
  const used = profile.aiGenerationsUsed || 0;

  if (used >= limit) {
    return respond(403, {
      error: {
        code: 'TIER_LIMIT_REACHED',
        message: `You've used all ${limit} AI generations on the ${tier} plan. Upgrade for more.`,
        limit,
        used,
        tier,
      },
    });
  }

  const contentId = randomUUID();
  const now = new Date().toISOString();
  const tradeName = body.tradeName || 'service professional';

  let platformContent;
  try {
    platformContent = await generateWithAI(
      body.tone,
      body.postType,
      body.platforms,
      body.baseText || '',
      tradeName,
      body.postLength || 'medium'
    );
  } catch (e) {
    console.error('AI generation failed:', e);
    return respond(500, {
      error: { code: 'AI_GENERATION_FAILED', message: 'Failed to generate content. Please try again.' },
    });
  }

  await dynamo.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `CONTENT#${now}#${contentId}`,
        contentId,
        tone: body.tone,
        postType: body.postType,
        platforms: body.platforms,
        baseText: body.baseText || '',
        platformContent,
        generatedContent: Object.values(platformContent).join('\n\n---\n\n'),
        createdAt: now,
      },
    })
  );

  // Increment AI generations counter
  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      UpdateExpression: 'SET aiGenerationsUsed = if_not_exists(aiGenerationsUsed, :zero) + :one',
      ExpressionAttributeValues: { ':zero': 0, ':one': 1 },
    })
  );

  return respond(201, {
    id: contentId,
    platformContent,
    tone: body.tone,
    platforms: body.platforms,
    createdAt: now,
  });
}

// GET /content/history
async function handleGetHistory(userId) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'CONTENT#',
      },
      ScanIndexForward: false,
      Limit: 50,
    })
  );

  const items = (result.Items || []).map((item) => ({
    id: item.contentId,
    content: item.generatedContent,
    platformContent: item.platformContent || null,
    tone: item.tone,
    postType: item.postType,
    platforms: item.platforms,
    createdAt: item.createdAt,
  }));

  return respond(200, { items });
}

// POST /content/upload-url
async function handleUploadUrl(userId, body) {
  const { fileName, contentType } = body || {};

  if (typeof fileName !== 'string' || fileName.length < 1) {
    return respond(400, { error: { code: 'VALIDATION_ERROR', message: 'fileName is required' } });
  }
  if (typeof contentType !== 'string' || (!contentType.startsWith('image/') && !contentType.startsWith('video/'))) {
    return respond(400, { error: { code: 'VALIDATION_ERROR', message: 'contentType must be an image or video type' } });
  }

  const key = `uploads/${userId}/${randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const command = new PutObjectCommand({
    Bucket: MEDIA_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return respond(200, { url: uploadUrl, key });
}

// DELETE /content/{id}
async function handleDelete(userId, contentId) {
  const queryResult = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      FilterExpression: 'contentId = :cid',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'CONTENT#',
        ':cid': contentId,
      },
      Limit: 1,
    })
  );

  const item = (queryResult.Items || [])[0];
  if (!item) return respond(404, { error: { code: 'NOT_FOUND', message: 'Content not found' } });

  await dynamo.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: item.PK, SK: item.SK } })
  );

  return respond(200, { deleted: true });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);

    if (!userId) return respond(401, { error: { code: 'UNAUTHORIZED', message: 'Missing user identity' } });

    if (method === 'POST' && path === '/content/generate') {
      const body = event.body ? JSON.parse(event.body) : null;
      return handleGenerate(userId, body);
    }

    if (method === 'GET' && path === '/content/history') {
      return handleGetHistory(userId);
    }

    if (method === 'POST' && path === '/content/upload-url') {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleUploadUrl(userId, body);
    }

    const deleteMatch = path.match(/^\/content\/([^/]+)$/);
    if (method === 'DELETE' && deleteMatch) {
      return handleDelete(userId, deleteMatch[1]);
    }

    return respond(404, { error: { code: 'NOT_FOUND', message: `No route for ${method} ${path}` } });
  } catch (e) {
    console.error('content-handler error:', e);
    return respond(500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
};
