// @social-lead-gen/shared
// Flock Safety Guard — prelaunch account-safety helpers for the manual Flock posting
// workflows (Today's Flocks, Mass Flock, Copy & Open).
//
// Scope + guardrails (do NOT violate):
//  - FRONTEND-ONLY, advisory-only. This never auto-posts, never evades restrictions,
//    and never claims any number/cadence is "Facebook-safe" or "approved". All copy
//    is non-prescriptive ("may"/"consider"/"review"). Thresholds here are internal
//    cautions, NOT guaranteed-safe limits.
//  - Pure + localStorage-agnostic core logic. Callers pass data in; thin wrappers
//    perform localStorage side effects (guarded with try/catch).
//  - When information is unknown (e.g. a group's frequency limit is not stored), we
//    surface "unknown" and never assert the post is safe.
//
// The activity log is a lightweight, cross-workflow record of CONFIRMED posts (the
// user explicitly confirmed they posted). It exists to power a gentle pacing reminder
// and a today's-count display — it is independent of calendar events, post history,
// and the Mass Flock session, and must not double-count the same confirmation.

// ─── (a) Activity log ─────────────────────────────────────────────────────────

export type PostingWorkflow = 'today' | 'mass' | 'copyopen';

export interface PostingActivityEvent {
  groupId: string;
  groupLink?: string;
  groupName?: string;
  ts: number; // epoch ms when the post was confirmed
  workflow: PostingWorkflow;
}

const MAX_ACTIVITY_EVENTS = 500;
const DEFAULT_DEDUPE_WINDOW_MS = 120_000; // 2 minutes

export function activityKey(sub: string | undefined): string {
  return `hawkeye_posting_activity_${sub || 'default'}`;
}

// Identity used for dedupe/matching: prefer groupId, fall back to groupLink.
function eventIdentity(e: { groupId?: string; groupLink?: string }): string | null {
  const id = (e.groupId || '').trim();
  if (id) return `id:${id}`;
  const link = (e.groupLink || '').trim().toLowerCase();
  if (link) return `link:${link}`;
  return null;
}

/**
 * Record a confirmed post. Returns a NEW array (never mutates the input).
 *
 * DEDUPE: if an event with the SAME identity (groupId, or groupLink when groupId is
 * missing) already exists within `dedupeWindowMs`, the new event is ignored. This
 * prevents double-counting when the same confirmation is observed by more than one
 * workflow, or on an accidental double-click. Keeps at most the last MAX_ACTIVITY_EVENTS.
 */
export function recordPost(
  events: PostingActivityEvent[],
  event: PostingActivityEvent,
  dedupeWindowMs: number = DEFAULT_DEDUPE_WINDOW_MS,
): PostingActivityEvent[] {
  const list = Array.isArray(events) ? events : [];
  const identity = eventIdentity(event);
  if (identity) {
    const cutoff = event.ts - Math.max(0, dedupeWindowMs);
    const dup = list.some(
      (e) => e.ts >= cutoff && e.ts <= event.ts + Math.max(0, dedupeWindowMs) && eventIdentity(e) === identity,
    );
    if (dup) return list; // treat as the same confirmation → no double count
  }
  const next = [...list, event];
  // Keep chronological order and cap length (drop oldest).
  next.sort((a, b) => a.ts - b.ts);
  return next.length > MAX_ACTIVITY_EVENTS ? next.slice(next.length - MAX_ACTIVITY_EVENTS) : next;
}

// Local midnight for `now`.
function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function postsToday(events: PostingActivityEvent[], now: number = Date.now()): number {
  const since = startOfDay(now);
  return (events || []).filter((e) => e.ts >= since && e.ts <= now).length;
}

export function postsInWindow(
  events: PostingActivityEvent[],
  windowMs: number,
  now: number = Date.now(),
): number {
  const since = now - Math.max(0, windowMs);
  return (events || []).filter((e) => e.ts >= since && e.ts <= now).length;
}

// ─── (b) Pacing reminder (ADVISORY ONLY) ────────────────────────────────────────

export interface PacingState {
  lastRemindedAt?: number;
}

export interface PacingOpts {
  windowMs?: number;   // rolling window for the burst check
  threshold?: number;  // posts within the window that may warrant a reminder
  cooldownMs?: number; // minimum gap between reminders
}

const DEFAULT_PACING: Required<PacingOpts> = {
  windowMs: 10 * 60 * 1000, // 10 minutes
  threshold: 6,             // concentrated burst
  cooldownMs: 10 * 60 * 1000, // don't repeat within 10 minutes
};

/**
 * Decide whether to surface a gentle pacing reminder. ADVISORY ONLY — the threshold is
 * an internal caution about a concentrated burst, NOT a claim about a safe limit.
 *
 * Triggers when posts within the window meet/exceed the threshold AND it has been at
 * least `cooldownMs` since the last reminder (so the user isn't nagged repeatedly).
 */
export function shouldRemind(
  events: PostingActivityEvent[],
  pacingState: PacingState | undefined,
  now: number = Date.now(),
  opts?: PacingOpts,
): { remind: boolean; count: number } {
  const o = { ...DEFAULT_PACING, ...(opts || {}) };
  const count = postsInWindow(events, o.windowMs, now);
  const last = pacingState?.lastRemindedAt ?? 0;
  const cooledDown = now - last >= o.cooldownMs;
  return { remind: count >= o.threshold && cooledDown, count };
}

// ─── (c) Shared pause state (manual resume only — NO timer auto-resume) ─────────

export interface PauseState {
  paused: boolean;
  reason?: 'user' | 'restricted';
  since?: string; // ISO timestamp when paused
}

export function pauseKey(sub: string | undefined): string {
  return `hawkeye_flock_pause_${sub || 'default'}`;
}

export function setPaused(
  state: PauseState | undefined,
  paused: boolean,
  reason?: 'user' | 'restricted',
): PauseState {
  if (!paused) return { paused: false };
  return {
    paused: true,
    reason: reason || state?.reason || 'user',
    since: state?.paused && state.since ? state.since : new Date().toISOString(),
  };
}

// ─── (d) Group-rule evaluation ──────────────────────────────────────────────────

export interface RuleEvalInput {
  group: {
    postingDays?: number[];
    anyday?: boolean;
    frequencyLimit?: string;
    name?: string;
    link?: string;
  };
  today: number; // 0-6 (getDay)
  history: { groupLink?: string; group?: string; postedAt?: string }[];
  now: number;
}

export interface RuleEvalResult {
  dayStatus: 'allowed' | 'not-allowed' | 'unknown';
  frequencyStatus: 'ok' | 'possible-violation' | 'unknown';
  recentlyPosted: boolean;
  needsReview: boolean;
  messages: string[];
}

// Was this group posted to within the last `days`? Mirrors massFlock.recentlyPostedWarning
// (match on link OR name within the window).
function postedWithin(
  input: RuleEvalInput,
  days: number,
): boolean {
  const { group, history, now } = input;
  if (!Array.isArray(history) || history.length === 0) return false;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const linkLower = (group.link || '').trim().toLowerCase();
  const nameLower = (group.name || '').trim().toLowerCase();
  for (const r of history) {
    const ts = r.postedAt ? new Date(r.postedAt).getTime() : NaN;
    if (isNaN(ts) || ts < cutoff || ts > now) continue;
    const rLink = (r.groupLink || '').trim().toLowerCase();
    const rName = (r.group || '').trim().toLowerCase();
    if ((linkLower && rLink && rLink === linkLower) || (nameLower && rName && rName === nameLower)) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluate a group's posting rules for surfacing in the UI. Advisory-only. 'unknown'
 * never auto-blocks but MUST be surfaced so the user checks the group's own rules. We
 * never assert a post is "safe".
 */
export function evaluateGroupRules(input: RuleEvalInput): RuleEvalResult {
  const { group, today } = input;
  const messages: string[] = [];

  // Day status.
  let dayStatus: RuleEvalResult['dayStatus'];
  if (group.anyday === true) {
    dayStatus = 'allowed';
  } else if (Array.isArray(group.postingDays) && group.postingDays.length > 0) {
    dayStatus = group.postingDays.includes(today) ? 'allowed' : 'not-allowed';
  } else {
    dayStatus = 'unknown';
  }

  if (dayStatus === 'not-allowed') {
    messages.push('Today is not a permitted posting day for this group — review before posting.');
  } else if (dayStatus === 'unknown') {
    messages.push("This group's permitted posting days weren't recorded — check the group's rules before posting.");
  }

  // Frequency status (lenient, case-insensitive parse).
  let frequencyStatus: RuleEvalResult['frequencyStatus'];
  const freqRaw = (group.frequencyLimit || '').trim().toLowerCase();
  if (!freqRaw) {
    frequencyStatus = 'unknown';
    messages.push("This group's posting frequency limit wasn't recorded — check the group's rules before posting.");
  } else {
    const mentionsWeek = freqRaw.includes('week'); // covers "week"/"weekly"
    const mentionsDay = freqRaw.includes('day') || freqRaw.includes('daily');
    if (mentionsWeek && postedWithin(input, 7)) {
      frequencyStatus = 'possible-violation';
      messages.push("This group may limit posts per week and you've posted here recently — review before posting again.");
    } else if (mentionsDay && postedWithin(input, 1)) {
      frequencyStatus = 'possible-violation';
      messages.push('This group may limit posts per day and you may have already posted here today — review before posting again.');
    } else if (mentionsWeek || mentionsDay) {
      frequencyStatus = 'ok';
    } else {
      // We have some text but can't confidently interpret it — never claim safe.
      frequencyStatus = 'unknown';
      messages.push("This group's posting rules weren't fully read — check them before posting.");
    }
  }

  const recentlyPosted = postedWithin(input, 7);

  const needsReview = dayStatus === 'not-allowed' || frequencyStatus === 'possible-violation';

  return { dayStatus, frequencyStatus, recentlyPosted, needsReview, messages };
}

// ─── localStorage wrappers (thin, side-effecting, guarded) ──────────────────────
// Kept here so web/mobile share one persistence contract. All guarded with try/catch
// and safe to call in non-browser/test environments (they no-op if localStorage is
// unavailable). Pure logic above is what the tests exercise directly.

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function loadActivity(sub: string | undefined): PostingActivityEvent[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = localStorage.getItem(activityKey(sub));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => e && typeof e.ts === 'number' && typeof e.groupId === 'string');
  } catch {
    return [];
  }
}

export function saveActivity(sub: string | undefined, events: PostingActivityEvent[]): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(activityKey(sub), JSON.stringify(events || []));
  } catch {
    /* ignore */
  }
}

export function clearActivity(sub: string | undefined): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.removeItem(activityKey(sub));
  } catch {
    /* ignore */
  }
}

export function loadPause(sub: string | undefined): PauseState {
  if (!hasLocalStorage()) return { paused: false };
  try {
    const raw = localStorage.getItem(pauseKey(sub));
    if (!raw) return { paused: false };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.paused !== 'boolean') return { paused: false };
    return {
      paused: parsed.paused,
      reason: parsed.reason === 'restricted' || parsed.reason === 'user' ? parsed.reason : undefined,
      since: typeof parsed.since === 'string' ? parsed.since : undefined,
    };
  } catch {
    return { paused: false };
  }
}

export function savePause(sub: string | undefined, state: PauseState): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(pauseKey(sub), JSON.stringify(state || { paused: false }));
  } catch {
    /* ignore */
  }
}

export function clearPause(sub: string | undefined): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.removeItem(pauseKey(sub));
  } catch {
    /* ignore */
  }
}

// Pacing state persistence (only the last-reminded timestamp needs to survive refresh
// so the cooldown is honored across sessions).
export function pacingKey(sub: string | undefined): string {
  return `hawkeye_flock_pacing_${sub || 'default'}`;
}

export function loadPacing(sub: string | undefined): PacingState {
  if (!hasLocalStorage()) return {};
  try {
    const raw = localStorage.getItem(pacingKey(sub));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return { lastRemindedAt: typeof parsed.lastRemindedAt === 'number' ? parsed.lastRemindedAt : undefined };
  } catch {
    return {};
  }
}

export function savePacing(sub: string | undefined, state: PacingState): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(pacingKey(sub), JSON.stringify(state || {}));
  } catch {
    /* ignore */
  }
}
