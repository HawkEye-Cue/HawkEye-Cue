// Regression tests for LINK-FIRST cross-workflow dedupe in the Flock Safety Guard.
//
// Real scenario: the SAME Facebook group is confirmed via Mass Flock (saved-group id)
// and Today's Flocks (calendar-event id). Those raw ids DIFFER, so id-based dedupe
// previously double-counted the same group. useFlockSafety now derives the dedupe
// identity from the NORMALIZED group URL (falling back to id/name). These tests mirror
// that `dedupeIdentity` + `recordPost` logic with different ids but the same URL.

import { describe, it, expect } from 'vitest';
import { recordPost, postsToday, normalizeFacebookGroupUrl, type PostingActivityEvent } from '@social-lead-gen/shared';

// Mirror of useFlockSafety.dedupeIdentity (link-first, fallback id/name).
function dedupeIdentity(group: { id?: string; name?: string; link?: string }): string {
  const norm = group.link ? normalizeFacebookGroupUrl(group.link) : null;
  if (norm && norm.ok && norm.url) return norm.url;
  return (group.id || group.link || group.name || '').trim();
}

// Mirror of recordConfirmedPost event construction (id = dedupeIdentity).
function confirm(
  events: PostingActivityEvent[],
  workflow: PostingActivityEvent['workflow'],
  group: { id?: string; name?: string; link?: string },
  ts: number,
): PostingActivityEvent[] {
  const event: PostingActivityEvent = {
    groupId: dedupeIdentity(group),
    groupLink: group.link,
    groupName: group.name,
    ts,
    workflow,
  };
  return recordPost(events, event);
}

const T0 = Date.UTC(2026, 9, 19, 15, 0, 0); // fixed midday for stable "today" counting
const TWO_MIN = 2 * 60 * 1000;

// Same real group "Bad moms of NoCo", DIFFERENT raw ids per workflow, SAME URL (in
// slightly different but equivalent forms).
const MASS = { id: 'import-abc123', name: 'Bad moms of NoCo', link: 'https://www.facebook.com/groups/123456789' };
const TODAY = { id: 'cal-evt-xyz789', name: 'Bad moms of NoCo', link: 'https://m.facebook.com/groups/123456789/' };

describe('link-first cross-workflow dedupe', () => {
  it('counts ONCE when the same group is confirmed via Mass Flock then Today\'s Flocks within 2 minutes (different ids, same URL)', () => {
    let events: PostingActivityEvent[] = [];
    events = confirm(events, 'mass', MASS, T0);
    events = confirm(events, 'today', TODAY, T0 + 30_000); // 30s later, other workflow
    expect(events).toHaveLength(1);
    expect(postsToday(events, T0 + 60_000)).toBe(1);
  });

  it('normalizes www/m./trailing-slash so equivalent URLs share one identity', () => {
    expect(dedupeIdentity(MASS)).toBe('https://www.facebook.com/groups/123456789');
    expect(dedupeIdentity(TODAY)).toBe('https://www.facebook.com/groups/123456789');
    expect(dedupeIdentity(MASS)).toBe(dedupeIdentity(TODAY));
  });

  it('counts SEPARATELY when the same group is confirmed again OUTSIDE the 2-minute window (legitimate repeat post preserved)', () => {
    let events: PostingActivityEvent[] = [];
    events = confirm(events, 'mass', MASS, T0);
    events = confirm(events, 'today', TODAY, T0 + TWO_MIN + 1000); // just past 2 minutes
    expect(events).toHaveLength(2);
    expect(postsToday(events, T0 + TWO_MIN + 2000)).toBe(2);
  });

  it('counts distinct groups separately even within the window', () => {
    let events: PostingActivityEvent[] = [];
    events = confirm(events, 'mass', MASS, T0);
    events = confirm(events, 'today', { id: 'cal-evt-other', name: 'Other Group', link: 'https://facebook.com/groups/999' }, T0 + 10_000);
    expect(postsToday(events, T0 + 20_000)).toBe(2);
  });

  it('falls back to id/name when a group has no valid URL (legacy group)', () => {
    // No link → identity is the raw id; two different ids count as two.
    let events: PostingActivityEvent[] = [];
    events = confirm(events, 'mass', { id: 'legacy-1', name: 'Legacy No URL' }, T0);
    events = confirm(events, 'today', { id: 'legacy-2', name: 'Legacy No URL' }, T0 + 10_000);
    // Different ids and no URL → not deduped (expected fallback behavior).
    expect(postsToday(events, T0 + 20_000)).toBe(2);
    // But the SAME legacy id within the window dedupes.
    let e2: PostingActivityEvent[] = [];
    e2 = confirm(e2, 'mass', { id: 'legacy-1', name: 'Legacy No URL' }, T0);
    e2 = confirm(e2, 'today', { id: 'legacy-1', name: 'Legacy No URL' }, T0 + 10_000);
    expect(postsToday(e2, T0 + 20_000)).toBe(1);
  });
});
