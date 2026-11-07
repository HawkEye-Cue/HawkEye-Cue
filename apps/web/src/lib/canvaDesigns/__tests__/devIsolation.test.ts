// Feature: canva-style-design-integration, Task 10.1: Dev prototype disposition (housekeeping)
// Validates: Requirements 2 (Template Fallback and Non-Regression)
//
// Decision applied (user): KEEP the development prototypes under `apps/web/src/dev/canva/` for
// now, but ensure they stay ISOLATED from the production/shipping path. Nothing is deleted;
// clean-up is deferred until the integration is fully verified.
//
// This is a lightweight guard test (no rendering, no network). It reads, with node fs, every
// TypeScript module on the SHIPPING Canva path plus the two production integration points
// (ContentCreatorPage.tsx, ImageSuggestions.tsx) and asserts none of them reference the dev
// prototype tree `src/dev/canva/`. If a production module ever starts importing the dev tree,
// this guard trips so the dev prototypes can never leak into the production bundle.
//
// Why a source scan: the dependency direction we require is dev -> lib (the dev harness may
// import the shipping engine for prototyping), NEVER lib/production -> dev. A source scan of the
// shipping path is the cheapest, most durable way to enforce that one-way boundary.
//
// Runs in the web app's default `node` vitest environment.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE_DIR = join(HERE, '..');          // apps/web/src/lib/canvaDesigns
const WEB_SRC = join(ENGINE_DIR, '..', '..'); // apps/web/src

// Every TypeScript module on the shipping Canva engine path. Kept in sync with the same list in
// noNetwork.test.ts — if a new engine module is added it should be listed in both places.
const ENGINE_MODULES = [
  'index.ts',
  'document.ts',
  'builder.ts',
  'fonts.ts',
  'inputs.ts',
  'kit.ts',
  'spec.ts',
  'insurancePhoto.ts',
  'insuranceIllustrated.ts',
  'insuranceEditorial.ts',
].map((f) => join(ENGINE_DIR, f));

// The two production integration points that wire the engine into Create.
const INTEGRATION_MODULES = [
  join(WEB_SRC, 'pages', 'ContentCreatorPage.tsx'),
  join(WEB_SRC, 'components', 'ImageSuggestions.tsx'),
];

const SHIPPING_MODULES = [...ENGINE_MODULES, ...INTEGRATION_MODULES];

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function label(path: string): string {
  // A short, stable label for assertion messages (relative to apps/web/src), normalized to '/'.
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.indexOf('/src/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

// Matches any reference to the dev prototype tree, in any import style or path separator:
//   '../../dev/canva', '../dev/canva', 'src/dev/canva', "dev/canva/registry", dev\canva, etc.
const DEV_CANVA_RE = /dev[\\/]canva/i;

describe('Task 10.1 · dev prototypes stay isolated from the shipping path (Req 2)', () => {
  it.each(SHIPPING_MODULES)('shipping module "%s" exists and is readable', (path) => {
    expect(read(path).length).toBeGreaterThan(0);
  });

  it.each(SHIPPING_MODULES)('shipping module "%s" does not reference the dev prototype tree', (path) => {
    const src = read(path);
    expect(
      DEV_CANVA_RE.test(src),
      `"${label(path)}" references the dev prototype tree (src/dev/canva) — the production/shipping path must stay isolated from the dev prototypes (Req 2)`,
    ).toBe(false);
  });
});
