// Pure helpers for Mass Flock Posting — manual, user-controlled posting across ALL
// saved Facebook groups in one session, independent of the weekly Flocks schedule.
//
// Design constraints (do NOT violate):
//  - Reads the SAME saved groups as FlockGroupManager (localStorage hawkeye_flock_groups_<sub>).
//  - Does NOT create calendar events, touch Missed Flocks, or change weekly schedules.
//  - Opening a group never marks it posted; only explicit confirmation does.
//  - Session progress persisted in its OWN localStorage key (device-specific).

export interface FlockGroup {
  id: string;
  name: string;
  link: string;
  postingDays?: number[];
  anyday?: boolean;
}

export interface PostRecordLike {
  group?: string;
  groupLink?: string;
  postedAt?: string;
}

export interface MassFlockSession {
  selectedIds: string[];   // groups chosen for this session
  postedIds: string[];     // groups the user explicitly confirmed posted
  skippedIds: string[];    // groups the user skipped (not counted as posted)
  currentIndex: number;    // pointer into the ordered selected list
  paused: boolean;
  startedAt: string;       // ISO
}

// A valid group link is a non-empty, http(s) URL. Groups without one cannot be opened,
// so they are surfaced separately rather than silently dropped.
export function hasValidLink(g: FlockGroup): boolean {
  if (!g || typeof g.link !== 'string') return false;
  const l = g.link.trim();
  if (!l) return false;
  return /^https?:\/\//i.test(l);
}

export function partitionGroups(groups: FlockGroup[]): { valid: FlockGroup[]; invalid: FlockGroup[] } {
  const valid: FlockGroup[] = [];
  const invalid: FlockGroup[] = [];
  for (const g of groups || []) (hasValidLink(g) ? valid : invalid).push(g);
  return { valid, invalid };
}

// Build a fresh session. By default selects every group WITH a valid link.
// Optional preselectIds narrows the initial selection to those ids (intersected with
// valid groups) — used to preselect "today's scheduled flocks" when launched from the
// post editor. If preselectIds is omitted/empty-after-intersection, we fall back to all
// valid groups so the user is never left with an empty selection.
export function createSession(groups: FlockGroup[], preselectIds?: string[]): MassFlockSession {
  const { valid } = partitionGroups(groups);
  const validIds = valid.map((g) => g.id);
  let selectedIds = validIds;
  if (preselectIds && preselectIds.length > 0) {
    const narrowed = validIds.filter((id) => preselectIds.includes(id));
    if (narrowed.length > 0) selectedIds = narrowed; // fall back to all-valid if none match
  }
  return {
    selectedIds,
    postedIds: [],
    skippedIds: [],
    currentIndex: 0,
    paused: false,
    startedAt: new Date().toISOString(),
  };
}

// The ordered list of selected groups still queued (not posted, not skipped), preserving
// the order of `groups`. This drives "current" and "next".
export function queue(groups: FlockGroup[], session: MassFlockSession): FlockGroup[] {
  const sel = new Set(session.selectedIds);
  const done = new Set([...session.postedIds, ...session.skippedIds]);
  return (groups || []).filter((g) => sel.has(g.id) && hasValidLink(g) && !done.has(g.id));
}

export function currentGroup(groups: FlockGroup[], session: MassFlockSession): FlockGroup | null {
  const q = queue(groups, session);
  return q[0] || null;
}

export function nextGroup(groups: FlockGroup[], session: MassFlockSession): FlockGroup | null {
  const q = queue(groups, session);
  return q[1] || null;
}

export interface Progress {
  posted: number;
  selected: number;
  remaining: number;
  skipped: number;
}

export function progress(session: MassFlockSession): Progress {
  const posted = session.postedIds.length;
  const skipped = session.skippedIds.length;
  const selected = session.selectedIds.length;
  const remaining = Math.max(0, selected - posted - skipped);
  return { posted, selected, remaining, skipped };
}

// Mark a group posted — idempotent (prevents double-click / duplicate completion).
export function markPosted(session: MassFlockSession, groupId: string): MassFlockSession {
  if (!groupId) return session;
  if (session.postedIds.includes(groupId)) return session; // already posted → no-op
  return {
    ...session,
    postedIds: [...session.postedIds, groupId],
    // If it was skipped earlier, un-skip (posting supersedes skip).
    skippedIds: session.skippedIds.filter((id) => id !== groupId),
  };
}

// Skip a group — not recorded as posted.
export function skipGroup(session: MassFlockSession, groupId: string): MassFlockSession {
  if (!groupId) return session;
  if (session.skippedIds.includes(groupId) || session.postedIds.includes(groupId)) return session;
  return { ...session, skippedIds: [...session.skippedIds, groupId] };
}

export function toggleSelected(session: MassFlockSession, groupId: string): MassFlockSession {
  const has = session.selectedIds.includes(groupId);
  return {
    ...session,
    selectedIds: has ? session.selectedIds.filter((id) => id !== groupId) : [...session.selectedIds, groupId],
  };
}

export function setPaused(session: MassFlockSession, paused: boolean): MassFlockSession {
  return { ...session, paused };
}

// Recently-posted check from available history. Returns a warning string if the group's
// link OR name appears in history within `withinDays`. If history is empty/unavailable
// we return null (unknown) — callers must NOT claim "safe"/"never posted" in that case.
export function recentlyPostedWarning(
  group: FlockGroup,
  history: PostRecordLike[],
  withinDays = 7,
  now: number = Date.now(),
): string | null {
  if (!group || !Array.isArray(history) || history.length === 0) return null;
  const cutoff = now - withinDays * 24 * 60 * 60 * 1000;
  const linkLower = (group.link || '').trim().toLowerCase();
  const nameLower = (group.name || '').trim().toLowerCase();
  for (const r of history) {
    const ts = r.postedAt ? new Date(r.postedAt).getTime() : NaN;
    if (isNaN(ts) || ts < cutoff) continue;
    const rLink = (r.groupLink || '').trim().toLowerCase();
    const rName = (r.group || '').trim().toLowerCase();
    if ((linkLower && rLink && rLink === linkLower) || (nameLower && rName && rName === nameLower)) {
      return 'You recently posted in this group. Check the group\'s posting rules before posting again.';
    }
  }
  return null;
}

// Session persistence key — device-specific (localStorage), scoped per user.
export function sessionKey(userSub: string | undefined): string {
  return `hawkeye_massflock_session_${userSub || 'default'}`;
}

export function loadSession(userSub: string | undefined): MassFlockSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(userSub));
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.selectedIds)) return null;
    return {
      selectedIds: s.selectedIds || [],
      postedIds: s.postedIds || [],
      skippedIds: s.skippedIds || [],
      currentIndex: typeof s.currentIndex === 'number' ? s.currentIndex : 0,
      paused: !!s.paused,
      startedAt: s.startedAt || new Date().toISOString(),
    };
  } catch { return null; }
}

export function saveSession(userSub: string | undefined, session: MassFlockSession): void {
  try { localStorage.setItem(sessionKey(userSub), JSON.stringify(session)); } catch { /* ignore */ }
}

export function clearSession(userSub: string | undefined): void {
  try { localStorage.removeItem(sessionKey(userSub)); } catch { /* ignore */ }
}
