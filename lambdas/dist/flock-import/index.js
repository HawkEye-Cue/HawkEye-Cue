'use strict';

/**
 * flock-import — Smart Flock Import (image-capable extraction).
 *
 * POST /flock/import  { images: [{ data: <base64>, format: 'png'|'jpeg'|'webp'|'gif' }] }
 *
 * Takes one or more screenshots of Facebook group pages / group rules and uses the
 * multimodal Nova Lite model to extract, per group:
 *   - name            (group name as shown)
 *   - postingDays     (array of 0..6, Sun..Sat) ONLY when the rules explicitly state
 *                      which days business/promo posts are permitted
 *   - anyday          (true ONLY when the rules explicitly allow promo on any day)
 *   - frequencyLimit  (free-text, e.g. "once per week"; '' if unknown)
 *   - restrictions    (free-text summary of relevant restrictions; '' if none seen)
 *   - rulesFound      (boolean) — did the screenshots contain explicit promo rules?
 *   - warning         (string) — set when rules are missing/unclear
 *
 * SAFETY: we NEVER assume promotion is allowed when rules are missing. If the model
 * cannot find explicit permitted days, postingDays is [] and anyday is false, with a
 * warning telling the user to confirm the group's rules before scheduling. This handler
 * does NOT post to Facebook, schedule anything, or scrape — it only parses user-supplied
 * screenshots and returns structured suggestions for the user to review and correct.
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });

const MODEL_ID = 'amazon.nova-lite-v1:0';
const MAX_IMAGES = 8;                 // cap per request (cost + payload safety)
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per image (decoded)
const ALLOWED_FORMATS = new Set(['png', 'jpeg', 'jpg', 'webp', 'gif']);

function respond(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function err(statusCode, code, message) {
  return respond(statusCode, { error: { code, message } });
}
function getUserId(event) {
  return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Coerce the model's day output into a clean, de-duplicated 0..6 array. Accepts either
// numbers (0..6) or day names ("Mon"/"monday"). Anything unrecognized is dropped —
// we never widen access by guessing.
function normalizeDays(raw) {
  if (!Array.isArray(raw)) return [];
  const out = new Set();
  for (const d of raw) {
    if (typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6) {
      out.add(d);
    } else if (typeof d === 'string') {
      const s = d.trim().toLowerCase();
      const idx = DAY_NAMES.findIndex((n) => n === s || n.startsWith(s.slice(0, 3)));
      if (idx >= 0) out.add(idx);
    }
  }
  return [...out].sort((a, b) => a - b);
}

// Build the vision prompt content: the instruction text followed by each image.
function buildContent(images) {
  const instruction = `You are reading screenshots of Facebook GROUP pages and their posting RULES. A business owner wants to know, for each distinct group shown, when they are allowed to post promotional/business content.

Return STRICT JSON (no prose, no markdown) in this exact shape:
{
  "groups": [
    {
      "name": "<the group name exactly as shown, or an empty string if not visible>",
      "permittedDays": [<zero or more of: "Sunday".."Saturday" that the rules EXPLICITLY allow promo/business posts; empty if the rules do not clearly state specific days>],
      "anyDay": <true ONLY if the rules explicitly say promo is allowed any day; otherwise false>,
      "frequencyLimit": "<e.g. 'once per week', 'one promo per day'; empty string if not stated>",
      "restrictions": "<short plain summary of relevant restrictions, e.g. 'self-promo only on Fridays, no DMs'; empty string if none seen>",
      "rulesFound": <true if the screenshots contained explicit promo/self-promotion rules for this group; false otherwise>
    }
  ]
}

CRITICAL RULES:
- NEVER assume promotion is allowed. If a group's screenshots do NOT clearly state when promo is permitted, set permittedDays to [], anyDay to false, and rulesFound to false.
- Only set anyDay true if the rules literally permit promo on any/every day.
- Only include a day in permittedDays if the rules specifically allow business/promo content on that day (e.g. "Self-promo Saturdays only" => ["Saturday"]).
- Do not invent group names. If the name is not legible, use an empty string.
- One object per distinct group. If multiple screenshots are the same group, merge them into one object.`;

  const content = [{ text: instruction }];
  for (const img of images) {
    content.push({ image: { format: img.format, source: { bytes: img.data } } });
  }
  return content;
}

// Map a single model-extracted group to the client's reviewable suggestion shape.
// Enforces the never-assume rule at the boundary regardless of what the model returned.
function toSuggestion(g) {
  const name = typeof g.name === 'string' ? g.name.trim() : '';
  const rulesFound = g.rulesFound === true;
  // Only honor days/anyDay when the model actually found rules. Otherwise force empty.
  const permittedDays = rulesFound ? normalizeDays(g.permittedDays) : [];
  const anyday = rulesFound ? g.anyDay === true : false;
  const frequencyLimit = typeof g.frequencyLimit === 'string' ? g.frequencyLimit.trim() : '';
  const restrictions = typeof g.restrictions === 'string' ? g.restrictions.trim() : '';

  // Build a user-facing warning whenever we could not establish permitted timing.
  let warning = '';
  if (!rulesFound) {
    warning = 'No posting rules were detected — set the allowed days yourself after checking this group’s rules. Promotion is not assumed.';
  } else if (!anyday && permittedDays.length === 0) {
    warning = 'Rules were found but no specific promo days were clear — confirm and set the allowed days before scheduling.';
  }

  return { name, postingDays: permittedDays, anyday, frequencyLimit, restrictions, rulesFound, warning };
}

async function extractGroups(images) {
  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      messages: [{ role: 'user', content: buildContent(images) }],
      inferenceConfig: { maxTokens: 2000, temperature: 0.2 },
    }),
  });

  const response = await bedrock.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const aiText = (responseBody.output?.message?.content?.[0]?.text || '').trim();

  const jsonMatch = aiText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse AI response');
  const parsed = JSON.parse(jsonMatch[0]);
  const groups = Array.isArray(parsed.groups) ? parsed.groups : [];
  return groups.map(toSuggestion).filter((g) => g.name || g.rulesFound);
}

// Validate the incoming images array. Returns { images } or an error response.
function validateImages(body) {
  const images = body && Array.isArray(body.images) ? body.images : null;
  if (!images || images.length === 0) {
    return { error: err(400, 'NO_IMAGES', 'Provide at least one screenshot.') };
  }
  if (images.length > MAX_IMAGES) {
    return { error: err(400, 'TOO_MANY_IMAGES', `A maximum of ${MAX_IMAGES} screenshots can be imported at once.`) };
  }
  const clean = [];
  for (const img of images) {
    const data = img && typeof img.data === 'string' ? img.data : '';
    let format = img && typeof img.format === 'string' ? img.format.toLowerCase() : '';
    if (format === 'jpg') format = 'jpeg';
    if (!data) return { error: err(400, 'INVALID_IMAGE', 'Each image must include base64 data.') };
    if (!ALLOWED_FORMATS.has(format)) {
      return { error: err(400, 'UNSUPPORTED_FORMAT', `Unsupported image format: ${format || 'unknown'}.`) };
    }
    // Rough decoded-size guard from base64 length (4 chars ≈ 3 bytes).
    const approxBytes = Math.floor((data.length * 3) / 4);
    if (approxBytes > MAX_IMAGE_BYTES) {
      return { error: err(400, 'IMAGE_TOO_LARGE', 'Each screenshot must be under 5 MB.') };
    }
    clean.push({ data, format });
  }
  return { images: clean };
}

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);
    if (!userId) return err(401, 'UNAUTHORIZED', 'Missing user identity');

    if (method === 'POST' && path === '/flock/import') {
      let body;
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        return err(400, 'INVALID_JSON', 'Request body must be valid JSON.');
      }

      const v = validateImages(body);
      if (v.error) return v.error;

      let suggestions;
      try {
        suggestions = await extractGroups(v.images);
      } catch (e) {
        console.error('flock-import extraction failed:', e.message);
        return err(502, 'EXTRACTION_FAILED', 'Could not read the screenshots. Try clearer images or add groups manually.');
      }

      return respond(200, { groups: suggestions });
    }

    return err(404, 'NOT_FOUND', `No route for ${method} ${path}`);
  } catch (e) {
    console.error('flock-import handler error:', e.message, e.stack);
    return err(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
