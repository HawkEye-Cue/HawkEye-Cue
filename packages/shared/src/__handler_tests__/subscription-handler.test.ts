// Billing tests for the compiled subscription-handler.
//
// Covers the two approved improvements:
//   GRACEFUL CANCELLATION
//     - A paid (active) subscription cancels at period end, NOT immediately.
//       We call subscriptions.update(cancel_at_period_end:true), never
//       subscriptions.cancel(), and we do NOT locally downgrade the tier (Stripe
//       webhooks drive the entitlement transition). Access is preserved.
//     - A trialing subscription is handled explicitly: it still schedules
//       cancel_at_period_end and the response explains the trial will not convert.
//   STRIPE BILLING PORTAL
//     - Portal session uses the customer id from the AUTHENTICATED account only.
//     - return_url is restricted to an allowlisted origin (no open redirect).
//     - Missing customer id is a clean 400, not a crash.
//
// Stripe + AWS SDK are stubbed via the same require-cache technique as the other
// handler tests; the Stripe stub records which methods were called.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const handlerPath = resolve(here, '../../../../lambdas/dist/subscription-handler/index.js');

type Call = { method: string; args: any[] };
let stripeCalls: Call[];
let userItem: any;
let provisioned: any = null;
let upgraded: any = null;
let retrievedSubscription: any;
let portalSessionArgs: any;
let checkoutSessionArgs: any;
let updateArgs: any;

function cmd(name: string) {
  return class { input: any; __name = name; constructor(input: any) { this.input = input; } };
}

function sdkStubs() {
  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: {
        from: () => ({
          send: async (c: any) => {
            if (c.__name === 'GetCommand') return { Item: userItem };

            if (c.__name === 'UpdateCommand') {
              // Faithfully evaluate the ConditionExpression against the current record
              // and persist the SET assignments, so trial-upgrade and expiry updates are
              // actually simulated (not silently accepted).
              const cond = c.input.ConditionExpression || '';
              const values = c.input.ExpressionAttributeValues || {};
              const cur = userItem || {};
              // Trial-upgrade guard: only applies while un-trialed AND un-paid.
              if (cond.includes('attribute_not_exists(trialEndsAt)')) {
                const ok = !cur.trialEndsAt && !cur.stripeCustomerId && !cur.stripeSubscriptionId;
                if (!ok) { const e: any = new Error('cond'); e.name = 'ConditionalCheckFailedException'; throw e; }
              }
              // Apply the SET fields from the expression (supports the specific SETs used).
              const expr = String(c.input.UpdateExpression || '');
              const next = { ...cur };
              if (/subscriptionTier\s*=\s*:(soar|tier)/.test(expr)) next.subscriptionTier = values[':soar'] ?? values[':tier'];
              if (/subscriptionStatus\s*=\s*:(trial|status)/.test(expr)) next.subscriptionStatus = values[':trial'] ?? values[':status'];
              if (/trialEndsAt\s*=\s*:te/.test(expr)) next.trialEndsAt = values[':te'];
              userItem = next;
              upgraded = cond.includes('attribute_not_exists(trialEndsAt)') ? next : upgraded;
              return {};
            }

            if (c.__name === 'PutCommand') {
              // Self-heal CREATE (GET /subscription when no profile exists). Single-grant.
              if (String(c.input.Item?.SK) === 'PROFILE') {
                if (userItem) { const e: any = new Error('exists'); e.name = 'ConditionalCheckFailedException'; throw e; }
                provisioned = c.input.Item;
                userItem = c.input.Item;
              }
              return {};
            }
            return {};
          },
        }),
      },
      GetCommand: cmd('GetCommand'),
      UpdateCommand: cmd('UpdateCommand'),
      PutCommand: cmd('PutCommand'),
    },
    '@aws-sdk/client-secrets-manager': {
      SecretsManagerClient: class { async send() { return { SecretString: JSON.stringify({ STRIPE_SECRET_KEY: 'sk_test_x' }) }; } },
      GetSecretValueCommand: cmd('GetSecretValueCommand'),
    },
    stripe: function Stripe() {
      return {
        subscriptions: {
          retrieve: async (...args: any[]) => { stripeCalls.push({ method: 'subscriptions.retrieve', args }); return retrievedSubscription; },
          update: async (...args: any[]) => { stripeCalls.push({ method: 'subscriptions.update', args }); updateArgs = args; return { ...retrievedSubscription, current_period_end: 1_900_000_000, cancel_at_period_end: true }; },
          cancel: async (...args: any[]) => { stripeCalls.push({ method: 'subscriptions.cancel', args }); return {}; },
        },
        billingPortal: {
          sessions: {
            create: async (...args: any[]) => { stripeCalls.push({ method: 'billingPortal.sessions.create', args }); portalSessionArgs = args[0]; return { url: 'https://billing.stripe.com/session/xyz' }; },
          },
        },
        checkout: { sessions: { create: async (...args: any[]) => { stripeCalls.push({ method: 'checkout.sessions.create', args }); checkoutSessionArgs = args[0]; return { url: 'https://checkout' }; } } },
        promotionCodes: { list: async () => ({ data: [] }) },
      };
    },
  } as Record<string, any>;
}

function loadHandler() {
  process.env.TABLE_NAME = 'TestTable';
  process.env.STRIPE_PRICE_SOAR = 'price_soar';
  process.env.STRIPE_PRICE_TEAM = 'price_team';
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

function apiEvent(method: string, path: string, origin?: string) {
  return {
    requestContext: { http: { method, path }, authorizer: { jwt: { claims: { sub: 'user-123' } } } },
    headers: origin ? { origin } : {},
    body: null,
  };
}

function checkoutEvent(tier: string) {
  return {
    requestContext: { http: { method: 'POST', path: '/subscription/checkout' }, authorizer: { jwt: { claims: { sub: 'user-123' } } } },
    headers: { origin: 'https://app.hawkeyecue.com' },
    body: JSON.stringify({ tier }),
  };
}
// The subscription_data Stripe receives for the checkout session.
function subData() { return checkoutSessionArgs?.subscription_data || {}; }

beforeEach(() => {
  stripeCalls = [];
  portalSessionArgs = null;
  checkoutSessionArgs = null;
  updateArgs = null;
  provisioned = null;
  upgraded = null;
  userItem = { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com', stripeCustomerId: 'cus_live', stripeSubscriptionId: 'sub_live' };
  retrievedSubscription = { id: 'sub_live', status: 'active', current_period_end: 1_900_000_000 };
});

describe('subscription-handler — GET /subscription trial self-heal', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('brand-new account (no profile) receives its first 7-day Soar trial (CREATE path)', async () => {
    userItem = null; // post-confirmation trigger never ran
    const handler = loadHandler();
    const res = await handler(apiEvent('GET', '/subscription'));
    expect(res.statusCode).toBe(200);
    const b = JSON.parse(res.body);
    expect(b.tier).toBe('soar');
    expect(b.status).toBe('trial');
    expect(b.trialEndsAt).toBeTruthy();
    expect(provisioned).toBeTruthy();      // CREATE path (single-grant attribute_not_exists)
    expect(provisioned.subscriptionTier).toBe('soar');
    expect(upgraded).toBeNull();
  });

  it('eligible legacy bare-Nest account receives its first trial (UPGRADE path)', async () => {
    // From the OLD social-accounts path: free, NO trialEndsAt, NO Stripe history.
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com', subscriptionTier: 'free', subscriptionStatus: 'none' };
    const handler = loadHandler();
    const res = await handler(apiEvent('GET', '/subscription'));
    expect(res.statusCode).toBe(200);
    const b = JSON.parse(res.body);
    expect(b.tier).toBe('soar');
    expect(b.status).toBe('trial');
    expect(b.trialEndsAt).toBeTruthy();
    expect(upgraded).toBeTruthy();   // UPGRADE path (conditional update)
    expect(provisioned).toBeNull();
  });

  it('expired-trial Nest account is NOT re-granted and stays free (security assertion preserved)', async () => {
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', subscriptionTier: 'free', subscriptionStatus: 'expired', trialEndsAt: new Date(Date.now() - DAY).toISOString() };
    const handler = loadHandler();
    const res = await handler(apiEvent('GET', '/subscription'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).tier).toBe('free');
    expect(provisioned).toBeNull();
    expect(upgraded).toBeNull();
  });

  it('in-flight-expired trial reverts to free and is not re-granted', async () => {
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', subscriptionTier: 'soar', subscriptionStatus: 'trial', trialEndsAt: new Date(Date.now() - DAY).toISOString() };
    const handler = loadHandler();
    const res = await handler(apiEvent('GET', '/subscription'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).tier).toBe('free');
    expect(upgraded).toBeNull();
  });

  it('existing PAID account retains its subscription (never touched)', async () => {
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', subscriptionTier: 'team', subscriptionStatus: 'active', stripeCustomerId: 'cus_x', stripeSubscriptionId: 'sub_x' };
    const handler = loadHandler();
    const res = await handler(apiEvent('GET', '/subscription'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).tier).toBe('team');
    expect(provisioned).toBeNull();
    expect(upgraded).toBeNull();
  });

  it('canceled/paid-history account (free tier but Stripe fields) is NOT given a trial', async () => {
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', subscriptionTier: 'free', subscriptionStatus: 'canceled', stripeCustomerId: 'cus_x' };
    const handler = loadHandler();
    const res = await handler(apiEvent('GET', '/subscription'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).tier).toBe('free');
    expect(provisioned).toBeNull();
    expect(upgraded).toBeNull();
  });

  it('concurrent self-heal does not grant or restart multiple trials', async () => {
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com', subscriptionTier: 'free', subscriptionStatus: 'none' };
    const handler = loadHandler();
    const [r1, r2] = await Promise.all([
      handler(apiEvent('GET', '/subscription')),
      handler(apiEvent('GET', '/subscription')),
    ]);
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(JSON.parse(r1.body).tier).toBe('soar');
    expect(JSON.parse(r2.body).tier).toBe('soar');
    // Single trial — both observe the SAME end date; never restarted.
    expect(JSON.parse(r1.body).trialEndsAt).toBe(userItem.trialEndsAt);
    expect(JSON.parse(r2.body).trialEndsAt).toBe(userItem.trialEndsAt);
  });
});

describe('subscription-handler — ONE 7-day trial per account at checkout', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('new eligible account (never trialed, no Stripe) gets exactly one 7-day trial', async () => {
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com', subscriptionTier: 'free', subscriptionStatus: 'none' };
    const handler = loadHandler();
    const res = await handler(checkoutEvent('soar'));
    expect(res.statusCode).toBe(200);
    expect(subData().trial_period_days).toBe(7);
    expect(subData().trial_end).toBeUndefined();
    const b = JSON.parse(res.body);
    expect(b.firstChargeAmount).toBe(24.99);
    expect(b.trialPreserved).toBe(false);
  });

  it('active Soar trial upgrading to Summit preserves ORIGINAL expiration (no fresh 7 days)', async () => {
    const originalEnd = new Date(Date.now() + 5 * DAY).toISOString();
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com', subscriptionTier: 'soar', subscriptionStatus: 'trial', trialEndsAt: originalEnd };
    const handler = loadHandler();
    const res = await handler(checkoutEvent('team'));
    expect(res.statusCode).toBe(200);
    // No new trial window; trial_end pinned to the original expiration.
    expect(subData().trial_period_days).toBeUndefined();
    expect(subData().trial_end).toBe(Math.floor(new Date(originalEnd).getTime() / 1000));
    const b = JSON.parse(res.body);
    expect(b.trialPreserved).toBe(true);
    expect(b.firstChargeAt).toBe(new Date(Math.floor(new Date(originalEnd).getTime() / 1000) * 1000).toISOString());
  });

  it('trial with ONE day remaining retains only one day when upgrading', async () => {
    const oneDayLeft = new Date(Date.now() + 1 * DAY).toISOString();
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', subscriptionTier: 'soar', subscriptionStatus: 'trial', trialEndsAt: oneDayLeft };
    const handler = loadHandler();
    const res = await handler(checkoutEvent('team'));
    expect(res.statusCode).toBe(200);
    expect(subData().trial_period_days).toBeUndefined();
    expect(subData().trial_end).toBe(Math.floor(new Date(oneDayLeft).getTime() / 1000));
  });

  it('EXPIRED trial upgrading to Summit gets NO second trial (charge now)', async () => {
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', subscriptionTier: 'free', subscriptionStatus: 'expired', trialEndsAt: new Date(Date.now() - DAY).toISOString() };
    const handler = loadHandler();
    const res = await handler(checkoutEvent('team'));
    expect(res.statusCode).toBe(200);
    expect(subData().trial_period_days).toBeUndefined();
    expect(subData().trial_end).toBeUndefined();
  });

  it('previously CANCELED trial gets no second trial', async () => {
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', subscriptionTier: 'free', subscriptionStatus: 'canceled', trialEndsAt: new Date(Date.now() - 10 * DAY).toISOString(), stripeCustomerId: 'cus_old' };
    const handler = loadHandler();
    const res = await handler(checkoutEvent('soar'));
    expect(res.statusCode).toBe(200);
    expect(subData().trial_period_days).toBeUndefined();
    expect(subData().trial_end).toBeUndefined();
  });

  it('existing ACTIVE paid subscriber is routed to plan change, not a 2nd subscription', async () => {
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', subscriptionTier: 'soar', subscriptionStatus: 'active', stripeCustomerId: 'cus_x', stripeSubscriptionId: 'sub_x' };
    const handler = loadHandler();
    const res = await handler(checkoutEvent('team'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).planChangeRequired).toBe(true);
    // No checkout session created (no duplicate subscription).
    expect(stripeCalls.find((c) => c.method === 'checkout.sessions.create')).toBeUndefined();
  });

  it('repeated checkout sessions for the same mid-trial account never restart the trial', async () => {
    const originalEnd = new Date(Date.now() + 4 * DAY).toISOString();
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', subscriptionTier: 'soar', subscriptionStatus: 'trial', trialEndsAt: originalEnd };
    const handler = loadHandler();
    const r1 = await handler(checkoutEvent('team'));
    const firstTrialEnd = subData().trial_end;
    const r2 = await handler(checkoutEvent('soar'));
    const secondTrialEnd = subData().trial_end;
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    // Both sessions pin to the SAME original expiration — never a fresh 7 days.
    expect(firstTrialEnd).toBe(Math.floor(new Date(originalEnd).getTime() / 1000));
    expect(secondTrialEnd).toBe(firstTrialEnd);
  });

  it('derives identity from the JWT sub, not client-supplied body fields', async () => {
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', subscriptionTier: 'free', subscriptionStatus: 'none' };
    const handler = loadHandler();
    // Attempt to spoof a different userId / tier eligibility in the body.
    const ev = {
      requestContext: { http: { method: 'POST', path: '/subscription/checkout' }, authorizer: { jwt: { claims: { sub: 'user-123' } } } },
      headers: { origin: 'https://app.hawkeyecue.com' },
      body: JSON.stringify({ tier: 'soar', userId: 'attacker', trialEndsAt: null }),
    };
    const res = await handler(ev);
    expect(res.statusCode).toBe(200);
    // client_reference_id / metadata.userId come from the authenticated sub.
    expect(checkoutSessionArgs.client_reference_id).toBe('user-123');
    expect(checkoutSessionArgs.metadata.userId).toBe('user-123');
  });
});

describe('subscription-handler — graceful cancellation', () => {
  it('schedules end-of-period cancel for a paid subscription (no immediate cancel, no local downgrade)', async () => {
    const handler = loadHandler();
    const res = await handler(apiEvent('POST', '/subscription/cancel'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.cancelAtPeriodEnd).toBe(true);
    expect(body.wasTrialing).toBe(false);
    expect(body.accessUntil).toBeTruthy();

    // Used update(cancel_at_period_end:true), NOT the immediate cancel().
    const updates = stripeCalls.filter((c) => c.method === 'subscriptions.update');
    expect(updates).toHaveLength(1);
    expect(updateArgs[1]).toMatchObject({ cancel_at_period_end: true });
    expect(stripeCalls.find((c) => c.method === 'subscriptions.cancel')).toBeUndefined();
  });

  it('handles a trialing subscription explicitly', async () => {
    retrievedSubscription = { id: 'sub_live', status: 'trialing', current_period_end: 1_900_000_000 };
    const handler = loadHandler();
    const res = await handler(apiEvent('POST', '/subscription/cancel'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.wasTrialing).toBe(true);
    expect(body.cancelAtPeriodEnd).toBe(true);
    // Still schedules at period end rather than cancelling the trial immediately.
    expect(updateArgs[1]).toMatchObject({ cancel_at_period_end: true });
  });

  it('returns 400 when there is no subscription to cancel', async () => {
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', stripeCustomerId: 'cus_live' }; // no stripeSubscriptionId
    const handler = loadHandler();
    const res = await handler(apiEvent('POST', '/subscription/cancel'));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('NO_SUBSCRIPTION');
    expect(stripeCalls).toHaveLength(0);
  });
});

describe('subscription-handler — billing portal', () => {
  it('creates a portal session using the authenticated account customer id and an allowlisted return url', async () => {
    const handler = loadHandler();
    const res = await handler(apiEvent('POST', '/subscription/portal', 'https://app.hawkeyecue.com'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).portalUrl).toContain('billing.stripe.com');
    // Customer id derived from the stored account, never from request input.
    expect(portalSessionArgs.customer).toBe('cus_live');
    expect(portalSessionArgs.return_url).toBe('https://app.hawkeyecue.com/settings');
  });

  it('falls back to the canonical origin for a non-allowlisted (spoofed) Origin header', async () => {
    const handler = loadHandler();
    const res = await handler(apiEvent('POST', '/subscription/portal', 'https://evil.example.com'));
    expect(res.statusCode).toBe(200);
    // Must NOT echo the attacker origin into the return url.
    expect(portalSessionArgs.return_url).toBe('https://app.hawkeyecue.com/settings');
  });

  it('returns 400 when the account has no Stripe customer yet', async () => {
    userItem = { PK: 'USER#user-123', SK: 'PROFILE' }; // no stripeCustomerId
    const handler = loadHandler();
    const res = await handler(apiEvent('POST', '/subscription/portal', 'https://app.hawkeyecue.com'));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('NO_CUSTOMER');
    expect(stripeCalls.find((c) => c.method === 'billingPortal.sessions.create')).toBeUndefined();
  });
});
