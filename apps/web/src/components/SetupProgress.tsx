import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTrade } from '../contexts/TradeContext';

interface SetupTask {
  id: string;
  label: string;
  done: boolean;
  path: string;
}

/**
 * Dashboard setup progress indicator.
 * Shows "You're X% set up" until the user completes the key onboarding steps.
 * Auto-hides once everything is done or the user dismisses it.
 */
export default function SetupProgress() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedTrade } = useTrade();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(`hawkeye_setup_progress_dismissed_${user?.sub}`) === 'true');
  const [, forceRender] = useState(0);

  // Re-check completion state when the component mounts / user returns
  useEffect(() => {
    const interval = setInterval(() => forceRender((n) => n + 1), 2000);
    return () => clearInterval(interval);
  }, []);

  if (dismissed) return null;

  const tasks: SetupTask[] = [
    { id: 'trade', label: 'Pick your trade', done: !!selectedTrade, path: '/settings' },
    { id: 'keywords', label: 'Add keywords', done: localStorage.getItem(`hawkeye_keywords_added_${user?.sub}`) === 'true', path: '/settings' },
    { id: 'post', label: 'Create a post', done: localStorage.getItem(`hawkeye_first_post_${user?.sub}`) === 'true', path: '/create' },
    { id: 'lead', label: 'Save a lead', done: localStorage.getItem(`hawkeye_first_lead_${user?.sub}`) === 'true', path: '/opportunities' },
    { id: 'deal', label: 'Log a sale', done: localStorage.getItem(`hawkeye_first_deal_${user?.sub}`) === 'true', path: '/sales' },
  ];

  const doneCount = tasks.filter((t) => t.done).length;
  const pct = Math.round((doneCount / tasks.length) * 100);

  // Auto-hide when fully set up
  if (pct === 100) return null;

  function dismiss() {
    localStorage.setItem(`hawkeye_setup_progress_dismissed_${user?.sub}`, 'true');
    setDismissed(true);
  }

  const nextTask = tasks.find((t) => !t.done);

  return (
    <div className="glass-card border border-blue-500/20">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🦅</span>
          <span className="text-sm font-semibold text-white">You're {pct}% set up</span>
        </div>
        <button onClick={dismiss} className="text-slate-500 hover:text-white text-xs">Dismiss</button>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Task chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {tasks.map((t) => (
          <span
            key={t.id}
            className={`text-[10px] px-2 py-1 rounded-full border ${
              t.done
                ? 'bg-green-500/15 text-green-300 border-green-500/30'
                : 'bg-slate-700 text-slate-400 border-white/10'
            }`}
          >
            {t.done ? '✓' : '○'} {t.label}
          </span>
        ))}
      </div>

      {/* Next step button */}
      {nextTask && (
        <button
          onClick={() => navigate(nextTask.path)}
          className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-sm font-bold rounded-lg transition-all active:scale-95"
        >
          Next: {nextTask.label} →
        </button>
      )}
    </div>
  );
}
