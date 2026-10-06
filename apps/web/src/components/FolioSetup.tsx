import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ApiClient } from '@social-lead-gen/shared';
import FolioManager from './FolioManager';

/**
 * How a user wants their sales production broken into reporting periods.
 *  - 'folio'  : custom named periods (insurance-agency style). Uses FolioManager.
 *  - 'calendar': automatic calendar Month / Quarter / Year (no setup needed).
 *  - 'fiscal' : same as calendar but the year starts on a month the user picks.
 */
export type TrackingMode = 'folio' | 'calendar' | 'fiscal';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Branded tracking-period setup card for the Settings page.
 *
 * Lets any user choose HOW they track sales production:
 *   Folios · Calendar (month/quarter/year) · Custom fiscal year.
 * The choice is persisted to profile preferences (trackingMode +
 * fiscalYearStartMonth) so Sales, Summit, and recap emails all agree.
 */
export default function FolioSetup() {
  const { getToken } = useAuth();
  const [mode, setMode] = useState<TrackingMode>(() => {
    const saved = localStorage.getItem('hawkeye_tracking_mode') as TrackingMode | null;
    if (saved === 'folio' || saved === 'calendar' || saved === 'fiscal') return saved;
    // Back-compat: fall back to the old boolean flag.
    const legacy = localStorage.getItem('hawkeye_folios_enabled');
    return legacy === 'false' ? 'calendar' : 'folio';
  });
  // 1-12, which calendar month a fiscal year begins on (default January).
  const [fiscalStart, setFiscalStart] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem('hawkeye_fiscal_start') || '1');
    return saved >= 1 && saved <= 12 ? saved : 1;
  });
  const [loaded, setLoaded] = useState(false);

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  useEffect(() => {
    async function load() {
      try {
        const client = await buildClient();
        const prefs = await client.request<any>('GET', '/profile/preferences');
        // Prefer the new trackingMode; fall back to the legacy boolean.
        if (prefs.trackingMode === 'folio' || prefs.trackingMode === 'calendar' || prefs.trackingMode === 'fiscal') {
          setMode(prefs.trackingMode);
          localStorage.setItem('hawkeye_tracking_mode', prefs.trackingMode);
        } else if (typeof prefs.foliosEnabled === 'boolean') {
          const m: TrackingMode = prefs.foliosEnabled ? 'folio' : 'calendar';
          setMode(m);
          localStorage.setItem('hawkeye_tracking_mode', m);
        }
        if (typeof prefs.fiscalYearStartMonth === 'number' && prefs.fiscalYearStartMonth >= 1 && prefs.fiscalYearStartMonth <= 12) {
          setFiscalStart(prefs.fiscalYearStartMonth);
          localStorage.setItem('hawkeye_fiscal_start', String(prefs.fiscalYearStartMonth));
        }
      } catch { /* use local default */ }
      finally { setLoaded(true); }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function persist(next: TrackingMode, nextFiscal: number) {
    localStorage.setItem('hawkeye_tracking_mode', next);
    localStorage.setItem('hawkeye_fiscal_start', String(nextFiscal));
    // Keep the legacy flag in sync so older code paths still hide/show folio UI.
    localStorage.setItem('hawkeye_folios_enabled', String(next === 'folio'));
    try {
      const client = await buildClient();
      await client.request('PUT', '/profile/preferences', {
        trackingMode: next,
        fiscalYearStartMonth: nextFiscal,
        foliosEnabled: next === 'folio',
      });
    } catch { /* best effort */ }
  }

  function chooseMode(next: TrackingMode) {
    setMode(next);
    persist(next, fiscalStart);
  }

  function chooseFiscalStart(m: number) {
    setFiscalStart(m);
    persist(mode, m);
  }

  if (!loaded) return null;

  const tabs: { id: TrackingMode; label: string; icon: string }[] = [
    { id: 'folio', label: 'Folios', icon: '📁' },
    { id: 'calendar', label: 'Calendar', icon: '📅' },
    { id: 'fiscal', label: 'Fiscal Year', icon: '🗓️' },
  ];

  return (
    <div className="glass-card overflow-hidden relative">
      {/* Hawk accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 to-orange-500" />

      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">📊</span>
        <h3 className="font-semibold text-white">Sales Tracking Periods</h3>
      </div>
      <p className="text-xs text-slate-400 mb-3">Choose how your production is broken into periods. Used across Sales, Summit, and recap emails.</p>

      {/* Mode selector */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => chooseMode(t.id)}
            className={`py-2 rounded-lg text-[11px] font-bold transition-all border ${
              mode === t.id
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black border-transparent'
                : 'bg-slate-800 text-slate-300 border-white/10 hover:bg-slate-700'
            }`}
          >
            <span className="block text-base leading-none mb-0.5">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'folio' && (
        <div className="rounded-xl bg-slate-800/60 border border-white/10 p-3">
          <FolioManager />
        </div>
      )}

      {mode === 'calendar' && (
        <div className="rounded-xl bg-slate-800/40 border border-white/5 p-4 text-center">
          <span className="text-2xl">📅</span>
          <p className="text-sm font-medium text-white mt-2">Calendar periods</p>
          <p className="text-xs text-slate-400 mt-1">
            Your sales track by <span className="text-amber-400 font-semibold">This Month</span>, <span className="text-amber-400 font-semibold">This Quarter</span>, and <span className="text-amber-400 font-semibold">This Year</span> automatically. Nothing to set up — just pick a period on the Sales tab.
          </p>
        </div>
      )}

      {mode === 'fiscal' && (
        <div className="rounded-xl bg-slate-800/60 border border-white/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🗓️</span>
            <p className="text-sm font-medium text-white">Fiscal year</p>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Track by quarter and year, but start your year on the month your business uses. Months and quarters shift to match.
          </p>
          <label className="block text-[10px] text-slate-400 mb-1">My fiscal year starts in</label>
          <select
            value={fiscalStart}
            onChange={(e) => chooseFiscalStart(parseInt(e.target.value))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:border-amber-500 outline-none"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1} className="bg-slate-900">{name}</option>
            ))}
          </select>
          <p className="text-[10px] text-slate-500 mt-2">
            Example: fiscal year starting in {MONTH_NAMES[fiscalStart - 1]} means Q1 is {MONTH_NAMES[fiscalStart - 1]}–{MONTH_NAMES[(fiscalStart + 1) % 12]}.
          </p>
        </div>
      )}
    </div>
  );
}
