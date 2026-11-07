// Feature: canva-style-design-integration, Property 3: Trade gate is exact
//
// Property 3 (Validates: Requirements 1, 2, 11)
//
// `buildCanvaSpecs(tradeId, caption, tradeName, kit)` returns exactly three specs
// (photo / illustrated / editorial) *only* when:
//   - `tradeId` is in the Canva_Trade set {insurance-agent, health-insurance-agent,
//     insurance-producer}, AND
//   - the caption is non-empty (after trimming).
// In every other case it returns `null` (the signal the page reads as "use the existing
// template fallback"). This encodes insurance-only scoping (Req 1.5, 11) and the fallback
// contract (Req 2.3, 1.4).
//
// This test runs against the real engine entry point (`buildCanvaSpecs`). It is pure logic
// (trade-gate + caption guard) and needs no canvas/DOM, so it runs in the web app's default
// `node` vitest environment.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildCanvaSpecs } from '../index';
import { type BrandKit } from '../../brandKit';

const RUNS = { numRuns: 200 };

// A 6-digit hex color like "#1a2b3c" (fast-check v4 removed `hexaString`, so build it from an int).
const hexColorArb = fc.integer({ min: 0, max: 0xffffff }).map((n) => `#${n.toString(16).padStart(6, '0')}`);

// The exact Canva_Trade set for Phase 1 (Req 1.5). Kept here independently of the engine so the
// test fails if the engine's set ever drifts.
const CANVA_TRADES = ['insurance-agent', 'health-insurance-agent', 'insurance-producer'] as const;

// A representative sampling of non-Canva trade ids (and near-misses) that must NOT produce specs.
const NON_CANVA_TRADES = [
  'roofing', 'real-estate-agent', 'hvac-technician', 'plumber', 'painter', 'electrician',
  'mortgage-broker', 'landscaper', 'cosmetologist', 'flooring-installer',
  // near-misses / casing variants that must still be rejected (exact match only)
  'insurance', 'insurance-agents', 'Insurance-Agent', 'INSURANCE-AGENT', 'health-insurance',
  'insurance-producer ', ' insurance-agent',
];

// A Brand Kit generator: the gate must behave identically for any kit, so vary it freely.
const kitArb: fc.Arbitrary<BrandKit> = fc.record({
  companyName: fc.string(),
  phone: fc.string(),
  website: fc.string(),
  tagline: fc.string(),
  primaryColor: fc.oneof(fc.constant('#f97316'), hexColorArb),
  accentColor: fc.constant('#ffffff'),
  logoDataUrl: fc.oneof(fc.constant(null), fc.constant('data:image/png;base64,AAA')),
});

// A non-empty caption (contains at least one non-whitespace character).
const nonEmptyCaption = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);
// A whitespace-only / empty caption (must be treated as "no caption").
const emptyCaption = fc.constantFrom('', ' ', '   ', '\t', '\n', ' \n\t ');

const EXPECTED_STYLES = ['photo', 'illustrated', 'editorial'] as const;

function assertThreeDistinctStyles(specs: NonNullable<ReturnType<typeof buildCanvaSpecs>>) {
  expect(specs).toHaveLength(3);
  expect(specs.map((s) => s.style)).toEqual([...EXPECTED_STYLES]);
}

describe('canva-style-design-integration · Property 3: trade gate is exact', () => {
  it('Canva trade + non-empty caption → exactly three specs (photo/illustrated/editorial)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CANVA_TRADES), nonEmptyCaption, fc.string(), kitArb, (tradeId, caption, tradeName, kit) => {
        const specs = buildCanvaSpecs(tradeId, caption, tradeName, kit);
        expect(specs).not.toBeNull();
        assertThreeDistinctStyles(specs!);
        // every spec carries the caption it was built from (gate does not strip it)
        for (const s of specs!) expect(s.caption).toBe(caption);
      }),
      RUNS,
    );
  });

  it('Canva trade + empty/whitespace caption → null (fallback to templates)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CANVA_TRADES), emptyCaption, fc.string(), kitArb, (tradeId, caption, tradeName, kit) => {
        expect(buildCanvaSpecs(tradeId, caption, tradeName, kit)).toBeNull();
      }),
      RUNS,
    );
  });

  it('non-Canva trade → null regardless of caption (templates unchanged)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...NON_CANVA_TRADES), fc.string(), fc.string(), kitArb, (tradeId, caption, tradeName, kit) => {
        expect(buildCanvaSpecs(tradeId, caption, tradeName, kit)).toBeNull();
      }),
      RUNS,
    );
  });

  it('missing/undefined trade id → null', () => {
    fc.assert(
      fc.property(fc.oneof(fc.constant(undefined), fc.constant('')), nonEmptyCaption, kitArb, (tradeId, caption, kit) => {
        expect(buildCanvaSpecs(tradeId as string | undefined, caption, 'Insurance Agent', kit)).toBeNull();
      }),
      RUNS,
    );
  });

  it('exactness: specs are produced iff (trade ∈ CANVA_TRADES AND caption non-empty)', () => {
    // Cross any trade id (Canva + non-Canva + junk) with any caption and assert the biconditional.
    const anyTrade = fc.oneof(
      fc.constantFrom(...CANVA_TRADES),
      fc.constantFrom(...NON_CANVA_TRADES),
      fc.string(),
      fc.constant(undefined),
    );
    fc.assert(
      fc.property(anyTrade, fc.string(), kitArb, (tradeId, caption, kit) => {
        const inGate = typeof tradeId === 'string' && (CANVA_TRADES as readonly string[]).includes(tradeId);
        const hasCaption = caption.trim().length > 0;
        const specs = buildCanvaSpecs(tradeId, caption, 'Insurance Agent', kit);
        if (inGate && hasCaption) {
          expect(specs).not.toBeNull();
          assertThreeDistinctStyles(specs!);
        } else {
          expect(specs).toBeNull();
        }
      }),
      RUNS,
    );
  });
});
