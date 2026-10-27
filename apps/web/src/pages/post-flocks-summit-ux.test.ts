// Focused regression tests for the two post-launch UX improvements:
//   1) Daily Flocks: Create Post → Post to Groups → (preselect today's flocks); no
//      mandatory Post Type; Today dashboard quick-access card.
//   2) Summit HQ: Sales Tracker is the SALES-FIRST top section.
//
// Source-based assertions for the heavy context-bound pages (repo convention) + pure
// logic tests for createSession preselection.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createSession } from '../lib/massFlock';

const here = dirname(fileURLToPath(import.meta.url));
const contentPage = readFileSync(resolve(here, './ContentCreatorPage.tsx'), 'utf8');
const todayPage = readFileSync(resolve(here, './TodayPage.tsx'), 'utf8');
const teamPage = readFileSync(resolve(here, './TeamPage.tsx'), 'utf8');

// ─── Post Type is no longer mandatory ─────────────────────────────────────────
describe('Daily Flocks — Post Type never required', () => {
  it('Generate is NOT gated on postType (only platform selection)', () => {
    expect(contentPage).toContain('disabled={loading || platforms.length === 0}');
    expect(contentPage).not.toContain('disabled={loading || !postType || platforms.length === 0}');
  });

  it('the Post Type field is optional with an Auto default (no "Select post type..." block)', () => {
    expect(contentPage).toContain('Auto (recommended)');
    expect(contentPage).toContain('(optional)');
    expect(contentPage).not.toContain('Select post type...');
  });

  it('generation still resolves a safe default postType internally (backend never gets empty)', () => {
    expect(contentPage).toContain("postType?.trim() || 'Educational'");
  });
});

// ─── Create → Post to Groups handoff (prominent orange) + preselect ────────────
describe('Daily Flocks — Create → Post to Groups handoff', () => {
  it('shows a prominent ORANGE "Post to Groups →" CTA in the editor', () => {
    expect(contentPage).toContain('Post to Groups →');
    expect(contentPage).toContain('from-orange-500 to-amber-500');
  });

  it('carries into the EXISTING MassFlockPosting workflow (no new system)', () => {
    expect(contentPage).toContain('<MassFlockPosting');
    expect(contentPage).toContain('setShowMassFlock(true)');
  });

  it("preselects today's scheduled flocks via preselectGroupIds (still changeable)", () => {
    expect(contentPage).toContain('preselectGroupIds={');
    expect(contentPage).toContain('isFlockEvent(e) && !e.completed');
  });
});

// ─── Today dashboard quick-access card ─────────────────────────────────────────
describe("Today dashboard — Today's Flocks card", () => {
  it('renders a Today\u2019s Flocks card with remaining count + progress + start button', () => {
    expect(todayPage).toContain("Today's Flocks");
    expect(todayPage).toContain('group') /* "N groups remaining" */;
    expect(todayPage).toContain("Start Today's Flocks →");
  });

  it('the start button routes into the Create → Flocks flow', () => {
    expect(todayPage).toContain("navigate('/create')");
  });

  it('computes flock progress from the same calendar flock events (no new data)', () => {
    expect(todayPage).toContain('isFlockEvent(e)');
    expect(todayPage).toContain('const flockToday');
  });
});

// ─── MassFlockPosting preselect logic (pure) ───────────────────────────────────
describe('createSession — today\u2019s-flock preselection', () => {
  const groups = [
    { id: 'a', name: 'A', link: 'https://facebook.com/groups/a' },
    { id: 'b', name: 'B', link: 'https://facebook.com/groups/b' },
    { id: 'c', name: 'C', link: 'https://facebook.com/groups/c' },
    { id: 'd', name: 'D', link: '' }, // invalid link — never selectable
  ];

  it('defaults to ALL valid groups when no preselect is given (unchanged behavior)', () => {
    expect(createSession(groups).selectedIds).toEqual(['a', 'b', 'c']);
  });

  it('narrows the selection to the preselected (today\u2019s) groups', () => {
    expect(createSession(groups, ['b', 'c']).selectedIds).toEqual(['b', 'c']);
  });

  it('ignores invalid-link ids in the preselect', () => {
    expect(createSession(groups, ['a', 'd']).selectedIds).toEqual(['a']);
  });

  it('falls back to ALL valid groups if the preselect matches nothing (never empty)', () => {
    expect(createSession(groups, ['zzz']).selectedIds).toEqual(['a', 'b', 'c']);
  });
});

// ─── Summit HQ is sales-first ──────────────────────────────────────────────────
describe('Summit HQ — Sales Tracker is the top (sales-first) section', () => {
  it('renders the Sales section (summit-sales) BEFORE the Scoreboard section', () => {
    const salesIdx = teamPage.indexOf('id="summit-sales"');
    const scoreboardIdx = teamPage.indexOf('id="summit-scoreboard"');
    expect(salesIdx).toBeGreaterThan(-1);
    expect(scoreboardIdx).toBeGreaterThan(-1);
    expect(salesIdx).toBeLessThan(scoreboardIdx); // sales appears first in the DOM
  });

  it('opens focused on sales and leads the section nav with Sales Tracker', () => {
    expect(teamPage).toContain("useState<Tab>('sales')");
    expect(teamPage).toContain("label: '💰 Sales Tracker'");
  });

  it('keeps the full Sales experience embedded exactly once (no duplication)', () => {
    expect((teamPage.match(/<SalesDashboardPage \/>/g) || []).length).toBe(1);
  });

  it('labels the primary metric as Net New Business Premium, current folio', () => {
    expect(teamPage).toContain('Net New Business Premium');
  });
});
