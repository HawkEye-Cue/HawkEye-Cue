// @social-lead-gen/shared
// Flock Activity — derives TODAY's confirmed posting activity from the Flock Safety
// Guard activity log (hawkeye_posting_activity_<sub>).
//
// Scope + guardrails (do NOT violate):
//  - READ-ONLY, device-local derivation. Reflects the user's CONFIRMED posts today
//    (Mass Flock / Today's Flocks / Copy & Open) from the already-deduped activity log.
//  - It does NOT read calendar events and MUST NOT be mixed with the historical,
//    calendar-based Posting Consistency / Flock Analytics (those stay past-only).
//  - The activity log is already cross-workflow deduped at write time by `recordPost`
//    (2-minute window keyed on normalized group URL, with id/name fallback). This util
//    only COUNTS surviving events — it never re-dedupes or re-counts, so the 2-minute
//    behavior is preserved exactly and nothing is double-counted.
//  - Today's boundary is the user's LOCAL calendar day (same convention the activity
//    log uses via postsToday).

import type { PostingActivityEvent, PostingWorkflow } from './flockSafety.js';

export interface TodayFlockActivity {
  total: number; // confirmed posts today (device-local), already deduped
  byWorkflow: Record<PostingWorkflow, number>; // 'mass' | 'today' | 'copyopen'
  hasActivity: boolean;
}

// Local midnight for `now` (matches flockSafety.postsToday).
function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Compute today's confirmed posting activity from the activity log.
 *
 * The input `events` are the already-persisted, already-deduped activity events. We
 * count only those whose `ts` falls within the user's local day [midnight, now]. Each
 * surviving event is attributed to the workflow that recorded it (for a cross-workflow
 * duplicate within the dedupe window, only the first confirmation survives in the log,
 * so it is counted once and attributed to that first workflow).
 *
 * Never counts openings/skips/drafts — those are never written to the activity log.
 */
export function computeFlockActivity(
  events: PostingActivityEvent[],
  now: number = Date.now(),
): TodayFlockActivity {
  const since = startOfLocalDay(now);
  const byWorkflow: Record<PostingWorkflow, number> = { mass: 0, today: 0, copyopen: 0 };
  let total = 0;
  for (const e of events || []) {
    if (!e || typeof e.ts !== 'number') continue;
    if (e.ts < since || e.ts > now) continue;
    total += 1;
    if (e.workflow === 'mass' || e.workflow === 'today' || e.workflow === 'copyopen') {
      byWorkflow[e.workflow] += 1;
    }
  }
  return { total, byWorkflow, hasActivity: total > 0 };
}
