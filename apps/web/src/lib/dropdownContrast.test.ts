// Regression tests for the dark-mode dropdown readability fix + Add Cue terminology.
//
// The native <option> popup does not inherit the select's Tailwind text/bg utilities,
// so on Chrome/Windows it rendered white-on-white (invisible until hover). We added a
// global CSS rule giving options an explicit dark surface + light text (and amber for
// the checked/hover state). These tests read the shipped source so the rule can't be
// silently removed and the heading stays consistent with the "Add Cue" button.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(here, '../index.css');
const opportunitiesPath = resolve(here, '../pages/OpportunitiesPage.tsx');

function readCss() {
  return readFileSync(cssPath, 'utf8');
}

describe('global dropdown (select/option) dark-mode contrast rules', () => {
  const css = readCss();
  // Normalize whitespace for robust matching across formatting.
  const norm = css.replace(/\s+/g, ' ');

  it('declares color-scheme: dark on select (native popup renders dark)', () => {
    expect(norm).toMatch(/select\s*\{[^}]*color-scheme:\s*dark/);
  });

  it('styles option with an explicit non-white background and light text', () => {
    // Must set an option background (so it is not the OS default white) and a light color.
    expect(norm).toMatch(/select option\s*\{[^}]*background-color:\s*#1e293b[^}]*color:\s*#f1f5f9/i);
  });

  it('keeps the checked/hovered option readable (amber bg, dark text)', () => {
    expect(norm).toMatch(/select option:checked[^{]*,[^{]*select option:hover\s*\{[^}]*background-color:\s*#f59e0b[^}]*color:\s*#0f172a/i);
  });

  it('option background is NOT white (the bug being prevented)', () => {
    // Guard: ensure we never regress to a white option background.
    const optionBlock = norm.match(/select option\s*\{[^}]*\}/i)?.[0] || '';
    expect(optionBlock).not.toMatch(/background-color:\s*(#fff|#ffffff|white)\b/i);
  });
});

describe('Add Cue terminology consistency', () => {
  const src = readFileSync(opportunitiesPath, 'utf8');

  it('the add modal heading reads "+ Add Cue" (matches the button + submit)', () => {
    expect(src).toContain('>+ Add Cue</h3>');
    // And the old mismatched heading is gone.
    expect(src).not.toContain('>+ Add Lead</h3>');
  });
});
