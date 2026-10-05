import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ApiClient } from '@social-lead-gen/shared';
import type { Opportunity } from '@social-lead-gen/shared';
import { useTeamData } from '../hooks/useTeamData';
import { HeroHeader, LightStat, Panel, StatGrid, Segmented, DataBar, DonutChart, ComboChart, BAR_COLORS } from '../components/ui';

// Sales dashboard driven by real lead/client data. "Converted" leads = clients = sales.
// Team sales are the main focus for Summit teams; the user's own sales sit beside it.

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

// Does a converted client's date fall within the selected period?
function inPeriod(dateStr: string, period: Period): boolean {
  if (period === 'folio') return true; // folio = all current tracked book
  const d = new Date(dateStr || 0);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const dq = Math.floor(d.getMonth() / 3);
    return d.getFullYear() === now.getFullYear() && dq === q;
  }
  return d.getFullYear() === now.getFullYear(); // annual
}

export default function SalesDashboardPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const { isInTeam, teamAnalytics } = useTeamData();
  const [leads, setLeads] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('month');

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

  const m = useMemo(() => {
    const clients = leads
      .filter((l) => l.status === 'converted')
      .filter((l) => inPeriod((l as any).createdAt || (l as any).detectedAt, period));

    const totalSales = clients.reduce((s, l) => s + leadValue(l), 0);
    const dealsWon = clients.length;
    const avgDeal = dealsWon > 0 ? totalSales / dealsWon : 0;
    const winRate = Math.round((dealsWon / (leads.length || 1)) * 100);

    const bySourceMap: Record<string, number> = {};
    for (const c of clients) {
      const key = (c as any).leadSource || (c as any).sourcePlatform || 'other';
      bySourceMap[key] = (bySourceMap[key] || 0) + leadValue(c);
    }
    const bySource = Object.entries(bySourceMap)
      .map(([k, revenue]) => ({ label: SOURCE_LABELS[k] || k, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    const byProductMap: Record<string, { revenue: number; deals: number }> = {};
    for (const c of clients) {
      const key = (c as any).policyType || 'Other';
      if (!byProductMap[key]) byProductMap[key] = { revenue: 0, deals: 0 };
      byProductMap[key].revenue += leadValue(c);
      byProductMap[key].deals += 1;
    }
    const topProducts = Object.entries(byProductMap)
      .map(([k, v]) => ({ label: k, revenue: v.revenue, deals: v.deals }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 6);

    const stage = {
      new: leads.filter((l) => l.status === 'new').length,
      followed_up: leads.filter((l) => l.status === 'followed_up').length,
      converted: dealsWon,
    };

    // Timeline — last 6 months (ignores period filter so the trend always reads).
    const allClients = leads.filter((l) => l.status === 'converted');
    const now = new Date();
    const timeline: { label: string; bar: number; line: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const inMonth = allClients.filter((c) => {
        const cd = new Date((c as any).createdAt || (c as any).detectedAt || 0);
        return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
      });
      const rev = inMonth.reduce((s, l) => s + leadValue(l), 0);
      timeline.push({ label: MONTHS[d.getMonth()], bar: rev, line: rev });
    }

    return { totalSales, dealsWon, avgDeal, winRate, bySource, topProducts, stage, timeline };
  }, [leads, period]);

  if (loading) return <div className="text-center py-16 text-slate-400 text-sm">Loading your sales…</div>;

  const maxStage = Math.max(1, m.stage.new, m.stage.followed_up, m.stage.converted);

  // Team numbers (Summit). Fall back to the user's own totals if not on a team.
  const teamRevenue = teamAnalytics?.totalRevenue ?? 0;
  const teamDeals = teamAnalytics?.wonDeals ?? 0;
  const members = (teamAnalytics?.members || []).slice().sort((a, b) => b.revenue - a.revenue);

  const periodOptions: { id: Period; label: string }[] = [
    { id: 'folio', label: 'Folio' },
    { id: 'month', label: 'Month' },
    { id: 'quarter', label: 'Quarter' },
    { id: 'annual', label: 'Annual' },
  ];

  return (
    <div className="space-y-4 pb-8">
      <HeroHeader
        title="Sales"
        subtitle="Turn your social media into real revenue."
        image="/hawk.jpg"
        right={<Segmented options={periodOptions} value={period} onChange={setPeriod} />}
      />

      {/* ── Team sales — the main focus (Summit teams) ───────────────────── */}
      {isInTeam && (
        <Panel title="🏔️ Team Sales" className="border-amber-500/30">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div className="sm:col-span-1 text-center sm:text-left">
              <p className="text-4xl font-extrabold text-amber-400 leading-none">{money(teamRevenue)}</p>
              <p className="text-xs text-slate-400 mt-1">Total team revenue · {teamDeals} deals won</p>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Leaderboard</p>
              {members.length === 0 ? (
                <p className="text-xs text-slate-500">No team sales recorded yet.</p>
              ) : members.map((mem, i) => {
                const max = Math.max(1, ...members.map((x) => x.revenue));
                return (
                  <DataBar
                    key={mem.email}
                    label={<span className="truncate">{mem.email.split('@')[0]}</span>}
                    value={mem.revenue}
                    max={max}
                    color={BAR_COLORS[i % BAR_COLORS.length]}
                    suffix={<span>{money(mem.revenue)} · {mem.wonDeals} won</span>}
                  />
                );
              })}
            </div>
          </div>
        </Panel>
      )}

      {/* ── My sales (individual) ─────────────────────────────────────────── */}
      {m.dealsWon === 0 && !isInTeam ? (
        <div className="rounded-2xl border border-white/10 bg-black text-center py-10">
          <div className="text-4xl mb-2">💰</div>
          <p className="text-sm font-semibold text-white">No sales yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Convert a lead to a Client in your Pipeline and it shows up here as a sale.</p>
          <button onClick={() => navigate('/pipeline')} className="mt-4 px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:opacity-90">Go to Pipeline →</button>
        </div>
      ) : (
        <>
          {isInTeam && <h3 className="text-sm font-bold text-white uppercase tracking-wide pt-1">My Sales</h3>}
          {/* Light stat tiles with trend */}
          <StatGrid cols={4}>
            <LightStat icon="$" label="Total Sales" value={money(m.totalSales)} />
            <LightStat icon="📄" label="Deals Won" value={m.dealsWon} />
            <LightStat icon="🏷️" label="Avg Deal Value" value={money(m.avgDeal)} />
            <LightStat icon="📈" label="Win Rate" value={m.winRate + '%'} />
          </StatGrid>

          {/* Sales over time — bars + connecting line */}
          <Panel title="Sales Over Time">
            <ComboChart points={m.timeline} />
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Sales by source — donut */}
            {m.bySource.length > 0 && (
              <Panel title="Sales by Source">
                <DonutChart
                  centerValue={money(m.totalSales)}
                  centerLabel="Total Sales"
                  data={m.bySource.map((s, i) => ({ label: s.label, value: s.revenue, color: BAR_COLORS[i % BAR_COLORS.length] }))}
                />
              </Panel>
            )}

            {/* Pipeline by stage */}
            <Panel title="Pipeline by Stage">
              <div className="space-y-2.5">
                <DataBar label="New" value={m.stage.new} max={maxStage} color="#38bdf8" />
                <DataBar label="Followed Up" value={m.stage.followed_up} max={maxStage} color="#fbbf24" />
                <DataBar label="Clients (Won)" value={m.stage.converted} max={maxStage} color="#34d399" />
              </div>
            </Panel>
          </div>

          {/* Top products / services */}
          {m.topProducts.length > 0 && m.topProducts.some((p) => p.label !== 'Other') && (
            <Panel title="Top Products / Services">
              <div className="space-y-1.5">
                {m.topProducts.map((p, i) => (
                  <div key={p.label} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-slate-300"><span className="text-slate-500 mr-2">{i + 1}</span>{p.label}</span>
                    <span className="text-slate-400">{money(p.revenue)} <span className="text-slate-500">· {p.deals} deal{p.deals !== 1 ? 's' : ''}</span></span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <p className="text-center text-[11px] text-slate-500">Updates automatically as you convert leads to Clients in your Pipeline.</p>
        </>
      )}
    </div>
  );
}
