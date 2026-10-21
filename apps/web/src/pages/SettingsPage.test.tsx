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
// (Mirrors: subStatusKnown && soarTier && status === 'trial' && !hasStripeSubscription.)
type Sub = { tier?: string; status?: string; stripeCustomerId?: string | null } | null;
function soarTrialNeedsPayment(subscription: Sub, subStatusKnown = true): boolean {
  if (!subStatusKnown) return false;
  const currentTier = subscription?.tier ?? 'free';
  const soarTier = ['growth', 'flight', 'base', 'soar'].includes(currentTier);
  const hasStripeSubscription = Boolean(subscription?.stripeCustomerId);
  return soarTier && subscription?.status === 'trial' && !hasStripeSubscription;
}

// Mirrors the fail-closed derived flags in SettingsPage:
//   subStatusKnown = !subLoading && !subError
//   trialEligible  = subStatusKnown && !everTrialed && !stripeCustomerId
//   checkoutDisabled = !subStatusKnown || loadingTier !== null
function subStatusKnown(subLoading: boolean, subError: string | null): boolean {
  return !subLoading && !subError;
}
function trialEligible(subscription: Sub, subLoading: boolean, subError: string | null): boolean {
  const known = subStatusKnown(subLoading, subError);
  const everTrialed = Boolean((subscription as any)?.trialEndsAt);
  const hasCustomer = Boolean(subscription?.stripeCustomerId);
  return known && !everTrialed && !hasCustomer;
}
function checkoutDisabled(subLoading: boolean, subError: string | null, loadingTier: string | null): boolean {
  return !subStatusKnown(subLoading, subError) || loadingTier !== null;
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
      "const soarTrialNeedsPayment = subStatusKnown && soarTier && subscription?.status === 'trial' && !hasStripeSubscription;",
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

describe('SettingsPage — fail closed when subscription status is unknown', () => {
  // Bug: a failed GET /subscription (e.g. "Failed to fetch"/CORS/401) left subscription
  // null with no error flag, so the UI fell back to free-tier defaults and FALSELY
  // advertised a fresh 7-day trial + showed "Upgrade" instead of "Continue Soar After
  // Trial" for an account that already had an active trial. Status must fail closed.

  it('status is NOT known while loading', () => {
    expect(subStatusKnown(true, null)).toBe(false);
  });

  it('status is NOT known after a failed load (error set)', () => {
    expect(subStatusKnown(false, 'Couldn\'t load your plan: Failed to fetch')).toBe(false);
  });

  it('status IS known only after a successful load', () => {
    expect(subStatusKnown(false, null)).toBe(true);
  });

  it('NEVER advertises a fresh trial while loading or after an error', () => {
    // Even with a free-looking (null) subscription, a pending/errored load must not
    // advertise the 7-day trial.
    expect(trialEligible(null, true, null)).toBe(false); // loading
    expect(trialEligible(null, false, 'Failed to fetch')).toBe(false); // errored
    // Only a verified, never-trialed, card-less account is eligible.
    expect(trialEligible(null, false, null)).toBe(true);
  });

  it('does NOT advertise a fresh trial to an account that already trialed, once known', () => {
    expect(trialEligible({ tier: 'soar', status: 'trial', ...( { trialEndsAt: '2026-10-27T00:00:00Z' } as any) }, false, null)).toBe(false);
  });

  it('hides the Continue-Soar button until status is known (even for a real trial)', () => {
    const trialSub: Sub = { tier: 'soar', status: 'trial' };
    expect(soarTrialNeedsPayment(trialSub, false)).toBe(false); // status unknown → hidden
    expect(soarTrialNeedsPayment(trialSub, true)).toBe(true); // known → shown
  });

  it('disables checkout while loading or errored, enables only when known & idle', () => {
    expect(checkoutDisabled(true, null, null)).toBe(true); // loading
    expect(checkoutDisabled(false, 'err', null)).toBe(true); // errored
    expect(checkoutDisabled(false, null, 'soar')).toBe(true); // a checkout already in flight
    expect(checkoutDisabled(false, null, null)).toBe(false); // known + idle → enabled
  });
});

describe('SettingsPage — error/retry wiring + handleUpgrade guard (source)', () => {
  it('tracks a distinct subscription-error state', () => {
    expect(source).toContain('const [subError, setSubError] = useState<string | null>(null);');
  });

  it('derives subStatusKnown from a successful (non-error) finished load', () => {
    expect(source).toContain('const subStatusKnown = !subLoading && !subError;');
  });

  it('treats a 404 as "no record yet" (known) but any other failure as unknown', () => {
    expect(source).toContain('if (status === 404)');
    expect(source).toContain('setSubError(');
  });

  it('gates trialEligible and soarTrialNeedsPayment on subStatusKnown', () => {
    expect(source).toContain('const trialEligible = subStatusKnown && !everTrialed && !subscription?.stripeCustomerId;');
    expect(source).toContain('const soarTrialNeedsPayment = subStatusKnown && soarTier');
  });

  it('defines checkoutDisabled and uses it on the checkout buttons', () => {
    expect(source).toContain('const checkoutDisabled = !subStatusKnown || loadingTier !== null;');
    expect(source).toContain('disabled={checkoutDisabled}');
  });

  it('renders an error banner with a Retry action that re-fetches', () => {
    expect(source).toContain('{subError && (');
    expect(source).toContain('onClick={fetchSubscription}');
    expect(source).toContain('Retry');
  });

  it('handleUpgrade refuses to start checkout while status is unverified', () => {
    const idx = source.indexOf('async function handleUpgrade');
    const block = source.slice(idx, idx + 500);
    expect(block).toContain('if (subLoading || subError)');
    expect(block).toContain('return;');
  });
});
