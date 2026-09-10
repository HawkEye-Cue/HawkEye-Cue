import type { CalendarEvent } from '../contexts/CalendarContext';

/**
 * Strip an optional leading `[HH:MM] ` time prefix and trim surrounding whitespace.
 * Used by both the import logic and the sync selector so title matching is consistent.
 */
export function normalizeTitle(title: string): string {
  return title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '').trim();
}

/**
 * The user's local calendar date as `YYYY-MM-DD`, computed the same way the rest of
 * the codebase computes it (year, zero-padded month+1, zero-padded date). Because the
 * format sorts lexicographically the same as chronologically, `event.date >= getTodayStr()`
 * is a valid "today-and-future" scope check without any Date parsing.
 */
export function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The single source of truth for "which calendar events belong to this group, from today
 * onward." Selects exactly those events that are `type === 'post'`, dated on or after
 * `todayStr`, and whose normalized title is character-for-character equal to the normalized
 * group name (no substring matching). Returns `[]` when the group name normalizes to empty.
 *
 * This helper is pure and does no I/O.
 */
export function findFutureFlockEvents(
  events: CalendarEvent[],
  groupName: string,
  todayStr: string,
): CalendarEvent[] {
  const target = normalizeTitle(groupName);
  if (target === '') return []; // empty/whitespace name matches nothing (Req 8.4)
  return events.filter(
    (e) =>
      e.type === 'post' && // Req 8.3: restrict to 'post' events
      e.date >= todayStr && // today-and-future scope (Req 5.1, 7.1)
      normalizeTitle(e.title) === target, // exact match, no substring (Req 8.1, 8.2)
  );
}
