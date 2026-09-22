import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export interface FlightTask {
  id: string;
  // Plain-language label first; branded subtitle is optional
  title: string;
  subtitle?: string;
  detail?: string;
  icon: string;
  // Where tapping "Do this" should take the user
  actionLabel: string;
  route: string;
  count?: number;
}

interface Props {
  tasks: FlightTask[];
  onClose: () => void;
}

/**
 * FlightPlan — a calm, one-task-at-a-time guided checklist.
 * Walks the user through what needs attention today. No dense dashboards.
 */
export default function FlightPlan({ tasks, onClose }: Props) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());

  const total = tasks.length;
  const current = tasks[index];
  const completedCount = done.size;
  const pct = total > 0 ? Math.round((Math.min(completedCount, total) / total) * 100) : 100;
  const finished = index >= total;

  function advance(markDone: boolean) {
    if (markDone && current) {
      setDone((prev) => new Set(prev).add(current.id));
    }
    setIndex((i) => i + 1);
  }

  function goDoIt() {
    if (!current) return;
    // Mark it as attended-to and route there
    setDone((prev) => new Set(prev).add(current.id));
    navigate(current.route);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex flex-col" style={{ paddingTop: '4rem' }} onClick={onClose}>
      <div
        className="mx-auto w-full max-w-lg px-3 flex-1 overflow-y-auto pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + progress */}
        <div className="flex items-center justify-between mb-3 pt-2">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">🦅 Your Flight Plan</h2>
            <p className="text-xs text-slate-400">One thing at a time. Knock these out and get back to business.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none px-2">✕</button>
        </div>

        <div className="h-2 rounded-full bg-slate-800 overflow-hidden mb-5">
          <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>

        {!finished && current ? (
          <div className="glass-card space-y-4 border border-amber-500/20">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500 uppercase tracking-wide">Step {index + 1} of {total}</span>
              {typeof current.count === 'number' && current.count > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">{current.count}</span>
              )}
            </div>

            <div className="flex items-start gap-3">
              <span className="text-4xl shrink-0">{current.icon}</span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white leading-snug">{current.title}</h3>
                {current.subtitle && <p className="text-[11px] text-amber-300/80 mt-0.5">{current.subtitle}</p>}
                {current.detail && <p className="text-xs text-slate-400 mt-2 leading-relaxed">{current.detail}</p>}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={goDoIt}
                className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-yellow-400 text-black text-sm font-bold rounded-xl hover:opacity-90 active:scale-95 transition-all"
              >
                {current.actionLabel} →
              </button>
              <button
                onClick={() => advance(false)}
                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-xl transition-all"
              >
                Skip
              </button>
            </div>

            <button onClick={() => advance(true)} className="w-full text-[11px] text-slate-500 hover:text-slate-300">
              Mark done & next
            </button>
          </div>
        ) : (
          <div className="glass-card text-center space-y-4 border border-emerald-500/20 py-8">
            <div className="text-5xl">✅</div>
            <h3 className="text-lg font-bold text-white">Flight plan complete</h3>
            <p className="text-sm text-slate-400">
              {completedCount > 0 ? `You handled ${completedCount} ${completedCount === 1 ? 'thing' : 'things'} today.` : 'Nothing pressing right now.'} Nice work — go run your business.
            </p>
            <button onClick={onClose} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl">
              Done
            </button>
          </div>
        )}

        {/* Task list preview */}
        {!finished && total > 1 && (
          <div className="mt-5 space-y-1.5">
            {tasks.map((t, i) => (
              <div
                key={t.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${i === index ? 'bg-slate-800 border border-amber-500/30 text-white' : done.has(t.id) ? 'text-slate-500' : 'text-slate-400'}`}
              >
                <span>{done.has(t.id) ? '✅' : i === index ? '👉' : '•'}</span>
                <span className={`truncate ${done.has(t.id) ? 'line-through' : ''}`}>{t.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
