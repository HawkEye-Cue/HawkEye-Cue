import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrade } from '../contexts/TradeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCalendar } from '../contexts/CalendarContext';
import { useToast } from '../contexts/ToastContext';
import { TRADES, ApiClient } from '@social-lead-gen/shared';
import type { ScheduledPost } from '@social-lead-gen/shared';
import TradeSelector from '../components/TradeSelector';
import { useTeamData } from '../hooks/useTeamData';
import HourlyTimeline from '../components/HourlyTimeline';
import type { TimelineEvent } from '../components/HourlyTimeline';
import ViewModeToggle from '../components/ViewModeToggle';
import type { ViewMode } from '../components/ViewModeToggle';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { selectedTrade, selectedTrades } = useTrade();
  const { getToken, user } = useAuth();
  const { events, toggleComplete, removeEvent, updateEvent, refreshEvents, addEvent, removeAllByTitle } = useCalendar();
  const { showToast } = useToast();
  const { isInTeam } = useTeamData();
  const [todayPosts, setTodayPosts] = useState<ScheduledPost[]>([]);
  const [futurePosts, setFuturePosts] = useState<ScheduledPost[]>([]);
  const [leadStats, setLeadStats] = useState({ total: 0, new: 0, followedUp: 0, converted: 0 });
  const [followUpDeals, setFollowUpDeals] = useState<{ id: string; name: string; stage: string; policyType: string; createdAt: string }[]>([]);
  const [engagement, setEngagement] = useState<{ totalLikes: number; totalComments: number; totalShares: number; postStats: any[] } | null>(null);
  const [pendingLinkInvites, setPendingLinkInvites] = useState<{ id: string; partnerEmail: string; partnerName: string }[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<string>('none');
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(() => {
    // Don't show welcome banner if guided tour hasn't been completed yet (tour shows first)
    const tourKey = user?.sub ? `hawkeye_tour_done_${user.sub}` : 'hawkeye_tour_done';
    const tourDone = localStorage.getItem(tourKey);
    if (!tourDone) return false;
    // Show unless user permanently dismissed it
    return !localStorage.getItem(`hawkeye_welcome_dismissed_${user?.sub || 'anon'}`);
  });
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editLink, setEditLink] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editDate, setEditDate] = useState('');
  const [rescheduleRepeat, setRescheduleRepeat] = useState<'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [rescheduleStartDate, setRescheduleStartDate] = useState('');
  const [dashCalDay, setDashCalDay] = useState<string | null>(null);
  const [dashCalMonth, setDashCalMonth] = useState(new Date().getMonth());
  const [dashCalYear, setDashCalYear] = useState(new Date().getFullYear());
  const [dashCalAdd, setDashCalAdd] = useState(false);
  const [dashCalTitle, setDashCalTitle] = useState('');
  const [dashCalType, setDashCalType] = useState<'post' | 'meeting' | 'reminder'>('post');
  const [dashCalTime, setDashCalTime] = useState('');
  const [dashCalLink, setDashCalLink] = useState('');
  const [dashCalInviteEmail, setDashCalInviteEmail] = useState('');
  const [dashViewMode, setDashViewMode] = useState<ViewMode>('month');
  const [teamWins, setTeamWins] = useState<{ id: string; memberName: string; dealName: string; dealValue: number; closedAt: string }[]>([]);

  // Refetch when page becomes visible (user navigates back)
  useEffect(() => {
    const handleFocus = () => { setRefreshKey((k) => k + 1); refreshEvents(); };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshEvents]);

  // Redirect new users to onboarding
  useEffect(() => {
    if (!localStorage.getItem('hawkeye_onboarded')) {
      navigate('/onboarding', { replace: true });
    }
  }, [navigate]);

  // Show welcome banner after guided tour completes
  useEffect(() => {
    if (showWelcomeBanner) return;
    function checkTourDone() {
      const tourKey = user?.sub ? `hawkeye_tour_done_${user.sub}` : 'hawkeye_tour_done';
      const dismissed = localStorage.getItem(`hawkeye_welcome_dismissed_${user?.sub || 'anon'}`);
      if (localStorage.getItem(tourKey) && !dismissed) {
        setShowWelcomeBanner(true);
      }
    }
    window.addEventListener('focus', checkTourDone);
    const interval = setInterval(checkTourDone, 1000);
    return () => { window.removeEventListener('focus', checkTourDone); clearInterval(interval); };
  }, [showWelcomeBanner, user?.sub]);

  useEffect(() => {
    async function fetchTodayPosts() {
      try {
        const token = await getToken();
        const client = new ApiClient({
          baseUrl: import.meta.env.VITE_API_URL as string,
          getToken: async () => token,
        });
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const result = await client.getPosts({ startDate: today, endDate: today });

        // Fetch subscription tier
        try {
          const sub = await client.request<{ tier: string; trialEndsAt?: string; status?: string }>('GET', '/subscription');
          setCurrentTier(sub.tier || 'free');
          if (sub.trialEndsAt) setTrialEndsAt(sub.trialEndsAt);
          if (sub.status) setSubStatus(sub.status);
        } catch { /* default to free */ }

        // Fetch lead stats
        try {
          const statsResult = await client.getOpportunityStats();
          const s = (statsResult as any)?.stats || statsResult;
          setLeadStats({
            total: s.total || 0,
            new: s.new || 0,
            followedUp: s.followedUp || s.followed_up || 0,
            converted: s.converted || 0,
          });
        } catch { /* ignore */ }

        // Fetch deals needing follow-up (active deals older than 2 days)
        try {
          const dealsResult = await client.request<{ deals: any[] }>('GET', '/sales/deals');
          const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
          const needsFollowUp = (dealsResult.deals || []).filter((d: any) =>
            ['prospect', 'contacted', 'quoted'].includes(d.stage) && d.createdAt < twoDaysAgo
          ).slice(0, 5);
          setFollowUpDeals(needsFollowUp);
        } catch { /* ignore */ }

        // Fetch engagement stats
        try {
          const engResult = await client.request<any>('GET', '/profile/engagement');
          if (engResult && (engResult.totalLikes > 0 || engResult.totalComments > 0)) {
            setEngagement(engResult);
          }
        } catch { /* ignore */ }
        // Fetch pending link invites
        try {
          const linksResult = await client.request<{ links: any[] }>('GET', '/sales/linked');
          const incoming = (linksResult.links || []).filter((l: any) => l.status === 'incoming' || (l.status === 'pending' && l.direction === 'incoming'));
          setPendingLinkInvites(incoming);
        } catch { /* ignore */ }
        // Fetch team deal win notifications (Summit tier)
        try {
          const notifResult = await client.request<{ notifications: any[] }>('GET', '/team/notifications');
          const wins = (notifResult.notifications || []).slice(0, 5).map((n: any) => ({
            id: n.id,
            memberName: n.memberName || 'Teammate',
            dealName: n.dealName || 'Deal',
            dealValue: n.dealValue || 0,
            closedAt: n.closedAt || '',
          }));
          setTeamWins(wins);
        } catch { /* ignore - user may not be in a team */ }
        // Sync notepad from server
        try {
          const prefs = await client.request<any>('GET', '/profile/preferences');
          if (prefs.notepad && !localStorage.getItem(`hawkeye_notepad_${user?.sub}`)) {
            localStorage.setItem(`hawkeye_notepad_${user?.sub}`, prefs.notepad);
          }
        } catch { /* ignore */ }
        const posts = Array.isArray(result) ? result : (result as any)?.posts || [];
        // Auto-clean: only show posts from today that haven't been published before today
        const todayStart = new Date(today).getTime();
        const filtered = posts.filter((p: ScheduledPost) => {
          // If published and the publishedAt was before today, don't show
          if (p.status === 'published' && p.publishedAt) {
            const publishedDate = new Date(p.publishedAt).toISOString().split('T')[0];
            if (publishedDate < today) return false;
          }
          return true;
        });
        setTodayPosts(filtered);

        // Fetch all posts for upcoming display (no auto-deletion of history)
        const allResult = await client.getPosts();
        const allPosts = Array.isArray(allResult) ? allResult : (allResult as any)?.posts || [];

        // Separate future scheduled posts
        const now2 = new Date();
        const todayLocal = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}-${String(now2.getDate()).padStart(2, '0')}`;
        const upcoming = allPosts
          .filter((p: ScheduledPost) => p.status === 'scheduled' && p.scheduledAt && p.scheduledAt.split('T')[0] > todayLocal)
          .sort((a: ScheduledPost, b: ScheduledPost) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''));
        setFuturePosts(upcoming);
      } catch {
        // ignore
      }
    }
    fetchTodayPosts();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayStr = (() => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${mm}-${dd}`;
  })();
  const todayEvents = events.filter((e) => e.date === todayStr);

  const typeColors: Record<string, string> = {
    post: 'text-blue-400',
    meeting: 'text-amber-400',
    task: 'text-amber-400',
    reminder: 'text-green-400',
  };
  const typeIcons: Record<string, string> = {
    post: '📤',
    meeting: '🤝',
    task: '🤝',
    reminder: '🔔',
  };

  if (!selectedTrade) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-white">Welcome! Select your trade to get started</h2>
        <TradeSelector />
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
      {/* Left column */}
      <div className="min-w-0 space-y-4">
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-xl font-bold text-white">Dashboard</h2>
        <div className="flex flex-wrap justify-center gap-1.5">
          {selectedTrades.map((trade) => (
            <span key={trade.id} className="text-xs bg-blue-500/15 text-blue-300 px-2.5 py-1 rounded-full border border-blue-500/20">
              {trade.name}
            </span>
          ))}
        </div>
      </div>

      {/* Welcome Banner — shows once per user */}
      {showWelcomeBanner && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="max-w-sm w-full bg-slate-900 border-2 border-blue-500/50 rounded-2xl p-6 shadow-2xl shadow-blue-500/20 text-center">
            <div className="text-5xl mb-4">🦅</div>
            <h2 className="text-xl font-bold text-white mb-3">Welcome to HawkEye-Cue!</h2>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              We're a brand-new platform, so there may be a few bumps in our flight as we grow. If you run into anything or have ideas, we want to hear from you!
            </p>
            <div className="space-y-2 mb-5">
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 cursor-pointer hover:bg-blue-500/20 transition-colors" onClick={() => { setShowWelcomeBanner(false); navigate('/settings#suggestion'); }}>
                <p className="text-sm text-blue-300">💡 Send a suggestion on the <strong>Settings</strong> tab →</p>
              </div>
              <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <p className="text-sm text-purple-300">📧 Or email <a href="mailto:briannafrashier@hawkeyecue.com" className="underline font-bold text-white">briannafrashier@hawkeyecue.com</a></p>
                <p className="text-xs text-slate-400 mt-1">She'll respond promptly</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-4">Thanks for being an early flier! 🙌</p>
            <button
              onClick={() => { setShowWelcomeBanner(false); }}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold rounded-xl text-sm transition-all active:scale-95"
            >
              Got it — Let's Go! 🚀
            </button>
            <button
              onClick={() => { setShowWelcomeBanner(false); localStorage.setItem(`hawkeye_welcome_dismissed_${user?.sub || 'anon'}`, 'true'); }}
              className="w-full mt-2 py-2 text-slate-500 hover:text-slate-300 text-xs transition-colors"
            >
              Do not show again
            </button>
          </div>
        </div>
      )}

      {/* Trial Expiry Banner */}
      {subStatus === 'trial' && trialEndsAt && (() => {
        const daysLeft = Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
        if (daysLeft <= 2) {
          return (
            <div className="p-4 rounded-xl bg-gradient-to-r from-red-500/20 to-amber-500/20 border-2 border-amber-500/40">
              <p className="text-sm font-bold text-amber-300">⏰ Your free Soar trial {daysLeft === 0 ? 'ends today' : `ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}!</p>
              <p className="text-xs text-slate-300 mt-1">After the trial, you'll move to the Nest (free) plan. Upgrade now to keep all your Soar features.</p>
              <button onClick={() => navigate('/settings')} className="mt-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-sm font-bold rounded-lg hover:opacity-90 transition-all active:scale-95">
                Upgrade to Soar — $24.99/mo
              </button>
            </div>
          );
        }
        return (
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-blue-300">🚀 <strong>Free Soar trial</strong> — {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining. Enjoy full access!</p>
          </div>
        );
      })()}

      {/* Trial Expired Banner */}
      {subStatus === 'expired' && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-red-500/10 to-slate-800 border border-red-500/30">
          <p className="text-sm font-bold text-red-300">Your Soar trial has ended</p>
          <p className="text-xs text-slate-400 mt-1">You're now on the Nest (free) plan. Upgrade to get back keyword tracking, leads, sales tracker, and more.</p>
          <button onClick={() => navigate('/settings')} className="mt-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-sm font-bold rounded-lg hover:opacity-90 transition-all active:scale-95">
            Upgrade to Soar — $24.99/mo
          </button>
        </div>
      )}

      {/* Pending Link Invites Banner */}
      {pendingLinkInvites.length > 0 && pendingLinkInvites.map((invite) => (
        <div key={invite.id} className="p-4 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-2 border-amber-500/40 animate-pulse-slow">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-amber-300">🔗 Link Request</p>
              <p className="text-xs text-slate-300 mt-0.5"><strong>{invite.partnerName || invite.partnerEmail}</strong> wants to link Sales Trackers with you</p>
            </div>
            <button
              onClick={async () => {
                try {
                  const token = await getToken();
                  const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
                  const result = await client.request<any>('POST', '/sales/linked/accept', { linkId: invite.id });
                  setPendingLinkInvites((prev) => prev.filter((i) => i.id !== invite.id));
                } catch (e) {
                  console.error('Accept failed:', e);
                  alert('Failed to accept: ' + (e instanceof Error ? e.message : String(e)));
                }
              }}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-lg shrink-0 active:scale-95 transition-all"
            >
              Accept ✓
            </button>
          </div>
        </div>
      ))}

      {/* Team Deal Win Notifications */}
      {teamWins.length > 0 && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-green-500/15 to-emerald-500/15 border-2 border-green-500/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🏆</span>
            <p className="text-sm font-bold text-green-300">Team Wins!</p>
          </div>
          <div className="space-y-1.5">
            {teamWins.map((win) => (
              <div key={win.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
                <div>
                  <p className="text-xs text-slate-200"><strong>{win.memberName}</strong> closed <strong>{win.dealName}</strong></p>
                </div>
                <span className="text-sm font-bold text-green-400">${win.dealValue.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate('/team')}
            className="mt-2 text-xs text-green-400 hover:text-green-300"
          >
            View all team activity →
          </button>
        </div>
      )}

      {/* Meeting Alert Banner */}
      {(() => {
        const todayMeetings = todayEvents.filter((e) => e.type === 'meeting');
        const undoneMeetings = todayMeetings.filter((m) => !m.completed);
        if (todayMeetings.length === 0) return null;
        if (undoneMeetings.length === 0) {
          // All meetings done — show compact completed banner
          return (
            <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2">
              <span className="text-sm">✅</span>
              <p className="text-xs text-green-300">{todayMeetings.length} meeting{todayMeetings.length !== 1 ? 's' : ''} completed today</p>
            </div>
          );
        }
        return (
          <div className="p-4 rounded-xl bg-slate-700/95 border-2 border-amber-500/50">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">🤝</span>
              <p className="text-sm font-bold text-amber-300">{undoneMeetings.length} Meeting{undoneMeetings.length !== 1 ? 's' : ''} Today</p>
            </div>
            <div className="space-y-1.5">
              {todayMeetings.map((m) => {
                const timeMatch = m.title.match(/^\[(\d{1,2}):(\d{2})\]/);
                const cleanTitle = m.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '').replace(/\s*\|.*$/, '');
                let timeStr = '';
                if (timeMatch) {
                  const h = parseInt(timeMatch[1]);
                  const min = timeMatch[2];
                  timeStr = `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${min} ${h >= 12 ? 'PM' : 'AM'}`;
                }
                if (m.completed) {
                  return (
                    <div key={m.id} className="flex items-center gap-2 bg-slate-800 border border-green-500/30 rounded-lg px-3 py-1.5 opacity-70">
                      <span className="text-xs text-green-400">✓</span>
                      <span className="text-xs text-slate-400 flex-1 truncate line-through">{cleanTitle}</span>
                    </div>
                  );
                }
                return (
                  <div key={m.id} className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
                    {timeStr && <span className="text-xs font-bold text-white bg-amber-600 px-2 py-0.5 rounded">{timeStr}</span>}
                    <span className="text-xs text-slate-200 flex-1 truncate">{cleanTitle}</span>
                    {m.inviteStatus === 'confirmed' && <span className="text-[9px] bg-green-600/40 text-green-300 px-1.5 py-0.5 rounded-full">✓ Confirmed</span>}
                    {m.inviteStatus === 'pending' && <span className="text-[9px] bg-amber-600/40 text-amber-300 px-1.5 py-0.5 rounded-full">⏳ Pending</span>}
                    {m.link && <a href={m.link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 shrink-0">🔗</a>}
                    <button
                      onClick={() => toggleComplete(m.id)}
                      className="text-xs text-green-400 hover:text-green-300 bg-green-600/20 px-2 py-0.5 rounded font-medium shrink-0"
                    >
                      Done
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Daily Cues */}
      <details className="glass-card" open>
        <summary className="font-semibold text-white cursor-pointer">Today's Cues</summary>
        <div className="mt-3 space-y-3">
        {(todayEvents.length > 0 || todayPosts.length > 0 || followUpDeals.length > 0) ? (
          <>
            {(() => {
              const posts = todayEvents.filter((e) => e.type === 'post');
              const meetings = todayEvents.filter((e) => e.type === 'meeting');
              const flightOff = localStorage.getItem(`hawkeye_flight_enabled_${user?.sub}`) === 'false';
              const reminders = todayEvents.filter((e) => (e.type === 'reminder' || e.type === 'task') && !(flightOff && (e.title.startsWith('📞') || e.title.startsWith('💬') || e.title.startsWith('✉️'))));

              return (
                <>
                  {/* Tiles row — Meetings first, Reminders second, Posts third */}
                  <div className="grid grid-cols-3 gap-2">
                    {/* Meetings Tile */}
                    <details className="rounded-xl border border-amber-500/40 bg-slate-800 overflow-hidden backdrop-blur-sm" open>
                      <summary className="flex flex-col items-center justify-center p-3 cursor-pointer">
                        <span className="text-xl">🤝</span>
                        <span className="text-xs font-bold text-amber-400 mt-0.5">Meetings</span>
                        <span className="text-lg font-bold text-amber-400">{meetings.length}</span>
                      </summary>
                      {meetings.length > 0 && (
                        <div className="px-2 pb-2 space-y-1.5 border-t border-amber-500/20 pt-2">
                          {meetings.map((event) => (
                            <div key={event.id} className="p-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                              <div className="flex items-center gap-2">
                                <input type="checkbox" checked={event.completed} onChange={() => toggleComplete(event.id)} className="w-3.5 h-3.5 rounded shrink-0 accent-amber-500" />
                                <span className={`text-xs flex-1 ${event.completed ? 'line-through text-slate-600' : 'text-slate-200'}`}>{event.title}</span>
                                {event.inviteStatus === 'confirmed' && <span className="text-[8px] bg-green-600/30 text-green-300 px-1 py-0.5 rounded-full shrink-0">✓</span>}
                                {event.inviteStatus === 'pending' && <span className="text-[8px] bg-amber-600/30 text-amber-300 px-1 py-0.5 rounded-full shrink-0">⏳</span>}
                              </div>
                              <div className="flex items-center gap-1 mt-1 ml-5">
                                {event.link && <a href={event.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-blue-400 hover:text-blue-300">🔗 Link</a>}
                                <button onClick={() => {
                                  setEditingEvent(event);
                                  const timeMatch = event.title.match(/^\[(\d{1,2}:\d{2})\]\s*/);
                                  const locationMatch = event.title.match(/\s*—\s*📍\s*(.+?)(?:\s*\||$)/);
                                  let cleanTitle = event.title;
                                  if (timeMatch) cleanTitle = cleanTitle.replace(timeMatch[0], '');
                                  if (locationMatch) cleanTitle = cleanTitle.replace(/\s*—\s*📍.*$/, '');
                                  const notesMatch = cleanTitle.match(/\s*\|\s*(.+)$/);
                                  if (notesMatch) cleanTitle = cleanTitle.replace(notesMatch[0], '');
                                  setEditTitle(cleanTitle.trim());
                                  setEditTime(timeMatch ? timeMatch[1] : '');
                                  setEditLocation(locationMatch ? locationMatch[1].trim() : '');
                                  setEditLink(event.link || '');
                                  setEditDate(event.date);
                                }} className="text-[10px] text-slate-400 hover:text-white">✏️ Edit</button>
                                <button onClick={() => removeEvent(event.id)} className="text-[10px] text-red-400 hover:text-red-300">🗑️ Delete</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </details>

                    {/* Reminders Tile */}
                    <details className="rounded-xl border border-green-500/40 bg-slate-800 overflow-hidden backdrop-blur-sm" open>
                      <summary className="flex flex-col items-center justify-center p-3 cursor-pointer">
                        <span className="text-xl">🔔</span>
                        <span className="text-xs font-bold text-green-400 mt-0.5">Reminders</span>
                        <span className="text-lg font-bold text-green-400">{reminders.length}</span>
                      </summary>
                      {reminders.length > 0 && (
                        <div className="px-2 pb-2 space-y-0.5 border-t border-green-500/20 pt-2">
                          {reminders.map((event) => {
                            // Extract just the person's name from title (format: "📞 Name — task")
                            const nameMatch = event.title.match(/^[📞💬✉️🔔]\s*(.+?)(?:\s*—|$)/);
                            const displayName = nameMatch ? nameMatch[1].trim() : event.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '').slice(0, 25);
                            const icon = event.title.startsWith('📞') ? '📞' : event.title.startsWith('💬') ? '💬' : event.title.startsWith('✉️') ? '✉️' : '🔔';
                            return (
                              <div
                                key={event.id}
                                onClick={() => {
                                  // Extract lead name from reminder title (formats: "📞 Name — task", "[HH:MM] 📞 Name — task", "🔔 Name — task")
                                  let leadName = '';
                                  const cleaned = event.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, ''); // strip time prefix
                                  const nameMatch2 = cleaned.match(/^[📞💬✉️🔔📋]\s*(.+?)(?:\s*—|$)/);
                                  if (nameMatch2) {
                                    leadName = nameMatch2[1].trim();
                                  } else {
                                    // Fallback: use the first part before " — " or the whole title
                                    const parts = cleaned.split('—');
                                    leadName = parts[0].replace(/^[^\w]+/, '').trim();
                                  }
                                  navigate(leadName ? `/opportunities?lead=${encodeURIComponent(leadName)}` : '/opportunities');
                                }}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-green-500/10 transition-colors ${event.completed ? 'opacity-50' : ''}`}
                              >
                                <input type="checkbox" checked={event.completed} onChange={(e) => { e.stopPropagation(); toggleComplete(event.id); }} className="w-3 h-3 rounded shrink-0 accent-green-500" />
                                <span className="text-xs">{icon}</span>
                                <span className={`text-xs flex-1 truncate ${event.completed ? 'line-through text-slate-600' : 'text-white font-medium'}`}>{displayName}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </details>

                    {/* Posts Tile — navigate to Create tab */}
                    <div className="rounded-xl border border-blue-500/40 bg-slate-800 overflow-hidden backdrop-blur-sm cursor-pointer hover:bg-blue-500/5 transition-colors" onClick={() => navigate('/create')}>
                      <div className="flex flex-col items-center justify-center p-3">
                        <span className="text-xl">📤</span>
                        <span className="text-xs font-bold text-blue-400 mt-0.5">Posts</span>
                        <span className="text-lg font-bold text-blue-400">{posts.length}</span>
                        <span className="text-[9px] text-blue-300 mt-0.5">Tap to create →</span>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
            {/* Scheduled posts */}
            {todayPosts.map((post) => (
              <div key={post.id} className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                <span className="text-sm">📤</span>
                <span className="text-sm text-slate-300 truncate flex-1">{(post.content || 'Scheduled post').slice(0, 50)}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${post.status === 'published' ? 'bg-green-900/40 text-green-400' : 'bg-blue-900/40 text-blue-400'}`}>{post.status}</span>
              </div>
            ))}
            {/* Sales follow-ups */}
            {followUpDeals.map((deal) => (
              <div key={deal.id} className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/10 cursor-pointer hover:bg-amber-500/10" onClick={() => navigate('/sales')}>
                <span className="text-sm">💰</span>
                <span className="text-sm text-amber-300 truncate flex-1">{deal.name}</span>
                <span className="text-xs text-slate-500">{Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24))}d</span>
              </div>
            ))}
          </>
        ) : (
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-300">Post a {selectedTrade.postTypes?.[0] || 'post'} on social media</span>
            </label>
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-300">Check for new keyword matches</span>
            </label>
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-300">Follow up on recent leads</span>
            </label>
            <p className="text-xs text-slate-500 mt-2">Add items via the Calendar tab to see your cues here</p>
          </div>
        )}
        {todayEvents.length > 0 && todayEvents.every((e) => e.completed) && (
          <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-amber-500/20 to-green-500/20 border border-amber-500/30 text-center relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute animate-[hawkSwoop_3s_ease-in-out_infinite] text-4xl" style={{ top: '20%', left: '-60px' }}>🦅</div>
            </div>
            <div className="text-3xl mb-2">🎉</div>
            <p className="text-lg font-bold text-amber-300">Today's cues are done!</p>
            <p className="text-sm text-slate-300 mt-1">Let's watch them take flight 🦅</p>
            <p className="text-xs text-slate-500 mt-2">Your posts are out in the world working for you. Time to soar.</p>
          </div>
        )}
        </div>
      </details>
      <div className="glass-card cursor-pointer hover:-translate-y-0.5 transition-transform" onClick={() => navigate('/opportunities')}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white">Lead Cues</h3>
          <span className="text-xs text-blue-400">View all →</span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="text-center p-3 rounded-lg bg-slate-800 border border-blue-500/30">
            <div className="text-xl sm:text-2xl font-bold text-blue-400">{leadStats.new}</div>
            <div className="text-xs text-slate-400">New</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-slate-800 border border-yellow-500/30">
            <div className="text-xl sm:text-2xl font-bold text-yellow-400">{leadStats.followedUp}</div>
            <div className="text-xs text-slate-400">Followed Up</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-slate-800 border border-green-500/30">
            <div className="text-xl sm:text-2xl font-bold text-green-400">{leadStats.converted}</div>
            <div className="text-xs text-slate-400">Converted</div>
          </div>
        </div>
      </div>
      </div>

      {/* Right column */}
      <div className="min-w-0 space-y-4">

      {/* Full Month Calendar */}
      <div className="glass-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white text-sm">📅 Calendar</h3>
          <ViewModeToggle value={dashViewMode} onChange={setDashViewMode} />
        </div>
        {dashViewMode === 'month' && (() => {
          const now = new Date();
          const year = dashCalYear;
          const month = dashCalMonth;
          const today = now.getMonth() === month && now.getFullYear() === year ? now.getDate() : -1;
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const firstDayOfWeek = new Date(year, month, 1).getDay();
          const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
          const folioStart = localStorage.getItem('hawkeye_folio_start') || '';
          const folioEnd = localStorage.getItem('hawkeye_folio_end') || '';

          return (
            <div>
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => { if (month === 0) { setDashCalMonth(11); setDashCalYear(year - 1); } else { setDashCalMonth(month - 1); } }} className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-white/5">←</button>
                <p className="text-xs text-slate-400">{monthName}</p>
                <button onClick={() => { if (month === 11) { setDashCalMonth(0); setDashCalYear(year + 1); } else { setDashCalMonth(month + 1); } }} className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-white/5">→</button>
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {dayLabels.map((d, i) => (
                  <div key={i} className="text-center text-[9px] text-slate-500 font-medium py-0.5">{d}</div>
                ))}
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayEvents = events.filter((e) => e.date === dateStr);
                  const isToday = day === today;
                  const isFolioStart = dateStr === folioStart;
                  const isFolioEnd = dateStr === folioEnd;
                  const isInFolio = folioStart && folioEnd && dateStr >= folioStart && dateStr <= folioEnd;
                  const isFuture = new Date(year, month, day) >= new Date(year, month, today);
                  return (
                    <div
                      key={day}
                      onClick={() => { setDashCalDay(dateStr); setDashCalAdd(false); }}
                      className={`text-center py-3 sm:py-4 rounded-lg cursor-pointer relative group ${
                        isFolioStart ? 'bg-green-600/40 border border-green-500/60 font-bold'
                        : isFolioEnd ? 'bg-red-600/40 border border-red-500/60 font-bold'
                        : isToday ? 'bg-blue-600 text-white font-bold'
                        : isInFolio ? 'bg-amber-500/10 border border-amber-500/20'
                        : dayEvents.length > 0 ? 'bg-white/10 text-white'
                        : 'text-slate-500 hover:bg-white/5'
                      }`}
                    >
                      <span className={`text-sm font-medium ${isFolioStart ? 'text-green-300' : isFolioEnd ? 'text-red-300' : isToday ? 'text-white' : ''}`}>{day}</span>
                      {dayEvents.length > 0 && (
                        <div className="flex flex-col items-center gap-0.5 mt-0.5">
                          <div className="flex justify-center gap-0.5">
                            {dayEvents.some((e) => e.type === 'post') && <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>}
                            {dayEvents.some((e) => e.type === 'meeting') && <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>}
                            {dayEvents.some((e) => e.type === 'reminder' || e.type === 'task') && <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>}
                          </div>
                          {dayEvents.length > 1 && <span className="text-[8px] text-slate-400">{dayEvents.length}</span>}
                        </div>
                      )}
                      {isFuture && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDashCalDay(dateStr); setDashCalAdd(true); }}
                          className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-bold hover:bg-blue-500 transition-colors"
                        >
                          +
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Week View */}
        {dashViewMode === 'week' && (() => {
          const now = new Date();
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          return (
            <div className="space-y-1.5">
              {Array.from({ length: 7 }, (_, i) => {
                const d = new Date(startOfWeek);
                d.setDate(startOfWeek.getDate() + i);
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const dayEvents = events.filter((e) => e.date === dateStr);
                const isToday = d.toDateString() === now.toDateString();
                return (
                  <div
                    key={dateStr}
                    onClick={() => { setDashCalDay(dateStr); setDashCalAdd(false); }}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${isToday ? 'bg-blue-500/15 border border-blue-500/30' : 'bg-white/5 border border-transparent hover:bg-white/10'}`}
                  >
                    <div className="text-center w-10 shrink-0">
                      <p className={`text-[10px] uppercase ${isToday ? 'text-blue-400' : 'text-slate-500'}`}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                      <p className={`text-lg font-bold ${isToday ? 'text-white' : 'text-slate-300'}`}>{d.getDate()}</p>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      {dayEvents.length === 0 && <p className="text-xs text-slate-600 italic">No events</p>}
                      {dayEvents.slice(0, 3).map((evt) => {
                        const icon = evt.type === 'post' ? '📤' : evt.type === 'meeting' ? '🤝' : '🔔';
                        const cleanTitle = evt.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '').replace(/\s*\|.*$/, '');
                        return (
                          <div key={evt.id} className="flex items-center gap-1.5">
                            <span className="text-[10px]">{icon}</span>
                            <span className={`text-xs truncate ${evt.completed ? 'line-through text-slate-600' : 'text-slate-200'}`}>{cleanTitle}</span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && <p className="text-[10px] text-slate-500">+{dayEvents.length - 3} more</p>}
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">{dayEvents.length}</span>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Day View */}
        {dashViewMode === 'day' && (() => {
          const now = new Date();
          const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const dayEvents = events.filter((e) => e.date === todayDateStr);
          const timelineEvents: TimelineEvent[] = dayEvents.map((evt) => ({
            id: evt.id,
            title: evt.title,
            type: evt.type as TimelineEvent['type'],
            completed: evt.completed,
            link: evt.link,
          }));
          return (
            <div>
              <p className="text-xs text-slate-400 mb-2">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
              <HourlyTimeline
                events={timelineEvents}
                onToggleComplete={toggleComplete}
                onDelete={removeEvent}
                showActions={true}
              />
            </div>
          );
        })()}
      </div>

      {/* Dashboard Calendar Day Modal */}
      {dashCalDay && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-2xl p-5 shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white text-lg">
                {new Date(dashCalDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </h3>
              <button onClick={() => setDashCalDay(null)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>

            {!dashCalAdd ? (
              <>
                {/* Day Overview — matching CalendarPage format */}
                {(() => {
                  const dayEvts = events.filter((e) => e.date === dashCalDay);
                  const timedEvents: Record<number, typeof dayEvts> = {};
                  const untimedEvents: typeof dayEvts = [];
                  for (const evt of dayEvts) {
                    const timeMatch = evt.title.match(/^\[(\d{1,2}):(\d{2})\]/);
                    if (timeMatch) {
                      const hour = parseInt(timeMatch[1]);
                      if (!timedEvents[hour]) timedEvents[hour] = [];
                      timedEvents[hour].push(evt);
                    } else {
                      untimedEvents.push(evt);
                    }
                  }
                  const hours = Array.from({ length: 15 }, (_, i) => i + 6);

                  const allPosts = dayEvts.filter((e) => e.type === 'post');
                  const allMeetings = dayEvts.filter((e) => e.type === 'meeting' || e.type === 'task');
                  const allReminders = dayEvts.filter((e) => e.type === 'reminder');

                  return (
                    <div>
                      {/* Cues tiles */}
                      <div className="mb-4">
                        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Cues</p>
                        <div className="grid grid-cols-3 gap-2">
                          <details className="rounded-xl border border-blue-500/30 bg-blue-500/10 overflow-hidden">
                            <summary className="flex flex-col items-center justify-center p-3 cursor-pointer">
                              <span className="text-2xl">📤</span>
                              <span className="text-lg font-bold text-blue-400">{allPosts.length}</span>
                              <span className="text-[10px] text-slate-400">Posts</span>
                            </summary>
                            {allPosts.length > 0 && (
                              <div className="px-2 pb-2 space-y-1.5 border-t border-blue-500/20 pt-2 max-h-40 overflow-y-auto">
                                {allPosts.map((evt) => (
                                  <div key={evt.id} className="p-1.5 rounded-lg bg-blue-500/5 border border-blue-500/10">
                                    <span className={`text-xs block ${evt.completed ? 'line-through text-slate-600' : 'text-slate-200'}`}>{evt.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '')}</span>
                                    <div className="flex justify-between mt-2">
                                      <button onClick={() => { const timeMatch = evt.title.match(/^\[(\d{1,2}:\d{2})\]\s*/); let cleanTitle = evt.title; if (timeMatch) cleanTitle = cleanTitle.replace(timeMatch[0], ''); setEditingEvent(evt); setEditTitle(cleanTitle.trim()); setEditTime(timeMatch ? timeMatch[1] : ''); setEditLocation(''); setEditLink(evt.link || ''); setEditDate(evt.date); }} className="px-2.5 py-1.5 rounded bg-slate-700 text-slate-300 text-[10px] font-medium hover:bg-slate-600 min-w-[40px] text-center">✏️ Edit</button>
                                      <button onClick={() => removeEvent(evt.id)} className="px-2.5 py-1.5 rounded bg-red-500/10 text-red-400 text-[10px] font-medium hover:bg-red-500/20 min-w-[40px] text-center">🗑️</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </details>

                          <details className="rounded-xl border border-amber-500/30 bg-amber-500/10 overflow-hidden">
                            <summary className="flex flex-col items-center justify-center p-3 cursor-pointer">
                              <span className="text-2xl">🤝</span>
                              <span className="text-lg font-bold text-amber-400">{allMeetings.length}</span>
                              <span className="text-[10px] text-slate-400">Meetings</span>
                            </summary>
                            {allMeetings.length > 0 && (
                              <div className="px-2 pb-2 space-y-1.5 border-t border-amber-500/20 pt-2 max-h-40 overflow-y-auto">
                                {allMeetings.map((evt) => (
                                  <div key={evt.id} className="p-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                                    <span className={`text-xs block ${evt.completed ? 'line-through text-slate-600' : 'text-slate-200'}`}>{evt.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '').replace(/\s*\|.*$/, '')}</span>
                                    <div className="flex justify-between mt-2">
                                      {evt.link ? <a href={evt.link} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-medium hover:bg-blue-500/20 min-w-[40px] text-center">🔗 Link</a> : <span />}
                                      <button onClick={() => { const timeMatch = evt.title.match(/^\[(\d{1,2}:\d{2})\]\s*/); const locationMatch = evt.title.match(/\s*—\s*📍\s*(.+?)(?:\s*\||$)/); let cleanTitle = evt.title; if (timeMatch) cleanTitle = cleanTitle.replace(timeMatch[0], ''); if (locationMatch) cleanTitle = cleanTitle.replace(/\s*—\s*📍.*$/, ''); const notesMatch = cleanTitle.match(/\s*\|\s*(.+)$/); if (notesMatch) cleanTitle = cleanTitle.replace(notesMatch[0], ''); setEditingEvent(evt); setEditTitle(cleanTitle.trim()); setEditTime(timeMatch ? timeMatch[1] : ''); setEditLocation(locationMatch ? locationMatch[1].trim() : ''); setEditLink(evt.link || ''); setEditDate(evt.date); }} className="px-2.5 py-1.5 rounded bg-slate-700 text-slate-300 text-[10px] font-medium hover:bg-slate-600 min-w-[40px] text-center">✏️ Edit</button>
                                      <button onClick={() => removeEvent(evt.id)} className="px-2.5 py-1.5 rounded bg-red-500/10 text-red-400 text-[10px] font-medium hover:bg-red-500/20 min-w-[40px] text-center">🗑️</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </details>

                          <details className="rounded-xl border border-green-500/30 bg-green-500/10 overflow-hidden">
                            <summary className="flex flex-col items-center justify-center p-3 cursor-pointer">
                              <span className="text-2xl">🔔</span>
                              <span className="text-lg font-bold text-green-400">{allReminders.length}</span>
                              <span className="text-[10px] text-slate-400">Reminders</span>
                            </summary>
                            {allReminders.length > 0 && (
                              <div className="px-2 pb-2 space-y-1.5 border-t border-green-500/20 pt-2 max-h-40 overflow-y-auto">
                                {allReminders.map((evt) => (
                                  <div key={evt.id} className="p-1.5 rounded-lg bg-green-500/5 border border-green-500/10">
                                    <span className={`text-xs block ${evt.completed ? 'line-through text-slate-600' : 'text-slate-200'}`}>{evt.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '')}</span>
                                    <div className="flex justify-between mt-2">
                                      <button onClick={() => { const timeMatch = evt.title.match(/^\[(\d{1,2}:\d{2})\]\s*/); let cleanTitle = evt.title; if (timeMatch) cleanTitle = cleanTitle.replace(timeMatch[0], ''); setEditingEvent(evt); setEditTitle(cleanTitle.trim()); setEditTime(timeMatch ? timeMatch[1] : ''); setEditLocation(''); setEditLink(evt.link || ''); setEditDate(evt.date); }} className="px-2.5 py-1.5 rounded bg-slate-700 text-slate-300 text-[10px] font-medium hover:bg-slate-600 min-w-[40px] text-center">✏️ Edit</button>
                                      <button onClick={() => removeEvent(evt.id)} className="px-2.5 py-1.5 rounded bg-red-500/10 text-red-400 text-[10px] font-medium hover:bg-red-500/20 min-w-[40px] text-center">🗑️</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </details>
                        </div>
                      </div>

                      {/* Schedule — hourly time slots */}
                      <div>
                        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Schedule</p>
                        <div className="space-y-0 max-h-[300px] overflow-y-auto">
                          {hours.map((hour) => {
                            const evts = timedEvents[hour] || [];
                            const timeLabel = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
                            return (
                              <div key={hour} className={`flex gap-3 py-1.5 border-b border-white/5`}>
                                <span className={`text-[11px] w-14 shrink-0 pt-0.5 ${evts.length > 0 ? 'text-white font-medium' : 'text-slate-600'}`}>{timeLabel}</span>
                                <div className="flex-1">
                                  {evts.length > 0 ? evts.map((evt) => {
                                    const color = evt.type === 'post' ? 'border-blue-500/30 bg-blue-500/5' : (evt.type === 'meeting' || evt.type === 'task') ? 'border-amber-500/30 bg-amber-500/5' : 'border-green-500/30 bg-green-500/5';
                                    return (
                                      <div key={evt.id} className={`p-2 rounded-lg border ${color} mb-1`}>
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm shrink-0">{evt.type === 'post' ? '📤' : (evt.type === 'meeting' || evt.type === 'task') ? '🤝' : '🔔'}</span>
                                          <span className={`text-xs flex-1 ${evt.completed ? 'line-through text-slate-500' : 'text-white'}`}>{evt.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '')}</span>
                                        </div>
                                      </div>
                                    );
                                  }) : (
                                    <div className="h-4"></div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {dayEvts.length === 0 && <p className="text-xs text-slate-500 text-center pt-2">No cues — click + to add</p>}
                    </div>
                  );
                })()}
                <button onClick={() => setDashCalAdd(true)} className="w-full mt-3 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg transition-all active:scale-95">
                  + Add to this day
                </button>
              </>
            ) : (
              <>
                {/* Add event form */}
                <button onClick={() => setDashCalAdd(false)} className="text-xs text-blue-400 hover:text-blue-300 mb-2">← Back</button>
                <div className="space-y-3">
                  {/* Type selector — first thing after back button */}
                  <div className="flex gap-2">
                    {(['meeting', 'reminder', 'post'] as const).map((t) => (
                      <button key={t} onClick={() => setDashCalType(t)} className={`flex-1 py-2 rounded-lg text-xs font-bold ${dashCalType === t ? (t === 'post' ? 'bg-blue-600 text-white' : t === 'meeting' ? 'bg-amber-500 text-black' : 'bg-green-600 text-white') : 'bg-slate-700 text-slate-400 hover:text-white'}`}>
                        {t === 'post' ? '📤 Post' : t === 'meeting' ? '🤝 Meeting' : '🔔 Reminder'}
                      </button>
                    ))}
                  </div>
                  <input type="text" value={dashCalTitle} onChange={(e) => setDashCalTitle(e.target.value)} placeholder="What's happening?" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" autoFocus />
                  {/* Quick Time Picker */}
                  <div>
                    <p className="text-[10px] text-slate-400 mb-1.5">Time</p>
                    <div className="grid grid-cols-4 gap-1.5 mb-2">
                      {['8:00', '9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'].map((t) => {
                        const h = parseInt(t.split(':')[0]);
                        const label = h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`;
                        const isSelected = dashCalTime === t;
                        return (
                          <button key={t} onClick={() => setDashCalTime(isSelected ? '' : t)} className={`py-1.5 rounded-lg text-xs font-medium transition-all ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600'}`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">Custom:</span>
                      <input type="time" value={dashCalTime} onChange={(e) => setDashCalTime(e.target.value)} className="flex-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs" />
                      {dashCalTime && <button onClick={() => setDashCalTime('')} className="text-[10px] text-red-400">Clear</button>}
                    </div>
                  </div>
                  <input type="url" value={dashCalLink} onChange={(e) => setDashCalLink(e.target.value)} placeholder="Link (optional)" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
                  {dashCalType === 'meeting' && (
                    <input type="email" value={dashCalInviteEmail} onChange={(e) => setDashCalInviteEmail(e.target.value)} placeholder="Invite email (sends meeting invite)" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500" />
                  )}
                  <button
                    onClick={async () => {
                      if (!dashCalTitle.trim()) return;
                      let title = dashCalTitle.trim();
                      if (dashCalTime) title = `[${dashCalTime}] ${title}`;
                      const eventId = await addEvent({ date: dashCalDay!, title, type: dashCalType, link: dashCalLink.trim() || undefined });

                      // Send meeting invite if email provided
                      if (dashCalType === 'meeting' && dashCalInviteEmail.trim()) {
                        try {
                          const token = await getToken();
                          const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
                          await client.request('POST', '/calendar/invite', {
                            eventId: eventId || undefined,
                            email: dashCalInviteEmail.trim(),
                            meetingTitle: dashCalTitle.trim(),
                            meetingDate: dashCalDay,
                            meetingTime: dashCalTime || undefined,
                            zoomLink: dashCalLink.trim() || undefined,
                          });
                          showToast('✉️ Meeting invite sent!');
                        } catch {
                          showToast('⚠️ Event added but invite failed to send');
                        }
                      }

                      setDashCalTitle(''); setDashCalTime(''); setDashCalLink(''); setDashCalInviteEmail('');
                      setDashCalAdd(false);
                    }}
                    disabled={!dashCalTitle.trim()}
                    className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-lg disabled:opacity-50 transition-all active:scale-95"
                  >
                    ✓ Add
                  </button>
                </div>
              </>
            )}
            <button onClick={() => setDashCalDay(null)} className="w-full mt-3 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 text-sm">Close</button>

            {/* Day Notes */}
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="text-xs text-slate-400 font-semibold mb-1.5">📝 My Notes</p>
              <textarea
                defaultValue={localStorage.getItem(`hawkeye_notepad_${user?.sub}_${dashCalDay}`) || ''}
                onBlur={(e) => {
                  const val = e.target.value;
                  localStorage.setItem(`hawkeye_notepad_${user?.sub}_${dashCalDay}`, val);
                  getToken().then((token) => {
                    if (!token) return;
                    const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
                    client.request('PUT', '/profile/preferences', { [`notepad_${dashCalDay}`]: val }).catch(() => {});
                  });
                }}
                placeholder="Notes for this day..."
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 resize-none h-20 focus:border-blue-500/50 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="glass-card">
        <h3 className="font-semibold text-white text-sm mb-2">📝 Today's Notes</h3>
        <textarea
          defaultValue={localStorage.getItem(`hawkeye_notepad_${user?.sub}_${todayStr}`) || ''}
          onBlur={(e) => {
            const val = e.target.value;
            localStorage.setItem(`hawkeye_notepad_${user?.sub}_${todayStr}`, val);
            getToken().then((token) => {
              if (!token) return;
              const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
              client.request('PUT', '/profile/preferences', { [`notepad_${todayStr}`]: val, notepadDate: todayStr }).catch(() => {});
            });
          }}
          placeholder="What's on your mind today?"
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 resize-none h-24 focus:border-blue-500/50 focus:outline-none"
        />
        <p className="text-[10px] text-slate-600 mt-1">Auto-saves when you tap away. Each day starts fresh.</p>
      </div>

      {/* Engagement Summary */}
      {engagement && (engagement.totalLikes > 0 || engagement.totalComments > 0) && (
        <div className="glass-card">
          <h3 className="font-semibold text-white mb-3">📊 Post Engagement</h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-3 rounded-lg bg-slate-800 border border-pink-500/30">
              <div className="text-xl font-bold text-pink-400">{engagement.totalLikes}</div>
              <div className="text-xs text-slate-400">Likes</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-800 border border-blue-500/30">
              <div className="text-xl font-bold text-blue-400">{engagement.totalComments}</div>
              <div className="text-xs text-slate-400">Comments</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-800 border border-green-500/30">
              <div className="text-xl font-bold text-green-400">{engagement.totalShares}</div>
              <div className="text-xs text-slate-400">Shares</div>
            </div>
          </div>
          {engagement.postStats && engagement.postStats.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs text-slate-500">Recent posts:</p>
              {engagement.postStats.slice(0, 3).map((post: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/5 text-xs">
                  <span className="text-slate-300 truncate flex-1">{post.content || 'Post'}</span>
                  <span className="text-slate-500 shrink-0 ml-2">❤️{post.likes} 💬{post.comments}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upgrade Promo for Nest (Free) Users */}
      {['free', 'nest'].includes(currentTier) && (
        <div className="glass-card border border-amber-500/20">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">🚀 Unlock More Power</h3>
          <p className="text-sm text-slate-400 mb-4">You're on the Nest (Free) plan. Upgrade to get tools that grow your business faster.</p>
          
          <div className="space-y-3">
            {/* Soar Tier Features */}
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-amber-400">🚀 Soar — $24.99/mo</span>
                <button onClick={() => navigate('/settings')} className="text-xs bg-amber-500 hover:bg-amber-400 text-black px-3 py-1 rounded-lg font-bold transition-colors">Upgrade</button>
              </div>
              <ul className="text-xs text-slate-300 space-y-1.5">
                <li className="flex items-start gap-2"><span className="text-amber-400">•</span>Keyword tracking — get alerted when someone posts about your services</li>
                <li className="flex items-start gap-2"><span className="text-amber-400">•</span>Browser extension — detects leads while you scroll social media</li>
                <li className="flex items-start gap-2"><span className="text-amber-400">•</span>Lead detection & Appreciations — find customers automatically</li>
                <li className="flex items-start gap-2"><span className="text-amber-400">•</span>Sales Tracker — full pipeline from prospect to closed deal</li>
                <li className="flex items-start gap-2"><span className="text-amber-400">•</span>Hawk Insights — see where leads come from, peak times, top platforms</li>
                <li className="flex items-start gap-2"><span className="text-amber-400">•</span>Flocks — one-tap copy & open workflow to post across all your groups</li>
                <li className="flex items-start gap-2"><span className="text-amber-400">•</span>Wingman, linked accounts, folio recaps & more</li>
              </ul>
            </div>

            {/* Summit Tier Features */}
            <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/15">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-purple-400">🏔️ Summit — $99.99/mo (7-day free trial)</span>
                <button onClick={() => navigate('/settings')} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded-lg font-medium transition-colors">Upgrade</button>
              </div>
              <ul className="text-xs text-slate-300 space-y-1.5">
                <li className="flex items-start gap-2"><span className="text-purple-400">•</span>Everything in Soar, plus team management</li>
                <li className="flex items-start gap-2"><span className="text-purple-400">•</span>Up to 5 team members with shared leads and calendar</li>
                <li className="flex items-start gap-2"><span className="text-purple-400">•</span>Team leaderboard and performance stats</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Future Cues */}
      {futurePosts.length > 0 && (
        <details className="glass-card">
          <summary className="font-semibold text-white cursor-pointer flex items-center justify-between">
            <span>Upcoming Cues</span>
            <span className="text-xs text-slate-400">{futurePosts.length} scheduled</span>
          </summary>
          <div className="mt-3 space-y-2">
            {futurePosts.map((post) => (
              <div key={post.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{(post.content || 'Scheduled post').slice(0, 50)}</p>
                  <p className="text-xs text-slate-500">
                    {post.platforms?.join(', ')} • {post.scheduledAt ? new Date(post.scheduledAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''} at {post.scheduledAt ? new Date(post.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const token = await getToken();
                      const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
                      await client.deletePost(post.id);
                      setFuturePosts((prev) => prev.filter((p) => p.id !== post.id));
                    } catch { /* ignore */ }
                  }}
                  className="text-xs text-red-400 hover:text-red-300 shrink-0 ml-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Edit Meeting Modal */}
      {editingEvent && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-sm bg-slate-900 border border-amber-500/30 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-lg">✏️ Edit Meeting</h3>
              <button onClick={() => setEditingEvent(null)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">📅 Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">⏰ Time</label>
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                />
                {editTime && (
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const hour = parseInt(editTime.split(':')[0]);
                        if (hour >= 12) {
                          const newHour = hour === 12 ? 0 : hour - 12;
                          setEditTime(`${String(newHour).padStart(2, '0')}:${editTime.split(':')[1]}`);
                        }
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${parseInt(editTime.split(':')[0]) < 12 ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30 scale-105' : 'bg-slate-700 text-slate-500 hover:bg-slate-600'}`}
                    >
                      ☀️ AM
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const hour = parseInt(editTime.split(':')[0]);
                        if (hour < 12) {
                          const newHour = hour === 0 ? 12 : hour + 12;
                          setEditTime(`${String(newHour).padStart(2, '0')}:${editTime.split(':')[1]}`);
                        }
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${parseInt(editTime.split(':')[0]) >= 12 ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-105' : 'bg-slate-700 text-slate-500 hover:bg-slate-600'}`}
                    >
                      🌙 PM
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">📍 Location</label>
                <input
                  type="text"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="e.g. 123 Main St, Denver CO"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">🔗 Zoom / Video Link</label>
                <input
                  type="url"
                  value={editLink}
                  onChange={(e) => setEditLink(e.target.value)}
                  placeholder="https://zoom.us/j/..."
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={async () => {
                    // Rebuild title with time and location
                    let newTitle = editTitle.trim();
                    if (editTime) newTitle = `[${editTime}] ${newTitle}`;
                    if (editLocation.trim()) newTitle += ` — 📍 ${editLocation.trim()}`;
                    const link = editLink.trim() || (editLocation.trim() ? `https://maps.google.com/maps?q=${encodeURIComponent(editLocation.trim())}` : '');
                    await updateEvent(editingEvent.id, { title: newTitle, date: editDate, link: link || undefined });
                    setEditingEvent(null);
                  }}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-sm transition-all active:scale-95"
                >
                  ✓ Save Changes
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete this meeting?')) {
                      removeEvent(editingEvent.id);
                      setEditingEvent(null);
                    }
                  }}
                  className="px-4 py-2.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 font-bold rounded-lg text-sm transition-all active:scale-95 border border-red-500/30"
                >
                  🗑️
                </button>
              </div>
              <button
                onClick={() => setEditingEvent(null)}
                className="w-full py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 text-sm"
              >
                Cancel
              </button>

              {/* Reschedule Series */}
              {editingEvent.type === 'post' && (
                <details className="mt-3 border-t border-white/10 pt-3">
                  <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300 font-medium">🔄 Reschedule entire series</summary>
                  <div className="mt-2 space-y-2">
                    <p className="text-[10px] text-slate-500">This removes all future instances of this flock and re-creates them on a new schedule.</p>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">New start date</label>
                      <input type="date" value={rescheduleStartDate} onChange={(e) => setRescheduleStartDate(e.target.value)} className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">New repeat</label>
                      <select value={rescheduleRepeat} onChange={(e) => setRescheduleRepeat(e.target.value as any)} className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs">
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Bi-weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <button
                      onClick={async () => {
                        if (!rescheduleStartDate) return;
                        // Get the clean title (without time/location) to match all instances
                        const timeMatch = editingEvent.title.match(/^\[(\d{1,2}:\d{2})\]\s*/);
                        let matchTitle = editingEvent.title;
                        if (timeMatch) matchTitle = matchTitle.replace(timeMatch[0], '');
                        // Remove location and notes from match
                        matchTitle = matchTitle.replace(/\s*—\s*📍.*$/, '').replace(/\s*\|.*$/, '').trim();

                        // Delete all future events with this title
                        await removeAllByTitle(matchTitle);

                        // Re-create on new schedule
                        const baseDate = new Date(rescheduleStartDate + 'T12:00:00');
                        const incrementDays = rescheduleRepeat === 'daily' ? 1 : rescheduleRepeat === 'weekly' ? 7 : rescheduleRepeat === 'biweekly' ? 14 : 0;
                        const count = rescheduleRepeat === 'daily' ? 365 : rescheduleRepeat === 'weekly' ? 260 : rescheduleRepeat === 'biweekly' ? 130 : 120;

                        for (let i = 0; i < count; i++) {
                          const d = new Date(baseDate);
                          if (incrementDays > 0) {
                            d.setDate(d.getDate() + (i * incrementDays));
                          } else {
                            d.setMonth(d.getMonth() + i);
                          }
                          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                          let title = editTitle.trim();
                          if (editTime) title = `[${editTime}] ${title}`;
                          await addEvent({ date: dateStr, title, type: 'post', link: editLink.trim() || undefined });
                        }

                        setEditingEvent(null);
                        showToast('🔄 Series rescheduled');
                        refreshEvents();
                      }}
                      disabled={!rescheduleStartDate}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-all active:scale-95"
                    >
                      🔄 Reschedule Series
                    </button>
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
