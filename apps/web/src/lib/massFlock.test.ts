// @vitest-environment jsdom
//
// Regression tests for Mass Flock Posting pure logic. Covers the required guarantees:
// all groups selectable regardless of scheduled day, selection, queue/advance,
// opening-never-marks-posted (markPosted is the ONLY path), idempotent completion,
// skip not counted as posted, recently-posted warning behavior, and session persistence.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  type FlockGroup,
  hasValidLink,
  partitionGroups,
  createSession,
  queue,
  currentGroup,
  nextGroup,
  progress,
  markPosted,
  skipGroup,
  toggleSelected,
  setPaused,
  recentlyPostedWarning,
  loadSession,
  saveSession,
  clearSession,
  sessionKey,
} from './massFlock';

const g = (id: string, name: string, link: string, postingDays: number[] = []): FlockGroup => ({ id, name, link, postingDays, anyday: false });

// Groups scheduled for DIFFERENT days (none "today") — mass posting must ignore schedule.
const groups: FlockGroup[] = [
  g('a', 'Group A', 'https://facebook.com/groups/a', [1]), // Monday only
  g('b', 'Group B', 'https://facebook.com/groups/b', [3]), // Wednesday only
  g('c', 'Group C', 'https://facebook.com/groups/c', [6]), // Saturday only
  g('d', 'Group D (no link)', '', [2]),                    // invalid — no link
  g('e', 'Group E (bad link)', 'ftp://nope', [4]),         // invalid — not http(s)
];

describe('link validity + partition', () => {
  it('hasValidLink requires a non-empty http(s) URL', () => {
    expect(hasValidLink(g('x', 'x', 'https://facebook.com/groups/x'))).toBe(true);
    expect(hasValidLink(g('x', 'x', 'http://facebook.com/groups/x'))).toBe(true);
    expect(hasValidLink(g('x', 'x', ''))).toBe(false);
    expect(hasValidLink(g('x', 'x', '   '))).toBe(false);
    expect(hasValidLink(g('x', 'x', 'ftp://nope'))).toBe(false);
  });
  it('partitions valid vs invalid (missing/invalid links surfaced, not lost)', () => {
    const { valid, invalid } = partitionGroups(groups);
    expect(valid.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(invalid.map((x) => x.id)).toEqual(['d', 'e']);
  });
});

describe('session defaults to ALL valid groups regardless of scheduled day', () => {
  it('selects every group with a valid link, ignoring postingDays', () => {
    const s = createSession(groups);
    expect(s.selectedIds).toEqual(['a', 'b', 'c']); // d,e excluded (no valid link)
    expect(s.postedIds).toEqual([]);
    expect(s.skippedIds).toEqual([]);
  });
});

describe('selection toggle', () => {
  it('deselect/reselect works', () => {
    let s = createSession(groups);
    s = toggleSelected(s, 'b');
    expect(s.selectedIds).toEqual(['a', 'c']);
    s = toggleSelected(s, 'b');
    expect(s.selectedIds).toContain('b');
  });
});

describe('queue / current / next / progress', () => {
  it('queue is the selected, valid, not-done groups in order', () => {
    const s = createSession(groups);
    expect(queue(groups, s).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(currentGroup(groups, s)?.id).toBe('a');
    expect(nextGroup(groups, s)?.id).toBe('b');
    expect(progress(s)).toEqual({ posted: 0, selected: 3, remaining: 3, skipped: 0 });
  });
});

describe('opening never marks posted — only markPosted does', () => {
  it('markPosted advances current and increments posted', () => {
    let s = createSession(groups);
    // Simulate "opened current" with NO state change (open is a no-op on session).
    expect(currentGroup(groups, s)?.id).toBe('a'); // still current after "opening"
    s = markPosted(s, 'a'); // explicit confirmation
    expect(s.postedIds).toEqual(['a']);
    expect(currentGroup(groups, s)?.id).toBe('b'); // advanced
    expect(progress(s).posted).toBe(1);
    expect(progress(s).remaining).toBe(2);
  });

  it('markPosted is idempotent (double-click safe)', () => {
    let s = createSession(groups);
    s = markPosted(s, 'a');
    s = markPosted(s, 'a'); // second click → no-op
    expect(s.postedIds).toEqual(['a']);
    expect(progress(s).posted).toBe(1);
  });
});

describe('skip is NOT counted as posted', () => {
  it('skipGroup removes from queue but not from posted', () => {
    let s = createSession(groups);
    s = skipGroup(s, 'a');
    expect(s.skippedIds).toEqual(['a']);
    expect(s.postedIds).toEqual([]);
    expect(currentGroup(groups, s)?.id).toBe('b'); // advanced past skipped
    expect(progress(s)).toEqual({ posted: 0, selected: 3, remaining: 2, skipped: 1 });
  });
  it('posting a previously-skipped group supersedes the skip', () => {
    let s = createSession(groups);
    s = skipGroup(s, 'a');
    s = markPosted(s, 'a');
    expect(s.postedIds).toEqual(['a']);
    expect(s.skippedIds).toEqual([]);
  });
});

describe('pause/resume', () => {
  it('toggles paused flag without losing progress', () => {
    let s = createSession(groups);
    s = markPosted(s, 'a');
    s = setPaused(s, true);
    expect(s.paused).toBe(true);
    expect(s.postedIds).toEqual(['a']);
    s = setPaused(s, false);
    expect(s.paused).toBe(false);
  });
});

describe('recently-posted warning', () => {
  const now = new Date('2026-10-12T12:00:00').getTime();
  it('warns when the group link appears in history within the window', () => {
    const history = [{ group: 'Group A', groupLink: 'https://facebook.com/groups/a', postedAt: new Date(now - 2 * 86400000).toISOString() }];
    expect(recentlyPostedWarning(groups[0], history, 7, now)).toMatch(/recently posted/i);
  });
  it('does NOT warn when the last post is older than the window', () => {
    const history = [{ group: 'Group A', groupLink: 'https://facebook.com/groups/a', postedAt: new Date(now - 30 * 86400000).toISOString() }];
    expect(recentlyPostedWarning(groups[0], history, 7, now)).toBeNull();
  });
  it('returns null (unknown) when history is empty — never falsely claims safe', () => {
    expect(recentlyPostedWarning(groups[0], [], 7, now)).toBeNull();
  });
  it('matches by group name when link is absent in history', () => {
    const history = [{ group: 'Group A', postedAt: new Date(now - 1 * 86400000).toISOString() }];
    expect(recentlyPostedWarning(groups[0], history, 7, now)).toMatch(/recently posted/i);
  });
});

describe('session persistence (device-specific localStorage)', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* node env */ } });

  it('save/load round-trips and clear removes it', () => {
    const sub = 'user-123';
    let s = createSession(groups);
    s = markPosted(s, 'a');
    s = skipGroup(s, 'b');
    saveSession(sub, s);
    const loaded = loadSession(sub);
    expect(loaded?.postedIds).toEqual(['a']);
    expect(loaded?.skippedIds).toEqual(['b']);
    clearSession(sub);
    expect(loadSession(sub)).toBeNull();
  });

  it('session key is scoped per user (does not overwrite another user)', () => {
    expect(sessionKey('u1')).not.toBe(sessionKey('u2'));
    expect(sessionKey(undefined)).toContain('default');
  });

  it('loadSession returns null for malformed data (no crash)', () => {
    try { localStorage.setItem(sessionKey('bad'), '{not json'); } catch { /* ignore */ }
    expect(loadSession('bad')).toBeNull();
  });
});
