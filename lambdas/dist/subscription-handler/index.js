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
// A profile is eligible for the one-time 7-day Soar trial if it has NEVER consumed a
// trial and has NO billing history. This is true for:
//   (a) a missing profile (post-confirmation trigger never ran), and
//   (b) a stale bare-Nest profile created by the OLD social-accounts safety-net that
//       wrote subscriptionTier:'free' before trials were unified — such a profile has
//       no trialEndsAt and no Stripe identifiers, so it never actually got its trial.
// A legitimately-ended account is NOT eligible and is left untouched:
//   - expired trial  → has trialEndsAt (+ status 'expired')
//   - canceled/paid  → has stripeCustomerId / stripeSubscriptionId (+ status)
// Granting sets trialEndsAt, so this can fire at most once per account.
function isTrialEligible(user) {
  if (!user) return true; // missing profile → brand-new account
  const status = (user.subscriptionStatus || '').toLowerCase();
  const everTrialed = Boolean(user.trialEndsAt);
  const everPaid = Boolean(user.stripeCustomerId || user.stripeSubscriptionId);
  const endState = status === 'expired' || status === 'canceled';
  const tier = (user.subscriptionTier || 'free').toLowerCase();
  const isFreeish = tier === 'free' || tier === 'nest' || tier === 'none' || tier === '';
  return isFreeish && !everTrialed && !everPaid && !endState;
}

// Grant the one-time Soar trial. Handles both the missing-profile case (conditional
// create) and the stale bare-Nest case (conditional update that only applies while the
// record still looks un-trialed and un-paid — so a concurrent checkout/trial can never
// be clobbered). Returns the resulting profile.
async function grantTrial(userId, event, existing) {
  const email = existing?.email || event?.requestContext?.authorizer?.jwt?.claims?.email || '';
  const now = new Date().toISOString();
  const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  if (!existing) {
    // Create path — single-grant via attribute_not_exists.
    const profile = {
      PK: `USER#${userId}`, SK: 'PROFILE', userId, email, createdAt: now,
      subscriptionTier: 'soar', subscriptionStatus: 'trial', trialEndsAt,
      aiGenerationsUsed: 0, selectedTradeId: null,
    };
    try {
      await dynamo.send(new PutCommand({ TableName: TABLE_NAME, Item: profile, ConditionExpression: 'attribute_not_exists(PK)' }));
      return profile;
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') return await getUser(userId);
      throw e;
    }
  }

  // Upgrade path — only applies while the record is still un-trialed and un-paid. The
  // condition guards against racing a checkout/trial that may have just landed.
  try {
    await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      UpdateExpression: 'SET subscriptionTier = :soar, subscriptionStatus = :trial, trialEndsAt = :te',
      ConditionExpression: 'attribute_not_exists(trialEndsAt) AND attribute_not_exists(stripeCustomerId) AND attribute_not_exists(stripeSubscriptionId)',
      ExpressionAttributeValues: { ':soar': 'soar', ':trial': 'trial', ':te': trialEndsAt },
    }));
    return { ...existing, subscriptionTier: 'soar', subscriptionStatus: 'trial', trialEndsAt };
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') return await getUser(userId); // raced — use authoritative
    throw e;
  }
}

// GET /subscription
async function handleGetSubscription(userId, event) {
  let user = await getUser(userId);

  // Self-heal: grant the one-time Soar trial to brand-new OR stale-bare-Nest accounts
  // that never consumed a trial and never paid. Never touches expired/canceled/paid.
  if (isTrialEligible(user)) {
    user = await grantTrial(userId, event, user);
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

  // ─── One trial per account (authoritative) ──────────────────────────────────
  // trialEndsAt is the durable trial-history marker: it is set exactly once when the
  // account's single trial is granted and is NEVER erased by expiry, cancellation,
  // downgrade, or any webhook. So its presence means "this account has already started
  // its one trial" regardless of current tier/status.
  //   - no trialEndsAt + no paid history  → eligible for the one 7-day trial.
  //   - trialEndsAt in the FUTURE         → trial still active: preserve its ORIGINAL
  //                                         expiration; upgrading must not extend it.
  //   - trialEndsAt in the PAST (or any   → trial already consumed: NO new trial, the
  //     prior paid history)                 first charge happens immediately.
  const now = Date.now();
  const priorTrialEndMs = user.trialEndsAt ? new Date(user.trialEndsAt).getTime() : null;
  const everTrialed = Boolean(user.trialEndsAt);
  const everPaid = Boolean(user.stripeCustomerId || user.stripeSubscriptionId);
  const trialActive = priorTrialEndMs !== null && priorTrialEndMs > now;

  // ─── Existing active paid subscription → plan change, not a 2nd subscription ──
  // If the account already has a live Stripe subscription that is NOT merely a trial,
  // changing tiers must modify that subscription (safe plan change) rather than create
  // an unrelated duplicate. We surface this to the client to route through the portal /
  // plan-change flow instead of a fresh checkout.
  if (user.stripeSubscriptionId && (user.subscriptionStatus === 'active' || user.subscriptionStatus === 'past_due')) {
    return ok({
      planChangeRequired: true,
      message: 'You already have an active subscription. Manage or change your plan from the billing portal — we will not create a second subscription.',
    });
  }

  const baseUrl = safeReturnBase(origin);
  const successUrl = `${baseUrl}/settings?checkout=success`;
  const cancelUrl = `${baseUrl}/settings?checkout=cancelled`;

  // Build subscription_data honoring the one-trial-per-account rule.
  const subscriptionData = { metadata: { userId, tier } };
  let firstChargeAt; // epoch seconds for disclosure
  if (!everTrialed && !everPaid) {
    // Brand-new eligible account → the one 7-day trial.
    subscriptionData.trial_period_days = 7;
    firstChargeAt = Math.floor(now / 1000) + 7 * 24 * 60 * 60;
  } else if (trialActive) {
    // Mid-trial upgrade/downgrade → preserve the ORIGINAL expiration; no fresh 7 days.
    // Stripe's trial_end pins the first charge to the original trial expiry.
    subscriptionData.trial_end = Math.floor(priorTrialEndMs / 1000);
    firstChargeAt = Math.floor(priorTrialEndMs / 1000);
  } else {
    // Trial already consumed OR prior paid history → NO trial, charge immediately.
    // (Leave trial_period_days/trial_end unset.)
    firstChargeAt = Math.floor(now / 1000);
  }

  const sessionParams = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: userId,
    // Stamp the session so duplicate/concurrent sessions for the same account+tier are
    // detectable and so the webhook can reconcile instead of double-provisioning.
    metadata: { userId, tier, trialPreserved: trialActive ? 'true' : 'false' },
    subscription_data: subscriptionData,
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

  // Disclose the first charge (amount + date) so the UI can show it before the user
  // confirms. Stripe Checkout also shows this, but returning it lets our UI be explicit.
  const TIER_PRICE_USD = { soar: 24.99, team: 99.99, summit: 99.99 };
  return ok({
    checkoutUrl: session.url,
    firstChargeAmount: TIER_PRICE_USD[tier] ?? null,
    firstChargeAt: new Date(firstChargeAt * 1000).toISOString(),
    trialPreserved: trialActive,
    trialEndsAt: user.trialEndsAt ?? null,
  });
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
