// Tests for computeFlockActivity — TODAY's confirmed posting activity derived from the
// Flock Safety Guard activity log. Also verifies the activity log's cross-workflow
// dedupe (via recordPost) composes correctly with the today-count derivation, so the
// section reflects confirmed posts from all three workflows without double-counting.

import { describe, it, expect } from 'vitest';
import { computeFlockActivity } from './flockActivity.js';
import { recordPost } from './flockSafety.js';
import { normalizeFacebookGroupUrl } from './facebookGroupUrl.js';
import type { PostingActivityEvent, PostingWorkflow } from './flockSafety.js';

// Mirror of useFlockSafety.dedupeIdentity + event construction (link-first identity).
function confirm(
  events: PostingActivityEvent[],
  workflow: PostingWorkflow,
  group: { id?: string; name?: string; link?: string },
  ts: number,
): PostingActivityEvent[] {
  const norm = group.link ? normalizeFacebookGroupUrl(group.link) : null;
  const groupId = norm && norm.ok && norm.url ? norm.url : (group.id || group.link || group.name || '').trim();
  return recordPost(events, { groupId, groupLink: group.link, groupName: group.name, ts, workflow });
}

// Fixed local-noon "today" so day-boundary math is stable.
const NOON = new Date(2026, 9, 19, 12, 0, 0).getTime();
const TWO_MIN = 2 * 60 * 1000;

const A = { id: 'saved-A', name: 'Group A', link: 'https://www.facebook.com/groups/111' };
const A_MOBILE = { id: 'cal-A', name: 'Group A', link: 'https://m.facebook.com/groups/111/' }; // same group, other workflow/id
const B = { id: 'saved-B', name: 'Group B', link: 'https://facebook.com/groups/222' };
const C = { id: 'saved-C', name: 'Group C', link: 'https://facebook.com/groups/333' };

describe('computeFlockActivity — today counts across all three workflows', () => {
  it('counts confirmed posts from Mass Flock, Today\'s Flocks, and Copy & Open', () => {
    let ev: PostingActivityEvent[] = [];
    ev = confirm(ev, 'mass', A, NOON);
    ev = confirm(ev, 'today', B, NOON + 10 * TWO_MIN);     // well outside dedupe window of A
    ev = confirm(ev, 'copyopen', C, NOON + 20 * TWO_MIN);
    const a = computeFlockActivity(ev, NOON + 21 * TWO_MIN);
    expect(a.total).toBe(3);
    expect(a.byWorkflow).toEqual({ mass: 1, today: 1, copyopen: 1 });
    expect(a.hasActivity).toBe(true);
  });
});

describe('computeFlockActivity — dedupe and repeat behavior', () => {
  it('same group across workflows within 2 minutes counts once', () => {
    let ev: PostingActivityEvent[] = [];
    ev = confirm(ev, 'mass', A, NOON);
    ev = confirm(ev, 'today', A_MOBILE, NOON + 30_000); // same URL, 30s later, other workflow+id
    const a = computeFlockActivity(ev, NOON + 60_000);
    expect(a.total).toBe(1); // deduped
    // surviving event is the FIRST (mass)
    expect(a.byWorkflow.mass).toBe(1);
    expect(a.byWorkflow.today).toBe(0);
  });

  it('same group confirmed again OUTSIDE 2 minutes counts separately (legitimate repeat)', () => {
    let ev: PostingActivityEvent[] = [];
    ev = confirm(ev, 'mass', A, NOON);
    ev = confirm(ev, 'today', A_MOBILE, NOON + TWO_MIN + 1000);
    const a = computeFlockActivity(ev, NOON + TWO_MIN + 2000);
    expect(a.total).toBe(2);
    expect(a.byWorkflow.mass).toBe(1);
    expect(a.byWorkflow.today).toBe(1);
  });

  it('different groups count separately even within the window', () => {
    let ev: PostingActivityEvent[] = [];
    ev = confirm(ev, 'mass', A, NOON);
    ev = confirm(ev, 'today', B, NOON + 5_000);
    const a = computeFlockActivity(ev, NOON + 10_000);
    expect(a.total).toBe(2);
  });
});

describe('computeFlockActivity — exclusions and boundaries', () => {
  it('empty activity log → no activity, zero totals', () => {
    const a = computeFlockActivity([], NOON);
    expect(a.total).toBe(0);
    expect(a.hasActivity).toBe(false);
    expect(a.byWorkflow).toEqual({ mass: 0, today: 0, copyopen: 0 });
  });

  it('uses the LOCAL day boundary — yesterday\'s confirmed posts are excluded', () => {
    const yesterdayNoon = NOON - 24 * 60 * 60 * 1000;
    let ev: PostingActivityEvent[] = [];
    ev = confirm(ev, 'mass', A, yesterdayNoon);   // yesterday
    ev = confirm(ev, 'today', B, NOON);           // today
    const a = computeFlockActivity(ev, NOON + 1000);
    expect(a.total).toBe(1);
    expect(a.byWorkflow.today).toBe(1);
    expect(a.byWorkflow.mass).toBe(0);
  });

  it('events after `now` are not counted (clock-skew guard)', () => {
    let ev: PostingActivityEvent[] = [];
    ev = confirm(ev, 'mass', A, NOON + 60_000); // 1 min in the "future"
    const a = computeFlockActivity(ev, NOON);
    expect(a.total).toBe(0);
  });

  it('only user-confirmed posts exist in the log — opens/skips are never recorded, so never counted', () => {
    // The log only ever receives recordConfirmedPost() calls; opens/skips/drafts write
    // nothing. This asserts the counter reflects exactly the confirmed events present.
    let ev: PostingActivityEvent[] = [];
    ev = confirm(ev, 'mass', A, NOON);
    const a = computeFlockActivity(ev, NOON + 1000);
    expect(a.total).toBe(1);
  });
});
