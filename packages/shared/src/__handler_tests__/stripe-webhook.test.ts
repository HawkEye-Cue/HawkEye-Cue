// Billing P0 tests for the compiled stripe-webhook handler.
//
// Verifies the launch-critical webhook guarantees:
//   - A forged/invalid signature is rejected with 400 and no processing.
//   - A valid event is processed once (writes the dedup marker + updates the user).
//   - A DUPLICATE event id is ignored (idempotency): no second user update,
//     response flags duplicate:true.
//
// Same require-cache stubbing approach as opportunities-handler.test.ts: we prime
// Node's CommonJS cache with inspectable stubs for the AWS SDK and the `stripe`
// module before loading the compiled dist bundle.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const handlerPath = resolve(here, '../../../../lambdas/dist/stripe-webhook/index.js');

type SentCommand = { name: string; input: any };
let sent: SentCommand[] = [];
// Simulate the dedup store: PK -> true once claimed.
let claimed: Set<string>;
let constructedEvent: any = null;
let signatureValid = true;

function cmd(name: string) {
  return class {
    input: any;
    __name = name;
    constructor(input: any) { this.input = input; }
  };
}

function sdkStubs() {
  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: {
        from: () => ({
          send: async (c: any) => {
            const entry = { name: c.__name as string, input: c.input };
            sent.push(entry);
            if (c.__name === 'PutCommand' && String(c.input?.Item?.PK || '').startsWith('STRIPE_EVENT#')) {
              const pk = c.input.Item.PK;
              if (claimed.has(pk)) {
                const err: any = new Error('exists');
                err.name = 'ConditionalCheckFailedException';
                throw err;
              }
              claimed.add(pk);
              return {};
            }
            return {};
          },
        }),
      },
      UpdateCommand: cmd('UpdateCommand'),
      PutCommand: cmd('PutCommand'),
    },
    '@aws-sdk/client-secrets-manager': {
      SecretsManagerClient: class { async send() { return { SecretString: JSON.stringify({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' }) }; } },
      GetSecretValueCommand: cmd('GetSecretValueCommand'),
    },
    // Stub the Stripe SDK: constructEvent respects signatureValid and returns constructedEvent.
    stripe: function Stripe() {
      return {
        webhooks: {
          constructEvent: (_body: string, _sig: string, _secret: string) => {
            if (!signatureValid) {
              const e: any = new Error('No signatures found matching the expected signature');
              throw e;
            }
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
  return {
    body: JSON.stringify(bodyObj),
    isBase64Encoded: false,
    headers: { 'stripe-signature': sig },
  };
}

beforeEach(() => {
  sent = [];
  claimed = new Set();
  signatureValid = true;
  constructedEvent = null;
});

describe('stripe-webhook — signature + idempotency (billing P0)', () => {
  it('rejects an invalid signature with 400 and does not process', async () => {
    const handler = loadHandler();
    signatureValid = false;
    const res = await handler(webhookEvent({ id: 'evt_1', type: 'checkout.session.completed' }));
    expect(res.statusCode).toBe(400);
    // No user update, no dedup marker written.
    expect(sent.filter((c) => c.name === 'UpdateCommand')).toHaveLength(0);
    expect(sent.filter((c) => c.name === 'PutCommand')).toHaveLength(0);
  });

  it('processes a valid event once (writes dedup marker + updates user)', async () => {
    const handler = loadHandler();
    constructedEvent = {
      id: 'evt_100',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'user-123', customer: 'cus_1', subscription: 'sub_1', metadata: { userId: 'user-123', tier: 'soar' } } },
    };
    const res = await handler(webhookEvent({ id: 'evt_100' }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.duplicate).toBeUndefined();
    // Claimed the event id exactly once...
    const claims = sent.filter((c) => c.name === 'PutCommand' && String(c.input.Item.PK).startsWith('STRIPE_EVENT#'));
    expect(claims).toHaveLength(1);
    expect(claims[0].input.ConditionExpression).toBe('attribute_not_exists(PK)');
    // ...and provisioned the subscription.
    const updates = sent.filter((c) => c.name === 'UpdateCommand');
    expect(updates.length).toBeGreaterThanOrEqual(1);
  });

  it('ignores a DUPLICATE event id (idempotency) — no second user update', async () => {
    const handler = loadHandler();
    constructedEvent = {
      id: 'evt_dup',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'user-123', customer: 'cus_1', subscription: 'sub_1', metadata: { userId: 'user-123', tier: 'soar' } } },
    };
    // First delivery
    const r1 = await handler(webhookEvent({ id: 'evt_dup' }));
    expect(r1.statusCode).toBe(200);
    const firstUpdates = sent.filter((c) => c.name === 'UpdateCommand').length;
    expect(firstUpdates).toBeGreaterThanOrEqual(1);

    // Second (duplicate) delivery of the SAME event id
    sent = [];
    const r2 = await handler(webhookEvent({ id: 'evt_dup' }));
    expect(r2.statusCode).toBe(200);
    expect(JSON.parse(r2.body).duplicate).toBe(true);
    // Crucially: NO user update ran on the duplicate.
    expect(sent.filter((c) => c.name === 'UpdateCommand')).toHaveLength(0);
  });
});
