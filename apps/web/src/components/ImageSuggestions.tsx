/**
 * ImageSuggestions — "Ready-to-use designs for your post"
 *
 * Automatically appears below the composer once the user has written or generated a caption.
 * It shows 3 genuinely-distinct, fully-editable, content-aware templates — each composed from
 * the ACTUAL post text + the user's trade + Brand Kit — with REAL rendered previews (not
 * gradient placeholders). Template matching + composition + preview rendering are 100% client
 * side: no API calls, no AI image credits.
 *
 * Actions per card: Use This Design (primary) · Customize. Below the cards: No Image, Upload my own
 * photo (both free) and a deliberately secondary, cost-labelled AI image link. The AI image request
 * itself is always gated by a confirmation that shows the exact cost and remaining balance.
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
  /** open the studio's Brand panel to add business details */
  onPersonalize?: (template: DesignTemplate) => void;
  /** true when the Brand Kit already has a business name AND phone */
  brandComplete?: boolean;
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
  onPersonalize,
  brandComplete = false,
}: ImageSuggestionsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cards, setCards] = useState<PreparedCard[]>([]);
  const [rendering, setRendering] = useState(false);
  // 3-column grid when the strip itself is ≥480px wide (cards ≥ ~150px); otherwise a snap-scrolling row.
  const rowRef = useRef<HTMLUListElement>(null);
  const [stripW, setStripW] = useState(800);
  const wide = stripW >= 480;
  const compact = wide && stripW < 660; // narrow grid: stack the two card buttons
  const hasCards = cards.length > 0;
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const measure = () => setStripW(el.parentElement?.clientWidth ?? el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el.parentElement ?? el);
    return () => ro.disconnect();
  }, [hasCards]);

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


  if (suggestions.length === 0) return null;

  return (
    <div className="glass-card space-y-3 relative" role="region" aria-label="Ready-to-use designs for your post">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">✨ Free designs made from your post</p>
          <p className="text-[11px] text-slate-400">
            Tap to use or customize. {rendering ? 'Rendering…' : 'Free · unlimited · fully editable.'}
          </p>
          {onPersonalize && cards[0] && (
            <button
              type="button"
              onClick={() => onPersonalize(cards[0].template)}
              className="mt-1 text-[11px] font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2"
              data-testid="personalize-brand"
            >
              {brandComplete ? 'Edit your Brand Kit' : 'Personalize with your Brand Kit'}
            </button>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-slate-500 hover:text-white text-xl leading-none transition-colors"
          aria-label="Dismiss suggestions"
        >
          ×
        </button>
      </div>

      {/* Cards: a 3-column grid whenever this strip is wide enough (measured on the strip itself,
          so it follows the Create column, not the window). Narrower: a snap-scrolling row of
          usable card sizes. The scrollbar is visually hidden; the row stays keyboard-scrollable. */}
      <ul
        ref={rowRef}
        className={wide
          ? 'grid grid-cols-3 gap-3'
          : 'flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'}
        data-testid="design-suggestions"
        data-layout={wide ? 'grid' : 'scroll'}
        aria-label="Suggested designs"
        tabIndex={wide ? undefined : 0}
      >
        {cards.map((card, i) => {
          const aspect = card.template.width / card.template.height;
          return (
            <li
              key={card.template.id + i}
              className={`${wide ? 'min-w-0' : 'snap-start shrink-0 w-[min(15rem,72vw)]'} rounded-xl overflow-hidden border border-white/10 bg-zinc-900 hover:border-amber-500/50 transition-colors`}
            >
              <div
                className="w-full bg-black flex items-center justify-center overflow-hidden"
                style={{ aspectRatio: String(aspect) }}
                data-testid="design-preview"
              >
                {card.previewUrl ? (
                  <img src={card.previewUrl} alt={`${card.template.name} design preview`} className="w-full h-full object-contain" />
                ) : card.previewSvg ? (
                  <div className="w-full h-full" role="img" aria-label={`${card.template.name} design preview`} dangerouslySetInnerHTML={{ __html: card.previewSvg }} />
                ) : (
                  <div className="w-full h-full animate-pulse bg-white/5" />
                )}
              </div>

              <div className="p-2.5 space-y-2">
                <p className="text-xs font-semibold text-white truncate">{card.template.name}</p>
                <div className={compact ? 'flex flex-col gap-1.5' : 'flex gap-1.5'}>
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
            </li>
          );
        })}
      </ul>

      {/* Free alternatives first; the paid AI image is a deliberately quiet, cost-labelled link. */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
        <button
          onClick={onNoImage}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 text-slate-300 text-xs rounded-lg hover:bg-white/10 transition-colors"
          data-testid="no-image"
        >
          🚫 No Image
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 text-slate-300 text-xs rounded-lg hover:bg-white/10 transition-colors"
        >
          🖼️ Upload my own photo · free
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
        <button
          onClick={onGenerateAiImage}
          disabled={!canUseAiImage}
          className="ml-auto text-[11px] text-slate-400 hover:text-slate-200 underline underline-offset-2 disabled:no-underline disabled:opacity-50"
          data-testid="suggestions-ai-image"
          title={canUseAiImage ? 'Paid: uses 1 AI image credit. You will see your balance and confirm first.' : 'AI images are included with Soar and Summit plans'}
        >
          {canUseAiImage ? 'Want an AI photo instead? Uses 1 credit' : 'AI photos: Soar & Summit plans'}
        </button>
      </div>
    </div>
  );
}
