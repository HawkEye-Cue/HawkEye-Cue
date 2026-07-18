'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
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

// customer.subscription.updated — handles upgrades, downgrades, renewals, cancel_at_period_end
async function handleSubscriptionUpdated(subscription) {
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
    subscriptionTier: status === 'active' ? tier : 'free',
    subscriptionStatus: status,
    subscriptionCurrentPeriodEnd: currentPeriodEnd,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: subscription.customer,
  };

  // If cancellation is scheduled, mark it so the UI can show a warning
  if (cancelAtPeriodEnd) {
    fields.subscriptionCancelAtPeriodEnd = true;
  } else {
    fields.subscriptionCancelAtPeriodEnd = false;
  }

  await updateUserSubscription(userId, fields);
}

// customer.subscription.deleted — subscription fully ended
async function handleSubscriptionDeleted(subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.warn('subscription.deleted: no userId in metadata', subscription.id);
    return;
  }

  console.log(`Subscription deleted for user ${userId}`);

  await updateUserSubscription(userId, {
    subscriptionTier: 'free',
    subscriptionStatus: 'canceled',
    stripeSubscriptionId: null,
    subscriptionCurrentPeriodEnd: null,
    subscriptionCancelAtPeriodEnd: false,
    aiGenerationsUsed: 0,
  });
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
    const secrets = await getSecrets();
    const stripe = new Stripe(secrets.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    // API Gateway HTTP API v2 passes raw body as string
    const rawBody = event.body;
    const signature = event.headers?.['stripe-signature'] ?? event.headers?.['Stripe-Signature'];

    if (!rawBody || !signature) {
      return respond(400, { error: 'Missing body or stripe-signature header' });
    }

    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        secrets.STRIPE_WEBHOOK_SECRET
      );
    } catch (e) {
      console.error('Webhook signature verification failed:', e.message);
      return respond(400, { error: `Webhook signature verification failed: ${e.message}` });
    }

    console.log(`Processing Stripe event: ${stripeEvent.type} (${stripeEvent.id})`);

    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(stripeEvent.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(stripeEvent.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(stripeEvent.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(stripeEvent.data.object);
        break;

      default:
        // Acknowledge unhandled events so Stripe doesn't retry them
        console.log(`Unhandled event type: ${stripeEvent.type}`);
    }

    return respond(200, { received: true });
  } catch (e) {
    console.error('stripe-webhook handler error:', e);
    return respond(500, { error: 'Internal server error' });
  }
};
