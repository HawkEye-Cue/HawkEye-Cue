'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, PutCommand, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const Stripe = require('stripe');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});

const TABLE_NAME = process.env.TABLE_NAME;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// Update user record with subscription data
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

// ─── Idempotency (two-phase lock) ──────────────────────────────────────────────
//
// Stripe delivers each event at-least-once (retries on timeout/5xx, plus occasional
// genuine duplicates and concurrent re-deliveries). We must process each event id
// EXACTLY once, while remaining safe under:
//   - a crash AFTER claiming but BEFORE provisioning (must stay retryable),
//   - concurrent deliveries of the same id (only one may provision),
//   - the idempotency store being unavailable (must fail CLOSED → Stripe retries).
//
// A single "completed" marker is NOT enough: if we wrote it before processing, a
// mid-flight crash would make the retry look like a duplicate and silently drop a
// real billing event. So we use a two-phase record per event id:
//
//   status = 'processing'  — a worker has claimed the id and is provisioning.
//   status = 'completed'   — provisioning finished successfully; true duplicate.
//
// claimEvent() atomically transitions nothing→processing OR takes over a STALE
// processing claim (older than CLAIM_STALE_MS, i.e. a prior crashed attempt).
// A fresh 'processing' claim held by a live attempt blocks concurrent duplicates.
// On success we markCompleted(); on failure we releaseClaim() so Stripe can retry.
//
// Retention: 'completed' markers carry a TTL (EVENT_TTL_DAYS). Stripe does not retry
// an event beyond ~3 days, so a 30-day marker comfortably covers the entire retry
// window. LIMITATION: markers are not kept forever — an event redelivered after the
// TTL expires (far outside Stripe's retry window, e.g. a manual replay weeks later)
// would be reprocessed. Downstream provisioning is written to be idempotent (fixed
// Keys + state-converging SETs), so even that reprocess converges rather than
// double-charging or corrupting entitlement state.

const EVENT_TTL_DAYS = 30;
// A 'processing' claim older than this is assumed to be from a crashed attempt and
// may be taken over. Must exceed the Lambda's max execution time so we never steal a
// claim from a still-running sibling. Lambda timeout here is well under 5 min.
const CLAIM_STALE_MS = 15 * 60 * 1000; // 15 minutes

const CLAIM_FIRST = 'first';         // we own a fresh claim — proceed to process
const CLAIM_DUPLICATE = 'duplicate'; // already completed — safe to skip
const CLAIM_IN_FLIGHT = 'in_flight'; // another live attempt owns it — do not process

function eventKey(eventId) {
  return { PK: `STRIPE_EVENT#${eventId}`, SK: 'EVENT' };
}

// Attempt to claim an event id for processing. Returns one of CLAIM_*.
// Throws on any storage error OTHER than the expected conditional failure, so the
// caller can fail closed (non-2xx) and let Stripe retry.
async function claimEvent(eventId) {
  const now = Date.now();
  const staleCutoff = now - CLAIM_STALE_MS;
  try {
    await dynamo.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...eventKey(eventId),
        status: 'processing',
        claimedAt: now,
        attempts: 1,
      },
      // Claim if: no record exists, OR a prior claim is still 'processing' but stale
      // (crashed attempt), OR somehow left without a status. Never steal a 'completed'
      // record and never steal a fresh 'processing' claim.
      ConditionExpression:
        'attribute_not_exists(PK) OR (#st = :processing AND claimedAt < :staleCutoff)',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':processing': 'processing', ':staleCutoff': staleCutoff },
    }));
    return CLAIM_FIRST;
  } catch (e) {
    if (e.name !== 'ConditionalCheckFailedException') {
      // Real storage error (throttle, outage, perms). Do NOT proceed unprotected.
      throw e;
    }
    // Condition failed: a record exists that we may not claim. Read it to classify.
    const existing = await dynamo.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: eventKey(eventId),
      ConsistentRead: true,
    }));
    const item = existing.Item;
    if (item && item.status === 'completed') return CLAIM_DUPLICATE;
    // A fresh 'processing' claim is held by a live sibling attempt. Treat as in-flight:
    // we must not process concurrently, and must not ack as a true duplicate.
    return CLAIM_IN_FLIGHT;
  }
}

// Mark an event successfully processed. TTL lets completed markers age out after the
// Stripe retry window. Best-effort: a failure here only risks a future reprocess,
// which downstream idempotency absorbs.
async function markCompleted(eventId) {
  try {
    await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: eventKey(eventId),
      UpdateExpression: 'SET #st = :completed, processedAt = :at, #ttl = :ttl',
      ExpressionAttributeNames: { '#st': 'status', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':completed': 'completed',
        ':at': new Date().toISOString(),
        ':ttl': Math.floor(Date.now() / 1000) + EVENT_TTL_DAYS * 24 * 60 * 60,
      },
    }));
  } catch (e) {
    console.error('markCompleted failed (will rely on downstream idempotency):', e.message);
  }
}

// Release a claim so Stripe's retry can re-attempt. Deletes the 'processing' record.
// Best-effort: if this fails, the stale-takeover path reclaims it after CLAIM_STALE_MS.
async function releaseClaim(eventId) {
  try {
    await dynamo.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: eventKey(eventId),
      ConditionExpression: '#st = :processing',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':processing': 'processing' },
    }));
  } catch (e) {
    if (e.name !== 'ConditionalCheckFailedException') {
      console.error('releaseClaim failed (stale takeover will recover):', e.message);
    }
  }
}

// Secrets cached per warm instance
let cachedSecrets = null;
async function getSecrets() {
  if (cachedSecrets) return cachedSecrets;

  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: 'SocialLeadGen/Stripe' })
  );

  cachedSecrets = JSON.parse(result.SecretString);
  return cachedSecrets;
}

// Map Stripe product/price metadata tier → internal tier name
// Falls back to subscription metadata if price metadata is missing
function resolveTier(subscription) {
  const meta = subscription.metadata ?? {};
  const tier = meta.tier;
  const validTiers = ['base', 'growth', 'soar', 'team'];
  if (tier && validTiers.includes(tier)) return tier;
  return 'base'; // safe fallback
}

// ─── Event handlers ───────────────────────────────────────────────────────────

// checkout.session.completed — payment succeeded, provision access
async function handleCheckoutCompleted(session) {
  const userId = session.client_reference_id ?? session.metadata?.userId;
  if (!userId) {
    console.warn('checkout.session.completed: no userId in session', session.id);
    return;
  }

  const customerId = session.customer;
  const subscriptionId = session.subscription;
  const tier = session.metadata?.tier ?? 'base';

  console.log(`Activating ${tier} for user ${userId}, stripe customer ${customerId}`);

  await updateUserSubscription(userId, {
    subscriptionTier: tier,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    subscriptionStatus: 'active',
    // Reset AI generation count on new subscription
    aiGenerationsUsed: 0,
  });
}

// Apply a subscription-state write only if it is not older than the state we have
// already recorded. Stripe does not guarantee event ordering, so an older
// subscription.updated can arrive AFTER a newer one (or after a delete). We stamp
// each write with the originating Stripe event timestamp (epoch seconds) and refuse
// to overwrite with a stale one. First write (no stamp yet) always applies.
async function applySubscriptionState(userId, fields, eventTs) {
  const expressions = Object.keys(fields).map((k) => `#${k} = :${k}`);
  const names = { '#evtTs': 'subscriptionEventTs' };
  const values = { ':evtTs': eventTs };
  for (const [k, v] of Object.entries(fields)) {
    names[`#${k}`] = k;
    values[`:${k}`] = v;
  }
  expressions.push('#evtTs = :evtTs');

  try {
    await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      UpdateExpression: `SET ${expressions.join(', ')}`,
      // Apply when we have no prior stamp or the incoming event is newer-or-equal.
      // (>= keeps same-timestamp retries idempotent: converging to the same state.)
      ConditionExpression: 'attribute_not_exists(#evtTs) OR #evtTs <= :evtTs',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      // A newer event already landed. Dropping this stale update is correct — the
      // record already reflects more recent Stripe state.
      console.log(`Skipping out-of-order subscription event for user ${userId} (ts=${eventTs})`);
      return;
    }
    throw e;
  }
}

// customer.subscription.updated — handles upgrades, downgrades, renewals, cancel_at_period_end
async function handleSubscriptionUpdated(subscription, eventTs) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.warn('subscription.updated: no userId in metadata', subscription.id);
    return;
  }

  const tier = resolveTier(subscription);
  const status = subscription.status; // active, past_due, canceled, etc.
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
  const cancelAtPeriodEnd = subscription.cancel_at_period_end;

  console.log(`Subscription updated for user ${userId}: tier=${tier}, status=${status}, cancelAtPeriodEnd=${cancelAtPeriodEnd}`);

  const fields = {
    // Keep access while a cancellation is merely SCHEDULED (status still 'active'
    // with cancel_at_period_end=true). Access is removed on the terminal
    // subscription.deleted event at period end, not when cancel is scheduled.
    subscriptionTier: status === 'active' ? tier : 'free',
    subscriptionStatus: status,
    subscriptionCurrentPeriodEnd: currentPeriodEnd,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: subscription.customer,
    subscriptionCancelAtPeriodEnd: Boolean(cancelAtPeriodEnd),
  };

  await applySubscriptionState(userId, fields, eventTs);
}

// customer.subscription.deleted — subscription fully ended
async function handleSubscriptionDeleted(subscription, eventTs) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.warn('subscription.deleted: no userId in metadata', subscription.id);
    return;
  }

  console.log(`Subscription deleted for user ${userId}`);

  await applySubscriptionState(userId, {
    subscriptionTier: 'free',
    subscriptionStatus: 'canceled',
    stripeSubscriptionId: null,
    subscriptionCurrentPeriodEnd: null,
    subscriptionCancelAtPeriodEnd: false,
    aiGenerationsUsed: 0,
  }, eventTs);
}

// invoice.payment_failed — notify / downgrade if needed
async function handlePaymentFailed(invoice) {
  const userId = invoice.subscription_details?.metadata?.userId;
  if (!userId) {
    console.warn('invoice.payment_failed: no userId in invoice metadata', invoice.id);
    return;
  }

  console.log(`Payment failed for user ${userId}, invoice ${invoice.id}`);

  await updateUserSubscription(userId, {
    subscriptionStatus: 'past_due',
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    let secrets;
    try {
      secrets = await getSecrets();
    } catch (e) {
      console.error('Failed to get secrets:', e.message);
      // Return 200 to prevent Stripe from retrying — we can't process without secrets
      return respond(200, { received: true, error: 'config_error' });
    }

    if (!secrets.STRIPE_SECRET_KEY || !secrets.STRIPE_WEBHOOK_SECRET) {
      console.error('Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET in secrets');
      return respond(200, { received: true, error: 'missing_keys' });
    }

    const stripe = new Stripe(secrets.STRIPE_SECRET_KEY);

    // API Gateway HTTP API v2 may base64-encode the body
    let rawBody = event.body;
    if (event.isBase64Encoded && rawBody) {
      rawBody = Buffer.from(rawBody, 'base64').toString('utf-8');
    }

    // HTTP API v2 lowercases all headers
    const headers = event.headers || {};
    const signature = headers['stripe-signature'] || headers['Stripe-Signature'] || headers['STRIPE-SIGNATURE'];

    if (!rawBody || !signature) {
      console.error('Missing body or signature. isBase64:', event.isBase64Encoded, 'bodyLen:', (event.body || '').length, 'headers:', Object.keys(headers).join(','));
      // Return 200 so Stripe doesn't keep retrying
      return respond(200, { received: true, error: 'missing_input' });
    }

    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        secrets.STRIPE_WEBHOOK_SECRET
      );
    } catch (e) {
      console.error('Webhook signature verification failed:', e.message, 'sigPrefix:', signature?.slice(0, 20), 'bodyPrefix:', rawBody?.slice(0, 50));
      // Return 400 for sig failure — this is a legitimate rejection
      return respond(400, { error: `Webhook signature verification failed: ${e.message}` });
    }

    // Idempotency guard — two-phase lock. Done AFTER signature verification so an
    // unverified/forged event can never consume an id.
    //
    // Fail CLOSED: if the idempotency store is unavailable we return a retryable 503
    // rather than processing unprotected. Stripe will redeliver.
    let claim;
    try {
      claim = await claimEvent(stripeEvent.id);
    } catch (e) {
      console.error('Idempotency store unavailable — asking Stripe to retry:', e.message);
      // 503 is retryable; we did NOT process, so no double-charge risk.
      return respond(503, { received: false, error: 'idempotency_unavailable' });
    }

    if (claim === CLAIM_DUPLICATE) {
      console.log(`Duplicate (completed) Stripe event ignored: ${stripeEvent.type} (${stripeEvent.id})`);
      return respond(200, { received: true, duplicate: true });
    }

    if (claim === CLAIM_IN_FLIGHT) {
      // A concurrent live attempt owns this id. Do not process in parallel and do not
      // falsely ack as completed. Return 409 (retryable) so Stripe redelivers; by then
      // the sibling will have completed (→ duplicate) or crashed (→ reclaimable).
      console.log(`Concurrent in-flight delivery — deferring to sibling: ${stripeEvent.id}`);
      return respond(409, { received: false, error: 'processing_in_progress' });
    }

    // claim === CLAIM_FIRST — we own a fresh claim and must process, then mark
    // completed on success or release the claim on failure so retries can re-run.
    console.log(`Processing Stripe event: ${stripeEvent.type} (${stripeEvent.id})`);
    // Stripe event `created` (epoch seconds) is the ordering key for reconciling
    // out-of-order subscription deliveries. Fall back to now if absent.
    const eventTs = typeof stripeEvent.created === 'number' ? stripeEvent.created : Math.floor(Date.now() / 1000);
    try {
      switch (stripeEvent.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(stripeEvent.data.object);
          break;

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(stripeEvent.data.object, eventTs);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(stripeEvent.data.object, eventTs);
          break;

        case 'invoice.payment_failed':
          await handlePaymentFailed(stripeEvent.data.object);
          break;

        default:
          console.log(`Unhandled event type: ${stripeEvent.type}`);
      }
    } catch (e) {
      // Provisioning failed AFTER we claimed. Release the claim so Stripe's retry can
      // re-attempt, and return a retryable 500. The event is NOT marked completed.
      console.error('Provisioning failed, releasing claim for retry:', e.message, e.stack);
      await releaseClaim(stripeEvent.id);
      return respond(500, { received: false, error: 'provisioning_failed' });
    }

    // Success — record completion so genuine duplicates are skipped going forward.
    await markCompleted(stripeEvent.id);
    return respond(200, { received: true });
  } catch (e) {
    console.error('stripe-webhook handler error:', e.message, e.stack);
    // Unexpected error outside the claimed processing block. Return retryable 500 so a
    // real event is not silently lost; signature failures already returned 400 above.
    return respond(500, { received: false, error: 'internal_error' });
  }
};
