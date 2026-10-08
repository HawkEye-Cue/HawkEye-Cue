// Consistent new-user trial tests.
//
// Both profile-creation paths must grant the SAME one-time 7-day Soar trial, start it
// only once per account, never duplicate it, and never downgrade an existing paid
// subscriber:
//   - auth-post-confirmation (canonical Cognito trigger).
//   - social-accounts-handler getOrCreateUser (safety-net fallback).
//
// We assert on the PROFILE item written via a conditional PutCommand
// (attribute_not_exists(PK)), which is the mechanism guaranteeing single-grant.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, '../../../../lambdas/dist');

let existingProfile: any;       // what GetCommand returns (null = no profile yet)
let putItems: any[] = [];
let putConditionFails = boolRef(false); // simulate attribute_not_exists failing (profile exists)

function boolRef(v: boolean) { return { value: v }; }

function cmd(name: string) {
  return class { input: any; __name = name; constructor(input: any) { this.input = input; } };
}

function sdkStubs() {
  const docClient = {
    send: async (c: any) => {
      const name = c.__name;
      if (name === 'GetCommand') return { Item: existingProfile };
      if (name === 'PutCommand') {
        if (c.input.ConditionExpression?.includes('attribute_not_exists') && putConditionFails.value) {
          const e: any = new Error('exists'); e.name = 'ConditionalCheckFailedException'; throw e;
        }
        putItems.push(c.input.Item);
        return {};
      }
      if (name === 'UpdateCommand' || name === 'QueryCommand' || name === 'DeleteCommand') return { Items: [] };
      return {};
    },
  };
  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: { from: () => docClient },
      GetCommand: cmd('GetCommand'),
      PutCommand: cmd('PutCommand'),
      UpdateCommand: cmd('UpdateCommand'),
      QueryCommand: cmd('QueryCommand'),
      DeleteCommand: cmd('DeleteCommand'),
    },
    '@aws-sdk/client-secrets-manager': {
      SecretsManagerClient: class { async send() { return { SecretString: JSON.stringify({ RESEND_API_KEY: 'x', BUNDLE_SOCIAL_API_KEY: 'x' }) }; } },
      GetSecretValueCommand: cmd('GetSecretValueCommand'),
    },
  } as Record<string, any>;
}

function loadHandler(handlerDir: string) {
  process.env.TABLE_NAME = 'TestTable';
  const handlerPath = resolve(distDir, handlerDir, 'index.js');
  const source = readFileSync(handlerPath, 'utf8');
  const stubs = sdkStubs();
  const realRequire = createRequire(handlerPath);
  const m = new Module(handlerPath, undefined as any);
  m.filename = handlerPath;
  (m as any).paths = (Module as any)._nodeModulePaths(dirname(handlerPath));
  (m as any).require = ((id: string) => (id in stubs ? stubs[id] : realRequire(id))) as unknown as NodeRequire;
  (m as any)._compile(source, handlerPath);
  return m.exports as any;
}

function trialProfile(items: any[]) {
  return items.find((i) => i?.SK === 'PROFILE');
}

function assertSevenDaySoarTrial(p: any) {
  expect(p).toBeTruthy();
  expect(p.subscriptionTier).toBe('soar');
  expect(p.subscriptionStatus).toBe('trial');
  expect(p.trialEndsAt).toBeTruthy();
  const ms = new Date(p.trialEndsAt).getTime() - Date.now();
  const days = ms / (24 * 60 * 60 * 1000);
  expect(days).toBeGreaterThan(6.5);
  expect(days).toBeLessThan(7.5);
}

beforeEach(() => {
  existingProfile = null;
  putItems = [];
  putConditionFails = boolRef(false);
});

describe('signup trial — auth-post-confirmation (canonical path)', () => {
  it('creates a 7-day Soar trial with a single-grant conditional write', async () => {
    const mod = loadHandler('auth-post-confirmation');
    await mod.handler({ userName: 'u', request: { userAttributes: { sub: 'user-A', email: 'a@test.com' } } });
    assertSevenDaySoarTrial(trialProfile(putItems));
  });

  it('does not re-grant when the profile already exists (conditional write loses)', async () => {
    putConditionFails = boolRef(true); // attribute_not_exists fails => already exists
    const mod = loadHandler('auth-post-confirmation');
    await mod.handler({ userName: 'u', request: { userAttributes: { sub: 'user-A', email: 'a@test.com' } } });
    // No PROFILE item was committed (write was rejected), so no duplicate trial.
    expect(trialProfile(putItems)).toBeUndefined();
  });
});

describe('signup trial — social-accounts-handler safety-net', () => {
  it('grants the same 7-day Soar trial when creating a brand-new profile', async () => {
    existingProfile = null; // no profile yet
    const mod = loadHandler('social-accounts-handler');
    // GET /social/accounts triggers getOrCreateUser; the Bundle API call afterward may
    // fail in the stub, but the PROFILE write happens first and is what we assert on.
    try {
      await mod.handler({
        requestContext: { http: { method: 'GET', path: '/social/accounts' }, authorizer: { jwt: { claims: { sub: 'user-A', email: 'a@test.com' } } } },
        headers: {}, body: null,
      });
    } catch { /* downstream Bundle call is irrelevant to the profile write */ }
    assertSevenDaySoarTrial(trialProfile(putItems));
  });

  it('does not create or downgrade when a paid profile already exists', async () => {
    existingProfile = { PK: 'USER#user-A', SK: 'PROFILE', subscriptionTier: 'team', subscriptionStatus: 'active' };
    const mod = loadHandler('social-accounts-handler');
    try {
      await mod.handler({
        requestContext: { http: { method: 'GET', path: '/social/accounts' }, authorizer: { jwt: { claims: { sub: 'user-A', email: 'a@test.com' } } } },
        headers: {}, body: null,
      });
    } catch { /* ignore downstream */ }
    // No new PROFILE write at all — the existing paid profile is returned untouched.
    expect(trialProfile(putItems)).toBeUndefined();
  });
});
