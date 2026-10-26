// Stripe secret-id isolation (sandbox TEST vs production LIVE).
//
// The subscription-handler and stripe-webhook bundles select their Stripe Secrets
// Manager id via `process.env.STRIPE_SECRET_ID || 'SocialLeadGen/Stripe'`. This test
// pins that contract on BOTH compiled bundles:
//   • unset env  → LIVE default 'SocialLeadGen/Stripe' (production unchanged)
//   • set env    → the override (sandbox uses 'SocialLeadGen/sandbox/Stripe' = TEST)
// so production can never be accidentally pointed at the test secret and the sandbox
// can actually reach TEST Stripe (instead of failing closed on the LIVE arn).

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const lambdasDir = resolve(here, '../../../../lambdas/dist');

// Extract the `const STRIPE_SECRET_ID = process.env.STRIPE_SECRET_ID || '...';` line
// from a bundle and evaluate it with a given env to see the resolved value.
function resolveSecretId(handlerName: string, envValue: string | undefined): string {
  const src = readFileSync(resolve(lambdasDir, handlerName, 'index.js'), 'utf8');
  const line = src.split('\n').find((l) => l.includes('const STRIPE_SECRET_ID = process.env.STRIPE_SECRET_ID'));
  if (!line) throw new Error(`STRIPE_SECRET_ID resolution not found in ${handlerName}`);
  const prev = process.env.STRIPE_SECRET_ID;
  if (envValue === undefined) delete process.env.STRIPE_SECRET_ID; else process.env.STRIPE_SECRET_ID = envValue;
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`${line}; return STRIPE_SECRET_ID;`)() as string;
  } finally {
    if (prev === undefined) delete process.env.STRIPE_SECRET_ID; else process.env.STRIPE_SECRET_ID = prev;
  }
}

const HANDLERS = ['subscription-handler', 'stripe-webhook'];

afterEach(() => { delete process.env.STRIPE_SECRET_ID; });

describe('Stripe secret-id isolation', () => {
  for (const h of HANDLERS) {
    it(`${h}: defaults to the LIVE secret when STRIPE_SECRET_ID is unset`, () => {
      expect(resolveSecretId(h, undefined)).toBe('SocialLeadGen/Stripe');
    });
    it(`${h}: uses the sandbox TEST secret when STRIPE_SECRET_ID is set`, () => {
      expect(resolveSecretId(h, 'SocialLeadGen/sandbox/Stripe')).toBe('SocialLeadGen/sandbox/Stripe');
    });
  }
});
