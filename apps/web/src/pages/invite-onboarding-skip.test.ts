// Targeted regression tests: an invited employee with a pending team invite must skip
// normal business-owner onboarding and go straight to invitation acceptance.
//
// Matches the repo convention for these render-time gates (node env, source assertions +
// a pure re-implementation of the decision) — see TodayPage.routing.test.ts.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const todayPage = readFileSync(resolve(here, 'TodayPage.tsx'), 'utf8');
const dashboardPage = readFileSync(resolve(here, 'DashboardPage.tsx'), 'utf8');

describe('invited employee skips onboarding → invitation acceptance', () => {
  it('TodayPage routes a pending invite to /team?invite= BEFORE the onboarding redirect', () => {
    expect(todayPage).toContain('const pendingInvite = peekInvite();');
    expect(todayPage).toContain('if (needsOnboarding && pendingInvite) {');
    expect(todayPage).toContain('to={`/team?invite=${encodeURIComponent(pendingInvite)}`}');
    // The invite guard must appear before the generic onboarding redirect.
    expect(todayPage.indexOf('needsOnboarding && pendingInvite'))
      .toBeLessThan(todayPage.indexOf('<Navigate to="/onboarding" replace />'));
  });

  it('DashboardPage uses the same invite-first guard', () => {
    expect(dashboardPage).toContain('const pendingInvite = peekInvite();');
    expect(dashboardPage).toContain('if (needsOnboarding && pendingInvite) {');
    expect(dashboardPage.indexOf('needsOnboarding && pendingInvite'))
      .toBeLessThan(dashboardPage.indexOf('<Navigate to="/onboarding" replace />'));
  });
});

// Pure re-implementation of the gate decision for the four relevant states.
describe('onboarding gate decision with invites', () => {
  function destination(hasFlag: boolean, hasTrade: boolean, pendingInvite: string | null): string {
    const needsOnboarding = !hasFlag && !hasTrade;
    if (needsOnboarding && pendingInvite) return `/team?invite=${pendingInvite}`;
    if (needsOnboarding) return '/onboarding';
    return '/'; // render the page
  }

  it('new user WITH a pending invite → invitation acceptance (not onboarding)', () => {
    expect(destination(false, false, 'tok-123')).toBe('/team?invite=tok-123');
  });

  it('new user WITHOUT an invite → normal onboarding (unchanged)', () => {
    expect(destination(false, false, null)).toBe('/onboarding');
  });

  it('onboarded user (flag) renders normally; the invite guard only fires during onboarding', () => {
    // needsOnboarding is false, so neither the invite redirect nor onboarding fires.
    expect(destination(true, false, 'tok-123')).toBe('/');
    expect(destination(true, false, null)).toBe('/');
  });

  it('returning user with a saved trade is not bounced', () => {
    expect(destination(false, true, null)).toBe('/');
  });
});
