// Feature: canva-style-design-integration, Task 7.1: License manifest + production-safe imagery
// Validates: Requirements 8 (Production-Safe Assets)
//
// Lightweight guard test: reads the shipped asset directories with node fs and asserts that
//   - every non-manifest photo file has a LICENSES.json entry with a documented source + a
//     commercial-use license, and is flagged as free of identifiable people / private property;
//   - every font file ships alongside a license file for its family.
// This is a static-asset integrity check (no rendering, no network).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, '..', 'assets');
const PHOTOS_DIR = join(ASSETS, 'photos');
const FONTS_DIR = join(ASSETS, 'fonts');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif']);
const FONT_EXTS = new Set(['.woff2', '.woff', '.ttf', '.otf']);

// Licenses accepted as permitting commercial use + redistribution for shipped imagery.
const COMMERCIAL_USE_LICENSES = [
  /\bcc0\b/i,
  /public\s*domain/i,
  /cc[\s-]?by(?:[\s-]?sa)?\b/i, // CC BY / CC BY-SA (attribution tracked in the manifest)
];

interface PhotoLicense {
  file: string;
  license?: string;
  sourcePage?: string;
  source?: string;
  commonsTitle?: string;
  description?: string;
  peopleVisible?: string;
  identifiableProperty?: string;
  productionSafe?: boolean;
  [k: string]: unknown;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name);
}

function loadManifest(): PhotoLicense[] {
  const raw = readFileSync(join(PHOTOS_DIR, 'LICENSES.json'), 'utf8').replace(/^\uFEFF/, '');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function hasCommercialLicense(license: string | undefined): boolean {
  if (!license || !license.trim()) return false;
  return COMMERCIAL_USE_LICENSES.some((re) => re.test(license));
}

function looksLikeIdentifiablePrivate(entry: PhotoLicense): boolean {
  const people = String(entry.peopleVisible ?? '').toLowerCase();
  const property = String(entry.identifiableProperty ?? '').toLowerCase();
  // Treat anything that is not an explicit "none/no" as ambiguous -> flag it.
  const peopleOk = people === '' || /^(none|no)\b/.test(people) || people.includes('no identifiable');
  const propertyOk = property === '' || /^(no|none)\b/.test(property);
  return !peopleOk || !propertyOk;
}

describe('canva asset licenses (Requirement 8)', () => {
  const manifest = loadManifest();
  const byFile = new Map(manifest.map((e) => [e.file, e]));
  const photoFiles = listFiles(PHOTOS_DIR).filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()));

  it('ships at least one photo and a manifest', () => {
    expect(photoFiles.length).toBeGreaterThan(0);
    expect(manifest.length).toBeGreaterThan(0);
  });

  it.each(photoFiles)('photo "%s" has a manifest entry with a documented source', (file) => {
    const entry = byFile.get(file);
    expect(entry, `No LICENSES.json entry for shipped photo "${file}"`).toBeDefined();
    const source = entry!.sourcePage || entry!.source || entry!.commonsTitle;
    expect(
      typeof source === 'string' && source.trim().length > 0,
      `Photo "${file}" is missing a documented source in LICENSES.json`
    ).toBe(true);
  });

  it.each(photoFiles)('photo "%s" has a commercial-use license', (file) => {
    const entry = byFile.get(file)!;
    expect(
      hasCommercialLicense(entry.license),
      `Photo "${file}" license "${entry?.license ?? '(none)'}" is not a recognized commercial-use license`
    ).toBe(true);
  });

  it.each(photoFiles)(
    'photo "%s" is not identifiable private property or recognizable people',
    (file) => {
      const entry = byFile.get(file)!;
      expect(
        looksLikeIdentifiablePrivate(entry),
        `Photo "${file}" may depict identifiable people/private property ` +
          `(peopleVisible="${entry.peopleVisible}", identifiableProperty="${entry.identifiableProperty}") ` +
          `- manual review required`
      ).toBe(false);
    }
  );

  it('every manifest entry points at a real shipped file', () => {
    const present = new Set(photoFiles);
    const orphans = manifest.map((e) => e.file).filter((f) => !present.has(f));
    expect(orphans, `Manifest references missing files: ${orphans.join(', ')}`).toEqual([]);
  });
});

describe('canva font licenses (Requirement 8)', () => {
  const allFiles = listFiles(FONTS_DIR);
  const fontFiles = allFiles.filter((f) => FONT_EXTS.has(extname(f).toLowerCase()));
  const licenseFiles = allFiles.filter((f) => /^license/i.test(f));

  it('ships font files', () => {
    expect(fontFiles.length).toBeGreaterThan(0);
  });

  // A font file's "family" is the leading token before the first style/weight hyphen.
  const familyOf = (f: string): string => f.toLowerCase().split('-')[0];

  it.each(fontFiles)('font "%s" has a matching license file for its family', (file) => {
    const family = familyOf(file);
    const match = licenseFiles.some((lic) => lic.toLowerCase().includes(family));
    expect(
      match,
      `Font "${file}" (family "${family}") ships without a license file. ` +
        `Available license files: ${licenseFiles.join(', ') || '(none)'}`
    ).toBe(true);
  });
});
