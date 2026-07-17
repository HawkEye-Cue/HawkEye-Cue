import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ApiClient } from '@social-lead-gen/shared';

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
  const { getToken } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [leads, setLeads] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState('free');

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
        <a href="/settings" className="inline-block bg-gradient-to-r from-amber-500 to-orange-500 text-black px-8 py-3 rounded-lg font-bold hover:opacity-90 transition-opacity">Upgrade to Soar</a>
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

      {/* Summary */}
      <div className="glass-card border-blue-500/20 text-center">
        <p className="text-sm text-slate-400">Total Deals: <span className="text-white font-medium">{deals.length}</span></p>
        <p className="text-sm text-slate-400">Total Leads Detected: <span className="text-white font-medium">{leads.length}</span></p>
        <p className="text-sm text-slate-400">Won Revenue: <span className="text-green-400 font-medium">${deals.filter((d) => d.stage === 'won').reduce((s, d) => s + d.value, 0).toLocaleString()}</span></p>
      </div>
    </div>
  );
}
