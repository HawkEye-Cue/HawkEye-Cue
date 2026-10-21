// Regression tests for the "dark overlay with no visible dialog after onboarding" bug.
//
// Root cause (NOT a CSS opacity issue): After ConversationalSetup finishes and navigates
// to the dashboard, AppShell mounts GuidedTour (its `hawkeye_tour_done_<sub>` flag was
// never set by onboarding). GuidedTour's only anchor targets are the MOBILE bottom-nav
// items (`data-tour="home|create|leads|sales|more"`), which live in an `lg:hidden`
// (display:none) nav. On desktop — and transiently during the route transition on any
// breakpoint — `document.querySelector(...)` FINDS those elements but
// getBoundingClientRect() returns a ZERO rect. The old code treated any found element as
// a valid target, so it rendered the spotlight whose
// `box-shadow: 0 0 0 9999px rgba(0,0,0,.75)` painted a FULL-SCREEN dark overlay at (0,0)
// while the tooltip was pushed off the top of the viewport → dashboard "almost black",
// no dialog. Clicking dismissed/advanced it, which is why a click "fixed" it.
//
// The fix: `isUsableRect()` rejects null, zero-size (hidden/not-laid-out), and off-screen
// rects, and the component renders nothing (and advances/finishes) unless the anchor is
// usable — so the dark spotlight can never appear without its dialog.
//
// vitest runs in the node environment here (no jsdom), matching the repo's existing
// tests. We unit-test the pure gate with a minimal viewport shim, and pin the fix via
// source assertions for the behaviors that need the live DOM.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isUsableRect } from './GuidedTour';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, './GuidedTour.tsx'), 'utf8');

// Build a DOMRect-like object (only the fields isUsableRect reads).
function rect(partial: Partial<DOMRect>): DOMRect {
  return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} , ...partial } as DOMRect;
}

// isUsableRect reads window.innerWidth/innerHeight; provide a viewport in node.
const VIEWPORT = { innerWidth: 390, innerHeight: 844 };
beforeAll(() => {
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.innerWidth = VIEWPORT.innerWidth;
  (globalThis as any).window.innerHeight = VIEWPORT.innerHeight;
});
afterAll(() => {
  // leave the shim; other suites create their own as needed
});

describe('GuidedTour.isUsableRect — never anchors to a hidden/invalid element', () => {
  it('rejects a null rect (element not found)', () => {
    expect(isUsableRect(null)).toBe(false);
  });

  it('rejects a ZERO rect — the exact desktop/transition bug (lg:hidden mobile nav)', () => {
    // display:none / not-yet-laid-out elements report all-zero rects.
    expect(isUsableRect(rect({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }))).toBe(false);
  });

  it('rejects a zero-HEIGHT or zero-WIDTH rect', () => {
    expect(isUsableRect(rect({ top: 100, left: 100, width: 44, height: 0, right: 144, bottom: 100 }))).toBe(false);
    expect(isUsableRect(rect({ top: 100, left: 100, width: 0, height: 44, right: 100, bottom: 144 }))).toBe(false);
  });

  it('rejects a rect entirely above or below the viewport', () => {
    expect(isUsableRect(rect({ top: -80, bottom: -40, left: 10, right: 60, width: 50, height: 40 }))).toBe(false);
    expect(isUsableRect(rect({ top: 900, bottom: 950, left: 10, right: 60, width: 50, height: 50 }))).toBe(false);
  });

  it('rejects a rect entirely left of or right of the viewport', () => {
    expect(isUsableRect(rect({ top: 100, bottom: 150, left: -120, right: -60, width: 60, height: 50 }))).toBe(false);
    expect(isUsableRect(rect({ top: 100, bottom: 150, left: 500, right: 560, width: 60, height: 50 }))).toBe(false);
  });

  it('ACCEPTS a normal visible mobile bottom-nav item rect', () => {
    // e.g. a 44x44 tab near the bottom of a 390x844 viewport.
    expect(isUsableRect(rect({ top: 780, bottom: 824, left: 20, right: 64, width: 44, height: 44 }))).toBe(true);
  });
});

describe('GuidedTour — root-cause fix is wired (source)', () => {
  it('guards rendering on a usable rect, not merely a non-null one', () => {
    // The early return must use isUsableRect (not `if (!targetRect) return null`).
    expect(source).toContain('if (!isUsableRect(targetRect)) return null;');
  });

  it('advances or completes instead of stranding a dark overlay when no target is usable', () => {
    // When the measured rect is unusable after retries, skip the step / finish.
    expect(source).toContain('setStep((s) => s + 1)');
    expect(source).toContain('onComplete();');
  });

  it('retries measurement across a few frames (handles transient zero-rect on mount)', () => {
    expect(source).toContain('requestAnimationFrame(measure)');
    expect(source).toContain('attempts');
  });

  it('re-measures on resize so a breakpoint change cannot strand a stale overlay', () => {
    expect(source).toContain("window.addEventListener('resize', onResize)");
    expect(source).toContain("window.removeEventListener('resize', onResize)");
  });

  it('clamps the tooltip bottom so the dialog can never be pushed off the top', () => {
    // bottom offset is Math.max(12, Math.min(..., innerHeight - 200)).
    expect(source).toMatch(/bottom:\s*Math\.max\(12,\s*Math\.min\(/);
  });
});
