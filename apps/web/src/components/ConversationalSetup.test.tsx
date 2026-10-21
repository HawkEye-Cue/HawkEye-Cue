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

describe('ConversationalSetup — final screen polish (premium branding)', () => {
  it('uses the realistic hawk brand image on the final screen, not a cartoon/emoji bird', () => {
    // The final "ready" screen must render the brand photo asset…
    expect(source).toContain('src="/hawk.jpg"');
    expect(source).toContain('alt="HawkEye-Cue"');
    // …and must NOT fall back to the cartoon eagle emoji on that screen. We scope the
    // check to the 'ready' block so other steps' emojis don't cause a false failure.
    const start = source.indexOf("{step === 'ready' && (");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("{step !== 'ready'", start);
    const block = source.slice(start, end === -1 ? start + 2000 : end);
    expect(block).not.toContain('🦅');
    expect(block).not.toContain('🔫');
  });

  it('uses the updated final-screen headline and subcopy', () => {
    expect(source).toContain('Your HawkEye-Cue is ready.');
    expect(source).toContain('Your next opportunity starts here.');
    // Old copy must be gone.
    expect(source).not.toContain('Your HawkEye is ready.');
    expect(source).not.toContain("Let's find your first opportunity.");
  });

  it('uses the updated primary button label (no emoji) and keeps the loading label', () => {
    expect(source).toContain('Enter HawkEye-Cue →');
    expect(source).not.toContain("Let's go 🦅");
    // Loading state preserved.
    expect(source).toContain('Getting your Nest ready…');
  });

  // Helper: extract the full JSX for the 'ready' step (from its render guard up to
  // the next sibling guard `{step !== 'ready'`), so slice-size never truncates copy.
  function readyBlock(): string {
    const start = source.indexOf("{step === 'ready' && (");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("{step !== 'ready'", start);
    return source.slice(start, end === -1 ? start + 2000 : end);
  }

  it('preserves the trade and location summary on the final screen', () => {
    const block = readyBlock();
    expect(block).toContain('chosenTrade');
    expect(block).toContain('🏷️ Trade:');
    expect(block).toContain('📍 Area:');
    expect(block).toContain('🎯 Focus:');
  });

  it('keeps the black/yellow/white branding on the final screen', () => {
    const block = readyBlock();
    // Yellow/amber accents + black button text (brand palette).
    expect(block).toContain('from-amber-500 to-yellow-400');
    expect(block).toContain('text-black');
    expect(block).toContain('text-white');
  });
});

describe('ConversationalSetup — product naming (HawkEye-Cue)', () => {
  it('refers to the product as "HawkEye-Cue" in user-facing onboarding copy', () => {
    expect(source).toContain("let's set up your HawkEye-Cue");
    expect(source).toContain('This helps HawkEye-Cue judge local opportunities.');
    expect(source).toContain('HawkEye-Cue uses your voice to draft responses');
  });

  it('has no bare "HawkEye" product references left in user-facing copy', () => {
    // Strip internal localStorage identifiers (hawkeye_*) which are NOT product copy,
    // then ensure no remaining "HawkEye" lacks the "-Cue" suffix.
    const withoutStorageKeys = source.replace(/hawkeye_[a-z0-9_${}?.]+/gi, '');
    const bareHawkEye = withoutStorageKeys.match(/HawkEye(?!-Cue)/g) || [];
    expect(bareHawkEye).toEqual([]);
  });
});
