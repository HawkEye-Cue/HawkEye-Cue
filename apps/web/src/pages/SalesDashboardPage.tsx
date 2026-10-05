import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ApiClient } from '@social-lead-gen/shared';
import type { Opportunity } from '@social-lead-gen/shared';
import { HeroHeader, PillTabs, BoldStat, Panel, StatGrid, DataBar, DonutChart, LineChart, BAR_COLORS } from '../components/ui';

// A clean, on-brand Sales dashboard driven by real lead/client data.
// "Converted" leads = clients = sales. Value comes from each lead's expectedPremium.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function money(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}

const SOURCE_LABELS: Record<string, string> = {
  'facebook-group': 'Facebook Groups',
  'facebook-post': 'Facebook',
  'instagram-post': 'Instagram',
  linkedin: 'LinkedIn',
  referral: 'Referrals',
  'cold-call': 'Cold Call',
  'warm-call': 'Warm Call',
  'walk-in': 'Walk-In',
  website: 'Website',
  'google-ad': 'Google Ad',
  'facebook-ad': 'Facebook Ad',
  'door-knock': 'Door Knock',
  'internet-lead': 'Internet Lead',
  'repeat-client': 'Repeat Client',
  'manual-entry': 'Manual Entry',
  'extension-detected': 'HawkEye Scan',
  other: 'Other',
};

const DONUT_COLORS = ['#f59e0b', '#fbbf24', '#38bdf8', '#34d399', '#a78bfa', '#f472b6', '#64748b'];

function leadValue(l: any): number {
  const v = l.expectedPremium ?? l.estimatedValue ?? 0;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

export default function SalesDashboardPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'source' | 'products'>('overview');

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
    const clients = leads.filter((l) => l.status === 'converted');
    const totalSales = clients.reduce((s, l) => s + leadValue(l), 0);
    const dealsWon = clients.length;
    const avgDeal = dealsWon > 0 ? totalSales / dealsWon : 0;
    // Win rate = clients / (all leads that reached a decision: everything except brand-new).
    const decided = leads.filter((l) => l.status !== 'new').length + dealsWon;
    const denom = leads.length || 1;
    const winRate = Math.round((dealsWon / denom) * 100);

    // Sales by source (from converted clients' leadSource / platform).
    const bySourceMap: Record<string, { revenue: number; deals: number }> = {};
    for (const c of clients) {
      const key = (c as any).leadSource || (c as any).sourcePlatform || 'other';
      if (!bySourceMap[key]) bySourceMap[key] = { revenue: 0, deals: 0 };
      bySourceMap[key].revenue += leadValue(c);
      bySourceMap[key].deals += 1;
    }
    const bySource = Object.entries(bySourceMap)
      .map(([k, v]) => ({ label: SOURCE_LABELS[k] || k, revenue: v.revenue, deals: v.deals }))
      .sort((a, b) => b.revenue - a.revenue);

    // Top products/services (from converted clients' policyType).
    const byProductMap: Record<string, { revenue: number; deals: number }> = {};
    for (const c of clients) {
      const key = (c as any).policyType || 'Other';
      if (!byProductMap[key]) byProductMap[key] = { revenue: 0, deals: 0 };
      byProductMap[key].revenue += leadValue(c);
      byProductMap[key].deals += 1;
    }
    const topProducts = Object.entries(byProductMap)
      .map(([k, v]) => ({ label: k, revenue: v.revenue, deals: v.deals }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    // Pipeline by stage (counts of each lead status).
    const stage = {
      new: leads.filter((l) => l.status === 'new').length,
      followed_up: leads.filter((l) => l.status === 'followed_up').length,
      converted: dealsWon,
    };

    // Sales over time — last 6 months, revenue of clients converted that month.
    const now = new Date();
    const timeline: { label: string; revenue: number; deals: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = MONTHS[d.getMonth()];
      const inMonth = clients.filter((c) => {
        const cd = new Date((c as any).createdAt || (c as any).detectedAt || 0);
        return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
      });
      timeline.push({ label, revenue: inMonth.reduce((s, l) => s + leadValue(l), 0), deals: inMonth.length });
    }

    return { totalSales, dealsWon, avgDeal, winRate, bySource, topProducts, stage, timeline };
  }, [leads]);

  if (loading) {
    return <div className="text-center py-16 text-slate-400 text-sm">Loading your sales…</div>;
  }

  const maxTimeline = Math.max(1, ...m.timeline.map((t) => t.revenue));
  const sourceTotal = m.bySource.reduce((s, x) => s + x.revenue, 0) || 1;
  const maxStage = Math.max(1, m.stage.new, m.stage.followed_up, m.stage.converted);

  return (
    <div className="space-y-4 pb-8">
      <HeroHeader title="Sales" subtitle="Turn your social media into real revenue." />
      {m.dealsWon > 0 && (
        <PillTabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'source', label: 'Sales by Source' },
            { id: 'products', label: 'Products/Services' },
          ]}
        />
      )}

      {m.dealsWon === 0 ? (
        <div className="glass-card text-center py-10">
          <div className="text-4xl mb-2">💰</div>
          <p className="text-sm font-semibold text-white">No sales yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">When you convert a lead to a Client in your Pipeline, it shows up here as a sale. Mark your first one to see your numbers come alive.</p>
          <button onClick={() => navigate('/pipeline')} className="mt-4 px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:opacity-90">Go to Pipeline →</button>
        </div>
      ) : (
        <>
          {/* Stat cards — bold black/white/yellow, always visible */}
          <StatGrid cols={4}>
            <BoldStat icon="$" label="Total Sales" value={money(m.totalSales)} />
            <BoldStat icon="📄" label="Deals Won" value={m.dealsWon} />
            <BoldStat icon="🏷️" label="Avg Deal Value" value={money(m.avgDeal)} />
            <BoldStat icon="📈" label="Win Rate" value={m.winRate + '%'} />
          </StatGrid>

          {/* Overview tab */}
          {tab === 'overview' && (
            <Panel title="Sales Over Time">
              <LineChart points={m.timeline.map((t) => ({ label: t.label, value: t.revenue }))} />
            </Panel>
          )}

          {/* Sales by source — donut chart */}
          {tab === 'source' && m.bySource.length > 0 && (
            <Panel title="Sales by Source">
              <DonutChart
                centerValue={money(m.totalSales)}
                centerLabel="Total Sales"
                data={m.bySource.map((s, i) => ({ label: s.label, value: s.revenue, color: BAR_COLORS[i % BAR_COLORS.length] }))}
              />
            </Panel>
          )}

          {/* Top products / services */}
          {tab === 'products' && m.topProducts.length > 0 && m.topProducts.some((p) => p.label !== 'Other') && (
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

          {/* Pipeline by stage */}
          <Panel title="Pipeline by Stage">
            <div className="space-y-2.5">
              <DataBar label="New" value={m.stage.new} max={maxStage} color="#38bdf8" />
              <DataBar label="Followed Up" value={m.stage.followed_up} max={maxStage} color="#fbbf24" />
              <DataBar label="Clients (Won)" value={m.stage.converted} max={maxStage} color="#34d399" />
            </div>
          </Panel>

          <p className="text-center text-[11px] text-slate-500">Updates automatically as you convert leads to Clients in your Pipeline.</p>
        </>
      )}
    </div>
  );
}



