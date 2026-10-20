// Team entitlement + invite-lookup tests for the compiled team-handler (Priorities 4 & 5).
//
// Priority 4 — team access is ADDITIVE and must never clobber a personal subscription:
//   • Free member: accepting surfaces team access; leaving/removal restores free.
//   • Self-paid Soar member: accepting raises visible access to team WITHOUT touching
//     their Stripe subscription; leaving/removal RESTORES their Soar (never free).
//   • Self-paid Summit member: accepting leaves their paid fields untouched; exit keeps Summit.
//
// Priority 5 — acceptInvite resolves via a direct INVITE#{id} LOOKUP GetItem (no Scan),
//   with a legacy Scan fallback for invites created before the lookup record existed.
//
// A stateful in-memory DynamoDB stub models Get/Put/Update/Delete/Query/Scan with the
// handler's REMOVE+SET update expressions, so entitlement transitions are exercised for real.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const handlerPath = resolve(here, '../../../../lambdas/dist/team-handler/index.js');

let store: Map<string, any>;
let sent: { name: string; input: any }[] = [];

function keyOf(input: any): string {
  const k = input.Key ?? input.Item;
  return `${k.PK}|${k.SK}`;
}
function cmd(name: string) {
  return class { input: any; __name = name; constructor(input: any) { this.input = input; } };
}

// Apply the handler's update expressions: supports "SET a = :a, b = :b", a trailing
// "REMOVE x, y, z", and a standalone "REMOVE ...".
function applyUpdate(existing: any, input: any): any {
  const item = { ...(existing ?? input.Key) };
  const names = input.ExpressionAttributeNames ?? {};
  const values = input.ExpressionAttributeValues ?? {};
  let expr: string = input.UpdateExpression ?? '';

  const removeMatch = expr.match(/REMOVE\s+(.+)$/i);
  if (removeMatch) {
    for (const f of removeMatch[1].split(',')) {
      const field = f.trim();
      delete item[field.startsWith('#') ? names[field] : field];
    }
    expr = expr.slice(0, removeMatch.index).trim();
  }
  const setMatch = expr.match(/^SET\s+(.+)$/i);
  if (setMatch) {
    for (const assign of setMatch[1].split(',')) {
      const [lhsRaw, rhsRaw] = assign.split('=').map((s) => s.trim());
      if (!rhsRaw) continue;
      const field = lhsRaw.startsWith('#') ? names[lhsRaw] : lhsRaw;
      item[field] = values[rhsRaw];
    }
  }
  return item;
}

function sdkStubs() {
  const docClient = {
    send: async (c: any) => {
      sent.push({ name: c.__name, input: c.input });
      const input = c.input;
      if (c.__name === 'GetCommand') return { Item: store.get(keyOf(input)) };
      if (c.__name === 'PutCommand') { store.set(keyOf(input), { ...input.Item }); return {}; }
      if (c.__name === 'UpdateCommand') { store.set(keyOf(input), applyUpdate(store.get(keyOf(input)), input)); return {}; }
      if (c.__name === 'DeleteCommand') { store.delete(keyOf(input)); return {}; }
      if (c.__name === 'QueryCommand') {
        const pk = input.ExpressionAttributeValues[':pk'];
        const skPrefix = input.ExpressionAttributeValues[':sk'];
        const items = [...store.values()].filter((it) => it.PK === pk && (!skPrefix || String(it.SK).startsWith(skPrefix)));
        return { Items: items };
      }
      if (c.__name === 'ScanCommand') {
        const vals = input.ExpressionAttributeValues || {};
        const iid = vals[':iid'];
        const status = vals[':s'];
        const items = [...store.values()].filter((it) => it.inviteId === iid && it.status === status);
        return { Items: items };
      }
      return {};
    },
  };
  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: { from: () => docClient },
      QueryCommand: cmd('QueryCommand'), PutCommand: cmd('PutCommand'), GetCommand: cmd('GetCommand'),
      UpdateCommand: cmd('UpdateCommand'), DeleteCommand: cmd('DeleteCommand'), ScanCommand: cmd('ScanCommand'),
    },
    '@aws-sdk/client-secrets-manager': {
      SecretsManagerClient: class { async send() { return { SecretString: JSON.stringify({ RESEND_API_KEY: 're_x' }) }; } },
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
  // Avoid real network on invite emails.
  (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({ id: 'email_1' }) });
  return (m.exports as any).handler as (e: any) => Promise<any>;
}

function ev(method: string, path: string, body?: any, sub = 'member-1', email = 'member@test.com') {
  return {
    requestContext: { http: { method, path }, authorizer: { jwt: { claims: { sub, email } } } },
    headers: {},
    body: body ? JSON.stringify(body) : null,
  };
}

function profile(sub: string, fields: any) {
  store.set(`USER#${sub}|PROFILE`, { PK: `USER#${sub}`, SK: 'PROFILE', ...fields });
}
function getProfile(sub: string) { return store.get(`USER#${sub}|PROFILE`); }

// Seed a team owned by admin-1 with a pending invite for member@test.com, including the
// direct-lookup record the handler now writes.
function seedTeamWithInvite(inviteId = 'inv-1', opts: { withLookup?: boolean } = { withLookup: true }) {
  store.set('TEAM#team-1|INFO', { PK: 'TEAM#team-1', SK: 'INFO', teamId: 'team-1', teamName: 'Blue Team', adminUserId: 'admin-1', maxMembers: 5 });
  store.set('TEAM#team-1|MEMBER#admin-1', { PK: 'TEAM#team-1', SK: 'MEMBER#admin-1', userId: 'admin-1', email: 'admin@test.com', role: 'admin' });
  store.set('USER#admin-1|TEAM_ADMIN', { PK: 'USER#admin-1', SK: 'TEAM_ADMIN', teamId: 'team-1', role: 'admin' });
  store.set(`TEAM#team-1|INVITE#${inviteId}`, { PK: 'TEAM#team-1', SK: `INVITE#${inviteId}`, inviteId, email: 'member@test.com', status: 'pending', expiresAt: new Date(Date.now() + 86400000).toISOString() });
  if (opts.withLookup) {
    store.set(`INVITE#${inviteId}|LOOKUP`, { PK: `INVITE#${inviteId}`, SK: 'LOOKUP', inviteId, teamId: 'team-1', email: 'member@test.com', expiresAt: new Date(Date.now() + 86400000).toISOString() });
  }
}

beforeEach(() => {
  store = new Map();
  sent = [];
});

describe('team-handler — accept invite preserves personal subscription (Priority 4)', () => {
  it('FREE member: accepting surfaces team access; leaving restores free', async () => {
    const handler = loadHandler();
    seedTeamWithInvite();
    profile('member-1', { email: 'member@test.com', subscriptionTier: 'free', subscriptionStatus: 'none' });

    const acc = await handler(ev('POST', '/team/accept', { inviteId: 'inv-1' }));
    expect(acc.statusCode).toBe(200);
    expect(getProfile('member-1').subscriptionTier).toBe('team');
    expect(getProfile('member-1').teamGrantedAccess).toBe(true);

    const leave = await handler(ev('POST', '/team/leave'));
    expect(leave.statusCode).toBe(200);
    expect(getProfile('member-1').subscriptionTier).toBe('free');
    expect(getProfile('member-1').subscriptionStatus).toBe('none');
    expect(getProfile('member-1').teamGrantedAccess).toBeUndefined();
  });

  it('self-paid SOAR member: accept raises access to team but Stripe sub is untouched; leaving RESTORES soar', async () => {
    const handler = loadHandler();
    seedTeamWithInvite();
    profile('member-1', { email: 'member@test.com', subscriptionTier: 'soar', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_personal', stripeCustomerId: 'cus_p' });

    const acc = await handler(ev('POST', '/team/accept', { inviteId: 'inv-1' }));
    expect(acc.statusCode).toBe(200);
    const p = getProfile('member-1');
    expect(p.subscriptionTier).toBe('team');          // surfaced for team features
    expect(p.stripeSubscriptionId).toBe('sub_personal'); // personal Stripe sub intact
    expect(p.preTeamTier).toBe('soar');                // snapshot captured

    const leave = await handler(ev('POST', '/team/leave'));
    expect(leave.statusCode).toBe(200);
    // Still has a live personal Stripe sub → restored (never downgraded to free).
    const after = getProfile('member-1');
    expect(after.stripeSubscriptionId).toBe('sub_personal');
    expect(after.subscriptionTier).not.toBe('free');
    expect(after.teamGrantedAccess).toBeUndefined();
  });

  it('self-paid SUMMIT member: accept leaves paid fields untouched; removal keeps their own access', async () => {
    const handler = loadHandler();
    seedTeamWithInvite();
    profile('member-1', { email: 'member@test.com', subscriptionTier: 'team', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_summit', stripeCustomerId: 'cus_s' });

    const acc = await handler(ev('POST', '/team/accept', { inviteId: 'inv-1' }));
    expect(acc.statusCode).toBe(200);
    expect(getProfile('member-1').stripeSubscriptionId).toBe('sub_summit');
    expect(getProfile('member-1').subscriptionTier).toBe('team');

    // Admin removes the member.
    const rem = await handler(ev('DELETE', '/team/members/member-1', undefined, 'admin-1', 'admin@test.com'));
    expect(rem.statusCode).toBe(200);
    const after = getProfile('member-1');
    expect(after.stripeSubscriptionId).toBe('sub_summit'); // own subscription preserved
    expect(after.subscriptionTier).toBe('team');
    expect(after.teamGrantedAccess).toBeUndefined();
  });

  it('removal of a FREE member returns them to free/none', async () => {
    const handler = loadHandler();
    seedTeamWithInvite();
    profile('member-1', { email: 'member@test.com', subscriptionTier: 'free', subscriptionStatus: 'none' });
    await handler(ev('POST', '/team/accept', { inviteId: 'inv-1' }));

    const rem = await handler(ev('DELETE', '/team/members/member-1', undefined, 'admin-1', 'admin@test.com'));
    expect(rem.statusCode).toBe(200);
    expect(getProfile('member-1').subscriptionTier).toBe('free');
    expect(getProfile('member-1').subscriptionStatus).toBe('none');
  });
});

describe('team-handler — invite lookup (Priority 5)', () => {
  it('accept resolves via the direct INVITE#{id} LOOKUP GetItem (no Scan)', async () => {
    const handler = loadHandler();
    seedTeamWithInvite('inv-1', { withLookup: true });
    profile('member-1', { email: 'member@test.com', subscriptionTier: 'free', subscriptionStatus: 'none' });

    const acc = await handler(ev('POST', '/team/accept', { inviteId: 'inv-1' }));
    expect(acc.statusCode).toBe(200);
    // No ScanCommand was issued — the fast path resolved it.
    expect(sent.find((c) => c.name === 'ScanCommand')).toBeUndefined();
    // The lookup record was read.
    expect(sent.find((c) => c.name === 'GetCommand' && c.input.Key.PK === 'INVITE#inv-1')).toBeTruthy();
  });

  it('legacy invite WITHOUT a lookup record still works via the Scan fallback', async () => {
    const handler = loadHandler();
    seedTeamWithInvite('inv-legacy', { withLookup: false });
    profile('member-1', { email: 'member@test.com', subscriptionTier: 'free', subscriptionStatus: 'none' });

    const acc = await handler(ev('POST', '/team/accept', { inviteId: 'inv-legacy' }));
    expect(acc.statusCode).toBe(200);
    // Fast path missed (no lookup record) → Scan fallback engaged.
    expect(sent.find((c) => c.name === 'ScanCommand')).toBeTruthy();
    expect(getProfile('member-1').subscriptionTier).toBe('team');
  });

  it('inviteMember writes a direct-lookup record for O(1) future accepts', async () => {
    const handler = loadHandler();
    // admin-1 owns the team and is on the Summit (team) tier.
    store.set('TEAM#team-1|INFO', { PK: 'TEAM#team-1', SK: 'INFO', teamId: 'team-1', teamName: 'Blue Team', adminUserId: 'admin-1', maxMembers: 5 });
    store.set('TEAM#team-1|MEMBER#admin-1', { PK: 'TEAM#team-1', SK: 'MEMBER#admin-1', userId: 'admin-1', email: 'admin@test.com', role: 'admin' });
    store.set('USER#admin-1|TEAM_ADMIN', { PK: 'USER#admin-1', SK: 'TEAM_ADMIN', teamId: 'team-1', role: 'admin' });
    profile('admin-1', { email: 'admin@test.com', subscriptionTier: 'team', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_admin' });

    const res = await handler(ev('POST', '/team/invite', { email: 'newbie@test.com' }, 'admin-1', 'admin@test.com'));
    expect(res.statusCode).toBe(200);
    const lookupWrite = sent.find((c) => c.name === 'PutCommand' && String(c.input.Item?.PK).startsWith('INVITE#') && c.input.Item?.SK === 'LOOKUP');
    expect(lookupWrite).toBeTruthy();
    expect(lookupWrite!.input.Item.teamId).toBe('team-1');
  });
});
