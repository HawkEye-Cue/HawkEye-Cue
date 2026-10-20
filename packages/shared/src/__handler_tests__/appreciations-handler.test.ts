// Appreciation privacy guard tests (compiled appreciations-handler).
//
// Rule: an appreciation records WHO recommended you, so it is only meaningful with an
// identifiable tagger. POST /appreciations must REJECT a missing/blank/'Unknown' tagger
// with a clear 400 (TAGGER_REQUIRED) instead of persisting a fabricated record — while
// still saving valid appreciations and leaving existing records untouched.
//
// The handler also gates the whole surface behind a paid (Soar+) tier; we seed a paid
// profile so the create path is reachable.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const handlerPath = resolve(here, '../../../../lambdas/dist/appreciations-handler/index.js');

let store: Map<string, any>;
let puts: any[] = [];

function keyOf(input: any): string {
  const k = input.Key ?? input.Item;
  return `${k.PK}|${k.SK}`;
}
function cmd(name: string) {
  return class { input: any; __name = name; constructor(input: any) { this.input = input; } };
}

function sdkStubs() {
  const docClient = {
    send: async (c: any) => {
      const input = c.input;
      if (c.__name === 'GetCommand') return { Item: store.get(keyOf(input)) };
      if (c.__name === 'PutCommand') { puts.push(input.Item); store.set(keyOf(input), { ...input.Item }); return {}; }
      if (c.__name === 'QueryCommand') {
        const pk = input.ExpressionAttributeValues[':pk'];
        const items = [...store.values()].filter((it) => it.PK === pk && String(it.SK).startsWith('APPRECIATION#'));
        return { Items: items };
      }
      if (c.__name === 'UpdateCommand' || c.__name === 'DeleteCommand') return {};
      return {};
    },
  };
  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: { from: () => docClient },
      GetCommand: cmd('GetCommand'), PutCommand: cmd('PutCommand'), UpdateCommand: cmd('UpdateCommand'), QueryCommand: cmd('QueryCommand'), DeleteCommand: cmd('DeleteCommand'),
    },
    '@aws-sdk/client-secrets-manager': {
      SecretsManagerClient: class { async send() { return { SecretString: JSON.stringify({ BUNDLE_SOCIAL_API_KEY: 'x' }) }; } },
      GetSecretValueCommand: cmd('GetSecretValueCommand'),
    },
    '@aws-sdk/client-bedrock-runtime': {
      BedrockRuntimeClient: class { async send() { return { body: new TextEncoder().encode(JSON.stringify({ output: { message: { content: [{ text: 'thanks' }] } } })) }; } },
      InvokeModelCommand: cmd('InvokeModelCommand'),
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

function postEvent(body: any) {
  return {
    requestContext: { http: { method: 'POST', path: '/appreciations' }, authorizer: { jwt: { claims: { sub: 'user-1' } } } },
    headers: {},
    body: JSON.stringify(body),
  };
}

beforeEach(() => {
  store = new Map();
  puts = [];
  // Paid profile so the Soar+ gate passes and we reach the create path.
  store.set('USER#user-1|PROFILE', { PK: 'USER#user-1', SK: 'PROFILE', subscriptionTier: 'soar', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' });
});

describe('appreciations-handler — tagger privacy guard (Priority 6)', () => {
  it('saves a valid appreciation with an identifiable tagger', async () => {
    const handler = loadHandler();
    const res = await handler(postEvent({ taggerName: 'Maria Lopez', platform: 'facebook', postContent: 'Highly recommend!' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBeTruthy();
    expect(puts).toHaveLength(1);
    expect(puts[0].taggerName).toBe('Maria Lopez');
  });

  it('rejects a MISSING tagger with a clear 400 and saves nothing', async () => {
    const handler = loadHandler();
    const res = await handler(postEvent({ platform: 'facebook', postContent: 'Great!' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('TAGGER_REQUIRED');
    expect(puts).toHaveLength(0);
  });

  it("rejects the literal 'Unknown' sentinel (case-insensitive)", async () => {
    const handler = loadHandler();
    for (const name of ['Unknown', 'unknown', 'UNKNOWN']) {
      puts = [];
      const res = await handler(postEvent({ taggerName: name, platform: 'facebook', postContent: 'x' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('TAGGER_REQUIRED');
      expect(puts).toHaveLength(0);
    }
  });

  it('rejects a blank/whitespace tagger', async () => {
    const handler = loadHandler();
    const res = await handler(postEvent({ taggerName: '   ', platform: 'facebook', postContent: 'x' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('TAGGER_REQUIRED');
    expect(puts).toHaveLength(0);
  });

  it('trims a valid tagger before saving', async () => {
    const handler = loadHandler();
    const res = await handler(postEvent({ taggerName: '  Sam Carter  ', platform: 'facebook', postContent: 'x' }));
    expect(res.statusCode).toBe(200);
    expect(puts[0].taggerName).toBe('Sam Carter');
  });
});
