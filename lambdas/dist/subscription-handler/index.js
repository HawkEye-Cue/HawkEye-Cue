'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const Stripe = require('stripe');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});

const TABLE_NAME = process.env.TABLE_NAME;

// ─── Tier config ──────────────────────────────────────────────────────────────
// Maps internal tier name → Stripe Price ID env var name
// Price IDs are stored as environment variables on the Lambda
const TIER_PRICE_ENV = {
  base: 'STRIPE_PRICE_BASE',
  growth: 'STRIPE_PRICE_GROWTH',
  soar: 'STRIPE_PRICE_SOAR',
  team: 'STRIPE_PRICE_TEAM',
};

const AI_GENERATION_LIMITS = {
  free: 2,
  base: 300,
  growth: 300,
  soar: 300,
  team: 500,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function err(status, code, message) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: { code, message } }),
  };
}

// Extract Cognito sub from the JWT authorizer context
function getUserId(event) {
  return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null;
}

// Allowlist of origins we will redirect back to after Stripe-hosted flows. Prevents
// an attacker-supplied Origin header from turning our checkout/portal return into an
// open redirect. Anything not on the list falls back to the canonical app origin.
const DEFAULT_APP_ORIGIN = 'https://app.hawkeyecue.com';
const ALLOWED_RETURN_ORIGINS = new Set([
  'https://app.hawkeyecue.com',
  'https://hawkeyecue.com',
  'http://localhost:5173',
  'http://localhost:3000',
]);
function safeReturnBase(origin) {
  if (origin && ALLOWED_RETURN_ORIGINS.has(origin)) return origin;
  return DEFAULT_APP_ORIGIN;
}

// Fetch Stripe secret key from Secrets Manager (cached per Lambda warm instance)
let stripeInstance = null;
async function getStripe() {
  if (stripeInstance) return stripeInstance;

  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: 'SocialLeadGen/Stripe' })
  );

  const secret = JSON.parse(result.SecretString);
  stripeInstance = new Stripe(secret.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  return stripeInstance;
}

// Get user record from DynamoDB
async function getUser(userId) {
  const result = await dynamo.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
    })
  );
  return result.Item ?? null;
}

// Update subscription fields on the user record
async function updateUserSubscription(userId, fields) {
  const expressions = Object.keys(fields).map((k) => `#${k} = :${k}`);
  const names = {};
  const values = {};
  for (const [k, v] of Object.entries(fields)) {
    names[`#${k}`] = k;
    values[`:${k}`] = v;
  }

  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      UpdateExpression: `SET ${expressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// Grant the one-time 7-day Soar trial to a brand-new account. Idempotent and
// single-grant: the conditional write (attribute_not_exists) means it can only ever
// create the FIRST profile for an account, so it can never re-grant a trial on repeat
// logins/signups and can never overwrite an existing (free, trial, or paid) profile.
// This is the authoritative self-heal for accounts whose Cognito post-confirmation
// trigger did not run (the trigger is attached out-of-band and is not guaranteed).
async function provisionTrialIfMissing(userId, event) {
  const email = event?.requestContext?.authorizer?.jwt?.claims?.email ?? '';
  const now = new Date().toISOString();
  const profile = {
    PK: `USER#${userId}`,
    SK: 'PROFILE',
    userId,
    email,
    createdAt: now,
    subscriptionTier: 'soar',
    subscriptionStatus: 'trial',
    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    aiGenerationsUsed: 0,
    selectedTradeId: null,
  };
  try {
    await dynamo.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: profile,
      ConditionExpression: 'attribute_not_exists(PK)',
    }));
    return profile;
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      // Another path created it first (race) — return the authoritative record.
      return await getUser(userId);
    }
    throw e;
  }
}

// GET /subscription
async function handleGetSubscription(userId, event) {
  let user = await getUser(userId);
  if (!user) {
    // No profile yet — the post-confirmation trigger may not have run. Materialize the
    // one-time Soar trial now so the account gets its promised entitlement on first load.
    user = await provisionTrialIfMissing(userId, event);
    if (!user) return err(404, 'USER_NOT_FOUND', 'User not found');
  }

  let tier = user.subscriptionTier ?? 'free';

  // Check if trial has expired
  if (user.subscriptionStatus === 'trial' && user.trialEndsAt) {
    if (new Date(user.trialEndsAt).getTime() < Date.now()) {
      // Trial expired — downgrade to free
      tier = 'free';
      await dynamo.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
        UpdateExpression: 'SET subscriptionTier = :tier, subscriptionStatus = :status',
        ExpressionAttributeValues: { ':tier': 'free', ':status': 'expired' },
      }));
    }
  }

  return ok({
    tier,
    status: user.subscriptionStatus ?? 'none',
    trialEndsAt: user.trialEndsAt ?? null,
    aiGenerationsUsed: user.aiGenerationsUsed ?? 0,
    aiGenerationsLimit: AI_GENERATION_LIMITS[tier] ?? 2,
    currentPeriodEnd: user.subscriptionCurrentPeriodEnd ?? null,
    cancelAtPeriodEnd: Boolean(user.subscriptionCancelAtPeriodEnd),
    stripeCustomerId: user.stripeCustomerId ?? null,
  });
}

// POST /subscription/checkout  { tier: 'base' | 'growth' | 'team', couponCode?: string }
async function handleCheckout(userId, body, origin) {
  const { tier, couponCode } = body ?? {};

  if (!tier || !TIER_PRICE_ENV[tier]) {
    return err(400, 'INVALID_TIER', `tier must be one of: ${Object.keys(TIER_PRICE_ENV).join(', ')}`);
  }

  const priceId = process.env[TIER_PRICE_ENV[tier]];
  if (!priceId) {
    return err(500, 'PRICE_NOT_CONFIGURED', `Price ID for tier "${tier}" is not configured`);
  }

  const stripe = await getStripe();
  const user = await getUser(userId);
  if (!user) return err(404, 'USER_NOT_FOUND', 'User not found');

  const baseUrl = safeReturnBase(origin);
  const successUrl = `${baseUrl}/settings?checkout=success`;
  const cancelUrl = `${baseUrl}/settings?checkout=cancelled`;

  const sessionParams = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: userId,
    metadata: { userId, tier },
    subscription_data: {
      metadata: { userId, tier },
      trial_period_days: (tier === 'soar' || tier === 'team') ? 7 : undefined,
    },
    // Always allow the Stripe promo code field on checkout page
    allow_promotion_codes: true,
  };

  // If a specific coupon code was provided, validate and apply it
  if (couponCode && couponCode.trim()) {
    try {
      // Look up the promotion code in Stripe
      const promoCodes = await stripe.promotionCodes.list({
        code: couponCode.trim(),
        active: true,
        limit: 1,
      });

      if (promoCodes.data.length > 0) {
        // Apply the promotion code as a discount
        sessionParams.discounts = [{ promotion_code: promoCodes.data[0].id }];
        // Can't use both discounts and allow_promotion_codes
        delete sessionParams.allow_promotion_codes;
      } else {
        return err(400, 'INVALID_COUPON', 'That coupon code is not valid or has expired.');
      }
    } catch (e) {
      console.error('Coupon lookup error:', e);
      return err(400, 'INVALID_COUPON', 'That coupon code is not valid or has expired.');
    }
  }

  // Attach existing Stripe customer if we have one, otherwise prefill email
  if (user.stripeCustomerId) {
    sessionParams.customer = user.stripeCustomerId;
  } else if (user.email) {
    sessionParams.customer_email = user.email;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  return ok({ checkoutUrl: session.url });
}

// POST /subscription/cancel
// Graceful, end-of-period cancellation. We do NOT revoke access immediately: a paid
// subscriber keeps their tier until the period they've already paid for ends. Stripe
// drives the entitlement transition — scheduling the cancel fires a
// customer.subscription.updated (cancel_at_period_end=true) now, and a
// customer.subscription.deleted at period end, both handled by the webhook. We avoid
// locally downgrading here so there is a single source of truth for entitlement.
async function handleCancel(userId) {
  const stripe = await getStripe();
  const user = await getUser(userId);
  if (!user) return err(404, 'USER_NOT_FOUND', 'User not found');

  if (!user.stripeSubscriptionId) {
    return err(400, 'NO_SUBSCRIPTION', 'No active subscription to cancel');
  }

  // Retrieve current state so we can treat trials explicitly and report timing.
  let subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  } catch (e) {
    console.error('Failed to retrieve subscription for cancel:', e.message);
    return err(502, 'STRIPE_ERROR', 'Could not reach the billing provider. Please try again.');
  }

  const isTrialing = subscription.status === 'trialing';

  // Schedule cancellation at the end of the current paid (or trial) period. For a
  // trial this means access continues until the trial ends, then it will not renew —
  // the customer is never charged. Stripe emits the lifecycle webhooks that flip our
  // stored entitlement; we only mark the scheduled flag for immediate UI feedback.
  const updated = await stripe.subscriptions.update(user.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  const periodEnd = updated.current_period_end
    ? new Date(updated.current_period_end * 1000).toISOString()
    : (user.subscriptionCurrentPeriodEnd ?? null);

  await updateUserSubscription(userId, {
    subscriptionCancelAtPeriodEnd: true,
    subscriptionCurrentPeriodEnd: periodEnd,
  });

  return ok({
    message: isTrialing
      ? 'Your trial will end as scheduled and will not convert to a paid plan. You keep access until the trial ends.'
      : 'Your subscription will cancel at the end of the current billing period. You keep full access until then.',
    cancelAtPeriodEnd: true,
    accessUntil: periodEnd,
    wasTrialing: isTrialing,
  });
}

// POST /subscription/portal
// Create a Stripe Billing Portal session so the customer can self-serve: update
// payment methods and view invoices. The Stripe customer identity is derived ONLY
// from the authenticated account's stored stripeCustomerId — never from request
// input — so a user can never open another customer's portal. The return URL is
// restricted to our own app origin (allowlisted) to prevent open-redirect abuse.
async function handlePortal(userId, origin) {
  const stripe = await getStripe();
  const user = await getUser(userId);
  if (!user) return err(404, 'USER_NOT_FOUND', 'User not found');

  if (!user.stripeCustomerId) {
    return err(400, 'NO_CUSTOMER', 'No billing account found. Subscribe first to manage billing.');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${safeReturnBase(origin)}/settings`,
  });

  return ok({ portalUrl: session.url });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);

    if (!userId) return err(401, 'UNAUTHORIZED', 'Missing user identity');

    // GET /subscription
    if (method === 'GET' && path === '/subscription') {
      return handleGetSubscription(userId, event);
    }

    // POST /subscription/checkout
    if (method === 'POST' && path === '/subscription/checkout') {
      const body = event.body ? JSON.parse(event.body) : {};
      const origin = event.headers?.origin ?? event.headers?.Origin ?? null;
      return handleCheckout(userId, body, origin);
    }

    // POST /subscription/cancel
    if (method === 'POST' && path === '/subscription/cancel') {
      return handleCancel(userId);
    }

    // POST /subscription/portal
    if (method === 'POST' && path === '/subscription/portal') {
      const origin = event.headers?.origin ?? event.headers?.Origin ?? null;
      return handlePortal(userId, origin);
    }

    return err(404, 'NOT_FOUND', `No route for ${method} ${path}`);
  } catch (e) {
    console.error('subscription-handler error', e);
    return err(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
