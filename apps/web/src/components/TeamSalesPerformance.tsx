// Team Sales Performance — a clean horizontal bar chart of each member's COMPLETED
// (won) sales for the selected folio, with optional monthly goal + % achieved. Replaces
// the old rolling-13 "Team Sales Over Time" graph. Pure/presentational: it renders from
// already-fetched, folio-filtered member stats (no Pipeline estimates, no new fetch).
//
// Goal handling (Phase 1): goals are OPTIONAL and passed in. When absent/0 we show no
// percentage and no misleading bar — a "Set goal" affordance instead. For All Time we
// hide goal comparisons entirely (monthly goals don't apply to an all-time total).

export interface TeamSalesRow {
  key: string;            // stable id (userId/email)
  name: string;           // display name
  sales: number;          // completed (won) revenue in the selected folio
  deals: number;          // completed deal count in the selected folio
  goal?: number | null;   // monthly goal for this folio (optional)
}

export interface TeamSalesPerformanceProps {
  rows: TeamSalesRow[];
  /** When true (All Time), hide monthly-goal comparisons (they'd be misleading). */
  hideGoals?: boolean;
  /** Optional: a member key the admin may edit a goal for (renders a "Set goal" button). */
  onEditGoal?: (row: TeamSalesRow) => void;
  /** Whether the current user may edit goals (team admin). Gates the edit affordance. */
  canEditGoals?: boolean;
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function TeamSalesPerformance({ rows, hideGoals, onEditGoal, canEditGoals }: TeamSalesPerformanceProps) {
  // Sort by actual completed sales, highest first.
  const sorted = [...rows].sort((a, b) => b.sales - a.sales);
  const totalSales = sorted.reduce((s, r) => s + (r.sales || 0), 0);
  const totalDeals = sorted.reduce((s, r) => s + (r.deals || 0), 0);
  // Bar scale: relative to the largest of (top seller, any goal) so bars never overflow.
  const scaleMax = Math.max(
    1,
    ...sorted.map((r) => r.sales || 0),
    ...(hideGoals ? [] : sorted.map((r) => (r.goal && r.goal > 0 ? r.goal : 0))),
  );

  return (
    <div className="p-3 sm:p-4 bg-slate-800 border border-white/10 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white">Team Sales Performance</h3>
        <div className="text-right">
          <p className="text-sm font-bold text-amber-300">{money(totalSales)}</p>
          <p className="text-[10px] text-slate-400">{totalDeals} deal{totalDeals === 1 ? '' : 's'} · team total</p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-6">No completed sales for this period yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {sorted.map((r) => {
            const hasGoal = !hideGoals && typeof r.goal === 'number' && (r.goal as number) > 0;
            const pct = hasGoal ? Math.round((r.sales / (r.goal as number)) * 100) : null;
            // "Exceeded" uses the RAW ratio (sales >= goal), not the rounded percentage, so
            // 99.6% (which rounds to 100%) is not wrongly flagged as exceeded.
            const exceeded = hasGoal && r.sales >= (r.goal as number);
            const barPct = Math.min(100, Math.max(r.sales > 0 ? 2 : 0, (r.sales / scaleMax) * 100));
            return (
              <li key={r.key}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium text-white truncate">{r.name}</span>
                  <span className="text-xs text-slate-300 shrink-0">
                    {money(r.sales)}
                    {hasGoal && (
                      <>
                        <span className="text-slate-500"> / {money(r.goal as number)}</span>
                        <span className={`ml-1.5 font-bold ${exceeded ? 'text-green-400' : 'text-amber-300'}`}>{pct}%</span>
                      </>
                    )}
                  </span>
                </div>
                {/* Bar track — bar width never exceeds the container (capped at 100%). */}
                <div className="h-2.5 rounded-full bg-black/40 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${exceeded ? 'bg-green-500' : 'bg-gradient-to-r from-amber-500 to-amber-400'}`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] text-slate-500">{r.deals} deal{r.deals === 1 ? '' : 's'}</span>
                  {!hideGoals && !hasGoal && (
                    canEditGoals && onEditGoal ? (
                      <button onClick={() => onEditGoal(r)} className="text-[10px] text-amber-300 hover:text-amber-200 underline">Set Your Monthly Goal</button>
                    ) : (
                      <span className="text-[10px] text-slate-600">No goal set</span>
                    )
                  )}
                  {exceeded && <span className="text-[10px] font-bold text-green-400">🎯 Goal Exceeded</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
