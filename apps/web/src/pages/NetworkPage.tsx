import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTrade } from '../contexts/TradeContext';
import { TRADES, ApiClient } from '@social-lead-gen/shared';
import type { NetworkPost, NetworkContact } from '@social-lead-gen/shared';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
  CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',
  IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',
  ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',
  MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',
  WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
};

const POST_TYPES = [
  { value: 'referral', label: '🤝 Referral' },
  { value: 'opportunity', label: '🎯 Opportunity' },
  { value: 'introduction', label: '👋 Introduction' },
  { value: 'question', label: '❓ Question' },
];

export default function NetworkPage() {
  const { getToken, user } = useAuth();
  const { selectedTrade } = useTrade();

  // --- Region State ---
  const [userRegions, setUserRegions] = useState<string[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [pendingRegions, setPendingRegions] = useState<string[]>([]);
  const [savingRegions, setSavingRegions] = useState(false);

  // --- Board State ---
  const [posts, setPosts] = useState<NetworkPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [filter, setFilter] = useState<string[]>([]);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState('referral');
  const [newTradeFilter, setNewTradeFilter] = useState('all');
  const [posting, setPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyingLoading, setReplyingLoading] = useState(false);
  const [postError, setPostError] = useState('');

  // --- Contacts State ---
  const [contacts, setContacts] = useState<NetworkContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactTrade, setContactTrade] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactNotes, setContactNotes] = useState('');
  const [addingContact, setAddingContact] = useState(false);

  // --- Tab ---
  const [activeTab, setActiveTab] = useState<'board' | 'contacts'>('board');

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
  }

  // Fetch user's regions on mount
  useEffect(() => {
    async function fetchRegion() {
      try {
        const client = await buildClient();
        const result = await client.getNetworkRegion();
        setUserRegions(result.regions || []);
        if (!result.regions || result.regions.length === 0) {
          setShowRegionPicker(true);
        }
      } catch { /* ignore */ }
      finally { setRegionsLoading(false); }
    }
    fetchRegion();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch posts when regions are set
  useEffect(() => {
    if (userRegions.length === 0) {
      setPostsLoading(false);
      return;
    }
    async function fetchPosts() {
      setPostsLoading(true);
      try {
        const client = await buildClient();
        const result = await client.getNetworkPosts({ trade: filter.length > 0 ? filter.join(',') : undefined });
        setPosts(result.posts);
      } catch { /* ignore */ }
      finally { setPostsLoading(false); }
    }
    fetchPosts();
  }, [userRegions, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch contacts
  useEffect(() => {
    async function fetchContacts() {
      try {
        const client = await buildClient();
        const result = await client.getNetworkContacts();
        setContacts(result.contacts);
      } catch { /* ignore */ }
      finally { setContactsLoading(false); }
    }
    fetchContacts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveRegions() {
    if (pendingRegions.length === 0) return;
    setSavingRegions(true);
    try {
      const client = await buildClient();
      const result = await client.setNetworkRegion(pendingRegions);
      setUserRegions(result.regions);
      setShowRegionPicker(false);
    } catch { /* ignore */ }
    finally { setSavingRegions(false); }
  }

  function togglePendingRegion(state: string) {
    setPendingRegions((prev) =>
      prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]
    );
  }

  async function handlePost() {
    if (!newContent.trim()) return;
    setPosting(true);
    setPostError('');
    try {
      const client = await buildClient();
      const post = await client.createNetworkPost({ content: newContent.trim(), type: newType, tradeFilter: newTradeFilter });
      setPosts([post, ...posts]);
      setNewContent('');
    } catch (e) {
      setPostError(e instanceof Error ? e.message : 'Failed to post');
    } finally { setPosting(false); }
  }

  async function handleReply(postId: string) {
    if (!replyContent.trim()) return;
    setReplyingLoading(true);
    try {
      const client = await buildClient();
      const reply = await client.replyToNetworkPost(postId, replyContent.trim());
      setPosts(posts.map((p) => p.id === postId ? { ...p, replies: [...(p.replies || []), reply] } : p));
      setReplyContent('');
      setReplyingTo(null);
    } catch { /* ignore */ }
    finally { setReplyingLoading(false); }
  }

  async function handleDeletePost(postId: string) {
    try {
      const client = await buildClient();
      await client.deleteNetworkPost(postId);
      setPosts(posts.filter((p) => p.id !== postId));
    } catch { /* ignore */ }
  }

  async function handleAddContact() {
    if (!contactName.trim()) return;
    setAddingContact(true);
    try {
      const client = await buildClient();
      const contact = await client.addNetworkContact({
        name: contactName.trim(),
        trade: contactTrade || selectedTrade?.name || 'Unknown',
        phone: contactPhone,
        email: contactEmail,
        notes: contactNotes,
      });
      setContacts([contact, ...contacts]);
      setContactName(''); setContactTrade(''); setContactPhone(''); setContactEmail(''); setContactNotes('');
      setShowAddContact(false);
    } catch { /* ignore */ }
    finally { setAddingContact(false); }
  }

  async function handleDeleteContact(id: string) {
    try {
      const client = await buildClient();
      await client.deleteNetworkContact(id);
      setContacts(contacts.filter((c) => c.id !== id));
    } catch { /* ignore */ }
  }

  const typeColors: Record<string, string> = {
    referral: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    opportunity: 'text-green-400 bg-green-500/10 border-green-500/20',
    introduction: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    question: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  };

  if (regionsLoading) {
    return <p className="text-sm text-slate-500">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Collaborate</h2>
        {userRegions.length > 0 && (
          <button
            onClick={() => { setPendingRegions(userRegions); setShowRegionPicker(true); }}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            📍 {userRegions.join(', ')}
          </button>
        )}
      </div>
      <p className="text-sm text-slate-400">Connect with trades in your area for referrals and partnerships</p>

      {/* Region Picker Modal */}
      {showRegionPicker && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="glass-card-strong w-full max-w-md animate-scale-in max-h-[80vh] overflow-y-auto">
            <h3 className="font-bold text-white mb-2">Select Your State(s)</h3>
            <p className="text-sm text-slate-400 mb-4">Choose all states you're licensed to operate in. You'll see posts from other trades in those areas.</p>

            <div className="grid grid-cols-5 gap-1.5 mb-4">
              {US_STATES.map((s) => (
                <button
                  key={s}
                  onClick={() => togglePendingRegion(s)}
                  className={`px-2 py-2 rounded text-xs font-medium transition-all ${
                    pendingRegions.includes(s)
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                  title={STATE_NAMES[s]}
                >
                  {s}
                </button>
              ))}
            </div>

            {pendingRegions.length > 0 && (
              <p className="text-xs text-slate-400 mb-3">
                Selected: {pendingRegions.map((r) => STATE_NAMES[r] || r).join(', ')}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleSaveRegions}
                disabled={savingRegions || pendingRegions.length === 0}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                {savingRegions ? 'Saving...' : `Save (${pendingRegions.length} state${pendingRegions.length !== 1 ? 's' : ''})`}
              </button>
              {userRegions.length > 0 && (
                <button
                  onClick={() => setShowRegionPicker(false)}
                  className="px-4 py-2.5 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Needs region prompt */}
      {userRegions.length === 0 && !showRegionPicker && (
        <div className="glass-card text-center py-8">
          <p className="text-slate-400 mb-3">Set your state(s) to see posts from trades in your area</p>
          <button
            onClick={() => { setPendingRegions([]); setShowRegionPicker(true); }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Select States
          </button>
        </div>
      )}

      {userRegions.length > 0 && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('board')}
              className={`flex-1 px-3 py-2 rounded text-sm transition-all ${activeTab === 'board' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
            >
              💬 Board
            </button>
            <button
              onClick={() => setActiveTab('contacts')}
              className={`flex-1 px-3 py-2 rounded text-sm transition-all ${activeTab === 'contacts' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
            >
              📇 My Contacts
            </button>
          </div>

          {activeTab === 'board' && (
            <>
              {/* Trade Filter */}
              <details className="glass-card">
                <summary className="font-medium text-white cursor-pointer flex items-center justify-between text-sm">
                  <span>Filter by Trade</span>
                  <span className="text-xs text-slate-400">{filter.length === 0 ? 'All' : `${filter.length} selected`}</span>
                </summary>
                <div className="mt-3 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                  {TRADES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setFilter((prev) => prev.includes(t.name) ? prev.filter((f) => f !== t.name) : [...prev, t.name])}
                      className={`px-2.5 py-1.5 rounded-full text-xs transition-all ${
                        filter.includes(t.name)
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
                {filter.length > 0 && (
                  <button
                    onClick={() => setFilter([])}
                    className="mt-2 text-xs text-slate-400 hover:text-white"
                  >
                    Clear all
                  </button>
                )}
              </details>

              {/* New Post */}
              <div className="glass-card">
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePost(); } }}
                  placeholder="Post a referral request, opportunity, or introduction..."
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 resize-none h-20 focus:border-blue-500/50 focus:outline-none transition-colors"
                />
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                  >
                    {POST_TYPES.map((pt) => (
                      <option key={pt.value} value={pt.value}>{pt.label}</option>
                    ))}
                  </select>
                  <select
                    value={newTradeFilter}
                    onChange={(e) => setNewTradeFilter(e.target.value)}
                    className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                  >
                    <option value="all">Visible to All</option>
                    {TRADES.map((t) => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handlePost}
                    disabled={posting || !newContent.trim()}
                    className="ml-auto bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50 active:scale-95 transition-all"
                  >
                    {posting ? 'Posting...' : 'Post'}
                  </button>
                </div>
                {postError && <p className="text-sm text-red-400 mt-2">{postError}</p>}
              </div>

              {/* Posts Feed */}
              {postsLoading ? (
                <p className="text-sm text-slate-500">Loading posts...</p>
              ) : posts.length === 0 ? (
                <div className="glass-card text-center py-8">
                  <p className="text-slate-400">No posts in your area yet. Be the first to start a conversation!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {posts.map((post) => (
                    <div key={post.id} className="glass-card">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-9 h-9 shrink-0 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-sm font-bold text-white">
                            {post.authorName[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-semibold text-white">{post.authorName}</span>
                            <span className="text-xs text-blue-400 ml-2">{post.authorTrade}</span>
                            <p className="text-xs text-slate-500">
                              {new Date(post.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              {(post as any).region && <span className="ml-1">• 📍 {(post as any).region}</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${typeColors[post.type] || typeColors.referral}`}>
                            {post.type}
                          </span>
                          {post.userId === user?.sub && (
                            <button onClick={() => handleDeletePost(post.id)} className="text-xs text-red-400 hover:text-red-300">✕</button>
                          )}
                        </div>
                      </div>

                      <p className="text-sm text-slate-300 mt-3">{post.content}</p>

                      {/* Replies */}
                      {post.replies && post.replies.length > 0 && (
                        <div className="mt-3 pl-4 border-l border-white/10 space-y-2">
                          {post.replies.map((reply) => (
                            <div key={reply.id} className="text-sm">
                              <span className="font-medium text-white">{reply.authorName}</span>
                              <span className="text-xs text-slate-500 ml-2">{reply.authorTrade}</span>
                              <p className="text-slate-400 mt-0.5">{reply.content}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Reply button */}
                      <div className="mt-3 flex items-center gap-3">
                        <button
                          onClick={() => setReplyingTo(replyingTo === post.id ? null : post.id)}
                          className="text-xs text-slate-400 hover:text-blue-400 min-h-[44px] flex items-center transition-colors"
                        >
                          💬 Reply {post.replies?.length ? `(${post.replies.length})` : ''}
                        </button>
                      </div>

                      {replyingTo === post.id && (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleReply(post.id); }}
                            placeholder="Write a reply..."
                            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
                            autoFocus
                          />
                          <button
                            onClick={() => handleReply(post.id)}
                            disabled={replyingLoading || !replyContent.trim()}
                            className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-500 disabled:opacity-50"
                          >
                            Send
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'contacts' && (
            <>
              <button
                onClick={() => setShowAddContact(!showAddContact)}
                className="w-full glass-card text-center py-3 text-blue-400 hover:text-blue-300 font-medium text-sm transition-colors"
              >
                {showAddContact ? '− Cancel' : '+ Add Referral Partner'}
              </button>

              {showAddContact && (
                <div className="glass-card space-y-3 animate-scale-in">
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Name *"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
                  />
                  <select
                    value={contactTrade}
                    onChange={(e) => setContactTrade(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                  >
                    <option value="">Select their trade...</option>
                    {TRADES.map((t) => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="Phone"
                      className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
                    />
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="Email"
                      className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500"
                    />
                  </div>
                  <textarea
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                    placeholder="Notes (e.g. how you know them, specialties)"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 resize-none h-16"
                  />
                  <button
                    onClick={handleAddContact}
                    disabled={addingContact || !contactName.trim()}
                    className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50 active:scale-95 transition-all"
                  >
                    {addingContact ? 'Adding...' : 'Save Contact'}
                  </button>
                </div>
              )}

              {contactsLoading ? (
                <p className="text-sm text-slate-500">Loading contacts...</p>
              ) : contacts.length === 0 ? (
                <div className="glass-card text-center py-8">
                  <p className="text-slate-400 mb-2">No contacts yet</p>
                  <p className="text-xs text-slate-500">Add referral partners, networking contacts, and collaborators.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {contacts.map((contact) => (
                    <div key={contact.id} className="glass-card">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{contact.name}</span>
                            <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">{contact.trade}</span>
                          </div>
                          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-400">
                            {contact.phone && <span>📞 {contact.phone}</span>}
                            {contact.email && <span>✉️ {contact.email}</span>}
                          </div>
                          {contact.notes && <p className="text-xs text-slate-500 mt-1.5">{contact.notes}</p>}
                        </div>
                        <button
                          onClick={() => handleDeleteContact(contact.id)}
                          className="text-xs text-red-400 hover:text-red-300 shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
