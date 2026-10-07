import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ApiClient } from '@social-lead-gen/shared';
import type { Opportunity } from '@social-lead-gen/shared';
import { useTeamData } from '../hooks/useTeamData';
import TeamMemberPipeline from '../components/TeamMemberPipeline';
import { HeroHeader, StatCard, Panel, StatGrid, PeriodDropdown, DataBar, DonutChart, ComboChart, BAR_COLORS } from '../components/ui';

interface SavedFolio { name: string; start: string; end: string; }

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

function monthLabel(ym: string): string {
  const parts = ym.split('-');
  const mi = parseInt(parts[1] || '1') - 1;
  return MONTHS[mi] || ym;
}

export default function SalesDashboardPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const { isInTeam, teamAnalytics, teamMembers, fetchAnalytics, loading: teamLoading } = useTeamData();
  // Which teammate's pipeline is open in the slide-over (null = closed).
  const [openMember, setOpenMember] = useState<{ userId: string; name: string } | null>(null);
  const [leads, setLeads] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedFolios, setSavedFolios] = useState<SavedFolio[]>([]);
  // How the user tracks production: folios, plain calendar, or a custom fiscal year.
  const [trackingMode, setTrackingMode] = useState<'folio' | 'calendar' | 'fiscal'>('folio');
  const [fiscalStart, setFiscalStart] = useState<number>(1); // 1-12
  // The selected timeline window. 'all' | 'month' | 'quarter' | 'annual' | a folio index 'folio:N'
  const [period, setPeriod] = useState<string>('all');

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  useEffect(() => {
    (async () => {
      try {
        const client = await buildClient();
        const res: any = await client.getOpportunities({});
        setLeads(res.items || res.opportunities || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
      // Load how the user tracks periods (folio / calendar / fiscal).
      try {
        const client = await buildClient();
        const prefs: any = await client.request('GET', '/profile/preferences');
        let mode: 'folio' | 'calendar' | 'fiscal' = 'folio';
        if (prefs.trackingMode === 'folio' || prefs.trackingMode === 'calendar' || prefs.trackingMode === 'fiscal') mode = prefs.trackingMode;
        else if (prefs.foliosEnabled === false) mode = 'calendar';
        setTrackingMode(mode);
        if (typeof prefs.fiscalYearStartMonth === 'number' && prefs.fiscalYearStartMonth >= 1 && prefs.fiscalYearStartMonth <= 12) {
          setFiscalStart(prefs.fiscalYearStartMonth);
        }
      } catch { /* default to folio */ }
      // Load saved folios for the dropdown (only needed in folio mode, but harmless).
      try {
        const client = await buildClient();
        const cfg: any = await client.request('GET', '/sales/folio-config');
        const list: SavedFolio[] = (cfg.scheduledFolios || []).map((f: any) => ({ name: (f.name || '').trim(), start: f.start, end: f.end }));
        // Include the current folio if not already in the list.
        if (cfg.folioStart && cfg.folioEnd) {
          const exists = list.some((f) => f.start === cfg.folioStart && f.end === cfg.folioEnd);
          if (!exists) list.unshift({ name: (cfg.folioName || 'Current Folio').trim(), start: cfg.folioStart, end: cfg.folioEnd });
        }
        // Sort newest first.
        list.sort((a, b) => (b.start || '').localeCompare(a.start || ''));
        setSavedFolios(list);
      } catch { /* no folios */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve the selected period into an explicit date range (or null = all time).
  // Quarter/year honor the fiscal-year start month when in fiscal mode.
  function resolveRange(sel: string): { start?: string; end?: string } {
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    // Month is always the current calendar month.
    if (sel === 'month') return { start: iso(new Date(now.getFullYear(), now.getMonth(), 1)), end: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };

    // Fiscal offset: 0 for calendar mode, else (fiscalStart - 1) months.
    const fo = trackingMode === 'fiscal' ? (fiscalStart - 1) : 0;

    if (sel === 'quarter') {
      // Months since the fiscal-year start, bucketed into quarters of 3 months.
      const monthsSinceFYStart = ((now.getMonth() - fo) + 12) % 12;
      const qIndex = Math.floor(monthsSinceFYStart / 3); // 0-3
      const qStartMonthAbs = fo + qIndex * 3; // may exceed 11; Date normalizes
      // Anchor to the fiscal year that contains "now".
      const fyYear = now.getMonth() >= fo ? now.getFullYear() : now.getFullYear() - 1;
      const start = new Date(fyYear, qStartMonthAbs, 1);
      const end = new Date(fyYear, qStartMonthAbs + 3, 0);
      return { start: iso(start), end: iso(end) };
    }
    if (sel === 'annual') {
      const fyYear = now.getMonth() >= fo ? now.getFullYear() : now.getFullYear() - 1;
      const start = new Date(fyYear, fo, 1);
      const end = new Date(fyYear + 1, fo, 0);
      return { start: iso(start), end: iso(end) };
    }
    if (sel.startsWith('folio:')) { const f = savedFolios[parseInt(sel.split(':')[1])]; if (f) return { start: f.start, end: f.end }; }
    return {}; // 'all'
  }

  // If the tracking mode changed and the current selection no longer applies
  // (e.g. a folio index while in calendar mode), fall back to All Time.
  useEffect(() => {
    const isFolioSel = period.startsWith('folio:');
    if (trackingMode === 'folio' && (period === 'month' || period === 'quarter' || period === 'annual')) setPeriod('all');
    if (trackingMode !== 'folio' && isFolioSel) setPeriod('all');
  }, [trackingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch team analytics for the selected window whenever it (or team state) changes.
  useEffect(() => {
    if (!isInTeam) return;
    const { start, end } = resolveRange(period);
    fetchAnalytics(start, end);
  }, [isInTeam, period, savedFolios.length, trackingMode, fiscalStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Personal metrics (solo users / fallback) ─────────────────────────────
  const personal = useMemo(() => {
    const { start, end } = resolveRange(period);
    const inWindow = (l: any) => {
      if (!start && !end) return true;
      const d = ((l.createdAt || l.detectedAt || '') + '').slice(0, 10);
      if (!d) return true;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    };
    const scoped = leads.filter(inWindow);
    const clients = scoped.filter((l) => l.status === 'converted');
    const totalSales = clients.reduce((s, l) => s + leadValue(l), 0);
    const dealsWon = clients.length;
    const avgDeal = dealsWon > 0 ? totalSales / dealsWon : 0;
    const winRate = Math.round((dealsWon / (scoped.length || 1)) * 100);
    const stage = {
      new: scoped.filter((l) => l.status === 'new').length,
      followed_up: scoped.filter((l) => l.status === 'followed_up').length,
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
  }, [leads, period, savedFolios.length, trackingMode, fiscalStart]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || (isInTeam && teamLoading)) {
    return <div className="text-center py-16 text-slate-400 text-sm">Loading sales…</div>;
  }

  // Build the timeline dropdown based on how the user tracks production.
  const folioOptions: { id: string; label: string }[] = (() => {
    if (trackingMode === 'folio') {
      return [
        { id: 'all', label: 'All Time' },
        ...savedFolios.map((f, i) => ({ id: `folio:${i}`, label: f.name || `Folio ${i + 1}` })),
      ];
    }
    const yearLabel = trackingMode === 'fiscal' ? 'This Fiscal Year' : 'This Year';
    const quarterLabel = trackingMode === 'fiscal' ? 'This Fiscal Quarter' : 'This Quarter';
    return [
      { id: 'all', label: 'All Time' },
      { id: 'month', label: 'This Month' },
      { id: 'quarter', label: quarterLabel },
      { id: 'annual', label: yearLabel },
    ];
  })();

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
    const userIdByEmail = (email: string) => teamMembers.find((m) => m.email === email)?.userId;
    const { start: winStart, end: winEnd } = resolveRange(period);
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
          right={<PeriodDropdown options={folioOptions} value={period} onChange={setPeriod} />}
        />

        {/* Team totals — the headline */}
        <StatGrid cols={4}>
          <StatCard icon="$" label="Team Revenue" value={money(totalRevenue)} />
          <StatCard icon="📄" label="Deals Won" value={wonDeals} />
          <StatCard icon="🏷️" label="Avg Deal Value" value={money(avgDeal)} />
          <StatCard icon="📈" label="Win Rate" value={winRate + '%'} />
        </StatGrid>

        {/* Leaderboard — who's producing */}
        <Panel title="🏆 Team Leaderboard" className="border-amber-500/30">
          {members.length === 0 ? (
            <p className="text-xs text-slate-500">No team sales recorded in this period.</p>
          ) : (
            <div className="space-y-2.5">
              {members.map((mem, i) => {
                const uid = userIdByEmail(mem.email);
                const name = mem.email.split('@')[0];
                return (
                  <button
                    key={mem.email}
                    onClick={() => uid && setOpenMember({ userId: uid, name })}
                    disabled={!uid}
                    className="w-full text-left group disabled:cursor-default"
                  >
                    <DataBar
                      label={<span className="truncate group-hover:text-white">{i === 0 ? '👑 ' : ''}{name}{uid && <span className="text-amber-400/70 text-[10px] ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity">view →</span>}</span>}
                      value={mem.revenue}
                      max={memberMax}
                      color={BAR_COLORS[i % BAR_COLORS.length]}
                      suffix={<span>{money(mem.revenue)} · {mem.wonDeals} won</span>}
                    />
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-[10px] text-slate-500 mt-2">Tap a teammate to see their pipeline and clients sold.</p>
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

        {openMember && (
          <TeamMemberPipeline
            memberUserId={openMember.userId}
            memberName={openMember.name}
            folioStart={winStart}
            folioEnd={winEnd}
            onClose={() => setOpenMember(null)}
          />
        )}
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
        right={<PeriodDropdown options={folioOptions} value={period} onChange={setPeriod} />}
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
            <StatCard icon="$" label="Total Sales" value={money(personal.totalSales)} />
            <StatCard icon="📄" label="Deals Won" value={personal.dealsWon} />
            <StatCard icon="🏷️" label="Avg Deal Value" value={money(personal.avgDeal)} />
            <StatCard icon="📈" label="Win Rate" value={personal.winRate + '%'} />
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
