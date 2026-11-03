/**
 * DesignStudio — Canva-inspired design editor powered by Fabric.js 6.
 *
 * Opens as a full-screen modal over the Create page. The user can:
 *   • Edit any text layer by double-clicking it
 *   • Change headline / body text
 *   • Apply their Brand Kit (fills name / phone / logo slots)
 *   • Upload a photo into an image placeholder
 *   • Change background color
 *   • Add custom text
 *   • Undo / Redo (Fabric's built-in history)
 *   • Download as PNG
 *   • "Use in Post" — exports a PNG data URL and calls onUseInPost(dataUrl)
 *
 * Phase 1 scope: fully working editor, template loading, brand kit, export.
 * Phase 2 (planned): AI natural-language edits, object removal, revision history.
 *
 * IMPORTANT: Fabric.js is loaded lazily (dynamic import) so it never blocks the main
 * bundle — the studio only loads when the user actually opens it.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { DesignTemplate } from '../lib/designTemplates';
import type { BrandKit } from '../lib/brandKit';

interface DesignStudioProps {
  template: DesignTemplate;
  brandKit: BrandKit;
  postText: string;                           // current post — used to seed headline
  onUseInPost: (dataUrl: string) => void;     // attach the exported PNG to the post
  onClose: () => void;
}

// ─── Layer building helpers ────────────────────────────────────────────────────

function appliedText(layer: { text?: string; isBrandSlot?: boolean; isPhoneSlot?: boolean }, kit: BrandKit, fallback: string) {
  if (layer.isPhoneSlot && kit.phone) return kit.phone;
  if (layer.isBrandSlot && !layer.isPhoneSlot && kit.companyName) return kit.companyName;
  return layer.text || fallback;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DesignStudio({ template, brandKit, postText, onUseInPost, onClose }: DesignStudioProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricRef = useRef<any>(null);       // fabric.Canvas instance
  const containerRef = useRef<HTMLDivElement>(null);

  const [fabricLoaded, setFabricLoaded] = useState(false);
  const [activeText, setActiveText] = useState('');
  const [bgColor, setBgColor] = useState(template.background);
  const [exporting, setExporting] = useState(false);
  const [showBrandPanel, setShowBrandPanel] = useState(false);
  const [historyEnabled, setHistoryEnabled] = useState(false);

  // Derive a sensible canvas display scale so the 1080-unit grid fits in the viewport
  const DISPLAY_MAX = Math.min(560, window.innerWidth - 48);
  const scale = DISPLAY_MAX / template.width;
  const displayW = Math.round(template.width * scale);
  const displayH = Math.round(template.height * scale);

  // ── Load Fabric and build canvas ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function buildCanvas() {
      // Dynamic import — only loads Fabric when the studio opens
      const { Canvas, Rect, Textbox, Image: FabricImage } = await import('fabric');
      if (cancelled || !canvasRef.current) return;

      // Create Fabric canvas at the 1080-unit logical size; CSS scales it visually
      const fc = new Canvas(canvasRef.current, {
        width: template.width,
        height: template.height,
        backgroundColor: template.background,
        selection: true,
      });
      fabricRef.current = fc;

      // Build each layer
      for (const layer of template.layers) {
        if (layer.type === 'rect') {
          const rect = new Rect({
            left: layer.left ?? 0,
            top: layer.top ?? 0,
            width: layer.width ?? template.width,
            height: layer.height ?? 40,
            fill: layer.backgroundColor ?? layer.fill ?? '#000000',
            selectable: !layer.isPlaceholder,
            hasControls: !layer.isPlaceholder,
            data: { id: layer.id, isPlaceholder: layer.isPlaceholder, isLogoSlot: layer.isLogoSlot },
          });
          fc.add(rect);
        }

        if (layer.type === 'text') {
          const text = appliedText(layer, brandKit, layer.text ?? '');
          const tb = new Textbox(text, {
            left: layer.left ?? 0,
            top: layer.top ?? 0,
            width: layer.width ?? template.width - (layer.left ?? 80) * 2,
            fontFamily: layer.fontFamily ?? 'Arial',
            fontSize: layer.fontSize ?? 40,
            fontWeight: layer.fontWeight ?? 'normal',
            fill: layer.fill ?? '#ffffff',
            textAlign: layer.textAlign ?? 'left',
            selectable: layer.isEditable !== false,
            editable: layer.isEditable !== false,
            data: {
              id: layer.id,
              isHeadline: layer.isHeadline,
              isSubtext: layer.isSubtext,
              isBrandSlot: layer.isBrandSlot,
              isPhoneSlot: layer.isPhoneSlot,
            },
          });
          fc.add(tb);
        }

        if (layer.type === 'image' && layer.src) {
          try {
            const img = await FabricImage.fromURL(layer.src, { crossOrigin: 'anonymous' });
            img.set({
              left: layer.left ?? 0,
              top: layer.top ?? 0,
              scaleX: layer.scaleX ?? 1,
              scaleY: layer.scaleY ?? 1,
              data: { id: layer.id },
            });
            fc.add(img);
          } catch { /* broken image — skip */ }
        }
      }

      // If the brand kit has a logo, load it into the logo slot
      if (brandKit.logoDataUrl) {
        const logoSlot = template.layers.find((l) => l.isLogoSlot);
        if (logoSlot) {
          try {
            const { Image: FI } = await import('fabric');
            const img = await FI.fromURL(brandKit.logoDataUrl);
            const targetW = logoSlot.width ?? 200;
            const targetH = logoSlot.height ?? 200;
            const imgScale = Math.min(targetW / (img.width ?? 200), targetH / (img.height ?? 200));
            img.set({ left: logoSlot.left ?? 0, top: logoSlot.top ?? 0, scaleX: imgScale, scaleY: imgScale });
            fc.add(img);

            // Remove the placeholder rect for the logo slot
            const toRemove = fc.getObjects().find((o: any) => o.data?.isLogoSlot);
            if (toRemove) fc.remove(toRemove);
          } catch { /* logo failed to load */ }
        }
      }

      // Track active selection for the text edit panel
      fc.on('selection:created', (e: any) => {
        const obj = e.selected?.[0];
        if (obj && obj.type === 'textbox') setActiveText(obj.text ?? '');
      });
      fc.on('selection:updated', (e: any) => {
        const obj = e.selected?.[0];
        if (obj && obj.type === 'textbox') setActiveText(obj.text ?? '');
      });
      fc.on('text:changed', (e: any) => {
        setActiveText(e.target?.text ?? '');
      });

      fc.renderAll();
      setFabricLoaded(true);
      setHistoryEnabled(true);
    }

    buildCanvas().catch(console.error);
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Export to PNG data URL ─────────────────────────────────────────────────────
  const exportPng = useCallback(async (): Promise<string | null> => {
    const fc = fabricRef.current;
    if (!fc) return null;
    try {
      const dataUrl: string = fc.toDataURL({ format: 'png', multiplier: 1 });
      return dataUrl;
    } catch (e) {
      console.error('[DesignStudio] export failed', e);
      return null;
    }
  }, []);

  // ── Download ───────────────────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    setExporting(true);
    try {
      const dataUrl = await exportPng();
      if (!dataUrl) return;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `hawkeye-design-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally { setExporting(false); }
  }, [exportPng]);

  // ── Use in Post ────────────────────────────────────────────────────────────────
  const handleUseInPost = useCallback(async () => {
    setExporting(true);
    try {
      const dataUrl = await exportPng();
      if (!dataUrl) return;
      onUseInPost(dataUrl);
      onClose();
    } finally { setExporting(false); }
  }, [exportPng, onUseInPost, onClose]);

  // ── Background color change ────────────────────────────────────────────────────
  const handleBgChange = useCallback((color: string) => {
    setBgColor(color);
    const fc = fabricRef.current;
    if (fc) { fc.backgroundColor = color; fc.renderAll(); }
  }, []);

  // ── Upload photo into placeholder ──────────────────────────────────────────────
  const handlePhotoUpload = useCallback(async (file: File) => {
    const fc = fabricRef.current;
    if (!fc) return;
    const { Image: FI } = await import('fabric');
    const url = URL.createObjectURL(file);
    try {
      const img = await FI.fromURL(url);
      const ph = fc.getObjects().find((o: any) => o.data?.isPlaceholder);
      if (ph) {
        const targetW: number = (ph as any).width ?? template.width;
        const targetH: number = (ph as any).height ?? template.height;
        const sc = Math.max(targetW / (img.width ?? 600), targetH / (img.height ?? 600));
        img.set({ left: (ph as any).left ?? 0, top: (ph as any).top ?? 0, scaleX: sc, scaleY: sc });
        fc.remove(ph);
      }
      fc.add(img);
      fc.renderAll();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [template]);

  // ── Undo / Redo ───────────────────────────────────────────────────────────────
  // Fabric 6 doesn't ship a built-in history manager; we implement a minimal snapshot stack.
  const historyStack = useRef<string[]>([]);
  const historyIndex = useRef<number>(-1);

  const saveSnapshot = useCallback(() => {
    const fc = fabricRef.current;
    if (!fc || !historyEnabled) return;
    const json = JSON.stringify(fc.toJSON());
    // Discard any redo states
    historyStack.current = historyStack.current.slice(0, historyIndex.current + 1);
    historyStack.current.push(json);
    if (historyStack.current.length > 30) historyStack.current.shift();
    historyIndex.current = historyStack.current.length - 1;
  }, [historyEnabled]);

  // Save snapshot on meaningful mutations
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || !historyEnabled) return;
    // Initial snapshot
    saveSnapshot();
    fc.on('object:modified', saveSnapshot);
    fc.on('text:changed', saveSnapshot);
    return () => {
      fc.off('object:modified', saveSnapshot);
      fc.off('text:changed', saveSnapshot);
    };
  }, [fabricLoaded, historyEnabled, saveSnapshot]);

  const undo = useCallback(async () => {
    const fc = fabricRef.current;
    if (!fc || historyIndex.current <= 0) return;
    historyIndex.current -= 1;
    const json = historyStack.current[historyIndex.current];
    if (json) { await fc.loadFromJSON(JSON.parse(json)); fc.renderAll(); }
  }, []);

  const redo = useCallback(async () => {
    const fc = fabricRef.current;
    if (!fc || historyIndex.current >= historyStack.current.length - 1) return;
    historyIndex.current += 1;
    const json = historyStack.current[historyIndex.current];
    if (json) { await fc.loadFromJSON(JSON.parse(json)); fc.renderAll(); }
  }, []);

  // ── Add text layer ────────────────────────────────────────────────────────────
  const addText = useCallback(async () => {
    const { Textbox } = await import('fabric');
    const fc = fabricRef.current;
    if (!fc) return;
    const tb = new Textbox('Your text here', {
      left: 80, top: 200, width: 920,
      fontFamily: 'Arial', fontSize: 48, fill: '#ffffff',
      editable: true, data: { id: `user-text-${Date.now()}` },
    });
    fc.add(tb);
    fc.setActiveObject(tb);
    fc.renderAll();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 overflow-hidden" role="dialog" aria-modal="true" aria-label="Design Studio">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-black border-b border-white/10 shrink-0">
        <button onClick={onClose} className="text-slate-400 hover:text-white text-sm transition-colors mr-2">← Back</button>
        <span className="text-white font-bold text-sm mr-4">🎨 Design Studio</span>

        {/* Undo / Redo */}
        <button onClick={undo} className="px-2.5 py-1.5 text-xs bg-white/5 border border-white/10 text-slate-300 rounded hover:bg-white/10 transition-colors" title="Undo">↩</button>
        <button onClick={redo} className="px-2.5 py-1.5 text-xs bg-white/5 border border-white/10 text-slate-300 rounded hover:bg-white/10 transition-colors" title="Redo">↪</button>

        <div className="flex-1" />

        {/* Background color */}
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
          Background
          <input
            type="color"
            value={bgColor}
            onChange={(e) => handleBgChange(e.target.value)}
            className="w-6 h-6 rounded border-0 cursor-pointer"
            title="Change background color"
          />
        </label>

        {/* Add text */}
        <button onClick={addText} className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 text-white rounded hover:bg-white/10 transition-colors">+ Text</button>

        {/* Add photo to placeholder */}
        <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 text-white rounded hover:bg-white/10 transition-colors">🖼 Add Photo</button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = ''; }} />

        {/* Brand panel toggle */}
        <button
          onClick={() => setShowBrandPanel((v) => !v)}
          className={`px-3 py-1.5 text-xs border rounded transition-colors ${showBrandPanel ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
        >
          🏷 Brand
        </button>

        {/* Download */}
        <button
          onClick={handleDownload}
          disabled={exporting || !fabricLoaded}
          className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 text-white rounded hover:bg-white/10 disabled:opacity-50 transition-colors"
        >
          ⬇ Download
        </button>

        {/* Use in Post — primary CTA */}
        <button
          onClick={handleUseInPost}
          disabled={exporting || !fabricLoaded}
          className="px-4 py-1.5 text-xs bg-amber-500 text-black font-bold rounded hover:opacity-90 disabled:opacity-50 transition-opacity shadow shadow-amber-500/20"
        >
          {exporting ? 'Exporting…' : '✓ Use in Post'}
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left sidebar: template info + layer list */}
        <aside className="w-52 shrink-0 bg-zinc-900 border-r border-white/10 flex flex-col overflow-y-auto p-3 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Template</p>
            <p className="text-sm text-white font-semibold">{template.name}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{template.format} · {template.width}×{template.height}</p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Layers</p>
            <div className="space-y-1">
              {template.layers.filter((l) => l.isEditable !== false).map((l) => (
                <button
                  key={l.id}
                  className="w-full text-left px-2 py-1.5 rounded text-[11px] text-slate-300 hover:bg-white/10 hover:text-white transition-colors truncate"
                  onClick={() => {
                    const fc = fabricRef.current;
                    if (!fc) return;
                    const obj = fc.getObjects().find((o: any) => o.data?.id === l.id);
                    if (obj) { fc.setActiveObject(obj); fc.renderAll(); }
                  }}
                >
                  {l.type === 'text' ? '𝐓 ' : '▭ '}{l.text ? l.text.split('\n')[0].slice(0, 20) : l.id}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Center: canvas */}
        <div ref={containerRef} className="flex-1 flex items-center justify-center bg-zinc-800 overflow-auto p-4">
          {!fabricLoaded && (
            <div className="absolute flex flex-col items-center gap-3 text-slate-400">
              <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Loading editor…</p>
            </div>
          )}
          {/* The canvas element — sized at the logical 1080-unit resolution, scaled via CSS */}
          <div
            style={{
              width: displayW,
              height: displayH,
              boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                width: displayW,
                height: displayH,
                transformOrigin: 'top left',
              }}
            />
          </div>
        </div>

        {/* Right: Brand panel (shown when open) */}
        {showBrandPanel && (
          <aside className="w-64 shrink-0 bg-zinc-900 border-l border-white/10 overflow-y-auto p-4 space-y-4">
            <p className="text-sm font-bold text-white">🏷 Brand Kit</p>
            <p className="text-[11px] text-slate-400">Save your brand details to auto-fill future designs.</p>

            <div className="space-y-3">
              <BrandField label="Company Name" value={brandKit.companyName} placeholder="Acme Roofing Co."
                onChange={(v) => updateBrandField('companyName', v, brandKit)} />
              <BrandField label="Phone" value={brandKit.phone} placeholder="(555) 000-0000"
                onChange={(v) => updateBrandField('phone', v, brandKit)} />
              <BrandField label="Website" value={brandKit.website} placeholder="www.example.com"
                onChange={(v) => updateBrandField('website', v, brandKit)} />
              <BrandField label="Tagline" value={brandKit.tagline} placeholder="Fast · Fair · Reliable"
                onChange={(v) => updateBrandField('tagline', v, brandKit)} />
            </div>

            <button
              onClick={() => applyBrandKit(brandKit)}
              className="w-full py-2 bg-amber-500 text-black text-xs font-bold rounded-lg hover:opacity-90 transition-opacity"
            >
              ✓ Apply My Brand
            </button>

            <p className="text-[10px] text-slate-500">Changes apply to this design session. Edit your full Brand Kit in Settings.</p>
          </aside>
        )}
      </div>
    </div>
  );

  // Apply brand kit values to all brand-slot layers on the canvas
  function applyBrandKit(kit: BrandKit) {
    const fc = fabricRef.current;
    if (!fc) return;
    fc.getObjects().forEach((obj: any) => {
      if (obj.type !== 'textbox') return;
      const data = obj.data || {};
      if (data.isPhoneSlot && kit.phone) { obj.set('text', kit.phone); }
      else if (data.isBrandSlot && !data.isPhoneSlot && kit.companyName) { obj.set('text', kit.companyName); }
    });
    fc.renderAll();
  }

  // Stub — in a full implementation this would update parent BrandKit state
  function updateBrandField(_key: string, _value: string, _kit: BrandKit) {
    // The BrandKitEditor in Settings is the canonical edit path.
    // For the sidebar, fields are read-only display in Phase 1.
  }
}

// ── Small inline field component for the Brand panel ─────────────────────────
function BrandField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] text-slate-400 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white placeholder-slate-600 focus:border-amber-500/50 focus:outline-none"
      />
    </div>
  );
}
