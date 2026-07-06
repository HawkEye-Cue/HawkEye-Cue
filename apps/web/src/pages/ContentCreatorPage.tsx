import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTrade } from '../contexts/TradeContext';
import { SOCIAL_PLATFORMS, ApiClient } from '@social-lead-gen/shared';
import type { SocialPlatform } from '@social-lead-gen/shared';

const TONES = ['professional', 'casual', 'educational', 'urgent'] as const;

const PLATFORM_ICONS: Record<string, string> = {
  facebook: '📘',
  instagram: '📷',
  linkedin: '💼',
  tiktok: '🎵',
};

export default function ContentCreatorPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const { selectedTrade } = useTrade();
  const [tone, setTone] = useState<'professional' | 'casual' | 'educational' | 'urgent'>('professional');
  const [postType, setPostType] = useState('');
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([]);
  const [baseText, setBaseText] = useState('');
  const [platformContent, setPlatformContent] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);

  const togglePlatform = (p: SocialPlatform) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setPlatformContent(null);

    try {
      const token = await getToken();
      const client = new ApiClient({
        baseUrl: import.meta.env.VITE_API_URL as string,
        getToken: async () => token,
      });

      const result = await client.generateContent({
        tone,
        postType,
        platforms,
        baseText: baseText || undefined,
        tradeName: selectedTrade?.name,
      });

      // The API now returns platformContent with per-platform versions
      if (result.platformContent) {
        setPlatformContent(result.platformContent as Record<string, string>);
      } else if (result.content) {
        // Fallback for old format
        const fallback: Record<string, string> = {};
        for (const p of platforms) {
          fallback[p] = result.content;
        }
        setPlatformContent(fallback);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to generate content. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedTrade) {
    return <p className="text-slate-400">Please select a trade first from the Dashboard.</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Create Content</h2>

      <div className="glass-card">
        <label className="block text-sm font-medium text-slate-300 mb-2">Tone</label>
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <button
              key={t}
              onClick={() => setTone(t)}
              className={`px-4 py-2 rounded-full text-sm capitalize transition-all duration-200 ${
                tone === t
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card">
        <label className="block text-sm font-medium text-slate-300 mb-2">Post Type</label>
        <select
          value={postType}
          onChange={(e) => setPostType(e.target.value)}
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-blue-500/50 focus:outline-none transition-colors"
        >
          <option value="">Select post type...</option>
          {selectedTrade.postTypes.map((pt) => (
            <option key={pt} value={pt}>{pt}</option>
          ))}
        </select>
      </div>

      <div className="glass-card">
        <label className="block text-sm font-medium text-slate-300 mb-2">Platforms</label>
        <div className="flex flex-wrap gap-2">
          {SOCIAL_PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => togglePlatform(p)}
              className={`px-4 py-2 rounded-full text-sm capitalize transition-all duration-200 ${
                platforms.includes(p)
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {PLATFORM_ICONS[p] || ''} {p}
            </button>
          ))}
        </div>
        {platforms.includes('instagram') && (
          <p className="text-xs text-amber-400 mt-2">⚠️ Instagram requires an image. Add one below or it will be skipped.</p>
        )}
        {platforms.includes('tiktok') && (
          <p className="text-xs text-amber-400 mt-2">⚠️ TikTok requires a video. Add one below or it will be skipped.</p>
        )}
      </div>

      {/* Media Upload */}
      <div className="glass-card">
        <label className="block text-sm font-medium text-slate-300 mb-2">Media (required for Instagram & TikTok)</label>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="cursor-pointer px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
            + Add Image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setImageFile(file);
                  setImagePreview(URL.createObjectURL(file));
                }
              }}
            />
          </label>
          <label className="cursor-pointer px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
            + Add Video
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setVideoFile(file);
                  setVideoName(file.name);
                }
              }}
            />
          </label>
          {imagePreview && (
            <div className="relative">
              <img src={imagePreview} alt="Preview" className="w-16 h-16 rounded-lg object-cover" />
              <button
                onClick={() => { setImageFile(null); setImagePreview(null); }}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center"
              >
                ×
              </button>
            </div>
          )}
          {videoName && (
            <div className="relative flex items-center gap-2 px-3 py-2 bg-purple-900/30 border border-purple-500/30 rounded-lg">
              <span className="text-sm text-purple-300">🎬 {videoName}</span>
              <button
                onClick={() => { setVideoFile(null); setVideoName(null); }}
                className="w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>      <div className="glass-card">
        <label className="block text-sm font-medium text-slate-300 mb-2">Base Text</label>
        <textarea
          value={baseText}
          onChange={(e) => setBaseText(e.target.value)}
          placeholder="Enter your message idea and AI will adapt it for each platform, or leave blank for AI to create from scratch..."
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 resize-none h-24 focus:border-blue-500/50 focus:outline-none transition-colors"
        />
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={loading || !postType || platforms.length === 0}
        className="w-full btn-primary py-3 text-base disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none btn-shimmer"
      >
        {loading ? '✨ Generating for each platform...' : '✨ Generate Content'}
      </button>

      {platformContent && (
        <div className="space-y-4 animate-scale-in">
          <h3 className="font-semibold text-white">Generated Content — Per Platform</h3>

          {Object.entries(platformContent).map(([platform, content]) => (
            <div key={platform} className="glass-card-strong gradient-border">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{PLATFORM_ICONS[platform] || '📱'}</span>
                <h4 className="font-medium text-white capitalize">{platform}</h4>
              </div>
              <textarea
                value={content}
                onChange={(e) =>
                  setPlatformContent((prev) =>
                    prev ? { ...prev, [platform]: e.target.value } : prev
                  )
                }
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white resize-none h-32 focus:border-blue-500/50 focus:outline-none transition-colors text-sm"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-slate-500">
                  {content.length} characters
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(content)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Copy
                </button>
              </div>
            </div>
          ))}

          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                disabled={scheduling}
                onClick={async () => {
                  if (!platformContent) return;
                  setError('');
                  setSuccess('');
                  setScheduling(true);
                  try {
                    const token = await getToken();
                    const client = new ApiClient({
                      baseUrl: import.meta.env.VITE_API_URL as string,
                      getToken: async () => token,
                    });

                    // Upload image if provided
                    let mediaUrls: string[] = [];
                    if (imageFile) {
                      const { url, key } = await client.getUploadUrl(imageFile.name, imageFile.type);
                      await fetch(url, { method: 'PUT', body: imageFile, headers: { 'Content-Type': imageFile.type } });
                      mediaUrls = [`https://socialleadgen-storage-mediauploadsbucketbce0cf0b-zkbwwljnyurz.s3.amazonaws.com/${key}`];
                    } else if (videoFile) {
                      const { url, key } = await client.getUploadUrl(videoFile.name, videoFile.type);
                      await fetch(url, { method: 'PUT', body: videoFile, headers: { 'Content-Type': videoFile.type } });
                      mediaUrls = [`https://socialleadgen-storage-mediauploadsbucketbce0cf0b-zkbwwljnyurz.s3.amazonaws.com/${key}`];
                    }

                    const scheduledAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
                    const content = Object.values(platformContent)[0] || '';
                    await client.schedulePosts({
                      contentId: 'generated-' + Date.now(),
                      content,
                      platforms,
                      scheduledAt,
                      mediaUrls,
                    });
                    setSuccess('✓ Posted! It will go live in about 2 minutes.');
                    setScheduling(false);
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : 'Failed to post';
                    setError(msg);
                    setScheduling(false);
                  }
                }}
                className="flex-1 bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-500 disabled:opacity-50 active:scale-95 transition-all duration-200"
              >
                {scheduling ? 'Posting...' : 'Post Now'}
              </button>
              <button className="bg-white/5 border border-white/10 text-slate-300 px-4 py-2.5 rounded-lg text-sm hover:bg-white/10 hover:text-white transition-all duration-200">
                Save Drafts
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                id="schedule-time"
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:border-blue-500/50 focus:outline-none"
                min={new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)}
              />
              <button
                disabled={scheduling}
                onClick={async () => {
                  if (!platformContent) return;
                  const input = document.getElementById('schedule-time') as HTMLInputElement;
                  if (!input?.value) {
                    setError('Please pick a date and time to schedule');
                    return;
                  }
                  setError('');
                  setScheduling(true);
                  try {
                    const token = await getToken();
                    const client = new ApiClient({
                      baseUrl: import.meta.env.VITE_API_URL as string,
                      getToken: async () => token,
                    });
                    const scheduledAt = new Date(input.value).toISOString();
                    const content = Object.values(platformContent)[0] || '';
                    await client.schedulePosts({
                      contentId: 'generated-' + Date.now(),
                      content,
                      platforms,
                      scheduledAt,
                      mediaUrls: [],
                    });
                    setSuccess('✓ Scheduled! Check the Calendar tab.');
                    setScheduling(false);
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : 'Failed to schedule';
                    setError(msg);
                    setScheduling(false);
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50 active:scale-95 transition-all duration-200"
              >
                Schedule
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-sm text-red-300">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 rounded-lg bg-green-950/40 border border-green-500/40 text-sm text-green-300">
                {success}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
