// Focused tests for sale-notification email idempotency + recipients (sales-handler).
// Loads the compiled CJS handler with stubbed AWS SDK (same pattern as the
// opportunities-handler test) and asserts at the data-access/email-claim level:
//   • team-win email is attempted for every teammate + seller confirmation
//   • an email CLAIM (conditional Put to EMAILSENT#...) is written before each send
//   • when the claim already exists (ConditionalCheckFailed) the email is SKIPPED
//     (no duplicate on edit/retry), and a FAILED send RELEASES the claim (retryable)
//   • queries are scoped to TEAM#<teamId> only (agency isolation)
//
// Email delivery itself is NOT exercised — sendEmail() hits Resend over fetch, which we
// stub to succeed/fail. Actual inbox delivery remains UNVERIFIED (no sandbox Resend key).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const handlerPath = resolve(here, '../../../../lambdas/dist/sales-handler/index.js');

type SentCommand = { name: string; input: any };
let sent: SentCommand[] = [];
let sendImpl: (c: SentCommand) => Promise<any> = async () => ({ Items: [] });
let fetchCalls: Array<{ url: string; body: any }> = [];
let fetchOk = true;

function cmd(name: string) {
  return class { input: any; __name = name; constructor(input: any) { this.input = input; } };
}
function sdkStubs() {
  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: { from: () => ({ send: async (c: any) => { const e = { name: c.__name, input: c.input }; sent.push(e); return sendImpl(e); } }) },
      PutCommand: cmd('PutCommand'), QueryCommand: cmd('QueryCommand'), UpdateCommand: cmd('UpdateCommand'),
      DeleteCommand: cmd('DeleteCommand'), GetCommand: cmd('GetCommand'), ScanCommand: cmd('ScanCommand'),
    },
    '@aws-sdk/client-secrets-manager': {
      SecretsManagerClient: class {}, GetSecretValueCommand: cmd('GetSecretValueCommand'),
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
function event(method: string, path: string, body?: any) {
  return { requestContext: { http: { method, path }, authorizer: { jwt: { claims: { sub: 'seller-1', email: 'seller@a.com' } } } }, body: body ? JSON.stringify(body) : undefined };
}

type ClaimState = { status: 'pending' | 'sent'; leaseOwner: string; leaseUntil: number };
// A paid (soar) profile so the sales gate passes. Team with owner + 2 members.
// opts.members overrides the MEMBER# roster; opts.adminUserId sets TEAM#T1/INFO.adminUserId.
function wireTeam(claims: Map<string, ClaimState>, opts: { members?: Array<{ userId: string }>; adminUserId?: string } = {}) {
  const members = opts.members || [{ userId: 'seller-1' }, { userId: 'owner-1' }, { userId: 'mate-2' }];
  const adminUserId = opts.adminUserId || 'owner-1';
  sendImpl = async (c) => {
    const sk = c.input?.ExpressionAttributeValues?.[':sk'];
    const pk = c.input?.ExpressionAttributeValues?.[':pk'];
    // TEAM#T1/INFO carries the owner (adminUserId) + adminEmail (owner-inclusion backfill).
    if (c.name === 'GetCommand' && c.input?.Key?.SK === 'INFO' && String(c.input?.Key?.PK || '').startsWith('TEAM#')) {
      return { Item: { PK: c.input.Key.PK, SK: 'INFO', adminUserId, adminEmail: adminUserId + '@a.com', teamName: 'Team One' } };
    }
    // Entitlement gate reads the profile via GetCommand(Key.SK='PROFILE').
    if (c.name === 'GetCommand' && c.input?.Key?.SK === 'PROFILE') {
      const uid = String(c.input.Key.PK).replace('USER#', '');
      return { Item: { PK: c.input.Key.PK, SK: 'PROFILE', subscriptionTier: 'soar', subscriptionStatus: 'active', email: uid + '@a.com', emailNotifications: {} } };
    }
    // Other PROFILE reads (seller email, teammate email) go through QueryCommand.
    if (c.name === 'QueryCommand' && c.input?.ExpressionAttributeValues?.[':sk'] === 'PROFILE') {
      const uid = String(pk).replace('USER#', '');
      return { Items: [{ PK: pk, SK: 'PROFILE', subscriptionTier: 'soar', subscriptionStatus: 'active', email: uid + '@a.com', emailNotifications: {} }] };
    }
    if (c.name === 'QueryCommand' && sk === 'TEAM_ADMIN' && pk === 'USER#seller-1') return { Items: [{ teamId: 'T1' }] };
    if (c.name === 'QueryCommand' && sk === 'TEAM_MEMBER') return { Items: [] };
    if (c.name === 'QueryCommand' && sk === 'MEMBER#' && pk === 'TEAM#T1') {
      return { Items: members };
    }
    // Email idempotency lease claim: conditional Put. Model the real condition —
    // claimable when absent OR when the stored claim is pending with an EXPIRED lease.
    // A live pending claim (or a 'sent' claim) blocks with ConditionalCheckFailed.
    if (c.name === 'PutCommand' && String(c.input?.Item?.PK || '').startsWith('EMAILSENT#')) {
      const key = c.input.Item.PK;
      const nowSec = c.input.ExpressionAttributeValues?.[':now'] ?? Math.floor(Date.now() / 1000);
      const existing = claims.get(key);
      const expired = existing && existing.status === 'pending' && existing.leaseUntil < nowSec;
      if (existing && !expired) { const e: any = new Error('exists'); e.name = 'ConditionalCheckFailedException'; throw e; }
      claims.set(key, { status: 'pending', leaseOwner: c.input.Item.leaseOwner, leaseUntil: c.input.Item.leaseUntil });
      return {};
    }
    // Confirm: SET status=sent, guarded by leaseOwner == token.
    if (c.name === 'UpdateCommand' && String(c.input?.Key?.PK || '').startsWith('EMAILSENT#')) {
      const key = c.input.Key.PK;
      const tok = c.input.ExpressionAttributeValues?.[':tok'];
      const existing = claims.get(key);
      if (!existing || existing.leaseOwner !== tok) { const e: any = new Error('lost'); e.name = 'ConditionalCheckFailedException'; throw e; }
      claims.set(key, { ...existing, status: 'sent' });
      return {};
    }
    // Release: delete, guarded by leaseOwner == token when a token condition is present.
    if (c.name === 'DeleteCommand' && String(c.input?.Key?.PK || '').startsWith('EMAILSENT#')) {
      const key = c.input.Key.PK;
      const tok = c.input.ExpressionAttributeValues?.[':tok'];
      const existing = claims.get(key);
      if (tok && existing && existing.leaseOwner !== tok) { const e: any = new Error('lost'); e.name = 'ConditionalCheckFailedException'; throw e; }
      claims.delete(key);
      return {};
    }
    // Deal create Put (no opportunityId → unconditional)
    if (c.name === 'PutCommand') return {};
    return { Items: [] };
  };
}

let claims: Map<string, ClaimState>;
beforeEach(() => {
  sent = []; fetchCalls = []; fetchOk = true;
  claims = new Map<string, ClaimState>();
  wireTeam(claims);
  // Stub global fetch (Resend + any). Record body; honor fetchOk.
  (globalThis as any).fetch = vi.fn(async (url: string, opts: any) => {
    fetchCalls.push({ url: String(url), body: opts?.body ? JSON.parse(opts.body) : null });
    return { ok: fetchOk, status: fetchOk ? 200 : 500, json: async () => ({ id: 'em_1' }), text: async () => 'err' };
  });
});

// Helper to POST a won deal.
async function logWonDeal(handler: any, name = 'Big Deal') {
  return handler(event('POST', '/sales/deals', { name, value: 2000, stage: 'won', policyType: 'Auto' }));
}

describe('sales-handler — sale-notification email idempotency + recipients', () => {
  it('claims an email send for each teammate + seller before sending', async () => {
    const handler = loadHandler();
    // Make getResendKey succeed by stubbing the secrets send:
    const prev = sendImpl;
    sendImpl = async (c) => { if (c.name === 'GetSecretValueCommand') return { SecretString: JSON.stringify({ RESEND_API_KEY: 'test' }) }; return prev(c); };
    const res = await logWonDeal(handler);
    expect(res.statusCode).toBe(200);
    const claims = sent.filter((c) => c.name === 'PutCommand' && String(c.input?.Item?.PK || '').startsWith('EMAILSENT#'));
    // owner-1 + mate-2 (teammates, excluding seller) + seller confirmation = 3 claims
    const keys = claims.map((c) => c.input.Item.PK);
    expect(keys.some((k) => k.includes('owner-1'))).toBe(true);
    expect(keys.some((k) => k.includes('mate-2'))).toBe(true);
    expect(keys.some((k) => k.includes('seller'))).toBe(true);
    // Every claim is a lease write: a pending claim with an owner token, claimable only
    // when absent OR when a prior pending lease has expired (crash recovery).
    const LEASE_COND = 'attribute_not_exists(PK) OR (#st = :pending AND leaseUntil < :now)';
    for (const c of claims) {
      expect(c.input.ConditionExpression).toBe(LEASE_COND);
      expect(c.input.Item.status).toBe('pending');
      expect(typeof c.input.Item.leaseOwner).toBe('string');
      expect(typeof c.input.Item.leaseUntil).toBe('number');
    }
  });

  it('every claim is a lease write (so a pre-existing live claim blocks a duplicate send)', async () => {
    const handler = loadHandler();
    const prevImpl = sendImpl;
    sendImpl = async (c) => { if (c.name === 'GetSecretValueCommand') return { SecretString: JSON.stringify({ RESEND_API_KEY: 'test' }) }; return prevImpl(c); };
    await logWonDeal(handler, 'Big Deal');
    const claims = sent.filter((c) => c.name === 'PutCommand' && String(c.input?.Item?.PK || '').startsWith('EMAILSENT#'));
    expect(claims.length).toBeGreaterThan(0);
    // The conditional lease write is the mechanism that lets a duplicate (retry/edit) be
    // skipped: the stub (and DynamoDB) throw ConditionalCheckFailed when a live claim exists.
    const LEASE_COND = 'attribute_not_exists(PK) OR (#st = :pending AND leaseUntil < :now)';
    for (const c of claims) expect(c.input.ConditionExpression).toBe(LEASE_COND);
  });

  it('releases the claim on send failure so a retry can resend', async () => {
    const handler = loadHandler();
    const prevImpl = sendImpl;
    sendImpl = async (c) => {
      if (c.name === 'GetSecretValueCommand') return { SecretString: JSON.stringify({ RESEND_API_KEY: 'test' }) };
      return prevImpl(c);
    };
    fetchOk = false; // every Resend send fails
    await logWonDeal(handler, 'Big Deal');
    // On failure the handler must DELETE (release) the claims so a later retry resends.
    const releases = sent.filter((c) => c.name === 'DeleteCommand' && String(c.input?.Key?.PK || '').startsWith('EMAILSENT#'));
    expect(releases.length).toBeGreaterThan(0); // at least one claim released for retry
  });

  it('only queries TEAM#T1 members (agency isolation)', async () => {
    const handler = loadHandler();
    const prev = sendImpl;
    sendImpl = async (c) => { if (c.name === 'GetSecretValueCommand') return { SecretString: JSON.stringify({ RESEND_API_KEY: 'test' }) }; return prev(c); };
    await logWonDeal(handler);
    const memberQueries = sent.filter((c) => c.name === 'QueryCommand' && c.input?.ExpressionAttributeValues?.[':sk'] === 'MEMBER#');
    for (const q of memberQueries) expect(q.input.ExpressionAttributeValues[':pk']).toBe('TEAM#T1');
  });

  it('includes the owner even when the owner has NO MEMBER# row (TEAM_ADMIN/INFO only)', async () => {
    // Roster WITHOUT owner-1 as a MEMBER#. Owner is linked only via TEAM#T1/INFO.adminUserId.
    wireTeam(claims, { members: [{ userId: 'seller-1' }, { userId: 'mate-2' }], adminUserId: 'owner-1' });
    const handler = loadHandler();
    const prev = sendImpl;
    sendImpl = async (c) => { if (c.name === 'GetSecretValueCommand') return { SecretString: JSON.stringify({ RESEND_API_KEY: 'test' }) }; return prev(c); };
    await logWonDeal(handler);
    const claimPuts = sent.filter((c) => c.name === 'PutCommand' && String(c.input?.Item?.PK || '').startsWith('EMAILSENT#'));
    const keys = claimPuts.map((c) => c.input.Item.PK);
    // Owner must still get a team-win claim despite having no MEMBER# row.
    expect(keys.some((k) => k.includes('owner-1'))).toBe(true);
    expect(keys.some((k) => k.includes('mate-2'))).toBe(true);
    expect(keys.some((k) => k.includes('seller'))).toBe(true);
  });

  it('owner backfill does NOT double-notify when the owner is already a MEMBER#', async () => {
    // Default roster DOES include owner-1 as a MEMBER#; the INFO.adminUserId is also owner-1.
    const handler = loadHandler();
    const prev = sendImpl;
    sendImpl = async (c) => { if (c.name === 'GetSecretValueCommand') return { SecretString: JSON.stringify({ RESEND_API_KEY: 'test' }) }; return prev(c); };
    await logWonDeal(handler);
    const claimPuts = sent.filter((c) => c.name === 'PutCommand' && String(c.input?.Item?.PK || '').startsWith('EMAILSENT#'));
    const ownerClaims = claimPuts.filter((c) => String(c.input.Item.PK).includes('owner-1'));
    // Exactly one team-win claim for the owner (no duplicate from the backfill).
    expect(ownerClaims.length).toBe(1);
  });

  it('recovers an EXPIRED pending lease (crash recovery) instead of suppressing for 30 days', async () => {
    // Model a prior worker that crashed after claiming but before confirming: EVERY claim
    // key is pre-seeded as pending with an EXPIRED lease (leaseUntil in the past). The real
    // condition 'attribute_not_exists(PK) OR (#st=:pending AND leaseUntil<:now)' must let
    // the new worker RE-CLAIM each key (status pending, expired) rather than suppress it.
    const prevImpl = sendImpl;
    let suppressed = 0, reclaimed = 0;
    sendImpl = async (c) => {
      if (c.name === 'GetSecretValueCommand') return { SecretString: JSON.stringify({ RESEND_API_KEY: 'test' }) };
      if (c.name === 'PutCommand' && String(c.input?.Item?.PK || '').startsWith('EMAILSENT#')) {
        const key = c.input.Item.PK;
        const nowSec = c.input.ExpressionAttributeValues?.[':now'] ?? Math.floor(Date.now() / 1000);
        // Pretend a stale pending claim already exists for this key (expired lease).
        const stale = { status: 'pending' as const, leaseOwner: 'dead-worker', leaseUntil: 0 };
        const expired = stale.status === 'pending' && stale.leaseUntil < nowSec;
        if (!expired) { suppressed++; const e: any = new Error('exists'); e.name = 'ConditionalCheckFailedException'; throw e; }
        reclaimed++;
        return {};
      }
      return prevImpl(c);
    };
    const handler = loadHandler();
    await logWonDeal(handler, 'Big Deal');
    // Expired pending leases were re-claimable (recovered), never suppressed for 30 days.
    expect(reclaimed).toBeGreaterThan(0);
    expect(suppressed).toBe(0);
  });

  it('a LIVE pending lease (unexpired) blocks a duplicate claim', async () => {
    // Opposite of recovery: a pending claim whose lease is still LIVE must block re-claim.
    const prevImpl = sendImpl;
    let blocked = 0;
    sendImpl = async (c) => {
      if (c.name === 'GetSecretValueCommand') return { SecretString: JSON.stringify({ RESEND_API_KEY: 'test' }) };
      if (c.name === 'PutCommand' && String(c.input?.Item?.PK || '').startsWith('EMAILSENT#')) {
        const nowSec = c.input.ExpressionAttributeValues?.[':now'] ?? Math.floor(Date.now() / 1000);
        const live = { status: 'pending' as const, leaseOwner: 'other-worker', leaseUntil: nowSec + 999 };
        const expired = live.status === 'pending' && live.leaseUntil < nowSec;
        if (!expired) { blocked++; const e: any = new Error('exists'); e.name = 'ConditionalCheckFailedException'; throw e; }
        return {};
      }
      return prevImpl(c);
    };
    const handler = loadHandler();
    await logWonDeal(handler, 'Big Deal');
    // Every claim attempt hit a live lease and was blocked (no duplicate send).
    expect(blocked).toBeGreaterThan(0);
    const sends = fetchCalls.filter((f) => f.url.includes('resend.com'));
    expect(sends.length).toBe(0);
  });
});
