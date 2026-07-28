import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTrade } from '../contexts/TradeContext';
import { useToast } from '../contexts/ToastContext';
import TradeSelector from '../components/TradeSelector';
import ExtensionTour from '../components/ExtensionTour';
import LeadDetectionExplainer from '../components/LeadDetectionExplainer';
import { ApiClient } from '@social-lead-gen/shared';
import type { Subscription, SocialAccount } from '@social-lead-gen/shared';

export default function SettingsPage() {
  const { user, getToken, logout } = useAuth();
  const { selectedTrade } = useTrade();
  const { showToast } = useToast();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);
  const [socialLoading, setSocialLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<{ id: string; keyword: string }[]>([]);
  const [keywordsLoading, setKeywordsLoading] = useState(true);
  const [newKeyword, setNewKeyword] = useState('');
  const [addingKeyword, setAddingKeyword] = useState(false);
  const [keywordError, setKeywordError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showExtensionTour, setShowExtensionTour] = useState(false);
  const [showLeadExplainer, setShowLeadExplainer] = useState(false);

  // Check for checkout success/cancelled in URL params
  const params = new URLSearchParams(window.location.search);
  const checkoutStatus = params.get('checkout');

  // Scroll to suggestion box if hash is #suggestion
  useEffect(() => {
    if (window.location.hash === '#suggestion') {
      setTimeout(() => {
        document.getElementById('suggestion')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, []);

  async function buildClient() {
    const token = await getToken();
    return new ApiClient({
      baseUrl: import.meta.env.VITE_API_URL as string,
      getToken: async () => token,
    });
  }

  // Fetch current subscription on mount
  useEffect(() => {
    async function fetchSubscription() {
      try {
        const client = await buildClient();
        const sub = await client.getSubscription();
        setSubscription(sub);
      } catch {
        // User may not have a subscription record yet
      } finally {
        setSubLoading(false);
      }
    }
    fetchSubscription();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch connected social accounts
  useEffect(() => {
    async function fetchSocialAccounts() {
      try {
        const client = await buildClient();
        const { accounts } = await client.getSocialAccounts();
        setSocialAccounts(accounts);
      } catch {
        // User may not have connected any accounts yet
      } finally {
        setSocialLoading(false);
      }
    }
    fetchSocialAccounts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch keywords
  useEffect(() => {
    async function fetchKeywords() {
      try {
        const client = await buildClient();
        const result = await client.getKeywords();
        const kws = Array.isArray(result) ? result : (result as any)?.keywords || [];
        setKeywords(kws);
        if (kws.length > 0) localStorage.setItem(`hawkeye_keywords_added_${user?.sub}`, 'true');
      } catch { /* ignore */ }
      finally { setKeywordsLoading(false); }
    }
    fetchKeywords();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnectSocial(platforms?: string[]) {
    setConnectingPlatform(platforms?.[0] || 'all');
    try {
      const client = await buildClient();
      const result = await client.getConnectLink(platforms);
      const url = result?.connectUrl;
      if (url) {
        // Use location.assign for better mobile compatibility
        window.location.assign(url);
      } else {
        setConnectingPlatform(null);
        alert('Could not get connect link. Please try again.');
      }
    } catch (e) {
      console.error('Failed to get connect link:', e);
      const msg = e instanceof Error ? e.message : 'Connection failed';
      alert('Unable to connect right now. Please try again in a moment. If this persists, contact support.');
      setConnectingPlatform(null);
    }
  }

  async function handleDisconnect(accountId: string) {
    try {
      const client = await buildClient();
      await client.disconnectSocialAccount(accountId);
      setSocialAccounts((prev) => prev.filter((a) => a.id !== accountId));
    } catch (e) {
      console.error('Failed to disconnect account:', e);
    }
  }

  async function handleUpgrade(tier: 'base' | 'growth' | 'soar' | 'team') {
    setLoadingTier(tier);
    setCheckoutError(null);
    try {
      const client = await buildClient();
      const { checkoutUrl } = await client.createCheckout(tier, couponCode.trim() || undefined);
      window.location.href = checkoutUrl;
    } catch (e: unknown) {
      console.error('[Checkout] Error:', e);
      const message = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      setCheckoutError(message);
      setLoadingTier(null);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    setCheckoutError(null);
    try {
      const client = await buildClient();
      await client.cancelSubscription();
      // Refresh subscription state
      const sub = await client.getSubscription();
      setSubscription(sub);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Something went wrong.';
      setCheckoutError(message);
    } finally {
      setCancelling(false);
    }
  }

  const currentTier = subscription?.tier ?? 'free';

  function tierLabel(tier: string) {
    const labels: Record<string, string> = { free: 'Nest (Free)', nest: 'Nest (Free)', base: 'Soar', flight: 'Soar', growth: 'Soar', soar: 'Soar', team: 'Summit', summit: 'Summit' };
    return labels[tier] ?? tier;
  }

  return (
    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
      {/* Left column: account info, trade selector, subscription plans */}
      <div className="min-w-0 space-y-4">
      <h2 className="text-xl font-bold text-white">Settings</h2>

      {/* Team Management Link */}
      {currentTier === 'team' ? (
        <Link to="/team" className="glass-card flex items-center justify-between hover:bg-white/5 transition-colors">
          <div>
            <p className="text-sm font-medium text-white">👥 Team Management</p>
            <p className="text-xs text-slate-400">Manage your team, invite members, view stats</p>
          </div>
          <span className="text-slate-500">→</span>
        </Link>
      ) : (
        <div className="glass-card flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">👥 Team Management</p>
            <p className="text-xs text-slate-400">Invite up to 5 members, shared stats & leaderboard</p>
          </div>
          <button
            onClick={() => handleUpgrade('team')}
            disabled={loadingTier !== null}
            className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loadingTier === 'team' ? '...' : 'Upgrade'}
          </button>
        </div>
      )}

      {/* Hawk Insights */}
      <Link to="/hawk-insights" className="glass-card flex items-center justify-between hover:bg-white/5 transition-colors">
        <div>
          <p className="text-sm font-medium text-white">🦅 Hawk Insights</p>
          <p className="text-xs text-slate-400">See where your leads come from, top platforms, peak times</p>
        </div>
        <span className="text-slate-500">→</span>
      </Link>

      {/* Checkout success/cancel banners */}
      {checkoutStatus === 'success' && (
        <div className="p-3 rounded-lg bg-green-950/40 border border-green-500/40 text-sm text-green-300">
          🎉 Subscription activated! Welcome to the {tierLabel(currentTier)} plan.
        </div>
      )}
      {checkoutStatus === 'cancelled' && (
        <div className="p-3 rounded-lg bg-yellow-950/40 border border-yellow-500/40 text-sm text-yellow-300">
          Checkout was cancelled. No charge was made.
        </div>
      )}

      <div className="glass-card">
        <h3 className="font-semibold mb-3 text-white">Account</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-slate-400 shrink-0">Email</span>
            <span className="text-white truncate">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Trade</span>
            <span className="text-white">{selectedTrade?.name ?? 'Not selected'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Current Plan</span>
            <span className="text-white font-medium">
              {subLoading ? '…' : tierLabel(currentTier)}
            </span>
          </div>
          {subscription?.currentPeriodEnd && (
            <div className="flex justify-between">
              <span className="text-slate-400">Renews</span>
              <span className="text-white">
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      </div>

      <TradeSelector />

      {/* Connected Social Accounts */}
      <div className="glass-card">
        <h3 className="font-semibold mb-3 text-white">Connected Social Accounts</h3>
        <p className="text-sm text-slate-400 mb-2">
          Connect your social media accounts to publish posts directly from HawkEye.
        </p>
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
          <p className="text-xs text-amber-300 font-medium">⚠️ Business Pages Required</p>
          <p className="text-xs text-slate-400 mt-1">You must connect a <strong className="text-white">Facebook Business Page</strong> or <strong className="text-white">Instagram Business/Creator account</strong>. Personal profiles cannot be connected. If you don't have a business page, create one on Facebook first, then connect it here.</p>
          <p className="text-xs text-slate-400 mt-2">📌 When prompted, select <strong className="text-amber-300">"Business Access"</strong> — not "Standard Access." This allows HawkEye-Cue to post on your behalf.</p>
        </div>

        {socialLoading ? (
          <p className="text-sm text-slate-500">Loading accounts…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {(() => {
                const connectedTypes = new Set(socialAccounts.map((a) => a.type));
                const platforms = [
                  { type: 'FACEBOOK', label: 'Facebook', icon: '📘', color: 'blue' },
                  { type: 'INSTAGRAM', label: 'Instagram', icon: '📷', color: 'pink' },
                  { type: 'LINKEDIN', label: 'LinkedIn', icon: '💼', color: 'sky' },
                  { type: 'TIKTOK', label: 'TikTok', icon: '🎵', color: 'slate' },
                ];

                return platforms.map((p) => {
                  const connected = socialAccounts.find((a) => a.type === p.type);
                  if (connected) {
                    return (
                      <div
                        key={p.type}
                        className="px-4 py-2 bg-green-600/20 border border-green-500/30 rounded-lg text-sm text-green-300 flex items-center gap-2"
                      >
                        <span>{p.icon}</span>
                        <span className="truncate max-w-[100px]">{connected.name || p.label}</span>
                        <span className="text-green-400 text-xs">✓</span>
                        <button
                          onClick={() => handleConnectSocial([p.type])}
                          disabled={connectingPlatform !== null}
                          className="text-xs text-slate-400 hover:text-white ml-1"
                          title="Switch account"
                        >
                          ↻
                        </button>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={p.type}
                      onClick={() => handleConnectSocial([p.type])}
                      disabled={connectingPlatform !== null}
                      className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-300 hover:bg-white/10 disabled:opacity-50"
                    >
                      {connectingPlatform === p.type ? 'Connecting…' : `+ ${p.label}`}
                    </button>
                  );
                });
              })()}
            </div>
          </>
        )}
      </div>

      {/* Active subscription management */}
      {currentTier !== 'free' && (
        <div className="glass-card">
          <h3 className="font-semibold mb-3 text-white">Manage Subscription</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">
                You're on the <span className="text-white font-medium">{tierLabel(currentTier)}</span> plan.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                AI generations: {subscription?.aiGenerationsUsed ?? 0} / {subscription?.aiGenerationsLimit ?? 0} this period
              </p>
            </div>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="text-sm text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelling ? 'Cancelling…' : 'Cancel Plan'}
            </button>
          </div>
        </div>
      )}

      {/* Subscription Plans */}
      <div className="glass-card">
        <h3 className="font-semibold mb-4 text-white">
          {currentTier === 'free' ? 'Choose a Plan' : 'Upgrade Plan'}
        </h3>

        {checkoutError && (
          <div className="mb-3 p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-sm text-red-300">
            {checkoutError}
          </div>
        )}

        {/* Coupon Code Input */}
        <div className="mb-4">
          <label className="block text-sm text-slate-400 mb-1">Have a coupon code?</label>
          <input
            type="text"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            placeholder="Enter coupon code"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 focus:border-blue-500/50 focus:outline-none"
          />
          {couponCode.trim() && (
            <p className="text-xs text-green-400 mt-1">🎟️ Code "{couponCode.trim()}" will be applied at checkout</p>
          )}
        </div>

        {/* Pricing Tiers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Soar */}
          <div className={`border rounded-xl p-4 ${['growth', 'flight', 'base', 'soar'].includes(currentTier) ? 'border-green-500/50 bg-green-950/20' : 'border-amber-500/50 bg-amber-950/20'}`}>
            <div className="mb-2">
              <span className="text-lg font-bold text-white">🚀 Soar</span>
              <span className="ml-1 bg-amber-500 text-black px-1.5 py-0.5 rounded text-xs font-bold">Popular</span>
              <p className="text-sm text-amber-400">$24.99/mo</p>
            </div>
            {['growth', 'flight', 'base', 'soar'].includes(currentTier) && <span className="inline-block bg-green-600 text-white px-2 py-0.5 rounded text-xs font-bold mb-2">Active</span>}
            <ul className="text-xs text-slate-300 space-y-1 mb-3">
              <li>✓ Everything in Nest</li>
              <li>🦅 Keyword tracking & alerts</li>
              <li>🦅 Browser extension & lead detection</li>
              <li>🙏 Appreciations</li>
              <li>💰 Sales Tracker & Pipeline</li>
              <li>🤝 Wingman relationships</li>
              <li>📊 Hawk Insights</li>
              <li>💰 Folio recaps</li>
              <li>🔗 Linked accounts</li>
              <li>📋 Copy & Open workflow</li>
            </ul>
            {!['growth', 'flight', 'base', 'soar', 'team', 'summit'].includes(currentTier) && (
              <button onClick={() => handleUpgrade('soar')} disabled={loadingTier !== null} className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-black py-2 rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50">
                {loadingTier === 'soar' ? 'Loading…' : 'Upgrade'}
              </button>
            )}
          </div>

          {/* Summit */}
          <div className={`border rounded-xl p-4 ${['team', 'summit'].includes(currentTier) ? 'border-green-500/50 bg-green-950/20' : 'border-purple-500/50 bg-purple-950/20'}`}>
            <div className="mb-2">
              <span className="text-lg font-bold text-white">🏔️ Summit</span>
              <p className="text-sm text-purple-400">$99.99/mo</p>
              <p className="text-xs text-purple-300 font-medium">🎁 7-day free trial</p>
            </div>
            {['team', 'summit'].includes(currentTier) && <span className="inline-block bg-green-600 text-white px-2 py-0.5 rounded text-xs font-bold mb-2">Active</span>}
            <ul className="text-xs text-slate-300 space-y-1 mb-3">
              <li>✓ Everything in Soar</li>
              <li>👥 Up to 5 team members</li>
              <li>👥 Team leaderboard & stats</li>
              <li>👥 Shared leads & calendar</li>
            </ul>
            {!['team', 'summit'].includes(currentTier) && (
              <button onClick={() => handleUpgrade('team')} disabled={loadingTier !== null} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-2 rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50">
                {loadingTier === 'team' ? 'Loading…' : 'Upgrade'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Keyword Tracking - NOW ABOVE pricing was moved, this stays where subscription was */}
      </div>{/* end left column */}

      {/* Right column: connected social accounts, keyword tracking, browser extension */}
      <div className="min-w-0 space-y-4">
      {/* Keyword Tracking - NOW ABOVE pricing was moved, this stays where subscription was */}
      <div className="glass-card">
        <h3 className="font-semibold mb-3 text-white">🔑 Keyword Tracking</h3>
        <p className="text-sm text-slate-400 mb-3">Keywords the browser extension and lead scanner watch for.</p>

        {/* Add keyword */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && newKeyword.trim() && selectedTrade) {
                setAddingKeyword(true);
                setKeywordError('');
                try {
                  const client = await buildClient();
                  const result = await client.addKeyword({ keyword: newKeyword.trim(), tradeId: selectedTrade.id });
                  setKeywords((prev) => [...prev, result]);
                  setNewKeyword('');
                  localStorage.setItem(`hawkeye_keywords_added_${user?.sub}`, 'true');
                } catch (err) {
                  setKeywordError(err instanceof Error ? err.message : 'Failed to add');
                } finally { setAddingKeyword(false); }
              }
            }}
            placeholder="Add a keyword to track..."
            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 focus:border-blue-500/50 focus:outline-none"
          />
          <button
            onClick={async () => {
              if (!newKeyword.trim() || !selectedTrade) return;
              setAddingKeyword(true);
              setKeywordError('');
              try {
                const client = await buildClient();
                const result = await client.addKeyword({ keyword: newKeyword.trim(), tradeId: selectedTrade.id });
                setKeywords((prev) => [...prev, result]);
                setNewKeyword('');
                localStorage.setItem(`hawkeye_keywords_added_${user?.sub}`, 'true');
                showToast('✓ Keyword added');
              } catch (err) {
                setKeywordError(err instanceof Error ? err.message : 'Failed to add');
              } finally { setAddingKeyword(false); }
            }}
            disabled={addingKeyword || !newKeyword.trim()}
            className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-500 disabled:opacity-50"
          >
            {addingKeyword ? '...' : 'Add'}
          </button>
        </div>

        {keywordError && (
          <p className="text-xs text-red-400 mb-2">{keywordError}</p>
        )}

        {/* Keywords list */}
        {keywordsLoading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : keywords.length === 0 ? (
          <p className="text-sm text-slate-500">No keywords yet. Add some above to start tracking leads.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <span key={kw.id} className="inline-flex items-center gap-1 bg-blue-900/40 text-blue-300 px-3 py-1.5 rounded-full text-sm">
                {kw.keyword}
                <button
                  onClick={async () => {
                    try {
                      const client = await buildClient();
                      await client.deleteKeyword(kw.id);
                      setKeywords((prev) => prev.filter((k) => k.id !== kw.id));
                    } catch { /* ignore */ }
                  }}
                  className="text-blue-400 hover:text-red-400 ml-1"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Suggested keywords */}
        {selectedTrade && keywords.length < 5 && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <p className="text-xs text-slate-500 mb-2">Suggested for {selectedTrade.name}:</p>
            <div className="flex flex-wrap gap-1.5">
              {selectedTrade.defaultKeywords.filter((kw) => !keywords.some((k) => k.keyword === kw.toLowerCase())).slice(0, 5).map((kw) => (
                <button
                  key={kw}
                  onClick={async () => {
                    if (!selectedTrade) return;
                    try {
                      const client = await buildClient();
                      const result = await client.addKeyword({ keyword: kw, tradeId: selectedTrade.id });
                      setKeywords((prev) => [...prev, result]);
                      localStorage.setItem(`hawkeye_keywords_added_${user?.sub}`, 'true');
                    } catch { /* ignore */ }
                  }}
                  className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-slate-400 hover:bg-blue-900/30 hover:text-blue-300 transition-colors"
                >
                  + {kw}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Browser Extension */}
      <div className="glass-card">
        <h3 className="font-semibold mb-2 text-white">🦅 Browser Extension</h3>
        <p className="text-sm text-slate-400 mb-3">
          Install the HawkEye-Cue Chrome extension to detect leads while scrolling Facebook, Instagram, LinkedIn, and TikTok.
        </p>
        <button onClick={() => setShowLeadExplainer(true)} className="text-xs text-blue-400 hover:text-blue-300 mb-3 block">
          🔍 How does lead detection work? (Extension vs Connected Accounts)
        </button>

        <button
          onClick={() => setShowExtensionTour(true)}
          className="w-full mb-3 px-4 py-3 bg-blue-600/20 border-2 border-blue-500/40 rounded-xl text-sm text-blue-300 font-bold hover:bg-blue-600/30 transition-colors flex items-center justify-center gap-2"
        >
          📖 Step-by-Step Setup Guide — Tap Here
        </button>

        <div className="flex flex-wrap gap-2 mb-3">
          {/* Desktop: show Chrome Web Store link */}
          <a
            href="https://chromewebstore.google.com/detail/oapbnbiijbhieeefdcfnnmkfcnebalkd"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-gradient-to-r from-amber-500 to-amber-600 text-black px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90"
          >
            ⬇ Install from Chrome Web Store
          </a>
        </div>

        <p className="text-xs text-slate-500">💡 Chrome may show a safety warning — this is normal for new extensions. Click "Continue to install" to proceed.</p>

        <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <p className="text-xs text-blue-300 font-medium">🔑 Extension not detecting your login?</p>
          <p className="text-xs text-slate-400 mt-1">Click the button below to activate your extension instantly — no second login needed.</p>
          <button
            onClick={async () => {
              const EXTENSION_ID = 'oapbnbiijbhieeefdcfnnmkfcnebalkd';
              try {
                const token = await getToken();
                if (!token) { showToast('❌ Please log in first'); return; }
                const w = window as any;
                if (typeof w.chrome !== 'undefined' && w.chrome.runtime && w.chrome.runtime.sendMessage) {
                  w.chrome.runtime.sendMessage(EXTENSION_ID, { type: 'ACTIVATE_EXTENSION', token, email: user?.email || '' }, (response: any) => {
                    if (w.chrome.runtime.lastError) {
                      showToast('❌ Extension not found. Make sure it\'s installed and enabled.');
                    } else if (response?.success) {
                      showToast('✓ Extension activated! Start scrolling to detect leads.');
                    } else {
                      showToast('❌ Could not connect to extension. Try reinstalling.');
                    }
                  });
                } else {
                  showToast('❌ Extension not detected. Install it first, then click here.');
                }
              } catch {
                showToast('❌ Something went wrong. Try again.');
              }
            }}
            className="mt-2 w-full py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-lg transition-all active:scale-95"
          >
            🔗 Activate Extension Now
          </button>
        </div>

        {/* Mobile note */}
        <div className="sm:hidden mt-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
          <p className="text-sm text-slate-300 mb-1">📱 You're on mobile</p>
          <p className="text-xs text-slate-400">
            The browser extension works on desktop Chrome. Open the link above on your computer to install it.
          </p>
        </div>
      </div>

      {showExtensionTour && <ExtensionTour onClose={() => setShowExtensionTour(false)} />}
      {showLeadExplainer && <LeadDetectionExplainer onClose={() => setShowLeadExplainer(false)} />}

      {/* Suggestion Box */}
      <details id="suggestion" className="glass-card" open={window.location.hash === '#suggestion'}>
        <summary className="font-semibold text-white cursor-pointer flex items-center gap-2">
          💡 Have a Suggestion?
        </summary>
        <div className="mt-3 space-y-2">
          <p className="text-xs text-slate-400">We'd love to hear your ideas, tips, or feature requests. Tell us how we can make HawkEye-Cue better for you.</p>
          <textarea
            id="suggestion-input"
            placeholder="Your suggestion or idea..."
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 resize-none h-24 focus:border-blue-500/50 focus:outline-none"
          />
          <button
            onClick={async () => {
              const textarea = document.getElementById('suggestion-input') as HTMLTextAreaElement;
              const text = textarea?.value?.trim();
              if (!text) return;
              try {
                const token = await getToken();
                const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
                await client.request('POST', '/profile/suggestion', { message: text });
                textarea.value = '';
                showToast('Thanks for your suggestion! 🦅');
              } catch {
                showToast('❌ Failed to send. Please try again.');
              }
            }}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg text-sm font-medium transition-all"
          >
            Send Suggestion
          </button>
        </div>
      </details>

      {/* Contact Us */}
      <div className="text-center py-4">
        <p className="text-xs text-slate-500">Need help or have feedback?</p>
        <a href="mailto:briannafrashier@hawkeyecue.com" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
          📧 Contact Us: briannafrashier@hawkeyecue.com
        </a>
      </div>
      </div>{/* end right column */}
    </div>
  );
}
