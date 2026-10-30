// Regression tests for the Sales void/correction workflow (data-integrity fix):
//   • record a sale (won)
//   • correct an incorrect premium amount (PUT)
//   • void a test sale → excluded from production totals, history preserved
//   • deleting a client (opportunity) auto-voids its linked sale (no orphaned premium)
//   • recalculated totals (stats) exclude voided deals; legit sales untouched
//   • no duplicate sale counting
// Uses the compiled CJS handlers with a shared in-memory table (same pattern as the
// other handler tests), so both handlers operate on the same data.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const salesPath = resolve(here, '../../../../lambdas/dist/sales-handler/index.js');
const oppPath = resolve(here, '../../../../lambdas/dist/opportunities-handler/index.js');

function cmd(name: string) { return class { input: any; __name = name; constructor(input: any) { this.input = input; } }; }

let table: Map<string, any>;
const keyOf = (pk: string, sk: string) => `${pk}|${sk}`;

// A minimal DynamoDB DocumentClient over the in-memory table: Get/Put/Query/Update/Delete.
function makeSend() {
  return async (c: { name: string; input: any }) => {
    const i = c.input;
    if (c.name === 'GetCommand') return { Item: table.get(keyOf(i.Key.PK, i.Key.SK)) || undefined };
    if (c.name === 'PutCommand') {
      if (i.ConditionExpression?.includes('attribute_not_exists(SK)') && table.has(keyOf(i.Item.PK, i.Item.SK))) {
        const e: any = new Error('cond'); e.name = 'ConditionalCheckFailedException'; throw e;
      }
      table.set(keyOf(i.Item.PK, i.Item.SK), i.Item); return {};
    }
    if (c.name === 'UpdateCommand') {
      const cur = { ...(table.get(keyOf(i.Key.PK, i.Key.SK)) || { PK: i.Key.PK, SK: i.Key.SK }) };
      const expr = String(i.UpdateExpression || '').replace(/^\s*SET\s+/i, '');
      for (const part of expr.split(',')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        let lhs = part.slice(0, eq).trim();
        const rhs = part.slice(eq + 1).trim();
        const name = lhs.startsWith('#') ? (i.ExpressionAttributeNames?.[lhs] ?? lhs) : lhs;
        cur[name] = i.ExpressionAttributeValues?.[rhs];
      }
      table.set(keyOf(i.Key.PK, i.Key.SK), cur); return { Attributes: cur };
    }
    if (c.name === 'DeleteCommand') { table.delete(keyOf(i.Key.PK, i.Key.SK)); return {}; }
    if (c.name === 'TransactWriteCommand') {
      for (const t of (i.TransactItems || [])) {
        const p = t.Put; if (!p) continue;
        if (p.ConditionExpression?.includes('attribute_not_exists(SK)') && table.has(keyOf(p.Item.PK, p.Item.SK))) {
          const e: any = new Error('cond'); e.name = 'TransactionCanceledException'; throw e;
        }
      }
      for (const t of (i.TransactItems || [])) { const p = t.Put; if (p) table.set(keyOf(p.Item.PK, p.Item.SK), p.Item); }
      return {};
    }
    if (c.name === 'QueryCommand') {
      const pk = i.ExpressionAttributeValues[':pk'];
      const skVal = i.ExpressionAttributeValues[':sk'];
      const begins = String(i.KeyConditionExpression || '').includes('begins_with');
      let items = [...table.values()].filter((it) => it.PK === pk && (begins ? String(it.SK).startsWith(skVal) : it.SK === skVal));
      // Support FilterExpression on dealId / opportunityId used by the handlers.
      const fe = i.FilterExpression || '';
      if (fe.includes('dealId')) items = items.filter((it) => it.dealId === i.ExpressionAttributeValues[':did']);
      if (fe.includes('opportunityId')) items = items.filter((it) => it.opportunityId === i.ExpressionAttributeValues[':oppId']);
      return { Items: items };
    }
    return { Items: [] };
  };
}

function sdkStubs() {
  const send = makeSend();
  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: { from: () => ({ send: (c: any) => send({ name: c.__name, input: c.input }) }) },
      PutCommand: cmd('PutCommand'), QueryCommand: cmd('QueryCommand'), UpdateCommand: cmd('UpdateCommand'),
      DeleteCommand: cmd('DeleteCommand'), GetCommand: cmd('GetCommand'), ScanCommand: cmd('ScanCommand'),
      TransactWriteCommand: cmd('TransactWriteCommand'),
    },
    '@aws-sdk/client-secrets-manager': { SecretsManagerClient: class {}, GetSecretValueCommand: cmd('GetSecretValueCommand') },
    '@aws-sdk/client-sns': { SNSClient: class {}, PublishCommand: cmd('PublishCommand') },
  } as Record<string, any>;
}
function load(path: string) {
  process.env.TABLE_NAME = 'TestTable';
  const source = readFileSync(path, 'utf8');
  const stubs = sdkStubs();
  const realRequire = createRequire(path);
  const m = new Module(path, undefined as any);
  m.filename = path;
  (m as any).paths = (Module as any)._nodeModulePaths(dirname(path));
  (m as any).require = ((id: string) => (id in stubs ? stubs[id] : realRequire(id))) as unknown as NodeRequire;
  (m as any)._compile(source, path);
  return (m.exports as any).handler as (e: any) => Promise<any>;
}
function ev(method: string, path: string, body?: any) {
  return { requestContext: { http: { method, path }, authorizer: { jwt: { claims: { sub: 'u-1', email: 'u@a.com' } } } }, body: body ? JSON.stringify(body) : undefined };
}
function seedPaid() { table.set(keyOf('USER#u-1', 'PROFILE'), { PK: 'USER#u-1', SK: 'PROFILE', subscriptionTier: 'soar', subscriptionStatus: 'active' }); }
function wonTotal(): number {
  return [...table.values()].filter((i) => String(i.SK).startsWith('DEAL#') && i.stage === 'won').reduce((s, i) => s + (Number(i.dealValue) || 0), 0);
}

beforeEach(() => { table = new Map(); seedPaid(); });

describe('sales void/correction workflow', () => {
  it('records a won sale and counts it in production', async () => {
    const sales = load(salesPath);
    const r = await sales(ev('POST', '/sales/deals', { name: 'Real Client', value: 1000, stage: 'won', clientRequestId: 'r1' }));
    expect(r.statusCode).toBe(200);
    expect(wonTotal()).toBe(1000);
  });

  it('corrects an incorrect premium amount via PUT (recalculates)', async () => {
    const sales = load(salesPath);
    const created = JSON.parse((await sales(ev('POST', '/sales/deals', { name: 'C', value: 1000, stage: 'won', clientRequestId: 'r1' }))).body);
    await sales(ev('PUT', `/sales/deals/${created.id}`, { value: 1500 }));
    expect(wonTotal()).toBe(1500);
  });

  it('voids a test sale → excluded from totals, record preserved for audit', async () => {
    const sales = load(salesPath);
    const created = JSON.parse((await sales(ev('POST', '/sales/deals', { name: 'Test', value: 2500, stage: 'won', clientRequestId: 'r1' }))).body);
    expect(wonTotal()).toBe(2500);
    const v = await sales(ev('POST', `/sales/deals/${created.id}/void`, { reason: 'test sale' }));
    expect(v.statusCode).toBe(200);
    expect(wonTotal()).toBe(0); // excluded from production
    // history preserved: the DEAL# record still exists, now stage 'voided' with audit
    // fields. (Scope to the DEAL# row — the clientRequestId also writes a SALEIDEM# row
    // that carries the same dealId but no stage.)
    const row = [...table.values()].find((i) => i.dealId === created.id && String(i.SK).startsWith('DEAL#'));
    expect(row.stage).toBe('voided');
    expect(row.priorStage).toBe('won');
    expect(row.voidedAt).toBeTruthy();
  });

  it('voiding is idempotent (double-void does not error or change totals)', async () => {
    const sales = load(salesPath);
    const created = JSON.parse((await sales(ev('POST', '/sales/deals', { name: 'T', value: 500, stage: 'won', clientRequestId: 'r1' }))).body);
    await sales(ev('POST', `/sales/deals/${created.id}/void`, {}));
    const again = await sales(ev('POST', `/sales/deals/${created.id}/void`, {}));
    expect(again.statusCode).toBe(200);
    expect(JSON.parse(again.body).alreadyVoided).toBe(true);
    expect(wonTotal()).toBe(0);
  });

  it('deleting a client AUTO-VOIDS its linked sale (no orphaned premium)', async () => {
    const sales = load(salesPath);
    const opp = load(oppPath);
    // Seed a converted client (opportunity) + a linked won deal.
    table.set(keyOf('USER#u-1', 'OPP#2026-10-01T00:00:00Z#opp-1'), { PK: 'USER#u-1', SK: 'OPP#2026-10-01T00:00:00Z#opp-1', opportunityId: 'opp-1', status: 'converted' });
    await sales(ev('POST', '/sales/deals', { name: 'Client', value: 2500, stage: 'won', opportunityId: 'opp-1', clientRequestId: 'r1' }));
    expect(wonTotal()).toBe(2500);
    const del = await opp(ev('DELETE', '/opportunities/opp-1'));
    expect(del.statusCode).toBe(200);
    expect(JSON.parse(del.body).voidedDeals.length).toBe(1);
    // linked deal is voided → no longer counts; opportunity is gone.
    expect(wonTotal()).toBe(0);
    expect([...table.values()].some((i) => String(i.SK).startsWith('OPP#') && i.opportunityId === 'opp-1')).toBe(false);
    const deal = [...table.values()].find((i) => i.opportunityId === 'opp-1' && String(i.SK).startsWith('DEAL#'));
    expect(deal.stage).toBe('voided');
  });

  it('legit sales are untouched when a different client is deleted', async () => {
    const sales = load(salesPath);
    const opp = load(oppPath);
    table.set(keyOf('USER#u-1', 'OPP#t#opp-del'), { PK: 'USER#u-1', SK: 'OPP#t#opp-del', opportunityId: 'opp-del', status: 'converted' });
    await sales(ev('POST', '/sales/deals', { name: 'Junk', value: 2500, stage: 'won', opportunityId: 'opp-del', clientRequestId: 'r1' }));
    await sales(ev('POST', '/sales/deals', { name: 'Legit', value: 1200, stage: 'won', opportunityId: 'opp-keep', clientRequestId: 'r2' }));
    expect(wonTotal()).toBe(3700);
    await opp(ev('DELETE', '/opportunities/opp-del'));
    expect(wonTotal()).toBe(1200); // only the junk deal voided; legit remains
  });

  it('no duplicate counting: re-submitting the same sale (same clientRequestId) does not double', async () => {
    const sales = load(salesPath);
    await sales(ev('POST', '/sales/deals', { name: 'C', value: 1000, stage: 'won', opportunityId: 'opp-x', clientRequestId: 'dup' }));
    await sales(ev('POST', '/sales/deals', { name: 'C', value: 1000, stage: 'won', opportunityId: 'opp-x', clientRequestId: 'dup' }));
    expect(wonTotal()).toBe(1000);
  });
});
