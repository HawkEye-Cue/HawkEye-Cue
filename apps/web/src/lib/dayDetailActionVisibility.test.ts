// Focused regression coverage for the day-detail popup's Schedule grid action
// visibility. The grid gates its Edit/Delete controls with isScheduledPostEntry(evt):
// scheduled posts (from the /posts store, mapped via scheduledPostToCalendarEntry) show
// a read-only "Scheduled · manage in Create" hint; ordinary calendar events, meetings,
// and reminders keep Edit/Delete.
//
// The grid is inline JSX in CalendarPage; this exercises the SAME decision function
// (isScheduledPostEntry) against representative day-detail entry shapes, which is the
// single source of truth for the gate.

import { describe, it, expect } from 'vitest';
import { isScheduledPostEntry, scheduledPostToCalendarEntry } from './scheduledPostDisplay';

// Mirror of the grid's action-visibility decision: Edit/Delete shown iff NOT a
// scheduled post. Kept here as the documented contract the inline JSX implements.
function showsEditDelete(evt: unknown): boolean {
  return !isScheduledPostEntry(evt);
}

// Ordinary calendar-event shapes as they appear in the day-detail grid (no isScheduledPost flag).
const calendarPostEvent = { id: 'c-post', date: '2026-10-12', title: '[10:00] 📤 Manual post cue', type: 'post', completed: false, link: 'https://facebook.com/groups/x' };
const meetingEvent = { id: 'c-mtg', date: '2026-10-12', title: '[14:00] Client call — 📍 Office', type: 'meeting', completed: false };
const reminderEvent = { id: 'c-rem', date: '2026-10-12', title: '[09:00] Follow up', type: 'reminder', completed: false };

describe('day-detail Schedule grid — scheduled posts are read-only', () => {
  it('a scheduled post (mapped for display) is identified read-only → NO Edit/Delete', () => {
    const scheduled = scheduledPostToCalendarEntry(
      { id: 'p1', content: 'Fall roof inspection reminder', scheduledAt: new Date(2026, 9, 12, 10, 0).toISOString(), status: 'scheduled' },
      '2026-10-12',
    )!;
    expect(isScheduledPostEntry(scheduled)).toBe(true);
    expect(showsEditDelete(scheduled)).toBe(false);
  });

  it('an ordinary calendar POST event keeps Edit/Delete (not a scheduled post)', () => {
    expect(isScheduledPostEntry(calendarPostEvent)).toBe(false);
    expect(showsEditDelete(calendarPostEvent)).toBe(true);
  });

  it('meetings keep Edit/Delete', () => {
    expect(isScheduledPostEntry(meetingEvent)).toBe(false);
    expect(showsEditDelete(meetingEvent)).toBe(true);
  });

  it('reminders keep Edit/Delete', () => {
    expect(isScheduledPostEntry(reminderEvent)).toBe(false);
    expect(showsEditDelete(reminderEvent)).toBe(true);
  });

  it('in a mixed day, only the scheduled post is read-only', () => {
    const scheduled = scheduledPostToCalendarEntry(
      { id: 'p2', content: 'promo', scheduledAt: new Date(2026, 9, 12, 11, 0).toISOString(), status: 'scheduled' },
      '2026-10-12',
    )!;
    const entries: unknown[] = [scheduled, calendarPostEvent, meetingEvent, reminderEvent];
    const readOnly = entries.filter((e) => !showsEditDelete(e));
    expect(readOnly).toEqual([scheduled]);
  });
});
