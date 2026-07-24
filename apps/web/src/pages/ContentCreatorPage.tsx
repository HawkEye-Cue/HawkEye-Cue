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
  const { events, removeEvent, toggleComplete, updateNotes, refreshEvents } = useCalendar();
  const { showToast } = useToast();
  const [activeTrade, setActiveTrade] = useState<Trade | null>(null);
  const [todayPosts, setTodayPosts] = useState<ScheduledPost[]>([]);
  const [showHawkSwoop, setShowHawkSwoop] = useState(false);
  const [personalOnlyCues, setPersonalOnlyCues] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('hawkeye_personal_cues') || '[]')); } catch { return new Set(); }
  });
  const [createMode, setCreateMode] = useState<'ai' | 'own'>('own');
  const [ownContent, setOwnContent] = useState('');
  const [tone, setTone] = useState<'professional' | 'casual' | 'educational' | 'urgent'>('professional');
  const [postLength, setPostLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [userTier, setUserTier] = useState<string>('free');
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
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean | string>(false);
  const [engagementCue, setEngagementCue] = useState<string | null>(null);
  const [engagementType, setEngagementType] = useState<'comment' | 'dm' | 'call' | 'lead'>('comment');
  const [engagementNote, setEngagementNote] = useState('');
  const [engageIndex, setEngageIndex] = useState(0);
  const [flocksTab, setFlocksTab] = useState<'today' | 'missed'>('today');
  const [showReturnBanner, setShowReturnBanner] = useState(false);

  // Cleanup image preview URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => { if (imagePreview) URL.revokeObjectURL(imagePreview); };
  }, [imagePreview]);

  // Refresh calendar events when page loads or gets focus
  useEffect(() => {
    refreshEvents();
    const handleFocus = () => refreshEvents();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshEvents]);

  const EMOJI_LIST = [
    '🔥', '💯', '🙌', '👏', '💪', '🎉', '🚀', '⭐', '✨', '💡',
    '📣', '📢', '🏆', '🎯', '💰', '🤝', '👋', '❤️', '💙', '💚',
    '😍', '🥳', '😎', '🤩', '👀', '📸', '🎬', '🏠', '🔑', '📱',
    '💼', '📊', '📈', '✅', '🛡️', '⚡', '🌟', '🦅', '👇', '👆',
    '📍', '🗓️', '☎️', '📧', '🔗', '💬', '🙏', '🎁', '🆓', '⏰',
  ];

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
        window.dispatchEvent(new CustomEvent('hawkeye-post-preview', { detail: { content: result.platformContent, imagePreview } }));
        localStorage.setItem(`hawkeye_first_post_${user?.sub}`, 'true');
        setShowHawkSwoop(true);
        setTimeout(() => setShowHawkSwoop(false), 1400);
        showToast('✓ Content generated');
      } else if (result.content) {
        // Fallback for old format
        const fallback: Record<string, string> = {};
        for (const p of platforms) {
          fallback[p] = result.content;
        }
        setPlatformContent(fallback);
        localStorage.setItem(`hawkeye_first_post_${user?.sub}`, 'true');
        setShowHawkSwoop(true);
        setTimeout(() => setShowHawkSwoop(false), 1400);
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
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const result = await client.getPosts({ startDate: today, endDate: today });
        const posts = Array.isArray(result) ? result : (result as any)?.posts || [];
        setTodayPosts(posts);
        // Fetch tier
        try {
          const sub = await client.request<{ tier: string }>('GET', '/subscription');
          setUserTier(sub.tier || 'free');
        } catch { /* default free */ }
      } catch { /* ignore */ }
    }
    fetchTodayPosts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const todayStr = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  })();
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

      {/* Hawk Swoop Animation */}
      {showHawkSwoop && (
        <div className="fixed inset-0 pointer-events-none z-[9999]">
          <div className="absolute animate-[hawkSwoop_1.2s_ease-in-out_forwards] text-6xl" style={{ top: '40%', left: '-80px' }}>
            🦅
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-[fadeInOut_1.2s_ease-in-out_forwards]">
            <p className="text-2xl font-bold text-amber-400 text-center drop-shadow-lg">Nailed it! 🔥</p>
          </div>
        </div>
      )}

      {/* Return Banner — shows after user opens a group tab */}
      {showReturnBanner && (
        <div className="sticky top-0 z-40 -mx-3 sm:-mx-4 px-3 sm:px-4 py-3 bg-gradient-to-r from-amber-600 to-orange-500 text-black flex items-center justify-between rounded-b-xl shadow-lg shadow-amber-500/20">
          <div className="flex items-center gap-2">
            <span className="text-lg">🦅</span>
            <div>
              <p className="text-sm font-bold">You're back! Ready for the next flock?</p>
              <p className="text-xs opacity-80">Scroll down to "Copy & Open" your next group</p>
            </div>
          </div>
          <button onClick={() => setShowReturnBanner(false)} className="text-xs font-bold bg-black/20 px-3 py-1.5 rounded-lg hover:bg-black/30">✕ Dismiss</button>
        </div>
      )}

      {/* Mode Toggle */}
      <div className="flex gap-2 bg-slate-700/60 border-2 border-amber-500 rounded-xl p-2 shadow-xl shadow-amber-500/10">
        <button
          onClick={() => setCreateMode('own')}
          className={`flex-1 px-4 py-3.5 rounded-lg text-base font-bold transition-all duration-200 ${
            createMode === 'own' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/40 scale-[1.02]' : 'text-white bg-slate-500/90 hover:bg-slate-400 border border-white/30'
          }`}
        >
          ✍️ Write My Own
        </button>
        <button
          onClick={() => setCreateMode('ai')}
          className={`flex-1 px-4 py-3.5 rounded-lg text-base font-bold transition-all duration-200 ${
            createMode === 'ai' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/40 scale-[1.02]' : 'text-white bg-slate-500/90 hover:bg-slate-400 border border-white/30'
          }`}
        >
          ✨ AI Generate
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
      {/* Write your own - all in one card */}
      <div className="glass-card space-y-4">
        <label className="block text-sm font-medium text-white">✍️ Write Your Post</label>
        <div className="relative">
          <textarea
            id="own-post-textarea"
            value={ownContent}
            onChange={(e) => setOwnContent(e.target.value)}
            placeholder="Write your post here exactly as you want it to appear..."
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 resize-none h-36 focus:border-blue-500/50 focus:outline-none transition-colors"
          />
          <button
            onClick={() => setShowEmojiPicker(showEmojiPicker === 'own' ? false : 'own')}
            className="absolute top-2 right-2 text-lg hover:scale-125 transition-transform"
            title="Add emoji"
          >
            😀
          </button>
          {showEmojiPicker === 'own' && (
            <div className="absolute top-10 right-0 z-50 bg-slate-800 border border-white/20 rounded-xl p-3 shadow-xl w-72 max-h-48 overflow-y-auto">
              <div className="flex flex-wrap gap-1.5">
                {EMOJI_LIST.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      setOwnContent((prev) => prev + emoji);
                      setShowEmojiPicker(false);
                    }}
                    className="text-xl hover:scale-125 hover:bg-white/10 rounded p-1 transition-all"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500">{ownContent.length} characters</p>

        {/* Platforms */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">Post to:</label>
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

        {/* Media */}
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

        {/* Use Post button */}
        <button
          onClick={() => {
            if (!ownContent.trim() || platforms.length === 0) return;
            const content: Record<string, string> = {};
            for (const p of platforms) {
              content[p] = ownContent.trim();
            }
            setPlatformContent(content);
            window.dispatchEvent(new CustomEvent('hawkeye-post-preview', { detail: { content, imagePreview } }));
            setShowHawkSwoop(true);
            setTimeout(() => setShowHawkSwoop(false), 1400);
            showToast('✓ Ready to post');
          }}
          disabled={!ownContent.trim() || platforms.length === 0}
          className="w-full bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-xl text-base font-bold disabled:opacity-50 transition-all duration-200"
        >
          ✍️ Use This Post
        </button>
      </div>
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
              <div className="relative">
                <textarea
                  id={`platform-textarea-${platform}`}
                  value={content}
                  onChange={(e) =>
                    setPlatformContent((prev) =>
                      prev ? { ...prev, [platform]: e.target.value } : prev
                    )
                  }
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white resize-none h-32 focus:border-blue-500/50 focus:outline-none transition-colors text-sm"
                />
                <button
                  onClick={() => setShowEmojiPicker(showEmojiPicker === platform ? false : platform as any)}
                  className="absolute top-2 right-2 text-lg hover:scale-125 transition-transform"
                  title="Add emoji"
                >
                  😀
                </button>
                {showEmojiPicker === platform && (
                  <div className="absolute top-10 right-0 z-50 bg-slate-800 border border-white/20 rounded-xl p-3 shadow-xl w-72 max-h-48 overflow-y-auto">
                    <div className="flex flex-wrap gap-1.5">
                      {EMOJI_LIST.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            setPlatformContent((prev) => prev ? { ...prev, [platform]: prev[platform] + emoji } : prev);
                            setShowEmojiPicker(false);
                          }}
                          className="text-xl hover:scale-125 hover:bg-white/10 rounded p-1 transition-all"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
                      platformContent,
                      platforms,
                      scheduledAt,
                      mediaUrls,
                    });
                    setSuccess('✓ Posted! It will go live in about 2 minutes.');
                    setShowHawkSwoop(true);
                    setTimeout(() => setShowHawkSwoop(false), 1400);
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

                    // Upload media if provided
                    let schedMediaUrls: string[] = [];
                    if (imageFile) {
                      const { url, key } = await client.getUploadUrl(imageFile.name, imageFile.type);
                      await fetch(url, { method: 'PUT', body: imageFile, headers: { 'Content-Type': imageFile.type } });
                      schedMediaUrls = [`${import.meta.env.VITE_MEDIA_BUCKET_URL || 'https://socialleadgen-storage-mediauploadsbucketbce0cf0b-zkbwwljnyurz.s3.amazonaws.com'}/${key}`];
                    } else if (videoFile) {
                      const { url, key } = await client.getUploadUrl(videoFile.name, videoFile.type);
                      await fetch(url, { method: 'PUT', body: videoFile, headers: { 'Content-Type': videoFile.type } });
                      schedMediaUrls = [`${import.meta.env.VITE_MEDIA_BUCKET_URL || 'https://socialleadgen-storage-mediauploadsbucketbce0cf0b-zkbwwljnyurz.s3.amazonaws.com'}/${key}`];
                    }

                    const scheduledAt = new Date(input.value).toISOString();
                    const content = Object.values(platformContent)[0] || '';
                    await client.schedulePosts({
                      contentId: 'generated-' + Date.now(),
                      content,
                      platformContent,
                      platforms,
                      scheduledAt,
                      mediaUrls: schedMediaUrls,
                    });
                    setSuccess('✓ Scheduled! Check the Calendar tab.');
                    setShowHawkSwoop(true);
                    setTimeout(() => setShowHawkSwoop(false), 1400);
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

      {/* Flocks Tabs */}
      <div className="glass-card">
        <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1 mb-3">
          <button
            onClick={() => setFlocksTab('today')}
            className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-all ${flocksTab === 'today' ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-white'}`}
          >
            🦅 Today's Flocks
          </button>
          <button
            onClick={() => setFlocksTab('missed')}
            className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-all ${flocksTab === 'missed' ? 'bg-red-500 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            ⚠️ Missed {(() => { const now = new Date(); const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; const missed = events.filter((e) => e.type === 'post' && e.date < todayLocal && !e.completed); return missed.length > 0 ? `(${missed.length})` : ''; })()}
          </button>
        </div>

        {flocksTab === 'today' && (
        <>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-white">Today's Flocks</span>
          <span className="text-xs text-slate-400">
            {todayCalendarEvents.filter((e) => e.type === 'post' && e.completed).length}/{todayCalendarEvents.filter((e) => e.type === 'post').length} done
          </span>
        </div>
        {/* Copy & Open Next Flock button */}
        {todayCalendarEvents.filter((e) => e.type === 'post' && e.link && !e.completed).length > 0 && platformContent && (
          <div className="space-y-2">
            {(() => {
              const remaining = todayCalendarEvents.filter((e) => e.type === 'post' && e.link && !e.completed);
              const next = remaining[0];
              const isNestTier = ['free', 'nest'].includes(userTier);
              const nestLimit = 3;
              const nestUsedKey = `hawkeye_copyopen_used_${new Date().toISOString().split('T')[0]}`;
              const nestUsedToday = isNestTier ? parseInt(localStorage.getItem(nestUsedKey) || '0') : 0;
              const nestLimitReached = isNestTier && nestUsedToday >= nestLimit;

              if (nestLimitReached) {
                return (
                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center">
                    <p className="text-sm font-bold text-amber-300 mb-1">🔒 Daily Limit Reached (3/3)</p>
                    <p className="text-xs text-slate-400 mb-3">Nest users get 3 Copy & Open per day. Upgrade to Soar for unlimited.</p>
                    <a href="/settings" className="inline-block bg-gradient-to-r from-amber-500 to-orange-500 text-black px-6 py-2 rounded-lg text-sm font-bold hover:opacity-90">Upgrade to Soar — $24.99/mo</a>
                  </div>
                );
              }

              return (
                <>
                  <button
                    onClick={() => {
                      const content = Object.values(platformContent)[0] || '';
                      navigator.clipboard.writeText(content);
                      if (next) {
                        toggleComplete(next.id);
                        setShowHawkSwoop(true);
                        setTimeout(() => setShowHawkSwoop(false), 1400);
                        window.open(next.link!, '_blank');
                        setShowReturnBanner(true);
                        // Track usage for Nest users
                        if (isNestTier) {
                          const used = parseInt(localStorage.getItem(nestUsedKey) || '0') + 1;
                          localStorage.setItem(nestUsedKey, String(used));
                        }
                        // Refresh events to ensure next click picks up the correct next group
                        setTimeout(() => refreshEvents(), 500);
                        showToast(`✓ Copied & opened — ${remaining.length - 1} flock${remaining.length - 1 !== 1 ? 's' : ''} left`);
                      }
                    }}
                    className="w-full px-4 py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black text-sm font-bold rounded-lg transition-all active:scale-95 flex flex-col items-center justify-center gap-1 shadow-lg shadow-amber-500/20"
                  >
                    <span className="text-base">📋 Copy & Open Next Flock</span>
                    <span className="text-xs font-normal opacity-80 truncate max-w-full">{next?.title || 'Next flock'}</span>
                  </button>
                  <p className="text-xs text-slate-400 text-center">{remaining.length} flock{remaining.length !== 1 ? 's' : ''} remaining{isNestTier ? ` • ${nestLimit - nestUsedToday} free uses left today` : ''}</p>
                  <p className="text-xs text-slate-500 text-center mt-1">🦅 Tip: Photos don't copy — add your image manually in each group for best engagement.</p>
                </>
              );
            })()}
          </div>
        )}
        {todayCalendarEvents.filter((e) => e.type === 'post' && e.link && !e.completed).length > 0 && !platformContent && (
          <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
            <p className="text-xs text-amber-300">✨ Generate or write a post above, then use <strong>"Copy & Open Next Flock"</strong> to fly through your groups</p>
          </div>
        )}
        <div className="mt-3 max-h-[400px] overflow-y-auto space-y-2" id="todays-cues-list">
          {[...todayCalendarEvents].filter((e) => e.type === 'post').sort((a, b) => {
            const aPersonal = personalOnlyCues.has(a.id) ? 1 : 0;
            const bPersonal = personalOnlyCues.has(b.id) ? 1 : 0;
            return aPersonal - bPersonal;
          }).map((e, idx, sortedArr) => {
            const isPersonalOnly = personalOnlyCues.has(e.id);
            const firstPersonalIdx = sortedArr.findIndex((ev) => personalOnlyCues.has(ev.id));
            return (
            <details
              key={e.id}
              id={`cue-${e.id}`}
              className={`rounded-lg transition-all duration-300 ${
                e.completed
                  ? 'bg-green-900/20 border border-green-500/20'
                  : isPersonalOnly
                    ? 'bg-purple-500/10 border border-purple-500/30'
                    : idx === sortedArr.findIndex((ev) => !ev.completed && !personalOnlyCues.has(ev.id))
                      ? 'bg-amber-500/10 border border-amber-500/30 shadow-sm shadow-amber-500/10'
                      : 'bg-white/5 border border-transparent'
              }`}
            >
              <summary className="flex items-center justify-between p-2.5 cursor-pointer">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {e.completed ? (
                    <span className="text-green-400 text-lg shrink-0">✓</span>
                  ) : (
                    <span className={`w-2.5 h-2.5 shrink-0 rounded-full ${e.type === 'post' ? 'bg-blue-500' : e.type === 'task' ? 'bg-amber-500' : 'bg-green-500'}`} />
                  )}
                  <span className={`text-sm truncate ${e.completed ? 'line-through text-slate-500' : isPersonalOnly ? 'text-purple-300' : 'text-slate-200'}`}>{e.title}</span>
                  {isPersonalOnly && <span className="text-[10px] bg-purple-600/30 text-purple-300 px-1.5 py-0.5 rounded-full shrink-0">👤</span>}
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
                {!e.completed ? (
                  <button
                    onClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      toggleComplete(e.id);
                      setShowHawkSwoop(true);
                      setTimeout(() => setShowHawkSwoop(false), 1400);
                      setTimeout(() => {
                        const nextUncompleted = todayCalendarEvents.find((ev2) => ev2.id !== e.id && !ev2.completed);
                        if (nextUncompleted) {
                          document.getElementById(`cue-${nextUncompleted.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }, 500);
                    }}
                    className="shrink-0 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg transition-all active:scale-90"
                  >
                    Done ✓
                  </button>
                ) : (
                  <span className="text-xs text-green-400 font-medium shrink-0">Complete</span>
                )}
              </summary>
              <div className="px-3 pb-3 pt-1 border-t border-white/5">
                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    onClick={() => { setEngagementCue(e.title); setEngagementNote(''); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30"
                  >
                    📊 Log Engagement
                  </button>
                  <button
                    onClick={() => {
                      const updated = new Set(personalOnlyCues);
                      if (updated.has(e.id)) { updated.delete(e.id); } else { updated.add(e.id); }
                      setPersonalOnlyCues(updated);
                      localStorage.setItem('hawkeye_personal_cues', JSON.stringify([...updated]));
                      showToast(updated.has(e.id) ? '👤 Marked as personal-only flock' : '🏢 Marked as business page OK');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isPersonalOnly
                        ? 'bg-purple-600 text-white'
                        : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
                    }`}
                >
                  {isPersonalOnly ? '👤 Personal Only' : '👤 Mark as Personal Only'}
                  </button>
                </div>
                <label className="text-xs text-slate-500 block mb-1">Notes</label>
                <textarea
                  defaultValue={e.notes || ''}
                  id={`cue-notes-${e.id}`}
                  placeholder="Add notes, reminders, or anything you want to remember..."
                  className="w-full px-2.5 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 resize-none h-20 focus:border-blue-500/50 focus:outline-none"
                />
                {e.notesSavedAt && (
                  <p className="text-[10px] text-slate-500 mt-1">Last saved: {new Date(e.notesSavedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(e.notesSavedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
                )}
                <button
                  onClick={async () => {
                    const textarea = document.getElementById(`cue-notes-${e.id}`) as HTMLTextAreaElement;
                    const val = textarea?.value?.trim() || '';
                    await updateNotes(e.id, val);
                    showToast('✓ Notes saved');
                  }}
                  className="mt-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all active:scale-95"
                >
                  💾 Save Notes
                </button>
              </div>
            </details>
          );
          })}
          {todayPosts.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
              <div className="min-w-0">
                <p className="text-sm text-slate-300 truncate">📤 {(p.content || 'Scheduled post').slice(0, 40)}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${p.status === 'published' ? 'bg-green-900/40 text-green-400' : 'bg-blue-900/40 text-blue-400'}`}>{p.status}</span>
            </div>
          ))}
          {todayCalendarEvents.filter((e) => e.type === 'post').length === 0 && todayPosts.length === 0 && (
            <p className="text-sm text-slate-500">No flocks scheduled for today</p>
          )}
          {todayCalendarEvents.filter((e) => e.type === 'post').length > 0 && todayCalendarEvents.filter((e) => e.type === 'post').every((e) => e.completed) && (
            <div className="mt-4 space-y-3">
              <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/20 to-green-500/20 border border-amber-500/30 text-center relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute animate-[hawkSwoop_3s_ease-in-out_infinite] text-4xl" style={{ top: '20%', left: '-60px' }}>🦅</div>
                </div>
                <div className="text-3xl mb-2">🎉</div>
                <p className="text-lg font-bold text-amber-300">Today's flocks are done!</p>
                <p className="text-sm text-slate-300 mt-1">Now engage — check for comments, reply, and build relationships.</p>
              </div>
              {/* Engage Flocks Flow */}
              {(() => {
                const groupsWithLinks = todayCalendarEvents.filter((e) => e.type === 'post' && e.link);
                if (groupsWithLinks.length === 0) return null;
                const currentEngageGroup = groupsWithLinks[engageIndex];
                const allEngaged = engageIndex >= groupsWithLinks.length;
                return (
                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                    <p className="text-sm font-bold text-blue-300 mb-2">💬 Engage Your Flocks</p>
                    <p className="text-xs text-slate-400 mb-3">Fly back into each group to like, comment, and connect. This boosts your visibility.</p>
                    {!allEngaged ? (
                      <>
                        <button
                          onClick={() => {
                            window.open(currentEngageGroup.link!, '_blank');
                            setEngageIndex((i) => i + 1);
                            showToast(`💬 Opened — ${groupsWithLinks.length - engageIndex - 1} flock${groupsWithLinks.length - engageIndex - 1 !== 1 ? 's' : ''} left`);
                          }}
                          className="w-full px-4 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-bold rounded-lg transition-all active:scale-95 flex flex-col items-center justify-center gap-1 shadow-lg shadow-blue-500/20"
                        >
                          <span className="text-base">💬 Open Next Flock to Engage</span>
                          <span className="text-xs font-normal opacity-80 truncate max-w-full">{currentEngageGroup.title}</span>
                        </button>
                        <p className="text-xs text-slate-400 text-center mt-2">{groupsWithLinks.length - engageIndex} flock{groupsWithLinks.length - engageIndex !== 1 ? 's' : ''} remaining — open, engage, come back, repeat</p>
                      </>
                    ) : (
                      <div className="text-center py-3">
                        <p className="text-lg">🏆</p>
                        <p className="text-sm font-bold text-green-300 mt-1">All flocks engaged!</p>
                        <p className="text-xs text-slate-400 mt-1">Great work — consistent engagement builds trust.</p>
                        <button onClick={() => setEngageIndex(0)} className="mt-3 text-xs text-blue-400 hover:text-blue-300">↺ Start over</button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        </>
        )}

        {flocksTab === 'missed' && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-white">⚠️ Missed Flocks</span>
            <span className="text-xs text-slate-400">Uncompleted posts from previous days</span>
          </div>
          {(() => {
            const now = new Date();
            const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const missedPosts = events.filter((e) => e.type === 'post' && e.date < todayLocal && !e.completed);
            
            if (missedPosts.length === 0) {
              return (
                <div className="text-center py-6">
                  <p className="text-2xl mb-2">✅</p>
                  <p className="text-sm text-green-300 font-medium">No missed flocks!</p>
                  <p className="text-xs text-slate-500 mt-1">You're all caught up.</p>
                </div>
              );
            }

            // Group missed posts by date
            const byDate: Record<string, typeof missedPosts> = {};
            for (const post of missedPosts) {
              if (!byDate[post.date]) byDate[post.date] = [];
              byDate[post.date].push(post);
            }
            const sortedDates = Object.keys(byDate).sort().reverse();

            return (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {sortedDates.map((date) => {
                  const posts = byDate[date];
                  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                  return (
                    <details key={date} className="rounded-lg bg-red-500/5 border border-red-500/20" open={sortedDates.indexOf(date) === 0}>
                      <summary className="flex items-center justify-between p-2.5 cursor-pointer">
                        <span className="text-xs font-medium text-red-300">{dateLabel}</span>
                        <span className="text-xs text-slate-500">{posts.length} missed</span>
                      </summary>
                      <div className="px-2.5 pb-2.5 space-y-1.5">
                        {posts.map((post) => (
                          <div key={post.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                            <span className="text-xs text-slate-300 flex-1 truncate">{post.title}</span>
                            <div className="flex gap-1 shrink-0">
                              {post.link && (
                                <button
                                  onClick={() => {
                                    if (platformContent) {
                                      navigator.clipboard.writeText(Object.values(platformContent)[0] || '');
                                      showToast('📋 Copied!');
                                    }
                                    window.open(post.link!, '_blank');
                                  }}
                                  className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-1 rounded font-medium hover:bg-amber-500/30"
                                >
                                  {platformContent ? '📋 Post Now' : '🔗 Open'}
                                </button>
                              )}
                              <button
                                onClick={() => { toggleComplete(post.id); showToast('✓ Marked done'); }}
                                className="text-[10px] bg-green-500/20 text-green-300 px-2 py-1 rounded font-medium hover:bg-green-500/30"
                              >
                                ✓ Done
                              </button>
                              <button
                                onClick={() => removeEvent(post.id)}
                                className="text-[10px] bg-red-500/20 text-red-300 px-2 py-1 rounded font-medium hover:bg-red-500/30"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            );
          })()}
        </>
        )}
      </div>

      {/* Engagement Log Modal */}
      {engagementCue && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="glass-card-strong w-full max-w-sm animate-scale-in">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white text-sm">📊 Log Engagement</h3>
              <button onClick={() => setEngagementCue(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <p className="text-xs text-slate-400 mb-3">From: <span className="text-white">{engagementCue}</span></p>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Type</label>
                <div className="grid grid-cols-4 gap-1">
                  {([['comment', '💬'], ['dm', '📩'], ['call', '📞'], ['lead', '🎯']] as const).map(([type, icon]) => (
                    <button
                      key={type}
                      onClick={() => setEngagementType(type as any)}
                      className={`py-2 rounded-lg text-xs font-medium capitalize ${engagementType === type ? 'bg-purple-600 text-white' : 'bg-white/5 text-slate-300 border border-white/10'}`}
                    >
                      {icon} {type}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={engagementNote}
                  onChange={(e) => setEngagementNote(e.target.value)}
                  placeholder="e.g. Asked about coverage options"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
                />
              </div>
              <button
                onClick={async () => {
                  try {
                    const token = await getToken();
                    const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
                    await client.request('POST', '/calendar/engagement', {
                      groupName: engagementCue,
                      engagementType,
                      note: engagementNote,
                      date: new Date().toISOString().split('T')[0],
                    });
                    showToast('📊 Engagement logged!');
                    setEngagementCue(null);
                  } catch {
                    showToast('❌ Failed to log');
                  }
                }}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Save Engagement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
