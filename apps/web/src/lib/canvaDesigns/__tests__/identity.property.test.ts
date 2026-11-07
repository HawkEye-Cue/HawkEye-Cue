// Feature: canva-style-design-integration, Property 1: No invented business identity
//
// Property 1 (Validates: Requirements 3)
//
// For any caption and any Brand Kit, every brand/identity string rendered into the composed
// design is either ABSENT or EXACTLY EQUAL to the corresponding Brand Kit value — never a
// placeholder or a fabricated value:
//   - business-name layers (role.isBrandSlot && !isPhoneSlot) carry exactly kit.companyName (trimmed),
//   - phone layers (role.isPhoneSlot) carry exactly kit.phone (trimmed),
//   - an empty Brand Kit yields NO business-name and NO phone layer at all (Req 3.3),
//   - the application default primary color (#f97316) is never applied as a custom accent (Req 3.5).
//
// Test level: this asserts on the pure `DesignSpec` / `LayerSpec` data returned by the real
// engine entry point (`buildCanvaSpecs` / `buildInsuranceSpecs`). The brand/accent decisions live
// entirely in this spec-level data (kit.ts `brandBlock`, index.ts `toLite`, and the style modules);
// `composeSpecToDocument` only renders this data onto a canvas and does not change which identity
// strings appear. So the spec level is the correct and most robust place to lock Property 1, and it
// runs in the web app's default `node` vitest environment (no canvas/DOM needed).

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildCanvaSpecs } from '../index';
import type { DesignSpec, LayerSpec, TextSpec } from '../spec';
import { BRAND_KIT_DEFAULTS, type BrandKit } from '../../brandKit';

const RUNS = { numRuns: 150 };
const DEFAULT_COLOR = '#f97316';

const isText = (l: LayerSpec): l is TextSpec => l.kind === 'text';
const brandNameLayers = (s: DesignSpec) =>
  s.layers.filter((l): l is TextSpec => isText(l) && !!l.role?.isBrandSlot && !l.role?.isPhoneSlot);
const phoneLayers = (s: DesignSpec) =>
  s.layers.filter((l): l is TextSpec => isText(l) && !!l.role?.isPhoneSlot);

// Collect every concrete string color referenced by a layer's fill (ignoring gradients, which
// the insurance styles only use for fixed brand-neutral backdrops, not for the accent).
function stringFills(s: DesignSpec): string[] {
  const out: string[] = [];
  for (const l of s.layers) {
    const fill = (l as any).fill;
    if (typeof fill === 'string') out.push(fill.toLowerCase());
    const stroke = (l as any).stroke;
    if (typeof stroke === 'string') out.push(stroke.toLowerCase());
  }
  return out;
}

// Brand Kit generator. We deliberately include messy company/phone strings (surrounding
// whitespace, punctuation, unicode) because the engine trims these before use, and the property
// must hold for the trimmed value.
const textPiece = fc.oneof(
  fc.string(),
  fc.constantFrom('Acme Insurance', 'Rivera Family Insurance', '(512) 555-0147', '  Spaced Co  ', 'Señor Seguros', ''),
);
// A 6-digit hex color like "#1a2b3c" (fast-check v4 removed `hexaString`, so build it from an int).
const hexColorArb = fc.integer({ min: 0, max: 0xffffff }).map((n) => `#${n.toString(16).padStart(6, '0')}`);
const colorArb = fc.oneof(
  fc.constant(DEFAULT_COLOR),
  fc.constant('#F97316'), // default in a different case — must still be treated as "not chosen"
  hexColorArb,
);
const kitArb: fc.Arbitrary<BrandKit> = fc.record({
  companyName: textPiece,
  phone: textPiece,
  website: fc.string(),
  tagline: fc.string(),
  primaryColor: colorArb,
  accentColor: fc.constant('#ffffff'),
  logoDataUrl: fc.oneof(fc.constant(null), fc.constant('data:image/png;base64,AAA')),
});

const captionArb = fc.string({ minLength: 1 }).filter((c) => c.trim().length > 0);
const tradeNameArb = fc.oneof(fc.constant(undefined), fc.constant('Insurance Agent'), fc.string());

const INSURANCE_TRADE = 'insurance-agent';

function buildSpecs(caption: string, tradeName: string | undefined, kit: BrandKit): DesignSpec[] {
  const specs = buildCanvaSpecs(INSURANCE_TRADE, caption, tradeName, kit);
  expect(specs).not.toBeNull();
  return specs!;
}

describe('canva-style-design-integration · Property 1: no invented business identity', () => {
  it('every brand-name layer equals kit.companyName (trimmed); every phone layer equals kit.phone (trimmed)', () => {
    fc.assert(
      fc.property(captionArb, tradeNameArb, kitArb, (caption, tradeName, kit) => {
        const company = kit.companyName.trim();
        const phone = kit.phone.trim();
        for (const spec of buildSpecs(caption, tradeName, kit)) {
          for (const l of brandNameLayers(spec)) {
            expect(company).not.toBe('');          // a name layer must not exist for an empty company
            expect(l.text).toBe(company);          // ...and when it exists it is EXACTLY the kit value
          }
          for (const l of phoneLayers(spec)) {
            expect(phone).not.toBe('');
            expect(l.text).toBe(phone);
          }
        }
      }),
      RUNS,
    );
  });

  it('empty company → no business-name layer; empty phone → no phone layer (Req 3.3)', () => {
    fc.assert(
      fc.property(captionArb, tradeNameArb, kitArb, (caption, tradeName, kit) => {
        const hasCompany = kit.companyName.trim().length > 0;
        const hasPhone = kit.phone.trim().length > 0;
        for (const spec of buildSpecs(caption, tradeName, kit)) {
          if (!hasCompany) expect(brandNameLayers(spec)).toHaveLength(0);
          if (!hasPhone) expect(phoneLayers(spec)).toHaveLength(0);
        }
      }),
      RUNS,
    );
  });

  it('a fully empty Brand Kit yields NO brand or phone layer in any design', () => {
    fc.assert(
      fc.property(captionArb, tradeNameArb, (caption, tradeName) => {
        const emptyKit: BrandKit = { ...BRAND_KIT_DEFAULTS };
        for (const spec of buildSpecs(caption, tradeName, emptyKit)) {
          expect(brandNameLayers(spec)).toHaveLength(0);
          expect(phoneLayers(spec)).toHaveLength(0);
        }
      }),
      RUNS,
    );
  });

  it('the default primary color (#f97316) is never applied as a custom accent', () => {
    fc.assert(
      fc.property(captionArb, tradeNameArb, kitArb, (caption, tradeName, kit) => {
        // The engine treats the default color (any case) as "not chosen": it must never surface as
        // a layer fill/stroke. (None of the insurance styles use #f97316 as a built-in accent, so
        // its appearance could only come from wrongly applying the default kit color.)
        const chosenCustom =
          kit.primaryColor && kit.primaryColor.toLowerCase() !== DEFAULT_COLOR ? kit.primaryColor.toLowerCase() : undefined;
        for (const spec of buildSpecs(caption, tradeName, kit)) {
          const fills = stringFills(spec);
          expect(fills).not.toContain(DEFAULT_COLOR);
          expect(fills).not.toContain('#f97316');
          // When the user DID choose a custom color, the accent elements use exactly that color.
          if (chosenCustom) {
            const accentLayer = spec.layers.find((l) => (l as any).id === 'accent-bar' || (l as any).id === 'rule-top');
            if (accentLayer) expect(String((accentLayer as any).fill).toLowerCase()).toBe(chosenCustom);
          }
        }
      }),
      RUNS,
    );
  });

  it('no brand/phone string is ever a known placeholder/invented value (Req 3.4)', () => {
    // Guard against fabricated identity: placeholders the design must never show.
    const FORBIDDEN = /(your company|your name|company name|555\) 000|000-0000|license #|add your|goes here|placeholder)/i;
    fc.assert(
      fc.property(captionArb, tradeNameArb, kitArb, (caption, tradeName, kit) => {
        for (const spec of buildSpecs(caption, tradeName, kit)) {
          for (const l of [...brandNameLayers(spec), ...phoneLayers(spec)]) {
            // Only true unless the user themselves typed such a string into their kit.
            const fromKit = l.text === kit.companyName.trim() || l.text === kit.phone.trim();
            expect(fromKit).toBe(true);
            if (!FORBIDDEN.test(kit.companyName) && !FORBIDDEN.test(kit.phone)) {
              expect(l.text).not.toMatch(FORBIDDEN);
            }
          }
        }
      }),
      RUNS,
    );
  });
});
