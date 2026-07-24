import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCalendar } from '../contexts/CalendarContext';
import { ApiClient } from '@social-lead-gen/shared';
import { useTeamData, MEMBER_COLORS } from '../hooks/useTeamData';

interface Deal {
  id: string;
  name: string;
  value: number;
  stage: string;
  leadSource: string;
  leadSourceNote: string;
  createdAt: string;
}

interface Opportunity {
  id: string;
  sourcePlatform: string;
  status: string;
  createdAt: string;
}

export default function HawkInsightsPage() {
  const { getToken, user } = useAuth();
  const { events } = useCalendar();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [leads, setLeads] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState('free');
  const { isInTeam, teamAnalytics, fetchAnalytics, getMemberColorIndex } = useTeamData();

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  // Check tier
  useEffect(() => {
    buildClient().then((client) => client.request<{ tier: string }>('GET', '/subscription')).then((res) => setTier(res.tier || 'free')).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasAccess = ['soar', 'team', 'summit'].includes(tier);

  useEffect(() => {
    async function fetchData() {
      try {
        const client = await buildClient();
        const [dealsRes, leadsRes] = await Promise.all([
          client.request<{ deals: Deal[] }>('GET', '/sales/deals'),
          client.request<{ opportunities: Opportunity[] }>('GET', '/opportunities'),
        ]);
        setDeals(dealsRes.deals || []);
        setLeads((leadsRes as any).opportunities || (leadsRes as any).items || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch team analytics when user is in a team
  useEffect(() => {
    if (isInTeam) fetchAnalytics();
  }, [isInTeam, fetchAnalytics]);

  if (loading) return <p className="text-sm text-slate-500">Loading insights...</p>;

  // --- Lead Source Analytics ---
  const sourceMap: Record<string, { count: number; won: number; value: number }> = {};
  for (const deal of deals) {
    const src = deal.leadSource || 'unknown';
    if (!sourceMap[src]) sourceMap[src] = { count: 0, won: 0, value: 0 };
    sourceMap[src].count++;
    if (deal.stage === 'won') {
      sourceMap[src].won++;
      sourceMap[src].value += deal.value || 0;
    }
  }
  const topSources = Object.entries(sourceMap)
    .map(([source, data]) => ({ source, ...data }))
    .sort((a, b) => b.value - a.value);

  // --- Platform Engagement ---
  const platformMap: Record<string, number> = {};
  for (const lead of leads) {
    const platform = lead.sourcePlatform || 'unknown';
    platformMap[platform] = (platformMap[platform] || 0) + 1;
  }
  const topPlatforms = Object.entries(platformMap)
    .map(([platform, count]) => ({ platform, count }))
    .sort((a, b) => b.count - a.count);
  const totalLeads = leads.length || 1;

  // --- Time of Day Analysis ---
  const hourMap: Record<number, number> = {};
  for (const lead of leads) {
    if (lead.createdAt) {
      const hour = new Date(lead.createdAt).getHours();
      hourMap[hour] = (hourMap[hour] || 0) + 1;
    }
  }
  const peakHours = Object.entries(hourMap)
    .map(([hour, count]) => ({ hour: parseInt(hour), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const maxHourCount = peakHours[0]?.count || 1;

  // --- Internet Lead Vendor Performance ---
  const vendorMap: Record<string, { count: number; won: number; value: number }> = {};
  for (const deal of deals) {
    if (deal.leadSource === 'internet-lead' && deal.leadSourceNote) {
      const vendor = deal.leadSourceNote;
      if (!vendorMap[vendor]) vendorMap[vendor] = { count: 0, won: 0, value: 0 };
      vendorMap[vendor].count++;
      if (deal.stage === 'won') {
        vendorMap[vendor].won++;
        vendorMap[vendor].value += deal.value || 0;
      }
    }
  }
  const topVendors = Object.entries(vendorMap)
    .map(([vendor, data]) => ({ vendor, ...data }))
    .sort((a, b) => b.value - a.value);

  const platformIcons: Record<string, string> = { facebook: '📘', instagram: '📷', linkedin: '💼', tiktok: '🎵', nextdoor: '🏡' };
  const sourceLabels: Record<string, string> = {
    'internet-lead': '🌐 Internet Lead', 'facebook-post': '📱 Facebook Post', 'instagram-post': '📸 Instagram',
    'cold-call': '📞 Cold Call', 'warm-call': '🤙 Warm Call', 'referral': '🤝 Referral',
    'walk-in': '🚶 Walk-In', 'website': '🌐 Website', 'door-knock': '🚪 Door Knock',
    'google-ad': '🔍 Google Ad', 'facebook-ad': '📣 Facebook Ad', 'hawkeye-lead': '🦅 HawkEye Lead',
    'repeat-client': '🔄 Repeat Client', 'unknown': '❓ Unknown',
  };

  function formatHour(hour: number) {
    if (hour === 0) return '12am';
    if (hour === 12) return '12pm';
    return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
  }

  if (!hasAccess && !loading) {
    return (
      <div className="space-y-6 text-center py-12">
        <div className="text-5xl">📊</div>
        <h2 className="text-2xl font-bold text-white">Hawk Insights</h2>
        <p className="text-slate-400 max-w-sm mx-auto">See where your leads come from, top platforms, peak times, and deal source attribution. Available on the Soar plan.</p>
        <div className="max-w-sm mx-auto text-left mt-4 space-y-2">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">What you'll get:</p>
          <ul className="text-sm text-slate-300 space-y-1.5">
            <li>📊 Lead source breakdown — see which platforms produce results</li>
            <li>⏰ Peak activity times — know when to post for maximum impact</li>
            <li>💰 Deal attribution — trace every sale back to its source</li>
            <li>📈 Weekly and monthly trend reports</li>
          </ul>
        </div>
        <a href="/settings" className="inline-block bg-gradient-to-r from-amber-500 to-orange-500 text-black px-8 py-3 rounded-lg font-bold hover:opacity-90 transition-opacity mt-4">Upgrade to Soar — $24.99/mo</a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-bold text-white">🦅 Hawk Insights</h2>
        <p className="text-xs text-slate-400">Know exactly what's working and where your money comes from</p>
      </div>

      {/* Top Lead Sources */}
      <div className="glass-card">
        <h3 className="font-semibold text-white mb-3">📍 Where Your Leads Come From</h3>
        {topSources.length === 0 ? (
          <p className="text-xs text-slate-500">Add deals with lead sources to see analytics here</p>
        ) : (
          <div className="space-y-2">
            {topSources.slice(0, 6).map((s) => (
              <div key={s.source} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm text-slate-300 truncate">{sourceLabels[s.source] || s.source}</span>
                    <span className="text-xs text-green-400">${s.value.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full" style={{ width: `${Math.round((s.count / (topSources[0]?.count || 1)) * 100)}%` }} />
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-xs text-slate-500">{s.count} deals</span>
                    <span className="text-xs text-slate-500">{s.won} won</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Platform Engagement */}
      <div className="glass-card">
        <h3 className="font-semibold text-white mb-3">📊 Platform Engagement</h3>
        {topPlatforms.length === 0 ? (
          <p className="text-xs text-slate-500">Leads will appear here once the scanner or extension detects them</p>
        ) : (
          <div className="space-y-2">
            {topPlatforms.map((p) => (
              <div key={p.platform} className="flex items-center gap-3">
                <span className="text-lg w-8 text-center">{platformIcons[p.platform] || '📱'}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm text-slate-300 capitalize">{p.platform}</span>
                    <span className="text-xs text-blue-400">{Math.round((p.count / totalLeads) * 100)}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.round((p.count / totalLeads) * 100)}%` }} />
                  </div>
                  <span className="text-xs text-slate-500">{p.count} leads</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Peak Engagement Times */}
      <div className="glass-card">
        <h3 className="font-semibold text-white mb-3">⏰ Peak Engagement Times</h3>
        {peakHours.length === 0 ? (
          <p className="text-xs text-slate-500">Engagement data will appear as leads are detected</p>
        ) : (
          <div className="space-y-2">
            {peakHours.map((h) => (
              <div key={h.hour} className="flex items-center gap-3">
                <span className="text-sm text-slate-400 w-12">{formatHour(h.hour)}</span>
                <div className="flex-1 h-4 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" style={{ width: `${Math.round((h.count / maxHourCount) * 100)}%` }} />
                </div>
                <span className="text-xs text-slate-500 w-8 text-right">{h.count}</span>
              </div>
            ))}
            <p className="text-xs text-amber-400 mt-2">💡 Post during your peak hours for maximum visibility</p>
          </div>
        )}
      </div>

      {/* Internet Lead Vendor Performance */}
      {topVendors.length > 0 && (
        <div className="glass-card">
          <h3 className="font-semibold text-white mb-3">🌐 Internet Lead Vendors</h3>
          <div className="space-y-2">
            {topVendors.map((v) => (
              <div key={v.vendor} className="flex items-center justify-between bg-white/5 px-3 py-2 rounded-lg">
                <div>
                  <p className="text-sm text-white">{v.vendor}</p>
                  <p className="text-xs text-slate-500">{v.count} leads · {v.won} won · {v.count > 0 ? Math.round((v.won / v.count) * 100) : 0}% close rate</p>
                </div>
                <p className="text-sm font-medium text-green-400">${v.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 📊 Post Timing & Group Performance */}
      {(() => {
        const postHistoryKey = `hawkeye_post_history_${user?.sub || 'default'}`;
        let postHistory: { id: string; content: string; group: string; groupLink: string; postedAt: string; timeOfDay: string; dayOfWeek: string }[] = [];
        try { postHistory = JSON.parse(localStorage.getItem(postHistoryKey) || '[]'); } catch { /* ignore */ }
        if (postHistory.length === 0) return null;

        // Best time of day
        const byHour: Record<string, number> = {};
        postHistory.forEach((p) => {
          const hour = p.timeOfDay.split(':')[0];
          const h = parseInt(hour);
          const label = h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
          byHour[label] = (byHour[label] || 0) + 1;
        });
        const sortedHours = Object.entries(byHour).sort((a, b) => b[1] - a[1]);
        const maxHourCount = sortedHours[0]?.[1] || 1;

        // Best day of week
        const byDay: Record<string, number> = {};
        postHistory.forEach((p) => { byDay[p.dayOfWeek] = (byDay[p.dayOfWeek] || 0) + 1; });
        const sortedDays = Object.entries(byDay).sort((a, b) => b[1] - a[1]);

        // Top groups
        const byGroup: Record<string, number> = {};
        postHistory.forEach((p) => { byGroup[p.group] = (byGroup[p.group] || 0) + 1; });
        const sortedGroups = Object.entries(byGroup).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const maxGroupCount = sortedGroups[0]?.[1] || 1;

        return (
          <>
            <div className="glass-card">
              <h3 className="font-semibold text-white mb-3">🕐 Best Posting Times</h3>
              <p className="text-xs text-slate-400 mb-3">Based on {postHistory.length} posts tracked</p>
              <div className="space-y-1.5">
                {sortedHours.slice(0, 6).map(([hour, count]) => (
                  <div key={hour} className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-12 shrink-0">{hour}</span>
                    <div className="flex-1 h-4 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" style={{ width: `${(count / maxHourCount) * 100}%` }} />
                    </div>
                    <span className="text-xs text-slate-400 w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
              {sortedDays.length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/10">
                  <p className="text-xs text-slate-400 font-semibold mb-2">📅 Best Days</p>
                  <div className="flex flex-wrap gap-2">
                    {sortedDays.slice(0, 5).map(([day, count], i) => (
                      <span key={day} className={`text-xs px-2.5 py-1 rounded-full ${i === 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-white/5 text-slate-300 border border-white/10'}`}>
                        {day.slice(0, 3)} ({count})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="glass-card">
              <h3 className="font-semibold text-white mb-3">🏆 Top Performing Groups</h3>
              <p className="text-xs text-slate-400 mb-3">Groups you post in most frequently</p>
              <div className="space-y-1.5">
                {sortedGroups.map(([group, count], i) => (
                  <div key={group} className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-4 shrink-0">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white truncate flex-1">{group}</span>
                        <span className="text-[10px] text-slate-500 shrink-0">{count} posts</span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full" style={{ width: `${(count / maxGroupCount) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        );
      })()}

      {/* Flock Analytics */}
      <div className="glass-card">
        <h3 className="font-semibold text-white mb-3">🦅 Flock Analytics</h3>
        {(() => {
          const now = new Date();
          const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const postEvents = events.filter((e) => e.type === 'post');
          const pastPosts = postEvents.filter((e) => e.date < todayLocal);
          const completedPosts = pastPosts.filter((e) => e.completed);
          const missedPosts = pastPosts.filter((e) => !e.completed);
          const completionRate = pastPosts.length > 0 ? Math.round((completedPosts.length / pastPosts.length) * 100) : 0;

          // Group performance - which groups get completed most/least
          const groupStats: Record<string, { total: number; completed: number; missed: number }> = {};
          for (const post of pastPosts) {
            // Strip time prefix and clean title for grouping
            const cleanTitle = post.title.replace(/^\[\d{1,2}:\d{2}\]\s*/, '').trim();
            if (!groupStats[cleanTitle]) groupStats[cleanTitle] = { total: 0, completed: 0, missed: 0 };
            groupStats[cleanTitle].total++;
            if (post.completed) groupStats[cleanTitle].completed++;
            else groupStats[cleanTitle].missed++;
          }
          const sortedGroups = Object.entries(groupStats)
            .map(([name, stats]) => ({ name, ...stats, rate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0 }))
            .sort((a, b) => b.total - a.total);

          // Weekly trend (last 4 weeks)
          const weeklyData: { week: string; total: number; completed: number }[] = [];
          for (let i = 3; i >= 0; i--) {
            const weekStart = new Date(now);
            weekStart.setDate(weekStart.getDate() - (i * 7) - weekStart.getDay());
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            const ws = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
            const we = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`;
            const weekPosts = pastPosts.filter((e) => e.date >= ws && e.date <= we);
            const weekCompleted = weekPosts.filter((e) => e.completed);
            weeklyData.push({
              week: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              total: weekPosts.length,
              completed: weekCompleted.length,
            });
          }

          if (pastPosts.length === 0) {
            return <p className="text-xs text-slate-500">Post in your flocks for a few days to see analytics here</p>;
          }

          return (
            <div className="space-y-4">
              {/* Completion Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-3 rounded-lg bg-green-500/5 border border-green-500/10">
                  <div className="text-xl font-bold text-green-400">{completionRate}%</div>
                  <div className="text-xs text-slate-400">Completion</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                  <div className="text-xl font-bold text-blue-400">{completedPosts.length}</div>
                  <div className="text-xs text-slate-400">Posted</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                  <div className="text-xl font-bold text-red-400">{missedPosts.length}</div>
                  <div className="text-xs text-slate-400">Missed</div>
                </div>
              </div>

              {/* Weekly Trend */}
              <div>
                <p className="text-xs text-slate-400 font-semibold mb-2">Weekly Trend</p>
                <div className="flex items-end gap-2 h-16">
                  {weeklyData.map((w) => {
                    const maxTotal = Math.max(...weeklyData.map((d) => d.total)) || 1;
                    const height = w.total > 0 ? Math.max(20, (w.completed / maxTotal) * 100) : 5;
                    return (
                      <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full rounded-t" style={{ height: `${height}%`, background: w.total > 0 ? `linear-gradient(to top, rgba(34,197,94,0.6), rgba(34,197,94,0.2))` : 'rgba(100,116,139,0.2)' }} />
                        <span className="text-[9px] text-slate-500">{w.week}</span>
                        <span className="text-[9px] text-slate-400">{w.total > 0 ? `${Math.round((w.completed / w.total) * 100)}%` : '-'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top Groups */}
              {sortedGroups.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 font-semibold mb-2">Flock Performance</p>
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                    {sortedGroups.slice(0, 10).map((g) => (
                      <div key={g.name} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-200 truncate">{g.name}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-green-400">{g.completed}✓</span>
                          {g.missed > 0 && <span className="text-[10px] text-red-400">{g.missed}✕</span>}
                          <span className={`text-xs font-bold ${g.rate >= 80 ? 'text-green-400' : g.rate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{g.rate}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Team Performance Section */}
      {isInTeam && (
        <div className="glass-card">
          <h3 className="font-semibold text-white mb-3">👥 Team Performance</h3>
          {!teamAnalytics ? (
            <p className="text-xs text-slate-500">Loading team stats...</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center p-3 rounded-lg bg-slate-800 border border-green-500/30">
                  <div className="text-xl font-bold text-green-400">${teamAnalytics.totalRevenue.toLocaleString()}</div>
                  <div className="text-xs text-slate-400">Team Revenue</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-slate-800 border border-blue-500/30">
                  <div className="text-xl font-bold text-blue-400">{teamAnalytics.wonDeals}</div>
                  <div className="text-xs text-slate-400">Team Deals Won</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center p-3 rounded-lg bg-slate-800 border border-purple-500/30">
                  <div className="text-xl font-bold text-purple-400">{teamAnalytics.flockCompletionRate}%</div>
                  <div className="text-xs text-slate-400">Team Flock Rate</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-slate-800 border border-amber-500/30">
                  <div className="text-xl font-bold text-amber-400">{teamAnalytics.totalDeals}</div>
                  <div className="text-xs text-slate-400">Total Team Deals</div>
                </div>
              </div>
              {/* Mini Leaderboard */}
              <div>
                <p className="text-xs text-slate-400 font-semibold mb-2">🏆 Team Leaderboard</p>
                <div className="space-y-1.5">
                  {teamAnalytics.members.sort((a, b) => b.revenue - a.revenue).slice(0, 5).map((m, i) => (
                    <div key={m.email} className="flex items-center justify-between bg-white/5 px-3 py-2 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                        <div className={`w-2 h-2 rounded-full ${MEMBER_COLORS[getMemberColorIndex(m.email)]}`} />
                        <span className="text-sm text-white">{m.email.split('@')[0]}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-green-400">${m.revenue.toLocaleString()}</span>
                        <span className="text-xs text-slate-500 ml-2">{m.wonDeals}W</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="glass-card border-blue-500/20 text-center">
        <p className="text-sm text-slate-400">Total Deals: <span className="text-white font-medium">{deals.length}</span></p>
        <p className="text-sm text-slate-400">Total Leads Detected: <span className="text-white font-medium">{leads.length}</span></p>
        <p className="text-sm text-slate-400">Won Revenue: <span className="text-green-400 font-medium">${deals.filter((d) => d.stage === 'won').reduce((s, d) => s + d.value, 0).toLocaleString()}</span></p>
      </div>
    </div>
  );
}
