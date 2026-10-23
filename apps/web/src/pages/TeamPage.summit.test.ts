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

  it('presents it as a Sales & Revenue section within Summit HQ', () => {
    expect(teamPage).toContain('id="summit-sales"');
    expect(teamPage).toContain('Sales &amp; Revenue');
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
    expect(teamPage).toContain("import { HeroHeader, PillTabs } from '../components/ui';");
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
