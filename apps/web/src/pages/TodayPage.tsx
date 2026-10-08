import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTrade } from '../contexts/TradeContext';
import { useCalendar } from '../contexts/CalendarContext';
import { useMode } from '../contexts/ModeContext';
import { ApiClient } from '@social-lead-gen/shared';
import FlightPlan from '../components/FlightPlan';
import type { FlightTask } from '../components/FlightPlan';
import SetupProgress from '../components/SetupProgress';

interface TodayCounts {
  newOpps: number;
  followUps: number;
  postsReady: number;
  activeValue: number;
}

function greetingFor(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Resolve the user's first name from saved display names, else email prefix.
function resolveName(email?: string): string {
  if (!email) return 'there';
  try {
    const names = JSON.parse(localStorage.getItem('hawkeye_display_names') || '{}');
    const saved = names[email];
    if (saved && typeof saved === 'string') return saved.split(' ')[0];
  } catch { /* ignore */ }
  const prefix = email.split('@')[0].replace(/[._]/g, ' ').trim();
  if (!prefix) return 'there';
  return prefix.charAt(0).toUpperCase() + prefix.slice(1).split(' ')[0];
}

export default function TodayPage() {
  const navigate = useNavigate();
  const { user, getToken } = useAuth();
  const { selectedTrade } = useTrade();
  const { events } = useCalendar();
  const { isGuided } = useMode();

  const [counts, setCounts] = useState<TodayCounts>({ newOpps: 0, followUps: 0, postsReady: 0, activeValue: 0 });
  const [loading, setLoading] = useState(true);
  const [showPlan, setShowPlan] = useState(false);

  const name = resolveName(user?.email);
  const greeting = greetingFor();

  // Redirect brand-new users to onboarding (same rule the old dashboard used)
  useEffect(() => {
    if (!localStorage.getItem('hawkeye_onboarded')) {
      navigate('/onboarding', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const token = await getToken();
        const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });

        const next: TodayCounts = { newOpps: 0, followUps: 0, postsReady: 0, activeValue: 0 };

        // New opportunities
        try {
          const statsResult = await client.getOpportunityStats();
          const s = (statsResult as any)?.stats || statsResult;
          next.newOpps = s.new || 0;
        } catch { /* ignore */ }

        // Follow-ups + active pipeline value (active deals)
        try {
          const dealsResult = await client.request<{ deals: any[] }>('GET', '/sales/deals');
          const deals = dealsResult.deals || [];
          const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
          next.followUps = deals.filter((d: any) => ['prospect', 'contacted', 'quoted'].includes(d.stage) && (d.createdAt || '') < twoDaysAgo).length;
          next.activeValue = deals
            .filter((d: any) => ['prospect', 'contacted', 'quoted', 'closing'].includes(d.stage))
            .reduce((sum: number, d: any) => sum + (Number(d.dealValue) || 0), 0);
        } catch { /* ignore */ }

        // Posts ready to publish (scheduled)
        try {
          const postsResult = await client.getPosts();
          const posts = Array.isArray(postsResult) ? postsResult : (postsResult as any)?.posts || [];
          next.postsReady = posts.filter((p: any) => p.status === 'scheduled').length;
        } catch { /* ignore */ }

        if (!cancelled) setCounts(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [getToken]);

  // Today's meetings/reminders from the calendar context (not overdue tasks)
  const todaysMeetings = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return events.filter((e) => e.date === today && (e.type === 'meeting' || e.type === 'reminder') && !e.completed);
  }, [events]);

  // Build the guided flight plan from what actually needs attention
  const tasks: FlightTask[] = useMemo(() => {
    const list: FlightTask[] = [];
    if (counts.newOpps > 0) {
      list.push({
        id: 'opps',
        icon: '🎯',
        title: `Review ${counts.newOpps} new ${counts.newOpps === 1 ? 'opportunity' : 'opportunities'}`,
        subtitle: 'Powered by HawkSight',
        detail: 'Fresh conversations HawkEye spotted. Decide who to respond to first.',
        actionLabel: 'See opportunities',
        route: '/pipeline',
        count: counts.newOpps,
      });
    }
    if (counts.followUps > 0) {
      list.push({
        id: 'followups',
        icon: '📞',
        title: `Follow up with ${counts.followUps} ${counts.followUps === 1 ? 'lead' : 'leads'}`,
        subtitle: 'Flight Projection',
        detail: "These have gone quiet for a couple days. A quick nudge keeps them warm.",
        actionLabel: 'Start follow-up plan',
        route: '/pipeline?view=deals',
        count: counts.followUps,
      });
    }
    if (todaysMeetings.length > 0) {
      list.push({
        id: 'meetings',
        icon: '🗓️',
        title: `${todaysMeetings.length} ${todaysMeetings.length === 1 ? 'appointment' : 'appointments'} today`,
        detail: todaysMeetings.slice(0, 3).map((m) => m.title).join(' · '),
        actionLabel: 'View schedule',
        route: '/create',
        count: todaysMeetings.length,
      });
    }
    if (counts.postsReady > 0) {
      list.push({
        id: 'posts',
        icon: '✨',
        title: `${counts.postsReady} ${counts.postsReady === 1 ? 'post is' : 'posts are'} ready to publish`,
        detail: 'Content is scheduled and waiting. Review or publish when you like.',
        actionLabel: 'Open Create',
        route: '/create',
        count: counts.postsReady,
      });
    }
    return list;
  }, [counts, todaysMeetings]);

  const hasWork = tasks.length > 0;

  const summaryCards: { label: string; value: string | number; icon: string; accent: string; route: string }[] = [
    { label: 'New opportunities', value: counts.newOpps, icon: '🎯', accent: 'amber', route: '/pipeline' },
    { label: 'Need follow-up', value: counts.followUps, icon: '📞', accent: 'sky', route: '/pipeline?view=deals' },
    { label: 'Posts ready', value: counts.postsReady, icon: '✨', accent: 'purple', route: '/create' },
    { label: 'Active pipeline', value: `$${counts.activeValue.toLocaleString()}`, icon: '💰', accent: 'green', route: '/pipeline?view=deals' },
  ];

  return (
    <div className="space-y-4 pb-8">
      {/* Sales-style hero header — "The Nest" greeting lives in an intentional
          glass container instead of floating text over the hawk background.
          Built to visibly match the Sales/Team Sales hero: a wide, dark
          translucent panel with white-alpha border that covers the hawk. */}
      <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-neutral-900/75 backdrop-blur-xl px-6 py-8 sm:px-8 sm:py-10 shadow-xl shadow-black/40 ring-1 ring-white/5">
        {/* soft amber glow in the corner for brand warmth, like the Sales eye glow */}
        <div className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-amber-500/15 blur-3xl" />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">🦅 The Nest</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight tracking-tight mt-1">
            {greeting}, {name} 👋
          </h1>
          <p className="text-sm sm:text-base text-slate-200 mt-2 max-w-2xl">
            Here's your daily flight plan{selectedTrade?.name ? ` for your ${selectedTrade.name.toLowerCase()} business` : ''}.
          </p>
        </div>
      </div>

      <SetupProgress />

      {/* Metrics — KPI card family. Brightest layer in the page's contrast
          hierarchy (lighter than hero + section panels) so numbers pop. */}
      {/* 2-up on small/standard widths; 4-up only at xl (≥1280) where the sidebar
          leaves enough room for four comfortable cards. minmax(0,1fr) via min-w-0
          children so a card can never force the grid past the viewport. */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {summaryCards.map((c) => (
          <button
            key={c.label}
            onClick={() => navigate(c.route)}
            className="flex items-center gap-3 rounded-2xl border border-white/15 bg-neutral-800/80 backdrop-blur-md px-4 py-3 text-left shadow-lg shadow-black/20 transition-all active:scale-[0.98] hover:bg-neutral-700/80 hover:border-amber-500/40 min-w-0"
          >
            <span className="w-10 h-10 rounded-xl bg-amber-500 text-black flex items-center justify-center text-lg font-black shrink-0">{c.icon}</span>
            <span className="min-w-0">
              <span className="block text-xl font-extrabold text-white leading-tight truncate">{loading ? '—' : c.value}</span>
              <span className="block text-[11px] text-slate-300 font-medium truncate">{c.label}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Two intentional sections — stacked until xl (≥1280) where there's room for a
          comfortable two-column working area beside the fixed sidebar. */}
      <div className="space-y-4 xl:space-y-0 xl:grid xl:grid-cols-2 xl:gap-4 xl:items-start">
        {/* Quick action: analyze a post / screenshot. Mid-tone charcoal glass —
            lighter than the page background, distinct from the darker hero. */}
        <div className="rounded-2xl border border-white/12 bg-neutral-900/60 backdrop-blur-md p-4 shadow-lg shadow-black/30">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-3">Send to HawkEye</h3>
          <button
            onClick={() => navigate('/pipeline?radar=1')}
            className="w-full py-3 rounded-xl border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span className="text-lg">📸</span>
            <span className="text-sm font-bold text-amber-200">Analyze a post or screenshot</span>
          </button>
          <p className="text-[11px] text-slate-400 mt-2">Paste or upload anything you spotted — HawkEye scores it for you.</p>
        </div>

        {/* Daily flight plan */}
        <div className="rounded-2xl border border-white/12 bg-neutral-900/60 backdrop-blur-md p-4 shadow-lg shadow-black/30">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-3">Today's Flight Plan</h3>
          {hasWork ? (
            <>
              <button
                onClick={() => setShowPlan(true)}
                className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-black text-base font-extrabold rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                🦅 Start My Flight Plan
                <span className="text-xs font-bold bg-black/15 rounded-full px-2 py-0.5">{tasks.length}</span>
              </button>
              {isGuided && (
                <p className="text-center text-[11px] text-slate-400 mt-2">
                  💡 Tip: tap <span className="text-amber-400 font-semibold">Start My Flight Plan</span> and HawkEye walks you through each task, one at a time.
                </p>
              )}
            </>
          ) : (
            <div className="text-center py-1">
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl">🕊️</span>
                <h3 className="text-base font-bold text-white">You're all clear</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {loading ? 'Checking your skies…' : 'Nothing needs your attention right now. Want to get ahead?'}
              </p>
              {!loading && (
                <div className="flex gap-2 justify-center mt-3">
                  <button onClick={() => navigate('/create')} className="px-3 py-1.5 border border-white/10 bg-white/5 hover:bg-white/10 text-white text-xs font-medium rounded-lg">✨ Create a post</button>
                  <button onClick={() => navigate('/pipeline')} className="px-3 py-1.5 border border-white/10 bg-white/5 hover:bg-white/10 text-white text-xs font-medium rounded-lg">🎯 Find opportunities</button>
                </div>
              )}
            </div>
          )}
          {!isGuided && (
            <div className="text-center mt-3">
              <button onClick={() => navigate('/dashboard')} className="text-xs text-slate-400 hover:text-white underline underline-offset-2">
                See full dashboard & calendar
              </button>
            </div>
          )}
        </div>
      </div>

      {showPlan && <FlightPlan tasks={tasks} onClose={() => setShowPlan(false)} />}
    </div>
  );
}
