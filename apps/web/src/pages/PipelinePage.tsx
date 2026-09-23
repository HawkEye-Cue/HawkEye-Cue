import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import OpportunitiesPage from './OpportunitiesPage';
import SalesPage from './SalesPage';
import { useEdition } from '../contexts/EditionContext';

type View = 'leads' | 'deals';

/**
 * Combined Pipeline tab — Leads (HawkSight) and Deals (Talons) live under one tab
 * with a segmented toggle. Both underlying pages are reused as-is; this only adds
 * the switch on top. Opens on Leads (top of the funnel).
 */
export default function PipelinePage() {
  const [searchParams] = useSearchParams();
  const { isDiscover } = useEdition();
  // Deep links open Deals when ?newDeal=Name (from "Convert to Client") or ?view=deals.
  // In Discover, the built-in Deals pipeline is hidden — always show Leads.
  const wantsDeals = () => !isDiscover && (!!searchParams.get('newDeal') || searchParams.get('view') === 'deals');
  const [view, setView] = useState<View>(() => (wantsDeals() ? 'deals' : 'leads'));

  // If a deep link arrives after mount, switch views so it isn't missed.
  useEffect(() => {
    if (isDiscover) { setView('leads'); return; }
    if (wantsDeals()) setView('deals');
    else if (searchParams.get('view') === 'leads') setView('leads');
  }, [searchParams, isDiscover]); // eslint-disable-line react-hooks/exhaustive-deps

  // Discover: no Deals toggle — leads only, feeding the external CRM.
  if (isDiscover) {
    return (
      <div className="space-y-3">
        <OpportunitiesPage />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Segmented toggle */}
      <div className="flex bg-slate-800 rounded-xl p-1 border border-white/10 max-w-md mx-auto">
        <button
          onClick={() => setView('leads')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'leads' ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'}`}
        >
          🎯 Leads
        </button>
        <button
          onClick={() => setView('deals')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'deals' ? 'bg-green-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
        >
          💰 Deals
        </button>
      </div>

      {/* Keep both mounted? No — render one at a time to avoid duplicate fetches. */}
      {view === 'leads' ? <OpportunitiesPage /> : <SalesPage />}
    </div>
  );
}
