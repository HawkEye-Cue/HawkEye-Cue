// Priority 1 — Stripe tier correctness.
//
// Three compiled Lambda bundles (subscription-handler, stripe-webhook, team-handler)
// each carry a VERBATIM copy of normalizeTier because they cannot import from
// packages/shared. This test asserts:
//   • every handler copy agrees with the canonical shared normalizeTier across the full
//     alias set and unexpected inputs,
//   • Summit resolves to team (500 AI generations), never free/soar,
//   • unknown/garbage labels resolve to free (never a silent paid grant),
//   • the canonical AI-limit lookup matches TIER_LIMITS.
//
// We extract each handler's normalizeTier by compiling the bundle in an isolated module
// context (same require-cache technique as the other handler tests) and reading the
// function off a module-scope capture. Since normalizeTier is a top-level function in
// each bundle, we evaluate the source and pull it out via a small shim.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  normalizeTier as canonicalNormalize,
  aiGenerationLimitForTier,
  AI_GENERATION_LIMITS_BY_TIER,
  TIER_LIMITS,
} from '../constants/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const lambdasDir = resolve(here, '../../../../lambdas/dist');

// Pull a top-level `function normalizeTier(...) { ... }` out of a compiled bundle by
// isolating its source and evaluating just that declaration. This avoids executing the
// whole handler (which needs AWS SDK stubs) while still testing the REAL shipped code.
function extractNormalizeTier(handlerName: string): (raw: unknown) => string {
  const src = readFileSync(resolve(lambdasDir, handlerName, 'index.js'), 'utf8');
  const start = src.indexOf('function normalizeTier');
  if (start < 0) throw new Error(`normalizeTier not found in ${handlerName}`);
  // Walk braces from the first '{' after the signature to find the function body end.
  const bodyStart = src.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end < 0) throw new Error(`Could not parse normalizeTier body in ${handlerName}`);
  const fnSource = src.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function(`${fnSource}; return normalizeTier;`)() as (raw: unknown) => string;
}

const HANDLERS = ['subscription-handler', 'stripe-webhook', 'team-handler'];

// Full matrix of inputs we care about.
const CASES: Array<[unknown, string]> = [
  ['free', 'free'],
  ['nest', 'free'],
  ['none', 'free'],
  ['expired', 'free'],
  ['', 'free'],
  [null, 'free'],
  [undefined, 'free'],
  ['soar', 'soar'],
  ['base', 'soar'],
  ['growth', 'soar'],
  ['flight', 'soar'],
  ['pro', 'soar'],
  ['team', 'team'],
  ['summit', 'team'],
  ['SUMMIT', 'team'],
  ['Team', 'team'],
  ['garbage', 'free'],
  ['enterprise', 'free'],
  ['soar-plus', 'free'],
  ['123', 'free'],
];

describe('canonical normalizeTier', () => {
  it.each(CASES)('normalizes %s → %s', (input, expected) => {
    expect(canonicalNormalize(input)).toBe(expected);
  });

  it('Summit maps to team and the 500 AI limit (never free/soar)', () => {
    expect(canonicalNormalize('summit')).toBe('team');
    expect(aiGenerationLimitForTier('summit')).toBe(500);
    expect(aiGenerationLimitForTier('summit')).not.toBe(AI_GENERATION_LIMITS_BY_TIER.free);
  });

  it('unknown labels never yield a paid AI limit', () => {
    expect(aiGenerationLimitForTier('enterprise')).toBe(2);
    expect(aiGenerationLimitForTier('totally-made-up')).toBe(2);
  });

  it('AI limits match TIER_LIMITS.aiGenerations', () => {
    expect(AI_GENERATION_LIMITS_BY_TIER.free).toBe(TIER_LIMITS.free.aiGenerations);
    expect(AI_GENERATION_LIMITS_BY_TIER.soar).toBe(TIER_LIMITS.soar.aiGenerations);
    expect(AI_GENERATION_LIMITS_BY_TIER.team).toBe(TIER_LIMITS.team.aiGenerations);
  });
});

describe('handler normalizeTier parity (no silent drift across the 3 bundles)', () => {
  for (const handler of HANDLERS) {
    it(`${handler} agrees with the canonical implementation on every case`, () => {
      const fn = extractNormalizeTier(handler);
      for (const [input, expected] of CASES) {
        expect(fn(input), `${handler} normalizeTier(${JSON.stringify(input)})`).toBe(expected);
        expect(fn(input)).toBe(canonicalNormalize(input));
      }
    });
  }
});
