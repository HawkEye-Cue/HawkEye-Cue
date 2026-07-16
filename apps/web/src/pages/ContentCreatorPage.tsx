import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTrade } from '../contexts/TradeContext';
import { useCalendar } from '../contexts/CalendarContext';
import { useToast } from '../contexts/ToastContext';
import { SOCIAL_PLATFORMS, ApiClient } from '@social-lead-gen/shared';
import type { SocialPlatform, ScheduledPost, Trade } from '@social-lead-gen/shared';

const TONES = ['professional', 'casual', 'educational', 'urgent'] as const;

const PLATFORM_ICONS: Record<string, string> = {
  facebook: '📘',
  instagram: '📷',
  linkedin: '💼',
  tiktok: '🎵',
  nextdoor: '🏡',
};

export default function ContentCreatorPage() {
  const { getToken, user } = useAuth();
  const navigate = useNavigate();
  const { selectedTrade, selectedTrades } = useTrade();
  const { events, removeEvent } = useCalendar();
  const { showToast } = useToast();
  const [activeTrade, setActiveTrade] = useState<Trade | null>(null);
  const [todayPosts, setTodayPosts] = useState<ScheduledPost[]>([]);
  const [createMode, setCreateMode] = useState<'ai' | 'own'>('ai');
  const [ownContent, setOwnContent] = useState('');
  const [tone, setTone] = useState<'professional' | 'casual' | 'educational' | 'urgent'>('professional');
  const [postLength, setPostLength] = useState<'short' | 'medium' | 'long'>('medium');
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
        postLength,
        platforms,
        baseText: baseText || undefined,
        tradeName: currentTrade?.name,
      });

      // The API now returns platformContent with per-platform versions
      if (result.platformContent) {
        setPlatformContent(result.platformContent as Record<string, string>);
        localStorage.setItem(`hawkeye_first_post_${user?.sub}`, 'true');
        showToast('✓ Content generated');
      } else if (result.content) {
        // Fallback for old format
        const fallback: Record<string, string> = {};
        for (const p of platforms) {
          fallback[p] = result.content;
        }
        setPlatformContent(fallback);
        localStorage.setItem(`hawkeye_first_post_${user?.sub}`, 'true');
        showToast('✓ Content generated');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to generate content. Please try again.';
      if (message.includes('TIER_LIMIT_REACHED') || message.includes('AI generations')) {
        setError('🔒 ' + message + ' Go to Settings to upgrade your plan.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch today's posts from API
  useEffect(() => {
    async function fetchTodayPosts() {
      try {
        const token = await getToken();
        const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
        const today = new Date().toISOString().split('T')[0];
        const result = await client.getPosts({ startDate: today, endDate: today });
        const posts = Array.isArray(result) ? result : (result as any)?.posts || [];
        setTodayPosts(posts);
      } catch { /* ignore */ }
    }
    fetchTodayPosts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const todayStr = new Date().toISOString().split('T')[0];
  const todayCalendarEvents = events.filter((e) => e.date === todayStr);

  // Use activeTrade for content creation, default to first selected
  const currentTrade = activeTrade || selectedTrade;

  if (!currentTrade) {
    return <p className="text-slate-400">Please select a trade first from the Dashboard.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Create Content</h2>
      </div>
      {selectedTrades.length > 1 && (
        <div className="flex justify-center">
          <select
            value={currentTrade.id}
            onChange={(e) => {
              const t = selectedTrades.find((tr) => tr.id === e.target.value);
              if (t) setActiveTrade(t);
            }}
            className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white font-medium focus:outline-none focus:border-blue-500"
          >
            {selectedTrades.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Today's Items - collapsible */}
      <details className="glass-card">
        <summary className="font-semibold text-white cursor-pointer flex items-center justify-between">
          <span>Today's Cues</span>
          <span className="text-xs text-slate-400">{todayCalendarEvents.length + todayPosts.length}</span>
        </summary>
        <div className="mt-3 max-h-40 overflow-y-auto space-y-2">
          {todayCalendarEvents.map((e) => (
            <div key={e.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 shrink-0 rounded-full ${e.type === 'post' ? 'bg-blue-500' : e.type === 'task' ? 'bg-amber-500' : 'bg-green-500'}`} />
                <span className="text-sm text-slate-300 truncate">{e.title}</span>
                {e.link && (
                  <a
                    href={e.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(ev) => ev.stopPropagation()}
                    className="text-blue-400 hover:text-blue-300 shrink-0"
                    title={e.link}
                  >
                    🔗
                  </a>
                )}
              </div>
              <button onClick={() => removeEvent(e.id)} className="text-xs text-red-400 hover:text-red-300">✕</button>
            </div>
          ))}
          {todayPosts.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
              <div className="min-w-0">
                <p className="text-sm text-slate-300 truncate">📤 {(p.content || 'Scheduled post').slice(0, 40)}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${p.status === 'published' ? 'bg-green-900/40 text-green-400' : 'bg-blue-900/40 text-blue-400'}`}>{p.status}</span>
            </div>
          ))}
          {todayCalendarEvents.length === 0 && todayPosts.length === 0 && (
            <p className="text-sm text-slate-500">No cues scheduled for today</p>
          )}
        </div>
      </details>

      {/* Mode Toggle */}
      <div className="flex gap-2 bg-black border-2 border-amber-500 rounded-xl p-2 shadow-xl shadow-amber-500/10">
        <button
          onClick={() => setCreateMode('ai')}
          className={`flex-1 px-4 py-3.5 rounded-lg text-base font-bold transition-all duration-200 ${
            createMode === 'ai' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/40 scale-[1.02]' : 'text-white bg-slate-500 hover:bg-slate-400 border-2 border-slate-300'
          }`}
        >
          ✨ AI Generate
        </button>
        <button
          onClick={() => setCreateMode('own')}
          className={`flex-1 px-4 py-3.5 rounded-lg text-base font-bold transition-all duration-200 ${
            createMode === 'own' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/40 scale-[1.02]' : 'text-white bg-slate-500 hover:bg-slate-400 border-2 border-slate-300'
          }`}
        >
          ✍️ Write My Own
        </button>
      </div>

      {createMode === 'ai' && (
      <>
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
        <label className="block text-sm font-medium text-slate-300 mb-2">Post Length</label>
        <div className="flex gap-2">
          {([['short', '📝 Short', '1-2 sentences'], ['medium', '📄 Medium', '3-5 sentences'], ['long', '📰 Long', 'Full paragraph']] as const).map(([id, label, desc]) => (
            <button
              key={id}
              onClick={() => setPostLength(id)}
              className={`flex-1 px-3 py-2 rounded-lg text-center transition-all duration-200 ${
                postLength === id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card">
        <label className="block text-sm font-medium text-slate-300 mb-2">Post Type</label>
        <select
          value={postType}
          onChange={(e) => setPostType(e.target.value)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
        >
          <option value="">Select post type...</option>
          {currentTrade.postTypes.map((pt) => (
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
        {platforms.includes('nextdoor') && (
          <p className="text-xs text-blue-400 mt-2">ℹ️ Nextdoor content will be generated for you to copy & paste (auto-publish not available).</p>
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
          {error.includes('🔒') && (
            <button
              onClick={() => navigate('/settings')}
              className="block mt-2 text-blue-400 hover:text-blue-300 font-medium"
            >
              Upgrade Plan →
            </button>
          )}
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={loading || !postType || platforms.length === 0}
        className="w-full btn-primary py-3 text-base disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none btn-shimmer"
      >
        {loading ? '✨ Generating for each platform...' : '✨ Generate Content'}
      </button>
      </>
      )}

      {createMode === 'own' && (
      <>
      {/* Platforms for own post */}
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
      </div>

      {/* Write your own post */}
      <div className="glass-card">
        <label className="block text-sm font-medium text-slate-300 mb-2">Your Post</label>
        <textarea
          value={ownContent}
          onChange={(e) => setOwnContent(e.target.value)}
          placeholder="Write your post here exactly as you want it to appear..."
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 resize-none h-36 focus:border-blue-500/50 focus:outline-none transition-colors"
        />
        <p className="text-xs text-slate-500 mt-1">{ownContent.length} characters</p>
      </div>

      {/* Media Upload for own post */}
      <div className="glass-card">
        <label className="block text-sm font-medium text-slate-300 mb-2">Media (optional)</label>
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
      </div>

      {/* Use Own Content button — sets platformContent so the rest of the page works */}
      <button
        onClick={() => {
          if (!ownContent.trim() || platforms.length === 0) return;
          const content: Record<string, string> = {};
          for (const p of platforms) {
            content[p] = ownContent.trim();
          }
          setPlatformContent(content);
          showToast('✓ Ready to post');
        }}
        disabled={!ownContent.trim() || platforms.length === 0}
        className="w-full bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-xl text-base font-medium disabled:opacity-50 transition-all duration-200"
      >
        ✍️ Use This Post
      </button>
      </>
      )}

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

          {/* Post Preview */}
          <details className="glass-card-strong" open>
            <summary className="font-semibold text-white cursor-pointer flex items-center gap-2">
              👁️ Post Preview
            </summary>
            <div className="mt-4 space-y-4">
              {Object.entries(platformContent).map(([platform, content]) => (
                <div key={`preview-${platform}`} className="rounded-xl border border-slate-600 overflow-hidden bg-white">
                  {/* Platform header */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                      {user?.email?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{currentTrade?.name || 'Your Business'}</p>
                      <p className="text-[10px] text-slate-500 flex items-center gap-1">
                        {PLATFORM_ICONS[platform]} {platform.charAt(0).toUpperCase() + platform.slice(1)} · Just now
                      </p>
                    </div>
                  </div>
                  {/* Post content */}
                  <div className="px-3 py-2">
                    <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{content.slice(0, 300)}{content.length > 300 ? '...' : ''}</p>
                  </div>
                  {/* Media */}
                  {imagePreview && (
                    <div className="px-3 pb-2">
                      <img src={imagePreview} alt="Post media" className="w-full rounded-lg object-cover max-h-64" />
                    </div>
                  )}
                  {videoName && !imagePreview && (
                    <div className="px-3 pb-2">
                      <div className="w-full h-48 rounded-lg bg-slate-900 flex items-center justify-center">
                        <div className="text-center">
                          <span className="text-4xl">🎬</span>
                          <p className="text-xs text-slate-400 mt-1">{videoName}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Engagement bar */}
                  <div className="px-3 py-2 border-t border-slate-200 flex items-center gap-4 text-slate-500 text-xs">
                    <span>👍 Like</span>
                    <span>💬 Comment</span>
                    <span>↗️ Share</span>
                  </div>
                </div>
              ))}
            </div>
          </details>

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
                      mediaUrls = [`${import.meta.env.VITE_MEDIA_BUCKET_URL || 'https://socialleadgen-storage-mediauploadsbucketbce0cf0b-zkbwwljnyurz.s3.amazonaws.com'}/${key}`];
                    } else if (videoFile) {
                      const { url, key } = await client.getUploadUrl(videoFile.name, videoFile.type);
                      await fetch(url, { method: 'PUT', body: videoFile, headers: { 'Content-Type': videoFile.type } });
                      mediaUrls = [`${import.meta.env.VITE_MEDIA_BUCKET_URL || 'https://socialleadgen-storage-mediauploadsbucketbce0cf0b-zkbwwljnyurz.s3.amazonaws.com'}/${key}`];
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
              <button
                onClick={() => {
                  if (platformContent) {
                    const allText = Object.entries(platformContent).map(([p, c]) => `--- ${p.toUpperCase()} ---\n${c}`).join('\n\n');
                    navigator.clipboard.writeText(allText);
                    setSuccess('✓ All content copied to clipboard');
                  }
                }}
                className="bg-white/5 border border-white/10 text-slate-300 px-4 py-2.5 rounded-lg text-sm hover:bg-white/10 hover:text-white transition-all duration-200"
              >
                Copy All
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
