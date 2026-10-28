// Focused tests for monthly sales goals (sales-handler): own goal GET/PUT with folio +
// nonnegative validation, per-folio isolation, team-goals totals + incomplete count, and
// admin-only authorization for editing another member's goal. Loads the compiled CJS
// handler with a stubbed AWS SDK + in-memory table (same pattern as other handler tests).

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const handlerPath = resolve(here, '../../../../lambdas/dist/sales-handler/index.js');

type SentCommand = { name: string; input: any };
function cmd(name: string) { return class { input: any; __name = name; constructor(input: any) { this.input = input; } }; }

// In-memory single-table keyed by `${PK}|${SK}`.
let table: Map<string, any>;
function keyOf(pk: string, sk: string) { return `${pk}|${sk}`; }

function sdkStubs() {
  const impl = async (c: SentCommand) => {
    const i = c.input;
    if (c.name === 'GetCommand') {
      return { Item: table.get(keyOf(i.Key.PK, i.Key.SK)) || undefined };
    }
    if (c.name === 'PutCommand') { table.set(keyOf(i.Item.PK, i.Item.SK), i.Item); return {}; }
    if (c.name === 'QueryCommand') {
      const pk = i.ExpressionAttributeValues[':pk'];
      const skEq = i.ExpressionAttributeValues[':sk'];
      const begins = String(i.KeyConditionExpression || '').includes('begins_with');
      const items = [...table.values()].filter((it) => {
        if (it.PK !== pk) return false;
        if (begins) return String(it.SK).startsWith(skEq);
        return it.SK === skEq;
      });
      return { Items: items };
    }
    return { Items: [] };
  };
  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: { from: () => ({ send: (c: any) => impl({ name: c.__name, input: c.input }) }) },
      PutCommand: cmd('PutCommand'), QueryCommand: cmd('QueryCommand'), UpdateCommand: cmd('UpdateCommand'),
      DeleteCommand: cmd('DeleteCommand'), GetCommand: cmd('GetCommand'), ScanCommand: cmd('ScanCommand'),
      TransactWriteCommand: cmd('TransactWriteCommand'),
    },
    '@aws-sdk/client-secrets-manager': { SecretsManagerClient: class {}, GetSecretValueCommand: cmd('GetSecretValueCommand') },
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
function event(method: string, path: string, opts: { sub?: string; body?: any; query?: Record<string, string> } = {}) {
  return {
    requestContext: { http: { method, path }, authorizer: { jwt: { claims: { sub: opts.sub || 'u-1', email: `${opts.sub || 'u-1'}@a.com` } } } },
    queryStringParameters: opts.query || null,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  };
}

// Seed a paid profile (sales is Soar+). Entitlement reads PROFILE via GetCommand.
function seedPaid(sub: string) { table.set(keyOf(`USER#${sub}`, 'PROFILE'), { PK: `USER#${sub}`, SK: 'PROFILE', subscriptionTier: 'soar', subscriptionStatus: 'active' }); }
// Seed a team: admin + one member, with MEMBER# rows + INFO owner.
function seedTeam(adminSub: string, memberSub: string, teamId = 't-1') {
  table.set(keyOf(`USER#${adminSub}`, 'TEAM_ADMIN'), { PK: `USER#${adminSub}`, SK: 'TEAM_ADMIN', teamId });
  table.set(keyOf(`USER#${memberSub}`, 'TEAM_MEMBER'), { PK: `USER#${memberSub}`, SK: 'TEAM_MEMBER', teamId });
  table.set(keyOf(`TEAM#${teamId}`, `MEMBER#${adminSub}`), { PK: `TEAM#${teamId}`, SK: `MEMBER#${adminSub}`, userId: adminSub, email: `${adminSub}@a.com` });
  table.set(keyOf(`TEAM#${teamId}`, `MEMBER#${memberSub}`), { PK: `TEAM#${teamId}`, SK: `MEMBER#${memberSub}`, userId: memberSub, email: `${memberSub}@a.com` });
  table.set(keyOf(`TEAM#${teamId}`, 'INFO'), { PK: `TEAM#${teamId}`, SK: 'INFO', adminUserId: adminSub, adminEmail: `${adminSub}@a.com` });
}

beforeEach(() => { table = new Map(); });

describe('sales goals — own goal GET/PUT', () => {
  it('returns null when no goal is set (no invented default)', async () => {
    const h = loadHandler(); seedPaid('u-1');
    const res = await h(event('GET', '/sales/goal', { query: { folio: '2026-10' } }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).amount).toBeNull();
  });
  it('sets and reads back a goal', async () => {
    const h = loadHandler(); seedPaid('u-1');
    const put = await h(event('PUT', '/sales/goal', { body: { folio: '2026-10', amount: 5000 } }));
    expect(put.statusCode).toBe(200);
    const get = await h(event('GET', '/sales/goal', { query: { folio: '2026-10' } }));
    expect(JSON.parse(get.body).amount).toBe(5000);
  });
  it('rejects an invalid folio and a negative/non-numeric amount', async () => {
    const h = loadHandler(); seedPaid('u-1');
    expect((await h(event('PUT', '/sales/goal', { body: { folio: 'Oct', amount: 100 } }))).statusCode).toBe(400);
    expect((await h(event('PUT', '/sales/goal', { body: { folio: '2026-10', amount: -5 } }))).statusCode).toBe(400);
    expect((await h(event('PUT', '/sales/goal', { body: { folio: '2026-10', amount: 'abc' } }))).statusCode).toBe(400);
  });
  it('keeps goals separate by folio (editing Nov does not change Oct)', async () => {
    const h = loadHandler(); seedPaid('u-1');
    await h(event('PUT', '/sales/goal', { body: { folio: '2026-10', amount: 5000 } }));
    await h(event('PUT', '/sales/goal', { body: { folio: '2026-11', amount: 8000 } }));
    expect(JSON.parse((await h(event('GET', '/sales/goal', { query: { folio: '2026-10' } }))).body).amount).toBe(5000);
    expect(JSON.parse((await h(event('GET', '/sales/goal', { query: { folio: '2026-11' } }))).body).amount).toBe(8000);
  });
  it('repeated saves do not create duplicates (overwrite in place)', async () => {
    const h = loadHandler(); seedPaid('u-1');
    await h(event('PUT', '/sales/goal', { body: { folio: '2026-10', amount: 100 } }));
    await h(event('PUT', '/sales/goal', { body: { folio: '2026-10', amount: 200 } }));
    const goalRows = [...table.keys()].filter((k) => k.includes('SALEGOAL#2026-10'));
    expect(goalRows).toHaveLength(1);
    expect(JSON.parse((await h(event('GET', '/sales/goal', { query: { folio: '2026-10' } }))).body).amount).toBe(200);
  });
});

describe('sales goals — team goals + admin authorization', () => {
  it('team-goals returns each member goal, sum, and incomplete count', async () => {
    const h = loadHandler(); seedPaid('admin'); seedTeam('admin', 'mem');
    await h(event('PUT', '/sales/goal', { sub: 'admin', body: { folio: '2026-10', amount: 5000 } }));
    // member has no goal → incompleteCount 1, teamGoal 5000
    const res = await h(event('GET', '/sales/team-goals', { sub: 'admin', query: { folio: '2026-10' } }));
    const b = JSON.parse(res.body);
    expect(b.teamGoal).toBe(5000);
    expect(b.incompleteCount).toBe(1);
    expect(b.isAdmin).toBe(true);
    expect(b.members).toHaveLength(2);
  });
  it('an admin can set a member goal; the team total then includes it', async () => {
    const h = loadHandler(); seedPaid('admin'); seedTeam('admin', 'mem');
    const put = await h(event('PUT', '/sales/team-goals', { sub: 'admin', body: { targetUserId: 'mem', folio: '2026-10', amount: 3000 } }));
    expect(put.statusCode).toBe(200);
    const b = JSON.parse((await h(event('GET', '/sales/team-goals', { sub: 'admin', query: { folio: '2026-10' } }))).body);
    expect(b.teamGoal).toBe(3000);
    expect(b.incompleteCount).toBe(1); // admin still has none
  });
  it('a NON-admin member cannot set another member\'s goal (403)', async () => {
    const h = loadHandler(); seedPaid('mem'); seedTeam('admin', 'mem');
    const res = await h(event('PUT', '/sales/team-goals', { sub: 'mem', body: { targetUserId: 'admin', folio: '2026-10', amount: 9999 } }));
    expect(res.statusCode).toBe(403);
  });
  it('an admin cannot set a goal for someone NOT on their team (403)', async () => {
    const h = loadHandler(); seedPaid('admin'); seedTeam('admin', 'mem');
    const res = await h(event('PUT', '/sales/team-goals', { sub: 'admin', body: { targetUserId: 'stranger', folio: '2026-10', amount: 100 } }));
    expect(res.statusCode).toBe(403);
  });
});
