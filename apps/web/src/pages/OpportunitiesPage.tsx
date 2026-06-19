import { useState } from 'react';
import type { OpportunityStatus } from '@social-lead-gen/shared';

const FILTERS: { label: string; value: OpportunityStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Followed Up', value: 'followed_up' },
  { label: 'Converted', value: 'converted' },
];

export default function OpportunitiesPage() {
  const [filter, setFilter] = useState<OpportunityStatus | 'all'>('all');

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Opportunities</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="glass-card text-center">
          <div className="text-lg font-bold text-white">0</div>
          <div className="text-xs text-slate-400">Total</div>
        </div>
        <div className="glass-card text-center border-blue-500/20">
          <div className="text-lg font-bold text-blue-400">0</div>
          <div className="text-xs text-slate-400">New</div>
        </div>
        <div className="glass-card text-center border-yellow-500/20">
          <div className="text-lg font-bold text-yellow-400">0</div>
          <div className="text-xs text-slate-400">Followed Up</div>
        </div>
        <div className="glass-card text-center border-green-500/20">
          <div className="text-lg font-bold text-green-400">0</div>
          <div className="text-xs text-slate-400">Converted</div>
        </div>
      </div>

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

      <div className="glass-card">
        <p className="text-sm text-slate-400 text-center py-8">
          No opportunities yet. Install the browser extension and configure keywords to start detecting leads!
        </p>
      </div>
    </div>
  );
}
