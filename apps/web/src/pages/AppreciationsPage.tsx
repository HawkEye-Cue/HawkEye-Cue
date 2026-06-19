import { useState } from 'react';

interface TagMention {
  id: string;
  taggerName: string;
  taggerTrade: string;
  platform: string;
  postContent: string;
  postUrl: string;
  detectedAt: string;
  thanked: boolean;
}

const MOCK_MENTIONS: TagMention[] = [
  {
    id: '1',
    taggerName: 'Sarah Thompson',
    taggerTrade: 'Real Estate Agent',
    platform: 'facebook',
    postContent: 'Huge shoutout to @YourBusiness for the amazing roof repair! Highly recommend to all my clients. 🏠⭐',
    postUrl: '#',
    detectedAt: '30 min ago',
    thanked: false,
  },
  {
    id: '2',
    taggerName: 'Mike Johnson',
    taggerTrade: 'Insurance Agent',
    platform: 'instagram',
    postContent: 'Great working with @YourBusiness on this claim. Fast, professional, and quality work every time! 💪',
    postUrl: '#',
    detectedAt: '2 hrs ago',
    thanked: false,
  },
  {
    id: '3',
    taggerName: 'Lisa Chen',
    taggerTrade: 'General Contractor',
    platform: 'linkedin',
    postContent: 'Partnered with @YourBusiness on a full home renovation. Their team is top-notch. Looking forward to more projects together!',
    postUrl: '#',
    detectedAt: '1 day ago',
    thanked: true,
  },
];

const platformIcons: Record<string, string> = {
  facebook: '📘',
  instagram: '📷',
  linkedin: '💼',
  tiktok: '🎵',
};

export default function AppreciationsPage() {
  const [mentions, setMentions] = useState<TagMention[]>(MOCK_MENTIONS);
  const [autoReply, setAutoReply] = useState('Thank you so much for the shoutout! 🙏 We love working with you and appreciate the kind words. Looking forward to more great projects together!');
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [editingReply, setEditingReply] = useState(false);

  const handleThank = (id: string) => {
    setMentions(mentions.map((m) =>
      m.id === id ? { ...m, thanked: true } : m
    ));
  };

  const unthanked = mentions.filter((m) => !m.thanked);
  const thanked = mentions.filter((m) => m.thanked);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Appreciations</h2>
      <p className="text-sm text-slate-400">People who tagged you in posts — thank them and build lasting partnerships</p>

      {/* Auto-Reply Section */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-white">Auto-Reply Comment</h3>
            <p className="text-xs text-slate-400">Automatically reply to posts you're tagged in when you can't do it yourself</p>
          </div>
          <button
            onClick={() => setAutoReplyEnabled(!autoReplyEnabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${autoReplyEnabled ? 'bg-blue-600' : 'bg-slate-600'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${autoReplyEnabled ? 'left-7' : 'left-1'}`}></div>
          </button>
        </div>

        {autoReplyEnabled && (
          <>
            {editingReply ? (
              <div className="space-y-2">
                <textarea
                  value={autoReply}
                  onChange={(e) => setAutoReply(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 resize-none h-28 text-sm"
                  placeholder="Write your custom thank-you reply..."
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingReply(false)}
                    className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingReply(false)}
                    className="bg-slate-700 text-slate-300 px-4 py-1.5 rounded-lg text-sm hover:bg-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setEditingReply(true)}
                className="bg-slate-700/50 rounded-lg p-3 cursor-pointer hover:bg-slate-700 transition-colors"
              >
                <p className="text-sm text-slate-300 italic">"{autoReply}"</p>
                <p className="text-xs text-blue-400 mt-2">Click to customize →</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-3 text-center">
          <div className="text-lg font-bold text-white">{mentions.length}</div>
          <div className="text-xs text-slate-400">Total Tags</div>
        </div>
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-3 text-center">
          <div className="text-lg font-bold text-amber-400">{unthanked.length}</div>
          <div className="text-xs text-slate-400">Pending Thanks</div>
        </div>
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-3 text-center">
          <div className="text-lg font-bold text-green-400">{thanked.length}</div>
          <div className="text-xs text-slate-400">Thanked</div>
        </div>
      </div>

      {/* Pending Thanks */}
      {unthanked.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Pending Thanks</h3>
          {unthanked.map((mention) => (
            <div key={mention.id} className="bg-slate-800 rounded-xl border border-amber-700/30 p-4">
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 shrink-0 bg-amber-900/40 rounded-full flex items-center justify-center text-sm font-bold text-amber-300">
                    {mention.taggerName[0]}
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-white">{mention.taggerName}</span>
                    <span className="text-xs text-slate-400 ml-2 block sm:inline">{mention.taggerTrade}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-sm">{platformIcons[mention.platform]}</span>
                  <span className="text-xs text-slate-500">{mention.detectedAt}</span>
                </div>
              </div>
              <p className="text-sm text-slate-300 mb-3 italic">"{mention.postContent}"</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleThank(mention.id)}
                  className="bg-amber-600 text-white px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium hover:bg-amber-700"
                >
                  🙏 Thank Them
                </button>
                <button className="bg-slate-700 text-slate-300 px-4 py-2 min-h-[44px] rounded-lg text-sm hover:bg-slate-600">
                  🤝 Collaborate
                </button>
                <button className="bg-slate-700 text-slate-300 px-4 py-2 min-h-[44px] rounded-lg text-sm hover:bg-slate-600">
                  ↗ View Post
                </button>
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
            <div key={mention.id} className="bg-slate-800 rounded-xl border border-slate-700 p-4 opacity-75">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 bg-green-900/40 rounded-full flex items-center justify-center text-sm font-bold text-green-300">
                    {mention.taggerName[0]}
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-white">{mention.taggerName}</span>
                    <span className="text-xs text-slate-400 ml-2">{mention.taggerTrade}</span>
                  </div>
                </div>
                <span className="text-xs text-green-400">✓ Thanked</span>
              </div>
              <p className="text-sm text-slate-400 italic">"{mention.postContent}"</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button className="bg-slate-700 text-slate-300 px-4 py-2 min-h-[44px] rounded-lg text-sm hover:bg-slate-600">
                  🤝 Collaborate
                </button>
                <button className="bg-slate-700 text-slate-300 px-4 py-2 min-h-[44px] rounded-lg text-sm hover:bg-slate-600">
                  ↗ View Post
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
