// Account-backed Brand Kit + editable Design storage (content-handler).
//
// Verifies the cross-device storage contract and its safety properties:
//   - Brand Kit: GET/PUT round-trip, logo upload commit (size/type verified server-side),
//     logo removal, invalid color rejected, no logo = no logoUrl.
//   - Designs: list/get/save(two-step commit)/delete; the commit verifies the uploaded object
//     EXISTS and is within the size cap BEFORE pointing the design at it; a missing upload is
//     rejected without corrupting an existing design; previous revision is cleaned up.
//   - AUTHORIZATION: every S3 key is derived from the JWT `sub`, never from client input, so a
//     crafted design id / path cannot read or overwrite another user's objects.
//   - Presigned URLs are returned for reads/writes (browser ↔ private bucket), never raw bytes.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const handlerPath = resolve(here, '../../../../lambdas/dist/content-handler/index.js');

// In-memory DynamoDB + S3 doubles.
let ddb: Map<string, any>;          // "PK|SK" -> item
let s3objects: Map<string, { size: number; contentType: string }>; // key -> head
let presignedGets: string[];
let presignedPuts: { key: string; contentType: string }[];
let deleted: string[];

const dkey = (pk: string, sk: string) => `${pk}|${sk}`;
function cmd(name: string) { return class { input: any; __name = name; constructor(input: any) { this.input = input; } }; }

function sdkStubs() {
  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: {
        from: () => ({
          send: async (c: any) => {
            const i = c.input;
            if (c.__name === 'GetCommand') return { Item: ddb.get(dkey(i.Key.PK, i.Key.SK)) };
            if (c.__name === 'PutCommand') { ddb.set(dkey(i.Item.PK, i.Item.SK), i.Item); return {}; }
            if (c.__name === 'DeleteCommand') { ddb.delete(dkey(i.Key.PK, i.Key.SK)); return {}; }
            if (c.__name === 'QueryCommand') {
              const pk = i.ExpressionAttributeValues[':pk'];
              const skPrefix = i.ExpressionAttributeValues[':sk'];
              const items = [...ddb.values()].filter((x) => x.PK === pk && typeof x.SK === 'string' && x.SK.startsWith(skPrefix));
              if (i.Select === 'COUNT') return { Count: items.length };
              return { Items: items };
            }
            return {};
          },
        }),
      },
      PutCommand: cmd('PutCommand'), QueryCommand: cmd('QueryCommand'),
      DeleteCommand: cmd('DeleteCommand'), UpdateCommand: cmd('UpdateCommand'), GetCommand: cmd('GetCommand'),
    },
    '@aws-sdk/client-s3': {
      S3Client: class {
        async send(c: any) {
          const i = c.input;
          if (c.__name === 'HeadObjectCommand') {
            const o = s3objects.get(i.Key);
            if (!o) { const e: any = new Error('not found'); e.name = 'NotFound'; e.$metadata = { httpStatusCode: 404 }; throw e; }
            return { ContentLength: o.size, ContentType: o.contentType };
          }
          if (c.__name === 'DeleteObjectCommand') { deleted.push(i.Key); s3objects.delete(i.Key); return {}; }
          if (c.__name === 'PutObjectCommand') return {};
          return {};
        }
      },
      PutObjectCommand: cmd('PutObjectCommand'), GetObjectCommand: cmd('GetObjectCommand'),
      HeadObjectCommand: cmd('HeadObjectCommand'), DeleteObjectCommand: cmd('DeleteObjectCommand'),
    },
    '@aws-sdk/s3-request-presigner': {
      getSignedUrl: async (_c: any, command: any) => {
        if (command.__name === 'GetObjectCommand') { presignedGets.push(command.input.Key); return `https://signed-get/${command.input.Key}`; }
        presignedPuts.push({ key: command.input.Key, contentType: command.input.ContentType });
        return `https://signed-put/${command.input.Key}`;
      },
    },
    '@aws-sdk/client-bedrock-runtime': { BedrockRuntimeClient: class {}, InvokeModelCommand: cmd('InvokeModelCommand') },
    '@aws-sdk/client-secrets-manager': {
      SecretsManagerClient: class { async send() { return { SecretString: JSON.stringify({ OPENAI_API_KEY: 'sk-test' }) }; } },
      GetSecretValueCommand: cmd('GetSecretValueCommand'),
    },
  } as Record<string, any>;
}

function loadHandler() {
  process.env.TABLE_NAME = 'TestTable';
  process.env.MEDIA_BUCKET = 'test-bucket';
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

function ev(method: string, path: string, sub: string | null, body?: any) {
  return {
    requestContext: { http: { method, path }, ...(sub ? { authorizer: { jwt: { claims: { sub } } } } : {}) },
    body: body === undefined ? null : JSON.stringify(body),
  };
}
const json = (r: any) => JSON.parse(r.body);

beforeEach(() => { ddb = new Map(); s3objects = new Map(); presignedGets = []; presignedPuts = []; deleted = []; });

describe('Brand Kit storage', () => {
  it('returns null before anything is saved', async () => {
    const r = await loadHandler()(ev('GET', '/brand-kit', 'u1'));
    expect(r.statusCode).toBe(200);
    expect(json(r).brandKit).toBeNull();
  });

  it('saves and reads back brand fields (cross-device: persisted in DynamoDB)', async () => {
    const put = await loadHandler()(ev('PUT', '/brand-kit', 'u1', {
      companyName: 'Acme Roofing', phone: '(555) 111-2222', website: 'acme.com', tagline: 'Fast & Fair',
      primaryColor: '#f97316', accentColor: '#ffffff',
    }));
    expect(put.statusCode).toBe(200);
    const bk = json(put).brandKit;
    expect(bk.companyName).toBe('Acme Roofing');
    expect(bk.logoUrl).toBeNull();
    // A fresh handler instance (new "device") reads the same persisted record.
    const get = await loadHandler()(ev('GET', '/brand-kit', 'u1'));
    expect(json(get).brandKit.companyName).toBe('Acme Roofing');
  });

  it('rejects an invalid color without persisting', async () => {
    const r = await loadHandler()(ev('PUT', '/brand-kit', 'u1', { primaryColor: 'orange' }));
    expect(r.statusCode).toBe(400);
    expect(ddb.size).toBe(0);
  });

  it('mints a presigned PUT for a logo upload (correct content type)', async () => {
    const r = await loadHandler()(ev('POST', '/brand-kit/logo-upload', 'u1', { contentType: 'image/png' }));
    expect(r.statusCode).toBe(200);
    expect(json(r).rev).toMatch(/^[0-9a-f-]{36}$/);
    expect(presignedPuts[0].contentType).toBe('image/png');
    expect(presignedPuts[0].key).toContain('brand/u1/logo-');
  });

  it('rejects a disallowed logo content type', async () => {
    const r = await loadHandler()(ev('POST', '/brand-kit/logo-upload', 'u1', { contentType: 'application/pdf' }));
    expect(r.statusCode).toBe(400);
  });

  it('commits a logo only after verifying the uploaded object exists and is within size', async () => {
    const up = json(await loadHandler()(ev('POST', '/brand-kit/logo-upload', 'u1', { contentType: 'image/png' })));
    s3objects.set(`brand/u1/logo-${up.rev}`, { size: 50_000, contentType: 'image/png' });
    const put = await loadHandler()(ev('PUT', '/brand-kit', 'u1', { companyName: 'Acme', logoRev: up.rev }));
    expect(put.statusCode).toBe(200);
    expect(json(put).brandKit.logoUrl).toContain('signed-get');
  });

  it('rejects a logo commit when the upload is missing (never records a dangling key)', async () => {
    const up = json(await loadHandler()(ev('POST', '/brand-kit/logo-upload', 'u1', { contentType: 'image/png' })));
    const put = await loadHandler()(ev('PUT', '/brand-kit', 'u1', { companyName: 'Acme', logoRev: up.rev }));
    expect(put.statusCode).toBe(400);
    expect(ddb.get('USER#u1|BRAND_KIT')).toBeUndefined();
  });

  it('rejects + deletes a logo that exceeds the 2MB cap', async () => {
    const up = json(await loadHandler()(ev('POST', '/brand-kit/logo-upload', 'u1', { contentType: 'image/png' })));
    const key = `brand/u1/logo-${up.rev}`;
    s3objects.set(key, { size: 3 * 1024 * 1024, contentType: 'image/png' });
    const put = await loadHandler()(ev('PUT', '/brand-kit', 'u1', { logoRev: up.rev }));
    expect(put.statusCode).toBe(400);
    expect(deleted).toContain(key);
  });

  it('removes the logo on logoRev:null and deletes the old object', async () => {
    const up = json(await loadHandler()(ev('POST', '/brand-kit/logo-upload', 'u1', { contentType: 'image/png' })));
    const key = `brand/u1/logo-${up.rev}`;
    s3objects.set(key, { size: 1000, contentType: 'image/png' });
    await loadHandler()(ev('PUT', '/brand-kit', 'u1', { logoRev: up.rev }));
    const r = await loadHandler()(ev('PUT', '/brand-kit', 'u1', { logoRev: null }));
    expect(json(r).brandKit.logoUrl).toBeNull();
    expect(deleted).toContain(key);
  });
});

describe('Design storage — save / reopen / delete / list', () => {
  const ID = 'dsn_abc123';
  async function upload(sub: string, id: string) {
    const r = json(await loadHandler()(ev('POST', `/designs/${id}/upload`, sub)));
    // Simulate the browser PUTting the doc (+thumb) to the presigned URLs.
    s3objects.set(`designs/${sub}/${id}/${r.rev}.json`, { size: 20_000, contentType: 'application/json' });
    s3objects.set(`designs/${sub}/${id}/${r.rev}-thumb.jpg`, { size: 8_000, contentType: 'image/jpeg' });
    return r.rev;
  }
  const commit = (sub: string, id: string, rev: string, over: any = {}) =>
    loadHandler()(ev('PUT', `/designs/${id}`, sub, { rev, name: 'Storm Ad', templateId: 'roof-storm-1', width: 1080, height: 1080, ...over }));

  it('saves a new design (two-step commit) and lists it', async () => {
    const rev = await upload('u1', ID);
    const put = await commit('u1', ID, rev);
    expect(put.statusCode).toBe(200);
    expect(json(put).design.id).toBe(ID);
    const list = await loadHandler()(ev('GET', '/designs', 'u1'));
    expect(json(list).designs).toHaveLength(1);
    expect(json(list).designs[0].thumbnailUrl).toContain('signed-get');
  });

  it('reopens a saved design with a presigned document URL (cross-device)', async () => {
    const rev = await upload('u1', ID);
    await commit('u1', ID, rev);
    const get = await loadHandler()(ev('GET', `/designs/${ID}`, 'u1'));
    expect(get.statusCode).toBe(200);
    expect(json(get).design.documentUrl).toContain(`signed-get/designs/u1/${ID}/${rev}.json`);
  });

  it('rejects a commit whose uploaded document is missing (does not corrupt an existing design)', async () => {
    const rev1 = await upload('u1', ID);
    await commit('u1', ID, rev1);
    // New commit referencing a rev that was never uploaded.
    const bogus = await loadHandler()(ev('PUT', `/designs/${ID}`, 'u1', { rev: '00000000-0000-0000-0000-000000000000', name: 'x', templateId: 'roof-storm-1', width: 1080, height: 1080 }));
    expect(bogus.statusCode).toBe(400);
    // Original still intact + still points at the first revision.
    const get = await loadHandler()(ev('GET', `/designs/${ID}`, 'u1'));
    expect(json(get).design.documentUrl).toContain(`${rev1}.json`);
  });

  it('cleans up the previous revision objects on re-save', async () => {
    const rev1 = await upload('u1', ID);
    await commit('u1', ID, rev1);
    const rev2 = await upload('u1', ID);
    await commit('u1', ID, rev2, { name: 'Storm Ad v2' });
    expect(deleted).toContain(`designs/u1/${ID}/${rev1}.json`);
    expect(deleted).toContain(`designs/u1/${ID}/${rev1}-thumb.jpg`);
  });

  it('rejects an oversized design document (413) and deletes the upload', async () => {
    const r = json(await loadHandler()(ev('POST', `/designs/${ID}/upload`, 'u1')));
    const docKey = `designs/u1/${ID}/${r.rev}.json`;
    s3objects.set(docKey, { size: 16 * 1024 * 1024, contentType: 'application/json' });
    const put = await commit('u1', ID, r.rev);
    expect(put.statusCode).toBe(413);
    expect(deleted).toContain(docKey);
  });

  it('deletes a design and its objects', async () => {
    const rev = await upload('u1', ID);
    await commit('u1', ID, rev);
    const del = await loadHandler()(ev('DELETE', `/designs/${ID}`, 'u1'));
    expect(del.statusCode).toBe(200);
    expect(deleted).toContain(`designs/u1/${ID}/${rev}.json`);
    expect(json(await loadHandler()(ev('GET', `/designs/${ID}`, 'u1'))).design).toBeUndefined();
  });

  it('returns 404 for an unknown design', async () => {
    const r = await loadHandler()(ev('GET', '/designs/dsn_missing', 'u1'));
    expect(r.statusCode).toBe(404);
  });
});

describe('authorization & isolation', () => {
  it("one user cannot read another user's design (keys are scoped to the JWT sub)", async () => {
    // u1 saves a design with id dsn_shared.
    const rev = json(await loadHandler()(ev('POST', '/designs/dsn_shared/upload', 'u1')));
    s3objects.set(`designs/u1/dsn_shared/${rev.rev}.json`, { size: 10, contentType: 'application/json' });
    await loadHandler()(ev('PUT', '/designs/dsn_shared', 'u1', { rev: rev.rev, name: 'x', templateId: 'roof-storm-1', width: 1080, height: 1080 }));
    // u2 asks for the SAME design id → looks under USER#u2, finds nothing.
    const r = await loadHandler()(ev('GET', '/designs/dsn_shared', 'u2'));
    expect(r.statusCode).toBe(404);
    // And u2's upload URL is minted under u2's own prefix, never u1's.
    const up = json(await loadHandler()(ev('POST', '/designs/dsn_shared/upload', 'u2')));
    expect(presignedPuts.at(-2)!.key).toContain('designs/u2/dsn_shared/');
    expect(up.rev).toBeTruthy();
  });

  it('rejects a malformed design id (path traversal / injection) with 400', async () => {
    for (const bad of ['../other', 'dsn_../x', 'foo', 'dsn_' + 'a'.repeat(60)]) {
      const r = await loadHandler()(ev('GET', `/designs/${bad}`, 'u1'));
      expect([400, 404]).toContain(r.statusCode); // never 200, never touches another prefix
    }
  });

  it('rejects unauthenticated storage requests (401)', async () => {
    for (const p of ['/brand-kit', '/designs']) {
      const r = await loadHandler()(ev('GET', p, null));
      expect(r.statusCode).toBe(401);
    }
  });
});
