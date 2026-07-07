import { useState, useEffect } from 'react';
import { useTrade } from '../contexts/TradeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCalendar } from '../contexts/CalendarContext';
import { TRADES, ApiClient } from '@social-lead-gen/shared';
import type { ScheduledPost } from '@social-lead-gen/shared';
import TradeSelector from '../components/TradeSelector';

export default function DashboardPage() {
  const { selectedTrade } = useTrade();
  const { getToken } = useAuth();
  const { events, toggleComplete } = useCalendar();
  const [todayPosts, setTodayPosts] = useState<ScheduledPost[]>([]);

  useEffect(() => {
    async function fetchTodayPosts() {
      try {
        const token = await getToken();
        const client = new ApiClient({
          baseUrl: import.meta.env.VITE_API_URL as string,
          getToken: async () => token,
        });
        const today = new Date().toISOString().split('T')[0];
        const result = await client.getPosts({ startDate: today, endDate: today });
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const todayStr = new Date().toISOString().split('T')[0];
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
        <span className="text-sm bg-blue-500/15 text-blue-300 px-3 py-1 rounded-full border border-blue-500/20">
          {selectedTrade.name}
        </span>
      </div>

      {/* Daily Cues */}
      <details className="glass-card" open>
        <summary className="font-semibold text-white cursor-pointer">Today's Cues</summary>
        <div className="mt-3 max-h-48 overflow-y-auto">
        {todayEvents.length > 0 ? (
          <div className="space-y-2">
            {todayEvents.map((event) => (
              <label key={event.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={event.completed}
                  onChange={() => toggleComplete(event.id)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">{typeIcons[event.type]}</span>
                <span className={`text-sm ${event.completed ? 'line-through text-slate-500' : 'text-slate-300'}`}>
                  {event.title}
                </span>
                {event.completed && <span className="text-green-400 text-xs font-medium ml-1">✓ Done</span>}
                <span className={`text-xs capitalize ml-auto ${typeColors[event.type]}`}>{event.type}</span>
              </label>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
              <input type="checkbox" className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-300">Post a {selectedTrade.postTypes[0]} on social media</span>
            </label>
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
              <input type="checkbox" className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-300">Check for new keyword matches</span>
            </label>
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
              <input type="checkbox" className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-300">Follow up on recent leads</span>
            </label>
            <p className="text-xs text-slate-500 mt-2">Add items via the Calendar tab to see your cues here</p>
          </div>
        )}
        </div>
      </details>

      {/* Lead Cues */}
      <details className="glass-card" open>
        <summary className="font-semibold text-white cursor-pointer">Lead Cues</summary>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-4">
          <div className="text-center p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
            <input
              type="number"
              defaultValue={0}
              min={0}
              className="w-full text-xl sm:text-2xl font-bold text-blue-400 bg-transparent text-center focus:outline-none focus:ring-1 focus:ring-blue-500/50 rounded"
            />
            <div className="text-xs text-slate-400">New Leads</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
            <input
              type="number"
              defaultValue={0}
              min={0}
              className="w-full text-xl sm:text-2xl font-bold text-yellow-400 bg-transparent text-center focus:outline-none focus:ring-1 focus:ring-yellow-500/50 rounded"
            />
            <div className="text-xs text-slate-400">Followed Up</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-green-500/5 border border-green-500/10">
            <input
              type="number"
              defaultValue={0}
              min={0}
              className="w-full text-xl sm:text-2xl font-bold text-green-400 bg-transparent text-center focus:outline-none focus:ring-1 focus:ring-green-500/50 rounded"
            />
            <div className="text-xs text-slate-400">Converted</div>
          </div>
        </div>
      </details>

      {/* Your Scheduled Cues */}
      <details className="glass-card" open>
        <summary className="font-semibold text-white cursor-pointer flex items-center justify-between">
          <span>Your Scheduled Cues</span>
          <span className="text-xs text-slate-400">{todayPosts.length} items</span>
        </summary>
        <div className="mt-3 space-y-2">
          {todayPosts.length > 0 ? (
            todayPosts.map((post) => (
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
            ))
          ) : (
            <p className="text-sm text-slate-400">No cues scheduled for today</p>
          )}
        </div>
      </details>
    </div>
  );
}
