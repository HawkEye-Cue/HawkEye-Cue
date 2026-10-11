// Pure helpers for displaying scheduled posts (from the /posts store) inside the
// calendar, which otherwise renders calendar events (from /calendar/events).
//
// The calendar/hourly-timeline derive an event's time from a leading "[HH:MM]" title
// prefix (local time). Scheduled posts carry a real `scheduledAt` ISO timestamp but no
// title prefix, so without this they render as "All Day" / with an empty Edit time.
// These helpers map a scheduled post into the same shape calendar events use, deriving
// the local "[HH:MM]" prefix from `scheduledAt`, and flag the entry as a scheduled post
// so the UI can show it (and suppress a misleading Edit that would save to the wrong
// store).

export interface ScheduledPostLike {
  id: string;
  content?: string;
  scheduledAt?: string | null;
  status?: string;
}

// A calendar-event-shaped entry the day/month/timeline views already understand, plus
// an explicit flag marking it as a scheduled post (not an editable calendar event).
export interface CalendarDisplayEntry {
  id: string;
  date: string; // YYYY-MM-DD (local)
  title: string; // "[HH:MM] 📤 content…" when a time is present
  type: 'post';
  completed: boolean;
  isScheduledPost: true;
}

// Format a Date's LOCAL hours/minutes as "HH:MM" (24h, zero-padded). Local — matching
// how calendar events are authored via the time picker — so a post scheduled for
// 10:00 AM local shows in the 10:00 slot regardless of the user's timezone.
export function localHhMm(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Local YYYY-MM-DD for a Date (so day bucketing matches the local calendar grid).
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Map a scheduled post to a calendar display entry for a given local date string.
// Returns null if the post has no valid scheduledAt (nothing reliable to show).
export function scheduledPostToCalendarEntry(
  p: ScheduledPostLike,
  dateStr: string,
): CalendarDisplayEntry | null {
  if (!p || !p.scheduledAt) return null;
  const d = new Date(p.scheduledAt);
  if (isNaN(d.getTime())) return null;
  const hhmm = localHhMm(d);
  const snippet = (p.content || 'Scheduled post').slice(0, 40);
  return {
    id: p.id,
    date: dateStr,
    title: `[${hhmm}] 📤 ${snippet}`,
    type: 'post',
    completed: p.status === 'published',
    isScheduledPost: true,
  };
}

// Build the scheduled-post display entries that fall on a given LOCAL date. Uses the
// post's local date (derived from scheduledAt) so a post at 2026-10-12T10:00 local is
// bucketed on 2026-10-12 even if its UTC ISO string lands on a different calendar day.
export function scheduledPostsForLocalDate(
  posts: ScheduledPostLike[],
  dateStr: string,
): CalendarDisplayEntry[] {
  const out: CalendarDisplayEntry[] = [];
  for (const p of posts || []) {
    if (!p.scheduledAt) continue;
    const d = new Date(p.scheduledAt);
    if (isNaN(d.getTime())) continue;
    if (localDateStr(d) !== dateStr) continue;
    const entry = scheduledPostToCalendarEntry(p, dateStr);
    if (entry) out.push(entry);
  }
  return out;
}

// Type guard: is a day entry a scheduled post (and therefore NOT editable in-calendar)?
export function isScheduledPostEntry(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { isScheduledPost?: boolean }).isScheduledPost === true;
}
