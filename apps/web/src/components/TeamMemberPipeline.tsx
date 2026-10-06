import { useEffect, useState } from 'react';
import { useTeamData } from '../hooks/useTeamData';
import type { MemberPipeline } from '../hooks/useTeamData';

interface Props {
  memberUserId: string;
  memberName: string;
  /** Optional folio window to scope the view. */
  folioStart?: string;
  folioEnd?: string;
  onClose: () => void;
}

const STAGE_LABELS: Record<string, string> = {
  prospect: 'Prospect', contacted: 'Contacted', quoted: 'Quoted', closing: 'Closing', won: 'Won', lost: 'Lost',
};
const STAGE_COLORS: Record<string, string> = {
  prospect: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  contacted: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  quoted: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  closing: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  won: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  lost: 'bg-red-500/20 text-red-300 border-red-500/30',
};

function money(n: number): string { return '$' + Math.round(n).toLocaleString(); }

/**
 * A slide-over panel showing one teammate's pipeline and the clients they've sold,
 * including the policy/product type on each. Opened from the Sales leaderboard.
 */
export default function TeamMemberPipeline({ memberUserId, memberName, folioStart, folioEnd, onClose }: Props) {
  const { fetchMemberPipeline } = useTeamData();
  const [data, setData] = useState<MemberPipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'sold' | 'pipeline'>('sold');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetchMemberPipeline(memberUserId, folioStart, folioEnd);
        if (active) setData(res);
      } catch {
        if (active) setError('Could not load this pipeline.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [memberUserId, folioStart, folioEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = data ? (view === 'sold' ? data.clientsSold : data.pipeline) : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-slate-950 border-l border-white/10 h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-950/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between z-10">
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{memberName}'s Pipeline</p>
            {data && <p className="text-[11px] text-slate-400">{money(data.totalRevenue)} sold · {data.clientsSold.length} client{data.clientsSold.length !== 1 ? 's' : ''}</p>}
          </div>
          <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-lg leading-none">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {loading && <p className="text-center text-slate-400 text-sm py-10">Loading…</p>}
          {error && <p className="text-center text-red-400 text-sm py-10">{error}</p>}

          {data && !loading && (
            <>
              {/* What they sold, by product/policy type */}
              {data.byType.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <p className="text-xs font-bold text-amber-400 mb-2">Sold by Product Type</p>
                  <div className="space-y-1.5">
                    {data.byType.map((t) => (
                      <div key={t.type} className="flex items-center justify-between text-xs">
                        <span className="text-slate-300">{t.type}</span>
                        <span className="text-slate-400">{money(t.revenue)} <span className="text-slate-500">· {t.count}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Toggle: Clients Sold vs Active Pipeline */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setView('sold')}
                  className={`py-2 rounded-lg text-xs font-bold border ${view === 'sold' ? 'bg-emerald-500 text-black border-transparent' : 'bg-slate-800 text-slate-300 border-white/10'}`}
                >
                  ✓ Clients Sold ({data.clientsSold.length})
                </button>
                <button
                  onClick={() => setView('pipeline')}
                  className={`py-2 rounded-lg text-xs font-bold border ${view === 'pipeline' ? 'bg-amber-500 text-black border-transparent' : 'bg-slate-800 text-slate-300 border-white/10'}`}
                >
                  ▸ In Pipeline ({data.pipeline.length})
                </button>
              </div>

              {/* Deal list */}
              {list.length === 0 ? (
                <p className="text-center text-slate-500 text-xs py-8">
                  {view === 'sold' ? 'No clients sold in this period.' : 'No active deals in this period.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {list.map((d) => (
                    <div key={d.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{d.name || d.contactName || 'Unnamed'}</p>
                          {d.contactName && d.contactName !== d.name && <p className="text-[11px] text-slate-400 truncate">{d.contactName}</p>}
                        </div>
                        <span className="text-sm font-bold text-emerald-400 shrink-0">{money(d.value)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {d.policyType && (
                          <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30">{d.policyType}</span>
                        )}
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STAGE_COLORS[d.stage] || STAGE_COLORS.prospect}`}>
                          {STAGE_LABELS[d.stage] || d.stage}
                        </span>
                        {d.leadSource && <span className="text-[10px] text-slate-500">{d.leadSource}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
