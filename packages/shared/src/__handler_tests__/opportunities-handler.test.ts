// D1 backend handler tests for the compiled opportunities-handler.
//
// The handler is a compiled CommonJS bundle in lambdas/dist that `require()`s the AWS
// SDK (installed here as a test-only devDependency; Lambda uses the AWS-provided SDK at
// runtime). Because the handler is loaded via CommonJS `require` of a dist file, vitest's
// ESM `vi.mock` can't intercept its inner `require('@aws-sdk/...')`. Instead we prime
// Node's CommonJS require cache (keyed by the SDK's real resolved absolute paths, from
// the handler's own module context) with inspectable stubs BEFORE requiring the handler.
//
// Asserted at the data-access level:
//   - Minimal Save creates exactly ONE opportunity item and NO LEAD_PROTOCOL item.
//   - A malformed/empty create is rejected (400) with no writes.
//   - Enriched create still stores author/content.
//   - create with promoteToLead:true writes the LEAD_PROTOCOL (guarded) when a template exists.
//   - the explicit /promote endpoint writes LEAD_PROTOCOL and is idempotent (guarded put).

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const handlerPath = resolve(here, '../../../../lambdas/dist/opportunities-handler/index.js');

type SentCommand = { name: string; input: any };
let sent: SentCommand[] = [];
let sendImpl: (cmd: SentCommand) => Promise<any> = async () => ({ Items: [] });

function cmd(name: string) {
  return class {
    input: any;
    __name = name;
    constructor(input: any) {
      this.input = input;
    }
  };
}

// Build the stubbed AWS SDK module exports the handler expects.
function sdkStubs() {
  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: {
        from: () => ({
          send: async (c: any) => {
            const entry = { name: c.__name as string, input: c.input };
            sent.push(entry);
            return sendImpl(entry);
          },
        }),
      },
      PutCommand: cmd('PutCommand'),
      QueryCommand: cmd('QueryCommand'),
      UpdateCommand: cmd('UpdateCommand'),
      DeleteCommand: cmd('DeleteCommand'),
    },
  } as Record<string, any>;
}

// Load the compiled CommonJS handler without depending on a package.json "type" marker
// inside the deployable Lambda asset. We compile the bundle in an isolated CommonJS
// module whose require() returns our SDK stubs for the AWS packages and delegates
// everything else to the real resolver. This keeps the shipped Lambda asset untouched.
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

function event(method: string, path: string, body?: any) {
  return {
    requestContext: { http: { method, path }, authorizer: { jwt: { claims: { sub: 'user-123' } } } },
    body: body ? JSON.stringify(body) : undefined,
  };
}

beforeEach(() => {
  sent = [];
  sendImpl = async () => ({ Items: [] });
});

describe('opportunities-handler — D1 Minimal Save & Promote', () => {
  it('Minimal Save creates exactly one OPP item and NO LEAD_PROTOCOL', async () => {
    const handler = loadHandler();
    const res = await handler(
      event('POST', '/opportunities', {
        keywordId: 'kw1',
        sourcePlatform: 'facebook',
        sourceUrl: 'https://facebook.com/post/123',
      }),
    );
    expect(res.statusCode).toBe(201);

    const puts = sent.filter((c) => c.name === 'PutCommand');
    const oppPuts = puts.filter((c) => String(c.input.Item.SK).startsWith('OPP#'));
    const protoPuts = puts.filter((c) => String(c.input.Item.SK).startsWith('LEAD_PROTOCOL#'));
    expect(oppPuts).toHaveLength(1);
    expect(protoPuts).toHaveLength(0);
    expect(oppPuts[0].input.Item.sourceAuthor).toBeNull();
    expect(oppPuts[0].input.Item.sourceContent).toBeNull();
    expect(oppPuts[0].input.Item.promotedToLead).toBe(false);
  });

  it('rejects a malformed/empty create (no URL, no author, no content)', async () => {
    const handler = loadHandler();
    const res = await handler(
      event('POST', '/opportunities', { keywordId: 'kw1', sourcePlatform: 'facebook', sourceUrl: '' }),
    );
    expect(res.statusCode).toBe(400);
    expect(sent.filter((c) => c.name === 'PutCommand')).toHaveLength(0);
  });

  it('accepts a hand-entered manual lead (no URL, but has author) and writes NO LEAD_PROTOCOL', async () => {
    const handler = loadHandler();
    const res = await handler(
      event('POST', '/opportunities', {
        keywordId: 'manual-entry',
        sourcePlatform: 'facebook',
        sourceUrl: '',
        sourceAuthor: 'Jane Q.',
      }),
    );
    expect(res.statusCode).toBe(201);
    const puts = sent.filter((c) => c.name === 'PutCommand');
    const oppPuts = puts.filter((c) => String(c.input.Item.SK).startsWith('OPP#'));
    const protoPuts = puts.filter((c) => String(c.input.Item.SK).startsWith('LEAD_PROTOCOL#'));
    expect(oppPuts).toHaveLength(1);
    expect(protoPuts).toHaveLength(0);
    expect(oppPuts[0].input.Item.sourceAuthor).toBe('Jane Q.');
  });

  it('Enriched create still stores author + content', async () => {
    const handler = loadHandler();
    const res = await handler(
      event('POST', '/opportunities', {
        keywordId: 'kw1',
        sourcePlatform: 'facebook',
        sourceUrl: 'https://facebook.com/post/123',
        sourceAuthor: 'John D.',
        sourceContent: 'Need a roofer',
      }),
    );
    expect(res.statusCode).toBe(201);
    const oppPut = sent.find((c) => c.name === 'PutCommand' && String(c.input.Item.SK).startsWith('OPP#'))!;
    expect(oppPut.input.Item.sourceAuthor).toBe('John D.');
    expect(oppPut.input.Item.sourceContent).toBe('Need a roofer');
  });

  it('create with promoteToLead:true writes the LEAD_PROTOCOL (guarded) when a template exists', async () => {
    const handler = loadHandler();
    sendImpl = async (c) => {
      if (c.name === 'QueryCommand' && c.input.ExpressionAttributeValues?.[':sk'] === 'LEAD_PROTOCOL_TEMPLATE') {
        return { Items: [{ steps: [{ day: 0, type: 'call', task: 'Call' }] }] };
      }
      return { Items: [] };
    };
    const res = await handler(
      event('POST', '/opportunities', {
        keywordId: 'kw1',
        sourcePlatform: 'facebook',
        sourceUrl: 'https://facebook.com/post/123',
        promoteToLead: true,
      }),
    );
    expect(res.statusCode).toBe(201);
    const protoPuts = sent.filter((c) => c.name === 'PutCommand' && String(c.input.Item.SK).startsWith('LEAD_PROTOCOL#'));
    expect(protoPuts).toHaveLength(1);
    expect(protoPuts[0].input.ConditionExpression).toBe('attribute_not_exists(SK)');
  });

  it('GET normalizes a historical background-scanner record into canonical fields', async () => {
    const handler = loadHandler();
    // A legacy lead-scanner item: scanner schema, NO canonical fields.
    sendImpl = async (c) => {
      if (c.name === 'QueryCommand') {
        return {
          Items: [
            {
              PK: 'USER#user-123',
              SK: 'OPP#2024-01-01T00:00:00Z#scan1',
              opportunityId: 'scan1',
              sourceCommentId: 'cmt-1',
              platform: 'facebook',
              authorName: 'Jane Scanner',
              postContent: 'Does anyone know a good roofer?',
              matchedKeywords: ['roofer', 'roof leak'],
              source: 'background-scan',
              status: 'new',
              createdAt: '2024-01-01T00:00:00Z',
            },
          ],
        };
      }
      return { Items: [] };
    };
    const res = await handler(event('GET', '/opportunities'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const o = body.opportunities[0];
    expect(o.sourcePlatform).toBe('facebook'); // from item.platform
    expect(o.sourceAuthor).toBe('Jane Scanner'); // from item.authorName
    expect(o.sourceContent).toBe('Does anyone know a good roofer?'); // from item.postContent
    expect(o.keywordId).toBe('extension-detected'); // scanner records had none
    expect(o.keywordText).toBe('roofer'); // first matched keyword
    expect(o.sourceUrl).toBe(''); // D1: never fabricated
    expect(o.status).toBe('new');
  });

  it('GET leaves a canonical record unchanged', async () => {
    const handler = loadHandler();
    sendImpl = async (c) => {
      if (c.name === 'QueryCommand') {
        return {
          Items: [
            {
              PK: 'USER#user-123',
              SK: 'OPP#2024-02-02T00:00:00Z#canon1',
              opportunityId: 'canon1',
              keywordId: 'kw1',
              sourcePlatform: 'instagram',
              sourceAuthor: 'John Canonical',
              sourceContent: 'Looking for insurance',
              sourceUrl: 'https://instagram.com/p/abc',
              status: 'new',
              createdAt: '2024-02-02T00:00:00Z',
            },
          ],
        };
      }
      return { Items: [] };
    };
    const res = await handler(event('GET', '/opportunities'));
    const o = JSON.parse(res.body).opportunities[0];
    expect(o.sourcePlatform).toBe('instagram');
    expect(o.sourceAuthor).toBe('John Canonical');
    expect(o.sourceContent).toBe('Looking for insurance');
    expect(o.sourceUrl).toBe('https://instagram.com/p/abc');
    expect(o.keywordId).toBe('kw1');
    expect(o.keywordText).toBe('kw1');
  });

  it('GET preserves manual-entry keywordText derivation', async () => {
    const handler = loadHandler();
    sendImpl = async (c) => {
      if (c.name === 'QueryCommand') {
        return {
          Items: [
            {
              PK: 'USER#user-123',
              SK: 'OPP#2024-03-03T00:00:00Z#man1',
              opportunityId: 'man1',
              keywordId: 'manual-entry',
              leadSource: 'referral',
              sourcePlatform: 'facebook',
              sourceAuthor: 'Walk In',
              status: 'new',
              createdAt: '2024-03-03T00:00:00Z',
            },
          ],
        };
      }
      return { Items: [] };
    };
    const res = await handler(event('GET', '/opportunities'));
    const o = JSON.parse(res.body).opportunities[0];
    expect(o.keywordId).toBe('manual-entry');
    expect(o.keywordText).toBe('referral'); // manual-entry → leadSource label
  });

  it('explicit /promote creates LEAD_PROTOCOL (guarded) and is idempotent on retry', async () => {
    const handler = loadHandler();
    let protocolExists = false;
    sendImpl = async (c) => {
      if (c.name === 'QueryCommand' && c.input.ExpressionAttributeValues?.[':oppId']) {
        return { Items: [{ PK: 'USER#user-123', SK: 'OPP#t#opp1', opportunityId: 'opp1', sourceAuthor: null }] };
      }
      if (c.name === 'QueryCommand' && c.input.ExpressionAttributeValues?.[':sk'] === 'LEAD_PROTOCOL_TEMPLATE') {
        return { Items: [{ steps: [{ day: 0, type: 'call', task: 'Call' }] }] };
      }
      if (c.name === 'PutCommand' && String(c.input.Item.SK).startsWith('LEAD_PROTOCOL#')) {
        if (protocolExists) {
          const err: any = new Error('exists');
          err.name = 'ConditionalCheckFailedException';
          throw err;
        }
        protocolExists = true;
        return {};
      }
      return { Items: [] };
    };

    const r1 = await handler(event('POST', '/opportunities/opp1/promote'));
    expect(r1.statusCode).toBe(200);
    const firstProto = sent.filter((c) => c.name === 'PutCommand' && String(c.input.Item.SK).startsWith('LEAD_PROTOCOL#'));
    expect(firstProto).toHaveLength(1);
    expect(firstProto[0].input.ConditionExpression).toBe('attribute_not_exists(SK)');

    sent = [];
    const r2 = await handler(event('POST', '/opportunities/opp1/promote'));
    expect(r2.statusCode).toBe(200);
    const secondProto = sent.filter((c) => c.name === 'PutCommand' && String(c.input.Item.SK).startsWith('LEAD_PROTOCOL#'));
    for (const p of secondProto) {
      expect(p.input.ConditionExpression).toBe('attribute_not_exists(SK)');
    }
  });
});
