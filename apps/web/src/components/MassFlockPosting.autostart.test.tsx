// @vitest-environment jsdom
//
// End-to-end-ish test for the ONE-CLICK Create → Start Today's Flocks → First Group
// journey. Asserts that when MassFlockPosting is launched with autoStart + a valid
// preselect, it SKIPS the group-select screen and lands directly on the RUN phase at the
// first group, carrying the prepared post text (and image). Also verifies the safe
// fallback: when no valid groups are preselected, it shows the select screen (never
// silently posts to unrelated groups).
//
// Renders to static markup (react-dom/server) — no posting engine rewrite; we exercise
// the real component's initial phase decision.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import MassFlockPosting from './MassFlockPosting';

// Minimal context mocks the component depends on (auth + toast). Keep them light.
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { sub: 'u1' } }) }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => {} }) }));
// Flock safety bar is presentational here; stub to avoid pulling its full tree.
vi.mock('./FlockSafetyBar', () => ({ default: () => null }));

const GROUPS_KEY = 'hawkeye_flock_groups_u1';
const groups = [
  { id: 'g1', name: 'Alpha Group', link: 'https://facebook.com/groups/alpha' },
  { id: 'g2', name: 'Beta Group', link: 'https://facebook.com/groups/beta' },
];

function safetyStub() {
  return {
    paused: false,
    recentActivityCount: 0,
    recordConfirmedPost: () => {},
    pause: () => {}, resume: () => {},
    lastConfirmedAt: null,
  } as any;
}

function render(props: Record<string, unknown>) {
  return renderToStaticMarkup(
    createElement(MassFlockPosting, {
      onClose: () => {},
      getPreparedContent: () => 'My finished post content',
      readyImageSrc: 'data:image/png;base64,AAAA',
      onDownloadImage: () => {},
      safety: safetyStub(),
      ...props,
    } as any),
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
});

describe('Create → Start Today\u2019s Flocks → first group (one click)', () => {
  it('autoStart + valid preselect lands DIRECTLY on the run phase at the first group', () => {
    const html = render({ autoStart: true, preselectGroupIds: ['g1', 'g2'] });
    // Run phase shows the Copy & Open action for the CURRENT group; NOT the select screen.
    expect(html).toContain('Current group');
    expect(html).toContain('Copy'); // "Copy & Open This Group" / "Copy Text + Photo & Open Group"
    // First group is current.
    expect(html).toContain('Alpha Group');
    // The select-screen's Start button is NOT shown (we skipped selection).
    expect(html).not.toContain('Start posting');
    expect(html).not.toContain('groups selected');
  });

  it('carries the prepared post content into the session (not a reselect)', () => {
    const html = render({ autoStart: true, preselectGroupIds: ['g1'] });
    // getPreparedContent is wired; the run phase enables Copy & Open (content present).
    expect(html).toContain('Copy');
    expect(html).not.toContain('Prepare a post first');
  });

  it("autoStart but today's groups don't match → select screen with a clear notice (NO silent all-groups post)", () => {
    const html = render({ autoStart: true, preselectGroupIds: ['does-not-exist'] });
    // Must NOT auto-run into posting; must show the select screen with the fallback notice.
    expect(html).toContain('groups selected');            // select screen
    expect(html).toContain('No flocks scheduled for today');
    expect(html).not.toContain('Current group');          // did not auto-start posting
  });

  it('autoStart with NO saved groups shows the select screen fallback (actionable)', () => {
    localStorage.setItem(GROUPS_KEY, JSON.stringify([]));
    const html = render({ autoStart: true, preselectGroupIds: [] });
    // No valid groups → select screen with the add-groups guidance (not a silent no-op).
    expect(html).toContain('No groups with valid links');
  });

  it('without autoStart, a fresh launch still shows the select screen (unchanged default)', () => {
    const html = render({ preselectGroupIds: ['g1'] });
    expect(html).toContain('groups selected');
  });
});
