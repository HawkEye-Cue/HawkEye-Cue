import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ApiClient } from '@social-lead-gen/shared';
import type { Opportunity, OpportunityStatus, OpportunityStats } from '@social-lead-gen/shared';

const FILTERS: { label: string; value: OpportunityStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Followed Up', value: 'followed_up' },
  { label: 'Converted', value: 'converted' },
];

const platformIcons: Record<string, string> = {
  facebook: '📘',
  instagram: '📷',
  linkedin: '💼',
  tiktok: '🎵',
  nextdoor: '🏡',
};

const statusColors: Record<string, string> = {
  new: 'bg-blue-900/40 text-blue-400 border-blue-500/20',
  followed_up: 'bg-yellow-900/40 text-yellow-400 border-yellow-500/20',
  converted: 'bg-green-900/40 text-green-400 border-green-500/20',
  dismissed: 'bg-slate-900/40 text-slate-400 border-slate-500/20',
};

export default function OpportunitiesPage() {
  const { getToken } = useAuth();
  const [filter, setFilter] = useState<OpportunityStatus | 'all'>('all');
  const [groupBy, setGroupBy] = useState<'none' | 'platform' | 'keyword'>('none');
  const [leads, setLeads] = useState<Opportunity[]>([]);
  const [stats, setStats] = useState<OpportunityStats>({ total: 0, new: 0, followedUp: 0, converted: 0 });
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  async function fetchData() {
    try {
      const client = await buildClient();
      const [leadsResult, statsResult] = await Promise.all([
        client.getOpportunities({ status: filter !== 'all' ? filter : undefined }),
        client.getOpportunityStats(),
      ]);
      // Handle both { items: [...] } and { opportunities: [...] } formats
      const items = leadsResult.items || (leadsResult as any).opportunities || [];
      setLeads(items);
      setStats(statsResult);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    fetchData();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpdateStatus(id: string, newStatus: OpportunityStatus) {
    setUpdatingId(id);
    try {
      const client = await buildClient();
      await client.updateOpportunityStatus(id, newStatus);
      // Update local state
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status: newStatus } : l));
      // Update stats
      setStats((prev) => {
        const updated = { ...prev };
        // Find old status to decrement
        const old = leads.find((l) => l.id === id);
        if (old) {
          if (old.status === 'new') updated.new = Math.max(0, updated.new - 1);
          else if (old.status === 'followed_up') updated.followedUp = Math.max(0, updated.followedUp - 1);
          else if (old.status === 'converted') updated.converted = Math.max(0, updated.converted - 1);
        }
        // Increment new status
        if (newStatus === 'new') updated.new++;
        else if (newStatus === 'followed_up') updated.followedUp++;
        else if (newStatus === 'converted') updated.converted++;
        return updated;
      });
    } catch { /* ignore */ }
    finally { setUpdatingId(null); }
  }

  async function handleDelete(id: string) {
    try {
      const client = await buildClient();
      await client.deleteOpportunity(id);
      const deleted = leads.find((l) => l.id === id);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      setStats((prev) => {
        const updated = { ...prev, total: prev.total - 1 };
        if (deleted?.status === 'new') updated.new--;
        else if (deleted?.status === 'followed_up') updated.followedUp--;
        else if (deleted?.status === 'converted') updated.converted--;
        return updated;
      });
    } catch (e) {
      console.error('Failed to delete lead:', e);
      alert('Failed to delete: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  function renderLeadCard(lead: Opportunity) {
    return (
      <div key={lead.id} className="glass-card">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">{platformIcons[lead.sourcePlatform] || '📱'}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">{lead.sourceAuthor}</p>
              <p className="text-xs text-slate-500">{(lead as any).keywordText || (lead as any).keywordId || 'Keyword match'} • {lead.sourcePlatform || ''} • {new Date(lead.detectedAt || (lead as any).createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[lead.status]}`}>
              {lead.status === 'followed_up' ? 'Followed Up' : lead.status === 'converted' ? 'Converted' : 'New'}
            </span>
            <button onClick={() => handleDelete(lead.id)} className="text-xs text-red-400 hover:text-red-300">✕</button>
          </div>
        </div>
        <p className="text-sm text-slate-300 italic bg-white/5 p-2 rounded-lg mb-3">&quot;{lead.sourceContent.slice(0, 150)}{lead.sourceContent.length > 150 ? '...' : ''}&quot;</p>
        <div className="flex flex-wrap items-center gap-2">
          {lead.status === 'new' && (
            <button onClick={() => handleUpdateStatus(lead.id, 'followed_up')} disabled={updatingId === lead.id} className="px-3 py-1.5 bg-yellow-600/20 border border-yellow-500/30 text-yellow-300 rounded-lg text-xs font-medium hover:bg-yellow-600/30 disabled:opacity-50">
              {updatingId === lead.id ? '...' : '📞 Mark Followed Up'}
            </button>
          )}
          {(lead.status === 'new' || lead.status === 'followed_up') && (
            <button onClick={() => handleUpdateStatus(lead.id, 'converted')} disabled={updatingId === lead.id} className="px-3 py-1.5 bg-green-600/20 border border-green-500/30 text-green-300 rounded-lg text-xs font-medium hover:bg-green-600/30 disabled:opacity-50">
              {updatingId === lead.id ? '...' : '✓ Mark Converted'}
            </button>
          )}
          {lead.sourceUrl && (
            <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-white/5 border border-white/10 text-slate-300 rounded-lg text-xs hover:bg-white/10">View Post ↗</a>
          )}
        </div>
        <details className="mt-3">
          <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300">📝 Notes</summary>
          <textarea defaultValue={localStorage.getItem(`hawkeye_lead_note_${lead.id}`) || ''} onBlur={(e) => localStorage.setItem(`hawkeye_lead_note_${lead.id}`, e.target.value)} placeholder="Add notes about this lead..." className="w-full mt-2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs placeholder-slate-500 resize-none h-16" />
        </details>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Lead Cues</h2>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="glass-card text-center">
          <div className="text-lg font-bold text-white">{stats.total}</div>
          <div className="text-xs text-slate-400">Total</div>
        </div>
        <div className="glass-card text-center border-blue-500/20">
          <div className="text-lg font-bold text-blue-400">{stats.new}</div>
          <div className="text-xs text-slate-400">New</div>
        </div>
        <div className="glass-card text-center border-yellow-500/20">
          <div className="text-lg font-bold text-yellow-400">{stats.followedUp}</div>
          <div className="text-xs text-slate-400">Followed Up</div>
        </div>
        <div className="glass-card text-center border-green-500/20">
          <div className="text-lg font-bold text-green-400">{stats.converted}</div>
          <div className="text-xs text-slate-400">Converted</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 min-h-[44px] rounded-full text-sm transition-all duration-200 ${
              filter === f.value
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Group By */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Group by:</span>
        {([['none', 'None'], ['platform', 'Platform'], ['keyword', 'Keyword']] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setGroupBy(val)}
            className={`px-3 py-1 rounded-full text-xs ${groupBy === val ? 'bg-blue-600 text-white' : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Leads List */}
      {loading ? (
        <p className="text-sm text-slate-500">Loading leads...</p>
      ) : leads.length === 0 ? (
        <div className="glass-card text-center py-8">
          <p className="text-2xl mb-2">🦅</p>
          <p className="text-slate-300 font-medium">No lead cues yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Install the browser extension and configure keywords to start detecting leads!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groupBy !== 'none' ? (
            // Grouped view
            (() => {
              const groups: Record<string, Opportunity[]> = {};
              for (const lead of leads) {
                const key = groupBy === 'platform'
                  ? (lead.sourcePlatform || 'unknown')
                  : ((lead as any).keywordText || (lead as any).keywordId || 'Unknown keyword');
                if (!groups[key]) groups[key] = [];
                groups[key].push(lead);
              }
              return Object.entries(groups).sort((a, b) => b[1].length - a[1].length).map(([groupName, groupLeads]) => (
                <details key={groupName} className="glass-card" open>
                  <summary className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm font-medium text-white">
                      {groupBy === 'platform' && <span className="mr-1">{platformIcons[groupName] || '📱'}</span>}
                      {groupBy === 'platform' ? groupName.charAt(0).toUpperCase() + groupName.slice(1) : groupName}
                    </span>
                    <span className="text-xs text-slate-500">{groupLeads.length} leads</span>
                  </summary>
                  <div className="mt-3 space-y-2">
                    {groupLeads.map((lead) => renderLeadCard(lead))}
                  </div>
                </details>
              ));
            })()
          ) : (
            // Flat view
            leads.map((lead) => renderLeadCard(lead))
          )}
        </div>
      )}
    </div>
  );
}
