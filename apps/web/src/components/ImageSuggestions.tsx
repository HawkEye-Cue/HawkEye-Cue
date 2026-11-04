/**
 * ImageSuggestions — "Suggested Images for Your Post"
 *
 * Appears below the OneScreenComposer after the user writes or generates a post.
 * Uses template matching only — no AI calls, no cost. The user can:
 *   • Use This Design   (opens DesignStudio with that template pre-loaded)
 *   • Customize         (same, but with a "customize" flag so the template opens in edit mode)
 *   • Generate AI Image (escapes to the existing AI photo flow — explicit user action)
 *   • Upload My Own Photo (fires onAddPhoto)
 *   • Dismiss           (hides the strip until next content change)
 *
 * Debouncing lives in ContentCreatorPage, which passes in already-computed suggestions.
 * This component is purely presentational.
 */

import { useRef } from 'react';
import type { ScoredTemplate, DesignTemplate } from '../lib/designTemplates';

interface ImageSuggestionsProps {
  suggestions: ScoredTemplate[];
  onOpenStudio: (template: DesignTemplate, customize?: boolean) => void;
  onGenerateAiImage: () => void;
  onUploadPhoto: (file: File) => void;
  onDismiss: () => void;
  canUseAiImage: boolean;
}

export default function ImageSuggestions({
  suggestions,
  onOpenStudio,
  onGenerateAiImage,
  onUploadPhoto,
  onDismiss,
  canUseAiImage,
}: ImageSuggestionsProps) {
  // FIX: this was a plain object recreated on every render (not useRef), so the "Upload My Own
  // Photo" button could call .click() on a stale/null element. It must be a real ref, and it
  // must be declared BEFORE the early return to satisfy the Rules of Hooks.
  const fileRef = useRef<HTMLInputElement>(null);

  if (suggestions.length === 0) return null;

  return (
    <div className="glass-card space-y-3 relative" role="region" aria-label="Suggested images for your post">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-white">✨ Suggested Images for Your Post</p>
          <p className="text-[11px] text-slate-400">Pick a design or add your own photo — no charge to preview.</p>
        </div>
        <button
          onClick={onDismiss}
          className="text-slate-500 hover:text-white text-xl leading-none transition-colors ml-3"
          aria-label="Dismiss suggestions"
        >
          ×
        </button>
      </div>

      {/* Template cards */}
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
        {suggestions.map(({ template }) => (
          <div
            key={template.id}
            className="shrink-0 w-52 rounded-xl overflow-hidden border border-white/10 bg-black hover:border-amber-500/50 transition-colors cursor-pointer group"
          >
            {/* Visual swatch (gradient from template's previewColors) */}
            <div
              className="w-full h-28 relative"
              style={{
                background: `linear-gradient(135deg, ${template.previewColors[0]} 0%, ${template.previewColors[1]} 100%)`,
              }}
            >
              {/* Simulated layout hint */}
              <div className="absolute inset-4 flex flex-col gap-2 justify-end">
                <div className="h-2 bg-white/40 rounded w-3/4" />
                <div className="h-2 bg-white/20 rounded w-1/2" />
              </div>
              <span className="absolute top-2 right-2 text-[10px] font-bold bg-black/50 text-white/70 px-1.5 py-0.5 rounded">
                {template.format}
              </span>
            </div>

            <div className="p-2.5 space-y-2">
              <p className="text-xs font-semibold text-white truncate">{template.name}</p>
              <p className="text-[10px] text-slate-400 leading-snug line-clamp-2">{template.description}</p>

              <div className="flex gap-1.5">
                <button
                  onClick={() => onOpenStudio(template, false)}
                  className="flex-1 py-1.5 bg-amber-500 text-black text-[11px] font-bold rounded-lg hover:opacity-90 transition-opacity active:scale-95"
                >
                  Use Design
                </button>
                <button
                  onClick={() => onOpenStudio(template, true)}
                  className="flex-1 py-1.5 bg-white/5 border border-white/10 text-white text-[11px] rounded-lg hover:bg-white/10 transition-colors active:scale-95"
                >
                  Customize
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Secondary actions row */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-white/5">
        <button
          onClick={onGenerateAiImage}
          disabled={!canUseAiImage}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-amber-500/30 text-amber-300 text-xs rounded-lg hover:bg-amber-500/10 disabled:opacity-40 transition-colors"
          title={canUseAiImage ? 'Generate a custom AI image for this post' : 'AI images require a Soar or Summit plan'}
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
