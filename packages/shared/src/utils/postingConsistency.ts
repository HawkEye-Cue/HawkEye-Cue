// @social-lead-gen/shared
// Posting Consistency — pure derivation over calendar events for the Hawk Insights
// "Posting Consistency" section (Create Tab Redesign, Requirement 2).
//
// This is a READ-ONLY derivation. It never mutates or deletes events; it only
// summarizes past Flock completion so the Create page can stop carrying the Missed
// Flocks backlog while preserving all underlying historical records.

import { isFlockEvent } from '../flocks.js';

export interface ConsistencyEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type?: string;
  link?: string | null;
  completed?: boolean;
}

export interface PostingConsistency {
  completionRate: number; // 0-100, completed / past flocks
  postedCount: number; // past flocks completed
  missedCount: number; // past flocks not completed
  pastFlockCount: number; // postedCount + missedCount
  currentStreakDays: number; // consecutive most-recent days (that had flocks) fully completed
  weeklyTrend: { week: string; total: number; completed: number }[]; // last 4 weeks
  recentMissed: { date: string; title: string; link?: string | null }[]; // read-only, newest first
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Derive posting-consistency metrics from calendar events.
 *
 * @param events  all calendar events (any shape with the ConsistencyEvent fields)
 * @param today   YYYY-MM-DD "today" boundary; only events with date < today count as "past"
 * @param now     optional Date for the weekly-trend window (defaults to new Date())
 */
export function computePostingConsistency(
  events: ConsistencyEvent[],
  today: string,
  now: Date = new Date(),
): PostingConsistency {
  const flocks = (events || []).filter(isFlockEvent);
  const past = flocks.filter((e) => e.date < today);

  const posted = past.filter((e) => !!e.completed);
  const missed = past.filter((e) => !e.completed);

  const postedCount = posted.length;
  const missedCount = missed.length;
  const pastFlockCount = postedCount + missedCount;
  const completionRate = pastFlockCount > 0 ? Math.round((postedCount / pastFlockCount) * 100) : 0;

  // ── recentMissed: every past uncompleted flock, newest first (read-only) ──
  const recentMissed = [...missed]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((e) => ({ date: e.date, title: e.title, link: e.link ?? null }));

  // ── currentStreakDays: walk back from the most recent past day that HAD flocks;
  // count consecutive such days where every flock that day was completed. Stop at the
  // first day with any miss. Days without flocks are skipped (don't break the streak). ──
  const byDate = new Map<string, { total: number; completed: number }>();
  for (const e of past) {
    const slot = byDate.get(e.date) || { total: 0, completed: 0 };
    slot.total += 1;
    if (e.completed) slot.completed += 1;
    byDate.set(e.date, slot);
  }
  const daysWithFlocks = Array.from(byDate.keys()).sort().reverse(); // newest first
  let currentStreakDays = 0;
  for (const day of daysWithFlocks) {
    const slot = byDate.get(day)!;
    if (slot.total > 0 && slot.completed === slot.total) currentStreakDays += 1;
    else break;
  }

  // ── weeklyTrend: last 4 weeks (reusing the existing Flock Analytics window shape) ──
  const weeklyTrend: { week: string; total: number; completed: number }[] = [];
  for (let i = 3; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - i * 7 - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const ws = ymd(weekStart);
    const we = ymd(weekEnd);
    const weekPosts = past.filter((e) => e.date >= ws && e.date <= we);
    weeklyTrend.push({
      week: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      total: weekPosts.length,
      completed: weekPosts.filter((e) => e.completed).length,
    });
  }

  return {
    completionRate,
    postedCount,
    missedCount,
    pastFlockCount,
    currentStreakDays,
    weeklyTrend,
    recentMissed,
  };
}
