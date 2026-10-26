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

// ─── Priority 1: tier resolution + never-silent-grant ──────────────────────────
// A subscription.updated event with an explicit price (items.data[0].price.id) and
// optional metadata.tier. When metadata is absent/garbled we must resolve from the
// price; when NEITHER resolves we must NOT grant a paid tier.
function subUpdatedWithPrice(
  id: string,
  created: number,
  opts: { status?: string; metaTier?: string | null; priceId?: string | null } = {},
) {
  const metadata: any = { userId: 'user-123' };
  if (opts.metaTier !== null && opts.metaTier !== undefined) metadata.tier = opts.metaTier;
  const obj: any = {
    id: 'sub_1', customer: 'cus_1', status: opts.status ?? 'active',
    current_period_end: 1_800_000_000, cancel_at_period_end: false, metadata,
  };
  if (opts.priceId !== null && opts.priceId !== undefined) {
    obj.items = { data: [{ price: { id: opts.priceId } }] };
  }
  return { id, type: 'customer.subscription.updated', created, data: { object: obj } };
}

describe('stripe-webhook — tier correctness (Priority 1)', () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_SOAR = 'price_soar';
    process.env.STRIPE_PRICE_TEAM = 'price_team';
    process.env.STRIPE_PRICE_BASE = 'price_base';
    process.env.STRIPE_PRICE_GROWTH = 'price_growth';
  });

  it('Summit metadata resolves to the team tier (never free/soar)', async () => {
    const handler = loadHandler();
    constructedEvent = subUpdatedWithPrice('evt_sum', 1_700_000_100, { metaTier: 'summit' });
    const res = await handler(webhookEvent({ id: 'evt_sum' }));
    expect(res.statusCode).toBe(200);
    expect(userRecord().subscriptionTier).toBe('team');
  });

  it('missing metadata tier resolves from the purchased Price id', async () => {
    const handler = loadHandler();
    constructedEvent = subUpdatedWithPrice('evt_price', 1_700_000_101, { metaTier: null, priceId: 'price_team' });
    const res = await handler(webhookEvent({ id: 'evt_price' }));
    expect(res.statusCode).toBe(200);
    expect(userRecord().subscriptionTier).toBe('team');
  });

  it('UNRESOLVABLE tier (unknown metadata AND unknown price) never silently grants paid', async () => {
    const handler = loadHandler();
    // Seed a known prior tier so we can prove it is LEFT UNCHANGED (not bumped to paid).
    store.set('USER#user-123|PROFILE', { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com', subscriptionTier: 'free' });
    constructedEvent = subUpdatedWithPrice('evt_unk', 1_700_000_102, { metaTier: 'enterprise', priceId: 'price_unknown' });
    const res = await handler(webhookEvent({ id: 'evt_unk' }));
    expect(res.statusCode).toBe(200);
    // Tier must NOT have been set to soar/team off an unrecognized payload.
    expect(userRecord().subscriptionTier).toBe('free');
    // Status still advances (so we have a record of the event), but entitlement did not.
    expect(userRecord().subscriptionStatus).toBe('active');
  });

  it('checkout.session.completed with unknown tier records identifiers but no paid tier', async () => {
    const handler = loadHandler();
    store.set('USER#user-123|PROFILE', { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com', subscriptionTier: 'free' });
    constructedEvent = {
      id: 'evt_co_unk', type: 'checkout.session.completed', created: 1_700_000_103,
      data: { object: { client_reference_id: 'user-123', customer: 'cus_1', subscription: 'sub_1', metadata: { userId: 'user-123', tier: 'mystery' } } },
    };
    const res = await handler(webhookEvent({ id: 'evt_co_unk' }));
    expect(res.statusCode).toBe(200);
    expect(userRecord().stripeSubscriptionId).toBe('sub_1'); // identifiers recorded
    expect(userRecord().subscriptionTier).toBe('free');       // but NOT silently upgraded
  });

  // ─── Regression: Price ID is authoritative over stale metadata (portal plan change) ──
  // A Stripe customer-portal upgrade swaps the Price but does NOT rewrite
  // subscription.metadata, so metadata.tier stays at the ORIGINAL plan. The purchased
  // Price must win so the real current plan is reflected.
  it('REGRESSION: stale Soar metadata + Summit price resolves to team (portal upgrade)', async () => {
    const handler = loadHandler();
    store.set('USER#user-123|PROFILE', { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com', subscriptionTier: 'soar', subscriptionStatus: 'active', trialEndsAt: '2026-11-02T00:00:00.000Z' });
    constructedEvent = subUpdatedWithPrice('evt_up', 1_700_000_110, { metaTier: 'soar', priceId: 'price_team' });
    const res = await handler(webhookEvent({ id: 'evt_up' }));
    expect(res.statusCode).toBe(200);
    expect(userRecord().subscriptionTier).toBe('team');                 // Price wins
    expect(userRecord().trialEndsAt).toBe('2026-11-02T00:00:00.000Z');  // trial date preserved
    expect(userRecord().stripeSubscriptionId).toBe('sub_1');            // same subscription, not a new one
  });

  it('REGRESSION: stale Summit metadata + Soar price resolves to soar (portal downgrade)', async () => {
    const handler = loadHandler();
    constructedEvent = subUpdatedWithPrice('evt_down', 1_700_000_111, { metaTier: 'summit', priceId: 'price_soar' });
    const res = await handler(webhookEvent({ id: 'evt_down' }));
    expect(res.statusCode).toBe(200);
    expect(userRecord().subscriptionTier).toBe('soar'); // Price wins over stale 'summit' metadata
  });

  it('matching metadata and price agree (team + team price → team)', async () => {
    const handler = loadHandler();
    constructedEvent = subUpdatedWithPrice('evt_match', 1_700_000_112, { metaTier: 'summit', priceId: 'price_team' });
    const res = await handler(webhookEvent({ id: 'evt_match' }));
    expect(res.statusCode).toBe(200);
    expect(userRecord().subscriptionTier).toBe('team');
  });

  it('unrecognized purchased price FAILS CLOSED even with stale paid metadata (no grant off stale meta)', async () => {
    // A price IS present but matches no configured Soar/Summit price. Stale metadata
    // must NOT grant paid access — fail closed and leave the prior tier unchanged.
    const handler = loadHandler();
    store.set('USER#user-123|PROFILE', { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com', subscriptionTier: 'free' });
    constructedEvent = subUpdatedWithPrice('evt_badprice', 1_700_000_113, { metaTier: 'team', priceId: 'price_unknown' });
    const res = await handler(webhookEvent({ id: 'evt_badprice' }));
    expect(res.statusCode).toBe(200);
    expect(userRecord().subscriptionTier).toBe('free');       // NOT granted off stale metadata
    expect(userRecord().subscriptionStatus).toBe('active');   // status still recorded
  });

  it('metadata fallback applies ONLY when the event carries no price data', async () => {
    // Preserve safe behavior for events that legitimately omit items/price: our own
    // checkout metadata.tier is the only signal, so a recognized paid label is honored.
    const handler = loadHandler();
    constructedEvent = subUpdatedWithPrice('evt_noprice', 1_700_000_116, { metaTier: 'summit', priceId: null });
    const res = await handler(webhookEvent({ id: 'evt_noprice' }));
    expect(res.statusCode).toBe(200);
    expect(userRecord().subscriptionTier).toBe('team'); // metadata fallback (no price present)
  });

  it('unknown price AND unknown metadata cannot grant paid access (fail closed)', async () => {
    const handler = loadHandler();
    store.set('USER#user-123|PROFILE', { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com', subscriptionTier: 'free' });
    constructedEvent = subUpdatedWithPrice('evt_none', 1_700_000_114, { metaTier: 'mystery', priceId: 'price_unknown' });
    const res = await handler(webhookEvent({ id: 'evt_none' }));
    expect(res.statusCode).toBe(200);
    expect(userRecord().subscriptionTier).toBe('free'); // neither source → no paid grant
  });

  it('existing subscription is updated in place (no second subscription id created)', async () => {
    const handler = loadHandler();
    store.set('USER#user-123|PROFILE', { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com', subscriptionTier: 'soar', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' });
    constructedEvent = subUpdatedWithPrice('evt_inplace', 1_700_000_115, { metaTier: 'soar', priceId: 'price_team' });
    const res = await handler(webhookEvent({ id: 'evt_inplace' }));
    expect(res.statusCode).toBe(200);
    expect(userRecord().stripeSubscriptionId).toBe('sub_1'); // same subscription
    expect(userRecord().subscriptionTier).toBe('team');
  });
});

// ─── Priority 3: failed-payment does not prematurely remove access ──────────────
describe('stripe-webhook — failed-payment / lifecycle entitlement (Priority 3)', () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_SOAR = 'price_soar';
    process.env.STRIPE_PRICE_TEAM = 'price_team';
  });

  it('past_due subscription.updated keeps the paid tier (no premature downgrade)', async () => {
    const handler = loadHandler();
    store.set('USER#user-123|PROFILE', { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com', subscriptionTier: 'team', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' });
    constructedEvent = subUpdatedWithPrice('evt_pd', 1_700_000_200, { status: 'past_due', metaTier: 'team' });
    const res = await handler(webhookEvent({ id: 'evt_pd' }));
    expect(res.statusCode).toBe(200);
    // Access retained during Stripe's retry/grace window.
    expect(userRecord().subscriptionTier).toBe('team');
    expect(userRecord().subscriptionStatus).toBe('past_due');
  });

  it('invoice.payment_failed only flags past_due (does not touch tier)', async () => {
    const handler = loadHandler();
    store.set('USER#user-123|PROFILE', { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com', subscriptionTier: 'soar', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' });
    constructedEvent = {
      id: 'evt_if', type: 'invoice.payment_failed', created: 1_700_000_201,
      data: { object: { id: 'in_1', subscription_details: { metadata: { userId: 'user-123' } } } },
    };
    const res = await handler(webhookEvent({ id: 'evt_if' }));
    expect(res.statusCode).toBe(200);
    expect(userRecord().subscriptionStatus).toBe('past_due');
    expect(userRecord().subscriptionTier).toBe('soar'); // tier untouched
  });

  it('subscription.deleted is the terminal event that removes access', async () => {
    const handler = loadHandler();
    store.set('USER#user-123|PROFILE', { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com', subscriptionTier: 'team', subscriptionStatus: 'past_due', stripeSubscriptionId: 'sub_1' });
    constructedEvent = {
      id: 'evt_del', type: 'customer.subscription.deleted', created: 1_700_000_202,
      data: { object: { id: 'sub_1', customer: 'cus_1', metadata: { userId: 'user-123' } } },
    };
    const res = await handler(webhookEvent({ id: 'evt_del' }));
    expect(res.statusCode).toBe(200);
    expect(userRecord().subscriptionTier).toBe('free');
    expect(userRecord().subscriptionStatus).toBe('canceled');
  });
});

// ─── Priority: current_period_end resilience (billing sync bug fix) ─────────────
// A portal-initiated cancellation sends customer.subscription.updated with
// cancel_at_period_end=true. Newer Stripe API versions omit the top-level
// current_period_end (it moved onto subscription items), which previously made the
// handler throw RangeError('Invalid time value') and return 500 — so the cancellation
// never recorded. These tests pin that the handler now records cancelAtPeriodEnd and a
// safe period-end (top-level, item-nested, or null) WITHOUT crashing.
function subUpdatedPeriodShape(
  id: string,
  created: number,
  opts: {
    status?: string;
    cancelAtPeriodEnd?: boolean;
    topLevelPeriodEnd?: number | undefined; // omit → undefined (newer API)
    itemPeriodEnd?: number | undefined;     // nested on items.data[0]
    metaTier?: string;
  } = {},
) {
  const obj: any = {
    id: 'sub_1',
    customer: 'cus_1',
    status: opts.status ?? 'active',
    cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
    metadata: { userId: 'user-123', tier: opts.metaTier ?? 'team' },
  };
  if (opts.topLevelPeriodEnd !== undefined) obj.current_period_end = opts.topLevelPeriodEnd;
  if (opts.itemPeriodEnd !== undefined) {
    obj.items = { data: [{ price: { id: 'price_team' }, current_period_end: opts.itemPeriodEnd }] };
  }
  return { id, type: 'customer.subscription.updated', created, data: { object: obj } };
}

describe('stripe-webhook — current_period_end resilience', () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_TEAM = 'price_team';
    store.set('USER#user-123|PROFILE', { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com', subscriptionTier: 'team', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' });
  });

  it('normal top-level current_period_end is recorded as ISO', async () => {
    const handler = loadHandler();
    constructedEvent = subUpdatedPeriodShape('evt_pe_top', 1_700_001_000, { topLevelPeriodEnd: 1_800_000_000, cancelAtPeriodEnd: true });
    const res = await handler(webhookEvent({ id: 'evt_pe_top' }));
    expect(res.statusCode).toBe(200);
    expect(userRecord().subscriptionCancelAtPeriodEnd).toBe(true);
    expect(userRecord().subscriptionCurrentPeriodEnd).toBe(new Date(1_800_000_000 * 1000).toISOString());
  });

  it('MISSING top-level current_period_end no longer crashes; cancelAtPeriodEnd still recorded', async () => {
    const handler = loadHandler();
    // Newer-API shape: no top-level field, no item field → period end null, but the
    // cancellation MUST still persist (this is the exact production bug).
    constructedEvent = subUpdatedPeriodShape('evt_pe_missing', 1_700_001_001, { topLevelPeriodEnd: undefined, cancelAtPeriodEnd: true });
    const res = await handler(webhookEvent({ id: 'evt_pe_missing' }));
    expect(res.statusCode).toBe(200); // was 500 (RangeError) before the fix
    expect(userRecord().subscriptionCancelAtPeriodEnd).toBe(true);
    expect(userRecord().subscriptionCurrentPeriodEnd).toBeNull();
    expect(userRecord().subscriptionStatus).toBe('active'); // access retained until period end
  });

  it('period end available via subscription items is used when top-level is absent', async () => {
    const handler = loadHandler();
    constructedEvent = subUpdatedPeriodShape('evt_pe_item', 1_700_001_002, { topLevelPeriodEnd: undefined, itemPeriodEnd: 1_806_000_000, cancelAtPeriodEnd: true });
    const res = await handler(webhookEvent({ id: 'evt_pe_item' }));
    expect(res.statusCode).toBe(200);
    expect(userRecord().subscriptionCancelAtPeriodEnd).toBe(true);
    expect(userRecord().subscriptionCurrentPeriodEnd).toBe(new Date(1_806_000_000 * 1000).toISOString());
  });

  it('scheduled cancellation keeps the paid tier and active status until period end', async () => {
    const handler = loadHandler();
    constructedEvent = subUpdatedPeriodShape('evt_pe_sched', 1_700_001_003, { status: 'active', topLevelPeriodEnd: 1_806_000_000, cancelAtPeriodEnd: true, metaTier: 'team' });
    const res = await handler(webhookEvent({ id: 'evt_pe_sched' }));
    expect(res.statusCode).toBe(200);
    expect(userRecord().subscriptionTier).toBe('team');
    expect(userRecord().subscriptionStatus).toBe('active');
    expect(userRecord().subscriptionCancelAtPeriodEnd).toBe(true);
  });

  it('duplicate delivery of the cancellation event stays idempotent (no double-processing)', async () => {
    const handler = loadHandler();
    constructedEvent = subUpdatedPeriodShape('evt_pe_dup', 1_700_001_004, { topLevelPeriodEnd: undefined, cancelAtPeriodEnd: true });
    const r1 = await handler(webhookEvent({ id: 'evt_pe_dup' }));
    const updatesAfterFirst = userUpdateCount();
    const r2 = await handler(webhookEvent({ id: 'evt_pe_dup' }));
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(JSON.parse(r2.body).duplicate).toBe(true);
    // Second delivery must NOT re-run provisioning.
    expect(userUpdateCount()).toBe(updatesAfterFirst);
    expect(userRecord().subscriptionCancelAtPeriodEnd).toBe(true);
  });

  it('subscription.deleted still records null period end and removes access (no regression)', async () => {
    const handler = loadHandler();
    constructedEvent = {
      id: 'evt_pe_del', type: 'customer.subscription.deleted', created: 1_700_001_005,
      data: { object: { id: 'sub_1', customer: 'cus_1', metadata: { userId: 'user-123' } } },
    };
    const res = await handler(webhookEvent({ id: 'evt_pe_del' }));
    expect(res.statusCode).toBe(200);
    expect(userRecord().subscriptionTier).toBe('free');
    expect(userRecord().subscriptionStatus).toBe('canceled');
    expect(userRecord().subscriptionCurrentPeriodEnd).toBeNull();
  });
});
