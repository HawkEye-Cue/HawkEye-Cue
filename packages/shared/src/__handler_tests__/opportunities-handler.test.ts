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
      // GetCommand is used by the server-side entitlement check (profile lookup) that
      // guards the paid followUp routes (promote / promoteToLead).
      GetCommand: cmd('GetCommand'),
      // TransactWriteCommand atomically writes the dedupe sentinel + OPP item together.
      TransactWriteCommand: cmd('TransactWriteCommand'),
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

// The OPP item may be written either as a standalone PutCommand (manual / keyless) OR as
// one leg of a TransactWriteCommand (auto-detected with a dedupe key). This finds it in
// either place so assertions on the stored item are write-path agnostic.
function findOppItem(cmds: SentCommand[]): any | undefined {
  const put = cmds.find((c) => c.name === 'PutCommand' && String(c.input?.Item?.SK || '').startsWith('OPP#'));
  if (put) return put.input.Item;
  for (const c of cmds) {
    if (c.name === 'TransactWriteCommand') {
      const leg = (c.input.TransactItems || []).find((t: any) => String(t.Put?.Item?.SK || '').startsWith('OPP#'));
      if (leg) return leg.Put.Item;
    }
  }
  return undefined;
}

// Default profile returned by GetCommand(PROFILE). Paid (soar) so the entitlement
// gate on the followUp routes passes; individual tests can still override sendImpl but
// should delegate PROFILE Gets back here (see paidProfileGet).
const PAID_PROFILE = { PK: 'USER#user-123', SK: 'PROFILE', subscriptionTier: 'soar', subscriptionStatus: 'active' };
function paidProfileGet(c: SentCommand) {
  if (c.name === 'GetCommand' && c.input?.Key?.SK === 'PROFILE') return { Item: PAID_PROFILE };
  return undefined;
}

beforeEach(() => {
  sent = [];
  sendImpl = async (c) => paidProfileGet(c) ?? { Items: [] };
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
      const prof = paidProfileGet(c);
      if (prof) return prof;
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
      const prof = paidProfileGet(c);
      if (prof) return prof;
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

// ─── Add Cue regression suite (launch blocker) ──────────────────────────────────
// Reproduces the exact manual-testing failure and guards the data write for the
// combinations the Pipeline "Add Cue" form can produce. NOTE: the user-facing failure
// was a SANDBOX ROUTING GAP (no /opportunities routes registered → 404), fixed in
// sandbox-stack.ts. The handler itself accepts these payloads — these tests lock that in
// so a future change can't silently start rejecting a basic manual lead.
describe('opportunities-handler — Add Cue (manual lead) regression', () => {
  // The exact payload the Pipeline form sends for the reported reproduction:
  //   name "Sandbox Test Customer", source "Other", note "Testing Lead Creation",
  //   policy type + expected premium left blank, worked-by = signed-in user.
  function addCuePayload(overrides: Record<string, unknown> = {}) {
    return {
      keywordId: 'manual-entry',
      sourceContent: 'Testing Lead Creation',
      sourcePlatform: 'other',
      sourceUrl: '',
      sourceAuthor: 'Sandbox Test Customer',
      leadSource: 'Other',
      assignedTo: 'user-123@example.com',
      ...overrides,
    };
  }

  it('creates the reported lead (source Other, optional fields blank) → 201, one OPP, no protocol', async () => {
    const handler = loadHandler();
    const res = await handler(event('POST', '/opportunities', addCuePayload()));
    expect(res.statusCode).toBe(201);
    const puts = sent.filter((c) => c.name === 'PutCommand');
    const oppPuts = puts.filter((c) => String(c.input.Item.SK).startsWith('OPP#'));
    const protoPuts = puts.filter((c) => String(c.input.Item.SK).startsWith('LEAD_PROTOCOL#'));
    expect(oppPuts).toHaveLength(1);
    expect(protoPuts).toHaveLength(0); // plain capture — no paid follow-up protocol
    const item = oppPuts[0].input.Item;
    expect(item.sourceAuthor).toBe('Sandbox Test Customer');
    expect(item.sourceContent).toBe('Testing Lead Creation');
    expect(item.sourcePlatform).toBe('other');
    expect(item.assignedTo).toBe('user-123@example.com');
    expect(item.status).toBe('new');
    // Optional fields left blank persist as null (not rejected, not undefined).
    expect(item.policyType).toBeNull();
    expect(item.expectedPremium).toBeNull();
  });

  it('optional fields truly optional: only name + source, everything else omitted → 201', async () => {
    const handler = loadHandler();
    const res = await handler(event('POST', '/opportunities', {
      keywordId: 'manual-entry',
      sourcePlatform: 'other',
      sourceUrl: '',
      sourceAuthor: 'Minimal Lead',
    }));
    expect(res.statusCode).toBe(201);
    const item = sent.find((c) => c.name === 'PutCommand' && String(c.input.Item.SK).startsWith('OPP#'))!.input.Item;
    expect(item.sourceAuthor).toBe('Minimal Lead');
    expect(item.policyType).toBeNull();
    expect(item.expectedPremium).toBeNull();
    expect(item.leadSourceGroup).toBeNull();
    expect(item.contactEmail).toBeNull();
  });

  it('trade-specific policy type does NOT block creation and is persisted', async () => {
    const handler = loadHandler();
    for (const policyType of ['Auto', 'Homeowners', 'Commercial Roof', 'HVAC Maintenance', 'Custom Trade Thing']) {
      sent = [];
      const res = await handler(event('POST', '/opportunities', addCuePayload({ policyType })));
      expect(res.statusCode).toBe(201);
      const item = sent.find((c) => c.name === 'PutCommand' && String(c.input.Item.SK).startsWith('OPP#'))!.input.Item;
      expect(item.policyType).toBe(policyType);
    }
  });

  it('expected premium, when provided, is stored as given', async () => {
    const handler = loadHandler();
    const res = await handler(event('POST', '/opportunities', addCuePayload({ expectedPremium: 1500 })));
    expect(res.statusCode).toBe(201);
    const item = sent.find((c) => c.name === 'PutCommand' && String(c.input.Item.SK).startsWith('OPP#'))!.input.Item;
    expect(item.expectedPremium).toBe(1500);
  });

  it('rejects an unauthenticated request with 401 and writes nothing', async () => {
    const handler = loadHandler();
    const res = await handler({
      requestContext: { http: { method: 'POST', path: '/opportunities' } }, // no jwt claims
      body: JSON.stringify(addCuePayload()),
    });
    expect(res.statusCode).toBe(401);
    expect(sent.filter((c) => c.name === 'PutCommand')).toHaveLength(0);
  });

  it('a plain capture never triggers the paid follow-up entitlement gate (free for Nest)', async () => {
    const handler = loadHandler();
    // Even with NO profile (free/unknown), a plain Add Cue succeeds — only promoteToLead gates.
    sendImpl = async () => ({ Items: [] }); // no PAID_PROFILE
    const res = await handler(event('POST', '/opportunities', addCuePayload()));
    expect(res.statusCode).toBe(201);
  });
});

// ─── Sandbox infrastructure guard ───────────────────────────────────────────────
// The actual launch blocker: the sandbox API Gateway never registered /opportunities,
// so Add Cue 404'd. This locks the routes into the sandbox stack so they can't silently
// go missing again. Source-level assertion (no CDK synth needed).
describe('sandbox-stack — registers the Pipeline /opportunities routes', () => {
  const sandboxStack = readFileSync(resolve(here, '../../../cdk/lib/sandbox-stack.ts'), 'utf8');

  it('creates an opportunities Lambda wired to the sandbox table', () => {
    expect(sandboxStack).toContain("existingCode('opportunities-handler')");
    expect(sandboxStack).toContain('table.grantReadWriteData(opportunitiesFn)');
  });

  it('registers POST+GET /opportunities and the key sub-routes', () => {
    expect(sandboxStack).toContain("path: '/opportunities',");
    expect(sandboxStack).toContain("path: '/opportunities/stats'");
    expect(sandboxStack).toContain("path: '/opportunities/{id}'");
    expect(sandboxStack).toContain("path: '/opportunities/{id}/status'");
    expect(sandboxStack).toContain("path: '/opportunities/{id}/promote'");
    // All opportunities routes go through the Cognito authorizer.
    expect(sandboxStack).toContain('SandboxOppInt');
  });
});

// ─── pipelineStage (additive CRM sub-stage) ─────────────────────────────────────
// Validates the new optional field on PUT /opportunities/{id}/status:
//   • persists a valid sub-stage via UpdateCommand (SET pipelineStage = ...)
//   • rejects invalid values (400, no write)
//   • NEW/CLIENTS labels map to "clear" (null) since those columns derive from status
//   • never changes the stored `status` when only pipelineStage is sent (so moving a
//     customer around the board — including toward CLIENTS handling — never logs a sale;
//     logging a sale is a separate /sales/deals action, not this handler)
//   • GET is backward-compatible: legacy records (no pipelineStage) return null
describe('opportunities-handler — pipelineStage (CRM sub-stage, additive)', () => {
  // Make the status handler's "find the item" query resolve to an existing followed_up OPP.
  function existingOpp(extra: Record<string, unknown> = {}) {
    return (c: SentCommand) => {
      if (c.name === 'QueryCommand' && c.input.ExpressionAttributeValues?.[':oppId']) {
        return { Items: [{ PK: 'USER#user-123', SK: 'OPP#t#opp1', opportunityId: 'opp1', status: 'followed_up', ...extra }] };
      }
      return undefined;
    };
  }

  it('persists a valid sub-stage (quoted) via UpdateCommand without touching status', async () => {
    const handler = loadHandler();
    const find = existingOpp();
    sendImpl = async (c) => find(c) ?? { Items: [] };
    const res = await handler(event('PUT', '/opportunities/opp1/status', { pipelineStage: 'quoted' }));
    expect(res.statusCode).toBe(200);
    const upd = sent.find((c) => c.name === 'UpdateCommand')!;
    expect(upd.input.UpdateExpression).toContain('pipelineStage = :pipelineStage');
    expect(upd.input.ExpressionAttributeValues[':pipelineStage']).toBe('quoted');
    // status must NOT be in the update when only pipelineStage was sent
    expect(upd.input.UpdateExpression).not.toContain('#status');
    expect(JSON.parse(res.body).pipelineStage).toBe('quoted');
  });

  it('accepts closing and contacted (case-insensitive) and stores the canonical lowercase', async () => {
    const handler = loadHandler();
    sendImpl = async (c) => existingOpp()(c) ?? { Items: [] };
    for (const [input, expected] of [['CLOSING', 'closing'], ['Contacted', 'contacted']] as const) {
      sent = [];
      const res = await handler(event('PUT', '/opportunities/opp1/status', { pipelineStage: input }));
      expect(res.statusCode).toBe(200);
      const upd = sent.find((c) => c.name === 'UpdateCommand')!;
      expect(upd.input.ExpressionAttributeValues[':pipelineStage']).toBe(expected);
    }
  });

  it('maps NEW/CLIENTS labels to null (those columns derive from status, not sub-stage)', async () => {
    const handler = loadHandler();
    sendImpl = async (c) => existingOpp()(c) ?? { Items: [] };
    for (const label of ['NEW', 'clients']) {
      sent = [];
      const res = await handler(event('PUT', '/opportunities/opp1/status', { pipelineStage: label }));
      expect(res.statusCode).toBe(200);
      const upd = sent.find((c) => c.name === 'UpdateCommand')!;
      expect(upd.input.ExpressionAttributeValues[':pipelineStage']).toBeNull();
    }
  });

  it('clears the sub-stage when passed null', async () => {
    const handler = loadHandler();
    sendImpl = async (c) => existingOpp({ pipelineStage: 'quoted' })(c) ?? { Items: [] };
    const res = await handler(event('PUT', '/opportunities/opp1/status', { pipelineStage: null }));
    expect(res.statusCode).toBe(200);
    const upd = sent.find((c) => c.name === 'UpdateCommand')!;
    expect(upd.input.ExpressionAttributeValues[':pipelineStage']).toBeNull();
  });

  it('rejects an invalid sub-stage (400) and writes nothing', async () => {
    const handler = loadHandler();
    sendImpl = async (c) => existingOpp()(c) ?? { Items: [] };
    const res = await handler(event('PUT', '/opportunities/opp1/status', { pipelineStage: 'won' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_PIPELINE_STAGE');
    expect(sent.filter((c) => c.name === 'UpdateCommand')).toHaveLength(0);
  });

  it('a pipelineStage-only update satisfies the "at least one field" check', async () => {
    const handler = loadHandler();
    sendImpl = async (c) => existingOpp()(c) ?? { Items: [] };
    const res = await handler(event('PUT', '/opportunities/opp1/status', { pipelineStage: 'contacted' }));
    expect(res.statusCode).toBe(200);
  });

  it('can set status AND pipelineStage together (board move to a middle column)', async () => {
    const handler = loadHandler();
    sendImpl = async (c) => existingOpp()(c) ?? { Items: [] };
    const res = await handler(event('PUT', '/opportunities/opp1/status', { status: 'followed_up', pipelineStage: 'closing' }));
    expect(res.statusCode).toBe(200);
    const upd = sent.find((c) => c.name === 'UpdateCommand')!;
    expect(upd.input.UpdateExpression).toContain('#status = :status');
    expect(upd.input.UpdateExpression).toContain('pipelineStage = :pipelineStage');
    expect(upd.input.ExpressionAttributeValues[':status']).toBe('followed_up');
    expect(upd.input.ExpressionAttributeValues[':pipelineStage']).toBe('closing');
  });

  it('GET is backward-compatible: legacy record with no pipelineStage returns null', async () => {
    const handler = loadHandler();
    sendImpl = async (c) => {
      if (c.name === 'QueryCommand') {
        return { Items: [{ PK: 'USER#user-123', SK: 'OPP#t#legacy1', opportunityId: 'legacy1', keywordId: 'kw1', sourcePlatform: 'facebook', status: 'followed_up', createdAt: '2024-01-01T00:00:00Z' }] };
      }
      return { Items: [] };
    };
    const res = await handler(event('GET', '/opportunities'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).opportunities[0].pipelineStage).toBeNull();
  });

  it('GET returns a stored pipelineStage unchanged', async () => {
    const handler = loadHandler();
    sendImpl = async (c) => {
      if (c.name === 'QueryCommand') {
        return { Items: [{ PK: 'USER#user-123', SK: 'OPP#t#opp2', opportunityId: 'opp2', keywordId: 'kw1', sourcePlatform: 'facebook', status: 'followed_up', pipelineStage: 'quoted', createdAt: '2024-01-01T00:00:00Z' }] };
      }
      return { Items: [] };
    };
    const res = await handler(event('GET', '/opportunities'));
    expect(JSON.parse(res.body).opportunities[0].pipelineStage).toBe('quoted');
  });

  it('moving around the board never writes a Deal/sale (this handler has no sales write)', async () => {
    const handler = loadHandler();
    sendImpl = async (c) => existingOpp()(c) ?? { Items: [] };
    await handler(event('PUT', '/opportunities/opp1/status', { pipelineStage: 'closing' }));
    // No sales/deal write path exists in this handler; assert no Put to a DEAL/SALE SK.
    const dealWrites = sent.filter((c) => c.name === 'PutCommand' && /DEAL|SALE/i.test(String(c.input?.Item?.SK || '')));
    expect(dealWrites).toHaveLength(0);
  });
});

// ─── Review-first Opportunity Inbox + author quality (intake gating) ─────────────
// Automatically detected opportunities (extension + background scanner) must land in
// the 'inbox' pre-pipeline state, NOT 'new'. Manual entry keeps straight-to-'new'.
// Author quality: junk authors are stored as null (UI shows "Author unavailable").
describe('opportunities-handler — review-first Inbox gating', () => {
  function autoPayload(overrides: Record<string, unknown> = {}) {
    return {
      keywordId: 'extension-detected',
      sourceContent: 'Does anyone know a good insurance agent? Need a quote.',
      sourcePlatform: 'facebook',
      sourceUrl: 'https://www.facebook.com/',
      sourceAuthor: 'Dana Prospect',
      ...overrides,
    };
  }

  it('extension-detected capture is created with status "inbox" (not new)', async () => {
    const handler = loadHandler();
    const res = await handler(event('POST', '/opportunities', autoPayload()));
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).status).toBe('inbox');
    const oppItem = findOppItem(sent)!;
    expect(oppItem.status).toBe('inbox');
  });

  it('background-scan source is also gated to "inbox"', async () => {
    const handler = loadHandler();
    const res = await handler(event('POST', '/opportunities', autoPayload({ keywordId: 'kw1', source: 'background-scan' })));
    expect(JSON.parse(res.body).status).toBe('inbox');
  });

  it('a record carrying matchedKeywords[] is gated to "inbox"', async () => {
    const handler = loadHandler();
    const res = await handler(event('POST', '/opportunities', autoPayload({ keywordId: 'kw1', matchedKeywords: ['insurance'] })));
    expect(JSON.parse(res.body).status).toBe('inbox');
  });

  it('manual entry is UNCHANGED: created with status "new"', async () => {
    const handler = loadHandler();
    const res = await handler(event('POST', '/opportunities', {
      keywordId: 'manual-entry', sourcePlatform: 'other', sourceUrl: '', sourceAuthor: 'Walk In', leadSource: 'referral',
    }));
    expect(JSON.parse(res.body).status).toBe('new');
  });

  it('an explicit promote-at-save goes to "new" even if auto markers are present', async () => {
    const handler = loadHandler();
    // promoteToLead signals manual intent; must not be trapped in the inbox.
    sendImpl = async (c) => paidProfileGet(c) ?? { Items: [] };
    const res = await handler(event('POST', '/opportunities', autoPayload({ promoteToLead: true })));
    expect(JSON.parse(res.body).status).toBe('new');
  });

  it('junk author (Photos) is stored as null on an auto-detected inbox record', async () => {
    const handler = loadHandler();
    await handler(event('POST', '/opportunities', autoPayload({ sourceAuthor: 'Photos' })));
    const oppItem = findOppItem(sent)!;
    expect(oppItem.sourceAuthor).toBeNull();
    // original source URL + content are preserved regardless.
    expect(oppItem.sourceUrl).toBe('https://www.facebook.com/');
    expect(oppItem.sourceContent).toContain('insurance agent');
  });

  it('URL/domain author (m.me) is stored as null', async () => {
    const handler = loadHandler();
    await handler(event('POST', '/opportunities', autoPayload({ sourceAuthor: 'm.me' })));
    expect(findOppItem(sent)!.sourceAuthor).toBeNull();
  });

  it('a legitimate business name is preserved (not rejected)', async () => {
    const handler = loadHandler();
    await handler(event('POST', '/opportunities', autoPayload({ sourceAuthor: 'Rocky Mountain Insurance' })));
    expect(findOppItem(sent)!.sourceAuthor).toBe('Rocky Mountain Insurance');
  });

  it('stats counts inbox separately and excludes it from "new"', async () => {
    const handler = loadHandler();
    sendImpl = async (c) => {
      if (c.name === 'QueryCommand') {
        return { Items: [
          { status: 'inbox' }, { status: 'inbox' },
          { status: 'new' },
          { status: 'converted' },
        ] };
      }
      return paidProfileGet(c) ?? { Items: [] };
    };
    const res = await handler(event('GET', '/opportunities/stats'));
    const { stats } = JSON.parse(res.body);
    expect(stats.inbox).toBe(2);
    expect(stats.new).toBe(1);
    expect(stats.converted).toBe(1);
  });

  it('"Add to Pipeline" is an existing status PUT to new (no new endpoint needed)', async () => {
    const handler = loadHandler();
    sendImpl = async (c) => {
      if (c.name === 'QueryCommand' && c.input.ExpressionAttributeValues?.[':oppId']) {
        return { Items: [{ PK: 'USER#user-123', SK: 'OPP#t#opp1', opportunityId: 'opp1', status: 'inbox' }] };
      }
      return paidProfileGet(c) ?? { Items: [] };
    };
    const res = await handler(event('PUT', '/opportunities/opp1/status', { status: 'new' }));
    expect(res.statusCode).toBe(200);
    const upd = sent.find((c) => c.name === 'UpdateCommand')!;
    expect(upd.input.ExpressionAttributeValues[':status']).toBe('new');
  });
});

// ─── Server-side duplicate prevention (auto-detected only) ───────────────────
// Auto-detected captures write the dedupe sentinel (SK OPPDEDUPE#<key>) AND the OPP item
// in ONE atomic TransactWriteCommand with ConditionExpression attribute_not_exists(SK) on
// the sentinel. First capture wins; repeats (incl. concurrent + other devices) cancel the
// txn → 200 duplicate, no new OPP, no orphaned sentinel. Manual entry is never deduped.
describe('opportunities-handler — server-side dedupe (atomic transaction)', () => {
  function autoPayload(overrides: Record<string, unknown> = {}) {
    return {
      keywordId: 'extension-detected',
      sourceContent: 'Does anyone know a good insurance agent? Need a quote.',
      sourcePlatform: 'facebook',
      sourceUrl: 'https://www.facebook.com/groups/x/posts/1001/',
      sourceAuthor: 'Dana Prospect',
      ...overrides,
    };
  }
  // Helpers to read the two Put items inside a TransactWriteCommand.
  function txnItems(c: SentCommand): any[] {
    return (c.input.TransactItems || []).map((t: any) => t.Put?.Item).filter(Boolean);
  }
  function sentinelOf(c: SentCommand) { return txnItems(c).find((i) => String(i.SK).startsWith('OPPDEDUPE#')); }
  function oppOf(c: SentCommand) { return txnItems(c).find((i) => String(i.SK).startsWith('OPP#')); }

  // Simulate a table enforcing the sentinel's attribute_not_exists(SK) condition inside a
  // transaction: if the sentinel key already exists, the WHOLE txn is cancelled (atomic).
  function dedupeAwareImpl() {
    const existing = new Set<string>();
    return async (c: SentCommand) => {
      const prof = paidProfileGet(c);
      if (prof) return prof;
      if (c.name === 'TransactWriteCommand') {
        const s = sentinelOf(c);
        const sk = s ? String(s.SK) : '';
        if (sk && existing.has(sk)) {
          const err: any = new Error('txn cancelled');
          err.name = 'TransactionCanceledException';
          throw err; // nothing is written — atomic rollback
        }
        if (sk) existing.add(sk);
        return {};
      }
      if (c.name === 'GetCommand' && String(c.input.Key?.SK || '').startsWith('OPPDEDUPE#')) {
        return { Item: { opportunityId: 'first-id', SK: c.input.Key.SK } };
      }
      return { Items: [] };
    };
  }

  it('writes sentinel + OPP atomically in ONE transaction for an auto-detected capture', async () => {
    const handler = loadHandler();
    sendImpl = dedupeAwareImpl();
    const res = await handler(event('POST', '/opportunities', autoPayload()));
    expect(res.statusCode).toBe(201);
    const txn = sent.find((c) => c.name === 'TransactWriteCommand')!;
    expect(txn).toBeTruthy();
    const sentinel = sentinelOf(txn)!;
    const opp = oppOf(txn)!;
    expect(sentinel).toBeTruthy();
    expect(opp).toBeTruthy();
    // sentinel condition guards against duplicates and is user-scoped + URL-keyed.
    expect(txn.input.TransactItems.find((t: any) => String(t.Put.Item.SK).startsWith('OPPDEDUPE#')).Put.ConditionExpression).toBe('attribute_not_exists(SK)');
    expect(String(sentinel.SK)).toContain('url:facebook.com/groups/x/posts/1001');
    expect(String(sentinel.PK)).toBe('USER#user-123');
    expect(opp.status).toBe('inbox');
    // sentinel + opp reference the same opportunityId.
    expect(sentinel.opportunityId).toBe(opp.opportunityId);
  });

  it('ORPHAN SAFETY: a failed OPP write rolls back the sentinel (no standalone PutCommand)', async () => {
    const handler = loadHandler();
    sendImpl = dedupeAwareImpl();
    await handler(event('POST', '/opportunities', autoPayload()));
    // There must be NO standalone PutCommand for an auto-detected capture — both items go
    // through the transaction, so the sentinel cannot be committed without the OPP.
    const standalonePut = sent.find((c) => c.name === 'PutCommand' && /OPP#|OPPDEDUPE#/.test(String(c.input.Item?.SK || '')));
    expect(standalonePut).toBeUndefined();
  });

  it('a whole-transaction failure surfaces (no partial write) and does not 200-duplicate', async () => {
    const handler = loadHandler();
    // Simulate a NON-conditional transaction failure (e.g., throttling): must propagate,
    // not be mistaken for a duplicate. Nothing is written (atomic).
    sendImpl = async (c) => {
      const prof = paidProfileGet(c); if (prof) return prof;
      if (c.name === 'TransactWriteCommand') { const e: any = new Error('throttled'); e.name = 'ProvisionedThroughputExceededException'; throw e; }
      return { Items: [] };
    };
    await expect(handler(event('POST', '/opportunities', autoPayload()))).rejects.toThrow();
  });

  it('a repeated capture returns 200 duplicate with NO new OPP (txn cancelled)', async () => {
    const handler = loadHandler();
    sendImpl = dedupeAwareImpl();
    const r1 = await handler(event('POST', '/opportunities', autoPayload()));
    expect(r1.statusCode).toBe(201);
    sent = []; // only inspect writes from the SECOND (duplicate) call
    const r2 = await handler(event('POST', '/opportunities', autoPayload()));
    expect(r2.statusCode).toBe(200);
    expect(JSON.parse(r2.body).duplicate).toBe(true);
    // On the duplicate: the txn was attempted but cancelled (writes nothing), and there is
    // NO committed OPP item. A cancelled TransactWriteCommand may still appear in `sent`
    // (it was dispatched), so assert the txn CONTAINS no committed opp by checking the
    // handler did not fall through to any standalone OPP PutCommand.
    const standaloneOpp = sent.filter((c) => c.name === 'PutCommand' && String(c.input.Item?.SK || '').startsWith('OPP#'));
    expect(standaloneOpp).toHaveLength(0);
  });

  it('retry after a duplicate stays idempotent (still 200, never a second OPP)', async () => {
    const handler = loadHandler();
    sendImpl = dedupeAwareImpl();
    await handler(event('POST', '/opportunities', autoPayload()));
    const r2 = await handler(event('POST', '/opportunities', autoPayload()));
    const r3 = await handler(event('POST', '/opportunities', autoPayload()));
    expect(r2.statusCode).toBe(200);
    expect(r3.statusCode).toBe(200);
  });

  it('a capture from a DIFFERENT device (same user, same post) is deduped', async () => {
    const handler = loadHandler();
    sendImpl = dedupeAwareImpl();
    await handler(event('POST', '/opportunities', autoPayload()));
    sent = [];
    const res = await handler(event('POST', '/opportunities', autoPayload({ sourceAuthor: 'Dana Prospect' })));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).duplicate).toBe(true);
  });

  it('simultaneous submissions: exactly one 201 and one 200 (atomic txn serializes)', async () => {
    const handler = loadHandler();
    sendImpl = dedupeAwareImpl();
    const [a, b] = await Promise.all([
      handler(event('POST', '/opportunities', autoPayload())),
      handler(event('POST', '/opportunities', autoPayload())),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 201]);
  });

  it('background-scanner submissions are deduped by a COMPATIBLE key (sourceCommentId → id:)', async () => {
    const handler = loadHandler();
    sendImpl = dedupeAwareImpl();
    const payload = { keywordId: 'kw1', source: 'background-scan', sourceCommentId: 'cmt-99', sourcePlatform: 'facebook', sourceUrl: '', sourceContent: 'need a roofer' };
    const r1 = await handler(event('POST', '/opportunities', payload));
    expect(r1.statusCode).toBe(201);
    const txn = sent.find((c) => c.name === 'TransactWriteCommand')!;
    expect(String(sentinelOf(txn)!.SK)).toContain('id:cmt-99');
    sent = [];
    const r2 = await handler(event('POST', '/opportunities', payload));
    expect(r2.statusCode).toBe(200);
  });

  it('manual entry is NEVER deduped (plain Put, no transaction, no sentinel)', async () => {
    const handler = loadHandler();
    sendImpl = dedupeAwareImpl();
    await handler(event('POST', '/opportunities', {
      keywordId: 'manual-entry', sourcePlatform: 'other', sourceUrl: '', sourceAuthor: 'Walk In', leadSource: 'referral',
    }));
    expect(sent.find((c) => c.name === 'TransactWriteCommand')).toBeUndefined();
    const oppPut = sent.find((c) => c.name === 'PutCommand' && String(c.input.Item.SK).startsWith('OPP#'))!;
    expect(oppPut).toBeTruthy();
    expect(oppPut.input.Item.status).toBe('new');
  });

  it('keyless auto-detect (bare feed URL, junk author, no content) is NOT deduped but still creates', async () => {
    const handler = loadHandler();
    sendImpl = dedupeAwareImpl();
    await handler(event('POST', '/opportunities', {
      keywordId: 'extension-detected', sourcePlatform: 'facebook', sourceUrl: 'https://www.facebook.com/', sourceAuthor: 'Photos',
    }));
    expect(sent.find((c) => c.name === 'TransactWriteCommand')).toBeUndefined();
    // Still creates the OPP (in the inbox) — we never block blindly.
    const oppPut = sent.find((c) => c.name === 'PutCommand' && String(c.input.Item.SK).startsWith('OPP#'))!;
    expect(oppPut).toBeTruthy();
    expect(oppPut.input.Item.status).toBe('inbox');
  });
});
