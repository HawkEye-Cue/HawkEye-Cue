import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ApiClient } from '@social-lead-gen/shared';

interface FolioManagerProps {
  /** Called after folio dates are saved, with the new start/end */
  onSaved?: (start: string, end: string) => void;
  /** Compact mode shows a smaller inline version */
  compact?: boolean;
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function prettyDate(s: string): string {
  if (!s) return '—';
  try {
    const d = new Date(s + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return s; }
}

/**
 * One cohesive place to set folio dates. Syncs to /sales/folio-config
 * (the single source of truth used by Sales, Summit, and the recap emails).
 * Includes quick presets and an auto-roll-forward suggestion when a folio has ended.
 */
export default function FolioManager({ onSaved, compact }: FolioManagerProps) {
  const { getToken } = useAuth();
  const { showToast } = useToast();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  // Load current folio config
  useEffect(() => {
    async function load() {
      try {
        const client = await buildClient();
        const cfg = await client.request<{ folioStart?: string; folioEnd?: string; folioName?: string }>('GET', '/sales/folio-config');
        if (cfg.folioStart) setStart(cfg.folioStart);
        if (cfg.folioEnd) setEnd(cfg.folioEnd);
        if (cfg.folioName) setName(cfg.folioName);
      } catch { /* fall back to localStorage */
        setStart(localStorage.getItem('hawkeye_folio_start') || '');
        setEnd(localStorage.getItem('hawkeye_folio_end') || '');
        setName(localStorage.getItem('hawkeye_folio_name') || '');
      } finally { setLoaded(true); }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(newStart: string, newEnd: string) {
    if (!newStart || !newEnd) { showToast('Pick both a start and end date'); return; }
    if (newEnd < newStart) { showToast('End date must be after start date'); return; }
    setSaving(true);
    try {
      const client = await buildClient();
      await client.request('PUT', '/sales/folio-config', { folioStart: newStart, folioEnd: newEnd, folioName: name });
      localStorage.setItem('hawkeye_folio_start', newStart);
      localStorage.setItem('hawkeye_folio_end', newEnd);
      localStorage.setItem('hawkeye_folio_name', name);
      setStart(newStart);
      setEnd(newEnd);
      setEditing(false);
      showToast('✓ Folio saved');
      onSaved?.(newStart, newEnd);
    } catch { showToast('❌ Failed to save'); }
    finally { setSaving(false); }
  }

  // Preset: this calendar month
  function presetMonth() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setStart(fmt(first));
    setEnd(fmt(last));
  }

  // Roll forward: next period same length, starting the day after current end
  function rollForward() {
    if (!start || !end) { presetMonth(); return; }
    const s = new Date(start + 'T12:00:00');
    const e = new Date(end + 'T12:00:00');
    const lengthDays = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
    const newStart = new Date(e);
    newStart.setDate(newStart.getDate() + 1);
    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + lengthDays);
    setStart(fmt(newStart));
    setEnd(fmt(newEnd));
  }

  // Has the current folio already ended? (suggest rolling forward)
  const folioEnded = end && end < fmt(new Date());

  if (!loaded) return null;

  return (
    <div className={compact ? '' : 'glass-card'}>
      {!editing ? (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white flex items-center gap-1.5">
              📅 {name || 'Current Folio'}
              {folioEnded && <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-500/30">Ended</span>}
            </p>
            {start && end ? (
              <p className="text-xs text-slate-400">{prettyDate(start)} → {prettyDate(end)}</p>
            ) : (
              <p className="text-xs text-amber-400">Not set — tap to configure</p>
            )}
          </div>
          <button
            onClick={() => { if (folioEnded) rollForward(); setEditing(true); }}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg shrink-0"
          >
            {folioEnded ? '↻ New Folio' : start ? 'Edit' : 'Set Dates'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium text-white">Set Folio Period</p>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-1.5">
            <button onClick={presetMonth} className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-[11px] text-slate-300 hover:bg-white/10">This Month</button>
            <button onClick={rollForward} className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-[11px] text-slate-300 hover:bg-white/10">↻ Next Period</button>
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Folio Name (optional)</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. "Aug 26 Folio"' className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs placeholder-slate-500" />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 mb-1">Start</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs" />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 mb-1">End</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs" />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => save(start, end)} disabled={saving} className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg disabled:opacity-50">
              {saving ? 'Saving…' : '💾 Save Folio'}
            </button>
            <button onClick={() => setEditing(false)} className="px-3 py-2 text-slate-400 text-xs hover:text-white">Cancel</button>
          </div>
          <p className="text-[10px] text-slate-500">This syncs everywhere — Sales, Summit, and recap emails all use these dates.</p>
        </div>
      )}
    </div>
  );
}
