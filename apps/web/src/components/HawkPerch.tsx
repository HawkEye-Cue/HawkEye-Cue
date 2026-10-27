/**
 * HawkPerch — "The Hawk's Perch": the premium, hawk-inspired employee sales leaderboard
 * for Summit HQ. This is the ONE consolidated employee sales ranking (replaces the old
 * generic thin-bar leaderboard AND the separate Individual Performance grid).
 *
 * Ranking is strictly by Net New Business Premium WRITTEN (wonValue) for the selected
 * reporting period — never leads/quotes/pipeline estimates. Ties are shown as a neutral
 * tied state (shared rank "T"), not an invented winner. All data is passed in from the
 * reused /team/stats results; this component is presentational only (no fetching, no
 * business logic duplicated).
 *
 * Branding: charcoal/black/amber. Each employee keeps their assigned team color (a small
 * dot/accent) purely for identification.
 */

export interface HawkPerchMember {
  userId: string;
  email: string;
  wonValue: number;   // Net New Business Premium written (period-filtered)
  wonDeals: number;   // completed sales count
}

interface HawkPerchProps {
  members: HawkPerchMember[];
  // Resolve an employee's assigned team color class (e.g. 'bg-amber-500').
  colorClassFor: (email: string) => string;
  // Resolve an employee's friendly display name.
  displayNameFor: (email: string) => string;
  // Human label for the active reporting period (e.g. "Current Folio" / "All Time").
  periodLabel: string;
  // Team total Net New Business Premium for the period (for contribution %).
  teamTotal: number;
}

// Rank medal for the top three (neutral — amber tones, brand-consistent).
const RANK_BADGE = ['🥇', '🥈', '🥉'];

export default function HawkPerch({ members, colorClassFor, displayNameFor, periodLabel, teamTotal }: HawkPerchProps) {
  // Sort strictly by premium written (desc). Stable for equal values so ties keep a
  // deterministic order without implying a winner.
  const ranked = [...members].sort((a, b) => (b.wonValue || 0) - (a.wonValue || 0));

  // Assign ranks with NEUTRAL tie handling. Standard "competition ranking": equal premium
  // shares the same numeric rank. A value shared by >1 member is marked tied so it renders
  // as "T<rank>" (never a medal / Top Hawk), so a tie never invents a winner.
  const countByValue = new Map<number, number>();
  for (const m of ranked) countByValue.set(m.wonValue || 0, (countByValue.get(m.wonValue || 0) || 0) + 1);
  const rankByIndex: { label: string; tied: boolean }[] = ranked.map((m, i) => {
    const v = m.wonValue || 0;
    // Rank = index of the first member sharing this value, + 1 (competition ranking).
    const firstIdx = ranked.findIndex((x) => (x.wonValue || 0) === v);
    return { label: String(firstIdx + 1), tied: (countByValue.get(v) || 0) > 1 };
  });

  const money = (n: number) => `$${(n || 0).toLocaleString()}`;

  return (
    <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-b from-neutral-900/80 to-black/60 p-4 sm:p-5 shadow-lg shadow-black/40">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🦅</span>
          <h2 className="text-lg font-bold text-white">The Hawk's Perch</h2>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-amber-300/80 font-semibold">{periodLabel} · Net New Business Premium</span>
      </div>

      {ranked.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-6">No team members yet.</p>
      ) : (
        <div className="space-y-2">
          {ranked.map((m, i) => {
            const rank = rankByIndex[i];
            const name = displayNameFor(m.email);
            const colorClass = colorClassFor(m.email);
            const pct = teamTotal > 0 ? Math.round(((m.wonValue || 0) / teamTotal) * 100) : 0;
            const isTopProducer = i === 0 && (m.wonValue || 0) > 0 && !rank.tied;
            return (
              <div
                key={m.userId}
                className={`relative flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                  isTopProducer
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : 'border-white/10 bg-white/[0.03]'
                }`}
              >
                {/* Perch rail accent — a subtle amber left edge evoking a hawk's perch. */}
                <span className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-full ${isTopProducer ? 'bg-amber-400' : 'bg-white/10'}`} />

                {/* Rank */}
                <div className="w-9 shrink-0 text-center">
                  {rank.tied ? (
                    <span className="text-xs font-bold text-slate-400">T{rank.label}</span>
                  ) : i < 3 ? (
                    <span className="text-lg leading-none">{RANK_BADGE[i]}</span>
                  ) : (
                    <span className="text-sm font-bold text-slate-400">{rank.label}</span>
                  )}
                </div>

                {/* Identity (assigned color dot + name) */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorClass}`} aria-hidden />
                    <span className="text-sm font-semibold text-white truncate">{name}</span>
                    {isTopProducer && <span className="text-[9px] font-bold uppercase tracking-wide text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded-full shrink-0">Top Hawk</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {m.wonDeals || 0} completed sale{(m.wonDeals || 0) !== 1 ? 's' : ''}
                    {teamTotal > 0 && (m.wonValue || 0) > 0 ? ` · ${pct}% of team` : ''}
                  </p>
                </div>

                {/* Premium written */}
                <div className="text-right shrink-0">
                  <p className="text-lg font-extrabold text-amber-300 leading-none">{money(m.wonValue)}</p>
                  <p className="text-[9px] uppercase tracking-wide text-slate-500 mt-0.5">premium</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
