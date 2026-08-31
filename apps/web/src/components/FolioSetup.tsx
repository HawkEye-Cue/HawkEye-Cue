import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ApiClient } from '@social-lead-gen/shared';
import FolioManager from './FolioManager';

/**
 * Branded Folio Setup card for the Settings page.
 *
 * - Lets any user turn folio tracking ON or OFF (some trades don't use folios).
 * - When ON, shows the cohesive FolioManager (dates, name, presets, auto-roll).
 * - The "uses folios" flag is persisted to profile preferences so the rest of
 *   the app can hide folio UI for users who don't need it.
 */
export default function FolioSetup() {
  const { getToken } = useAuth();
  const [enabled, setEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('hawkeye_folios_enabled');
    return saved === null ? true : saved === 'true';
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
        if (typeof prefs.foliosEnabled === 'boolean') {
          setEnabled(prefs.foliosEnabled);
          localStorage.setItem('hawkeye_folios_enabled', String(prefs.foliosEnabled));
        }
      } catch { /* use local default */ }
      finally { setLoaded(true); }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(next: boolean) {
    setEnabled(next);
    localStorage.setItem('hawkeye_folios_enabled', String(next));
    try {
      const client = await buildClient();
      await client.request('PUT', '/profile/preferences', { foliosEnabled: next });
    } catch { /* best effort */ }
  }

  if (!loaded) return null;

  return (
    <div className="glass-card overflow-hidden relative">
      {/* Hawk accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 to-orange-500" />

      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-lg">📅</span>
          <h3 className="font-semibold text-white">Folio Tracking</h3>
        </div>
        {/* On/off toggle */}
        <button
          onClick={() => toggle(!enabled)}
          className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-slate-600'}`}
          aria-label="Toggle folio tracking"
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      <p className="text-xs text-slate-400 mb-3">
        {enabled
          ? 'Track your production by folio period. Used across Sales, Summit, and recap emails.'
          : 'Folios are off. Your trade may not use them — sales still track normally without periods.'}
      </p>

      {enabled ? (
        <div className="rounded-xl bg-slate-800/60 border border-white/10 p-3">
          <FolioManager />
        </div>
      ) : (
        <div className="rounded-xl bg-slate-800/40 border border-white/5 p-4 text-center">
          <span className="text-2xl">🦅</span>
          <p className="text-xs text-slate-400 mt-2">No folio periods for your workflow. Turn this on anytime if your agency runs folios.</p>
        </div>
      )}
    </div>
  );
}
