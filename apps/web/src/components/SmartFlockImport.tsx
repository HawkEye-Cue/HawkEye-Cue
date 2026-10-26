import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCalendar } from '../contexts/CalendarContext';
import { useToast } from '../contexts/ToastContext';
import { ApiClient, normalizeFacebookGroupUrl } from '@social-lead-gen/shared';
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
  link: string;        // user can add the group link during review
  approved: boolean;   // included in the batch save
  // The user must explicitly confirm the posting days (AI days are only a suggestion).
  // Starts false; set true when the user clicks "Confirm days"; RESET to false whenever
  // the day selection changes, so a confident-but-wrong AI day can never be saved
  // without a deliberate human confirmation of the final selection.
  daysConfirmed: boolean;
}

const DAY_LABELS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_IMAGES = 8;
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB per image (matches Send-to-HawkEye)
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

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
  const [previews, setPreviews] = useState<string[]>([]); // object URLs, index-aligned with files
  const [analyzing, setAnalyzing] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared intake for BOTH file-picker and clipboard paste. Validates type/size,
  // dedupes (by name+size), and enforces the 8-image cap. Returns a summary message.
  const addFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return;
    setError(null);
    setFiles((prev) => {
      const next = [...prev];
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const rejected: string[] = [];
      const tooBig: string[] = [];
      let addedAny = false;
      for (const f of incoming) {
        if (next.length >= MAX_IMAGES) { rejected.push(`max ${MAX_IMAGES} images`); break; }
        const type = (f.type || '').toLowerCase();
        if (!ACCEPTED_TYPES.includes(type)) { rejected.push(f.name || 'unsupported file'); continue; }
        if (f.size > MAX_FILE_BYTES) { tooBig.push(f.name || 'image'); continue; }
        const key = `${f.name}:${f.size}`;
        if (seen.has(key)) continue; // dedupe
        seen.add(key);
        next.push(f);
        addedAny = true;
      }
      const msgs: string[] = [];
      if (tooBig.length) msgs.push(`Too large (max 8MB): ${tooBig.join(', ')}`);
      if (rejected.length) msgs.push(`Skipped: ${rejected.join(', ')}`);
      if (msgs.length) setError(msgs.join(' · '));
      else if (!addedAny && incoming.length) setError('Those images were already added.');
      return next;
    });
  }, []);

  // Keep object-URL previews in sync with files (and revoke on cleanup).
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [files]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files || []));
    e.target.value = ''; // allow re-picking the same file
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // Clipboard paste — active only while this modal is mounted. Ignores pastes that
  // target a text field (so pasting into name/link inputs still works normally).
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) {
            // Clipboard images often have no name — give them a friendly, unique one.
            const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
            const named = new File([f], f.name || `pasted-${Date.now()}-${i}.${ext}`, { type: f.type });
            imgs.push(named);
          }
        }
      }
      if (imgs.length > 0) {
        e.preventDefault();
        addFiles(imgs);
        showToast(`📋 Added ${imgs.length} pasted screenshot${imgs.length !== 1 ? 's' : ''}`);
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles, showToast]);

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
      setRows(groups.map((g, i) => {
        // Prefill the link ONLY if the AI returned one it actually read from the
        // screenshot (backend may include `link`/`url`). We never invent a URL; if the
        // extracted value isn't a valid group link we leave the field blank for the
        // user to paste. A valid URL is required before saving (see saveApproved).
        const extracted = (g as { link?: string; url?: string }).link ?? (g as { url?: string }).url ?? '';
        const norm = extracted ? normalizeFacebookGroupUrl(extracted) : { ok: false, url: undefined };
        return {
          ...g,
          _rowId: `row-${i}-${Math.random().toString(36).slice(2, 6)}`,
          link: norm.ok ? (norm.url as string) : '',
          // Default-approve only rows where the AI actually found rules AND a timing
          // (specific days or any-day). Rows with no rules start UNapproved so the user
          // must consciously set days before saving — promotion is never assumed.
          approved: g.rulesFound && (g.anyday || g.postingDays.length > 0) && g.name.trim().length > 0,
          // AI days are a SUGGESTION — always require explicit confirmation before save.
          daysConfirmed: false,
        };
      }));
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
      // Any change to the day selection invalidates a prior confirmation.
      return { ...r, postingDays, daysConfirmed: false };
    }));
  }

  // Explicit per-row confirmation of the final posting-day selection.
  function confirmDays(rowId: string) {
    setRows((prev) => prev.map((r) => (r._rowId === rowId ? { ...r, daysConfirmed: true } : r)));
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

    // Guard: posting days must be EXPLICITLY CONFIRMED by the user. AI-extracted days
    // are only a suggestion; a confident-but-wrong day cannot be saved until the user
    // confirms the final selection (and re-confirms after any change).
    const unconfirmed = approved.filter((r) => !r.daysConfirmed);
    if (unconfirmed.length > 0) {
      setError(`Confirm the posting days for: ${unconfirmed.map((r) => r.name.trim() || 'Unnamed group').join(', ')}`);
      return;
    }

    // Guard: a VALID Facebook group URL is REQUIRED before saving — Copy & Open relies
    // on it to open the correct group. Validate+normalize each approved row's link.
    const normalizedByRow = new Map<string, string>();
    const badUrl: string[] = [];
    for (const r of approved) {
      const res = normalizeFacebookGroupUrl(r.link);
      if (res.ok && res.url) normalizedByRow.set(r._rowId, res.url);
      else badUrl.push(r.name.trim() || 'Unnamed group');
    }
    if (badUrl.length > 0) {
      setError(`Paste a valid Facebook group link (…/groups/…) for: ${badUrl.join(', ')}`);
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
          link: normalizedByRow.get(r._rowId) as string, // validated + normalized URL
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

  const approvedRows = rows.filter((r) => r.approved && r.name.trim());
  const approvedCount = approvedRows.length;
  // All approved groups must have their posting days explicitly confirmed before save.
  const allDaysConfirmed = approvedRows.every((r) => r.daysConfirmed);

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

            {/* Paste target — Win+Shift+S then Ctrl+V, or choose files */}
            <div className="w-full text-center py-4 border-2 border-dashed border-amber-500/40 rounded-lg bg-black/20">
              <p className="text-sm font-medium text-amber-300">📋 Paste screenshots here (Ctrl + V)</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Snap with <span className="text-slate-200">Windows + Shift + S</span>, come back, then press <span className="text-slate-200">Ctrl + V</span>
              </p>
              <label className="inline-block mt-2 px-3 py-1.5 bg-amber-500/15 border border-amber-500/40 rounded-lg cursor-pointer hover:bg-amber-500/25 text-amber-200 text-xs font-medium">
                …or choose files
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={onPick} />
              </label>
            </div>

            {/* Thumbnail previews (pasted + uploaded combined) with remove */}
            {files.length > 0 && (
              <div>
                <p className="text-[11px] text-slate-400 mb-1.5">{files.length}/{MAX_IMAGES} image{files.length !== 1 ? 's' : ''} ready</p>
                <div className="grid grid-cols-4 gap-2">
                  {files.map((f, i) => (
                    <div key={`${f.name}-${f.size}-${i}`} className="relative group">
                      <img
                        src={previews[i]}
                        alt={f.name || `screenshot ${i + 1}`}
                        className="w-full h-16 object-cover rounded-lg border border-white/10"
                      />
                      <button
                        onClick={() => removeFile(i)}
                        aria-label={`Remove ${f.name || 'screenshot'}`}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold shadow hover:bg-red-400"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
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
                    placeholder="Facebook group link — required (…/groups/…)"
                    aria-label="Facebook group link (required)"
                    className={`w-full px-2 py-1.5 bg-white/5 border rounded text-white text-xs placeholder-slate-500 ${
                      r.approved && !r.link.trim() ? 'border-red-500/60' : 'border-white/10'
                    }`}
                  />
                  {r.approved && !r.link.trim() && (
                    <p className="text-[10px] text-red-400">Paste the group link so Copy &amp; Open can open it. We couldn't read it from the screenshot.</p>
                  )}

                  {r.warning && (
                    <p className="text-[10px] text-amber-400">⚠️ {r.warning}</p>
                  )}

                  {/* Prominent extracted-rules panel shown next to the day picker so the
                      user can verify the selected days match what the group actually
                      allows (addresses confident-but-wrong AI day selection). */}
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 space-y-0.5">
                    <p className="text-[10px] font-bold text-amber-300">📋 Extracted rules — check these before confirming days</p>
                    {r.restrictions
                      ? <p className="text-[11px] text-slate-200 leading-snug">{r.restrictions}</p>
                      : <p className="text-[11px] text-slate-400 italic">No specific rules text was read — set the days from the group’s own rules.</p>}
                    {r.frequencyLimit && <p className="text-[10px] text-slate-300">Frequency: {r.frequencyLimit}</p>}
                  </div>

                  {/* Day picker */}
                  <p className="text-[10px] text-slate-400">Allowed posting days (AI suggestion — confirm below):</p>
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
                      onChange={(e) => updateRow(r._rowId, { anyday: e.target.checked, postingDays: e.target.checked ? [] : r.postingDays, daysConfirmed: false })}
                      className="w-4 h-4 rounded accent-amber-500"
                    />
                  </label>

                  {/* Explicit per-row day confirmation. Required before saving; resets
                      whenever the day selection or Any-Day changes. */}
                  {r.approved && (
                    r.daysConfirmed ? (
                      <div className="flex items-center justify-between rounded-lg border border-green-500/40 bg-green-500/10 px-2 py-1.5">
                        <span className="text-[11px] font-medium text-green-300">✓ Days confirmed</span>
                        <button
                          onClick={() => updateRow(r._rowId, { daysConfirmed: false })}
                          className="text-[10px] text-slate-400 hover:text-white underline"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => confirmDays(r._rowId)}
                        disabled={!r.anyday && r.postingDays.length === 0}
                        aria-label={`Confirm posting days for ${r.name.trim() || 'group'}`}
                        className="w-full py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-200 text-[11px] font-bold hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Confirm posting days
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10 space-y-2 shrink-0">
          <button
            onClick={saveApproved}
            disabled={rows.length === 0 || approvedCount === 0 || !allDaysConfirmed || saving}
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
