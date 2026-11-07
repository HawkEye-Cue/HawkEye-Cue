/**
 * ImageSuggestions — "Ready-to-use designs for your post"
 *
 * Automatically appears below the composer once the user has written or generated a caption.
 * It shows 3 genuinely-distinct, fully-editable, content-aware templates — each composed from
 * the ACTUAL post text + the user's trade + Brand Kit — with REAL rendered previews (not
 * gradient placeholders). Template matching + composition + preview rendering are 100% client
 * side: no API calls, no AI image credits.
 *
 * Actions per card: Use This Design · Customize. Plus a strip-level "No Image" (clears any
 * attached image/design without touching the caption) and a secondary "Generate AI Image".
 */

import { useRef, useEffect, useState } from 'react';
import type { ScoredTemplate, DesignTemplate } from '../lib/designTemplates';
import type { BrandKit } from '../lib/brandKit';
import { composeTemplate } from '../lib/composeTemplate';
import { renderTemplateToDataUrl, renderTemplateToSvg, preferSvgPreview } from '../lib/renderTemplatePreview';

interface ImageSuggestionsProps {
  suggestions: ScoredTemplate[];
  /** the actual caption the designs should reflect */
  postText: string;
  tradeName?: string;
  brandKit: BrandKit;
  /** a stable signature of the composition inputs — previews are cached/keyed by it */
  signature: string;
  onOpenStudio: (template: DesignTemplate, customize?: boolean) => void;
  onGenerateAiImage: () => void;
  onUploadPhoto: (file: File) => void;
  onNoImage: () => void;
  onDismiss: () => void;
  canUseAiImage: boolean;
  /** PHASE 1 (insurance): pre-composed Canva-style designs. When present, these REPLACE the
   *  template-composed cards; everything else (actions, AI gating, upload) is unchanged. */
  canvaCards?: CanvaCard[] | null;
  /** open a pre-composed Canva design in the Studio as an editable document */
  onOpenCanva?: (card: CanvaCard) => void;
}

/** A ready-made design the page composed via lib/canvaDesigns (no network, no AI). */
export interface CanvaCard {
  id: string;
  name: string;
  style: string;
  previewUrl: string;
  imageShowsSummary: boolean;
}

interface PreparedCard {
  template: DesignTemplate;      // composed (content-aware) template — passed to the studio
  previewUrl: string | null;     // Fabric data URL (fidelity path)
  previewSvg: string | null;     // SVG markup (fallback path)
}

export default function ImageSuggestions({
  suggestions,
  postText,
  tradeName,
  brandKit,
  signature,
  onOpenStudio,
  onGenerateAiImage,
  onUploadPhoto,
  onNoImage,
  onDismiss,
  canUseAiImage,
  canvaCards = null,
  onOpenCanva,
}: ImageSuggestionsProps) {
  const useCanva = !!(canvaCards && canvaCards.length > 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cards, setCards] = useState<PreparedCard[]>([]);
  const [rendering, setRendering] = useState(false);

  // Compose + render previews whenever the suggestions or composition signature change.
  // Rendering is sequential + cached (by signature+template id) so it never thrashes the UI.
  useEffect(() => {
    let cancelled = false;
    if (suggestions.length === 0) { setCards([]); return; }

    const composed = suggestions.map(({ template }) =>
      composeTemplate({ template, postText, tradeName, brandKit }),
    );

    // Paint SVG (instant) first so the strip never shows blank cards, then upgrade to the
    // crisp Fabric thumbnail unless we're on a device where SVG is preferred for performance.
    const initial: PreparedCard[] = composed.map((template) => ({
      template, previewUrl: null, previewSvg: renderTemplateToSvg(template, brandKit),
    }));
    setCards(initial);

    if (preferSvgPreview()) return; // mobile / low-end: keep the instant SVG previews

    (async () => {
      setRendering(true);
      const next = [...initial];
      for (let i = 0; i < composed.length; i++) {
        if (cancelled) return;
        try {
          const url = await renderTemplateToDataUrl(composed[i], brandKit, {
            cacheKey: `${signature}::${composed[i].id}`,
            thumbWidth: 360,
          });
          if (cancelled) return;
          next[i] = { ...next[i], previewUrl: url };
          setCards([...next]);
        } catch {
          /* keep the SVG fallback for this card */
        }
      }
      if (!cancelled) setRendering(false);
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, suggestions.length]);

  if (suggestions.length === 0 && !useCanva) return null;

  const anyCanvaSummary = useCanva && canvaCards!.some((c) => c.imageShowsSummary);

  return (
    <div className="glass-card space-y-3 relative" role="region" aria-label="Ready-to-use designs for your post">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-white">✨ Ready-to-use designs for your post</p>
          <p className="text-[11px] text-slate-400">
            HawkEye made these from your post — tap to use or customize. {rendering ? 'Rendering…' : 'Free · fully editable.'}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-slate-500 hover:text-white text-xl leading-none transition-colors ml-3"
          aria-label="Dismiss suggestions"
        >
          ×
        </button>
      </div>

      {anyCanvaSummary && (
        <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2" role="note" data-testid="caption-summary-note">
          Some designs show a shortened headline or summary. Your full post caption above stays exactly as written.
        </p>
      )}

      {/* PHASE 1 (insurance): three pre-composed Canva-style designs. Same card UI + actions. */}
      {useCanva ? (
        <ul className="flex gap-3 overflow-x-auto pb-1 scrollbar-none" data-testid="design-suggestions" data-canva="1" aria-label="Suggested designs">
          {canvaCards!.map((card) => (
            <li key={card.id}
              className="shrink-0 w-52 rounded-xl overflow-hidden border border-white/10 bg-zinc-900 hover:border-amber-500/50 transition-colors">
              <div className="w-full bg-black flex items-center justify-center overflow-hidden" style={{ aspectRatio: '1' }} data-testid="design-preview">
                <img src={card.previewUrl} alt={`${card.name} design preview`} className="w-full h-full object-contain" />
              </div>
              <div className="p-2.5 space-y-2">
                <p className="text-xs font-semibold text-white truncate">{card.name}</p>
                <div className="flex gap-1.5">
                  <button onClick={() => onOpenCanva?.(card)} className="flex-1 py-1.5 bg-amber-500 text-black text-[11px] font-bold rounded-lg hover:opacity-90 transition-opacity active:scale-95">Use This Design</button>
                  <button onClick={() => onOpenCanva?.(card)} className="flex-1 py-1.5 bg-white/5 border border-white/10 text-white text-[11px] rounded-lg hover:bg-white/10 transition-colors active:scale-95">Customize</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
      <>
      {/* Template cards — real rendered previews */}
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none" data-testid="design-suggestions">
        {cards.map((card, i) => {
          const aspect = card.template.width / card.template.height;
          return (
            <div
              key={card.template.id + i}
              className="shrink-0 w-52 rounded-xl overflow-hidden border border-white/10 bg-zinc-900 hover:border-amber-500/50 transition-colors group"
            >
              {/* Real preview: Fabric data URL when ready, else the instant SVG. */}
              <div
                className="w-full bg-black flex items-center justify-center overflow-hidden"
                style={{ aspectRatio: String(aspect) }}
                data-testid="design-preview"
              >
                {card.previewUrl ? (
                  <img src={card.previewUrl} alt={`${card.template.name} preview`} className="w-full h-full object-contain" />
                ) : card.previewSvg ? (
                  <div className="w-full h-full" aria-label={`${card.template.name} preview`} dangerouslySetInnerHTML={{ __html: card.previewSvg }} />
                ) : (
                  <div className="w-full h-full animate-pulse bg-white/5" />
                )}
              </div>

              <div className="p-2.5 space-y-2">
                <p className="text-xs font-semibold text-white truncate">{card.template.name}</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onOpenStudio(card.template, false)}
                    className="flex-1 py-1.5 bg-amber-500 text-black text-[11px] font-bold rounded-lg hover:opacity-90 transition-opacity active:scale-95"
                  >
                    Use This Design
                  </button>
                  <button
                    onClick={() => onOpenStudio(card.template, true)}
                    className="flex-1 py-1.5 bg-white/5 border border-white/10 text-white text-[11px] rounded-lg hover:bg-white/10 transition-colors active:scale-95"
                  >
                    Customize
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </>
      )}

      {/* Strip-level actions */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-white/5">
        <button
          onClick={onNoImage}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 text-slate-300 text-xs rounded-lg hover:bg-white/10 transition-colors"
          data-testid="no-image"
        >
          🚫 No Image
        </button>
        <button
          onClick={onGenerateAiImage}
          disabled={!canUseAiImage}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-amber-500/30 text-amber-300 text-xs rounded-lg hover:bg-amber-500/10 disabled:opacity-40 transition-colors"
          title={canUseAiImage ? 'Generate a custom AI image (uses an AI image credit)' : 'AI images require a Soar or Summit plan'}
        >
          ✨ Generate AI Image
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 text-slate-300 text-xs rounded-lg hover:bg-white/10 transition-colors"
        >
          🖼️ Upload &amp; Edit My Photo
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUploadPhoto(file);
          }}
        />
      </div>
    </div>
  );
}
