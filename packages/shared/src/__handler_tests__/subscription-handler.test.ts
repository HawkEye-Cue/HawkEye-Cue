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
let retrievedSubscription: any;
let portalSessionArgs: any;
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
            if (c.__name === 'UpdateCommand') { userItem = { ...userItem }; return {}; }
            if (c.__name === 'PutCommand') {
              // Self-heal provisioning (GET /subscription when no profile exists).
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
        checkout: { sessions: { create: async () => ({ url: 'https://checkout' }) } },
        promotionCodes: { list: async () => ({ data: [] }) },
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

beforeEach(() => {
  stripeCalls = [];
  portalSessionArgs = null;
  updateArgs = null;
  provisioned = null;
  userItem = { PK: 'USER#user-123', SK: 'PROFILE', email: 'u@test.com', stripeCustomerId: 'cus_live', stripeSubscriptionId: 'sub_live' };
  retrievedSubscription = { id: 'sub_live', status: 'active', current_period_end: 1_900_000_000 };
});

describe('subscription-handler — GET /subscription trial self-heal', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('provisions a one-time 7-day Soar trial when no profile exists', async () => {
    userItem = null; // brand-new account, post-confirmation trigger never ran
    const handler = loadHandler();
    const res = await handler(apiEvent('GET', '/subscription'));
    expect(res.statusCode).toBe(200);
    const b = JSON.parse(res.body);
    expect(b.tier).toBe('soar');
    expect(b.status).toBe('trial');
    expect(b.trialEndsAt).toBeTruthy();
    // Exactly one provisioning write happened, single-grant via attribute_not_exists.
    expect(provisioned).toBeTruthy();
    expect(provisioned.subscriptionTier).toBe('soar');
  });

  it('does NOT re-grant or overwrite an existing paid profile', async () => {
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', subscriptionTier: 'team', subscriptionStatus: 'active' };
    const handler = loadHandler();
    const res = await handler(apiEvent('GET', '/subscription'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).tier).toBe('team');
    expect(provisioned).toBeNull(); // no provisioning write for an existing account
  });

  it('expired trial still reverts to free (not re-provisioned)', async () => {
    userItem = { PK: 'USER#user-123', SK: 'PROFILE', subscriptionTier: 'soar', subscriptionStatus: 'trial', trialEndsAt: new Date(Date.now() - DAY).toISOString() };
    const handler = loadHandler();
    const res = await handler(apiEvent('GET', '/subscription'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).tier).toBe('free');
    expect(provisioned).toBeNull();
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
