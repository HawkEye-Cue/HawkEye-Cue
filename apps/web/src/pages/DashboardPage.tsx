import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrade } from '../contexts/TradeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCalendar } from '../contexts/CalendarContext';
import { TRADES, ApiClient } from '@social-lead-gen/shared';
import type { ScheduledPost } from '@social-lead-gen/shared';
import TradeSelector from '../components/TradeSelector';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { selectedTrade, selectedTrades } = useTrade();
  const { getToken } = useAuth();
  const { events, toggleComplete } = useCalendar();
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
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(() => !localStorage.getItem('hawkeye_welcome_dismissed'));

  // Refetch when page becomes visible (user navigates back)
  useEffect(() => {
    const handleFocus = () => setRefreshKey((k) => k + 1);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Redirect new users to onboarding
  useEffect(() => {
    if (!localStorage.getItem('hawkeye_onboarded')) {
      navigate('/onboarding', { replace: true });
    }
  }, [navigate]);

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

        // Auto-delete published posts from previous days in the background (max 10 per load to avoid overload)
        const allResult = await client.getPosts();
        const allPosts = Array.isArray(allResult) ? allResult : (allResult as any)?.posts || [];

        // Separate future scheduled posts
        const now2 = new Date();
        const todayLocal = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}-${String(now2.getDate()).padStart(2, '0')}`;
        const upcoming = allPosts
          .filter((p: ScheduledPost) => p.status === 'scheduled' && p.scheduledAt && p.scheduledAt.split('T')[0] > todayLocal)
          .sort((a: ScheduledPost, b: ScheduledPost) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''));
        setFuturePosts(upcoming);

        let deleteCount = 0;
        for (const post of allPosts) {
          if (deleteCount >= 10) break;
          if (post.status === 'published' && post.scheduledAt) {
            const scheduledDate = post.scheduledAt.split('T')[0];
            if (scheduledDate < today) {
              try { await client.deletePost(post.id); deleteCount++; } catch { /* ignore */ }
            }
          }
        }
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
    task: 'text-amber-400',
    reminder: 'text-green-400',
  };
  const typeIcons: Record<string, string> = {
    post: '📤',
    task: '✅',
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
    <div className="space-y-6">
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
              onClick={() => { setShowWelcomeBanner(false); localStorage.setItem('hawkeye_welcome_dismissed', 'true'); }}
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

      {/* Daily Cues */}
      <details className="glass-card" open>
        <summary className="font-semibold text-white cursor-pointer">Today's Cues</summary>
        <div className="mt-3 space-y-2">
        {(todayEvents.length > 0 || todayPosts.length > 0 || followUpDeals.length > 0) ? (
          <>
            {(() => {
              const clientEvents: Record<string, typeof todayEvents> = {};
              const generalEvents: typeof todayEvents = [];
              for (const event of todayEvents) {
                const match = event.title.match(/^.{1,4}\s+(.+?)\s+—\s+/);
                if (match) {
                  const name = match[1];
                  if (!clientEvents[name]) clientEvents[name] = [];
                  clientEvents[name].push(event);
                } else {
                  generalEvents.push(event);
                }
              }
              return (
                <>
                  {/* Per-client dropdowns */}
                  {Object.entries(clientEvents).map(([name, evts]) => {
                    const done = evts.filter((e) => e.completed).length;
                    return (
                      <details key={name} className={`rounded-lg border ${done === evts.length ? 'border-green-500/20 bg-green-500/5' : 'border-orange-500/15 bg-orange-500/5'}`}>
                        <summary className="flex items-center justify-between px-3 py-2 cursor-pointer">
                          <span className={`text-sm font-medium ${done === evts.length ? 'text-green-400' : 'text-white'}`}>{done === evts.length ? '✅' : '⚡'} {name}</span>
                          <span className="text-xs text-slate-500">{done}/{evts.length}</span>
                        </summary>
                        <div className="px-3 pb-2 space-y-1">
                          {evts.map((ev) => (
                            <label key={ev.id} className="flex items-start gap-2 py-1 cursor-pointer">
                              <input type="checkbox" checked={ev.completed} onChange={() => toggleComplete(ev.id)} className="w-3.5 h-3.5 rounded mt-0.5 shrink-0" />
                              <span className={`text-xs ${ev.completed ? 'line-through text-slate-600' : 'text-slate-300'}`}>{ev.title.replace(/^.{1,4}\s+.+?\s+—\s+/, '')}</span>
                            </label>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                  {/* General tasks */}
                  {generalEvents.map((event) => (
                    <label key={event.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer">
                      <input type="checkbox" checked={event.completed} onChange={() => toggleComplete(event.id)} className="w-4 h-4 rounded" />
                      <span className={`text-sm flex-1 ${event.completed ? 'line-through text-slate-600' : 'text-slate-300'}`}>{event.title}</span>
                    </label>
                  ))}
                </>
              );
            })()}
            {/* Scheduled posts */}
            {todayPosts.map((post) => (
              <div key={post.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
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
              <span className="text-sm text-slate-300">Post a {selectedTrade.postTypes[0]} on social media</span>
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
          <div className="text-center p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
            <div className="text-xl sm:text-2xl font-bold text-blue-400">{leadStats.new}</div>
            <div className="text-xs text-slate-400">New</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
            <div className="text-xl sm:text-2xl font-bold text-yellow-400">{leadStats.followedUp}</div>
            <div className="text-xs text-slate-400">Followed Up</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-green-500/5 border border-green-500/10">
            <div className="text-xl sm:text-2xl font-bold text-green-400">{leadStats.converted}</div>
            <div className="text-xs text-slate-400">Converted</div>
          </div>
        </div>
      </div>

      {/* Engagement Summary */}
      {engagement && (engagement.totalLikes > 0 || engagement.totalComments > 0) && (
        <div className="glass-card">
          <h3 className="font-semibold text-white mb-3">📊 Post Engagement</h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-3 rounded-lg bg-pink-500/5 border border-pink-500/10">
              <div className="text-xl font-bold text-pink-400">{engagement.totalLikes}</div>
              <div className="text-xs text-slate-400">Likes</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
              <div className="text-xl font-bold text-blue-400">{engagement.totalComments}</div>
              <div className="text-xs text-slate-400">Comments</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-green-500/5 border border-green-500/10">
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
                <li className="flex items-start gap-2"><span className="text-amber-400">•</span>Copy & Open workflow — one-tap posting to all your groups</li>
                <li className="flex items-start gap-2"><span className="text-amber-400">•</span>Wingman, linked accounts, folio recaps & more</li>
              </ul>
            </div>

            {/* Summit Tier Features */}
            <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/15">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-purple-400">🏔️ Summit — $99.99/mo</span>
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

      {/* Your Scheduled Cues */}
      <details className="glass-card" open>
        <summary className="font-semibold text-white cursor-pointer flex items-center justify-between">
          <span>Your Scheduled Cues</span>
          <span className="text-xs text-slate-400">{todayPosts.length + todayEvents.length} items</span>
        </summary>
        <div className="mt-3 space-y-2">
          {(todayPosts.length > 0 || todayEvents.length > 0) ? (
            <>
              {/* Calendar events */}
              {todayEvents.map((event) => (
                <div key={event.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
                  <input type="checkbox" checked={event.completed} onChange={() => toggleComplete(event.id)} className="w-4 h-4 rounded shrink-0" />
                  <span className={`text-sm flex-1 ${event.completed ? 'line-through text-slate-600' : 'text-slate-300'}`}>{event.title}</span>
                  {event.link && (
                    <a href={event.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-400 hover:text-blue-300 shrink-0" title={event.link}>🔗</a>
                  )}
                  <span className={`text-xs ${typeColors[event.type]}`}>{typeIcons[event.type]}</span>
                </div>
              ))}
              {/* Scheduled posts */}
              {todayPosts.map((post) => (
              <details key={post.id} className="rounded-lg bg-white/5 overflow-hidden">
                <summary className="flex items-center justify-between p-2 cursor-pointer hover:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{(post.content || 'Scheduled post').slice(0, 50)}</p>
                    <p className="text-xs text-slate-500">{post.platforms?.join(', ')} • {post.scheduledAt ? new Date(post.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${post.status === 'published' ? 'bg-green-900/40 text-green-400' : 'bg-blue-900/40 text-blue-400'}`}>
                      {post.status}
                    </span>
                  </div>
                </summary>
                <div className="p-3 border-t border-white/5 space-y-2">
                  <textarea
                    defaultValue={post.content || ''}
                    onBlur={async (e) => {
                      const newContent = e.target.value.trim();
                      if (newContent && newContent !== post.content) {
                        try {
                          const token = await getToken();
                          const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
                          await client.updatePost(post.id, { content: newContent });
                          setTodayPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, content: newContent } : p));
                        } catch { /* ignore */ }
                      }
                    }}
                    rows={Math.max(6, (post.content || '').length / 40)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm resize-y focus:border-blue-500 focus:outline-none"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500">{post.platforms?.join(', ')} • {post.scheduledAt ? new Date(post.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</p>
                    <button
                      onClick={async () => {
                        try {
                          const token = await getToken();
                          const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
                          await client.deletePost(post.id);
                          setTodayPosts((prev) => prev.filter((p) => p.id !== post.id));
                        } catch { /* ignore */ }
                      }}
                      className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </details>
            ))}
            </>
          ) : (
            <p className="text-sm text-slate-400">No cues scheduled for today</p>
          )}
        </div>
      </details>

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
    </div>
  );
}
