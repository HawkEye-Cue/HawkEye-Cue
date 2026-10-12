import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  type FlockGroup,
  type PostRecordLike,
  partitionGroups,
  createSession,
  loadSession,
  saveSession,
  clearSession,
  queue,
  currentGroup,
  nextGroup,
  progress,
  markPosted,
  skipGroup,
  toggleSelected,
  setPaused,
  recentlyPostedWarning,
} from '../lib/massFlock';

/**
 * Mass Flock Posting — manually post the SAME prepared post across ALL saved Facebook
 * groups in one session, independent of the weekly schedule.
 *
 * - Reads the same saved groups as FlockGroupManager (hawkeye_flock_groups_<sub>).
 * - Session progress lives in its OWN localStorage key (device-specific; survives refresh).
 * - Opening a group NEVER marks it posted — only the explicit "Mark Posted & Next" does.
 * - Does NOT create calendar events, touch Missed Flocks, or change weekly schedules.
 * - The post text/image are prepared in the existing composer and passed in via props.
 */
export default function MassFlockPosting({
  onClose,
  getPreparedContent,
  readyImageSrc,
  onDownloadImage,
}: {
  onClose: () => void;
  // Returns the current prepared post text from the composer (empty string if none).
  getPreparedContent: () => string;
  // The currently-ready image (AI/uploaded), or null.
  readyImageSrc: string | null;
  // Reuse the existing image-save behavior (same as Copy & Open Next Flock).
  onDownloadImage: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const groupsKey = `hawkeye_flock_groups_${user?.sub}`;
  const historyKey = `hawkeye_post_history_${user?.sub || 'default'}`;

  const allGroups = useMemo<FlockGroup[]>(() => {
    try { return JSON.parse(localStorage.getItem(groupsKey) || '[]'); } catch { return []; }
  }, [groupsKey]);

  const history = useMemo<PostRecordLike[]>(() => {
    try { return JSON.parse(localStorage.getItem(historyKey) || '[]'); } catch { return []; }
  }, [historyKey]);

  const { valid: validGroups, invalid: invalidGroups } = useMemo(() => partitionGroups(allGroups), [allGroups]);

  // Resume an existing session if present, else start fresh (all valid groups selected).
  const [session, setSession] = useState(() => loadSession(user?.sub) || createSession(allGroups));
  const [phase, setPhase] = useState<'select' | 'run'>(() => (loadSession(user?.sub) ? 'run' : 'select'));
  const [acting, setActing] = useState(false); // guards against double-clicks

  // Persist session on every change (device-specific).
  useEffect(() => { saveSession(user?.sub, session); }, [session, user?.sub]);

  const cur = currentGroup(allGroups, session);
  const nxt = nextGroup(allGroups, session);
  const prog = progress(session);
  const q = queue(allGroups, session);
  const warning = cur ? recentlyPostedWarning(cur, history) : null;

  // Append to the SAME post-history store the daily flow uses (shape-compatible).
  const appendHistory = useCallback((content: string, group: FlockGroup) => {
    try {
      const now = new Date();
      const rec = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        content: content.slice(0, 2000),
        group: group.name,
        groupLink: group.link,
        postedAt: now.toISOString(),
        timeOfDay: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
      };
      const existing = JSON.parse(localStorage.getItem(historyKey) || '[]');
      localStorage.setItem(historyKey, JSON.stringify([rec, ...existing].slice(0, 200)));
    } catch { /* history is best-effort */ }
  }, [historyKey]);

  function copyAndOpen(group: FlockGroup) {
    const content = getPreparedContent();
    if (!content.trim()) { showToast('✍️ Prepare a post first (write or generate above)'); return; }
    try { navigator.clipboard.writeText(content); } catch { /* clipboard may be blocked; user can still paste manually from composer */ }
    if (readyImageSrc) { try { onDownloadImage(); } catch { /* image is optional */ } }
    const win = window.open(group.link, '_blank');
    if (!win) {
      showToast('⚠️ Popup blocked — allow popups, or open the group link manually');
    } else {
      showToast(readyImageSrc
        ? '✓ Text copied + photo saved — paste, attach photo, then post'
        : '✓ Copied & opened — paste and post, then come back');
    }
  }

  function confirmPostedAndNext() {
    if (acting || !cur) return;
    setActing(true);
    const content = getPreparedContent();
    appendHistory(content, cur);           // enrich history (dedupe signal next time)
    setSession((s) => markPosted(s, cur.id)); // idempotent — safe against double-click
    showToast(`✓ Marked posted: ${cur.name}`);
    setTimeout(() => setActing(false), 400);
  }

  function skip() {
    if (acting || !cur) return;
    setActing(true);
    setSession((s) => skipGroup(s, cur.id));
    showToast(`⤼ Skipped: ${cur.name}`);
    setTimeout(() => setActing(false), 400);
  }

  function finishOrClose() {
    clearSession(user?.sub);
    onClose();
  }

  // ─── SELECT PHASE ────────────────────────────────────────────────────────────
  if (phase === 'select') {
    const selectedCount = session.selectedIds.filter((id) => validGroups.some((g) => g.id === id)).length;
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] px-3 pt-3 pb-20 overflow-y-auto" onClick={onClose}>
        <div className="w-full max-w-md mx-auto bg-black border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100dvh - 7rem)' }} onClick={(e) => e.stopPropagation()}>
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-base font-bold text-white">🦅 Mass Flock Posting</h2>
              <p className="text-[10px] text-slate-400">Post across all your groups tonight — your weekly schedule is unchanged</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xl px-2">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-white">{selectedCount} of {validGroups.length} groups selected</p>
              <div className="flex gap-2">
                <button onClick={() => setSession((s) => ({ ...s, selectedIds: validGroups.map((g) => g.id) }))} className="text-[11px] text-amber-300 hover:text-amber-200">Select all</button>
                <button onClick={() => setSession((s) => ({ ...s, selectedIds: [] }))} className="text-[11px] text-slate-400 hover:text-white">Clear</button>
              </div>
            </div>

            {validGroups.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4">No groups with valid links. Add a Facebook group link in Manage Flock Groups first.</p>
            )}

            <div className="space-y-1.5">
              {validGroups.map((g) => {
                const checked = session.selectedIds.includes(g.id);
                return (
                  <label key={g.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${checked ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/10 bg-white/5'}`}>
                    <input type="checkbox" checked={checked} onChange={() => setSession((s) => toggleSelected(s, g.id))} className="w-4 h-4 rounded accent-amber-500 shrink-0" />
                    <span className="text-xs text-white flex-1 truncate">{g.name}</span>
                    <a href={g.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-400 hover:text-blue-300 text-xs shrink-0">🔗</a>
                  </label>
                );
              })}
            </div>

            {invalidGroups.length > 0 && (
              <div className="p-3 rounded-lg bg-red-950/30 border border-red-500/30">
                <p className="text-[11px] text-red-300 font-medium">⚠️ {invalidGroups.length} group{invalidGroups.length !== 1 ? 's' : ''} missing a valid link — can't be opened:</p>
                <ul className="mt-1 space-y-0.5">
                  {invalidGroups.map((g) => (<li key={g.id} className="text-[10px] text-slate-400 truncate">• {g.name || '(unnamed)'}</li>))}
                </ul>
                <p className="text-[10px] text-slate-500 mt-1">Add their links in Manage Flock Groups to include them.</p>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-white/10 space-y-2 shrink-0">
            <button
              onClick={() => { if (selectedCount === 0) { showToast('Select at least one group'); return; } setPhase('run'); }}
              disabled={selectedCount === 0}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-lg disabled:opacity-50 transition-colors"
            >
              Start posting {selectedCount} group{selectedCount !== 1 ? 's' : ''} →
            </button>
            <button onClick={onClose} className="w-full py-2 text-slate-400 text-xs hover:text-white transition-colors">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── RUN PHASE ───────────────────────────────────────────────────────────────
  const allDone = q.length === 0;
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] px-3 pt-3 pb-20 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-md mx-auto bg-black border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100dvh - 7rem)' }} onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">🦅 Mass Flock Posting</h2>
            <p className="text-[10px] text-slate-400">{prog.posted} of {prog.selected} posted · {prog.remaining} remaining{prog.skipped ? ` · ${prog.skipped} skipped` : ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl px-2">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Progress bar */}
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all" style={{ width: `${prog.selected ? Math.round((prog.posted + prog.skipped) / prog.selected * 100) : 0}%` }} />
          </div>

          {allDone ? (
            <div className="text-center py-6">
              <p className="text-3xl mb-2">🎉</p>
              <p className="text-sm font-bold text-green-300">Session complete!</p>
              <p className="text-xs text-slate-400 mt-1">{prog.posted} posted{prog.skipped ? `, ${prog.skipped} skipped` : ''}. Your weekly schedule is unchanged.</p>
            </div>
          ) : session.paused ? (
            <div className="text-center py-6">
              <p className="text-2xl mb-2">⏸️</p>
              <p className="text-sm font-bold text-amber-300">Paused</p>
              <p className="text-xs text-slate-400 mt-1">Your progress is saved. Resume whenever you're ready.</p>
              <button onClick={() => setSession((s) => setPaused(s, false))} className="mt-3 px-5 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400">▶ Resume</button>
            </div>
          ) : (
            <>
              {/* Current group */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Current group</p>
                <p className="text-sm font-bold text-white truncate">{cur?.name}</p>
                {nxt && <p className="text-[10px] text-slate-500 mt-1">Next: {nxt.name}</p>}
              </div>

              {/* Recently-posted warning (only when history supports it) */}
              {warning && (
                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/40">
                  <p className="text-[11px] text-amber-300">⚠️ {warning}</p>
                </div>
              )}

              {!getPreparedContent().trim() && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                  <p className="text-xs text-amber-300">✍️ Prepare your post in the composer above first, then come back.</p>
                </div>
              )}

              <button
                onClick={() => cur && copyAndOpen(cur)}
                disabled={!cur || !getPreparedContent().trim()}
                className="w-full px-4 py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black text-sm font-bold rounded-lg disabled:opacity-50 transition-all active:scale-95 flex flex-col items-center justify-center gap-1 shadow-lg shadow-amber-500/20"
              >
                <span>{readyImageSrc ? '📋 Copy Text + Photo & Open Group' : '📋 Copy & Open This Group'}</span>
                <span className="text-xs font-normal opacity-80 truncate max-w-full">{cur?.name}</span>
              </button>
              <p className="text-[10px] text-slate-500 text-center">Opening the group does NOT mark it posted. Post on Facebook, then confirm below.</p>

              <button
                onClick={confirmPostedAndNext}
                disabled={acting || !cur}
                className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-lg disabled:opacity-50 transition-all active:scale-95"
              >
                ✓ Mark Posted & Next
              </button>

              <div className="flex gap-2">
                <button onClick={skip} disabled={acting || !cur} className="flex-1 py-2 bg-white/5 border border-white/10 text-slate-300 text-xs rounded-lg hover:bg-white/10 disabled:opacity-50">⤼ Skip group</button>
                <button onClick={() => setSession((s) => setPaused(s, true))} className="flex-1 py-2 bg-white/5 border border-white/10 text-slate-300 text-xs rounded-lg hover:bg-white/10">⏸ Pause</button>
              </div>
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-white/10 space-y-2 shrink-0">
          {allDone ? (
            <button onClick={finishOrClose} className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-lg">Done — close & clear session</button>
          ) : (
            <>
              <button onClick={onClose} className="w-full py-2 text-slate-400 text-xs hover:text-white transition-colors">Leave (progress saved — resume later)</button>
              <button onClick={finishOrClose} className="w-full py-1.5 text-red-400/70 text-[11px] hover:text-red-300 transition-colors">End session & clear progress</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
