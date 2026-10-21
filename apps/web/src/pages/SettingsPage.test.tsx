// Regression tests for the "Soar checkout button missing" fix (SettingsPage).
//
// Bug: On a fresh Soar-trial sandbox account the Settings "Upgrade Plan" screen
// showed Soar as "Active" (because the account is mid-trial) with NO way to add a
// payment method / continue Soar after the trial. The Soar card's checkout button
// was gated by `!['growth','flight','base','soar','team','summit'].includes(currentTier)`,
// so for a trial user `currentTier === 'soar'` the button never rendered.
//
// Fix: introduce a dedicated gating flag `soarTrialNeedsPayment` that is true ONLY
// for a Soar-tier account that is on `status === 'trial'` with NO Stripe
// subscription (no `stripeCustomerId`), and render a "Continue Soar After Trial"
// button for exactly those users. The button calls handleUpgrade('soar') which
// opens Stripe TEST checkout; the backend pins trial_end to the existing trialEndsAt
// (no new 7 days, no duplicate subscription). Users WITH a live Stripe subscription
// are excluded (they manage billing via the portal).
//
// SettingsPage pulls in many contexts/hooks, so (matching ConversationalSetup.test.tsx)
// we assert against the component SOURCE for the gating logic and button copy, plus a
// small pure re-implementation of the gate to pin its truth table across tiers/states.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, './SettingsPage.tsx'), 'utf8');

// Pure re-implementation of the gate, kept in lockstep with SettingsPage.tsx.
// (Mirrors: soarTier && subscription?.status === 'trial' && !hasStripeSubscription.)
type Sub = { tier?: string; status?: string; stripeCustomerId?: string | null } | null;
function soarTrialNeedsPayment(subscription: Sub): boolean {
  const currentTier = subscription?.tier ?? 'free';
  const soarTier = ['growth', 'flight', 'base', 'soar'].includes(currentTier);
  const hasStripeSubscription = Boolean(subscription?.stripeCustomerId);
  return soarTier && subscription?.status === 'trial' && !hasStripeSubscription;
}

describe('SettingsPage — Soar trial checkout gate (truth table)', () => {
  it('(a) Soar trial + NO Stripe subscription → button shows', () => {
    expect(soarTrialNeedsPayment({ tier: 'soar', status: 'trial' })).toBe(true);
    // legacy tier aliases that normalize to Soar also qualify
    expect(soarTrialNeedsPayment({ tier: 'growth', status: 'trial' })).toBe(true);
    expect(soarTrialNeedsPayment({ tier: 'flight', status: 'trial' })).toBe(true);
    expect(soarTrialNeedsPayment({ tier: 'base', status: 'trial' })).toBe(true);
  });

  it('(b) Soar + active Stripe subscription (stripeCustomerId set) → button hidden', () => {
    expect(
      soarTrialNeedsPayment({ tier: 'soar', status: 'trial', stripeCustomerId: 'cus_123' }),
    ).toBe(false);
    // also hidden once the subscription is live/active (not a trial)
    expect(
      soarTrialNeedsPayment({ tier: 'soar', status: 'active', stripeCustomerId: 'cus_123' }),
    ).toBe(false);
  });

  it('(c) free / Nest tier → NOT this button (handled by the original Upgrade button)', () => {
    expect(soarTrialNeedsPayment(null)).toBe(false);
    expect(soarTrialNeedsPayment({ tier: 'free', status: 'trial' })).toBe(false);
    expect(soarTrialNeedsPayment({ tier: 'nest', status: 'trial' })).toBe(false);
  });

  it('(d) Summit / team tier → neither (not a Soar card)', () => {
    expect(soarTrialNeedsPayment({ tier: 'summit', status: 'trial' })).toBe(false);
    expect(soarTrialNeedsPayment({ tier: 'team', status: 'trial' })).toBe(false);
  });

  it('a non-trial Soar account (e.g. expired, no card) does NOT get the trial button', () => {
    // status must be 'trial'; an expired/paused account without a card is a different path.
    expect(soarTrialNeedsPayment({ tier: 'soar', status: 'expired' })).toBe(false);
  });
});

describe('SettingsPage — Soar card button wiring (source)', () => {
  it('defines the soarTrialNeedsPayment gate with the expected composition', () => {
    expect(source).toContain(
      "const soarTier = ['growth', 'flight', 'base', 'soar'].includes(currentTier);",
    );
    expect(source).toContain(
      'const hasStripeSubscription = Boolean(subscription?.stripeCustomerId);',
    );
    expect(source).toContain(
      "const soarTrialNeedsPayment = soarTier && subscription?.status === 'trial' && !hasStripeSubscription;",
    );
  });

  it('renders the Continue-Soar button only when soarTrialNeedsPayment is true', () => {
    expect(source).toContain('{soarTrialNeedsPayment && (');
  });

  it('the button opens Stripe checkout via handleUpgrade("soar")', () => {
    const idx = source.indexOf('{soarTrialNeedsPayment && (');
    expect(idx).toBeGreaterThan(-1);
    const block = source.slice(idx, idx + 600);
    expect(block).toContain("handleUpgrade('soar')");
  });

  it('labels the button to preserve the remaining trial days (no new 7-day trial implied)', () => {
    const idx = source.indexOf('{soarTrialNeedsPayment && (');
    const block = source.slice(idx, idx + 600);
    expect(block).toContain('Continue Soar After Trial');
    // Falls back to "Add Payment Method" when no days remain.
    expect(block).toContain('Add Payment Method');
  });
});
