// Launch-critical tests for the nightly folio-recap Lambda (Summit notifications / nightly
// reports) INCLUDING the Daily Team Recap. Delivery routes only through a stubbed Resend
// (fetch) — no real inbox is ever contacted; actual delivery remains UNVERIFIED (no sandbox key).
//
// Harness: load the compiled CJS handler with stubbed AWS SDK (createRequire + Module._compile),
// seed an in-memory DynamoDB store, drive the handler (takes no event), assert on captured emails.
// The SDK stub supports Scan/Query/Get/Update/Delete + a conditional lease Put (EMAILSENT#...).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const handlerPath = resolve(here, '../../../../lambdas/dist/folio-recap/index.js');

let store: Map<string, any>;
let sentEmails: Array<{ to: any; subject: string; text?: string; html?: string }>;
const k = (pk: string, sk: string) => `${pk}|${sk}`;
function putItem(item: any) { store.set(k(item.PK, item.SK), item); }

function dayStr(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
const yesterday = () => dayStr(-1);
const twoDaysAgo = () => dayStr(-2);
const today = () => dayStr(0);

function sdkStubs() {
  const docClient = {
    send: async (cmd: any) => {
      const n = cmd.__name;
      const input = cmd.input || {};
      if (n === 'ScanCommand') {
        const vals = input.ExpressionAttributeValues || {};
        const sk = vals[':sk'];
        const filter = input.FilterExpression || '';
        let items = [...store.values()];
        if (filter.includes('begins_with')) {
          items = items.filter((it) => typeof it.SK === 'string' && it.SK.startsWith(sk));
        } else if (sk !== undefined) {
          items = items.filter((it) => it.SK === sk);
        }
        return { Items: items, LastEvaluatedKey: undefined };
      }
      if (n === 'QueryCommand') {
        const vals = input.ExpressionAttributeValues || {};
        const pk = vals[':pk'];
        const skVal = vals[':sk'];
        const expr = input.KeyConditionExpression || '';
        let items = [...store.values()].filter((it) => it.PK === pk);
        if (expr.includes('begins_with')) {
          items = items.filter((it) => typeof it.SK === 'string' && it.SK.startsWith(skVal));
        } else if (skVal !== undefined) {
          items = items.filter((it) => it.SK === skVal);
        }
        return { Items: items, LastEvaluatedKey: undefined };
      }
      if (n === 'GetCommand') {
        const key = input.Key || {};
        return { Item: store.get(k(key.PK, key.SK)) };
      }
      if (n === 'UpdateCommand') {
        // Used by confirmEmailSent (lease → sent). Guarded by leaseOwner == token.
        const key = input.Key || {};
        const existing = store.get(k(key.PK, key.SK));
        const tok = input.ExpressionAttributeValues?.[':tok'];
        if (!existing || (tok !== undefined && existing.leaseOwner !== tok)) {
          const e: any = new Error('cond'); e.name = 'ConditionalCheckFailedException'; throw e;
        }
        store.set(k(key.PK, key.SK), { ...existing, status: 'sent' });
        return {};
      }
      if (n === 'DeleteCommand') {
        const key = input.Key || {};
        store.delete(k(key.PK, key.SK));
        return {};
      }
      if (n === 'PutCommand') {
        // Lease claim: conditional Put to EMAILSENT#... Claimable when absent OR
        // pending-with-expired-lease (crash recovery). Live claim throws.
        const item = input.Item || {};
        if (typeof item.PK === 'string' && item.PK.startsWith('EMAILSENT#')) {
          const existing = store.get(k(item.PK, item.SK));
          const nowSec = input.ExpressionAttributeValues?.[':now'] ?? Math.floor(Date.now() / 1000);
          const expired = existing && existing.status === 'pending' && existing.leaseUntil < nowSec;
          if (existing && existing.status === 'sent') { const e: any = new Error('sent'); e.name = 'ConditionalCheckFailedException'; throw e; }
          if (existing && !expired) { const e: any = new Error('live'); e.name = 'ConditionalCheckFailedException'; throw e; }
          store.set(k(item.PK, item.SK), item);
          return {};
        }
        store.set(k(item.PK, item.SK), item);
        return {};
      }
      return {};
    },
  };
  const cmd = (name: string) => class { input: any; __name = name; constructor(input: any) { this.input = input; } };
  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: { from: () => docClient },
      ScanCommand: cmd('ScanCommand'), QueryCommand: cmd('QueryCommand'),
      GetCommand: cmd('GetCommand'), PutCommand: cmd('PutCommand'),
      UpdateCommand: cmd('UpdateCommand'), DeleteCommand: cmd('DeleteCommand'),
    },
    '@aws-sdk/client-secrets-manager': {
      SecretsManagerClient: class { async send() { return { SecretString: JSON.stringify({ RESEND_API_KEY: 'test_resend_key' }) }; } },
      GetSecretValueCommand: class { input: any; __name = 'GetSecretValueCommand'; constructor(i: any) { this.input = i; } },
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
  return (m.exports as any).handler as () => Promise<any>;
}

beforeEach(() => {
  store = new Map();
  sentEmails = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, opts: any) => {
    try {
      const payload = JSON.parse(opts.body);
      sentEmails.push({ to: payload.to, subject: payload.subject, text: payload.text, html: payload.html });
    } catch { /* ignore */ }
    return { ok: true, status: 200, json: async () => ({ id: 'email_test' }), text: async () => '' };
  }));
});
afterEach(() => { delete process.env.EMAIL_ALLOWLIST; });

// ─── Daily Team Recap ─────────────────────────────────────────────────────────
// Seeds a Summit team (owner u1 + member u2) and asserts the recap reaches EVERY active
// member (owner included), uses the won-transition date (updatedAt), and respects prefs.
function seedTeam() {
  // Owner link + team INFO + both members.
  putItem({ PK: 'USER#u1', SK: 'TEAM_ADMIN', teamId: 't1', role: 'admin' });
  putItem({ PK: 'TEAM#t1', SK: 'INFO', teamId: 't1', teamName: 'Acme Agency', adminUserId: 'u1', adminEmail: 'owner@acme.com' });
  putItem({ PK: 'TEAM#t1', SK: 'MEMBER#u1', userId: 'u1', email: 'owner@acme.com', role: 'admin' });
  putItem({ PK: 'TEAM#t1', SK: 'MEMBER#u2', userId: 'u2', email: 'rep@acme.com', role: 'member' });
  // Profiles (recipient email + prefs).
  putItem({ PK: 'USER#u1', SK: 'PROFILE', email: 'owner@acme.com', emailNotifications: {} });
  putItem({ PK: 'USER#u2', SK: 'PROFILE', email: 'rep@acme.com', emailNotifications: {} });
}

describe('folio-recap — Daily Team Recap', () => {
  it('sends ONE recap to every active member including the owner', async () => {
    seedTeam();
    // Both members closed a deal TODAY (won-transition = updatedAt today).
    putItem({ PK: 'USER#u1', SK: 'DEAL#1', stage: 'won', dealValue: 3000, updatedAt: `${today()}T09:00:00Z`, policyType: 'Auto' });
    putItem({ PK: 'USER#u2', SK: 'DEAL#1', stage: 'won', dealValue: 5000, updatedAt: `${today()}T10:00:00Z`, policyType: 'Home' });
    const handler = loadHandler();
    await handler();
    const recaps = sentEmails.filter((e) => /team recap|daily team/i.test(e.subject || '') || /team recap/i.test(e.html || ''));
    const recipients = recaps.flatMap((e) => (Array.isArray(e.to) ? e.to : [e.to]));
    expect(recipients).toContain('owner@acme.com'); // owner included
    expect(recipients).toContain('rep@acme.com');    // member included
  });

  it('respects teamRecap=false (owner opted out does NOT receive the recap)', async () => {
    seedTeam();
    // Owner opts out of the team recap.
    putItem({ PK: 'USER#u1', SK: 'PROFILE', email: 'owner@acme.com', emailNotifications: { teamRecap: false } });
    putItem({ PK: 'USER#u2', SK: 'DEAL#1', stage: 'won', dealValue: 5000, updatedAt: `${today()}T10:00:00Z`, policyType: 'Home' });
    const handler = loadHandler();
    await handler();
    const recaps = sentEmails.filter((e) => /team recap|daily team/i.test(e.subject || '') || /team recap/i.test(e.html || ''));
    const recipients = recaps.flatMap((e) => (Array.isArray(e.to) ? e.to : [e.to]));
    expect(recipients).not.toContain('owner@acme.com'); // suppressed
    expect(recipients).toContain('rep@acme.com');        // other member still gets it
  });

  it('counts a sale by its WON-transition date (updatedAt), not creation date', async () => {
    seedTeam();
    // Deal CREATED weeks ago but transitioned to won TODAY → must count today.
    putItem({ PK: 'USER#u2', SK: 'DEAL#1', stage: 'won', dealValue: 4200, createdAt: `${dayStr(-20)}T08:00:00Z`, updatedAt: `${today()}T11:00:00Z`, policyType: 'Auto' });
    // Deal transitioned to won YESTERDAY → must NOT count in today's recap.
    putItem({ PK: 'USER#u2', SK: 'DEAL#2', stage: 'won', dealValue: 9999, createdAt: `${today()}T07:00:00Z`, updatedAt: `${yesterday()}T09:00:00Z`, policyType: 'Home' });
    const handler = loadHandler();
    await handler();
    const recap = sentEmails.find((e) => /team recap|daily team/i.test(e.subject || '') || /team recap/i.test(e.html || ''));
    expect(recap).toBeTruthy();
    const content = `${recap!.subject || ''} ${recap!.html || ''} ${recap!.text || ''}`;
    expect(content).toContain('4,200');        // won today counted
    expect(content).not.toContain('9,999');     // won yesterday excluded
  });

  it('agency isolation: a recap never includes another team\'s member', async () => {
    seedTeam();
    // A completely separate team t2 with its own member u3 and a won deal today.
    putItem({ PK: 'USER#u3', SK: 'TEAM_ADMIN', teamId: 't2', role: 'admin' });
    putItem({ PK: 'TEAM#t2', SK: 'INFO', teamId: 't2', teamName: 'Other Co', adminUserId: 'u3', adminEmail: 'other@co.com' });
    putItem({ PK: 'TEAM#t2', SK: 'MEMBER#u3', userId: 'u3', email: 'other@co.com', role: 'admin' });
    putItem({ PK: 'USER#u3', SK: 'PROFILE', email: 'other@co.com', emailNotifications: {} });
    putItem({ PK: 'USER#u1', SK: 'DEAL#1', stage: 'won', dealValue: 1000, updatedAt: `${today()}T09:00:00Z`, policyType: 'Auto' });
    putItem({ PK: 'USER#u3', SK: 'DEAL#1', stage: 'won', dealValue: 2000, updatedAt: `${today()}T09:00:00Z`, policyType: 'Home' });
    const handler = loadHandler();
    await handler();
    // Acme's recap must not mention Other Co's rep email anywhere.
    const acme = sentEmails.find((e) => (Array.isArray(e.to) ? e.to : [e.to]).includes('owner@acme.com'));
    expect(acme).toBeTruthy();
    const content = `${acme!.subject || ''} ${acme!.html || ''} ${acme!.text || ''}`;
    expect(content).not.toContain('other@co.com');
  });
});
