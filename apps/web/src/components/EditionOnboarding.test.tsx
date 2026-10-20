// Regression tests for the first-login "dark screen until click" onboarding bug.
//
// Root cause: the CRM-question overlay (EditionOnboarding) renders a dark
// `bg-black/70` backdrop with a dialog using `animate-scale-in`, whose `scaleIn`
// keyframe starts at opacity:0 with a `forwards` fill. When the animation's first
// frame isn't painted on mount (route/state transition timing), the dialog stayed
// invisible over the dark backdrop until an unrelated click forced a repaint.
//
// These tests pin:
//   1. The CRM question + both choices render on FIRST paint (no click), so the
//      content exists immediately when the overlay mounts.
//   2. The dark backdrop is never shown without its dialog content (same render).
//   3. index.css gives the entrance utilities an explicit opacity:1 resting state
//      (and a reduced-motion fallback), so content is visible even if the scale-in
//      animation is deferred/never runs — the actual fix for the dark screen.
//
// Uses react-dom/server (matching ConversationalSetup.test.tsx — no extra deps).

import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { sub: 'user-test', email: 'sam@example.com' } }),
}));
vi.mock('../contexts/EditionContext', () => ({
  useEdition: () => ({ setEdition: async () => true }),
}));
vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: () => {} }),
}));

import EditionOnboarding from './EditionOnboarding';

const here = dirname(fileURLToPath(import.meta.url));

function renderOverlay() {
  return renderToStaticMarkup(createElement(EditionOnboarding, { onDone: () => {} }));
}

describe('EditionOnboarding — CRM question visible on first paint (dark-screen fix)', () => {
  it('renders the CRM question immediately (no click required)', () => {
    const html = renderOverlay();
    expect(html).toContain('One quick question');
    expect(html).toContain('Do you already use a CRM');
  });

  it('renders BOTH choices and the decide-later option on first paint', () => {
    const html = renderOverlay();
    expect(html).toContain('Yes, I have a CRM');
    expect(html).toContain('No, set me up');
    // renderToStaticMarkup HTML-escapes the apostrophe, so match the escaped form.
    expect(html).toContain('decide later');
  });

  it('never shows the dark backdrop without the dialog content (same render pass)', () => {
    const html = renderOverlay();
    // The dark backdrop and the dialog are emitted together — the backdrop cannot
    // appear in a paint where the dialog text is absent.
    expect(html).toContain('bg-black/70');
    expect(html).toContain('animate-scale-in');
    expect(html).toContain('Do you already use a CRM');
  });
});

describe('entrance animations are paint-safe (index.css)', () => {
  const css = readFileSync(resolve(here, '../index.css'), 'utf8');

  it('gives .animate-scale-in an explicit opacity:1 resting state', () => {
    // The fix: the selector list that sets opacity:1 must include animate-scale-in.
    const match = css.match(/\.animate-scale-in[\s\S]{0,120}?opacity:\s*1/);
    expect(match, 'expected a base .animate-scale-in { opacity: 1 } rule in index.css').toBeTruthy();
  });

  it('includes a prefers-reduced-motion fallback that shows content', () => {
    expect(css).toContain('prefers-reduced-motion: reduce');
    // Within the reduced-motion block, scale-in should be forced visible.
    const idx = css.indexOf('prefers-reduced-motion: reduce');
    const block = css.slice(idx, idx + 400);
    expect(block).toContain('animate-scale-in');
    expect(block).toMatch(/opacity:\s*1\s*!important/);
  });
});
