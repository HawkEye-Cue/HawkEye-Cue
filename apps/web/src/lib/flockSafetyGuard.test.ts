// Pure-logic tests mirroring the Flock Safety Guard web wiring (useFlockSafety +
// MassFlockPosting). Node-env, dependency-light — like flockImportDayConfirm.test.ts,
// these exercise the decision logic the components rely on without a DOM harness.
//
// Covered:
//  - Cross-workflow confirmed-post counts are deduped (one completion = one count even
//    when observed by Today's Flocks + Copy & Open + Mass Flock).
//  - Paused gating decisions (posting controls are blocked while paused).
//  - Mass Flock review gate (needsReview requires explicit acknowledgement before a
//    group can be marked posted).
//  - A regression guard asserting the Nest cap + Mass Flock session behavior are not
//    altered by the safety wiring (source-level checks).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  recordPost,
  postsToday,
  setFlockPaused,
  evaluateGroupRules,
  type PostingActivityEvent,
} from '@social-lead-gen/shared';

const T0 = new Date('2024-06-10T12:00:00').getTime();

function ev(over: Partial<PostingActivityEvent> = {}): PostingActivityEvent {
  return { groupId: 'g1', workflow: 'today', ts: T0, ...over };
}

// Mirror of the hook: recordConfirmedPost appends via recordPost (dedupe window), and
// postsToday is derived from the resulting log.
describe('cross-workflow confirmed-post counting (hook logic)', () => {
  it('counts a single completion once even across all three workflows', () => {
    let events: PostingActivityEvent[] = [];
    events = recordPost(events, ev({ workflow: 'copyopen', ts: T0 }));
    events = recordPost(events, ev({ workflow: 'today', ts: T0 + 500 }));
    events = recordPost(events, ev({ workflow: 'mass', ts: T0 + 900 }));
    expect(events).toHaveLength(1);
    expect(postsToday(events, T0 + 1000)).toBe(1);
  });

  it('counts distinct groups across workflows separately', () => {
    let events: PostingActivityEvent[] = [];
    events = recordPost(events, ev({ groupId: 'a', workflow: 'today', ts: T0 }));
    events = recordPost(events, ev({ groupId: 'b', workflow: 'mass', ts: T0 + 500 }));
    events = recordPost(events, ev({ groupId: 'c', workflow: 'copyopen', ts: T0 + 900 }));
    expect(postsToday(events, T0 + 1000)).toBe(3);
  });
});

describe('paused gating decision (component logic)', () => {
  // The components replace/disable the post action when paused.
  const pausedBlocksPosting = (paused: boolean) => !paused; // true = posting allowed

  it('blocks posting controls while paused', () => {
    const state = setFlockPaused({ paused: false }, true, 'user');
    expect(state.paused).toBe(true);
    expect(pausedBlocksPosting(state.paused)).toBe(false);
  });

  it('allows posting after manual resume', () => {
    const state = setFlockPaused({ paused: true, reason: 'user' }, false);
    expect(state.paused).toBe(false);
    expect(pausedBlocksPosting(state.paused)).toBe(true);
  });

  it('a restricted pause is still manual-resume (no reason implies auto-resume)', () => {
    const state = setFlockPaused({ paused: false }, true, 'restricted');
    expect(state.reason).toBe('restricted');
    expect(state.paused).toBe(true);
  });
});

describe('Mass Flock review gate (component logic)', () => {
  // Mirrors needsReviewGate: when a group needsReview, the confirm button is disabled
  // until the user acknowledges (reviewedGroupId === group id).
  const needsReviewGate = (needsReview: boolean, groupId: string, reviewedGroupId: string | null) =>
    needsReview && reviewedGroupId !== groupId;

  it('gates a not-permitted day until acknowledged', () => {
    const rules = evaluateGroupRules({
      group: { postingDays: [2, 4], name: 'G', link: 'l' }, // today is Monday(1) → not allowed
      today: 1, history: [], now: T0,
    });
    expect(rules.needsReview).toBe(true);
    expect(needsReviewGate(rules.needsReview, 'g1', null)).toBe(true);        // blocked
    expect(needsReviewGate(rules.needsReview, 'g1', 'g1')).toBe(false);       // acknowledged → allowed
  });

  it('does not gate an allowed group', () => {
    const rules = evaluateGroupRules({
      group: { anyday: true, name: 'G', link: 'l' },
      today: 1, history: [], now: T0,
    });
    expect(rules.needsReview).toBe(false);
    expect(needsReviewGate(rules.needsReview, 'g1', null)).toBe(false);
  });

  it('gates a possible frequency violation until acknowledged', () => {
    const link = 'https://www.facebook.com/groups/x';
    const rules = evaluateGroupRules({
      group: { anyday: true, link, frequencyLimit: '1 per week' },
      today: 1,
      history: [{ groupLink: link, postedAt: new Date(T0 - 2 * 24 * 3600 * 1000).toISOString() }],
      now: T0,
    });
    expect(rules.needsReview).toBe(true);
    expect(needsReviewGate(rules.needsReview, 'g1', null)).toBe(true);
  });
});

// ─── Regression guards: existing behavior preserved (source-level) ──────────────
const here = dirname(fileURLToPath(import.meta.url));
const ccSource = readFileSync(resolve(here, '../pages/ContentCreatorPage.tsx'), 'utf8');
const massSource = readFileSync(resolve(here, '../components/MassFlockPosting.tsx'), 'utf8');

describe('existing behavior is preserved', () => {
  it('keeps the Nest Copy & Open 3/day cap intact', () => {
    expect(ccSource).toContain('const nestLimit = 3');
    expect(ccSource).toContain('hawkeye_copyopen_used_');
    expect(ccSource).toContain('nestLimitReached');
  });

  it('keeps the Mass Flock per-session pause (idempotent markPosted) intact', () => {
    expect(massSource).toContain('markPosted');
    expect(massSource).toContain('setPaused(s, true)'); // per-session pause preserved
    expect(massSource).toContain('clearSession');
  });

  it('records confirmed posts in all three workflows', () => {
    expect(ccSource).toContain("recordConfirmedPost('copyopen'");
    expect(ccSource).toContain("recordConfirmedPost('today'");
    expect(massSource).toContain("recordConfirmedPost('mass'");
  });

  it('Mass Flock marking posted is blocked while the safety review gate is active', () => {
    expect(massSource).toContain('needsReviewGate');
    expect(massSource).toContain('disabled={acting || !cur || needsReviewGate}');
  });
});
