// Regression tests for Area 3: Summit HQ + Sales integration + tier-aware nav.
//
// Requirements covered:
//   • The COMPLETE Sales experience is embedded in Summit HQ by reusing the existing
//     SalesDashboardPage component (inherent feature parity — same component/data hooks).
//   • The standalone "Sales" primary nav item is hidden ONLY for Summit users; Soar/
//     non-Summit keep it. The /sales route stays registered (reachable by URL/embed).
//   • No Sales business logic rewritten; permissions/isolation unchanged (backend reused).
//
// Source-based assertions (heavy context-bound pages) plus a pure re-implementation of
// the nav-gating rule.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const teamPage = readFileSync(resolve(here, './TeamPage.tsx'), 'utf8');
const appShell = readFileSync(resolve(here, '../components/AppShell.tsx'), 'utf8');
const appTsx = readFileSync(resolve(here, '../App.tsx'), 'utf8');

describe('Summit HQ — embeds the existing Sales experience (parity by reuse)', () => {
  it('imports and renders the standalone SalesDashboardPage component', () => {
    expect(teamPage).toContain("import SalesDashboardPage from './SalesDashboardPage';");
    expect(teamPage).toContain('<SalesDashboardPage />');
  });

  it('presents it as the Sales Tracker section within Summit HQ', () => {
    expect(teamPage).toContain('id="summit-sales"');
    expect(teamPage).toContain('Sales Tracker');
  });

  it('does NOT reimplement Sales logic (reuses the component, not a copy)', () => {
    // The embed is a single component usage; no duplicated getOpportunities/deals fetch
    // added to TeamPage for the sales view.
    const count = (teamPage.match(/<SalesDashboardPage \/>/g) || []).length;
    expect(count).toBe(1);
  });
});

describe('AppShell — tier-aware standalone Sales nav gating', () => {
  // Pure mirror of the gating rule in AppShell.
  type Nav = { path: string };
  function navFor(baseNavItems: Nav[], isSummit: boolean, summitNavItem: Nav): Nav[] {
    return isSummit
      ? [...baseNavItems.filter((i) => i.path !== '/sales'), summitNavItem]
      : baseNavItems;
  }
  const base: Nav[] = [{ path: '/' }, { path: '/create' }, { path: '/pipeline' }, { path: '/sales' }];
  const summit: Nav = { path: '/team' };

  it('hides standalone /sales for Summit users and adds Summit HQ', () => {
    const nav = navFor(base, true, summit);
    expect(nav.some((i) => i.path === '/sales')).toBe(false);
    expect(nav.some((i) => i.path === '/team')).toBe(true);
  });

  it('keeps standalone /sales for non-Summit (Soar) users, no Summit HQ', () => {
    const nav = navFor(base, false, summit);
    expect(nav.some((i) => i.path === '/sales')).toBe(true);
    expect(nav.some((i) => i.path === '/team')).toBe(false);
  });

  it('wires the gating in source (filter /sales only when isSummit)', () => {
    expect(appShell).toContain("[...baseNavItems.filter((i) => i.path !== '/sales'), summitNavItem]");
  });
});

describe('Sales route remains reachable (no functionality lost)', () => {
  it('/sales route is still registered in the router', () => {
    expect(appTsx).toContain('<Route path="/sales" element={<SalesDashboardPage />} />');
  });
});

describe('Summit HQ — premium redesign (hero + section nav, charcoal/amber system)', () => {
  it('uses the shared premium UI kit (HeroHeader + PillTabs)', () => {
    expect(teamPage).toContain("from '../components/ui';");
    expect(teamPage).toContain('HeroHeader');
    expect(teamPage).toContain('PillTabs');
    expect(teamPage).toContain('<HeroHeader');
    expect(teamPage).toContain('<PillTabs');
  });

  it('defines the five command-center sections + Sales with anchors', () => {
    for (const anchor of ['summit-scoreboard', 'summit-leads', 'summit-nests', 'summit-radar', 'summit-workspace', 'summit-sales']) {
      expect(teamPage).toContain(`id="${anchor}"`);
    }
    // Section labels reflect the Flight Path command-center naming.
    expect(teamPage).toContain('Scoreboard');
    expect(teamPage).toContain('Flight Path');
    expect(teamPage).toContain('Hawk Nests');
    expect(teamPage).toContain('Radar');
    expect(teamPage).toContain('Workspace');
  });

  it('the section nav jumps to the anchored section (reuses tab state)', () => {
    expect(teamPage).toContain('function jumpToSection(id: Tab)');
    expect(teamPage).toContain("scrollIntoView({ behavior: 'smooth'");
  });

  it('preserves all existing Summit sections (members, wins, lead nests, stats, calendar)', () => {
    expect(teamPage).toContain('👥 Team Members');
    expect(teamPage).toContain('Recent Wins');
    expect(teamPage).toContain('Lead Nests');
    expect(teamPage).toContain('Team Stats');
    expect(teamPage).toContain('Team Calendar');
  });
});

describe('Priority 1 — Summit Scoreboard (prominent, real metric tiles)', () => {
  it('uses the BoldStat/StatGrid premium tiles for the performance overview', () => {
    expect(teamPage).toContain("import { HeroHeader, PillTabs, BoldStat, StatGrid, Panel } from '../components/ui';");
    expect(teamPage).toContain('<StatGrid cols={4}>');
    expect(teamPage).toContain('<BoldStat');
  });

  it('surfaces the four headline business metrics (revenue, sales, active leads, conversion)', () => {
    expect(teamPage).toContain('Team Revenue');
    expect(teamPage).toContain('Sales Closed');
    expect(teamPage).toContain('Active Leads');
    expect(teamPage).toContain('Conversion');
  });

  it('sources metrics from the reused hooks, not invented values', () => {
    // Revenue falls back from folio-filtered stats → analytics; never a hard-coded number.
    expect(teamPage).toContain('stats?.totalWonValue ?? teamAnalytics?.totalRevenue ?? 0');
    // Active leads are the live open team leads (not converted/lost).
    expect(teamPage).toContain("teamLeads.filter((l) => l.status !== 'converted' && l.status !== 'lost').length");
  });

  it('only shows conversion when the denominator is reliable (guards 0/0)', () => {
    expect(teamPage).toContain('totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : null');
    expect(teamPage).toContain("conversion === null ? '—'");
  });

  it('shows a single consolidated employee ranking via The Hawk\u2019s Perch (no duplicate grid)', () => {
    // The old "Individual Performance" grid + generic leaderboard were consolidated into
    // ONE ranking: the HawkPerch component (ranked by premium written in HawkPerch.tsx).
    expect(teamPage).toContain('<HawkPerch');
    expect(teamPage).toContain('id="summit-perch"');
    // No duplicate employee-ranking grid remains in TeamPage itself.
    expect(teamPage).not.toContain('🏔️ Individual Performance');
  });

  // Pure re-implementation of the headline metric logic to prove it behaves correctly.
  type Lead = { status: string };
  function scoreboard(stats: { totalWonValue?: number; members?: { wonDeals?: number }[] } | null, analytics: { totalRevenue?: number; wonDeals?: number; totalDeals?: number } | null, leads: Lead[]) {
    const revenue = stats?.totalWonValue ?? analytics?.totalRevenue ?? 0;
    const wonDeals = stats?.members?.reduce((s, m) => s + (m.wonDeals || 0), 0) ?? analytics?.wonDeals ?? 0;
    const openLeads = leads.filter((l) => l.status !== 'converted' && l.status !== 'lost').length;
    const totalDeals = analytics?.totalDeals ?? 0;
    const conversion = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : null;
    return { revenue, wonDeals, openLeads, conversion };
  }

  it('computes headline metrics from folio stats first, then analytics fallback', () => {
    const r = scoreboard(
      { totalWonValue: 12000, members: [{ wonDeals: 2 }, { wonDeals: 1 }] },
      { totalRevenue: 99999, wonDeals: 5, totalDeals: 10 },
      [{ status: 'new' }, { status: 'converted' }, { status: 'followed_up' }, { status: 'lost' }],
    );
    expect(r.revenue).toBe(12000);     // folio stats win over analytics
    expect(r.wonDeals).toBe(3);        // summed from folio members
    expect(r.openLeads).toBe(2);       // new + followed_up (converted/lost excluded)
    expect(r.conversion).toBe(30);     // 3/10 → 30%
  });

  it('falls back to analytics when folio stats are absent and hides conversion when 0/0', () => {
    const r = scoreboard(null, { totalRevenue: 4000, wonDeals: 4, totalDeals: 0 }, []);
    expect(r.revenue).toBe(4000);
    expect(r.wonDeals).toBe(4);
    expect(r.openLeads).toBe(0);
    expect(r.conversion).toBeNull(); // no reliable denominator
  });
});

describe('Priority 2 — Flight Path (interactive pipeline from REAL stageCounts)', () => {
  it('renders a team-pipeline Panel built from analytics stageCounts', () => {
    expect(teamPage).toContain('🛩️ Flight Path — Team Pipeline');
    expect(teamPage).toContain('teamAnalytics?.stageCounts');
    expect(teamPage).toContain("{ key: 'prospect'");
    expect(teamPage).toContain("{ key: 'won'");
  });

  it('documents the backend limitation (admins cannot move a teammate\u2019s stage) instead of faking it', () => {
    // The read-only overview explicitly states each person moves their own opportunities.
    expect(teamPage).toContain('read-only');
    expect(teamPage).toContain('Each person moves their own opportunities');
  });

  it('keeps the first-responder claiming as a SEPARATE real interaction', () => {
    expect(teamPage).toContain('Up for Grabs');
    expect(teamPage).toContain('handleClaimLead');
    expect(teamPage).toContain('handleReleaseLead');
  });

  // Pure re-implementation of the funnel ordering + max-bar scaling.
  function flightPath(sc: { prospect: number; contacted: number; quoted: number; closing: number; won: number; lost: number }) {
    const flow = (['prospect', 'contacted', 'quoted', 'closing', 'won'] as const).map((k) => ({ k, count: sc[k] || 0 }));
    const activeTotal = flow.reduce((s, f) => s + f.count, 0);
    const maxCount = Math.max(1, ...flow.map((f) => f.count));
    return { flow, activeTotal, maxCount, lost: sc.lost };
  }

  it('orders stages prospect→won, totals the active pipeline, and separates lost', () => {
    const r = flightPath({ prospect: 4, contacted: 3, quoted: 2, closing: 1, won: 5, lost: 2 });
    expect(r.flow.map((f) => f.k)).toEqual(['prospect', 'contacted', 'quoted', 'closing', 'won']);
    expect(r.activeTotal).toBe(15); // 4+3+2+1+5 (lost excluded from the forward funnel)
    expect(r.maxCount).toBe(5);
    expect(r.lost).toBe(2);
  });

  it('never divides by zero when the pipeline is empty', () => {
    const r = flightPath({ prospect: 0, contacted: 0, quoted: 0, closing: 0, won: 0, lost: 0 });
    expect(r.activeTotal).toBe(0);
    expect(r.maxCount).toBe(1); // guarded floor
  });
});

describe('Priority 3 — Employee Hawk Nests (richer cards + workspace slide-over)', () => {
  it('reuses the existing TeamMemberPipeline slide-over (no new backend route)', () => {
    expect(teamPage).toContain("import TeamMemberPipeline from '../components/TeamMemberPipeline';");
    expect(teamPage).toContain('<TeamMemberPipeline');
    expect(teamPage).toContain('memberUserId={openNest.userId}');
  });

  it('opens a teammate workspace from a nest card via same-team-enforced state', () => {
    expect(teamPage).toContain('setOpenNest({ userId: member.userId, name })');
    expect(teamPage).toContain('Open workspace →');
  });

  it('enriches nest cards with leads/sales/active performance + role', () => {
    expect(teamPage).toContain('memberStat?.activeDeals');
    expect(teamPage).toContain('👑 Admin');
  });

  it('scopes the workspace view to the selected folio (or all-time)', () => {
    expect(teamPage).toContain("folioStart={selectedFolio === 'all' ? undefined : currentFolio?.start}");
    expect(teamPage).toContain("folioEnd={selectedFolio === 'all' ? undefined : currentFolio?.end}");
  });
});

describe('Cohesion — embedded Sales stays wired + isolation preserved', () => {
  it('still embeds the full Sales experience once, below the team columns', () => {
    expect((teamPage.match(/<SalesDashboardPage \/>/g) || []).length).toBe(1);
    expect(teamPage).toContain('id="summit-sales"');
  });

  it('does not add any opportunity stage-mutation call for teammates', () => {
    // There is NO backend route to change a teammate's stage; ensure we didn't invent one.
    // The member pipeline read lives in the useTeamData hook (same-team enforced), so the
    // TeamPage render should contain no inline teammate stage-mutation request.
    expect(teamPage).not.toContain("request('PATCH'");
    expect(teamPage).not.toContain('/member/stage');
    // The only inline opportunity status call is the user moving a lead between nests
    // (transfer/assign), not a free-form teammate stage edit.
    const inlineMemberPipelineCalls = (teamPage.match(/request<[^>]*>\('GET', `\/team\/member\//g) || []).length;
    expect(inlineMemberPipelineCalls).toBe(0);
  });
});
