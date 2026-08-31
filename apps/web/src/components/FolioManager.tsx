import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ApiClient } from '@social-lead-gen/shared';
import { setFolioName, folioRange } from '../utils/folioName';

interface FolioManagerProps {
  /** Called after folio dates are saved, with the new start/end */
  onSaved?: (start: string, end: string) => void;
  /** Compact mode shows a smaller inline version */
  compact?: boolean;
}

interface ScheduledFolio {
  start: string;
  end: string;
  name: string;
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
  const [scheduled, setScheduled] = useState<ScheduledFolio[]>([]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [cycleType, setCycleType] = useState<'monthly' | 'custom'>('monthly');
  const [cycleDays, setCycleDays] = useState(30);
  const [monthsAhead, setMonthsAhead] = useState(18);

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  // Load current folio config
  useEffect(() => {
    async function load() {
      try {
        const client = await buildClient();
        const cfg = await client.request<{ folioStart?: string; folioEnd?: string; folioName?: string; scheduledFolios?: ScheduledFolio[] }>('GET', '/sales/folio-config');
        if (cfg.folioStart) setStart(cfg.folioStart);
        if (cfg.folioEnd) setEnd(cfg.folioEnd);
        if (cfg.folioName) setName(cfg.folioName);
        if (Array.isArray(cfg.scheduledFolios)) setScheduled(cfg.scheduledFolios);
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
      // Associate the nickname with this date range so it shows everywhere
      setFolioName(folioRange(newStart, newEnd), name);
      // Also sync the names map to the server for cross-device persistence
      try {
        const { getFolioNameMap } = await import('../utils/folioName');
        await client.request('PUT', '/profile/preferences', { folioNamesMap: getFolioNameMap() });
      } catch { /* best effort */ }
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

  // Generate a series of future folios from the current start, up to monthsAhead
  function generateSchedule() {
    if (!start) { showToast('Set a start date first'); return; }
    const folios: ScheduledFolio[] = [];
    const horizon = new Date(start + 'T12:00:00');
    horizon.setMonth(horizon.getMonth() + monthsAhead);

    let curStart = new Date(start + 'T12:00:00');
    let guard = 0;
    while (curStart < horizon && guard < 60) {
      guard++;
      let curEnd: Date;
      if (cycleType === 'monthly') {
        // End = last day of the folio's start month cycle (one month minus a day)
        curEnd = new Date(curStart);
        curEnd.setMonth(curEnd.getMonth() + 1);
        curEnd.setDate(curEnd.getDate() - 1);
      } else {
        curEnd = new Date(curStart);
        curEnd.setDate(curEnd.getDate() + (cycleDays - 1));
      }
      const label = curStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) + ' Folio';
      folios.push({ start: fmt(curStart), end: fmt(curEnd), name: label });
      // Next folio starts the day after this one ends
      curStart = new Date(curEnd);
      curStart.setDate(curStart.getDate() + 1);
    }
    setScheduled(folios);
    showToast(`✓ Generated ${folios.length} folios`);
  }

  async function saveSchedule() {
    setSaving(true);
    try {
      const client = await buildClient();
      await client.request('PUT', '/sales/folio-config', { scheduledFolios: scheduled });
      // Also register each folio's name in the shared names map
      for (const f of scheduled) setFolioName(folioRange(f.start, f.end), f.name);
      showToast(`✓ ${scheduled.length} folios scheduled`);
      setShowSchedule(false);
    } catch { showToast('❌ Failed to save schedule'); }
    finally { setSaving(false); }
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
              📅 {name || (start && end ? 'Current Folio' : 'Current Folio')}
              {folioEnded && <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-500/30">Ended</span>}
            </p>
            {start && end ? (
              <p className="text-xs text-slate-400">{prettyDate(start)} → {prettyDate(end)}</p>
            ) : (
              <p className="text-xs text-amber-400">Not set — tap to configure</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              onClick={() => { if (folioEnded) rollForward(); setEditing(true); }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg"
            >
              {folioEnded ? '↻ New Folio' : start ? 'Edit' : 'Set Dates'}
            </button>
            <button
              onClick={() => setShowSchedule(!showSchedule)}
              className="text-[11px] text-amber-400 hover:text-amber-300"
            >
              📆 Schedule ahead{scheduled.length > 0 ? ` (${scheduled.length})` : ''}
            </button>
          </div>
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

      {/* Schedule ahead panel — plan folios 18+ months out */}
      {showSchedule && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
          <p className="text-xs font-semibold text-white">📆 Schedule Future Folios</p>
          <p className="text-[10px] text-slate-400">Plan your folio calendar ahead of time. Starts from your current folio start date.</p>

          {/* Cycle type */}
          <div className="flex gap-2">
            <button onClick={() => setCycleType('monthly')} className={`flex-1 py-2 rounded-lg text-[11px] font-medium transition-all ${cycleType === 'monthly' ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-300'}`}>Monthly</button>
            <button onClick={() => setCycleType('custom')} className={`flex-1 py-2 rounded-lg text-[11px] font-medium transition-all ${cycleType === 'custom' ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-300'}`}>Custom cycle</button>
          </div>

          {cycleType === 'custom' && (
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Cycle length (days)</label>
              <input type="number" min={7} max={90} value={cycleDays} onChange={(e) => setCycleDays(Math.max(7, parseInt(e.target.value) || 30))} className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs" />
            </div>
          )}

          {/* Months ahead */}
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Plan ahead: {monthsAhead} months</label>
            <input type="range" min={6} max={36} step={1} value={monthsAhead} onChange={(e) => setMonthsAhead(parseInt(e.target.value))} className="w-full accent-amber-500" />
            <div className="flex justify-between text-[9px] text-slate-500"><span>6mo</span><span>18mo</span><span>36mo</span></div>
          </div>

          <button onClick={generateSchedule} className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg">⚡ Generate Folios</button>

          {/* Preview list */}
          {scheduled.length > 0 && (
            <>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {scheduled.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-800 border border-white/10 rounded-lg px-2.5 py-1.5">
                    <input
                      type="text"
                      value={f.name}
                      onChange={(e) => setScheduled((prev) => prev.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))}
                      className="bg-transparent text-[11px] text-white font-medium w-24 border-b border-transparent focus:border-amber-500 outline-none"
                    />
                    <span className="text-[9px] text-slate-400">{prettyDate(f.start)} → {prettyDate(f.end)}</span>
                    <button onClick={() => setScheduled((prev) => prev.filter((_, xi) => xi !== i))} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                  </div>
                ))}
              </div>
              <button onClick={saveSchedule} disabled={saving} className="w-full py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg disabled:opacity-50">
                {saving ? 'Saving…' : `💾 Save ${scheduled.length} Folios`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
