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
  // The owner must be an ENTITLED Summit admin for paid /team/* routes to pass the
  // entitlement gate. (Seeded unless a test overrides the admin profile to simulate a
  // lapse.)
  store.set('USER#admin-1|PROFILE', { PK: 'USER#admin-1', SK: 'PROFILE', email: 'admin@test.com', subscriptionTier: 'team', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_admin' });
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

  it('uses CURRENT billing state, not a stale snapshot, when a personal sub changed during membership', async () => {
    const handler = loadHandler();
    seedTeamWithInvite();
    // Joins with a personal SOAR sub → snapshot captures preTeamTier='soar'.
    profile('member-1', { email: 'member@test.com', subscriptionTier: 'soar', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_personal', stripeCustomerId: 'cus_p' });
    await handler(ev('POST', '/team/accept', { inviteId: 'inv-1' }));
    expect(getProfile('member-1').preTeamTier).toBe('soar');

    // While in the team, the member UPGRADES their own subscription to Summit via Stripe.
    // The webhook writes the live state onto the PROFILE (tier=team, same personal sub id).
    const p = getProfile('member-1');
    store.set('USER#member-1|PROFILE', { ...p, subscriptionTier: 'team', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_personal_upgraded' });

    // On leave, the restore path must honor the CURRENT live subscription (a real Stripe
    // sub id) and NOT clobber it back to the stale 'soar' snapshot.
    const leave = await handler(ev('POST', '/team/leave'));
    expect(leave.statusCode).toBe(200);
    const after = getProfile('member-1');
    expect(after.stripeSubscriptionId).toBe('sub_personal_upgraded'); // current billing kept
    expect(after.subscriptionTier).toBe('team');                      // not downgraded to soar snapshot
    expect(after.preTeamTier).toBeUndefined();                        // snapshot cleared
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

  it('expired invite is rejected (410) via the fast lookup path — TTL/expiry enforced', async () => {
    const handler = loadHandler();
    // Seed an expired invite + matching lookup record.
    const past = new Date(Date.now() - 86400000).toISOString();
    store.set('TEAM#team-1|INFO', { PK: 'TEAM#team-1', SK: 'INFO', teamId: 'team-1', teamName: 'Blue Team', adminUserId: 'admin-1', maxMembers: 5 });
    store.set('TEAM#team-1|INVITE#inv-exp', { PK: 'TEAM#team-1', SK: 'INVITE#inv-exp', inviteId: 'inv-exp', email: 'member@test.com', status: 'pending', expiresAt: past });
    store.set('INVITE#inv-exp|LOOKUP', { PK: 'INVITE#inv-exp', SK: 'LOOKUP', inviteId: 'inv-exp', teamId: 'team-1', email: 'member@test.com', expiresAt: past });
    profile('member-1', { email: 'member@test.com', subscriptionTier: 'free', subscriptionStatus: 'none' });

    const res = await handler(ev('POST', '/team/accept', { inviteId: 'inv-exp' }));
    expect(res.statusCode).toBe(410);
    expect(getProfile('member-1').subscriptionTier).toBe('free'); // not granted
  });

  it('invite accepted by the WRONG email is rejected (403) even via the fast path', async () => {
    const handler = loadHandler();
    seedTeamWithInvite('inv-1', { withLookup: true });
    profile('intruder', { email: 'intruder@test.com', subscriptionTier: 'free', subscriptionStatus: 'none' });

    const res = await handler(ev('POST', '/team/accept', { inviteId: 'inv-1' }, 'intruder', 'intruder@test.com'));
    expect(res.statusCode).toBe(403);
    expect(getProfile('intruder').subscriptionTier).toBe('free'); // not granted
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

// ─────────────────────────────────────────────────────────────────────────────
// Summit access control (launch-blocker fix): paid /team/* routes must verify the
// team OWNER's live Summit entitlement server-side, for admins AND employees. Team
// records are never deleted on lapse; reactivation restores access to the same team.
// Priority 2: PUT /team/colors is admin-only.
// ─────────────────────────────────────────────────────────────────────────────

// Seed a team owned by admin-1 and a joined member member-1, with the admin profile's
// subscription set to `adminSub`. Member is free (team-granted). No duplicate teams.
function seedActiveTeam(adminSub: any) {
  store.set('TEAM#team-1|INFO', { PK: 'TEAM#team-1', SK: 'INFO', teamId: 'team-1', teamName: 'Blue Team', adminUserId: 'admin-1', maxMembers: 5, memberColors: { 'admin@test.com': 0 } });
  store.set('TEAM#team-1|MEMBER#admin-1', { PK: 'TEAM#team-1', SK: 'MEMBER#admin-1', userId: 'admin-1', email: 'admin@test.com', role: 'admin' });
  store.set('TEAM#team-1|MEMBER#member-1', { PK: 'TEAM#team-1', SK: 'MEMBER#member-1', userId: 'member-1', email: 'member@test.com', role: 'member' });
  store.set('USER#admin-1|TEAM_ADMIN', { PK: 'USER#admin-1', SK: 'TEAM_ADMIN', teamId: 'team-1', role: 'admin' });
  store.set('USER#member-1|TEAM_MEMBER', { PK: 'USER#member-1', SK: 'TEAM_MEMBER', teamId: 'team-1', role: 'member' });
  store.set('USER#admin-1|PROFILE', { PK: 'USER#admin-1', SK: 'PROFILE', email: 'admin@test.com', ...adminSub });
  store.set('USER#member-1|PROFILE', { PK: 'USER#member-1', SK: 'PROFILE', email: 'member@test.com', subscriptionTier: 'free', subscriptionStatus: 'none', teamGrantedAccess: true });
}

const adminEv = (m: string, p: string, b?: any) => ev(m, p, b, 'admin-1', 'admin@test.com');
const memberEv = (m: string, p: string, b?: any) => ev(m, p, b, 'member-1', 'member@test.com');

const DAY = 86400000;
const future = () => new Date(Date.now() + 10 * DAY).toISOString();
const past = () => new Date(Date.now() - DAY).toISOString();

describe('team-handler — Summit entitlement gate (owner subscription drives access)', () => {
  it('ACTIVE Summit owner: admin AND employee reach paid routes', async () => {
    const handler = loadHandler();
    seedActiveTeam({ subscriptionTier: 'team', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_a' });
    expect((await handler(adminEv('GET', '/team/stats'))).statusCode).toBe(200);
    expect((await handler(memberEv('GET', '/team/leads'))).statusCode).toBe(200);
    expect((await handler(memberEv('GET', '/team/calendar'))).statusCode).toBe(200);
    expect((await handler(memberEv('GET', '/team/analytics'))).statusCode).toBe(200);
  });

  it('ACTIVE TRIAL owner (trial not expired): access granted', async () => {
    const handler = loadHandler();
    seedActiveTeam({ subscriptionTier: 'team', subscriptionStatus: 'trial', trialEndsAt: future(), stripeSubscriptionId: 'sub_a' });
    expect((await handler(adminEv('GET', '/team/stats'))).statusCode).toBe(200);
    expect((await handler(memberEv('GET', '/team/leads'))).statusCode).toBe(200);
  });

  it('SCHEDULED CANCELLATION before period end: still entitled (paid-through period)', async () => {
    const handler = loadHandler();
    seedActiveTeam({ subscriptionTier: 'team', subscriptionStatus: 'active', subscriptionCancelAtPeriodEnd: true, subscriptionCurrentPeriodEnd: future(), stripeSubscriptionId: 'sub_a' });
    expect((await handler(adminEv('GET', '/team/stats'))).statusCode).toBe(200);
    expect((await handler(memberEv('GET', '/team/leads'))).statusCode).toBe(200);
  });

  it('PAST_DUE during allowed grace: access retained', async () => {
    const handler = loadHandler();
    seedActiveTeam({ subscriptionTier: 'team', subscriptionStatus: 'past_due', stripeSubscriptionId: 'sub_a' });
    expect((await handler(memberEv('GET', '/team/leads'))).statusCode).toBe(200);
  });

  it('EXPIRED TRIAL owner: all paid routes blocked (402) for admin AND employee', async () => {
    const handler = loadHandler();
    seedActiveTeam({ subscriptionTier: 'team', subscriptionStatus: 'trial', trialEndsAt: past() });
    expect((await handler(adminEv('GET', '/team/stats'))).statusCode).toBe(402);
    expect((await handler(memberEv('GET', '/team/leads'))).statusCode).toBe(402);
    expect((await handler(memberEv('GET', '/team/calendar'))).statusCode).toBe(402);
    expect((await handler(memberEv('POST', '/team/leads/lead-x/claim', { leadName: 'X' }))).statusCode).toBe(402);
  });

  it('DOWNGRADED owner (tier soar): team routes blocked (402)', async () => {
    const handler = loadHandler();
    seedActiveTeam({ subscriptionTier: 'soar', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_a' });
    expect((await handler(adminEv('POST', '/team/invite', { email: 'x@test.com' }))).statusCode).toBe(402);
    expect((await handler(memberEv('GET', '/team/leads'))).statusCode).toBe(402);
  });

  it('TERMINAL cancellation (status canceled, tier free): blocked (402)', async () => {
    const handler = loadHandler();
    seedActiveTeam({ subscriptionTier: 'free', subscriptionStatus: 'canceled', subscriptionCurrentPeriodEnd: past() });
    expect((await handler(adminEv('GET', '/team/history'))).statusCode).toBe(402);
    expect((await handler(memberEv('GET', '/team/analytics'))).statusCode).toBe(402);
  });

  it('SCHEDULED CANCELLATION whose period already ended: blocked (402)', async () => {
    const handler = loadHandler();
    // Edge: status still 'active' but cancelAtPeriodEnd and the period end is in the past.
    seedActiveTeam({ subscriptionTier: 'team', subscriptionStatus: 'active', subscriptionCancelAtPeriodEnd: true, subscriptionCurrentPeriodEnd: past(), stripeSubscriptionId: 'sub_a' });
    expect((await handler(memberEv('GET', '/team/leads'))).statusCode).toBe(402);
  });

  it('DIRECT API bypass attempts by an expired owner are denied across routes', async () => {
    const handler = loadHandler();
    seedActiveTeam({ subscriptionTier: 'team', subscriptionStatus: 'trial', trialEndsAt: past() });
    for (const [m, p, b] of [
      ['POST', '/team/invite', { email: 'x@test.com' }],
      ['PUT', '/team/name', { teamName: 'Renamed Team' }],
      ['DELETE', '/team/members/member-1', undefined],
      ['GET', '/team/stats', undefined],
      ['PUT', '/team/colors', { memberColors: { 'admin@test.com': 3 } }],
    ] as const) {
      const res = await handler(adminEv(m, p, b as any));
      expect(res.statusCode).toBe(402);
    }
  });

  it('DIRECT API bypass attempts by an employee of a lapsed team are denied', async () => {
    const handler = loadHandler();
    seedActiveTeam({ subscriptionTier: 'free', subscriptionStatus: 'canceled' });
    for (const [m, p] of [
      ['GET', '/team/leads'],
      ['GET', '/team/calendar'],
      ['GET', '/team/analytics'],
      ['GET', '/team/notifications'],
    ] as const) {
      expect((await handler(memberEv(m, p))).statusCode).toBe(402);
    }
  });

  it('LAPSE never deletes team records; GET /team and leave remain available (recovery)', async () => {
    const handler = loadHandler();
    seedActiveTeam({ subscriptionTier: 'team', subscriptionStatus: 'trial', trialEndsAt: past() });
    // Blocked paid route…
    expect((await handler(memberEv('GET', '/team/leads'))).statusCode).toBe(402);
    // …but the team records are intact and GET /team still works (so the UI can show
    // status + a reactivation path).
    const info = await handler(memberEv('GET', '/team'));
    expect(info.statusCode).toBe(200);
    expect(store.get('TEAM#team-1|INFO')).toBeTruthy();
    expect(store.get('TEAM#team-1|MEMBER#member-1')).toBeTruthy();
    // A member can still leave (recovery).
    expect((await handler(memberEv('POST', '/team/leave'))).statusCode).toBe(200);
  });

  it('REACTIVATION restores access to the SAME team (no duplicate created)', async () => {
    const handler = loadHandler();
    // Start lapsed → blocked.
    seedActiveTeam({ subscriptionTier: 'team', subscriptionStatus: 'trial', trialEndsAt: past() });
    expect((await handler(adminEv('GET', '/team/stats'))).statusCode).toBe(402);
    // Owner resubscribes — webhook flips the PROFILE back to active team. Team records
    // were never deleted, so the SAME team-1 is now fully accessible again.
    const p = store.get('USER#admin-1|PROFILE');
    store.set('USER#admin-1|PROFILE', { ...p, subscriptionTier: 'team', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_a', trialEndsAt: undefined });
    expect((await handler(adminEv('GET', '/team/stats'))).statusCode).toBe(200);
    expect((await handler(memberEv('GET', '/team/leads'))).statusCode).toBe(200);
    // Still exactly one team INFO record for team-1 (no duplicate).
    const infos = [...store.keys()].filter((k) => k.endsWith('|INFO'));
    expect(infos).toEqual(['TEAM#team-1|INFO']);
  });
});

describe('team-handler — PUT /team/colors is admin-only (Priority 2)', () => {
  it('admin (entitled) can set team colors', async () => {
    const handler = loadHandler();
    seedActiveTeam({ subscriptionTier: 'team', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_a' });
    const res = await handler(adminEv('PUT', '/team/colors', { memberColors: { 'member@test.com': 4 } }));
    expect(res.statusCode).toBe(200);
    expect(store.get('TEAM#team-1|INFO').memberColors['member@test.com']).toBe(4);
  });

  it('member CANNOT change team-wide colors (403 NOT_ADMIN)', async () => {
    const handler = loadHandler();
    seedActiveTeam({ subscriptionTier: 'team', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_a' });
    const before = JSON.stringify(store.get('TEAM#team-1|INFO').memberColors);
    const res = await handler(memberEv('PUT', '/team/colors', { memberColors: { 'admin@test.com': 9 } }));
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('NOT_ADMIN');
    // Colors unchanged by the rejected member write.
    expect(JSON.stringify(store.get('TEAM#team-1|INFO').memberColors)).toBe(before);
  });

  it('members can still READ team colors (GET /team/colors) when entitled', async () => {
    const handler = loadHandler();
    seedActiveTeam({ subscriptionTier: 'team', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_a' });
    expect((await handler(memberEv('GET', '/team/colors'))).statusCode).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Team invitation usability: environment-aware links, resend, revoke, duplicate
// guard, expiry/email-match preserved. Isolated fixtures only.
// ─────────────────────────────────────────────────────────────────────────────

describe('team-handler — invitation usability (links / resend / revoke)', () => {
  function seedOwner(adminSub: any = { subscriptionTier: 'team', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_a' }) {
    store.set('TEAM#team-1|INFO', { PK: 'TEAM#team-1', SK: 'INFO', teamId: 'team-1', teamName: 'Blue Team', adminUserId: 'admin-1', maxMembers: 5 });
    store.set('TEAM#team-1|MEMBER#admin-1', { PK: 'TEAM#team-1', SK: 'MEMBER#admin-1', userId: 'admin-1', email: 'admin@test.com', role: 'admin' });
    store.set('USER#admin-1|TEAM_ADMIN', { PK: 'USER#admin-1', SK: 'TEAM_ADMIN', teamId: 'team-1', role: 'admin' });
    store.set('USER#admin-1|PROFILE', { PK: 'USER#admin-1', SK: 'PROFILE', email: 'admin@test.com', ...adminSub });
  }
  const adminEv2 = (m: string, p: string, b?: any) => ev(m, p, b, 'admin-1', 'admin@test.com');

  it('invite returns an environment-aware acceptUrl (defaults to prod when APP_BASE_URL unset)', async () => {
    delete process.env.APP_BASE_URL;
    const handler = loadHandler();
    seedOwner();
    const res = await handler(adminEv2('POST', '/team/invite', { email: 'newbie@test.com' }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.acceptUrl).toMatch(/^https:\/\/hawkeyecue\.com\/team\?invite=/);
    expect(body.acceptUrl).toContain(body.inviteId);
  });

  it('invite link honors APP_BASE_URL for sandbox/staging environments', async () => {
    process.env.APP_BASE_URL = 'http://localhost:5173';
    try {
      const handler = loadHandler();
      seedOwner();
      const res = await handler(adminEv2('POST', '/team/invite', { email: 'newbie@test.com' }));
      const body = JSON.parse(res.body);
      expect(body.acceptUrl).toMatch(/^http:\/\/localhost:5173\/team\?invite=/);
    } finally {
      delete process.env.APP_BASE_URL;
    }
  });

  it('duplicate invite to the same pending email is blocked (ALREADY_INVITED)', async () => {
    const handler = loadHandler();
    seedOwner();
    expect((await handler(adminEv2('POST', '/team/invite', { email: 'dup@test.com' }))).statusCode).toBe(200);
    const res2 = await handler(adminEv2('POST', '/team/invite', { email: 'dup@test.com' }));
    expect(res2.statusCode).toBe(400);
    expect(JSON.parse(res2.body).error.code).toBe('ALREADY_INVITED');
  });

  it('revoke removes the pending invite and its lookup, allowing a clean re-invite', async () => {
    const handler = loadHandler();
    seedOwner();
    const inv = JSON.parse((await handler(adminEv2('POST', '/team/invite', { email: 'rev@test.com' }))).body);
    // Revoke it.
    const rev = await handler(adminEv2('DELETE', `/team/invites/${inv.inviteId}`));
    expect(rev.statusCode).toBe(200);
    expect(store.get(`TEAM#team-1|INVITE#${inv.inviteId}`)).toBeUndefined();
    expect(store.get(`INVITE#${inv.inviteId}|LOOKUP`)).toBeUndefined();
    // Re-invite now succeeds (no duplicate block).
    expect((await handler(adminEv2('POST', '/team/invite', { email: 'rev@test.com' }))).statusCode).toBe(200);
  });

  it('resend revokes the old pending invite and issues a fresh code (no duplicate error)', async () => {
    const handler = loadHandler();
    seedOwner();
    const first = JSON.parse((await handler(adminEv2('POST', '/team/invite', { email: 're@test.com' }))).body);
    const resend = await handler(adminEv2('POST', '/team/invite/resend', { email: 're@test.com' }));
    expect(resend.statusCode).toBe(200);
    const second = JSON.parse(resend.body);
    expect(second.inviteId).not.toBe(first.inviteId);          // fresh code
    expect(store.get(`TEAM#team-1|INVITE#${first.inviteId}`)).toBeUndefined(); // old revoked
    expect(store.get(`TEAM#team-1|INVITE#${second.inviteId}`)).toBeTruthy();   // new pending
  });

  it('a MEMBER cannot revoke or resend invites (403 NOT_ADMIN)', async () => {
    const handler = loadHandler();
    seedOwner();
    store.set('TEAM#team-1|MEMBER#member-1', { PK: 'TEAM#team-1', SK: 'MEMBER#member-1', userId: 'member-1', email: 'member@test.com', role: 'member' });
    store.set('USER#member-1|TEAM_MEMBER', { PK: 'USER#member-1', SK: 'TEAM_MEMBER', teamId: 'team-1', role: 'member' });
    const inv = JSON.parse((await handler(adminEv2('POST', '/team/invite', { email: 'x@test.com' }))).body);
    expect((await handler(ev('DELETE', `/team/invites/${inv.inviteId}`, undefined, 'member-1', 'member@test.com'))).statusCode).toBe(403);
    expect((await handler(ev('POST', '/team/invite/resend', { email: 'x@test.com' }, 'member-1', 'member@test.com'))).statusCode).toBe(403);
  });

  it('revoke/resend are blocked when the owner Summit subscription is inactive (402)', async () => {
    const handler = loadHandler();
    seedOwner({ subscriptionTier: 'team', subscriptionStatus: 'canceled' });
    // Seed a pending invite directly (created while active).
    store.set('TEAM#team-1|INVITE#inv-z', { PK: 'TEAM#team-1', SK: 'INVITE#inv-z', inviteId: 'inv-z', email: 'z@test.com', status: 'pending', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    expect((await handler(adminEv2('DELETE', '/team/invites/inv-z'))).statusCode).toBe(402);
    expect((await handler(adminEv2('POST', '/team/invite/resend', { email: 'z@test.com' }))).statusCode).toBe(402);
  });
});
