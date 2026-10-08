// Server-side subscription entitlement tests.
//
// Proves the launch-critical access rules are enforced by the BACKEND handlers using
// the account's authoritative subscription state (never a browser-supplied tier):
//   - Nest (free) keeps its included features (capture/list/delete Cues).
//   - Nest cannot invoke paid-only operations directly through the API
//     (sales/revenue, appreciations, CRM push, lead follow-ups, team creation).
//   - Soar can access Soar features.
//   - Summit (stored as 'summit' OR 'team') can access team features.
//   - Expired trials revert to Nest access.
//   - Users cannot reach another account's data (handlers key strictly on the JWT sub).
//   - Legacy tier values (base/growth/flight/pro) are treated as paid consistently.
//
// Each handler is loaded via the shared require-cache stub technique; the DynamoDB
// stub returns a configurable PROFILE item so we can set tier/status/trialEndsAt.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, '../../../../lambdas/dist');

// Configurable per-test state:
let profile: any;                 // the PROFILE item returned for the authed user
let profilesByPk: Record<string, any> = {}; // optional: per-PK profiles (cross-account)
let putItems: any[] = [];
let getFailure = false;           // simulate profile read failure (fail-closed check)

function cmd(name: string) {
  return class { input: any; __name = name; constructor(input: any) { this.input = input; } };
}

function sdkStubs() {
  const docClient = {
    send: async (c: any) => {
      const name = c.__name;
      if (name === 'GetCommand') {
        if (getFailure) throw new Error('DynamoDB unavailable');
        const pk = c.input.Key?.PK;
        const sk = c.input.Key?.SK;
        // Only PROFILE lookups return a profile. Other keys (TEAM_ADMIN/TEAM_MEMBER,
        // etc.) must return nothing so unrelated lookups don't accidentally match.
        if (sk !== 'PROFILE') return { Item: undefined };
        if (pk && profilesByPk[pk]) return { Item: profilesByPk[pk] };
        return { Item: profile };
      }
      if (name === 'QueryCommand') return { Items: [] };
      if (name === 'PutCommand') { putItems.push(c.input.Item); return {}; }
      if (name === 'UpdateCommand' || name === 'DeleteCommand') return {};
      return {};
    },
  };
  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: { from: () => docClient },
      GetCommand: cmd('GetCommand'),
      QueryCommand: cmd('QueryCommand'),
      PutCommand: cmd('PutCommand'),
      UpdateCommand: cmd('UpdateCommand'),
      DeleteCommand: cmd('DeleteCommand'),
      ScanCommand: cmd('ScanCommand'),
    },
    '@aws-sdk/client-secrets-manager': {
      SecretsManagerClient: class { async send() { return { SecretString: JSON.stringify({ RESEND_API_KEY: 'x', STRIPE_SECRET_KEY: 'x' }) }; } },
      GetSecretValueCommand: cmd('GetSecretValueCommand'),
    },
    '@aws-sdk/client-bedrock-runtime': {
      BedrockRuntimeClient: class { async send() { return {}; } },
      InvokeModelCommand: cmd('InvokeModelCommand'),
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
  return (m.exports as any).handler as (e: any) => Promise<any>;
}

function apiEvent(method: string, path: string, sub = 'user-A', body: any = null) {
  return {
    requestContext: { http: { method, path }, authorizer: { jwt: { claims: { sub, email: `${sub}@test.com` } } } },
    headers: {},
    body: body ? JSON.stringify(body) : null,
    queryStringParameters: null,
  };
}

function statusOf(res: any) { return res.statusCode; }
function codeOf(res: any) { try { return JSON.parse(res.body).error?.code; } catch { return undefined; } }

beforeEach(() => {
  profile = { PK: 'USER#user-A', SK: 'PROFILE', email: 'user-A@test.com', subscriptionTier: 'soar', subscriptionStatus: 'active' };
  profilesByPk = {};
  putItems = [];
  getFailure = false;
});

const DAY = 24 * 60 * 60 * 1000;

describe('entitlement — sales/revenue (Soar+)', () => {
  it('Nest (free) is denied with 403 UPGRADE_REQUIRED on GET /sales/deals', async () => {
    profile.subscriptionTier = 'free'; profile.subscriptionStatus = 'none';
    const handler = loadHandler('sales-handler');
    const res = await handler(apiEvent('GET', '/sales/deals'));
    expect(statusOf(res)).toBe(403);
    expect(codeOf(res)).toBe('UPGRADE_REQUIRED');
  });

  it('Soar can access GET /sales/deals', async () => {
    const handler = loadHandler('sales-handler');
    const res = await handler(apiEvent('GET', '/sales/deals'));
    expect(statusOf(res)).toBe(200);
  });

  it('Expired trial reverts to Nest and is denied', async () => {
    profile.subscriptionTier = 'soar';
    profile.subscriptionStatus = 'trial';
    profile.trialEndsAt = new Date(Date.now() - DAY).toISOString(); // yesterday
    const handler = loadHandler('sales-handler');
    const res = await handler(apiEvent('GET', '/sales/stats'));
    expect(statusOf(res)).toBe(403);
  });

  it('Active trial still within window is allowed', async () => {
    profile.subscriptionTier = 'soar';
    profile.subscriptionStatus = 'trial';
    profile.trialEndsAt = new Date(Date.now() + 3 * DAY).toISOString();
    const handler = loadHandler('sales-handler');
    const res = await handler(apiEvent('GET', '/sales/stats'));
    expect(statusOf(res)).toBe(200);
  });

  it('Legacy tier "growth" is treated as paid', async () => {
    profile.subscriptionTier = 'growth'; profile.subscriptionStatus = 'active';
    const handler = loadHandler('sales-handler');
    const res = await handler(apiEvent('GET', '/sales/deals'));
    expect(statusOf(res)).toBe(200);
  });

  it('fails closed (503) if the subscription profile cannot be read', async () => {
    getFailure = true;
    const handler = loadHandler('sales-handler');
    const res = await handler(apiEvent('GET', '/sales/deals'));
    expect(statusOf(res)).toBe(503);
    expect(codeOf(res)).toBe('ENTITLEMENT_UNAVAILABLE');
  });
});

describe('entitlement — appreciations (Soar+)', () => {
  it('Nest denied', async () => {
    profile.subscriptionTier = 'free'; profile.subscriptionStatus = 'none';
    const handler = loadHandler('appreciations-handler');
    const res = await handler(apiEvent('GET', '/appreciations'));
    expect(statusOf(res)).toBe(403);
  });
  it('Soar allowed', async () => {
    const handler = loadHandler('appreciations-handler');
    const res = await handler(apiEvent('GET', '/appreciations'));
    expect(statusOf(res)).toBe(200);
  });
});

describe('entitlement — CRM push (Soar+)', () => {
  // crm-handler require()s several sibling modules (destinations/crypto/adapters) that
  // use CommonJS module.exports and cannot be loaded in-process under this ESM test
  // project. We assert at the source level that the paid gate is wired: the static
  // destinations catalog is served BEFORE the requirePaid gate, and the gate guards
  // the rest. This mirrors the executable gates proven for the other handlers, which
  // use the identical helper.
  const src = readFileSync(resolve(distDir, 'crm-handler', 'index.js'), 'utf8');

  it('serves the destination catalog before the paid gate (open to all tiers)', () => {
    // Within the dispatch: the destinations route returns before the crmGate check.
    const idxDestRoute = src.indexOf('return handleListDestinations()');
    const idxGate = src.indexOf('const crmGate = await requirePaid(userId)');
    expect(idxDestRoute).toBeGreaterThan(-1);
    expect(idxGate).toBeGreaterThan(-1);
    expect(idxDestRoute).toBeLessThan(idxGate);
  });

  it('gates connections/push/export behind requirePaid returning 403 UPGRADE_REQUIRED', () => {
    expect(src).toContain('requirePaid');
    expect(src).toContain('UPGRADE_REQUIRED');
    // The gate short-circuits before the connections/push/export routes.
    const idxGate = src.indexOf('const crmGate = await requirePaid(userId)');
    const idxConnections = src.indexOf("path === '/crm/connections'", idxGate);
    const idxPush = src.indexOf("path === '/crm/push'", idxGate);
    expect(idxGate).toBeGreaterThan(-1);
    expect(idxConnections).toBeGreaterThan(idxGate);
    expect(idxPush).toBeGreaterThan(idxGate);
  });

  it('uses trial-expiry + legacy-normalization in its effectiveTier helper', () => {
    expect(src).toContain("status === 'trial'");
    expect(src).toContain('trialEndsAt');
    expect(src).toContain("'growth'"); // legacy normalization present
  });
});

describe('entitlement — opportunities (MIXED: Nest keeps Cues, followUp is Soar+)', () => {
  it('Nest CAN list its Cues', async () => {
    profile.subscriptionTier = 'free'; profile.subscriptionStatus = 'none';
    const handler = loadHandler('opportunities-handler');
    const res = await handler(apiEvent('GET', '/opportunities'));
    expect(statusOf(res)).toBe(200);
  });

  it('Nest CAN capture a Cue (POST /opportunities without promotion)', async () => {
    profile.subscriptionTier = 'free'; profile.subscriptionStatus = 'none';
    const handler = loadHandler('opportunities-handler');
    const res = await handler(apiEvent('POST', '/opportunities', 'user-A', {
      keywordId: 'manual-entry', sourceUrl: 'https://example.com/post/1',
    }));
    expect(statusOf(res)).toBe(201);
  });

  it('Nest CANNOT promote a Cue to a Lead (paid followUp)', async () => {
    profile.subscriptionTier = 'free'; profile.subscriptionStatus = 'none';
    const handler = loadHandler('opportunities-handler');
    const res = await handler(apiEvent('POST', '/opportunities/opp-1/promote'));
    expect(statusOf(res)).toBe(403);
    expect(codeOf(res)).toBe('UPGRADE_REQUIRED');
  });

  it('Nest CANNOT capture-with-promote (promoteToLead:true requires Soar+)', async () => {
    profile.subscriptionTier = 'free'; profile.subscriptionStatus = 'none';
    const handler = loadHandler('opportunities-handler');
    const res = await handler(apiEvent('POST', '/opportunities', 'user-A', {
      keywordId: 'manual-entry', sourceUrl: 'https://example.com/post/1', promoteToLead: true,
    }));
    expect(statusOf(res)).toBe(403);
  });

  it('Soar CAN promote', async () => {
    const handler = loadHandler('opportunities-handler');
    const res = await handler(apiEvent('POST', '/opportunities/opp-1/promote'));
    // 200 (promoted) or 404 (no such opp) — but NOT 403. The gate passed.
    expect(statusOf(res)).not.toBe(403);
  });

  it('Nest CANNOT read follow-up protocol templates', async () => {
    profile.subscriptionTier = 'free'; profile.subscriptionStatus = 'none';
    const handler = loadHandler('opportunities-handler');
    const res = await handler(apiEvent('GET', '/opportunities/protocol-template'));
    expect(statusOf(res)).toBe(403);
  });
});

describe('entitlement — team creation (Summit/Team only)', () => {
  it('Soar denied on POST /team (create)', async () => {
    profile.subscriptionTier = 'soar'; profile.subscriptionStatus = 'active';
    const handler = loadHandler('team-handler');
    const res = await handler(apiEvent('POST', '/team', 'user-A', { teamName: 'My Team' }));
    expect(statusOf(res)).toBe(403);
    expect(codeOf(res)).toBe('NOT_TEAM_TIER');
  });

  it('tier stored as "summit" is accepted as team', async () => {
    profile.subscriptionTier = 'summit'; profile.subscriptionStatus = 'active';
    const handler = loadHandler('team-handler');
    const res = await handler(apiEvent('POST', '/team', 'user-A', { teamName: 'My Team' }));
    expect(statusOf(res)).not.toBe(403);
  });

  it('tier "team" is accepted', async () => {
    profile.subscriptionTier = 'team'; profile.subscriptionStatus = 'active';
    const handler = loadHandler('team-handler');
    const res = await handler(apiEvent('POST', '/team', 'user-A', { teamName: 'My Team' }));
    expect(statusOf(res)).not.toBe(403);
  });
});

describe('entitlement — account isolation', () => {
  it('a handler keys entitlement on the JWT sub, so account B cannot borrow A paid state', async () => {
    // Authenticated as user-B (free); user-A is paid. The handler must read user-B's
    // own profile (denied), not any other account's.
    profilesByPk['USER#user-A'] = { subscriptionTier: 'soar', subscriptionStatus: 'active' };
    profilesByPk['USER#user-B'] = { subscriptionTier: 'free', subscriptionStatus: 'none' };
    const handler = loadHandler('sales-handler');
    const res = await handler(apiEvent('GET', '/sales/deals', 'user-B'));
    expect(statusOf(res)).toBe(403);
  });
});
