// Feature: canva-style-design-integration, Task 2.2: Copy comes only from caption / Brand Kit
// Validates: Requirements 3, 4
//
// These unit tests assert the copy-sourcing contract of the Canva engine's pure helpers:
//  - makeInput derives headline / supporting text / chips / CTA from the user's caption (and the
//    trade name) — nothing is invented.
//  - chipsFromCaption only emits feature phrases that are literally present in the caption.
//  - brandBlock omits the business-name layer when company is empty and the phone layer when phone
//    is empty — never a placeholder.
import { describe, it, expect } from 'vitest';
import { makeInput, chipsFromCaption, EMPTY_KIT, TEST_KIT, CAPTIONS, type BrandKitLite } from '../inputs';
import { brandBlock } from '../kit';
import type { DesignInput } from '../spec';

/** Normalize text to lowercase word tokens for "is this word present in the caption?" checks. */
function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Build the set of words a design is allowed to source from: caption + trade name. */
function allowedVocab(caption: string, trade?: string): Set<string> {
  return new Set([...words(caption), ...words(trade ?? '')]);
}

describe('makeInput copy derives only from the caption / trade name', () => {
  it('headline words all come from the caption (nothing invented)', () => {
    const caption = CAPTIONS.insurance;
    const inp = makeInput(caption, 'Insurance Agent', EMPTY_KIT);
    const vocab = allowedVocab(caption, 'Insurance Agent');
    const headlineWords = words(inp.headline.join(' '));
    expect(headlineWords.length).toBeGreaterThan(0);
    for (const w of headlineWords) {
      expect(vocab.has(w), `headline word "${w}" is not present in the caption/trade name`).toBe(true);
    }
  });

  it('supporting text words all come from the caption', () => {
    const caption = CAPTIONS.realestate;
    const inp = makeInput(caption, 'Real Estate', EMPTY_KIT);
    const vocab = allowedVocab(caption, 'Real Estate');
    const subWords = words(inp.sub.join(' '));
    for (const w of subWords) {
      expect(vocab.has(w), `supporting word "${w}" is not present in the caption/trade name`).toBe(true);
    }
  });

  it('CTA is derived from the caption intent, not invented out of nowhere', () => {
    // The insurance caption expresses a "free quote" intent → deriveCta yields a quote CTA.
    const inp = makeInput(CAPTIONS.insurance, 'Insurance Agent', EMPTY_KIT);
    expect(inp.cta).toBeTruthy();
    expect(inp.cta!.toLowerCase()).toMatch(/quote/);
  });

  it('CTA is omitted when the caption expresses no actionable intent', () => {
    const caption = 'Our office has been serving this community for twenty years.';
    const inp = makeInput(caption, 'Insurance Agent', EMPTY_KIT);
    // deriveCta returns the generic "Learn More" default, which makeInput drops (cta === undefined).
    expect(inp.cta).toBeUndefined();
  });

  it('business name and phone come only from the Brand Kit, never the caption', () => {
    const inp = makeInput(CAPTIONS.insurance, 'Insurance Agent', TEST_KIT);
    expect(inp.company).toBe(TEST_KIT.company);
    expect(inp.phone).toBe(TEST_KIT.phone);
    // The Brand Kit company name is not something the caption invented.
    expect(CAPTIONS.insurance).not.toContain(TEST_KIT.company);
  });

  it('empty Brand Kit leaves company / phone empty (no invented identity)', () => {
    const inp = makeInput(CAPTIONS.insurance, 'Insurance Agent', EMPTY_KIT);
    expect(inp.company).toBe('');
    expect(inp.phone).toBe('');
  });

  it('keeps the full caption verbatim on the input (Req 4)', () => {
    const inp = makeInput(CAPTIONS.realestate, 'Real Estate', EMPTY_KIT);
    expect(inp.caption).toBe(CAPTIONS.realestate);
  });
});

describe('chipsFromCaption only emits phrases literally present in the caption', () => {
  it('extracts "4 bedrooms" from a caption that contains "4 bedroom"', () => {
    const chips = chipsFromCaption(CAPTIONS.realestate);
    expect(chips).toContain('4 bedrooms');
  });

  it('extracts the "huge backyard" feature phrase present in the caption', () => {
    const chips = chipsFromCaption(CAPTIONS.realestate);
    expect(chips).toContain('huge backyard');
  });

  it('every emitted chip is grounded in words that appear in the caption', () => {
    const chips = chipsFromCaption(CAPTIONS.realestate);
    const vocab = [...allowedVocab(CAPTIONS.realestate)];
    expect(chips.length).toBeGreaterThan(0);
    // A chip word is "grounded" when the caption contains it or its stem — e.g. the caption's
    // "4 bedroom" (singular) grounds the display chip "4 bedrooms" (pluralized for display). This
    // is a deliberate singular<->plural normalization, not invented content.
    const grounded = (w: string) =>
      vocab.some((v) => v === w || v.startsWith(w) || w.startsWith(v));
    for (const chip of chips) {
      for (const w of words(chip)) {
        expect(grounded(w), `chip word "${w}" (from "${chip}") is not grounded in the caption`).toBe(true);
      }
    }
  });

  it('emits no chips for a caption that contains no feature phrases', () => {
    expect(chipsFromCaption(CAPTIONS.insurance)).toEqual([]);
    expect(chipsFromCaption('Call me today for a friendly chat about your coverage.')).toEqual([]);
  });
});

describe('brandBlock omits empty Brand Kit fields (never a placeholder)', () => {
  const baseOpts = { x: 80, y: 900, w: 500, nameColor: '#111', phoneColor: '#111' };
  const input = (over: Partial<DesignInput>): DesignInput => ({
    caption: 'x', headline: [], sub: [], company: '', phone: '', ...over,
  });

  it('emits both name and phone layers when both are present', () => {
    const layers = brandBlock(input({ company: 'Acme Insurance', phone: '(555) 123-4567' }), baseOpts);
    const ids = layers.map((l) => l.id);
    expect(ids).toContain('brand');
    expect(ids).toContain('phone');
  });

  it('omits the business-name layer when company is empty', () => {
    const layers = brandBlock(input({ company: '', phone: '(555) 123-4567' }), baseOpts);
    const ids = layers.map((l) => l.id);
    expect(ids).not.toContain('brand');
    expect(ids).toContain('phone');
    // No placeholder text leaked into any emitted layer.
    for (const l of layers) {
      if (l.kind === 'text') expect(l.text).not.toMatch(/business name|company|your name/i);
    }
  });

  it('omits the phone layer when phone is empty', () => {
    const layers = brandBlock(input({ company: 'Acme Insurance', phone: '' }), baseOpts);
    const ids = layers.map((l) => l.id);
    expect(ids).toContain('brand');
    expect(ids).not.toContain('phone');
    for (const l of layers) {
      if (l.kind === 'text') expect(l.text).not.toMatch(/phone|000|xxx|placeholder/i);
    }
  });

  it('emits no branding layers at all when the Brand Kit is empty', () => {
    const layers = brandBlock(input({ company: '', phone: '' }), baseOpts);
    expect(layers).toEqual([]);
  });

  it('only ever renders the exact Brand Kit values as branding text', () => {
    const kit: BrandKitLite = { company: 'Acme Insurance', phone: '(555) 123-4567' };
    const layers = brandBlock(input({ company: kit.company, phone: kit.phone }), baseOpts);
    const texts = layers.filter((l) => l.kind === 'text').map((l) => (l as { text: string }).text);
    for (const t of texts) {
      expect([kit.company, kit.phone]).toContain(t);
    }
  });
});
