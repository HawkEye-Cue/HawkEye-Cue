// @social-lead-gen/shared
// Flock classification helpers.

/**
 * A calendar-event-like shape used to classify Flocks.
 *
 * Kept structural (not importing the web `CalendarEvent` type) so this module
 * avoids import cycles and accepts both the web `CalendarEvent` and plain
 * objects.
 */
export interface FlockClassifiable {
  type?: string;
  link?: string | null;
}

/**
 * Determine whether a calendar event is a Flock.
 *
 * A Flock is a group-posting workflow item: a `'post'` event that carries a
 * non-empty group `link`. Regular business-page scheduled posts are also of
 * `type: 'post'` but have no group link, so they are NOT Flocks and must be
 * excluded from Today's Flocks / Missed Flocks lists and counters.
 */
export function isFlockEvent(e: FlockClassifiable): boolean {
  return e?.type === 'post' && typeof e.link === 'string' && e.link.trim().length > 0;
}
