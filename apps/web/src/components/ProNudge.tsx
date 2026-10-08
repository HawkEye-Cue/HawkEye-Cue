import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useMode } from '../contexts/ModeContext';
import { useToast } from '../contexts/ToastContext';

interface Props {
  /** Unique id for this nudge so it only ever shows once per user. */
  id: string;
  /** Whether the "power moment" condition is currently met. */
  when: boolean;
  /** Plain-language reason this user might like Pro. */
  message: string;
}

/**
 * A gentle, one-time prompt suggesting Pro mode when a Guided user hits a
 * "power moment" (e.g. lots of leads, wanting to organize). Dismissible,
 * never nags twice, and only ever appears in Guided mode.
 */
export default function ProNudge({ id, when, message }: Props) {
  const { user } = useAuth();
  const { isGuided, setMode } = useMode();
  const { showToast } = useToast();
  const key = `hawkeye_pronudge_${id}_${user?.sub || 'anon'}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(key) === 'true'; } catch { return false; }
  });

  // Only show in Guided mode, when the condition is met, and never twice.
  if (!isGuided || !when || dismissed) return null;

  function close() {
    try { localStorage.setItem(key, 'true'); } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-start gap-3">
      <span className="text-xl shrink-0">⚡</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">Ready for more power?</p>
        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{message}</p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => { setMode('pro'); close(); showToast('⚡ Pro mode on — advanced tools unlocked'); }}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold rounded-lg transition-all active:scale-95"
          >
            Turn on Pro
          </button>
          <button
            onClick={close}
            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-medium rounded-lg"
          >
            Not now
          </button>
        </div>
      </div>
      <button onClick={close} className="text-slate-500 hover:text-white text-sm shrink-0" aria-label="Dismiss">✕</button>
    </div>
  );
}
