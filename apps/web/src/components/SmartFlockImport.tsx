import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCalendar } from '../contexts/CalendarContext';
import { useToast } from '../contexts/ToastContext';
import { ApiClient } from '@social-lead-gen/shared';
import type { ImportedFlockGroup } from '@social-lead-gen/shared';

// Mirrors the FlockGroup shape used by FlockGroupManager + localStorage so imported
// groups are fully compatible with the existing Flocks queue + Copy & Open flow.
interface FlockGroup {
  id: string;
  name: string;
  link: string;
  postingDays: number[]; // 0=Sun..6=Sat
  anyday: boolean;
}

// A reviewable row: the AI suggestion plus the user's editable corrections.
interface ReviewRow extends ImportedFlockGroup {
  _rowId: string;
  link: string;      // user can add the group link during review
  approved: boolean; // included in the batch save
}

const DAY_LABELS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_IMAGES = 8;

async function fileToPayload(file: File): Promise<{ data: string; format: string }> {
  const buf = await file.arrayBuffer();
  // base64 encode
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const data = btoa(binary);
  const type = file.type.toLowerCase();
  let format = 'png';
  if (type.includes('jpeg') || type.includes('jpg')) format = 'jpeg';
  else if (type.includes('webp')) format = 'webp';
  else if (type.includes('gif')) format = 'gif';
  else if (type.includes('png')) format = 'png';
  return { data, format };
}

export default function SmartFlockImport({ onClose }: { onClose: () => void }) {
  const { user, getToken } = useAuth();
  const { addEvent, events } = useCalendar();
  const { showToast } = useToast();

  const storageKey = `hawkeye_flock_groups_${user?.sub}`;

  const [files, setFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    const combined = [...files, ...picked].slice(0, MAX_IMAGES);
    setFiles(combined);
    setError(null);
  }

  async function analyze() {
    if (files.length === 0) { setError('Add at least one screenshot first.'); return; }
    setAnalyzing(true);
    setError(null);
    try {
      const payloads = await Promise.all(files.map(fileToPayload));
      const token = await getToken();
      const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
      const { groups } = await client.importFlockGroups(payloads);
      if (!groups || groups.length === 0) {
        setError('No groups were detected. Try clearer screenshots or add groups manually.');
        setRows([]);
        return;
      }
      setRows(groups.map((g, i) => ({
        ...g,
        _rowId: `row-${i}-${Math.random().toString(36).slice(2, 6)}`,
        link: '',
        // Default-approve only rows where the AI actually found rules AND a timing
        // (specific days or any-day). Rows with no rules start UNapproved so the user
        // must consciously set days before saving — promotion is never assumed.
        approved: g.rulesFound && (g.anyday || g.postingDays.length > 0) && g.name.trim().length > 0,
      })));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not analyze the screenshots.');
    } finally {
      setAnalyzing(false);
    }
  }

  function updateRow(rowId: string, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r) => (r._rowId === rowId ? { ...r, ...patch } : r)));
  }

  function toggleDay(rowId: string, day: number) {
    setRows((prev) => prev.map((r) => {
      if (r._rowId !== rowId) return r;
      if (r.anyday) return r;
      const postingDays = r.postingDays.includes(day)
        ? r.postingDays.filter((d) => d !== day)
        : [...r.postingDays, day].sort((a, b) => a - b);
      return { ...r, postingDays };
    }));
  }

  // Save approved rows into the existing group store (preserve existing, dedupe by
  // name), then schedule this week's flocks for the newly added groups.
  async function saveApproved() {
    const approved = rows.filter((r) => r.approved && r.name.trim());
    if (approved.length === 0) { setError('Approve at least one group (set its allowed days first).'); return; }

    // Guard: an approved row must have a timing (specific days or any-day). This is the
    // never-assume rule enforced at save time too.
    const missingTiming = approved.filter((r) => !r.anyday && r.postingDays.length === 0);
    if (missingTiming.length > 0) {
      setError(`Set allowed days (or "Any Day") for: ${missingTiming.map((r) => r.name).join(', ')}`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const existing: FlockGroup[] = (() => {
        try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
      })();
      const existingNames = new Set(existing.map((g) => g.name.toLowerCase()));

      const toAdd: FlockGroup[] = [];
      let skipped = 0;
      for (const r of approved) {
        const nameLower = r.name.trim().toLowerCase();
        if (existingNames.has(nameLower)) { skipped++; continue; } // preserve existing
        existingNames.add(nameLower);
        toAdd.push({
          id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: r.name.trim(),
          link: r.link.trim(),
          postingDays: r.anyday ? [] : [...r.postingDays].sort((a, b) => a - b),
          anyday: r.anyday,
        });
      }

      const combined = [...existing, ...toAdd];
      localStorage.setItem(storageKey, JSON.stringify(combined));

      // Organize the newly added groups into the daily Flocks queues (next 7 days),
      // reusing the same calendar 'post' events the manual flow uses. Sundays skipped.
      let scheduled = 0;
      const today = new Date();
      for (let offset = 0; offset < 7; offset++) {
        const date = new Date(today);
        date.setDate(date.getDate() + offset);
        const dow = date.getDay();
        if (dow === 0) continue; // skip Sunday
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        for (const g of toAdd) {
          const dayMatches = g.anyday ? dow >= 1 && dow <= 6 && g.postingDays.length === 0 && firstWeekdaySlot(g, offset) : g.postingDays.includes(dow);
          if (!dayMatches) continue;
          const already = events.some((e) => e.date === dateStr && e.title === g.name && e.type === 'post');
          if (already) continue;
          await addEvent({ date: dateStr, title: g.name, type: 'post', link: g.link || undefined });
          scheduled++;
        }
      }

      const parts = [`Saved ${toAdd.length} group${toAdd.length !== 1 ? 's' : ''}`];
      if (scheduled > 0) parts.push(`scheduled ${scheduled} flock${scheduled !== 1 ? 's' : ''}`);
      if (skipped > 0) parts.push(`${skipped} already existed`);
      showToast(`✓ ${parts.join(' · ')}`);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save groups.');
    } finally {
      setSaving(false);
    }
  }

  // For any-day groups, place them on the first upcoming weekday only (one slot this
  // week), matching the "spread evenly" default of the manual scheduler.
  function firstWeekdaySlot(_g: FlockGroup, offset: number) {
    return offset === firstWeekdayOffset();
  }
  function firstWeekdayOffset() {
    const today = new Date();
    for (let o = 0; o < 7; o++) {
      const d = new Date(today);
      d.setDate(d.getDate() + o);
      if (d.getDay() !== 0) return o;
    }
    return 1;
  }

  const approvedCount = rows.filter((r) => r.approved && r.name.trim()).length;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] px-3 pt-3 pb-20 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-md mx-auto bg-black border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100dvh - 7rem)' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">📸 Smart Flock Import</h2>
            <p className="text-[10px] text-slate-400">Upload group screenshots — we read the rules for you</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl px-2">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Upload */}
          <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-3">
            <p className="text-xs text-slate-300">Add screenshots of your Facebook groups and their posting rules (up to {MAX_IMAGES}).</p>
            <label className="block w-full text-center py-3 border-2 border-dashed border-amber-500/40 rounded-lg cursor-pointer hover:border-amber-500/70 text-amber-300 text-sm font-medium">
              + Choose screenshots
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={onPick} />
            </label>
            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate">{f.name}</span>
                    <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 shrink-0 ml-2">✕</button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={analyze}
              disabled={files.length === 0 || analyzing}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-lg disabled:opacity-50 transition-colors"
            >
              {analyzing ? 'Reading screenshots…' : '🔍 Analyze'}
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-sm text-red-300">{error}</div>
          )}

          {/* Review */}
          {rows.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-white">Review & correct ({approvedCount} selected)</p>
              <p className="text-[10px] text-slate-500">We never assume posting is allowed. Groups without clear rules need you to set the days before they can be saved.</p>
              {rows.map((r) => (
                <div key={r._rowId} className={`rounded-xl border p-3 space-y-2 ${r.approved ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/10 bg-white/5'}`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={r.approved}
                      onChange={(e) => updateRow(r._rowId, { approved: e.target.checked })}
                      className="w-4 h-4 rounded accent-amber-500 shrink-0"
                    />
                    <input
                      type="text"
                      value={r.name}
                      onChange={(e) => updateRow(r._rowId, { name: e.target.value })}
                      placeholder="Group name"
                      className="flex-1 px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white text-xs"
                    />
                  </div>

                  <input
                    type="url"
                    value={r.link}
                    onChange={(e) => updateRow(r._rowId, { link: e.target.value })}
                    placeholder="Facebook group link (optional)"
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-white text-xs placeholder-slate-500"
                  />

                  {r.warning && (
                    <p className="text-[10px] text-amber-400">⚠️ {r.warning}</p>
                  )}
                  {r.frequencyLimit && (
                    <p className="text-[10px] text-slate-400">Frequency: {r.frequencyLimit}</p>
                  )}
                  {r.restrictions && (
                    <p className="text-[10px] text-slate-400">Rules: {r.restrictions}</p>
                  )}

                  {/* Day picker */}
                  <div className="flex gap-1">
                    {DAY_LABELS.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => toggleDay(r._rowId, i)}
                        disabled={r.anyday}
                        className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all ${
                          r.anyday ? 'bg-white/5 text-slate-600' :
                          r.postingDays.includes(i) ? 'bg-amber-500 text-black' : 'bg-white/5 text-slate-400 hover:bg-white/10'
                        }`}
                      >
                        {DAY_LABELS_SHORT[i]}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center justify-between p-1.5 bg-white/5 rounded cursor-pointer">
                    <span className="text-[10px] text-slate-300">Any Day</span>
                    <input
                      type="checkbox"
                      checked={r.anyday}
                      onChange={(e) => updateRow(r._rowId, { anyday: e.target.checked, postingDays: e.target.checked ? [] : r.postingDays })}
                      className="w-4 h-4 rounded accent-amber-500"
                    />
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10 space-y-2 shrink-0">
          <button
            onClick={saveApproved}
            disabled={rows.length === 0 || approvedCount === 0 || saving}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-lg disabled:opacity-50 transition-all"
          >
            {saving ? 'Saving…' : `✓ Save ${approvedCount} group${approvedCount !== 1 ? 's' : ''} & schedule`}
          </button>
          <button onClick={onClose} className="w-full py-2 text-slate-400 text-xs hover:text-white transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}
