import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ApiClient } from '@social-lead-gen/shared';

interface Appreciation {
  id: string;
  taggerName: string;
  taggerTrade: string | null;
  platform: string;
  postContent: string;
  postUrl: string | null;
  detectedAt: string;
  thanked: boolean;
  autoReplied: boolean;
  replyText: string | null;
  replyStatus: string;
}

interface AppreciationSettings {
  autoReplyEnabled: boolean;
  customReplyTemplate: string;
  replyMode: string;
}

const platformIcons: Record<string, string> = {
  facebook: '📘',
  instagram: '📷',
  linkedin: '💼',
  tiktok: '🎵',
};

export default function AppreciationsPage() {
  const { getToken } = useAuth();
  const [mentions, setMentions] = useState<Appreciation[]>([]);
  const [settings, setSettings] = useState<AppreciationSettings>({
    autoReplyEnabled: true,
    customReplyTemplate: '',
    replyMode: 'ai',
  });
  const [loading, setLoading] = useState(true);
  const [editingReply, setEditingReply] = useState(false);
  const [templateDraft, setTemplateDraft] = useState('');
  const [thankingId, setThankingId] = useState<string | null>(null);
  const [generatedReply, setGeneratedReply] = useState<{ id: string; text: string } | null>(null);

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({
      baseUrl: import.meta.env.VITE_API_URL as string,
      getToken: async () => token,
    });
  }

  // Fetch data on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const client = await buildClient();
        const [appreciationsRes, settingsRes] = await Promise.all([
          client.request<{ items: Appreciation[] }>('GET', '/appreciations'),
          client.request<AppreciationSettings>('GET', '/appreciations/settings'),
        ]);
        setMentions(appreciationsRes.items || []);
        setSettings(settingsRes);
        setTemplateDraft(settingsRes.customReplyTemplate || '');
      } catch (e) {
        console.error('Failed to fetch appreciations:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggleAutoReply() {
    const newEnabled = !settings.autoReplyEnabled;
    setSettings((prev) => ({ ...prev, autoReplyEnabled: newEnabled }));
    try {
      const client = await buildClient();
      await client.request('PUT', '/appreciations/settings', {
        ...settings,
        autoReplyEnabled: newEnabled,
      });
    } catch (e) {
      console.error('Failed to update settings:', e);
    }
  }

  async function handleSaveTemplate() {
    setSettings((prev) => ({ ...prev, customReplyTemplate: templateDraft }));
    setEditingReply(false);
    try {
      const client = await buildClient();
      await client.request('PUT', '/appreciations/settings', {
        ...settings,
        customReplyTemplate: templateDraft,
        replyMode: templateDraft.trim() ? 'template' : 'ai',
      });
    } catch (e) {
      console.error('Failed to save template:', e);
    }
  }

  async function handleThank(id: string) {
    setThankingId(id);
    try {
      const client = await buildClient();
      const result = await client.request<{ thanked: boolean; replyText: string }>(
        'PUT',
        `/appreciations/${id}/thank`,
        {}
      );
      setMentions((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, thanked: true, replyText: result.replyText, replyStatus: 'sent' } : m
        )
      );
      setGeneratedReply({ id, text: result.replyText });
    } catch (e) {
      console.error('Failed to thank:', e);
    } finally {
      setThankingId(null);
    }
  }

  const unthanked = mentions.filter((m) => !m.thanked);
  const thanked = mentions.filter((m) => m.thanked);

  if (loading) {
    return <p className="text-slate-400">Loading appreciations…</p>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Appreciations</h2>
      <p className="text-sm text-slate-400">People who tagged you in posts — thank them and build lasting partnerships</p>

      {/* Auto-Reply Section */}
      <div className="glass-card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-white">Auto-Reply</h3>
            <p className="text-xs text-slate-400">
              {settings.replyMode === 'ai'
                ? 'AI generates a personalized thank-you reply for each mention'
                : 'Uses your custom template for replies'}
            </p>
          </div>
          <button
            onClick={handleToggleAutoReply}
            className={`relative w-12 h-6 rounded-full transition-colors ${settings.autoReplyEnabled ? 'bg-blue-600' : 'bg-slate-600'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.autoReplyEnabled ? 'left-7' : 'left-1'}`}></div>
          </button>
        </div>

        {settings.autoReplyEnabled && (
          <>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => {
                  setSettings((prev) => ({ ...prev, replyMode: 'ai' }));
                  buildClient().then((c) => c.request('PUT', '/appreciations/settings', { ...settings, replyMode: 'ai' }));
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  settings.replyMode === 'ai'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                ✨ AI-Generated
              </button>
              <button
                onClick={() => {
                  setSettings((prev) => ({ ...prev, replyMode: 'template' }));
                  setEditingReply(true);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  settings.replyMode === 'template'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                📝 Custom Template
              </button>
            </div>

            {settings.replyMode === 'ai' && !editingReply && (
              <div className="bg-slate-700/50 rounded-lg p-3">
                <p className="text-sm text-slate-300">
                  AI will generate a unique, personalized reply for each person who tags you — using their name, what they said, and your trade context.
                </p>
              </div>
            )}

            {(settings.replyMode === 'template' || editingReply) && (
              <div className="space-y-2">
                <textarea
                  value={templateDraft}
                  onChange={(e) => setTemplateDraft(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 resize-none h-28 text-sm"
                  placeholder="Write your reply template... Use {name} for the person's name and {trade} for your trade."
                />
                <p className="text-xs text-slate-500">Variables: {'{name}'} = tagger's name, {'{trade}'} = your trade</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveTemplate}
                    className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700"
                  >
                    Save Template
                  </button>
                  <button
                    onClick={() => setEditingReply(false)}
                    className="bg-slate-700 text-slate-300 px-4 py-1.5 rounded-lg text-sm hover:bg-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Generated Reply Preview */}
      {generatedReply && (
        <div className="glass-card border-green-500/30 animate-scale-in">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-green-400">✓ Reply Generated</h4>
            <button onClick={() => setGeneratedReply(null)} className="text-xs text-slate-500 hover:text-slate-300">Dismiss</button>
          </div>
          <p className="text-sm text-slate-300 italic mb-2">"{generatedReply.text}"</p>
          <button
            onClick={() => { navigator.clipboard.writeText(generatedReply.text); }}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Copy to clipboard
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="glass-card text-center">
          <div className="text-lg font-bold text-white">{mentions.length}</div>
          <div className="text-xs text-slate-400">Total Tags</div>
        </div>
        <div className="glass-card text-center">
          <div className="text-lg font-bold text-amber-400">{unthanked.length}</div>
          <div className="text-xs text-slate-400">Pending</div>
        </div>
        <div className="glass-card text-center">
          <div className="text-lg font-bold text-green-400">{thanked.length}</div>
          <div className="text-xs text-slate-400">Thanked</div>
        </div>
      </div>

      {/* Empty state */}
      {mentions.length === 0 && (
        <div className="glass-card text-center py-8">
          <p className="text-2xl mb-2">🦅</p>
          <p className="text-slate-300 font-medium">No appreciations yet</p>
          <p className="text-sm text-slate-500 mt-1">
            When people tag you in posts on social media, they'll appear here automatically.
            Connect your social accounts in Settings to enable detection.
          </p>
        </div>
      )}

      {/* Pending Thanks */}
      {unthanked.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Pending Thanks</h3>
          {unthanked.map((mention) => (
            <div key={mention.id} className="glass-card border-amber-500/20">
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 shrink-0 bg-amber-900/40 rounded-full flex items-center justify-center text-sm font-bold text-amber-300">
                    {mention.taggerName[0]}
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-white">{mention.taggerName}</span>
                    {mention.taggerTrade && (
                      <span className="text-xs text-slate-400 ml-2 block sm:inline">{mention.taggerTrade}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-sm">{platformIcons[mention.platform] || '📱'}</span>
                  <span className="text-xs text-slate-500">
                    {new Date(mention.detectedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <p className="text-sm text-slate-300 mb-3 italic">"{mention.postContent}"</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleThank(mention.id)}
                  disabled={thankingId === mention.id}
                  className="bg-amber-600 text-white px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                >
                  {thankingId === mention.id ? '✨ Generating reply...' : '🙏 Thank Them'}
                </button>
                {mention.postUrl && (
                  <a
                    href={mention.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-slate-700 text-slate-300 px-4 py-2 min-h-[44px] rounded-lg text-sm hover:bg-slate-600 flex items-center"
                  >
                    ↗ View Post
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Already Thanked */}
      {thanked.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-green-400 uppercase tracking-wide">Thanked</h3>
          {thanked.map((mention) => (
            <div key={mention.id} className="glass-card opacity-75">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 bg-green-900/40 rounded-full flex items-center justify-center text-sm font-bold text-green-300">
                    {mention.taggerName[0]}
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-white">{mention.taggerName}</span>
                    {mention.taggerTrade && (
                      <span className="text-xs text-slate-400 ml-2">{mention.taggerTrade}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-green-400">✓ Thanked</span>
              </div>
              <p className="text-sm text-slate-400 italic">"{mention.postContent}"</p>
              {mention.replyText && (
                <div className="mt-2 p-2 bg-green-900/20 rounded-lg border border-green-500/20">
                  <p className="text-xs text-green-300">Your reply: "{mention.replyText}"</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
