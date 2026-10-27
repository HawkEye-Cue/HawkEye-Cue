// Focused tests: a Client can have MULTIPLE legitimate sales, while accidental duplicate
// submissions of the SAME sale (double-click/retry) are deduped via a clientRequestId
// idempotency sentinel written atomically with the deal. Loads the compiled CJS
// sales-handler with a stubbed AWS SDK (same pattern as the other handler tests).

import { describe, it, expect, beforeEach } from 'vitest';
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
function event(method: string, path: string, body?: any) {
  return { requestContext: { http: { method, path }, authorizer: { jwt: { claims: { sub: 'seller-1', email: 'seller@a.com' } } } }, body: body ? JSON.stringify(body) : undefined };
}

// Paid tier so the sales entitlement gate passes; idempotency sentinel enforced atomically.
function wire() {
  const idem = new Set<string>();
  sendImpl = async (c: SentCommand) => {
    if (c.name === 'GetCommand' && c.input?.Key?.SK === 'PROFILE') {
      return { Item: { PK: 'USER#seller-1', SK: 'PROFILE', subscriptionTier: 'soar', subscriptionStatus: 'active' } };
    }
    if (c.name === 'TransactWriteCommand') {
      const legs = c.input.TransactItems || [];
      const sentinel = legs.map((t: any) => t.Put?.Item).find((i: any) => String(i?.SK || '').startsWith('SALEIDEM#'));
      const sk = sentinel ? String(sentinel.SK) : '';
      if (sk && idem.has(sk)) { const e: any = new Error('dup'); e.name = 'TransactionCanceledException'; throw e; }
      if (sk) idem.add(sk);
      return {};
    }
    if (c.name === 'QueryCommand' && String(c.input?.ExpressionAttributeValues?.[':sk'] || '').startsWith('SALEIDEM#')) {
      return { Items: [{ dealSK: 'DEAL#2026-01-01T00:00:00Z#prior', dealId: 'prior' }] };
    }
    if (c.name === 'QueryCommand' && String(c.input?.ExpressionAttributeValues?.[':sk'] || '').startsWith('DEAL#')) {
      return { Items: [{ PK: 'USER#seller-1', SK: 'DEAL#2026-01-01T00:00:00Z#prior', dealId: 'prior', dealName: 'Prior', stage: 'won', dealValue: 100 }] };
    }
    return { Items: [] };
  };
}

beforeEach(() => { sent = []; wire(); });

function saleBody(over: Record<string, unknown> = {}) {
  return { name: 'Jane Client', value: 500, stage: 'won', policyType: 'Auto', opportunityId: 'opp-1', soldBy: 'seller@a.com', createdAt: '2026-03-15T12:00:00.000Z', folio: '2026-03', ...over };
}
function txnOppItem() {
  return sent.flatMap((c) => c.name === 'TransactWriteCommand' ? (c.input.TransactItems || []).map((t: any) => t.Put?.Item) : [])
    .find((i: any) => String(i?.SK || '').startsWith('DEAL#'));
}

describe('sales-handler — multiple sales per client + idempotent submission', () => {
  it('each sale is its own DEAL# record (unique SK), not collapsed per Cue', async () => {
    const handler = loadHandler();
    const res = await handler(event('POST', '/sales/deals', saleBody({ clientRequestId: 'req-A' })));
    expect(res.statusCode).toBe(200);
    const item = txnOppItem()!;
    expect(String(item.SK)).toMatch(/^DEAL#2026-03-15T12:00:00\.000Z#/); // timestamped, unique
    expect(String(item.SK)).not.toContain('DEAL#CUE#'); // no longer one-per-Cue
    expect(item.opportunityId).toBe('opp-1'); // still linked to the same client
    expect(item.dealValue).toBe(500);
    expect(item.folio).toBe('2026-03'); // folio from the actual sale date
    expect(item.soldBy).toBe('seller@a.com'); // team attribution
  });

  it('two DIFFERENT sales for the SAME client (different clientRequestId) both succeed', async () => {
    const handler = loadHandler();
    const r1 = await handler(event('POST', '/sales/deals', saleBody({ clientRequestId: 'req-1', value: 500 })));
    const r2 = await handler(event('POST', '/sales/deals', saleBody({ clientRequestId: 'req-2', value: 800 })));
    expect(JSON.parse(r1.body).alreadyLogged).toBe(false);
    expect(JSON.parse(r2.body).alreadyLogged).toBe(false);
    // two separate transactions (two deals) for the same opportunityId
    const txns = sent.filter((c) => c.name === 'TransactWriteCommand');
    expect(txns).toHaveLength(2);
  });

  it('a DUPLICATE submission of the SAME sale (same clientRequestId) is deduped', async () => {
    const handler = loadHandler();
    const r1 = await handler(event('POST', '/sales/deals', saleBody({ clientRequestId: 'req-dup' })));
    const r2 = await handler(event('POST', '/sales/deals', saleBody({ clientRequestId: 'req-dup' })));
    expect(JSON.parse(r1.body).alreadyLogged).toBe(false);
    expect(JSON.parse(r2.body).alreadyLogged).toBe(true); // retry → prior deal, no new write
    expect(JSON.parse(r2.body).id).toBe('prior');
  });

  it('without a clientRequestId, falls back to a plain Put (legacy/manual unchanged)', async () => {
    const handler = loadHandler();
    const res = await handler(event('POST', '/sales/deals', saleBody({ clientRequestId: undefined })));
    expect(res.statusCode).toBe(200);
    expect(sent.find((c) => c.name === 'TransactWriteCommand')).toBeUndefined();
    const put = sent.find((c) => c.name === 'PutCommand' && String(c.input.Item?.SK || '').startsWith('DEAL#'))!;
    expect(put).toBeTruthy();
    expect(String(put.input.Item.SK)).not.toContain('DEAL#CUE#');
  });

  it('the idempotency sentinel is NOT a DEAL# record (excluded from deal listings/totals)', async () => {
    const handler = loadHandler();
    await handler(event('POST', '/sales/deals', saleBody({ clientRequestId: 'req-x' })));
    const sentinel = sent.flatMap((c) => c.name === 'TransactWriteCommand' ? (c.input.TransactItems || []).map((t: any) => t.Put?.Item) : [])
      .find((i: any) => String(i?.SK || '').startsWith('SALEIDEM#'))!;
    expect(sentinel).toBeTruthy();
    expect(String(sentinel.SK)).not.toMatch(/^DEAL#/);
  });
});
