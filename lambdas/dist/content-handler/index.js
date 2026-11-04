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

  const lengthInstruction = postLength === 'short' ? 'ABSOLUTE HARD LIMIT: Each platform post MUST be 1-2 sentences only. Maximum 30 words total. No hashtags. No emojis at the end. No call-to-action. No lists. Just one or two short, natural sentences. If you write more than 2 sentences you have FAILED.'
    : postLength === 'long' ? 'Make it LONG — a full detailed paragraph per platform. Be thorough, tell a story, add context and value.'
    : 'Keep it MEDIUM length — 3-5 sentences per platform. Balanced detail without being too wordy.';

  const maxTokens = postLength === 'short' ? 300 : postLength === 'long' ? 2000 : 1200;

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
- ${lengthInstruction}
- Each platform version should feel native to that platform
- Maintain the same core message across all platforms
- Adjust tone, emoji usage, and hashtag strategy per platform
- Make content feel authentic, not generic or AI-generated
- Use the ${tone} tone consistently but adapted to each platform's style`;

  const requestBody = {
    messages: [
      { role: 'user', content: [{ text: prompt }] },
    ],
    inferenceConfig: {
      maxTokens: maxTokens,
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

// POST /content/ideas — suggest post ideas for a trade when the user is stuck
async function handleIdeas(userId, body) {
  const tradeName = (body && body.tradeName) || 'local business';
  const category = (body && body.category) || 'any';

  const categoryHint = {
    tips: 'helpful tips and how-to advice for customers',
    promo: 'promotions, offers, or reasons to buy now',
    story: 'behind-the-scenes, personal stories, or team spotlights',
    seasonal: 'seasonal, holiday, or timely topics for right now',
    engagement: 'questions, polls, or fun posts that get comments',
    any: 'a healthy mix of tips, promotions, stories, and engagement',
  }[category] || 'a healthy mix';

  const prompt = `You are a social media strategist for a ${tradeName} business. The owner is out of ideas and needs fresh post concepts.

Suggest 6 short, specific, ready-to-use post ideas focused on ${categoryHint}.

Return ONLY a JSON array of 6 objects:
[{ "hook": "a punchy 3-6 word title for the idea", "idea": "one sentence describing the post concept", "starter": "a ready-to-post opening line the user can build on" }]

Rules:
- Make ideas specific to a ${tradeName} — not generic.
- Keep hooks short and scroll-stopping.
- The "starter" should sound human and friendly, not corporate.
- Vary the ideas so they don't repeat.`;

  const command = new InvokeModelCommand({
    modelId: 'amazon.nova-lite-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 1500, temperature: 0.9 },
    }),
  });

  try {
    const response = await bedrock.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const aiText = responseBody.output.message.content[0].text.trim();
    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    const ideas = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!ideas || !Array.isArray(ideas)) {
      return respond(500, { error: { code: 'PARSE_FAILED', message: 'Could not generate ideas. Try again.' } });
    }
    return respond(200, { ideas });
  } catch (e) {
    console.error('[content-ideas] AI error:', e.message);
    return respond(500, { error: { code: 'AI_FAILED', message: 'Could not generate ideas. Try again.' } });
  }
}

// Cached OpenAI key
let openAiKey = null;
async function getOpenAiKey() {
  if (openAiKey) return openAiKey;
  const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
  const sm = new SecretsManagerClient({ region: 'us-east-1' });
  const result = await sm.send(new GetSecretValueCommand({ SecretId: 'SocialLeadGen/OpenAI' }));
  openAiKey = JSON.parse(result.SecretString).OPENAI_API_KEY;
  return openAiKey;
}

// ─── Server-side AI image entitlement ──────────────────────────────────────────
// SECURITY: previously /content/generate-image had NO tier check, so any authenticated user
// (including free Nest) could call it directly and incur real OpenAI cost. The web UI gate is
// UX only. This is the authoritative check, shared by text-to-image and AI photo editing.
//
// Tier normalization mirrors packages/shared normalizeTier (summit→team, legacy
// base/growth/flight/pro→soar, nest/none/expired/''/unknown→free). An expired trial is free.
// AI images are a PAID feature (Soar / Summit). Image calls are metered on a SEPARATE monthly
// counter (aiImagesUsed + aiImagesMonth) so image spend is bounded independently of text.
const AI_IMAGE_MONTHLY_LIMITS = { soar: 40, team: 100 };

function normalizeTierServer(raw, profile) {
  const t = (raw ?? 'free').toString().toLowerCase();
  // An active trial whose end has passed is treated as free.
  if (profile && profile.subscriptionStatus === 'trial' && profile.trialEndsAt &&
      new Date(profile.trialEndsAt).getTime() < Date.now()) return 'free';
  if (t === 'summit') return 'team';
  if (t === 'base' || t === 'growth' || t === 'flight' || t === 'pro') return 'soar';
  if (t === 'soar' || t === 'team') return t;
  return 'free';
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Returns { ok: true, tier, used, limit } or { ok: false, response }.
async function checkAiImageEntitlement(userId) {
  let profile;
  try {
    const r = await dynamo.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'PROFILE' },
      Limit: 1,
    }));
    profile = (r.Items || [])[0] || {};
  } catch (e) {
    // Fail CLOSED: if we cannot read the entitlement we must not spend on AI.
    console.error('[ai-image] entitlement read failed (denying):', e.message);
    return { ok: false, response: respond(503, { error: { code: 'ENTITLEMENT_UNAVAILABLE', message: 'Could not verify your plan. Please try again.' } }) };
  }
  const tier = normalizeTierServer(profile.subscriptionTier, profile);
  if (tier === 'free') {
    return { ok: false, response: respond(403, { error: { code: 'AI_IMAGE_REQUIRES_PAID_PLAN', message: 'AI images are included with Soar and Summit plans.' } }) };
  }
  const limit = AI_IMAGE_MONTHLY_LIMITS[tier];
  const month = currentMonthKey();
  const used = profile.aiImagesMonth === month ? (profile.aiImagesUsed || 0) : 0;
  if (used >= limit) {
    return { ok: false, response: respond(403, { error: { code: 'AI_IMAGE_LIMIT_REACHED', message: `You've used all ${limit} AI images this month on your plan.`, limit, used } }) };
  }
  return { ok: true, tier, used, limit, month };
}

// Increment the monthly image counter, resetting it when the month rolls over.
async function recordAiImageUse(userId, month) {
  try {
    await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      // If the stored month differs, start the count fresh at 1; otherwise increment.
      UpdateExpression: 'SET aiImagesUsed = if_not_exists(aiImagesUsed, :zero) + :one, aiImagesMonth = :m',
      ConditionExpression: 'attribute_not_exists(aiImagesMonth) OR aiImagesMonth = :m',
      ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':m': month },
    }));
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      // New month — reset the counter to 1.
      await dynamo.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
        UpdateExpression: 'SET aiImagesUsed = :one, aiImagesMonth = :m',
        ExpressionAttributeValues: { ':one': 1, ':m': month },
      }));
    } else {
      // Metering failure must not fail the user's already-generated image; log it.
      console.error('[ai-image] usage record failed:', e.message);
    }
  }
}

// POST /content/generate-image — text-to-image via OpenAI gpt-image-1
async function handleGenerateImage(userId, body) {
  const rawPrompt = (body && body.prompt) || '';
  const tradeName = (body && body.tradeName) || '';
  const style = (body && body.style) || 'photo';
  if (!rawPrompt.trim()) {
    return respond(400, { error: { code: 'VALIDATION_ERROR', message: 'A prompt is required' } });
  }

  // Authoritative server-side entitlement (paid plans only, monthly cap). Checked BEFORE any
  // OpenAI call so a free/over-limit user never incurs cost.
  const ent = await checkAiImageEntitlement(userId);
  if (!ent.ok) return ent.response;

  // Enrich the prompt for better marketing-quality output
  const styleHint = {
    photo: 'a professional, high-quality, realistic photograph, well-lit, marketing quality',
    illustration: 'a clean modern flat illustration with vibrant colors',
    bold: 'a bold, eye-catching social media graphic with high contrast',
  }[style] || 'a professional photograph';

  const fullPrompt = `${styleHint} of: ${rawPrompt.trim()}${tradeName ? `, relevant to a ${tradeName} business` : ''}. Do not include any text or words in the image.`;

  let base64Image = null;
  try {
    const apiKey = await getOpenAiKey();
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      // This account has gpt-image-1 (not dall-e-3). Measured timings:
      // low ~13-16s, medium ~19s, high ~39s. 'high' exceeds the 29s API Gateway
      // cap, so 'medium' is the best quality that still returns in time.
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: fullPrompt.slice(0, 4000),
        n: 1,
        size: '1024x1024',
        quality: 'medium',
      }),
      signal: AbortSignal.timeout(27000), // return before the gateway 29s cap
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[gen-image] OpenAI error:', JSON.stringify(data));
      const msg = data?.error?.message || 'Image generation failed';
      return respond(500, { error: { code: 'IMAGE_FAILED', message: msg } });
    }
    base64Image = data?.data?.[0]?.b64_json;
    // Some responses return a URL instead of base64
    if (!base64Image && data?.data?.[0]?.url) {
      await recordAiImageUse(userId, ent.month); // meter only successful images
      return respond(200, { url: data.data[0].url });
    }
  } catch (e) {
    console.error('[gen-image] OpenAI request failed:', e.message);
    return respond(500, { error: { code: 'IMAGE_FAILED', message: 'Could not reach image service. Try again.' } });
  }

  if (!base64Image) {
    return respond(500, { error: { code: 'IMAGE_FAILED', message: 'No image returned. Try again.' } });
  }

  // Meter only successful generations (failed/empty calls above are not counted).
  await recordAiImageUse(userId, ent.month);

  // Return the image inline as a data URL so it renders immediately in the browser
  // (no dependency on the media bucket being publicly readable). Also upload to S3
  // best-effort so there's a persistent copy, but the data URL is what the UI shows.
  const dataUrl = `data:image/png;base64,${base64Image}`;
  try {
    const buffer = Buffer.from(base64Image, 'base64');
    const key = `ai-images/${userId}/${randomUUID()}.png`;
    await s3.send(new PutObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'image/png',
    }));
    return respond(200, { dataUrl, key });
  } catch (e) {
    console.error('[gen-image] S3 upload failed (returning inline image):', e.message);
    return respond(200, { dataUrl });
  }
}

// ─── POST /content/edit-image — AI photo editing (Phase 2) ──────────────────────
// Natural-language edits to a user's photo: add / remove / replace / modify objects,
// background removal, lighting changes. Uses OpenAI gpt-image-1 /v1/images/edits.
//
// Design rules (per product spec):
//   • Only ACTUAL photo changes come here. Text, logos, and layout stay as editable canvas
//     layers on the client and never hit this endpoint (no wasted AI cost, exact typography).
//   • The ORIGINAL is never overwritten — the client keeps it and stores each edit as a new
//     revision; this endpoint is stateless and simply returns a new image.
//   • Same server-side entitlement + monthly cap as text-to-image (paid plans only, fail
//     closed), checked BEFORE the OpenAI call so free/over-limit users incur no cost.
const MAX_EDIT_IMAGE_BYTES = 4 * 1024 * 1024; // OpenAI edits limit for PNG inputs
const MAX_INSTRUCTION_CHARS = 1000;

function parseImageDataUrl(dataUrl) {
  const m = /^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const mime = m[1] === 'image/jpg' ? 'image/jpeg' : m[1];
  return { mime, buffer: Buffer.from(m[3], 'base64') };
}

async function handleEditImage(userId, body) {
  const instruction = String((body && body.instruction) || '').trim();
  if (!instruction) {
    return respond(400, { error: { code: 'VALIDATION_ERROR', message: 'Tell Wingman what to change.' } });
  }
  if (instruction.length > MAX_INSTRUCTION_CHARS) {
    return respond(400, { error: { code: 'VALIDATION_ERROR', message: `Keep the instruction under ${MAX_INSTRUCTION_CHARS} characters.` } });
  }
  const parsed = parseImageDataUrl(body && body.image);
  if (!parsed) {
    return respond(400, { error: { code: 'VALIDATION_ERROR', message: 'Upload a PNG, JPG, or WEBP photo to edit.' } });
  }
  if (parsed.buffer.length > MAX_EDIT_IMAGE_BYTES) {
    return respond(413, { error: { code: 'IMAGE_TOO_LARGE', message: 'That photo is too large to edit (max 4 MB). Try a smaller one.' } });
  }

  const ent = await checkAiImageEntitlement(userId);
  if (!ent.ok) return ent.response;

  // Keep the photo realistic and preserve everything not explicitly mentioned. We also ask the
  // model NOT to add text — exact text/phone numbers belong in editable canvas layers.
  const prompt = `${instruction}\n\nKeep everything else in the photo exactly the same — same subject, composition, perspective, and lighting unless the instruction says otherwise. Keep it photorealistic. Do not add any text, words, letters, or numbers to the image.`;

  let base64Image = null;
  try {
    const apiKey = await getOpenAiKey();
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', prompt.slice(0, 4000));
    form.append('n', '1');
    form.append('size', '1024x1024');
    form.append('quality', 'medium');
    const ext = parsed.mime === 'image/jpeg' ? 'jpg' : parsed.mime.split('/')[1];
    form.append('image', new Blob([parsed.buffer], { type: parsed.mime }), `source.${ext}`);

    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` }, // FormData sets its own multipart boundary
      body: form,
      signal: AbortSignal.timeout(27000), // return before the API Gateway 29s cap
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[edit-image] OpenAI error:', JSON.stringify(data));
      const code = data?.error?.code === 'moderation_blocked' ? 'EDIT_BLOCKED' : 'EDIT_FAILED';
      const msg = code === 'EDIT_BLOCKED'
        ? 'That edit was blocked by a safety check. Try rewording it.'
        : (data?.error?.message || 'Photo edit failed. Try again.');
      return respond(code === 'EDIT_BLOCKED' ? 422 : 502, { error: { code, message: msg } });
    }
    base64Image = data?.data?.[0]?.b64_json || null;
  } catch (e) {
    const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    console.error('[edit-image] request failed:', e.message);
    return respond(504, { error: { code: timedOut ? 'EDIT_TIMEOUT' : 'EDIT_FAILED', message: timedOut ? 'The edit took too long. Try a simpler change.' : 'Could not reach the photo editor. Try again.' } });
  }

  if (!base64Image) {
    return respond(502, { error: { code: 'EDIT_FAILED', message: 'No edited image came back. Try again.' } });
  }

  // Meter only successful edits.
  await recordAiImageUse(userId, ent.month);

  const dataUrl = `data:image/png;base64,${base64Image}`;
  // Best-effort persistent copy as a NEW object (never overwrites the user's original).
  let key;
  try {
    key = `ai-edits/${userId}/${randomUUID()}.png`;
    await s3.send(new PutObjectCommand({ Bucket: MEDIA_BUCKET, Key: key, Body: Buffer.from(base64Image, 'base64'), ContentType: 'image/png' }));
  } catch (e) {
    console.error('[edit-image] S3 copy failed (returning inline image):', e.message);
    key = undefined;
  }
  return respond(200, { dataUrl, ...(key ? { key } : {}), imagesUsed: ent.used + 1, imagesLimit: ent.limit });
}

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

    if (method === 'POST' && path === '/content/ideas') {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleIdeas(userId, body);
    }

    if (method === 'POST' && path === '/content/generate-image') {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleGenerateImage(userId, body);
    }

    if (method === 'POST' && path === '/content/edit-image') {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleEditImage(userId, body);
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
