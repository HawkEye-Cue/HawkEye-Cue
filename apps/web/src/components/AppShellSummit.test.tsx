// Regression tests for Summit automatic workspace activation — navigation + wiring.
//
// These pin the SOURCE wiring (the repo's test env is node/no-DOM, and AppShell pulls in
// many contexts), complementing the pure-logic tests in lib/summitAccess.test.ts:
//   • Summit HQ is PROMOTED into the primary nav only when isSummit is true.
//   • The legacy "Summit (Team)" More item is not duplicated when Summit HQ is primary.
//   • A one-time "Welcome to Summit" entry exists, gated per-user and hidden otherwise.
//   • Subscription/team transitions refresh Summit access so the nav updates without
//     a logout/login (checkout success, team create, accept invite, leave team).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appShell = readFileSync(resolve(here, './AppShell.tsx'), 'utf8');
const settings = readFileSync(resolve(here, '../pages/SettingsPage.tsx'), 'utf8');
const teamPage = readFileSync(resolve(here, '../pages/TeamPage.tsx'), 'utf8');
const summitCtx = readFileSync(resolve(here, '../contexts/SummitContext.tsx'), 'utf8');
const mainTsx = readFileSync(resolve(here, '../main.tsx'), 'utf8');

describe('AppShell — Summit HQ navigation promotion', () => {
  it('consumes app-wide Summit access', () => {
    expect(appShell).toContain("import { useSummit } from '../contexts/SummitContext';");
    expect(appShell).toContain('const { isSummit } = useSummit();');
  });

  it('defines a Summit HQ primary nav item and adds it only when isSummit', () => {
    expect(appShell).toContain("label: 'Summit HQ'");
    expect(appShell).toContain('const navItems = isSummit ? [...baseNavItems, summitNavItem] : baseNavItems;');
  });

  it('does not duplicate the team entry in the More menu when Summit HQ is primary', () => {
    expect(appShell).toContain("!(isSummit && i.path === '/team')");
  });
});

describe('AppShell — one-time Welcome to Summit entry', () => {
  it('is gated per-user via a localStorage flag', () => {
    expect(appShell).toContain('hawkeye_summit_welcomed_');
  });
  it('shows only for Summit users and only until dismissed', () => {
    expect(appShell).toContain('const showSummitWelcome = isSummit && !summitWelcomeDismissed && !showTour;');
  });
  it('renders the welcome CTA that routes into the team workspace', () => {
    expect(appShell).toContain('Welcome to Summit');
    expect(appShell).toContain('Enter Summit HQ');
    expect(appShell).toContain('onClick={dismissSummitWelcome}');
  });
});

describe('Summit access updates without logout/login (refresh wiring)', () => {
  it('SettingsPage refreshes Summit access after a successful checkout', () => {
    expect(settings).toContain("import { useSummit } from '../contexts/SummitContext';");
    expect(settings).toContain('const { refresh: refreshSummit } = useSummit();');
    expect(settings).toContain("if (checkoutStatus === 'success') {");
    const idx = settings.indexOf("if (checkoutStatus === 'success') {");
    expect(settings.slice(idx, idx + 120)).toContain('refreshSummit()');
  });

  it('TeamPage refreshes Summit access on create / accept / leave transitions', () => {
    expect(teamPage).toContain("import { useSummit } from '../contexts/SummitContext';");
    expect(teamPage).toContain('const { refresh: refreshSummit } = useSummit();');
    // Appears after create, accept-invite and leave.
    const occurrences = (teamPage.match(/refreshSummit\(\)/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });
});

describe('SummitProvider — mounted app-wide and fails closed', () => {
  it('is wired into the provider tree in main.tsx', () => {
    expect(mainTsx).toContain("import { SummitProvider } from './contexts/SummitContext';");
    expect(mainTsx).toContain('<SummitProvider>');
  });

  it('fetches subscription AND team, and fails closed if both reads fail', () => {
    expect(summitCtx).toContain("'GET', '/subscription'");
    expect(summitCtx).toContain("'GET', '/team'");
    expect(summitCtx).toContain('Promise.allSettled');
    expect(summitCtx).toContain("subRes.status === 'rejected' && teamRes.status === 'rejected'");
  });

  it('exposes a refresh() so callers can update access in place', () => {
    expect(summitCtx).toContain('refresh: () => Promise<void>');
  });
});
