// D1 verification tests: account export/delete cover Facebook-derived records.
//
// These are VERIFICATION tests (not a redesign): the current trade-handler export
// queries ALL items under PK = USER#{id}, and delete removes ALL items under
// PK = USER#{id} (plus network posts via GSI1 + the Cognito user). This test confirms
// that Facebook-derived SK prefixes (OPP#, APPRECIATION#, MEMORY#, LEAD_PROTOCOL#,
// RADAR_LEARNING) are included in export output and are all deleted.
//
// The trade-handler is a compiled CommonJS bundle that requires several AWS SDK
// modules. DynamoDB is installed (test devDependency) so we prime its require cache by
// resolved path; the Cognito and Secrets-Manager clients are not installed, so we
// intercept Module._load to return no-op stubs for just those specifiers.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const handlerPath = resolve(here, '../../../../lambdas/dist/trade-handler/index.js');

type SentCommand = { name: string; input: any };
let sent: SentCommand[] = [];
let items: any[] = [];

function cmd(name: string) {
  return class {
    input: any;
    __name = name;
    constructor(input: any) {
      this.input = input;
    }
  };
}

// Stub exports for every AWS SDK module the trade-handler requires. DynamoDB is driven
// by `sent`/`items`; Cognito + Secrets Manager are no-op stubs. All injected via the
// compiled module's require so the shipped Lambda asset is never modified.
function sdkStubs() {
  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: {
        from: () => ({
          send: async (c: any) => {
            const entry = { name: c.__name as string, input: c.input };
            sent.push(entry);
            if (c.__name === 'QueryCommand') return { Items: items };
            return {};
          },
        }),
      },
      QueryCommand: cmd('QueryCommand'),
      UpdateCommand: cmd('UpdateCommand'),
      ScanCommand: cmd('ScanCommand'),
      DeleteCommand: cmd('DeleteCommand'),
      GetCommand: cmd('GetCommand'),
    },
    '@aws-sdk/client-cognito-identity-provider': {
      CognitoIdentityProviderClient: class { async send() { return {}; } },
      AdminDeleteUserCommand: cmd('AdminDeleteUserCommand'),
    },
    '@aws-sdk/client-secrets-manager': {
      SecretsManagerClient: class { async send() { return { SecretString: '{}' }; } },
      GetSecretValueCommand: cmd('GetSecretValueCommand'),
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

function event(method: string, path: string) {
  return {
    requestContext: {
      http: { method, path },
      authorizer: { jwt: { claims: { sub: 'user-123', email: 'u@example.com' } } },
    },
  };
}

// Facebook-derived records plus some unrelated ones, all under USER#user-123.
const FB_ITEMS = [
  { PK: 'USER#user-123', SK: 'OPP#2024#a', opportunityId: 'a', sourceUrl: 'https://facebook.com/p/1' },
  { PK: 'USER#user-123', SK: 'APPRECIATION#2024#b', appreciationId: 'b' },
  { PK: 'USER#user-123', SK: 'MEMORY#john doe', displayName: 'John Doe' },
  { PK: 'USER#user-123', SK: 'LEAD_PROTOCOL#a', opportunityId: 'a' },
  { PK: 'USER#user-123', SK: 'RADAR_LEARNING', wonCount: 1 },
  { PK: 'USER#user-123', SK: 'PROFILE', selectedTradeName: 'Roofer' },
];

beforeEach(() => {
  sent = [];
  items = [...FB_ITEMS];
});


describe('export/delete coverage of Facebook-derived data (D1 verification)', () => {
  it('export includes OPP / APPRECIATION / MEMORY / LEAD_PROTOCOL / RADAR_LEARNING', async () => {
    const handler = loadHandler();
    const res = await handler(event('GET', '/profile/export'));
    expect(res.statusCode).toBe(200);
    const doc = JSON.parse(res.body);
    const grouped = doc.data || {};
    // Export groups by SK prefix (OPP, APPRECIATION, MEMORY, LEAD_PROTOCOL, RADAR_LEARNING...).
    expect(grouped.OPP).toBeDefined();
    expect(grouped.APPRECIATION).toBeDefined();
    expect(grouped.MEMORY).toBeDefined();
    expect(grouped.LEAD_PROTOCOL).toBeDefined();
    expect(grouped.RADAR_LEARNING).toBeDefined();
  });

  it('delete removes every USER# item, including all Facebook-derived prefixes', async () => {
    const handler = loadHandler();
    const res = await handler(event('DELETE', '/profile/delete'));
    expect(res.statusCode).toBe(200);
    const deletes = sent.filter((c) => c.name === 'DeleteCommand');
    const deletedSks = deletes.map((d) => d.input.Key.SK);
    for (const it of FB_ITEMS) {
      expect(deletedSks).toContain(it.SK);
    }
  });
});
