// Server-side paid-entitlement tests for the HawkEye Radar (opportunity-score) handler.
//
// Every route here powers Wingman AI, Hawk Insights, Hawk Memory, Social Proof, OCR,
// and the Industry Flight Plan — all paid (Soar+) features. The gate runs once at the
// top of the handler, so it protects EVERY route; we exercise a representative set
// (/radar/score, /radar/insights, /radar/memory, /flight-plan) plus the required tier
// matrix: Nest, active Soar trial, expired trial, paid Soar, paid Summit, unauthenticated.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const handlerPath = resolve(here, '../../../../lambdas/dist/opportunity-score/index.js');

let profile: any;
let provisioned: any = null;
let profileReadFails = false;
let bedrockText = '{"score":5,"classification":"lead","isLead":true,"followUpDays":2}';
const DAY = 24 * 60 * 60 * 1000;

function cmd(name: string) {
  return class { input: any; __name = name; constructor(input: any) { this.input = input; } };
}

function sdkStubs() {
  const doc = {
    send: async (c: any) => {
      if (c.__name === 'GetCommand') {
        // PROFILE lookups drive entitlement; anything else returns no item.
        if (c.input.Key?.SK === 'PROFILE') {
          if (profileReadFails) throw new Error('DynamoDB unavailable');
          return { Item: profile };
        }
        return { Item: undefined };
      }
      if (c.__name === 'PutCommand') {
        // Self-heal provisioning: record it and make the profile exist thereafter.
        if (String(c.input.Item?.SK) === 'PROFILE') {
          if (profile) { const e: any = new Error('exists'); e.name = 'ConditionalCheckFailedException'; throw e; }
          provisioned = c.input.Item;
          profile = c.input.Item;
        }
        return {};
      }
      if (c.__name === 'QueryCommand') return { Items: [] };
      return {};
    },
  };
  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: { from: () => doc },
      GetCommand: cmd('GetCommand'),
      PutCommand: cmd('PutCommand'),
      QueryCommand: cmd('QueryCommand'),
      UpdateCommand: cmd('UpdateCommand'),
      DeleteCommand: cmd('DeleteCommand'),
    },
    '@aws-sdk/client-bedrock-runtime': {
      BedrockRuntimeClient: class {
        async send() {
          const payload = { output: { message: { content: [{ text: bedrockText }] } } };
          return { body: new TextEncoder().encode(JSON.stringify(payload)) };
        }
      },
      InvokeModelCommand: cmd('InvokeModelCommand'),
    },
    '@aws-sdk/client-secrets-manager': {
      SecretsManagerClient: class { async send() { return { SecretString: JSON.stringify({ OPENAI_API_KEY: 'x' }) }; } },
      GetSecretValueCommand: cmd('GetSecretValueCommand'),
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

function ev(method: string, path: string, sub: string | null = 'user-A', body: any = {}) {
  return {
    requestContext: { http: { method, path }, authorizer: sub ? { jwt: { claims: { sub } } } : undefined },
    body: JSON.stringify(body),
    queryStringParameters: { name: 'Jane' },
  };
}
function code(res: any) { try { return JSON.parse(res.body).error?.code; } catch { return undefined; } }

beforeEach(() => {
  profile = { subscriptionTier: 'soar', subscriptionStatus: 'active' };
  provisioned = null;
  profileReadFails = false;
});

describe('radar entitlement — paid gate on every route', () => {
  it('Nest (free) denied on /radar/score with 403 UPGRADE_REQUIRED', async () => {
    profile = { subscriptionTier: 'free', subscriptionStatus: 'none' };
    const res = await loadHandler()(ev('POST', '/radar/score', 'user-A', { postText: 'need a roofer' }));
    expect(res.statusCode).toBe(403);
    expect(code(res)).toBe('UPGRADE_REQUIRED');
  });

  it('Nest (free) denied on /radar/insights', async () => {
    profile = { subscriptionTier: 'free', subscriptionStatus: 'none' };
    const res = await loadHandler()(ev('GET', '/radar/insights'));
    expect(res.statusCode).toBe(403);
  });

  it('Nest (free) denied on /radar/memory (data route still part of Wingman)', async () => {
    profile = { subscriptionTier: 'free', subscriptionStatus: 'none' };
    const res = await loadHandler()(ev('GET', '/radar/memory'));
    expect(res.statusCode).toBe(403);
  });

  it('Nest (free) denied on /flight-plan', async () => {
    profile = { subscriptionTier: 'free', subscriptionStatus: 'none' };
    const res = await loadHandler()(ev('POST', '/flight-plan', 'user-A', { tradeName: 'Roofer' }));
    expect(res.statusCode).toBe(403);
  });

  it('active Soar trial allowed on /radar/score', async () => {
    profile = { subscriptionTier: 'soar', subscriptionStatus: 'trial', trialEndsAt: new Date(Date.now() + 3 * DAY).toISOString() };
    const res = await loadHandler()(ev('POST', '/radar/score', 'user-A', { postText: 'need a roofer' }));
    expect(res.statusCode).toBe(200);
  });

  it('expired trial denied on /radar/score', async () => {
    profile = { subscriptionTier: 'soar', subscriptionStatus: 'trial', trialEndsAt: new Date(Date.now() - DAY).toISOString() };
    const res = await loadHandler()(ev('POST', '/radar/score', 'user-A', { postText: 'need a roofer' }));
    expect(res.statusCode).toBe(403);
  });

  it('paid Soar allowed on /radar/score', async () => {
    profile = { subscriptionTier: 'soar', subscriptionStatus: 'active' };
    const res = await loadHandler()(ev('POST', '/radar/score', 'user-A', { postText: 'need a roofer' }));
    expect(res.statusCode).toBe(200);
  });

  it('paid Summit (team) allowed on /radar/insights', async () => {
    profile = { subscriptionTier: 'team', subscriptionStatus: 'active' };
    const res = await loadHandler()(ev('GET', '/radar/insights'));
    expect(res.statusCode).toBe(200);
  });

  it('legacy tier (growth) treated as paid', async () => {
    profile = { subscriptionTier: 'growth', subscriptionStatus: 'active' };
    const res = await loadHandler()(ev('POST', '/radar/score', 'user-A', { postText: 'need a roofer' }));
    expect(res.statusCode).toBe(200);
  });

  it('unauthenticated request rejected with 401', async () => {
    const res = await loadHandler()(ev('POST', '/radar/score', null, { postText: 'x' }));
    expect(res.statusCode).toBe(401);
  });

  it('fails closed with 503 if the profile cannot be read', async () => {
    profileReadFails = true;
    const res = await loadHandler()(ev('POST', '/radar/score', 'user-A', { postText: 'x' }));
    expect(res.statusCode).toBe(503);
    expect(code(res)).toBe('ENTITLEMENT_UNAVAILABLE');
  });

  it('REGRESSION: a brand-new account with NO profile is self-healed to a Soar trial and allowed', async () => {
    profile = null; // simulate the missing-profile bug (post-confirmation trigger did not run)
    const res = await loadHandler()(ev('POST', '/radar/score', 'user-A', { postText: 'need a roofer' }));
    expect(res.statusCode).toBe(200); // NOT 403 — the trial was provisioned on the fly
    // Exactly one Soar trial profile was created, single-grant via attribute_not_exists.
    expect(provisioned).toBeTruthy();
    expect(provisioned.subscriptionTier).toBe('soar');
    expect(provisioned.subscriptionStatus).toBe('trial');
    expect(provisioned.trialEndsAt).toBeTruthy();
  });
});
