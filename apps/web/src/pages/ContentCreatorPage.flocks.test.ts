// Regression tests for Area 2: Create → Flocks inline handoff.
//
// Requirement: after a user writes/generates/improves a post and selects Facebook, a
// clearly visible "Post to My Flocks" entry appears inside Create that leads straight
// into the EXISTING Flocks Copy & Open workflow (MassFlockPosting) with the prepared
// post + image — reusing saved-groups storage, group selection, duplicate safeguards,
// and completed/missed tracking (no separate group-management system).
//
// We assert the SOURCE wiring (the page is large and context-heavy, matching the repo's
// established test pattern). The key safety properties: it reuses MassFlockPosting (not a
// new system), is gated on Facebook + a prepared post, and carries the prepared content.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, './ContentCreatorPage.tsx'), 'utf8');
const massFlock = readFileSync(resolve(here, '../components/MassFlockPosting.tsx'), 'utf8');

describe('Create → Flocks handoff (Area 2)', () => {
  it('reuses the existing MassFlockPosting workflow (no new group system)', () => {
    expect(source).toContain("import MassFlockPosting from '../components/MassFlockPosting';");
    expect(source).toContain('<MassFlockPosting');
  });

  it('surfaces a prominent "Start Today\u2019s Flocks" entry gated on Facebook + a prepared post', () => {
    // One-click orange "Start Today's Flocks →" CTA.
    expect(source).toContain("Start Today's Flocks →");
    expect(source).toContain("{platforms.includes('facebook') && platformContent && (");
  });

  it('the entry opens the Copy & Open workflow (setShowMassFlock)', () => {
    // Anchor on the unique gating condition and scan the whole entry block.
    const idx = source.indexOf("{platforms.includes('facebook') && platformContent && (");
    expect(idx).toBeGreaterThan(-1);
    const block = source.slice(idx, idx + 1600);
    expect(block).toContain('setShowMassFlock(true)');
    expect(block).toContain("Start Today's Flocks →");
  });

  it('carries the prepared post content into MassFlockPosting via getPreparedContent', () => {
    expect(source).toContain('getPreparedContent={() => (platformContent ? (Object.values(platformContent)[0]');
    expect(source).toContain('readyImageSrc={readyImageSrc}');
    expect(source).toContain('safety={flockSafety}');
  });

  it('nudges the user to add groups first when none are saved (no dead-end)', () => {
    const idx = source.indexOf("{platforms.includes('facebook') && platformContent && (");
    const block = source.slice(idx, idx + 1800);
    expect(block).toContain('savedGroupCount === 0');
    expect(block).toContain('setShowFlockManager(true)');
  });
});

describe('Flocks safeguards preserved (MassFlockPosting reused unchanged)', () => {
  it('still reads the SAME saved-groups and history stores', () => {
    expect(massFlock).toContain('hawkeye_flock_groups_');
    expect(massFlock).toContain('hawkeye_post_history_');
  });

  it('keeps the duplicate / recently-posted safeguards and rule evaluation', () => {
    expect(massFlock).toContain('recentlyPostedWarning');
    expect(massFlock).toContain('evaluateGroupRules');
    expect(massFlock).toContain('recordConfirmedPost');
  });

  it('opening a group never auto-marks posted (manual confirm only)', () => {
    // Explicit confirm action is required; opening only copies+opens.
    expect(massFlock).toContain('confirmPostedAndNext');
    expect(massFlock).toContain('Opening the group does NOT mark it posted');
  });
});
