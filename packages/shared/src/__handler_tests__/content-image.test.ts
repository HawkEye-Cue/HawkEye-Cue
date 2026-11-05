// AI image entitlement + Phase 2 photo-edit handler tests (content-handler).
//
// Proves the security/cost guarantees for /content/generate-image and /content/edit-image:
//   - SECURITY FIX: free/Nest users are blocked SERVER-SIDE (403) and OpenAI is NEVER called.
//     (Previously /content/generate-image had no tier check — the UI gate was the only guard.)
//   - Paid users (Soar, Summit incl. the 'summit' alias, legacy 'pro') are allowed.
//   - An expired trial is treated as free.
//   - Monthly image cap is enforced; a new month resets the count.
//   - Fail CLOSED: if the profile can't be read, deny (503) and do not call OpenAI.
//   - Usage is metered ONLY on successful images, never on failures.
//   - Edit validation: missing instruction / bad image / too large are rejected before cost.
//   - Edits are written as NEW S3 objects (never overwrite the user's original).
//   - Moderation blocks surface as a clean 422, timeouts as 504.
//
// AWS SDKs are stubbed via the require-cache technique; global fetch is stubbed to capture
// OpenAI calls so no real request is ever made.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { evalCondition, applyUpdate, ccf } from './ddbExpr';

const here = dirname(fileURLToPath(import.meta.url));
const handlerPath = resolve(here, '../../../../lambdas/dist/content-handler/index.js');

const DAY = 24 * 60 * 60 * 1000;
const thisMonth = (() => { const d = new Date(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();

let profile: any;
let profileReadFails: boolean;
let updates: any[];
let s3Puts: any[];
let openAiCalls: { url: string; init: any }[];
let openAiResponse: { ok: boolean; status: number; body: any } | 'throw-timeout';
let bedrockCalls = 0;
let bedrockFails = false;

// A tiny valid PNG data URL (1x1) used as the "photo" to edit.
const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function cmd(name: string) {
  return class { input: any; __name = name; constructor(input: any) { this.input = input; } };
}

function sdkStubs() {
  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: {
        from: () => ({
          send: async (c: any) => {
            if (c.__name === 'QueryCommand') {
              if (profileReadFails) throw new Error('DynamoDB unavailable');
              return { Items: profile ? [profile] : [] };
            }
            if (c.__name === 'UpdateCommand') {
              // Faithful conditional write: evaluate the real ConditionExpression, then apply.
              const { ConditionExpression, UpdateExpression, ExpressionAttributeValues: v, ExpressionAttributeNames: n } = c.input;
              if (!evalCondition(ConditionExpression, profile, v, n)) throw ccf();
              profile = applyUpdate(profile, UpdateExpression, v, n);
              updates.push(c.input);
              return { Attributes: profile };
            }
            return {};
          },
        }),
      },
      PutCommand: cmd('PutCommand'),
      QueryCommand: cmd('QueryCommand'),
      DeleteCommand: cmd('DeleteCommand'),
      UpdateCommand: cmd('UpdateCommand'),
    },
    '@aws-sdk/client-s3': {
      S3Client: class { async send(c: any) { s3Puts.push(c.input); return {}; } },
      PutObjectCommand: cmd('PutObjectCommand'),
    },
    '@aws-sdk/s3-request-presigner': { getSignedUrl: async () => 'https://signed' },
    '@aws-sdk/client-bedrock-runtime': {
      BedrockRuntimeClient: class {
        async send() {
          bedrockCalls++;
          await new Promise((r) => setTimeout(r, 5)); // let concurrent requests interleave
          if (bedrockFails) throw new Error('bedrock down');
          const text = JSON.stringify({ facebook: 'Storm season is here.' });
          return { body: new TextEncoder().encode(JSON.stringify({ output: { message: { content: [{ text }] } } })) };
        }
      },
      InvokeModelCommand: cmd('InvokeModelCommand'),
    },
    '@aws-sdk/client-secrets-manager': {
      SecretsManagerClient: class { async send() { return { SecretString: JSON.stringify({ OPENAI_API_KEY: 'sk-test' }) }; } },
      GetSecretValueCommand: cmd('GetSecretValueCommand'),
    },
  } as Record<string, any>;
}

function loadHandler() {
  process.env.TABLE_NAME = 'TestTable';
  process.env.MEDIA_BUCKET = 'test-bucket';
  const source = readFileSync(handlerPath, 'utf8');
  const stubs = sdkStubs();
  const realRequire = createRequire(handlerPath);
  const m = new Module(handlerPath, undefined as any);
  m.filename = handlerPath;
  (m as any).paths = (Module as any)._nodeModulePaths(dirname(handlerPath));
  (m as any).require = ((id: string) => (id in stubs ? stubs[id] : realRequire(id))) as unknown as NodeRequire;
  (m as any)._compile(source, handlerPath);
  return (m.exports as any).handler as (e: any) => Promise<any>;
}

function ev(path: string, body: any) {
  return {
    requestContext: { http: { method: 'POST', path }, authorizer: { jwt: { claims: { sub: 'user-1' } } } },
    body: JSON.stringify(body),
  };
}

beforeEach(() => {
  profile = { PK: 'USER#user-1', SK: 'PROFILE', subscriptionTier: 'soar', subscriptionStatus: 'active' };
  profileReadFails = false;
  updates = [];
  s3Puts = [];
  openAiCalls = [];
  bedrockCalls = 0;
  bedrockFails = false;
  openAiResponse = { ok: true, status: 200, body: { data: [{ b64_json: 'RURJVEVE' }] } };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    openAiCalls.push({ url, init });
    await new Promise((r) => setTimeout(r, 5)); // let concurrent requests interleave realistically
    if (openAiResponse === 'throw-timeout') { const e: any = new Error('timed out'); e.name = 'TimeoutError'; throw e; }
    const r = openAiResponse;
    return { ok: r.ok, status: r.status, json: async () => r.body } as any;
  }));
});

// ─── Server-side entitlement (SECURITY FIX) ──────────────────────────────────────
describe('AI image entitlement — server-side (both endpoints)', () => {
  for (const path of ['/content/generate-image', '/content/edit-image']) {
    const body = path === '/content/edit-image' ? { instruction: 'remove the trash cans', image: PNG_1x1 } : { prompt: 'a roof' };

    it(`${path}: FREE tier is blocked (403) and OpenAI is NEVER called`, async () => {
      profile.subscriptionTier = 'free';
      const res = await loadHandler()(ev(path, body));
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error.code).toBe('AI_IMAGE_REQUIRES_PAID_PLAN');
      expect(openAiCalls).toHaveLength(0);
    });

    it(`${path}: 'nest' and unknown tiers are treated as free (blocked)`, async () => {
      for (const t of ['nest', 'expired', '', 'mystery-tier']) {
        profile.subscriptionTier = t;
        openAiCalls = [];
        const res = await loadHandler()(ev(path, body));
        expect(res.statusCode).toBe(403);
        expect(openAiCalls).toHaveLength(0);
      }
    });

    it(`${path}: an EXPIRED trial is free (blocked)`, async () => {
      profile = { ...profile, subscriptionTier: 'soar', subscriptionStatus: 'trial', trialEndsAt: new Date(Date.now() - DAY).toISOString() };
      const res = await loadHandler()(ev(path, body));
      expect(res.statusCode).toBe(403);
      expect(openAiCalls).toHaveLength(0);
    });

    it(`${path}: paid tiers are allowed (soar, team, summit alias, legacy pro)`, async () => {
      for (const t of ['soar', 'team', 'summit', 'pro']) {
        profile = { PK: 'USER#user-1', SK: 'PROFILE', subscriptionTier: t, subscriptionStatus: 'active' };
        const res = await loadHandler()(ev(path, body));
        expect(res.statusCode).toBe(200);
      }
    });

    it(`${path}: fails CLOSED (503) when the profile cannot be read — no OpenAI call`, async () => {
      profileReadFails = true;
      const res = await loadHandler()(ev(path, body));
      expect(res.statusCode).toBe(503);
      expect(openAiCalls).toHaveLength(0);
    });

    it(`${path}: monthly cap enforced (Soar = 40) — no OpenAI call at the cap`, async () => {
      profile.aiImagesUsed = 40;
      profile.aiImagesMonth = thisMonth;
      const res = await loadHandler()(ev(path, body));
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error.code).toBe('AI_IMAGE_LIMIT_REACHED');
      expect(openAiCalls).toHaveLength(0);
    });

    it(`${path}: last month's usage does not count against this month`, async () => {
      profile.aiImagesUsed = 40;
      profile.aiImagesMonth = '1999-01';
      const res = await loadHandler()(ev(path, body));
      expect(res.statusCode).toBe(200);
      // Counter reset to 1 for the new month.
      expect(profile.aiImagesUsed).toBe(1);
      expect(profile.aiImagesMonth).toBe(thisMonth);
    });

    it(`${path}: an OpenAI failure is REFUNDED (reserve then refund → net usage unchanged)`, async () => {
      profile.aiImagesUsed = 7;
      profile.aiImagesMonth = thisMonth;
      openAiResponse = { ok: false, status: 500, body: { error: { message: 'boom' } } };
      const res = await loadHandler()(ev(path, body));
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      expect(profile.aiImagesUsed).toBe(7); // slot was reserved, then given back
    });

    it(`${path}: an OpenAI network error / timeout is refunded`, async () => {
      profile.aiImagesUsed = 3;
      profile.aiImagesMonth = thisMonth;
      openAiResponse = 'throw-timeout';
      const res = await loadHandler()(ev(path, body));
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      expect(profile.aiImagesUsed).toBe(3);
    });

    it(`${path}: a successful image increments the monthly counter by exactly 1`, async () => {
      const res = await loadHandler()(ev(path, body));
      expect(res.statusCode).toBe(200);
      expect(profile.aiImagesUsed).toBe(1);
    });
  }
});

// ─── Phase 2: /content/edit-image behavior ───────────────────────────────────────
describe('/content/edit-image — AI photo editing', () => {
  it('calls the OpenAI EDITS endpoint (not generations) with multipart form data', async () => {
    const res = await loadHandler()(ev('/content/edit-image', { instruction: 'remove the trash cans', image: PNG_1x1 }));
    expect(res.statusCode).toBe(200);
    expect(openAiCalls).toHaveLength(1);
    expect(openAiCalls[0].url).toBe('https://api.openai.com/v1/images/edits');
    const form = openAiCalls[0].init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    // Model id is configurable (OPENAI_IMAGE_MODEL) and defaults to the current GPT Image
    // model. gpt-image-1 was retired by OpenAI; assert the family, not a pinned version.
    expect(String(form.get('model'))).toMatch(/^gpt-image-/);
    expect(String(form.get('prompt'))).toContain('remove the trash cans');
    expect(form.get('image')).toBeTruthy();
  });

  it('instructs the model to preserve the rest of the photo and NOT add text', async () => {
    await loadHandler()(ev('/content/edit-image', { instruction: 'brighten the sky', image: PNG_1x1 }));
    const prompt = String((openAiCalls[0].init.body as FormData).get('prompt'));
    expect(prompt).toMatch(/Keep everything else/i);
    expect(prompt).toMatch(/Do not add any text/i);
  });

  it('returns the edited image as a data URL', async () => {
    const res = await loadHandler()(ev('/content/edit-image', { instruction: 'remove the car', image: PNG_1x1 }));
    const b = JSON.parse(res.body);
    expect(b.dataUrl).toBe('data:image/png;base64,RURJVEVE');
  });

  it('stores the edit as a NEW S3 object under ai-edits/ (never overwrites the original)', async () => {
    await loadHandler()(ev('/content/edit-image', { instruction: 'remove the car', image: PNG_1x1 }));
    expect(s3Puts).toHaveLength(1);
    expect(s3Puts[0].Key).toMatch(/^ai-edits\/user-1\/[0-9a-f-]+\.png$/);
  });

  it('rejects a missing instruction (400) without calling OpenAI', async () => {
    const res = await loadHandler()(ev('/content/edit-image', { instruction: '   ', image: PNG_1x1 }));
    expect(res.statusCode).toBe(400);
    expect(openAiCalls).toHaveLength(0);
  });

  it('rejects a non-image / malformed payload (400) without calling OpenAI', async () => {
    for (const image of ['not-a-data-url', 'data:text/plain;base64,aGVsbG8=', '']) {
      openAiCalls = [];
      const res = await loadHandler()(ev('/content/edit-image', { instruction: 'x', image }));
      expect(res.statusCode).toBe(400);
      expect(openAiCalls).toHaveLength(0);
    }
  });

  it('rejects an oversized photo (413) without calling OpenAI', async () => {
    const big = 'data:image/png;base64,' + Buffer.alloc(4 * 1024 * 1024 + 10).toString('base64');
    const res = await loadHandler()(ev('/content/edit-image', { instruction: 'x', image: big }));
    expect(res.statusCode).toBe(413);
    expect(openAiCalls).toHaveLength(0);
  });

  it('rejects an over-long instruction (400)', async () => {
    const res = await loadHandler()(ev('/content/edit-image', { instruction: 'a'.repeat(1001), image: PNG_1x1 }));
    expect(res.statusCode).toBe(400);
    expect(openAiCalls).toHaveLength(0);
  });

  it('surfaces a moderation block as a clean 422 (and does not meter it)', async () => {
    openAiResponse = { ok: false, status: 400, body: { error: { code: 'moderation_blocked', message: 'blocked' } } };
    const res = await loadHandler()(ev('/content/edit-image', { instruction: 'x', image: PNG_1x1 }));
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error.code).toBe('EDIT_BLOCKED');
    expect(profile.aiImagesUsed ?? 0).toBe(0); // reserved then refunded — net usage unchanged
  });

  it('surfaces a timeout as a clean 504 (and does not meter it)', async () => {
    openAiResponse = 'throw-timeout';
    const res = await loadHandler()(ev('/content/edit-image', { instruction: 'x', image: PNG_1x1 }));
    expect(res.statusCode).toBe(504);
    expect(JSON.parse(res.body).error.code).toBe('EDIT_TIMEOUT');
    expect(profile.aiImagesUsed ?? 0).toBe(0); // reserved then refunded — net usage unchanged
  });

  it('rejects unauthenticated requests (401)', async () => {
    const res = await loadHandler()({ requestContext: { http: { method: 'POST', path: '/content/edit-image' } }, body: '{}' });
    expect(res.statusCode).toBe(401);
  });
});

// ─── Concurrency: quotas cannot be bypassed by parallel requests (item 8) ────────
// The stub's UpdateCommand evaluates the REAL ConditionExpression and applies it
// synchronously per call, exactly like DynamoDB's atomic conditional write — so these
// tests genuinely exercise the reservation logic under interleaved requests.
describe('AI image quota — concurrency safety', () => {
  it('N parallel image requests at the cap boundary admit EXACTLY the remaining slots', async () => {
    // 38 used, cap 40 → only 2 of 10 simultaneous requests may succeed.
    profile.aiImagesUsed = 38;
    profile.aiImagesMonth = thisMonth;
    const results = await Promise.all(
      Array.from({ length: 10 }, () => loadHandler()(ev('/content/generate-image', { prompt: 'a roof' }))),
    );
    const ok = results.filter((r) => r.statusCode === 200).length;
    const capped = results.filter((r) => r.statusCode === 403).length;
    expect(ok).toBe(2);
    expect(capped).toBe(8);
    expect(profile.aiImagesUsed).toBe(40); // never exceeds the cap
    expect(openAiCalls).toHaveLength(2);   // only admitted requests reach OpenAI (cost bounded)
  });

  it('parallel requests from a FRESH account (no counter yet) still respect the cap', async () => {
    delete profile.aiImagesUsed;
    delete profile.aiImagesMonth;
    // team cap = 100; fire 5 — all should succeed and the counter lands exactly at 5.
    profile.subscriptionTier = 'team';
    const results = await Promise.all(
      Array.from({ length: 5 }, () => loadHandler()(ev('/content/edit-image', { instruction: 'remove the car', image: PNG_1x1 }))),
    );
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    expect(profile.aiImagesUsed).toBe(5);
    expect(profile.aiImagesMonth).toBe(thisMonth);
  });

  it('text generation: N parallel requests at the cap admit exactly the remaining slots', async () => {
    // free tier text cap = 2; 1 used → only 1 of 6 parallel may succeed.
    profile.subscriptionTier = 'free';
    profile.aiGenerationsUsed = 1;
    const results = await Promise.all(
      Array.from({ length: 6 }, () => loadHandler()(ev('/content/generate', { tone: 'professional', postType: 'Educational', platforms: ['facebook'] }))),
    );
    const ok = results.filter((r) => r.statusCode === 201).length;
    expect(ok).toBe(1);
    expect(profile.aiGenerationsUsed).toBe(2); // exactly at the cap, never over
  });

  it('a failed text generation refunds its reserved slot', async () => {
    profile.subscriptionTier = 'free';
    profile.aiGenerationsUsed = 0;
    bedrockFails = true;
    const res = await loadHandler()(ev('/content/generate', { tone: 'professional', postType: 'Educational', platforms: ['facebook'] }));
    expect(res.statusCode).toBe(500);
    expect(profile.aiGenerationsUsed).toBe(0); // reserved, generation failed, refunded
  });
});
