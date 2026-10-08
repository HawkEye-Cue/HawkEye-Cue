// Billing P0 tests for the compiled stripe-webhook handler.
//
// Verifies the launch-critical webhook guarantees under a two-phase idempotency lock:
//   1.  Invalid signature            → 400, DB untouched.
//   2.  First successful delivery    → processed once, marked completed.
//   3.  Duplicate completed delivery → skipped (duplicate:true), no re-provision.
//   4.  Concurrent duplicate         → only one provisions; the other gets 409 (retryable).
//   5.  Failure after claim, before provisioning → claim released, retryable 500.
//   6.  Failure during provisioning  → claim released, retryable 500, not completed.
//   7.  Retry after failure          → succeeds and completes (no permanent block).
//   8.  DynamoDB unavailable on claim → fail closed with retryable 503, no processing.
//   9.  Stale processing claim       → taken over and processed (no permanent block).
//   10. Out-of-order subscription updates → older event does not overwrite newer state.
//   11. Correct entitlement state after retries → converges to the right tier.
//
// A stateful in-memory DynamoDB stub models conditional writes so we can exercise the
// claim/complete/release transitions and failure injection precisely.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const handlerPath = resolve(here, '../../../../lambdas/dist/stripe-webhook/index.js');

type SentCommand = { name: string; input: any };

// ─── Mutable test state (reset per test) ────────────────────────────────────────
let sent: SentCommand[] = [];
let store: Map<string, any>; // PK|SK -> item  (models the DynamoDB table)
let signatureValid = true;
let constructedEvent: any = null;
// Failure injection:
let failProvisioning = false;        // throw inside provisioning (UpdateCommand on USER#)
let failClaimPut = false;            // throw on the claim PutCommand (store unavailable)
let now = Date.UTC(2026, 0, 1);      // controllable clock via Date override not needed; stub reads real Date for ttl only

function keyOf(input: any): string {
  const k = input.Key ?? input.Item;
  return `${k.PK}|${k.SK}`;
}

function cmd(name: string) {
  return class {
    input: any;
    __name = name;
    constructor(input: any) { this.input = input; }
  };
}

// Minimal evaluator for the ConditionExpressions the handler actually uses.
function evalCondition(expr: string | undefined, existing: any, names: any, values: any): boolean {
  if (!expr) return true;
  const resolveName = (tok: string) => (tok.startsWith('#') ? names?.[tok] ?? tok : tok);

  // attribute_not_exists(PK)
  if (expr === 'attribute_not_exists(PK)') return existing === undefined;

  // Claim: attribute_not_exists(PK) OR (#st = :processing AND claimedAt < :staleCutoff)
  if (expr.includes('attribute_not_exists(PK) OR')) {
    if (existing === undefined) return true;
    const st = existing.status;
    const staleCutoff = values[':staleCutoff'];
    return st === 'processing' && existing.claimedAt < staleCutoff;
  }

  // releaseClaim: #st = :processing
  if (expr === '#st = :processing') {
    return existing !== undefined && existing.status === values[':processing'];
  }

  // applySubscriptionState: attribute_not_exists(#evtTs) OR #evtTs <= :evtTs
  if (expr.includes('attribute_not_exists(#evtTs)')) {
    const field = resolveName('#evtTs'); // subscriptionEventTs
    if (existing === undefined || existing[field] === undefined) return true;
    return existing[field] <= values[':evtTs'];
  }

  return true;
}

function applyUpdate(existing: any, input: any): any {
  // Supports the "SET a = :a, b = :b" shape used throughout the handler.
  const item = { ...(existing ?? input.Key) };
  const expr: string = input.UpdateExpression ?? '';
  const names = input.ExpressionAttributeNames ?? {};
  const values = input.ExpressionAttributeValues ?? {};
  const setPart = expr.replace(/^SET\s+/i, '');
  for (const assign of setPart.split(',')) {
    const [lhsRaw, rhsRaw] = assign.split('=').map((s) => s.trim());
    const field = lhsRaw.startsWith('#') ? names[lhsRaw] : lhsRaw;
    const val = values[rhsRaw];
    item[field] = val;
  }
  return item;
}

function sdkStubs() {
  const docClient = {
    send: async (c: any) => {
      sent.push({ name: c.__name, input: c.input });
      const input = c.input;

      if (c.__name === 'GetCommand') {
        return { Item: store.get(keyOf(input)) };
      }

      if (c.__name === 'PutCommand') {
        const isClaim = String(input.Item?.PK || '').startsWith('STRIPE_EVENT#');
        if (isClaim && failClaimPut) {
          const e: any = new Error('DynamoDB unavailable');
          e.name = 'ProvisionedThroughputExceededException';
          throw e;
        }
        const existing = store.get(keyOf(input));
        if (!evalCondition(input.ConditionExpression, existing, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) {
          const e: any = new Error('conditional failed');
          e.name = 'ConditionalCheckFailedException';
          throw e;
        }
        store.set(keyOf(input), { ...input.Item });
        return {};
      }

      if (c.__name === 'UpdateCommand') {
        const isUserWrite = String(input.Key?.PK || '').startsWith('USER#');
        if (isUserWrite && failProvisioning) {
          const e: any = new Error('provisioning write failed');
          e.name = 'InternalServerError';
          throw e;
        }
        const existing = store.get(keyOf(input));
        if (!evalCondition(input.ConditionExpression, existing, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) {
          const e: any = new Error('conditional failed');
          e.name = 'ConditionalCheckFailedException';
          throw e;
        }
        store.set(keyOf(input), applyUpdate(existing, input));
        return {};
      }

      if (c.__name === 'DeleteCommand') {
        const existing = store.get(keyOf(input));
        if (!evalCondition(input.ConditionExpression, existing, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) {
          const e: any = new Error('conditional failed');
          e.name = 'ConditionalCheckFailedException';
          throw e;
        }
        store.delete(keyOf(input));
        return {};
      }

      return {};
    },
  };

  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: { from: () => docClient },
      UpdateCommand: cmd('UpdateCommand'),
      PutCommand: cmd('PutCommand'),
      GetCommand: cmd('GetCommand'),
      DeleteCommand: cmd('DeleteCommand'),
    },
    '@aws-sdk/client-secrets-manager': {
      SecretsManagerClient: class { async send() { return { SecretString: JSON.stringify({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' }) }; } },
      GetSecretValueCommand: cmd('GetSecretValueCommand'),
    },
    stripe: function Stripe() {
      return {
        webhooks: {
          constructEvent: () => {
            if (!signatureValid) throw new Error('No signatures found matching the expected signature');
            return constructedEvent;
          },
        },
      };
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
  const req = ((id: string) => (id in stubs ? stubs[id] : realRequire(id))) as unknown as NodeRequire;
  (m as any).require = req;
  (m as any)._compile(source, handlerPath);
  return (m.exports as any).handler as (e: any) => Promise<any>;
}

function webhookEvent(bodyObj: any, sig = 't=1,v1=deadbeef') {
  return { body: JSON.stringify(bodyObj), isBase64Encoded: false, headers: { 'stripe-signature': sig } };
}

function checkoutEvent(id: string, tier = 'soar', created = 1_700_000_000) {
  return {
    id, type: 'checkout.session.completed', created,
    data: { object: { client_reference_id: 'user-123', customer: 'cus_1', subscription: 'sub_1', metadata: { userId: 'user-123', tier } } },
  };
}

function subUpdatedEvent(id: string, created: number, opts: { status?: string; tier?: string; cancelAtPeriodEnd?: boolean } = {}) {
  return {
    id, type: 'customer.subscription.updated', created,
    data: { object: {
      id: 'sub_1', customer: 'cus_1', status: opts.status ?? 'active',
      current_period_end: 1_800_000_000, cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
      metadata: { userId: 'user-123', tier: opts.tier ?? 'soar' },
    } },
  };
}

function userRecord() { return store.get('USER#user-123|PROFILE'); }
function eventRecord(id: string) { return store.get(`STRIPE_EVENT#${id}|EVENT`); }
function userUpdateCount() { return sent.filter((c) => c.name === 'UpdateCommand' && String(c.input.Key?.PK).startsWith('USER#')).length; }

beforeEach(() => {
  sent = [];
  store = new Map();
  // Seed the user profile so provisioning UpdateCommands have a record to converge on.
  store.set('USER#user-123|PROFILE', { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com' });
  signatureValid = true;
  constructedEvent = null;
  failProvisioning = false;
  failClaimPut = false;
});

describe('stripe-webhook — signature + two-phase idempotency (billing P0)', () => {
  it('1. invalid signature → 400 and DB untouched', async () => {
    const handler = loadHandler();
    signatureValid = false;
    const res = await handler(webhookEvent({ id: 'evt_1' }));
    expect(res.statusCode).toBe(400);
    expect(sent.filter((c) => c.name !== 'GetSecretValueCommand')).toHaveLength(0);
  });

  it('2. first successful delivery → processed once and marked completed', async () => {
    const handler = loadHandler();
    constructedEvent = checkoutEvent('evt_100');
    const res = await handler(webhookEvent({ id: 'evt_100' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).duplicate).toBeUndefined();
    expect(eventRecord('evt_100').status).toBe('completed');
    expect(userRecord().subscriptionTier).toBe('soar');
    expect(userUpdateCount()).toBe(1);
  });

  it('3. duplicate completed delivery → skipped, no re-provision', async () => {
    const handler = loadHandler();
    constructedEvent = checkoutEvent('evt_dup');
    const r1 = await handler(webhookEvent({ id: 'evt_dup' }));
    expect(r1.statusCode).toBe(200);
    const afterFirst = userUpdateCount();

    sent = [];
    const r2 = await handler(webhookEvent({ id: 'evt_dup' }));
    expect(r2.statusCode).toBe(200);
    expect(JSON.parse(r2.body).duplicate).toBe(true);
    expect(userUpdateCount()).toBe(0);
    expect(afterFirst).toBe(1);
  });

  it('4. concurrent duplicate → one provisions, the other gets retryable 409', async () => {
    // Pre-seed a FRESH processing claim (a live sibling attempt).
    store.set('STRIPE_EVENT#evt_cc|EVENT', { PK: 'STRIPE_EVENT#evt_cc', SK: 'EVENT', status: 'processing', claimedAt: Date.now(), attempts: 1 });
    const handler = loadHandler();
    constructedEvent = checkoutEvent('evt_cc');
    const res = await handler(webhookEvent({ id: 'evt_cc' }));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).received).toBe(false);
    // Did not provision while sibling holds the claim.
    expect(userUpdateCount()).toBe(0);
  });

  it('5+6. failure during provisioning → claim released, retryable 500, not completed', async () => {
    const handler = loadHandler();
    constructedEvent = checkoutEvent('evt_fail');
    failProvisioning = true;
    const res = await handler(webhookEvent({ id: 'evt_fail' }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).received).toBe(false);
    // Claim must be RELEASED (deleted) so Stripe's retry can re-attempt — not left as a
    // 'completed' or dangling 'processing' marker.
    expect(eventRecord('evt_fail')).toBeUndefined();
  });

  it('7+11. retry after failure → succeeds, completes, correct entitlement', async () => {
    const handler = loadHandler();
    constructedEvent = checkoutEvent('evt_retry');
    failProvisioning = true;
    const r1 = await handler(webhookEvent({ id: 'evt_retry' }));
    expect(r1.statusCode).toBe(500);

    // Stripe retries the SAME event id; this time provisioning succeeds.
    failProvisioning = false;
    sent = [];
    const r2 = await handler(webhookEvent({ id: 'evt_retry' }));
    expect(r2.statusCode).toBe(200);
    expect(eventRecord('evt_retry').status).toBe('completed');
    expect(userRecord().subscriptionTier).toBe('soar');
    expect(userRecord().subscriptionStatus).toBe('active');
  });

  it('8. DynamoDB unavailable on claim → fail closed with retryable 503, no processing', async () => {
    const handler = loadHandler();
    constructedEvent = checkoutEvent('evt_down');
    failClaimPut = true;
    const res = await handler(webhookEvent({ id: 'evt_down' }));
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).received).toBe(false);
    expect(userUpdateCount()).toBe(0);
  });

  it('9. stale processing claim → taken over and processed', async () => {
    // A crashed prior attempt left a 'processing' claim older than the stale window.
    const stale = Date.now() - (16 * 60 * 1000); // 16 min > 15 min stale cutoff
    store.set('STRIPE_EVENT#evt_stale|EVENT', { PK: 'STRIPE_EVENT#evt_stale', SK: 'EVENT', status: 'processing', claimedAt: stale, attempts: 1 });
    const handler = loadHandler();
    constructedEvent = checkoutEvent('evt_stale');
    const res = await handler(webhookEvent({ id: 'evt_stale' }));
    expect(res.statusCode).toBe(200);
    expect(eventRecord('evt_stale').status).toBe('completed');
    expect(userRecord().subscriptionTier).toBe('soar');
  });

  it('10. out-of-order subscription updates → older event does not overwrite newer state', async () => {
    const handler = loadHandler();

    // Newer event lands first: downgrade scheduled (cancel at period end), ts=2000.
    constructedEvent = subUpdatedEvent('evt_new', 2000, { tier: 'soar', cancelAtPeriodEnd: true });
    const rNew = await handler(webhookEvent({ id: 'evt_new' }));
    expect(rNew.statusCode).toBe(200);
    expect(userRecord().subscriptionEventTs).toBe(2000);
    expect(userRecord().subscriptionCancelAtPeriodEnd).toBe(true);

    // Older event arrives late: ts=1000, cancel NOT scheduled. Must NOT overwrite.
    constructedEvent = subUpdatedEvent('evt_old', 1000, { tier: 'soar', cancelAtPeriodEnd: false });
    const rOld = await handler(webhookEvent({ id: 'evt_old' }));
    expect(rOld.statusCode).toBe(200); // still acked (event handled), but state preserved
    expect(userRecord().subscriptionEventTs).toBe(2000);
    expect(userRecord().subscriptionCancelAtPeriodEnd).toBe(true);
  });
});
