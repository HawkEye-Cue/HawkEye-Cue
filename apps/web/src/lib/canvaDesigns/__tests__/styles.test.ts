// @vitest-environment jsdom
// Feature: canva-style-design-integration, Task 2.1 — three genuinely distinct styles.
//
// Requirement 1 (Insurance-First Canva Designs):
//   1.1 A Canva_Trade with a non-empty caption yields three designs: one photo, one
//       illustrated, one editorial.
//   1.2 The three designs are genuinely different Design_Styles — differing in LAYOUT
//       STRUCTURE, not merely color.
//
// This test is deliberately structural. It asserts the three specs differ in the SET and
// COUNT of layer KINDS and ROLES (presence/absence of a photo layer, presence of an
// illustration path set), so a future "recolor one layout three times" regression fails here
// rather than silently shipping three identical layouts.

import { describe, it, expect } from 'vitest';
import { buildInsuranceSpecs } from '../index';
import type { DesignSpec, LayerSpec } from '../spec';
import type { BrandKit } from '../../brandKit';

const KIT: BrandKit = {
  companyName: 'Harbor & Pike Insurance',
  phone: '(555) 123-4567',
  website: 'harborpike.example',
  tagline: 'Covered, come what may',
  primaryColor: '#1d4ed8', // a chosen (non-default) accent
  accentColor: '#ffffff',
  logoDataUrl: null,
};

const CAPTION =
  'Is your home fully covered? Get a free quote today and protect what matters most to your family.';
const TRADE_NAME = 'Insurance Agent';

/** Count layers by `kind` so we can compare structure, not styling. */
function kindCounts(spec: DesignSpec): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const layer of spec.layers) {
    counts[layer.kind] = (counts[layer.kind] ?? 0) + 1;
  }
  return counts;
}

/** The set of distinct layer kinds present in a spec. */
function kindSet(spec: DesignSpec): Set<string> {
  return new Set(spec.layers.map((l) => l.kind));
}

/** Does the spec contain a photo layer? */
function hasPhoto(spec: DesignSpec): boolean {
  return spec.layers.some((l) => l.kind === 'photo');
}

/** Illustration path layers = the vector-art pieces (shield/house/badge). */
function illustrationPaths(spec: DesignSpec): LayerSpec[] {
  return spec.layers.filter((l) => l.kind === 'path' && l.group === 'illustration');
}

/** A stable structural fingerprint: sorted "kind:group" pairs. Equal fingerprints => same layout. */
function structuralFingerprint(spec: DesignSpec): string {
  return spec.layers
    .map((l) => `${l.kind}:${l.group}`)
    .sort()
    .join('|');
}

describe('buildInsuranceSpecs — three genuinely distinct styles (Requirement 1)', () => {
  const specs = buildInsuranceSpecs(CAPTION, TRADE_NAME, KIT);

  it('returns exactly three specs with styles photo, illustrated, editorial (Req 1.1)', () => {
    expect(specs).toHaveLength(3);
    expect(specs.map((s) => s.style)).toEqual(['photo', 'illustrated', 'editorial']);
  });

  it('each spec is a valid 1080x1080 insurance design carrying the full caption', () => {
    for (const spec of specs) {
      expect(spec.width).toBe(1080);
      expect(spec.height).toBe(1080);
      expect(spec.trade).toBe('insurance');
      expect(spec.caption).toBe(CAPTION);
      expect(spec.layers.length).toBeGreaterThan(0);
    }
  });

  const [photo, illustrated, editorial] = specs;

  // ---- Structural identity of each style (Req 1.2) -------------------------------------

  it('PHOTO style: full-bleed photo layer, no illustration vector art', () => {
    expect(hasPhoto(photo)).toBe(true);
    // The photo is a full-bleed background image, not a shaped mask.
    const img = photo.layers.find((l) => l.kind === 'photo')!;
    expect(img).toBeDefined();
    expect((img as any).width).toBe(1080);
    expect((img as any).height).toBe(1080);
    // Photo style is NOT built from illustration path art.
    expect(illustrationPaths(photo)).toHaveLength(0);
  });

  it('ILLUSTRATED style: a set of illustration path layers and NO photo layer', () => {
    // The shield/house/badge illustration is many individual path pieces.
    const paths = illustrationPaths(illustrated);
    expect(paths.length).toBeGreaterThanOrEqual(5);
    // Illustrated is the only style that is vector-art based — it ships no photo.
    expect(hasPhoto(illustrated)).toBe(false);
  });

  it('EDITORIAL style: a shaped (circle-masked) photo and no illustration vector art', () => {
    expect(hasPhoto(editorial)).toBe(true);
    const img = editorial.layers.find((l) => l.kind === 'photo')!;
    // Editorial frames the photo in a circle mask (distinct from photo style's full bleed).
    expect((img as any).mask).toBe('circle');
    expect((img as any).width).toBeLessThan(1080);
    expect(illustrationPaths(editorial)).toHaveLength(0);
  });

  // ---- The three are genuinely different from each other (not recolors) ----------------

  it('the three styles differ in layer STRUCTURE, not merely color', () => {
    const fp = specs.map(structuralFingerprint);
    // No two styles share the same structural fingerprint.
    expect(new Set(fp).size).toBe(3);
  });

  it('photo vs illustrated differ in presence of photo and illustration kinds', () => {
    expect(hasPhoto(photo)).toBe(true);
    expect(hasPhoto(illustrated)).toBe(false);
    expect(illustrationPaths(photo).length).toBe(0);
    expect(illustrationPaths(illustrated).length).toBeGreaterThan(0);
  });

  it('illustrated vs editorial differ in presence of photo and illustration kinds', () => {
    expect(hasPhoto(illustrated)).toBe(false);
    expect(hasPhoto(editorial)).toBe(true);
    expect(illustrationPaths(illustrated).length).toBeGreaterThan(0);
    expect(illustrationPaths(editorial).length).toBe(0);
  });

  it('photo vs editorial: both use a photo but with different layout structure', () => {
    // Both have a photo, but it is placed differently (full bleed vs circle mask),
    // and their overall kind-count profiles differ.
    const photoImg = photo.layers.find((l) => l.kind === 'photo')! as any;
    const edImg = editorial.layers.find((l) => l.kind === 'photo')! as any;
    expect(photoImg.mask ?? 'rect').not.toBe(edImg.mask);
    expect(kindCounts(photo)).not.toEqual(kindCounts(editorial));
  });

  it('each style draws from a distinct set of layer kinds', () => {
    // Illustrated is the only style using `path` + `ellipse` vector art; the photo/editorial
    // styles do not use path art. This guarantees the kind-SETS are not all identical.
    expect(kindSet(illustrated).has('path')).toBe(true);
    expect(kindSet(photo).has('path')).toBe(false);
    expect(kindSet(editorial).has('path')).toBe(false);
  });
});
