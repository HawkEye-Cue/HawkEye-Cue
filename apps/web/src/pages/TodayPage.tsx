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

  const summaryCards = [
    { label: 'New opportunities', value: counts.newOpps, icon: '🎯', accent: 'text-amber-300', route: '/pipeline' },
    { label: 'Need follow-up', value: counts.followUps, icon: '📞', accent: 'text-sky-300', route: '/pipeline?view=deals' },
    { label: 'Posts ready', value: counts.postsReady, icon: '✨', accent: 'text-purple-300', route: '/create' },
    { label: 'Active pipeline', value: `$${counts.activeValue.toLocaleString()}`, icon: '💰', accent: 'text-emerald-300', route: '/pipeline?view=deals' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-1 pb-24 space-y-6">
      {/* Greeting */}
      <div className="pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-400/80">🦅 The Nest</p>
        <h1 className="text-2xl font-bold text-white mt-0.5">{greeting}, {name} 👋</h1>
        <p className="text-sm text-slate-400 mt-1">
          Here's your daily flight plan{selectedTrade?.name ? ` for your ${selectedTrade.name.toLowerCase()} business` : ''}.
        </p>
      </div>

      <SetupProgress />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        {summaryCards.map((c) => (
          <button
            key={c.label}
            onClick={() => navigate(c.route)}
            className="glass-card text-left hover:border-amber-500/30 transition-all active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xl">{c.icon}</span>
            </div>
            <p className={`text-2xl font-extrabold mt-2 ${c.accent}`}>{loading ? '—' : c.value}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{c.label}</p>
          </button>
        ))}
      </div>

      {/* Flight plan CTA or all-clear */}
      {hasWork ? (
        <button
          onClick={() => setShowPlan(true)}
          className="w-full py-4 bg-gradient-to-r from-amber-500 to-yellow-400 text-black text-base font-extrabold rounded-2xl shadow-lg shadow-amber-500/20 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          🦅 Start My Flight Plan
          <span className="text-xs font-bold bg-black/15 rounded-full px-2 py-0.5">{tasks.length}</span>
        </button>
      ) : (
        <div className="glass-card text-center py-8 border border-emerald-500/20">
          <div className="text-4xl mb-2">🕊️</div>
          <h3 className="text-base font-bold text-white">You're all clear</h3>
          <p className="text-sm text-slate-400 mt-1">
            {loading ? 'Checking your skies…' : 'Nothing needs your attention right now. Want to get ahead?'}
          </p>
          {!loading && (
            <div className="flex gap-2 justify-center mt-4">
              <button onClick={() => navigate('/create')} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg">✨ Create a post</button>
              <button onClick={() => navigate('/pipeline')} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg">🎯 Find opportunities</button>
            </div>
          )}
        </div>
      )}

      {/* Guided mode: a gentle tip. Pro mode: the full-dashboard power link. */}
      {isGuided ? (
        hasWork && (
          <p className="text-center text-[11px] text-slate-500">
            💡 Tip: tap <span className="text-amber-400 font-semibold">Start My Flight Plan</span> and HawkEye will walk you through each task, one at a time.
          </p>
        )
      ) : (
        <div className="text-center">
          <button onClick={() => navigate('/dashboard')} className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2">
            See full dashboard & calendar
          </button>
        </div>
      )}

      {showPlan && <FlightPlan tasks={tasks} onClose={() => setShowPlan(false)} />}
    </div>
  );
}
