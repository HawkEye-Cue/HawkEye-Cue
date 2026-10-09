// Smart Flock Import handler tests.
//
// Proves the launch-critical safety guarantees of the AI extraction:
//   - When rules are MISSING, promotion is NEVER assumed: postingDays=[], anyday=false,
//     rulesFound=false, and a warning is surfaced.
//   - Explicitly permitted days are extracted and normalized to 0..6.
//   - "any day" is only honored when the model says so AND rules were found.
//   - Input validation: no images (400), too many images (400), unsupported format (400).
//   - A Bedrock failure surfaces as a clean 502 (not a crash, not a false success).
//   - Unauthorized requests are rejected (401).
//
// The Bedrock SDK is stubbed via the require-cache technique; a per-test `aiResponse`
// controls what the model "returns".

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const handlerPath = resolve(here, '../../../../lambdas/dist/flock-import/index.js');

let aiResponse: any = { groups: [] };
let bedrockShouldThrow = false;
let lastSentContent: any[] = [];
// Entitlement state: the PROFILE item returned for the authed user, and a read-failure flag.
let profile: any = { subscriptionTier: 'soar', subscriptionStatus: 'active' };
let provisioned: any = null;
let profileReadFails = false;
const DAY = 24 * 60 * 60 * 1000;

function cmd(name: string) {
  return class { input: any; __name = name; constructor(input: any) { this.input = input; } };
}

function sdkStubs() {
  return {
    '@aws-sdk/client-bedrock-runtime': {
      BedrockRuntimeClient: class {
        async send(c: any) {
          if (bedrockShouldThrow) throw new Error('bedrock unavailable');
          // Capture the content array (text + images) for assertions.
          try { lastSentContent = JSON.parse(c.input.body).messages[0].content; } catch { lastSentContent = []; }
          const text = JSON.stringify(aiResponse);
          const payload = { output: { message: { content: [{ text }] } } };
          return { body: new TextEncoder().encode(JSON.stringify(payload)) };
        }
      },
      InvokeModelCommand: cmd('InvokeModelCommand'),
    },
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: {
        from: () => ({
          send: async (c: any) => {
            if (c.__name === 'GetCommand') {
              if (profileReadFails) throw new Error('DynamoDB unavailable');
              return { Item: profile };
            }
            if (c.__name === 'PutCommand' && String(c.input.Item?.SK) === 'PROFILE') {
              if (profile) { const e: any = new Error('exists'); e.name = 'ConditionalCheckFailedException'; throw e; }
              provisioned = c.input.Item; profile = c.input.Item; return {};
            }
            if (c.__name === 'UpdateCommand' && String(c.input.Key?.SK) === 'PROFILE'
                && profile && !profile.trialEndsAt && !profile.stripeCustomerId && !profile.stripeSubscriptionId) {
              profile = { ...profile, subscriptionTier: 'soar', subscriptionStatus: 'trial', trialEndsAt: c.input.ExpressionAttributeValues?.[':te'] };
              provisioned = profile; return {};
            }
            return {};
          },
        }),
      },
      GetCommand: cmd('GetCommand'),
      PutCommand: cmd('PutCommand'),
      UpdateCommand: cmd('UpdateCommand'),
    },
  } as Record<string, any>;
}

function loadHandler() {
  process.env.TABLE_NAME = 'TestTable';
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

function img(format = 'png') { return { data: 'aGVsbG8=', format }; } // "hello" base64

function event(images: any, sub: string | null = 'user-A') {
  return {
    requestContext: { http: { method: 'POST', path: '/flock/import' }, authorizer: sub ? { jwt: { claims: { sub } } } : undefined },
    body: JSON.stringify({ images }),
  };
}

function body(res: any) { return JSON.parse(res.body); }

beforeEach(() => {
  aiResponse = { groups: [] };
  bedrockShouldThrow = false;
  lastSentContent = [];
  // Default to a paid, active Soar account so existing behavior tests reach the AI path.
  profile = { subscriptionTier: 'soar', subscriptionStatus: 'active' };
  provisioned = null;
  profileReadFails = false;
});

describe('flock-import — paid entitlement (Soar+ / active trial)', () => {
  it('expired-trial Nest is denied with 403 UPGRADE_REQUIRED before any AI call', async () => {
    // A legitimately-ended Nest user (expired trial) is NOT trial-eligible → denied.
    profile = { subscriptionTier: 'free', subscriptionStatus: 'expired', trialEndsAt: new Date(Date.now() - DAY).toISOString() };
    const handler = loadHandler();
    const res = await handler(event([img()]));
    expect(res.statusCode).toBe(403);
    expect(body(res).error.code).toBe('UPGRADE_REQUIRED');
    expect(lastSentContent).toHaveLength(0); // no Bedrock invocation
    expect(provisioned).toBeNull(); // not re-granted
  });

  it('STALE-NEST HEAL: a bare free profile (no trial/Stripe history) is upgraded to Soar trial and allowed', async () => {
    profile = { subscriptionTier: 'free', subscriptionStatus: 'none' };
    aiResponse = { groups: [{ name: 'G', permittedDays: ['Monday'], anyDay: false, rulesFound: true }] };
    const handler = loadHandler();
    const res = await handler(event([img()]));
    expect(res.statusCode).toBe(200);
    expect(provisioned.subscriptionTier).toBe('soar');
    expect(provisioned.subscriptionStatus).toBe('trial');
  });

  it('active Soar trial is allowed', async () => {
    profile = { subscriptionTier: 'soar', subscriptionStatus: 'trial', trialEndsAt: new Date(Date.now() + 3 * DAY).toISOString() };
    aiResponse = { groups: [{ name: 'G', permittedDays: ['Monday'], anyDay: false, rulesFound: true }] };
    const handler = loadHandler();
    const res = await handler(event([img()]));
    expect(res.statusCode).toBe(200);
  });

  it('expired trial is denied', async () => {
    profile = { subscriptionTier: 'soar', subscriptionStatus: 'trial', trialEndsAt: new Date(Date.now() - DAY).toISOString() };
    const handler = loadHandler();
    const res = await handler(event([img()]));
    expect(res.statusCode).toBe(403);
  });

  it('paid Summit (stored as team) is allowed', async () => {
    profile = { subscriptionTier: 'team', subscriptionStatus: 'active' };
    aiResponse = { groups: [{ name: 'G', permittedDays: ['Monday'], anyDay: false, rulesFound: true }] };
    const handler = loadHandler();
    const res = await handler(event([img()]));
    expect(res.statusCode).toBe(200);
  });

  it('unauthenticated request is rejected with 401', async () => {
    const handler = loadHandler();
    const res = await handler(event([img()], null));
    expect(res.statusCode).toBe(401);
  });

  it('fails closed with 503 if the subscription profile cannot be read', async () => {
    profileReadFails = true;
    const handler = loadHandler();
    const res = await handler(event([img()]));
    expect(res.statusCode).toBe(503);
    expect(body(res).error.code).toBe('ENTITLEMENT_UNAVAILABLE');
  });

  it('enforces a combined payload cap across images (cost guard)', async () => {
    // Two images each ~9 MB base64 → combined exceeds the 16 MB total cap.
    const big = { data: 'A'.repeat(12_000_000), format: 'png' };
    const handler = loadHandler();
    const res = await handler(event([big, big]));
    expect(res.statusCode).toBe(400);
    expect(['PAYLOAD_TOO_LARGE', 'IMAGE_TOO_LARGE']).toContain(body(res).error.code);
  });
});

describe('flock-import — never assume promotion when rules are missing', () => {
  it('a group with no rules comes back empty + unapproved-worthy with a warning', async () => {
    aiResponse = { groups: [{ name: 'Springfield Buy/Sell', permittedDays: [], anyDay: false, frequencyLimit: '', restrictions: '', rulesFound: false }] };
    const handler = loadHandler();
    const res = await handler(event([img()]));
    expect(res.statusCode).toBe(200);
    const g = body(res).groups[0];
    expect(g.postingDays).toEqual([]);
    expect(g.anyday).toBe(false);
    expect(g.rulesFound).toBe(false);
    expect(g.warning).toBeTruthy();
  });

  it('ignores model-supplied days when rulesFound is false (defense in depth)', async () => {
    // Even if the model contradicts itself (days present but rulesFound false), the
    // handler must NOT grant any posting days.
    aiResponse = { groups: [{ name: 'Sketchy', permittedDays: ['Monday', 'Tuesday'], anyDay: true, rulesFound: false }] };
    const handler = loadHandler();
    const res = await handler(event([img()]));
    const g = body(res).groups[0];
    expect(g.postingDays).toEqual([]);
    expect(g.anyday).toBe(false);
    expect(g.warning).toBeTruthy();
  });

  it('extracts and normalizes explicitly permitted days (names → 0..6)', async () => {
    aiResponse = { groups: [{ name: 'Moms of X', permittedDays: ['Saturday', 'Monday'], anyDay: false, frequencyLimit: 'once per week', restrictions: 'self-promo only', rulesFound: true }] };
    const handler = loadHandler();
    const res = await handler(event([img('jpeg')]));
    const g = body(res).groups[0];
    expect(g.postingDays).toEqual([1, 6]); // Mon=1, Sat=6, sorted + deduped
    expect(g.anyday).toBe(false);
    expect(g.rulesFound).toBe(true);
    expect(g.frequencyLimit).toBe('once per week');
    expect(g.warning).toBe(''); // timing is clear → no warning
  });

  it('honors anyDay only when rulesFound is true', async () => {
    aiResponse = { groups: [{ name: 'Open Promo Group', permittedDays: [], anyDay: true, rulesFound: true }] };
    const handler = loadHandler();
    const res = await handler(event([img()]));
    const g = body(res).groups[0];
    expect(g.anyday).toBe(true);
    expect(g.warning).toBe('');
  });

  it('warns when rules were found but no specific day is clear', async () => {
    aiResponse = { groups: [{ name: 'Unclear Group', permittedDays: [], anyDay: false, rulesFound: true }] };
    const handler = loadHandler();
    const res = await handler(event([img()]));
    const g = body(res).groups[0];
    expect(g.postingDays).toEqual([]);
    expect(g.anyday).toBe(false);
    expect(g.warning).toBeTruthy();
  });
});

describe('flock-import — input validation & robustness', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const handler = loadHandler();
    const res = await handler(event([img()], null));
    expect(res.statusCode).toBe(401);
  });

  it('rejects an empty images array with 400', async () => {
    const handler = loadHandler();
    const res = await handler(event([]));
    expect(res.statusCode).toBe(400);
    expect(body(res).error.code).toBe('NO_IMAGES');
  });

  it('rejects more than the max number of images with 400', async () => {
    const handler = loadHandler();
    const many = Array.from({ length: 9 }, () => img());
    const res = await handler(event(many));
    expect(res.statusCode).toBe(400);
    expect(body(res).error.code).toBe('TOO_MANY_IMAGES');
  });

  it('rejects an unsupported image format with 400', async () => {
    const handler = loadHandler();
    const res = await handler(event([img('bmp')]));
    expect(res.statusCode).toBe(400);
    expect(body(res).error.code).toBe('UNSUPPORTED_FORMAT');
  });

  it('passes each image into the model request content', async () => {
    aiResponse = { groups: [{ name: 'G', permittedDays: ['Monday'], anyDay: false, rulesFound: true }] };
    const handler = loadHandler();
    await handler(event([img(), img('jpeg')]));
    const imageParts = lastSentContent.filter((c: any) => c.image);
    expect(imageParts).toHaveLength(2);
    expect(imageParts[0].image.format).toBe('png');
    expect(imageParts[1].image.format).toBe('jpeg');
  });

  it('surfaces a Bedrock failure as a clean 502 (no false success)', async () => {
    bedrockShouldThrow = true;
    const handler = loadHandler();
    const res = await handler(event([img()]));
    expect(res.statusCode).toBe(502);
    expect(body(res).error.code).toBe('EXTRACTION_FAILED');
  });
});
