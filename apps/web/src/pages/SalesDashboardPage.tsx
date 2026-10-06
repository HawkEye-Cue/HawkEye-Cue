import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ApiClient } from '@social-lead-gen/shared';
import type { Opportunity } from '@social-lead-gen/shared';
import { useTeamData } from '../hooks/useTeamData';
import { HeroHeader, LightStat, Panel, StatGrid, Segmented, DataBar, DonutChart, ComboChart, BAR_COLORS } from '../components/ui';

// Sales dashboard. If the user is on a team, the WHOLE page is the team's sales &
// analytics (the main focus). Personal analytics live under Insights (More tab).
// Solo users see their own sales here.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function money(n: number): string { return '$' + Math.round(n).toLocaleString(); }

const SOURCE_LABELS: Record<string, string> = {
  'facebook-group': 'Facebook Groups', 'facebook-post': 'Facebook', 'instagram-post': 'Instagram',
  linkedin: 'LinkedIn', referral: 'Referrals', 'cold-call': 'Cold Call', 'warm-call': 'Warm Call',
  'walk-in': 'Walk-In', website: 'Website', 'google-ad': 'Google Ad', 'facebook-ad': 'Facebook Ad',
  'door-knock': 'Door Knock', 'internet-lead': 'Internet Lead', 'repeat-client': 'Repeat Client',
  'manual-entry': 'Manual Entry', 'extension-detected': 'HawkEye Scan', other: 'Other',
};

function leadValue(l: any): number {
  const v = l.expectedPremium ?? l.estimatedValue ?? 0;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

type Period = 'folio' | 'month' | 'quarter' | 'annual';

function monthLabel(ym: string): string {
  const parts = ym.split('-');
  const mi = parseInt(parts[1] || '1') - 1;
  return MONTHS[mi] || ym;
}

export default function SalesDashboardPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const { isInTeam, teamAnalytics, fetchAnalytics, loading: teamLoading } = useTeamData();
  const [leads, setLeads] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('annual');

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
        const res: any = await client.getOpportunities({});
        setLeads(res.items || res.opportunities || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pull full team analytics when on a team.
  useEffect(() => { if (isInTeam) fetchAnalytics(); }, [isInTeam]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Personal metrics (solo users / fallback) ─────────────────────────────
  const personal = useMemo(() => {
    const clients = leads.filter((l) => l.status === 'converted');
    const totalSales = clients.reduce((s, l) => s + leadValue(l), 0);
    const dealsWon = clients.length;
    const avgDeal = dealsWon > 0 ? totalSales / dealsWon : 0;
    const winRate = Math.round((dealsWon / (leads.length || 1)) * 100);
    const stage = {
      new: leads.filter((l) => l.status === 'new').length,
      followed_up: leads.filter((l) => l.status === 'followed_up').length,
      converted: dealsWon,
    };
    const now = new Date();
    const timeline: { label: string; bar: number; line: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const inMonth = clients.filter((c) => {
        const cd = new Date((c as any).createdAt || (c as any).detectedAt || 0);
        return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
      });
      const rev = inMonth.reduce((s, l) => s + leadValue(l), 0);
      timeline.push({ label: MONTHS[d.getMonth()], bar: rev, line: rev });
    }
    return { totalSales, dealsWon, avgDeal, winRate, stage, timeline };
  }, [leads]);

  if (loading || (isInTeam && teamLoading)) {
    return <div className="text-center py-16 text-slate-400 text-sm">Loading sales…</div>;
  }

  const periodOptions: { id: Period; label: string }[] = [
    { id: 'folio', label: 'Folio' },
    { id: 'month', label: 'Month' },
    { id: 'quarter', label: 'Quarter' },
    { id: 'annual', label: 'Annual' },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // TEAM VIEW — the entire page is the team's sales when the user is on a team.
  // ─────────────────────────────────────────────────────────────────────────
  if (isInTeam) {
    const a = teamAnalytics;
    const totalRevenue = a?.totalRevenue ?? 0;
    const wonDeals = a?.wonDeals ?? 0;
    const totalDeals = a?.totalDeals ?? 0;
    const avgDeal = wonDeals > 0 ? totalRevenue / wonDeals : 0;
    const winRate = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0;
    const members = (a?.members || []).slice().sort((x, y) => y.revenue - x.revenue);
    const bySource = (a?.bySource || []).map((s) => ({ label: SOURCE_LABELS[s.key] || s.key, revenue: s.revenue }));
    const byProduct = (a?.byProduct || []).slice(0, 6);
    const stages = a?.stageCounts;
    const timeline = (a?.byMonth || []).slice(-6).map((m) => ({ label: monthLabel(m.month), bar: m.revenue, line: m.revenue }));
    const memberMax = Math.max(1, ...members.map((m) => m.revenue));

    return (
      <div className="space-y-4 pb-8">
        <HeroHeader
          title="Team Sales"
          subtitle="Your whole team's revenue at a glance."
          right={<Segmented options={periodOptions} value={period} onChange={setPeriod} />}
        />

        {/* Team totals — the headline */}
        <StatGrid cols={4}>
          <LightStat icon="$" label="Team Revenue" value={money(totalRevenue)} />
          <LightStat icon="📄" label="Deals Won" value={wonDeals} />
          <LightStat icon="🏷️" label="Avg Deal Value" value={money(avgDeal)} />
          <LightStat icon="📈" label="Win Rate" value={winRate + '%'} />
        </StatGrid>

        {/* Leaderboard — who's producing */}
        <Panel title="🏆 Team Leaderboard" className="border-amber-500/30">
          {members.length === 0 ? (
            <p className="text-xs text-slate-500">No team sales recorded in this period.</p>
          ) : (
            <div className="space-y-2.5">
              {members.map((mem, i) => (
                <DataBar
                  key={mem.email}
                  label={<span className="truncate">{i === 0 ? '👑 ' : ''}{mem.email.split('@')[0]}</span>}
                  value={mem.revenue}
                  max={memberMax}
                  color={BAR_COLORS[i % BAR_COLORS.length]}
                  suffix={<span>{money(mem.revenue)} · {mem.wonDeals} won</span>}
                />
              ))}
            </div>
          )}
        </Panel>

        {timeline.length > 0 && (
          <Panel title="Team Sales Over Time">
            <ComboChart points={timeline} />
          </Panel>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {bySource.length > 0 && (
            <Panel title="Team Sales by Source">
              <DonutChart
                centerValue={money(totalRevenue)}
                centerLabel="Team Total"
                data={bySource.map((s, i) => ({ label: s.label, value: s.revenue, color: BAR_COLORS[i % BAR_COLORS.length] }))}
              />
            </Panel>
          )}
          {stages && (
            <Panel title="Team Pipeline by Stage">
              <div className="space-y-2.5">
                {(() => {
                  const max = Math.max(1, stages.prospect, stages.contacted, stages.quoted, stages.closing, stages.won);
                  return (
                    <>
                      <DataBar label="Prospect" value={stages.prospect} max={max} color="#64748b" />
                      <DataBar label="Contacted" value={stages.contacted} max={max} color="#38bdf8" />
                      <DataBar label="Quoted" value={stages.quoted} max={max} color="#fbbf24" />
                      <DataBar label="Closing" value={stages.closing} max={max} color="#f59e0b" />
                      <DataBar label="Won" value={stages.won} max={max} color="#34d399" />
                    </>
                  );
                })()}
              </div>
            </Panel>
          )}
        </div>

        {byProduct.length > 0 && byProduct.some((p) => p.key !== 'Other') && (
          <Panel title="Top Products / Services (Team)">
            <div className="space-y-1.5">
              {byProduct.map((p, i) => (
                <div key={p.key} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-slate-300"><span className="text-slate-500 mr-2">{i + 1}</span>{p.key}</span>
                  <span className="text-slate-400">{money(p.revenue)} <span className="text-slate-500">· {p.deals} deal{p.deals !== 1 ? 's' : ''}</span></span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        <p className="text-center text-[11px] text-slate-500">
          Showing your whole team. Your personal analytics live under <button onClick={() => navigate('/hawk-insights')} className="text-amber-400 underline underline-offset-2">Insights</button> in the More menu.
        </p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SOLO VIEW — the user's own sales.
  // ─────────────────────────────────────────────────────────────────────────
  const maxStage = Math.max(1, personal.stage.new, personal.stage.followed_up, personal.stage.converted);

  return (
    <div className="space-y-4 pb-8">
      <HeroHeader
        title="Sales"
        subtitle="Turn your social media into real revenue."
        right={<Segmented options={periodOptions} value={period} onChange={setPeriod} />}
      />

      {personal.dealsWon === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black text-center py-10">
          <div className="text-4xl mb-2">💰</div>
          <p className="text-sm font-semibold text-white">No sales yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Convert a lead to a Client in your Pipeline and it shows up here as a sale.</p>
          <button onClick={() => navigate('/pipeline')} className="mt-4 px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:opacity-90">Go to Pipeline →</button>
        </div>
      ) : (
        <>
          <StatGrid cols={4}>
            <LightStat icon="$" label="Total Sales" value={money(personal.totalSales)} />
            <LightStat icon="📄" label="Deals Won" value={personal.dealsWon} />
            <LightStat icon="🏷️" label="Avg Deal Value" value={money(personal.avgDeal)} />
            <LightStat icon="📈" label="Win Rate" value={personal.winRate + '%'} />
          </StatGrid>

          <Panel title="Sales Over Time">
            <ComboChart points={personal.timeline} />
          </Panel>

          <Panel title="Pipeline by Stage">
            <div className="space-y-2.5">
              <DataBar label="New" value={personal.stage.new} max={maxStage} color="#38bdf8" />
              <DataBar label="Followed Up" value={personal.stage.followed_up} max={maxStage} color="#fbbf24" />
              <DataBar label="Clients (Won)" value={personal.stage.converted} max={maxStage} color="#34d399" />
            </div>
          </Panel>

          <p className="text-center text-[11px] text-slate-500">Updates automatically as you convert leads to Clients in your Pipeline.</p>
        </>
      )}
    </div>
  );
}
