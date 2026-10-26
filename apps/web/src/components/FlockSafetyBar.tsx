// Flock Safety Guard banner — a small, mobile-friendly, advisory bar shown at the top
// of the posting area across all three workflows (Today's Flocks, Copy & Open, Mass
// Flock). It shows today's confirmed-post count, an optional gentle pacing reminder,
// and manual pause / "Facebook restricted me" controls.
//
// Advisory-only: nothing here auto-posts or evades restrictions, and no copy claims a
// number is "Facebook-safe". Pausing is manual-resume only (no timer auto-resume).

import type { UseFlockSafety } from '../hooks/useFlockSafety';

export default function FlockSafetyBar({ safety }: { safety: UseFlockSafety }) {
  const { postsToday, paused, pauseReason, pause, resume, reminder, dismissReminder } = safety;

  // Paused state takes over the bar — clearly visible, with an explicit Resume button.
  if (paused) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">⏸️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-200">
              {pauseReason === 'restricted' ? 'Posting paused — Facebook flagged your account' : 'Posting paused'}
            </p>
            <p className="text-[11px] text-slate-300">
              {pauseReason === 'restricted'
                ? 'Take a break and review the group rules. Resume only when you’re ready — nothing posts automatically.'
                : 'Your flocks are on hold. Resume whenever you’re ready — nothing posts automatically.'}
            </p>
          </div>
        </div>
        <button
          onClick={resume}
          className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-lg transition-colors active:scale-95"
        >
          ▶ Resume posting
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">🛡️</span>
          <p className="text-xs text-slate-300">
            <span className="font-bold text-white">{postsToday}</span> confirmed post{postsToday !== 1 ? 's' : ''} today
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => pause('user')}
            className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-[11px] font-medium hover:bg-white/10 transition-colors"
          >
            ⏸ Pause posting
          </button>
          <button
            onClick={() => pause('restricted')}
            className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 text-[11px] font-medium hover:bg-red-500/20 transition-colors"
          >
            🚫 Facebook restricted me
          </button>
        </div>
      </div>

      {/* Gentle pacing reminder — advisory wording only, dismissible. */}
      {reminder.remind && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 flex items-start gap-2">
          <span className="text-sm">🪶</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-amber-200 leading-snug">
              You’ve confirmed several posts in a short time. You may want to spread them out and consider
              pacing yourself — rapid bursts can draw extra attention on Facebook.
            </p>
          </div>
          <button
            onClick={dismissReminder}
            aria-label="Dismiss reminder"
            className="text-slate-400 hover:text-white text-xs shrink-0 px-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
