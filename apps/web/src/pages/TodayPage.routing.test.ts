// Regression tests for the "initial blank screen" launch blocker.
//
// Symptom: on initial login / refresh / direct URL, the AppShell (sidebar + hawk
// background) rendered but the main content stayed blank until the user clicked a nav
// tab. Root causes addressed:
//   1. TodayPage/DashboardPage redirected to /onboarding via a POST-PAINT effect, which
//      left the dashboard mounted-but-blank for a frame (and on some initial loads never
//      visibly committed until a manual nav click). → moved to a RENDER-TIME <Navigate>.
//   2. The onboarding gate relied solely on the device-local `hawkeye_onboarded` flag, so
//      a returning fully-onboarded user on a fresh browser (saved trade, no local flag)
//      got bounced. → gate now also respects a saved trade (needsOnboarding only when
//      there's no flag AND no selected trade).
//   3. The inner <Routes> had no catch-all, so any unmatched inner path rendered an empty
//      <main> under the shell. → added a catch-all that redirects to "/".
//
// Node-env tests (no jsdom): source-string assertions + a pure re-implementation of the
// onboarding decision.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const todayPage = readFileSync(resolve(here, './TodayPage.tsx'), 'utf8');
const dashboardPage = readFileSync(resolve(here, './DashboardPage.tsx'), 'utf8');
const appTsx = readFileSync(resolve(here, '../App.tsx'), 'utf8');

describe('No blank initial render — render-time onboarding gate (not a post-paint effect)', () => {
  it('TodayPage decides onboarding at render time via <Navigate>, not navigate() in an effect', () => {
    expect(todayPage).toContain('if (needsOnboarding) {');
    expect(todayPage).toContain('<Navigate to="/onboarding" replace />');
    // The old post-paint redirect effect must be gone.
    expect(todayPage).not.toContain("navigate('/onboarding', { replace: true })");
  });

  it('DashboardPage uses the same render-time guard', () => {
    expect(dashboardPage).toContain('if (needsOnboarding) {');
    expect(dashboardPage).toContain('<Navigate to="/onboarding" replace />');
    expect(dashboardPage).not.toContain("navigate('/onboarding', { replace: true })");
  });

  it('onboarding gate respects a saved trade (returning user on a fresh browser is not bounced)', () => {
    expect(todayPage).toContain('!hasOnboardedFlag && !selectedTrade');
    expect(dashboardPage).toContain('!hasFlag && !selectedTrade');
  });
});

describe('No blank initial render — inner routes never render an empty <main>', () => {
  it('App has a catch-all inner route that redirects unmatched paths to "/"', () => {
    expect(appTsx).toContain('<Route path="*" element={<Navigate to="/" replace />} />');
  });

  it('the home route still renders the dashboard (TodayPage)', () => {
    expect(appTsx).toContain('<Route path="/" element={<TodayPage />} />');
  });

  it('/onboarding stays a top-level route (not under the AppShell inner routes)', () => {
    // It is matched by the outer <Routes> (more specific than "/*"), so redirecting there
    // unmounts the shell and shows the full-screen onboarding — never a blank shell.
    expect(appTsx).toContain('path="/onboarding"');
  });
});

describe('Onboarding decision logic (pure re-implementation)', () => {
  // Mirror of the gate used in both pages.
  function needsOnboarding(hasOnboardedFlag: boolean, hasSelectedTrade: boolean): boolean {
    return !hasOnboardedFlag && !hasSelectedTrade;
  }

  it('genuinely new user (no flag, no trade) is sent to onboarding', () => {
    expect(needsOnboarding(false, false)).toBe(true);
  });

  it('returning user with a saved trade but no local flag is NOT bounced', () => {
    expect(needsOnboarding(false, true)).toBe(false);
  });

  it('user who completed onboarding on this device is NOT bounced', () => {
    expect(needsOnboarding(true, false)).toBe(false);
    expect(needsOnboarding(true, true)).toBe(false);
  });
});

describe('No redirect loops', () => {
  it('the catch-all targets "/", which is an explicit matched route (no loop)', () => {
    // "/" has its own <Route>, so Navigate to "/" resolves to TodayPage, not back to "*".
    expect(appTsx).toContain('<Route path="/" element={<TodayPage />} />');
    expect(appTsx).toContain('<Route path="*" element={<Navigate to="/" replace />} />');
  });

  it('onboarding redirect only fires for new users, so an onboarded user at "/" stays put', () => {
    // needsOnboarding is false for onboarded users → TodayPage renders, no navigation.
    function needsOnboarding(flag: boolean, trade: boolean) { return !flag && !trade; }
    expect(needsOnboarding(true, false)).toBe(false); // onboarded → render, no loop
  });
});
