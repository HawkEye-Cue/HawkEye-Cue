import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTrade } from '../contexts/TradeContext';
import TradeSelector from '../components/TradeSelector';
import { ApiClient } from '@social-lead-gen/shared';
import type { Subscription, SocialAccount } from '@social-lead-gen/shared';

export default function SettingsPage() {
  const { user, getToken } = useAuth();
  const { selectedTrade } = useTrade();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);
  const [socialLoading, setSocialLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);

  // Check for checkout success/cancelled in URL params
  const params = new URLSearchParams(window.location.search);
  const checkoutStatus = params.get('checkout');

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

  async function handleConnectSocial(platforms?: string[]) {
    setConnectingPlatform(platforms?.[0] || 'all');
    try {
      const client = await buildClient();
      const { connectUrl } = await client.getConnectLink(platforms);
      window.location.href = connectUrl;
    } catch (e) {
      console.error('Failed to get connect link:', e);
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

  async function handleUpgrade(tier: 'base' | 'growth' | 'team') {
    setLoadingTier(tier);
    setCheckoutError(null);
    try {
      const client = await buildClient();
      console.log('[Checkout] Calling createCheckout for tier:', tier);
      const { checkoutUrl } = await client.createCheckout(tier);
      console.log('[Checkout] Got URL, redirecting:', checkoutUrl);
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
    const labels: Record<string, string> = { free: 'Free', base: 'Base', growth: 'Growth', team: 'Team' };
    return labels[tier] ?? tier;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Settings</h2>

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
        <p className="text-sm text-slate-400 mb-4">
          Connect your social media accounts to publish posts directly from HawkEye.
        </p>

        {socialLoading ? (
          <p className="text-sm text-slate-500">Loading accounts…</p>
        ) : (
          <>
            {socialAccounts.length > 0 && (
              <div className="space-y-2 mb-4">
                {socialAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700"
                  >
                    <div className="flex items-center gap-3">
                      {account.imageUrl ? (
                        <img src={account.imageUrl} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs">
                          {account.type === 'FACEBOOK' && '📘'}
                          {account.type === 'INSTAGRAM' && '📷'}
                          {account.type === 'LINKEDIN' && '💼'}
                          {account.type === 'TIKTOK' && '🎵'}
                          {account.type === 'YOUTUBE' && '▶️'}
                          {account.type === 'X' && '𝕏'}
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-white font-medium">{account.name}</p>
                        <p className="text-xs text-slate-400">{account.type.charAt(0) + account.type.slice(1).toLowerCase()}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDisconnect(account.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Disconnect
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleConnectSocial(['FACEBOOK'])}
                disabled={connectingPlatform !== null}
                className="px-4 py-2 bg-blue-600/20 border border-blue-500/30 rounded-lg text-sm text-blue-300 hover:bg-blue-600/30 disabled:opacity-50"
              >
                {connectingPlatform === 'FACEBOOK' ? 'Connecting…' : '+ Facebook'}
              </button>
              <button
                onClick={() => handleConnectSocial(['INSTAGRAM'])}
                disabled={connectingPlatform !== null}
                className="px-4 py-2 bg-pink-600/20 border border-pink-500/30 rounded-lg text-sm text-pink-300 hover:bg-pink-600/30 disabled:opacity-50"
              >
                {connectingPlatform === 'INSTAGRAM' ? 'Connecting…' : '+ Instagram'}
              </button>
              <button
                onClick={() => handleConnectSocial(['LINKEDIN'])}
                disabled={connectingPlatform !== null}
                className="px-4 py-2 bg-sky-600/20 border border-sky-500/30 rounded-lg text-sm text-sky-300 hover:bg-sky-600/30 disabled:opacity-50"
              >
                {connectingPlatform === 'LINKEDIN' ? 'Connecting…' : '+ LinkedIn'}
              </button>
              <button
                onClick={() => handleConnectSocial(['TIKTOK'])}
                disabled={connectingPlatform !== null}
                className="px-4 py-2 bg-slate-600/20 border border-slate-500/30 rounded-lg text-sm text-slate-300 hover:bg-slate-600/30 disabled:opacity-50"
              >
                {connectingPlatform === 'TIKTOK' ? 'Connecting…' : '+ TikTok'}
              </button>
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

        {/* Beta Tester Banner */}
        <div className="border border-amber-500/50 rounded-xl p-4 mb-3 bg-amber-950/20">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-lg font-bold text-amber-300">🦅 Beta Tester</span>
              <span className="text-sm text-amber-400 ml-2">FREE for 3 months</span>
            </div>
            <span className="bg-amber-600 text-white px-2 py-1 rounded text-xs font-bold">LIMITED</span>
          </div>
          <p className="text-sm text-slate-300 mb-2">
            First 5 users get full Growth access completely free for 3 months. Help us shape the product!
          </p>
          <p className="text-xs text-amber-400 mb-3">⚡ Spots remaining: 5/5</p>
          <button
            onClick={() => handleUpgrade('growth')}
            disabled={loadingTier !== null || currentTier === 'growth' || currentTier === 'team'}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-black py-2 rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {currentTier === 'growth' ? '✓ Current Plan' : loadingTier === 'growth' ? 'Redirecting to Stripe…' : 'Claim Beta Tester Spot'}
          </button>
        </div>

        {/* Base Tier */}
        <div className={`border rounded-xl p-4 mb-3 ${currentTier === 'base' ? 'border-green-500/50 bg-green-950/20' : 'border-slate-600'}`}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-lg font-bold text-white">Base</span>
              <span className="text-sm text-slate-400 ml-2">$9.99/mo</span>
            </div>
            {currentTier === 'base' && (
              <span className="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold">Active</span>
            )}
          </div>
          <ul className="text-sm text-slate-300 space-y-1.5 mb-3">
            <li className="flex items-center gap-2">✓ AI-powered post creation</li>
            <li className="flex items-center gap-2">✓ Post scheduling &amp; calendar</li>
            <li className="flex items-center gap-2">✓ Track all your posts &amp; analytics</li>
            <li className="flex items-center gap-2">✓ Trade-specific content suggestions</li>
          </ul>
          {currentTier !== 'base' && (
            <button
              onClick={() => handleUpgrade('base')}
              disabled={loadingTier !== null || currentTier === 'growth' || currentTier === 'team'}
              className="w-full bg-slate-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingTier === 'base' ? 'Redirecting to Stripe…' : 'Subscribe to Base'}
            </button>
          )}
        </div>

        {/* Growth Tier */}
        <div className={`border rounded-xl p-4 mb-3 ${currentTier === 'growth' ? 'border-green-500/50 bg-green-950/20' : 'border-blue-500/50 bg-blue-950/20'}`}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-lg font-bold text-white">Growth</span>
              <span className="text-sm text-blue-400 ml-2">$19.99/mo</span>
            </div>
            {currentTier === 'growth' ? (
              <span className="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold">Active</span>
            ) : (
              <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs">Popular</span>
            )}
          </div>
          <ul className="text-sm text-slate-300 space-y-1.5 mb-3">
            <li className="flex items-center gap-2">✓ Everything in Base</li>
            <li className="flex items-center gap-2">🦅 Keyword tracking while scrolling social media</li>
            <li className="flex items-center gap-2">🦅 Hawk icon alerts on keyword matches</li>
            <li className="flex items-center gap-2">🦅 Appreciations — track who tags you in posts</li>
            <li className="flex items-center gap-2">🦅 Connection tracking — see who you've connected with</li>
            <li className="flex items-center gap-2">🦅 Browser extension for lead detection</li>
          </ul>
          {currentTier !== 'growth' && (
            <button
              onClick={() => handleUpgrade('growth')}
              disabled={loadingTier !== null || currentTier === 'team'}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingTier === 'growth' ? 'Redirecting to Stripe…' : 'Upgrade to Growth'}
            </button>
          )}
        </div>

        {/* Team Tier */}
        <div className={`border rounded-xl p-4 ${currentTier === 'team' ? 'border-green-500/50 bg-green-950/20' : 'border-purple-500/50 bg-purple-950/20'}`}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-lg font-bold text-white">Team</span>
              <span className="text-sm text-purple-400 ml-2">$79.99/mo</span>
            </div>
            {currentTier === 'team' ? (
              <span className="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold">Active</span>
            ) : (
              <span className="bg-purple-600 text-white px-2 py-1 rounded text-xs">Team</span>
            )}
          </div>
          <ul className="text-sm text-slate-300 space-y-1.5 mb-3">
            <li className="flex items-center gap-2">✓ Everything in Growth</li>
            <li className="flex items-center gap-2">👥 Up to 5 team members on one account</li>
            <li className="flex items-center gap-2">👥 Shared keyword tracking &amp; leads</li>
            <li className="flex items-center gap-2">👥 Team collaboration on content</li>
            <li className="flex items-center gap-2">👥 Shared calendar &amp; scheduling</li>
            <li className="flex items-center gap-2">👥 Team analytics dashboard</li>
          </ul>
          {currentTier !== 'team' && (
            <button
              onClick={() => handleUpgrade('team')}
              disabled={loadingTier !== null}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingTier === 'team' ? 'Redirecting to Stripe…' : 'Upgrade to Team'}
            </button>
          )}
        </div>
      </div>

      <div className="glass-card">
        <h3 className="font-semibold mb-2 text-white">Quick Links</h3>
        <div className="space-y-2">
          <a href="/profile" className="block text-sm text-blue-400 hover:underline">Profile & Password →</a>
          <a href="/keywords" className="block text-sm text-blue-400 hover:underline">Manage Keywords →</a>
          <a href="/calendar" className="block text-sm text-blue-400 hover:underline">View Calendar →</a>
        </div>
      </div>

      {/* Browser Extension */}
      <div className="glass-card">
        <h3 className="font-semibold mb-2 text-white">🦅 Browser Extension</h3>
        <p className="text-sm text-slate-400 mb-3">
          Install the HawkEye-Cue Chrome extension to detect leads while scrolling Facebook, Instagram, LinkedIn, and TikTok.
        </p>

        {/* Desktop: show download */}
        <div className="hidden sm:block">
          <a
            href="/downloads/hawkeye-cue-extension.zip"
            download
            className="inline-block bg-gradient-to-r from-amber-500 to-amber-600 text-black px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90"
          >
            ⬇ Download Extension
          </a>
          <details className="mt-3">
            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300">Installation instructions</summary>
            <ol className="text-xs text-slate-400 mt-2 space-y-1 list-decimal list-inside">
              <li>Download and unzip the file</li>
              <li>Open Chrome → type <code className="text-slate-300">chrome://extensions</code> in the address bar</li>
              <li>Enable "Developer mode" (top-right toggle)</li>
              <li>Click "Load unpacked" and select the unzipped folder</li>
              <li>Click the hawk icon in your toolbar and sign in</li>
            </ol>
          </details>
        </div>

        {/* Mobile: show instructions to install on desktop */}
        <div className="sm:hidden">
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
            <p className="text-sm text-slate-300 mb-2">📱 You're on mobile</p>
            <p className="text-xs text-slate-400">
              The browser extension works on desktop Chrome. Open <strong className="text-white">hawkeyecue.com</strong> on your computer to download and install it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
