// Regression tests for scheduled-post calendar display (Option 1 fix).
//
// Bug: a post scheduled via Create (/posts store, with a real `scheduledAt`) appeared
// under its date in the Posts section but NOT at its time on the hourly timeline, and
// Edit showed an empty Time field — because the calendar derives time from a "[HH:MM]"
// title prefix that scheduled posts lacked. These helpers map a scheduled post into the
// calendar's "[HH:MM] …" convention (local time) and flag it as a scheduled post.
//
// Tests are timezone-INDEPENDENT: Dates are built from explicit LOCAL components and
// assertions compare against the same local extraction.

import { describe, it, expect } from 'vitest';
import {
  localHhMm,
  localDateStr,
  scheduledPostToCalendarEntry,
  scheduledPostsForLocalDate,
  isScheduledPostEntry,
} from './scheduledPostDisplay';

// Build an ISO string for a given LOCAL wall-clock time (so the test matches how a user
// picks a time in their own timezone), independent of the runner's TZ.
function isoForLocal(y: number, mo1: number, d: number, h: number, mi: number): string {
  return new Date(y, mo1 - 1, d, h, mi, 0, 0).toISOString();
}

describe('localHhMm / localDateStr', () => {
  it('formats local hours/minutes zero-padded', () => {
    expect(localHhMm(new Date(2026, 9, 12, 10, 0))).toBe('10:00');
    expect(localHhMm(new Date(2026, 9, 12, 9, 5))).toBe('09:05');
    expect(localHhMm(new Date(2026, 9, 12, 0, 30))).toBe('00:30');
    expect(localHhMm(new Date(2026, 9, 12, 23, 45))).toBe('23:45');
  });
  it('formats local date as YYYY-MM-DD', () => {
    expect(localDateStr(new Date(2026, 9, 12, 10, 0))).toBe('2026-10-12');
    expect(localDateStr(new Date(2026, 0, 3, 1, 0))).toBe('2026-01-03');
  });
});

describe('scheduledPostToCalendarEntry', () => {
  it('maps a scheduled post to a "[HH:MM] 📤 content" calendar entry flagged as a scheduled post', () => {
    const p = { id: 'p1', content: 'Fall roof inspection reminder', scheduledAt: isoForLocal(2026, 10, 12, 10, 0), status: 'scheduled' };
    const entry = scheduledPostToCalendarEntry(p, '2026-10-12');
    expect(entry).not.toBeNull();
    expect(entry!.title).toBe('[10:00] 📤 Fall roof inspection reminder');
    expect(entry!.type).toBe('post');
    expect(entry!.date).toBe('2026-10-12');
    expect(entry!.completed).toBe(false);
    expect(entry!.isScheduledPost).toBe(true);
  });

  it('marks published posts completed and truncates long content to 40 chars', () => {
    const long = 'x'.repeat(60);
    const p = { id: 'p2', content: long, scheduledAt: isoForLocal(2026, 10, 12, 14, 30), status: 'published' };
    const entry = scheduledPostToCalendarEntry(p, '2026-10-12')!;
    expect(entry.completed).toBe(true);
    expect(entry.title.startsWith('[14:30] 📤 ')).toBe(true);
    expect(entry.title.replace('[14:30] 📤 ', '').length).toBe(40);
  });

  it('returns null when scheduledAt is missing or invalid (fail safe)', () => {
    expect(scheduledPostToCalendarEntry({ id: 'p3' }, '2026-10-12')).toBeNull();
    expect(scheduledPostToCalendarEntry({ id: 'p4', scheduledAt: 'not-a-date' }, '2026-10-12')).toBeNull();
  });

  it('falls back to "Scheduled post" when content is empty', () => {
    const p = { id: 'p5', content: '', scheduledAt: isoForLocal(2026, 10, 12, 8, 0), status: 'scheduled' };
    expect(scheduledPostToCalendarEntry(p, '2026-10-12')!.title).toBe('[08:00] 📤 Scheduled post');
  });
});

describe('scheduledPostsForLocalDate — buckets by LOCAL date, handles midnight edges', () => {
  it('includes posts whose LOCAL date matches, in [HH:MM] form', () => {
    const posts = [
      { id: 'a', content: 'morning', scheduledAt: isoForLocal(2026, 10, 12, 10, 0), status: 'scheduled' },
      { id: 'b', content: 'late night', scheduledAt: isoForLocal(2026, 10, 12, 23, 45), status: 'scheduled' },
      { id: 'c', content: 'next day', scheduledAt: isoForLocal(2026, 10, 13, 9, 0), status: 'scheduled' },
    ];
    const entries = scheduledPostsForLocalDate(posts, '2026-10-12');
    expect(entries.map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(entries.find((e) => e.id === 'a')!.title).toContain('[10:00]');
    expect(entries.find((e) => e.id === 'b')!.title).toContain('[23:45]');
  });

  it('bucket uses local date derived from scheduledAt (midnight boundary)', () => {
    const justAfterMidnight = { id: 'm', content: 'midnight', scheduledAt: isoForLocal(2026, 10, 12, 0, 15), status: 'scheduled' };
    expect(scheduledPostsForLocalDate([justAfterMidnight], '2026-10-12').map((e) => e.id)).toEqual(['m']);
    expect(scheduledPostsForLocalDate([justAfterMidnight], '2026-10-11')).toEqual([]);
  });

  it('ignores posts with no/invalid scheduledAt', () => {
    const posts = [
      { id: 'x', scheduledAt: null, status: 'scheduled' },
      { id: 'y', scheduledAt: 'bad', status: 'scheduled' },
      { id: 'z', content: 'ok', scheduledAt: isoForLocal(2026, 10, 12, 12, 0), status: 'scheduled' },
    ];
    expect(scheduledPostsForLocalDate(posts, '2026-10-12').map((e) => e.id)).toEqual(['z']);
  });
});

describe('isScheduledPostEntry', () => {
  it('is true only for entries flagged isScheduledPost', () => {
    const entry = scheduledPostToCalendarEntry({ id: 'p', content: 'c', scheduledAt: isoForLocal(2026, 10, 12, 10, 0), status: 'scheduled' }, '2026-10-12')!;
    expect(isScheduledPostEntry(entry)).toBe(true);
    // A normal calendar event (no flag) is NOT a scheduled post → remains editable.
    expect(isScheduledPostEntry({ id: 'e1', date: '2026-10-12', title: '[10:00] Meeting', type: 'post', completed: false })).toBe(false);
    expect(isScheduledPostEntry(null)).toBe(false);
    expect(isScheduledPostEntry(undefined)).toBe(false);
  });
});

describe('hourly timeline integration — [HH:MM] prefix lands in the right slot', () => {
  // Mirrors HourlyTimeline.parseTimelineEvents hour extraction to prove the mapped
  // title now yields a time (previously scheduled posts had no prefix → "All Day").
  function hourFromTitle(title: string): number | null {
    const m = title.match(/^\[(\d{1,2}):(\d{2})\]/);
    return m ? parseInt(m[1], 10) : null;
  }
  it('a 10:00 scheduled post maps to hour slot 10 (not All Day)', () => {
    const entry = scheduledPostToCalendarEntry({ id: 'p', content: 'c', scheduledAt: isoForLocal(2026, 10, 12, 10, 0), status: 'scheduled' }, '2026-10-12')!;
    expect(hourFromTitle(entry.title)).toBe(10);
  });
});
