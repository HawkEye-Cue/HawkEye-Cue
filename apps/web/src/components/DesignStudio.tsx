/**
 * DesignStudio — Canva-inspired design editor (Fabric.js 6) with Phase 2 AI photo editing.
 *
 * Phase 1 defects fixed here (found during validation):
 *   1. Scaling: the raw <canvas> was CSS-resized while Fabric kept a 1080px internal size, so
 *      clicks/drags landed in the wrong place and the canvas overflowed on mobile. Now we use
 *      Fabric's setDimensions() (display px) + setZoom() (logical 1080 grid), responsive.
 *   2. Serialization: undo/redo used toJSON(), which in Fabric 6 drops our custom `data` role
 *      tags — after one undo, Apply Brand / layer select / Wingman couldn't find layers. Now
 *      everything serializes with toObject(EXTRA_PROPS). (Proven in fabricSerialization.test.)
 *   3. Save / Reopen / Duplicate did not exist (Workflow D). Now backed by designDocument.
 *   4. The Brand sidebar fields were inert stubs. Now real controlled inputs that persist.
 *
 * Phase 2:
 *   • "Ask Wingman to Edit" — routes each instruction via classifyEditIntent():
 *       canvas edits (text size/color, background, move, logo) apply INSTANTLY at ZERO AI cost
 *       and stay editable; photo edits (remove/add/replace objects, background removal,
 *       relighting) go to the AI image editor (paid plans, server-enforced).
 *   • The ORIGINAL photo is preserved; every AI edit is a new revision with undo/redo and
 *     "Restore original".
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { DesignTemplate } from '../lib/designTemplates';
import { type BrandKit, saveBrandKit } from '../lib/brandKit';
import { EXTRA_PROPS, saveDesign, duplicateDesign, newDesignId, type DesignDocument } from '../lib/designDocument';
import { classifyEditIntent, type CanvasAction } from '../lib/wingmanEditIntent';
import {
  startRevisions, addAiRevision, undoAi, redoAi, restoreOriginal, canUndoAi, canRedoAi,
  currentRevision, type RevisionState,
} from '../lib/photoRevisions';
import { prepareImageForEdit } from '../lib/prepareEditImage';

interface DesignStudioProps {
  template: DesignTemplate;
  brandKit: BrandKit;
  /** user identity — scopes saved designs + brand kit to this account */
  sub: string | undefined;
  /** reopen an existing saved design instead of starting from the template */
  initialDesign?: DesignDocument | null;
  /** a photo the user uploaded to edit — loaded as the ORIGINAL revision on open */
  initialPhoto?: string | null;
  /** whether the user's plan includes AI photo editing (server re-checks regardless) */
  canUseAiImage: boolean;
  /** performs the AI photo edit; returns the edited image data URL */
  onEditPhoto: (image: string, instruction: string) => Promise<string>;
  /** persist the design to the account (cross-device). Resolves true on success. If omitted,
   *  the studio falls back to local save. */
  onCloudSave?: (args: { id: string; name: string; templateId: string; width: number; height: number; canvasJson: unknown; thumbnailDataUrl?: string | null; createdAt?: number }) => Promise<boolean>;
  onUseInPost: (dataUrl: string) => void;
  /** persist Brand Kit edits (cloud). May be async. */
  onBrandKitChange: (kit: BrandKit) => void | Promise<void>;
  onClose: () => void;
}

// Only the photo layer is replaced by AI edits; every other layer stays an editable vector.
const PHOTO_LAYER_ID = 'user-photo';

function appliedText(layer: { text?: string; isBrandSlot?: boolean; isPhoneSlot?: boolean }, kit: BrandKit) {
  if (layer.isPhoneSlot && kit.phone) return kit.phone;
  if (layer.isBrandSlot && !layer.isPhoneSlot && kit.companyName) return kit.companyName;
  return layer.text || '';
}

export default function DesignStudio({
  template, brandKit, sub, initialDesign, initialPhoto, canUseAiImage, onEditPhoto, onCloudSave, onUseInPost,
  onBrandKitChange, onClose,
}: DesignStudioProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'info' | 'ok' | 'error'; text: string } | null>(null);
  const [bgColor, setBgColor] = useState(template.background);
  const [kit, setKit] = useState<BrandKit>(brandKit);
  const [panel, setPanel] = useState<'wingman' | 'brand' | 'layers'>('wingman');
  const [instruction, setInstruction] = useState('');
  const [revisions, setRevisions] = useState<RevisionState | null>(null);
  const [designId, setDesignId] = useState<string>(initialDesign?.id || newDesignId());
  const [designName, setDesignName] = useState<string>(initialDesign?.name || template.name);
  const [pendingPhotoEdit, setPendingPhotoEdit] = useState<string | null>(null);
  const [savingDesign, setSavingDesign] = useState(false);
  const brandSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Undo/redo for CANVAS edits (separate from AI photo revisions) ──────────────
  const history = useRef<string[]>([]);
  const historyIdx = useRef(-1);
  const restoring = useRef(false);

  const snapshot = useCallback(() => {
    const fc = fabricRef.current;
    if (!fc || restoring.current) return;
    // FIX (defect 2): toObject(EXTRA_PROPS), never toJSON(), so role tags survive undo.
    const json = JSON.stringify(fc.toObject([...EXTRA_PROPS]));
    history.current = history.current.slice(0, historyIdx.current + 1);
    if (history.current[history.current.length - 1] === json) return;
    history.current.push(json);
    if (history.current.length > 40) history.current.shift();
    historyIdx.current = history.current.length - 1;
  }, []);

  const restoreFrom = useCallback(async (json: string) => {
    const fc = fabricRef.current;
    if (!fc) return;
    restoring.current = true;
    try {
      await fc.loadFromJSON(JSON.parse(json));
      setBgColor(String(fc.backgroundColor || template.background));
      fc.requestRenderAll();
    } finally {
      restoring.current = false;
    }
  }, [template.background]);

  const undo = useCallback(async () => {
    if (historyIdx.current <= 0) return;
    historyIdx.current -= 1;
    await restoreFrom(history.current[historyIdx.current]);
  }, [restoreFrom]);

  const redo = useCallback(async () => {
    if (historyIdx.current >= history.current.length - 1) return;
    historyIdx.current += 1;
    await restoreFrom(history.current[historyIdx.current]);
  }, [restoreFrom]);

  // ── FIX (defect 1): responsive sizing via Fabric zoom, not CSS on the raw canvas ──
  const fitToStage = useCallback(() => {
    const fc = fabricRef.current;
    const stage = stageRef.current;
    if (!fc || !stage) return;
    const pad = 24;
    const availW = Math.max(160, stage.clientWidth - pad);
    const availH = Math.max(160, stage.clientHeight - pad);
    const zoom = Math.min(availW / template.width, availH / template.height, 1);
    fc.setDimensions({ width: Math.round(template.width * zoom), height: Math.round(template.height * zoom) });
    fc.setZoom(zoom);
    fc.requestRenderAll();
  }, [template.width, template.height]);

  // ── Build the canvas (from a saved design, or from the template) ──────────────
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;

    (async () => {
      const { Canvas, Rect, Textbox, FabricImage } = await import('fabric');
      if (cancelled || !canvasRef.current) return;

      const fc = new Canvas(canvasRef.current, {
        width: template.width,
        height: template.height,
        backgroundColor: template.background,
        preserveObjectStacking: true,
      });
      fabricRef.current = fc;

      if (initialDesign?.canvasJson) {
        // Reopen an existing editable design (Workflow D).
        await fc.loadFromJSON(initialDesign.canvasJson as any);
        setBgColor(String(fc.backgroundColor || template.background));
      } else {
        for (const layer of template.layers) {
          if (layer.type === 'rect') {
            fc.add(new Rect({
              left: layer.left ?? 0, top: layer.top ?? 0,
              width: layer.width ?? template.width, height: layer.height ?? 40,
              fill: layer.backgroundColor ?? layer.fill ?? '#000000',
              selectable: !layer.isPlaceholder, hasControls: !layer.isPlaceholder,
              data: { id: layer.id, isPlaceholder: !!layer.isPlaceholder, isLogoSlot: !!layer.isLogoSlot },
            } as any));
          } else if (layer.type === 'text') {
            const editable = layer.isEditable !== false;
            fc.add(new Textbox(appliedText(layer, brandKit), {
              left: layer.left ?? 0, top: layer.top ?? 0,
              width: layer.width ?? template.width - (layer.left ?? 80) * 2,
              fontFamily: layer.fontFamily ?? 'Arial', fontSize: layer.fontSize ?? 40,
              fontWeight: layer.fontWeight ?? 'normal', fill: layer.fill ?? '#ffffff',
              textAlign: layer.textAlign ?? 'left',
              selectable: editable, editable,
              data: {
                id: layer.id, isHeadline: !!layer.isHeadline, isSubtext: !!layer.isSubtext,
                isBrandSlot: !!layer.isBrandSlot, isPhoneSlot: !!layer.isPhoneSlot,
              },
            } as any));
          } else if (layer.type === 'image' && layer.src) {
            try {
              const img = await FabricImage.fromURL(layer.src, { crossOrigin: 'anonymous' });
              img.set({ left: layer.left ?? 0, top: layer.top ?? 0, scaleX: layer.scaleX ?? 1, scaleY: layer.scaleY ?? 1, data: { id: layer.id } } as any);
              fc.add(img);
            } catch { /* skip broken image */ }
          }
        }
        if (brandKit.logoDataUrl) await placeLogo(fc, FabricImage, brandKit.logoDataUrl);
      }

      fc.on('object:modified', snapshot);
      fc.on('object:added', snapshot);
      fc.on('object:removed', snapshot);
      fc.on('text:changed', snapshot);

      fitToStage();
      if (stageRef.current && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => fitToStage());
        ro.observe(stageRef.current);
      }
      snapshot();
      if (!cancelled) setReady(true);
    })().catch((e) => {
      console.error('[DesignStudio] failed to build canvas', e);
      setStatus({ kind: 'error', text: 'The editor could not load. Please close and try again.' });
    });

    return () => {
      cancelled = true;
      ro?.disconnect();
      try { fabricRef.current?.dispose(); } catch { /* ignore */ }
      fabricRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard undo/redo: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo. Ignored while the
  // user is typing in an input/textarea or editing text ON the canvas (so native text undo wins).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      const editingCanvasText = !!fabricRef.current?.getActiveObject?.()?.isEditing;
      if (typing || editingCanvasText) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); void undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); void redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Load a user-uploaded photo (Workflow C) as the ORIGINAL revision once the canvas is ready.
  const initialPhotoLoaded = useRef(false);
  useEffect(() => {
    if (!ready || !initialPhoto || initialPhotoLoaded.current) return;
    initialPhotoLoaded.current = true;
    setPhoto(initialPhoto, { asOriginal: true })
      .then(() => { snapshot(); setStatus({ kind: 'ok', text: 'Photo loaded. Tell Wingman what to change, then customize your design.' }); })
      .catch(() => setStatus({ kind: 'error', text: 'Could not load that photo.' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, initialPhoto]);

  // ── Helpers to find layers by role tag ────────────────────────────────────────
  const objs = () => (fabricRef.current?.getObjects() || []) as any[];
  const byRole = (role: string) => objs().filter((o) => o.data?.[role]);
  const photoObj = () => objs().find((o) => o.data?.id === PHOTO_LAYER_ID);

  async function placeLogo(fc: any, FabricImage: any, src: string) {
    const slot = template.layers.find((l) => l.isLogoSlot);
    const img = await FabricImage.fromURL(src);
    const tw = slot?.width ?? 180, th = slot?.height ?? 180;
    const s = Math.min(tw / (img.width || tw), th / (img.height || th));
    const left = slot?.left ?? template.width - tw - 40;
    const top = slot?.top ?? template.height - th - 40;
    img.set({ left, top, scaleX: s, scaleY: s, data: { id: `logo-${Date.now()}`, isLogo: true } });
    const placeholder = fc.getObjects().find((o: any) => o.data?.isLogoSlot);
    if (placeholder) fc.remove(placeholder);
    fc.add(img);
  }

  // ── Photo upload (becomes the ORIGINAL revision) ──────────────────────────────
  async function setPhoto(src: string, { asOriginal }: { asOriginal: boolean }) {
    const fc = fabricRef.current;
    if (!fc) return;
    const { FabricImage } = await import('fabric');
    const img = await FabricImage.fromURL(src, { crossOrigin: 'anonymous' });
    const existing = photoObj();
    const ph = existing || objs().find((o) => o.data?.isPlaceholder);
    // Fit into the placeholder (or existing photo slot), else cover the canvas.
    const box = ph
      ? { left: ph.left, top: ph.top, w: ph.width * (ph.scaleX || 1), h: ph.height * (ph.scaleY || 1) }
      : { left: 0, top: 0, w: template.width, h: template.height };
    const s = Math.max(box.w / (img.width || box.w), box.h / (img.height || box.h));
    img.set({ left: box.left, top: box.top, scaleX: s, scaleY: s, data: { id: PHOTO_LAYER_ID, isPhoto: true } } as any);
    // FIX (invisible photo): previously inserted at index 0 — BENEATH the template's opaque
    // full-bleed `bg` rect — so the photo was completely hidden. Now: replace the placeholder /
    // existing photo in place, otherwise sit directly ABOVE the background so the photo shows
    // while all text, shapes, and brand layers stay on top and editable.
    const all = fc.getObjects();
    const bgIdx = all.findIndex((o: any) => o.data?.id === 'bg');
    const idx = ph ? all.indexOf(ph) : bgIdx + 1; // bgIdx -1 → 0 when a template has no bg rect
    if (ph) fc.remove(ph);
    fc.insertAt(Math.max(0, idx), img);
    // Legibility: template text is styled for a dark background. When a photo goes FULL-BLEED
    // behind it (no placeholder slot, first placement), add a dark scrim between photo and text.
    // It's an ordinary layer the user can select and delete. Not re-added on photo replacement.
    if (!ph && !fc.getObjects().some((o: any) => o.data?.id === 'photo-scrim')) {
      const { Rect } = await import('fabric');
      fc.insertAt(Math.max(0, idx) + 1, new Rect({
        left: 0, top: 0, width: template.width, height: template.height,
        fill: 'rgba(0,0,0,0.45)', data: { id: 'photo-scrim' },
      } as any));
    }
    // The "📸 Add your photo" hint text must not sit on top of the real photo.
    fc.getObjects().filter((o: any) => o.data?.id === 'photo-hint').forEach((o: any) => fc.remove(o));
    fc.requestRenderAll();
    if (asOriginal) setRevisions(startRevisions(src)); // ORIGINAL preserved immutably
  }

  async function handleUpload(file: File) {
    if (!file.type.startsWith('image/')) { setStatus({ kind: 'error', text: 'Please choose an image file.' }); return; }
    const url = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => rej(new Error('read failed'));
      r.readAsDataURL(file);
    });
    await setPhoto(url, { asOriginal: true });
    setStatus({ kind: 'ok', text: 'Photo added. Ask Wingman to edit it, or keep designing.' });
  }

  // ── Apply deterministic canvas actions (ZERO AI cost) ─────────────────────────
  async function applyCanvasActions(actions: CanvasAction[]) {
    const fc = fabricRef.current;
    if (!fc) return;
    const texts = () => objs().filter((o) => o.type === 'textbox' || o.type === 'i-text' || o.type === 'text');
    for (const a of actions) {
      if (a.kind === 'resizeText') {
        const targets = a.target === 'headline' ? byRole('isHeadline') : texts();
        (targets.length ? targets : texts()).forEach((o) => o.set('fontSize', Math.max(8, Math.round(o.fontSize * a.factor))));
      } else if (a.kind === 'setBackground') {
        fc.backgroundColor = a.color; setBgColor(a.color);
        // Also recolor a full-bleed background rect, if the template uses one.
        objs().filter((o) => o.data?.id === 'bg').forEach((o) => o.set('fill', a.color));
      } else if (a.kind === 'setTextColor') {
        const targets = a.target === 'headline' ? byRole('isHeadline') : texts();
        targets.forEach((o) => o.set('fill', a.color));
      } else if (a.kind === 'moveText') {
        const targets = a.target === 'phone' ? byRole('isPhoneSlot') : byRole('isHeadline');
        targets.forEach((o) => {
          const h = (o.height || 0) * (o.scaleY || 1);
          o.set('top', a.to === 'bottom' ? template.height - h - 60 : 60);
          o.setCoords();
        });
      } else if (a.kind === 'addLogo') {
        if (!kit.logoDataUrl) { setStatus({ kind: 'error', text: 'Add your logo in the Brand tab first.' }); setPanel('brand'); return; }
        const { FabricImage } = await import('fabric');
        await placeLogo(fc, FabricImage, kit.logoDataUrl);
      } else if (a.kind === 'applyBrand') {
        applyBrand(kit);
      }
    }
    fc.requestRenderAll();
    snapshot();
  }

  function applyBrand(k: BrandKit) {
    const fc = fabricRef.current;
    if (!fc) return;
    let changed = 0;
    objs().forEach((o) => {
      if (o.data?.isPhoneSlot && k.phone) { o.set('text', k.phone); changed++; }
      else if (o.data?.isBrandSlot && !o.data?.isPhoneSlot && k.companyName) { o.set('text', k.companyName); changed++; }
    });
    fc.requestRenderAll();
    snapshot();
    // Never invent missing business info — tell the user what's missing instead.
    if (!k.companyName && !k.phone) setStatus({ kind: 'info', text: 'Add your company name and phone in the Brand tab to auto-fill them.' });
    else setStatus({ kind: 'ok', text: changed ? 'Applied your brand.' : 'No brand fields on this design to fill.' });
  }

  // ── Ask Wingman to Edit ───────────────────────────────────────────────────────
  async function runWingman(text = instruction) {
    const intent = classifyEditIntent(text);
    setPendingPhotoEdit(null);
    if (intent.route === 'canvas') {
      await applyCanvasActions(intent.actions);
      setStatus({ kind: 'ok', text: `${intent.summary} — instant, no AI credits used.` });
      setInstruction('');
      return;
    }
    if (intent.route === 'unknown') {
      // Don't spend AI credits on a guess — offer to send it to the photo editor explicitly.
      setStatus({ kind: 'info', text: intent.summary });
      if (photoObj() && canUseAiImage) setPendingPhotoEdit(text);
      return;
    }
    await runPhotoEdit(intent.instruction);
  }

  async function runPhotoEdit(text: string) {
    setPendingPhotoEdit(null);
    if (!revisions) { setStatus({ kind: 'error', text: 'Add a photo first — then tell Wingman what to change in it.' }); return; }
    if (!canUseAiImage) { setStatus({ kind: 'error', text: 'AI photo editing is included with Soar and Summit plans.' }); return; }
    setBusy(true);
    setStatus({ kind: 'info', text: 'Wingman is editing your photo… (about 20 seconds)' });
    try {
      // Edit the CURRENT revision so edits can build on each other; original stays intact.
      const prepared = await prepareImageForEdit(currentRevision(revisions).src);
      const edited = await onEditPhoto(prepared, text);
      const next = addAiRevision(revisions, edited, text);
      setRevisions(next);
      await setPhoto(edited, { asOriginal: false });
      snapshot();
      setStatus({ kind: 'ok', text: 'Done! Your original is saved — use Undo AI edit or Restore original anytime.' });
      setInstruction('');
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'The photo edit failed. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function showRevision(next: RevisionState) {
    setRevisions(next);
    await setPhoto(currentRevision(next).src, { asOriginal: false });
    snapshot();
  }

  // ── Save / Duplicate / Export ─────────────────────────────────────────────────
  function buildDoc(id: string, name: string): DesignDocument {
    const fc = fabricRef.current;
    const now = Date.now();
    return {
      id, name, templateId: template.id, width: template.width, height: template.height,
      canvasJson: fc.toObject([...EXTRA_PROPS]),
      thumbnail: fc.toDataURL({ format: 'jpeg', quality: 0.6, multiplier: 160 / template.width / fc.getZoom() }),
      createdAt: initialDesign?.createdAt || now,
      updatedAt: now,
    };
  }

  // Save to the ACCOUNT (cross-device) when onCloudSave is provided; fall back to local storage
  // if it's absent or the cloud save fails (so work is never lost even offline).
  async function persist(doc: DesignDocument): Promise<boolean> {
    if (onCloudSave) {
      try {
        await onCloudSave({
          id: doc.id, name: doc.name, templateId: doc.templateId, width: doc.width, height: doc.height,
          canvasJson: doc.canvasJson, thumbnailDataUrl: doc.thumbnail, createdAt: doc.createdAt,
        });
        // Mirror locally too, as an offline fallback.
        saveDesign(sub, doc);
        return true;
      } catch (e) {
        const local = saveDesign(sub, doc);
        setStatus({ kind: local.ok ? 'info' : 'error', text: local.ok
          ? 'Saved on this device — could not reach the cloud. It will sync next time you open Create online.'
          : (e instanceof Error ? e.message : 'Could not save this design.') });
        return local.ok;
      }
    }
    const r = saveDesign(sub, doc);
    if (!r.ok) setStatus({ kind: 'error', text: r.reason === 'quota'
      ? 'Not enough browser storage to save this design (photos are large). Download it instead, or delete older designs.'
      : 'Could not save this design.' });
    return r.ok;
  }

  async function handleSave() {
    if (!fabricRef.current || savingDesign) return;
    setSavingDesign(true);
    try {
      const ok = await persist(buildDoc(designId, designName.trim() || template.name));
      if (ok) setStatus({ kind: 'ok', text: 'Design saved to your account. Reopen it on any device from My Designs.' });
    } finally { setSavingDesign(false); }
  }

  async function handleDuplicate() {
    if (!fabricRef.current || savingDesign) return;
    setSavingDesign(true);
    try {
      const copy = duplicateDesign(buildDoc(designId, designName));
      const ok = await persist(copy);
      if (ok) { setDesignId(copy.id); setDesignName(copy.name); setStatus({ kind: 'ok', text: `Saved a copy: ${copy.name}` }); }
    } finally { setSavingDesign(false); }
  }

  // Export at full logical resolution regardless of on-screen zoom.
  function exportPng(format: 'png' | 'jpeg' = 'png'): string | null {
    const fc = fabricRef.current;
    if (!fc) return null;
    fc.discardActiveObject();
    fc.requestRenderAll();
    return fc.toDataURL({ format, quality: 0.92, multiplier: 1 / fc.getZoom() });
  }

  function handleDownload(format: 'png' | 'jpeg') {
    const url = exportPng(format);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `hawkeye-design-${Date.now()}.${format === 'jpeg' ? 'jpg' : 'png'}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function handleUseInPost() {
    const url = exportPng('png');
    if (!url) return;
    onUseInPost(url);
    onClose();
  }

  async function addText() {
    const { Textbox } = await import('fabric');
    const fc = fabricRef.current;
    if (!fc) return;
    const tb = new Textbox('Your text here', {
      left: 80, top: 200, width: template.width - 160, fontFamily: 'Arial', fontSize: 56, fill: '#ffffff',
      data: { id: `text-${Date.now()}` },
    } as any);
    fc.add(tb); fc.setActiveObject(tb); fc.requestRenderAll();
  }

  function deleteSelected() {
    const fc = fabricRef.current;
    const obj = fc?.getActiveObject();
    if (!obj) return;
    fc.remove(obj); fc.discardActiveObject(); fc.requestRenderAll();
  }

  function updateKit(patch: Partial<BrandKit>) {
    const next = { ...kit, ...patch };
    setKit(next);
    saveBrandKit(sub, next); // local mirror (instant, offline fallback)
    // Persist to the account, debounced so typing doesn't fire a request per keystroke. A logo
    // change (data URL) flushes immediately since it's a single deliberate action.
    const isLogoChange = 'logoDataUrl' in patch;
    if (brandSaveTimer.current) clearTimeout(brandSaveTimer.current);
    const flush = () => { Promise.resolve(onBrandKitChange(next)).catch(() => { /* offline — local mirror kept */ }); };
    if (isLogoChange) flush();
    else brandSaveTimer.current = setTimeout(flush, 800);
  }

  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const rev = revisions ? currentRevision(revisions) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 text-white" role="dialog" aria-modal="true" aria-label="Design Studio">
      {/* Top toolbar — a single horizontally-scrollable row on mobile (wrapping to 3 rows ate
          ~120px of vertical space and pushed the canvas off-screen), wraps freely on desktop. */}
      <div data-testid="studio-toolbar" className="flex flex-nowrap md:flex-wrap items-center gap-1.5 px-3 py-2 bg-black border-b border-white/10 shrink-0 overflow-x-auto [&>*]:shrink-0">
        <button
          onClick={() => {
            // Never silently abandon an in-flight AI edit: the request is already running (and
            // would still use a credit), so make the user confirm instead of losing the result.
            if (busy && !window.confirm('Wingman is still editing your photo. Leaving now will discard the result but the edit may still use an AI credit. Leave anyway?')) return;
            onClose();
          }}
          className="px-2 py-1.5 text-sm text-slate-300 hover:text-white"
          data-testid="studio-back"
        >
          ← Back to Post
        </button>
        <input
          aria-label="Design name"
          value={designName}
          onChange={(e) => setDesignName(e.target.value)}
          className="w-36 sm:w-48 px-2 py-1 bg-white/5 border border-white/10 rounded text-sm focus:border-amber-500/60 focus:outline-none"
        />
        <button onClick={undo} disabled={!ready} aria-label="Undo" className="px-2.5 py-1.5 text-xs bg-white/5 border border-white/10 rounded hover:bg-white/10 disabled:opacity-40">↩ Undo</button>
        <button onClick={redo} disabled={!ready} aria-label="Redo" className="px-2.5 py-1.5 text-xs bg-white/5 border border-white/10 rounded hover:bg-white/10 disabled:opacity-40">↪ Redo</button>
        <div className="flex-1" />
        <button onClick={handleSave} disabled={!ready || savingDesign} className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded hover:bg-white/10 disabled:opacity-40">{savingDesign ? '💾 Saving…' : '💾 Save'}</button>
        <button onClick={handleDuplicate} disabled={!ready || savingDesign} className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded hover:bg-white/10 disabled:opacity-40">⧉ Duplicate</button>
        <button onClick={() => handleDownload('png')} disabled={!ready} className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded hover:bg-white/10 disabled:opacity-40">⬇ PNG</button>
        <button onClick={() => handleDownload('jpeg')} disabled={!ready} className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded hover:bg-white/10 disabled:opacity-40">⬇ JPG</button>
        <button onClick={handleUseInPost} disabled={!ready || busy} className="px-4 py-1.5 text-xs font-bold bg-amber-500 text-black rounded hover:opacity-90 disabled:opacity-40">✓ Use in Post</button>
      </div>

      {/* Body — stacks vertically on mobile, side panel on desktop.
          FIX (mobile clipping): on mobile the stage has a FIXED height and the panel takes the
          remaining space with its OWN scroll. Previously min-h stage + max-h panel exceeded the
          screen, so focusing a field scrolled this container and slid the canvas under the
          toolbar. min-h-0 lets the flex children shrink instead of overflowing. */}
      <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-hidden">
        {/* Canvas stage */}
        <div ref={stageRef} data-testid="studio-stage" className="relative h-[42vh] shrink-0 md:h-auto md:flex-1 md:shrink flex items-center justify-center bg-zinc-800 overflow-hidden p-3">
          {!ready && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Loading editor…</p>
            </div>
          )}
          <div className="shadow-2xl shadow-black/70"><canvas ref={canvasRef} /></div>
          {busy && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="flex items-center gap-3 bg-black/80 border border-amber-500/40 rounded-xl px-4 py-3">
                <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Wingman is editing your photo…</span>
              </div>
            </div>
          )}
        </div>

        {/* Side panel */}
        <aside className="w-full md:w-80 flex-1 min-h-0 md:flex-none bg-zinc-900 border-t md:border-t-0 md:border-l border-white/10 flex flex-col">
          <div className="flex border-b border-white/10 text-xs" role="tablist">
            {(['wingman', 'brand', 'layers'] as const).map((p) => (
              <button key={p} role="tab" aria-selected={panel === p} onClick={() => setPanel(p)}
                className={`flex-1 py-2.5 font-semibold capitalize ${panel === p ? 'text-amber-300 border-b-2 border-amber-500' : 'text-slate-400 hover:text-white'}`}>
                {p === 'wingman' ? '🦅 Wingman' : p === 'brand' ? '🏷 Brand' : '☰ Layers'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {status && (
              <div role="status" className={`text-xs rounded-lg px-3 py-2 border ${status.kind === 'error' ? 'bg-red-950/40 border-red-500/40 text-red-300' : status.kind === 'ok' ? 'bg-green-950/40 border-green-500/40 text-green-300' : 'bg-white/5 border-white/10 text-slate-300'}`}>
                {status.text}
              </div>
            )}

            {panel === 'wingman' && (
              <>
                {/* Photo */}
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Photo</p>
                  <button onClick={() => fileRef.current?.click()} className="w-full py-2 text-xs bg-white/5 border border-white/10 rounded-lg hover:bg-white/10">
                    {rev ? '🖼 Replace photo' : '🖼 Upload a photo'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
                  {revisions && (
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => showRevision(undoAi(revisions))} disabled={!canUndoAi(revisions) || busy}
                        className="flex-1 py-1.5 text-[11px] bg-white/5 border border-white/10 rounded hover:bg-white/10 disabled:opacity-40">↩ Undo AI edit</button>
                      <button onClick={() => showRevision(redoAi(revisions))} disabled={!canRedoAi(revisions) || busy}
                        className="flex-1 py-1.5 text-[11px] bg-white/5 border border-white/10 rounded hover:bg-white/10 disabled:opacity-40">↪ Redo</button>
                      <button onClick={() => showRevision(restoreOriginal(revisions))} disabled={revisions.current === 0 || busy}
                        className="w-full py-1.5 text-[11px] bg-white/5 border border-white/10 rounded hover:bg-white/10 disabled:opacity-40">⟲ Restore original photo</button>
                      <p className="w-full text-[10px] text-slate-500">
                        {rev?.source === 'original' ? 'Showing your original photo.' : `Version ${revisions.current} of ${revisions.revisions.length - 1}: “${rev?.instruction}”`}
                      </p>
                    </div>
                  )}
                </div>

                {/* Ask Wingman */}
                <div className="space-y-2">
                  <label htmlFor="wingman-edit" className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold">Ask Wingman to Edit Your Design</label>
                  <textarea
                    id="wingman-edit"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value.slice(0, 1000))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && instruction.trim() && !busy) { e.preventDefault(); runWingman(); } }}
                    placeholder='e.g. "Make the headline bigger" or "Remove the trash cans"'
                    rows={3}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm placeholder-slate-500 resize-none focus:border-amber-500/60 focus:outline-none"
                  />
                  <button onClick={() => runWingman()} disabled={!instruction.trim() || busy || !ready}
                    className="w-full py-2.5 text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-black rounded-lg hover:opacity-90 disabled:opacity-40">
                    {busy ? 'Working…' : '✨ Ask Wingman'}
                  </button>
                  {pendingPhotoEdit && (
                    <button onClick={() => runPhotoEdit(pendingPhotoEdit)}
                      className="w-full py-2 text-xs bg-white/5 border border-amber-500/40 text-amber-300 rounded-lg hover:bg-amber-500/10">
                      Send “{pendingPhotoEdit.slice(0, 40)}” to the AI photo editor (uses 1 AI image)
                    </button>
                  )}
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Text, colors, layout and your logo change <strong className="text-slate-300">instantly and free</strong>. Changes to the photo itself (remove, add, replace) use AI
                    {canUseAiImage ? ' (1 AI image each).' : ' — available on Soar and Summit.'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {['Make the headline bigger', 'Change the background to black', 'Add my logo', 'Remove the background'].map((ex) => (
                      <button key={ex} onClick={() => setInstruction(ex)} className="px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded-full text-slate-300 hover:bg-white/10">{ex}</button>
                    ))}
                  </div>
                </div>

                {/* Quick design tools */}
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Design</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={addText} disabled={!ready} className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded hover:bg-white/10 disabled:opacity-40">+ Text</button>
                    <button onClick={deleteSelected} disabled={!ready} className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded hover:bg-white/10 disabled:opacity-40">🗑 Delete selected</button>
                    <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded cursor-pointer">
                      Background
                      <input type="color" value={bgColor} aria-label="Background color"
                        onChange={(e) => applyCanvasActions([{ kind: 'setBackground', color: e.target.value }])}
                        className="w-5 h-5 border-0 bg-transparent cursor-pointer" />
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-500">Double-click any text on the canvas to edit it. Drag to move; use the corner handles to resize or rotate.</p>
                </div>
              </>
            )}

            {panel === 'brand' && (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-400">Saved to your account on this device and used to auto-fill designs.</p>
                {([
                  ['companyName', 'Company name', 'Acme Roofing Co.'],
                  ['phone', 'Phone', '(555) 000-0000'],
                  ['website', 'Website', 'www.example.com'],
                  ['tagline', 'Tagline', 'Fast · Fair · Reliable'],
                ] as const).map(([k, label, ph]) => (
                  <div key={k}>
                    <label htmlFor={`bk-${k}`} className="block text-[10px] text-slate-400 mb-1">{label}</label>
                    <input id={`bk-${k}`} value={kit[k]} placeholder={ph}
                      onChange={(e) => updateKit({ [k]: e.target.value } as Partial<BrandKit>)}
                      className="w-full px-2.5 py-1.5 bg-white/5 border border-white/10 rounded text-xs placeholder-slate-600 focus:border-amber-500/50 focus:outline-none" />
                  </div>
                ))}
                <div className="flex gap-4">
                  {(['primaryColor', 'accentColor'] as const).map((k) => (
                    <label key={k} className="flex items-center gap-2 text-[10px] text-slate-400">
                      <input type="color" value={kit[k]} onChange={(e) => updateKit({ [k]: e.target.value } as Partial<BrandKit>)} className="w-6 h-6 border-0 bg-transparent" />
                      {k === 'primaryColor' ? 'Primary' : 'Accent'}
                    </label>
                  ))}
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 mb-1">Logo</p>
                  <div className="flex items-center gap-2">
                    {kit.logoDataUrl
                      ? <img src={kit.logoDataUrl} alt="Your logo" className="w-12 h-12 object-contain bg-white/5 border border-white/10 rounded" />
                      : <div className="w-12 h-12 rounded border border-dashed border-white/20 flex items-center justify-center text-[10px] text-slate-500">none</div>}
                    <button onClick={() => logoRef.current?.click()} className="text-xs text-amber-400 hover:text-amber-300">{kit.logoDataUrl ? 'Replace' : 'Upload'}</button>
                    {kit.logoDataUrl && <button onClick={() => updateKit({ logoDataUrl: null })} className="text-xs text-red-400 hover:text-red-300">Remove</button>}
                  </div>
                  <input ref={logoRef} type="file" accept="image/png,image/svg+xml,image/jpeg" className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) { const r = new FileReader(); r.onload = () => updateKit({ logoDataUrl: r.result as string }); r.readAsDataURL(f); }
                      e.target.value = '';
                    }} />
                </div>
                <button onClick={() => { applyBrand(kit); if (brandSaveTimer.current) clearTimeout(brandSaveTimer.current); Promise.resolve(onBrandKitChange(kit)).catch(() => {}); }} disabled={!ready}
                  className="w-full py-2 text-xs font-bold bg-amber-500 text-black rounded-lg hover:opacity-90 disabled:opacity-40">✓ Apply My Brand</button>
                <p className="text-[10px] text-slate-500">We only fill in details you've saved — we never invent business information.</p>
              </div>
            )}

            {panel === 'layers' && (
              <div className="space-y-1">
                {ready && objs().slice().reverse().map((o, i) => (
                  <button key={o.data?.id || i}
                    onClick={() => { fabricRef.current.setActiveObject(o); fabricRef.current.requestRenderAll(); }}
                    className="w-full text-left px-2 py-1.5 rounded text-[11px] text-slate-300 hover:bg-white/10 truncate">
                    {o.data?.isPhoto ? '🖼 Photo' : o.type === 'textbox' ? `𝐓 ${String(o.text).split('\n')[0].slice(0, 28)}` : o.data?.isLogo ? '🏷 Logo' : `▭ ${o.data?.id || 'Shape'}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
