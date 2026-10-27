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
  it('shows a prominent ORANGE "Post to My Flocks →" CTA in the editor', () => {
    expect(contentPage).toContain('Post to My Flocks →');
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

// ─── Create studio opens ready ─────────────────────────────────────────────────
describe('Create — unified studio opens with the editor ready', () => {
  it('defaults the view to the post editor (not the three-card launcher)', () => {
    expect(contentPage).toContain("useState<CreateView>('post')");
  });
  it('opens the composer by default (showCreator starts true)', () => {
    expect(contentPage).toContain('const [showCreator, setShowCreator] = useState(true)');
  });
  it('rebrands the studio header to charcoal/amber (no blue/purple gradient)', () => {
    expect(contentPage).toContain('Content Studio — write your post');
    expect(contentPage).not.toContain('from-blue-600/20 to-purple-600/20');
  });
});

// ─── The Hawk's Perch leaderboard ──────────────────────────────────────────────
describe("Summit HQ — The Hawk's Perch consolidated leaderboard", () => {
  it('renders HawkPerch in its own section below the sales graph', () => {
    expect(teamPage).toContain("import HawkPerch from '../components/HawkPerch';");
    expect(teamPage).toContain('<HawkPerch');
    const perchIdx = teamPage.indexOf('id="summit-perch"');
    const salesIdx = teamPage.indexOf('id="summit-sales"');
    expect(perchIdx).toBeGreaterThan(salesIdx); // perch after the sales graph
  });
  it('removes the old duplicate rankings (Individual Performance grid + Team-Stats leaderboard)', () => {
    expect(teamPage).not.toContain('🏔️ Individual Performance');
    expect(teamPage).not.toContain('🏆 Leaderboard');
  });
  it('labels reporting periods clearly (folio vs year-to-date)', () => {
    expect(teamPage).toContain('Premium written year-to-date');
    expect(teamPage).toMatch(/Premium \(This Folio\)|Premium \(All Time\)/);
  });
});

// ─── Team Operations tabs + collapsible Team Settings ──────────────────────────
describe('Summit HQ — Team Operations tabs (one section at a time)', () => {
  it('defines an opsTab state with the four operations sections', () => {
    expect(teamPage).toContain("type OpsTab = 'leads' | 'pipeline' | 'calendar' | 'workspace'");
    expect(teamPage).toContain("useState<OpsTab>('leads')");
  });
  it('renders an Operations tab bar (Leads/Pipeline/Calendar/Workspace)', () => {
    for (const label of ['🪺 Leads', '🛩️ Pipeline', '🗓️ Calendar', '📊 Workspace']) {
      expect(teamPage).toContain(label);
    }
  });
  it('gates each operations section on the active tab (only one shows at a time)', () => {
    expect(teamPage).toContain("hidden={opsTab !== 'pipeline'}"); // Flight Path
    expect(teamPage).toContain("hidden={opsTab !== 'leads'}");    // Lead Nests
    expect(teamPage).toContain("hidden={opsTab !== 'calendar'}"); // Calendar
    expect(teamPage).toContain("stats && opsTab === 'workspace'"); // Team Stats
  });
});

describe('Summit HQ — collapsible Team Settings (collapsed by default)', () => {
  it('has a Team Settings toggle, collapsed by default', () => {
    expect(teamPage).toContain('const [showTeamSettings, setShowTeamSettings] = useState(false)');
    expect(teamPage).toContain('Team Settings');
  });
  it('gates Team Members / invitations behind the toggle', () => {
    expect(teamPage).toContain('{showTeamSettings && (');
    // The members + invite controls are preserved inside (not removed).
    expect(teamPage).toContain('👥 Team Members');
    expect(teamPage).toContain('Save Names & Colors');
    expect(teamPage).toContain('handleInvite');
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
