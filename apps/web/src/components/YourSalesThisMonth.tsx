// "Your Sales This Month" — compact Today-dashboard card showing the signed-in user's
// OWN completed (won) sales for the current calendar month, by ACTUAL sale date. Reuses
// the existing /sales/deals data (no Pipeline estimates, no opportunity-creation dates).
//
// Phase 1 scope: sales total, deal count, folio label, a monthly progress bar, and a
// cumulative-sales mini chart. Monthly GOAL persistence lands in Phase 2 — until then we
// show a "Set Your Monthly Goal" affordance and never invent a default goal or a
// misleading percentage.

import { useEffect, useMemo, useState } from 'react';
import { ApiClient } from '@social-lead-gen/shared';
import type { Deal } from '@social-lead-gen/shared';

interface Props {
  getToken: () => Promise<string | null>;
  /** Optional shortcut to Summit HQ for authorized team users. */
  onOpenTeam?: () => void;
  showTeamShortcut?: boolean;
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

function currentFolioKey(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}
function folioLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function YourSalesThisMonth({ getToken, onOpenTeam, showTeamShortcut }: Props) {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [goal, setGoal] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [goalErr, setGoalErr] = useState('');
  const folio = currentFolioKey();

  function makeClient(token: string | null) {
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await getToken();
        const client = makeClient(token);
        const [dealsRes, goalRes] = await Promise.all([
          client.getDeals().catch(() => ({ deals: [] as Deal[] })),
          client.getSalesGoal(folio).catch(() => ({ folio, amount: null })),
        ]);
        if (alive) { setDeals(dealsRes.deals || []); setGoal(goalRes.amount); }
      } catch { if (alive) { setDeals([]); setGoal(null); } }
    })();
    return () => { alive = false; };
  }, [getToken, folio]);

  async function saveGoal() {
    const n = Number(goalInput);
    if (goalInput.trim() === '' || !isFinite(n) || n < 0) { setGoalErr('Enter a nonnegative number'); return; }
    setSaving(true); setGoalErr('');
    try {
      const token = await getToken();
      const res = await makeClient(token).setSalesGoal(folio, n);
      setGoal(res.amount); setEditing(false);
    } catch { setGoalErr('Could not save goal'); }
    finally { setSaving(false); }
  }

  const { total, count, dailyCumulative, daysInMonth } = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    const cum = new Array(days).fill(0) as number[];
    let tot = 0;
    let cnt = 0;
    for (const d of deals || []) {
      if (d.stage !== 'won') continue;
      // ACTUAL sale date (createdAt). Fall back to folio field only if createdAt missing.
      const iso = (d as any).createdAt || '';
      const dt = iso ? new Date(iso) : null;
      if (!dt || dt.getFullYear() !== y || dt.getMonth() !== m) continue;
      const val = Number((d as any).dealValue ?? (d as any).value ?? 0) || 0;
      tot += val; cnt += 1;
      const dayIdx = Math.min(days - 1, Math.max(0, dt.getDate() - 1));
      cum[dayIdx] += val;
    }
    // Make it cumulative.
    for (let i = 1; i < cum.length; i++) cum[i] += cum[i - 1];
    return { total: tot, count: cnt, dailyCumulative: cum, daysInMonth: days };
  }, [deals]);

  const maxCum = Math.max(1, ...dailyCumulative);
  const todayDay = new Date().getDate();

  return (
    <div className="rounded-xl border border-amber-500/30 bg-gradient-to-b from-slate-900 to-black p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-white">Your Sales This Month</h3>
          <p className="text-[11px] text-slate-400">{folioLabel(folio)}</p>
        </div>
        {showTeamShortcut && onOpenTeam && (
          <button onClick={onOpenTeam} className="text-[11px] text-amber-300 hover:text-amber-200 underline shrink-0">Team reporting →</button>
        )}
      </div>

      {deals === null ? (
        <p className="text-xs text-slate-500 py-6 text-center">Loading your sales…</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3 mb-2">
            <div>
              <p className="text-2xl font-extrabold text-amber-300 leading-none">{money(total)}</p>
              <p className="text-[11px] text-slate-400 mt-1">{count} completed deal{count === 1 ? '' : 's'}</p>
            </div>
            {!editing && (
              goal && goal > 0 ? (
                <button onClick={() => { setGoalInput(String(goal)); setEditing(true); }} className="text-[11px] text-amber-300 hover:text-amber-200 underline shrink-0">Edit goal</button>
              ) : (
                <button onClick={() => { setGoalInput(''); setEditing(true); }} className="text-[11px] text-amber-300 hover:text-amber-200 underline shrink-0">Set Your Monthly Goal</button>
              )
            )}
          </div>

          {/* Goal editor */}
          {editing && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs text-slate-400">$</span>
              <input
                type="number" min={0} inputMode="numeric" value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                placeholder="Monthly goal"
                className="w-28 px-2 py-1 bg-white/5 border border-white/15 rounded-lg text-white text-sm focus:border-amber-500/60 focus:outline-none"
              />
              <button onClick={saveGoal} disabled={saving} className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => { setEditing(false); setGoalErr(''); }} className="text-xs text-slate-400 hover:text-white">Cancel</button>
              {goalErr && <span className="text-[10px] text-red-400">{goalErr}</span>}
            </div>
          )}

          {/* Goal progress — only when a goal > 0 is set (no fake percentages). */}
          {goal && goal > 0 && (() => {
            const pct = Math.round((total / goal) * 100);
            const exceeded = total >= goal;
            const remaining = Math.max(goal - total, 0);
            const barPct = Math.min(100, Math.max(total > 0 ? 2 : 0, (total / goal) * 100));
            return (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-slate-400">Goal {money(goal)} · <span className={exceeded ? 'text-green-400 font-bold' : 'text-amber-300 font-bold'}>{pct}%</span></span>
                  <span className="text-[11px] text-slate-400">{exceeded ? '🎯 Goal Exceeded' : `${money(remaining)} to go`}</span>
                </div>
                <div className="h-2.5 rounded-full bg-black/40 overflow-hidden">
                  <div className={`h-full rounded-full ${exceeded ? 'bg-green-500' : 'bg-gradient-to-r from-amber-500 to-amber-400'}`} style={{ width: `${barPct}%` }} />
                </div>
              </div>
            );
          })()}

          {/* Cumulative sales mini chart (month-to-date). Clearly labeled, mobile-friendly. */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500">Cumulative sales · month to date</span>
              <span className="text-[10px] text-slate-500">{money(total)}</span>
            </div>
            <div className="flex items-end gap-px h-16" role="img" aria-label={`Cumulative sales for ${folioLabel(folio)}: ${money(total)} across ${count} deals`}>
              {dailyCumulative.map((v, i) => {
                const h = (v / maxCum) * 100;
                const isFuture = i + 1 > todayDay;
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${isFuture ? 'bg-white/5' : 'bg-amber-500/70'}`}
                    style={{ height: `${Math.max(v > 0 ? 4 : 1, h)}%` }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-slate-600">Day 1</span>
              <span className="text-[9px] text-slate-600">Day {daysInMonth}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
