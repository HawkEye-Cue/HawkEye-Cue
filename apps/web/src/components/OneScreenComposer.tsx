import { useRef } from 'react';
import { SOCIAL_PLATFORMS } from '@social-lead-gen/shared';
import type { SocialPlatform } from '@social-lead-gen/shared';

export type ComposeMode = 'write' | 'ai_draft' | 'ideas';

const PLATFORM_ICONS: Record<string, string> = {
  facebook: '📘', instagram: '📷', linkedin: '💼', tiktok: '🎵', nextdoor: '🏡',
};
const MEDIA_REQUIRED: SocialPlatform[] = ['instagram', 'tiktok'];
const MAX_INTENT = 280;

const AI_CHIPS = [
  { label: '💼 Promote a service', seed: 'Promote my service: ' },
  { label: '💡 Share a tip', seed: 'Share a helpful tip: ' },
  { label: '💬 Ask a question', seed: 'Ask the community a question about: ' },
];

interface Props {
  mode: ComposeMode;
  setMode: (m: ComposeMode) => void;
  // Unified single input
  value: string;
  setValue: (v: string) => void;
  // Media
  readyImageSrc: string | null;
  onAddPhoto: (file: File) => void;
  onCreateAiImage: () => void;
  onRemoveImage: () => void;
  canUseAiImage: boolean;
  // Platforms
  platforms: SocialPlatform[];
  togglePlatform: (p: SocialPlatform) => void;
  // Actions
  onPrimary: () => void;
  onImproveWithAI: () => void;
  onGetIdeas: () => void;
  loading: boolean;
  error?: string;
}

export default function OneScreenComposer(props: Props) {
  const {
    mode, setMode, value, setValue, readyImageSrc, onAddPhoto, onCreateAiImage,
    onRemoveImage, canUseAiImage, platforms, togglePlatform, onPrimary,
    onImproveWithAI, onGetIdeas, loading, error,
  } = props;
  const fileRef = useRef<HTMLInputElement>(null);

  const placeholder =
    mode === 'ai_draft' ? 'Example: Help local families understand their auto coverage'
    : mode === 'ideas' ? 'Optional: a topic to focus ideas on (e.g. spring roof checks)'
    : 'Write your post exactly as you want it to appear…';

  const needsMedia = platforms.some((p) => MEDIA_REQUIRED.includes(p)) && !readyImageSrc;
  const primaryDisabled =
    loading ||
    platforms.length === 0 ||
    (mode === 'ai_draft' && !value.trim());

  const primaryLabel =
    loading ? '✨ Working…'
    : mode === 'ideas' ? '💡 Get Ideas'
    : mode === 'write' ? 'Continue to Preview →'
    : 'Create & Preview →';

  return (
    <div className="glass-card space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white leading-tight">Create a Post</h2>
          <p className="text-[11px] text-slate-400">HawkEye can help at any step.</p>
        </div>
        <span className="text-3xl">🦅</span>
      </div>

      {/* Mode tabs */}
      <div className="flex bg-slate-800 rounded-xl p-1 border border-white/10">
        {([
          { id: 'write', label: '✍️ Write' },
          { id: 'ai_draft', label: '✨ AI Draft' },
          { id: 'ideas', label: '💡 Get Ideas' },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${mode === t.id ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Prompt heading */}
      <p className="text-sm font-semibold text-white">
        {mode === 'ai_draft' ? 'What do you want to promote?' : mode === 'ideas' ? 'What should this be about?' : 'Your post'}
      </p>

      {/* Single input */}
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, mode === 'write' ? 5000 : MAX_INTENT))}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 resize-none h-24 focus:border-amber-500/50 focus:outline-none transition-colors text-sm"
        />
        <span className="absolute bottom-2 right-3 text-[10px] text-slate-500">
          {mode === 'write' ? `${value.length}` : `${value.length}/${MAX_INTENT}`}
        </span>
      </div>

      {/* Mode-specific row */}
      {mode === 'ai_draft' && (
        <>
          <div className="flex flex-wrap gap-2">
            {AI_CHIPS.map((c) => (
              <button
                key={c.label}
                onClick={() => setValue(c.seed)}
                className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">HawkEye will create your caption and platform-ready versions.</p>
        </>
      )}
      {mode === 'write' && (
        <button onClick={onImproveWithAI} disabled={!value.trim() || loading} className="text-xs text-amber-400 hover:text-amber-300 disabled:opacity-40">✨ Improve with AI</button>
      )}
      {mode === 'ideas' && (
        <p className="text-[11px] text-slate-500">Tap “Get Ideas” and pick one to load it into your post.</p>
      )}

      {/* Media row */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-2 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white hover:bg-white/10">
          🖼️ Add Photo
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onAddPhoto(f); }} />
        <button
          onClick={onCreateAiImage}
          disabled={!canUseAiImage}
          className="flex items-center justify-center gap-2 py-2.5 bg-white/5 border border-amber-500/30 rounded-lg text-sm text-white hover:bg-white/10 disabled:opacity-40"
          title={canUseAiImage ? 'Generate an image with AI' : 'AI images are a Pro feature'}
        >
          ✨ Create AI Image
        </button>
      </div>

      {/* Attached image chip */}
      {readyImageSrc && (
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-2">
          <img src={readyImageSrc} alt="attached" className="w-10 h-10 rounded object-cover" />
          <span className="text-xs text-slate-300 flex-1">Photo attached</span>
          <button onClick={onRemoveImage} className="text-xs text-red-400 hover:text-red-300">Remove</button>
        </div>
      )}

      {/* Platforms */}
      <div>
        <p className="text-sm font-semibold text-white mb-1.5">Where should this post go?</p>
        <div className="flex flex-wrap gap-2">
          {SOCIAL_PLATFORMS.map((p) => {
            const on = platforms.includes(p);
            return (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs capitalize transition-all ${on ? 'bg-blue-600/20 border border-blue-500/50 text-white' : 'bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10'}`}
              >
                <span>{PLATFORM_ICONS[p] || ''}</span>{p}<span>{on ? '✓' : '○'}</span>
              </button>
            );
          })}
        </div>
        {needsMedia && (
          <p className="text-[11px] text-amber-300 mt-1.5">📷 Instagram & TikTok need a photo — add one above.</p>
        )}
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-300">{error}</div>
      )}

      {/* Primary action */}
      <button
        onClick={mode === 'ideas' ? onGetIdeas : onPrimary}
        disabled={primaryDisabled}
        className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-base font-bold rounded-xl disabled:opacity-50 hover:opacity-90 active:scale-[0.99] transition-all shadow-lg shadow-amber-500/20"
      >
        {primaryLabel}
      </button>

      {mode === 'ai_draft' && (
        <button onClick={() => setMode('write')} className="w-full text-center text-xs text-slate-400 hover:text-white underline underline-offset-2">
          I want to write it myself
        </button>
      )}
    </div>
  );
}
