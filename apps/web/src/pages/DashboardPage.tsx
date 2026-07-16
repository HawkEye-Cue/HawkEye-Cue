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
  const [refreshKey, setRefreshKey] = useState(0);

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
        </div>
      </details>

      {/* Lead Cues */}
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
