// Regression tests for the onboarding fix (ConversationalSetup):
//   1. Initial visibility — the first question, the search input, and tappable
//      starter trades are present on first paint (no click required), on a
//      readable (non dark-on-dark) surface.
//   2. Plan information — a plan step clearly presents Nest Free / Soar $24.99 /
//      Summit $99.99 and explains the active 7-day trial + auto-return to Nest,
//      WITHOUT implying the cards change the server-side trial.
//   3. Onboarding navigation — the step order inserts the plan step right after
//      the business/trade question and preserves the existing steps.
//
// Initial-paint assertions use react-dom/server (matching CreateLauncher.test.tsx,
// no extra deps). Plan-copy and step-order assertions read the component source so
// we don't need to drive multi-step state without a DOM-interaction library.

import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ── Mock the contexts the component depends on (keeps render in-process) ──
vi.mock('../contexts/TradeContext', () => ({
  useTrade: () => ({
    selectedTrades: [],
    selectedTrade: null,
    setSelectedTrades: async () => {},
    toggleTrade: () => {},
  }),
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { sub: 'user-test', email: 'sam@example.com' },
    getToken: async () => 'token',
  }),
}));

import ConversationalSetup from './ConversationalSetup';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, './ConversationalSetup.tsx'), 'utf8');

function renderInitial() {
  return renderToStaticMarkup(
    createElement(ConversationalSetup, { onComplete: () => {}, onSkip: () => {} }),
  );
}

describe('ConversationalSetup — initial visibility (Issue 1)', () => {
  it('shows the first question immediately on first paint', () => {
    const html = renderInitial();
    expect(html).toContain('what kind of business do you run?');
  });

  it('renders a visible, searchable trade input with an accessible label', () => {
    const html = renderInitial();
    expect(html).toContain('aria-label="Search your trade"');
    expect(html).toContain('placeholder="e.g. Roofing, Insurance, Real Estate…"');
  });

  it('shows tappable starter trades before the user types anything', () => {
    const html = renderInitial();
    expect(html).toContain('Popular trades');
    // A few of the common quick-pick trades must be present with no input.
    expect(html).toContain('Roofing');
    expect(html).toContain('Insurance Agent');
    expect(html).toContain('Real Estate Agent');
  });

  it('uses readable surfaces, not pure black-on-black, on the setup screen', () => {
    const html = renderInitial();
    expect(html).toContain('bg-neutral-950'); // page background
    expect(html).toContain('bg-neutral-900'); // input surface
    // The previously problematic pure-black input surface must be gone.
    expect(html).not.toContain('bg-black border border-white/10');
  });
});

describe('ConversationalSetup — plan information (Issue 2)', () => {
  it('presents all three plans with correct prices', () => {
    expect(source).toContain('🪺 Nest');
    expect(source).toContain('Free');
    expect(source).toContain('🚀 Soar');
    expect(source).toContain('$24.99/mo');
    expect(source).toContain('🏔️ Summit');
    expect(source).toContain('$99.99/mo');
  });

  it('explains the active 7-day trial, no card required, auto-return to Nest', () => {
    expect(source).toContain('7-day Soar trial is active');
    expect(source).toContain('No payment method required');
    expect(source).toContain('moves to Nest (Free) unless you choose to subscribe');
  });

  it('does NOT imply the plan cards change the server-side trial', () => {
    // The plan cards are information-only; a comment documents this and there is no
    // subscribe/trial mutation wired to them in this component.
    expect(source).toContain('information only');
    expect(source).not.toContain('startTrial');
    expect(source).not.toContain('grantTrial');
  });

  it('gives an obvious way to continue with the existing trial', () => {
    expect(source).toContain('Continue with my Soar trial');
  });
});

describe('ConversationalSetup — onboarding navigation (order preserved)', () => {
  it('inserts the plan step right after the business/trade question', () => {
    const m = source.match(/const STEP_ORDER: StepId\[\] = \[([^\]]*)\]/);
    expect(m).toBeTruthy();
    const order = (m![1].match(/'([a-z]+)'/g) || []).map((s) => s.replace(/'/g, ''));
    expect(order[0]).toBe('business');
    expect(order[1]).toBe('plans');
    // Existing steps are all still present and in their original relative order.
    expect(order).toEqual(['business', 'plans', 'area', 'services', 'accounts', 'voice', 'ready']);
  });

  it('still completes onboarding (sets the onboarded flag on finish)', () => {
    expect(source).toContain("localStorage.setItem('hawkeye_onboarded', 'true')");
  });
});
