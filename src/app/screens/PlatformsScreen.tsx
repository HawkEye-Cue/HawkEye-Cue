import { useState, useEffect } from 'react';
import { HEButton, HECard } from '../components/DesignSystem';
import { CheckCircle, XCircle, Link as LinkIcon, Loader2, ExternalLink, Bug } from 'lucide-react';
import { getConnectedAccounts, testConnection } from '../../lib/ayrshare';

interface Platform {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
  username?: string;
  followers?: number;
}

export function PlatformsScreen() {
  const [platforms, setPlatforms] = useState<Platform[]>([
    {
      id: 'facebook',
      name: 'Facebook',
      icon: '📘',
      connected: false,
    },
    {
      id: 'instagram',
      name: 'Instagram',
      icon: '📸',
      connected: false,
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      icon: '💼',
      connected: false,
    },
    {
      id: 'twitter',
      name: 'X (Twitter)',
      icon: '🐦',
      connected: false,
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      icon: '🎥',
      connected: false,
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [showConnectionUrl, setShowConnectionUrl] = useState(false);

  // Check connected accounts on load
  useEffect(() => {
    checkConnections();
  }, []);

  const checkConnections = async () => {
    try {
      setLoading(true);
      const connected = await getConnectedAccounts();

      setPlatforms(prev => prev.map(platform => ({
        ...platform,
        connected: connected[platform.id] || false,
      })));
    } catch (error) {
      console.error('Error checking connections:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`❌ Error checking connections:\n\n${errorMessage}\n\nCheck browser console (F12) for details.`);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (platformId: string) => {
    // In production, this would open Ayrshare's OAuth flow
    // For now, show instructions
    setShowConnectionUrl(true);
  };

  const handleDisconnect = async (platformId: string) => {
    if (confirm(`Disconnect ${platformId}? You'll need to reconnect to post to this platform.`)) {
      // In production, call Ayrshare API to disconnect
      setPlatforms(prev => prev.map(p =>
        p.id === platformId ? { ...p, connected: false } : p
      ));
    }
  };

  const handleTestConnection = async () => {
    setLoading(true);
    const result = await testConnection();
    setLoading(false);

    if (result.success) {
      alert(`✅ API Key is VALID!\n\nStatus: ${result.status}\n\nYour Ayrshare account is connected properly. Check the browser console (F12) for full details.`);
    } else {
      alert(`❌ API Key Test Failed\n\nStatus: ${result.status}\n\nCheck the browser console (F12) for the full error message.\n\nCommon fixes:\n1. Make sure you're using the API Key (not Profile Key)\n2. API Key should be: 6EAC4DA5-158C4A8E-902FCB0B-AC8A01A6\n3. Check if your Ayrshare plan is active`);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#0F172A]">Platform Connections</h1>
        {loading && <Loader2 className="w-5 h-5 animate-spin text-[#1D4ED8]" />}
      </div>

      <HECard className="bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white border-none">
        <h3 className="text-lg font-semibold mb-2">⚠️ Important: Connect Your Social Accounts</h3>
        <p className="text-sm mb-3 opacity-90">
          Your API key is working, but you need to connect your social media accounts in the Ayrshare dashboard first!
        </p>
        <ol className="text-sm space-y-2 mb-4 opacity-90">
          <li>1. Click the button below to open Ayrshare</li>
          <li>2. Go to "Social Accounts" section</li>
          <li>3. Click "Add Social Account"</li>
          <li>4. Connect Facebook, Instagram, LinkedIn, etc.</li>
          <li>5. Come back here and click "Refresh Status"</li>
        </ol>
        <a
          href="https://app.ayrshare.com/social-accounts"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-[#3B82F6] rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          Open Ayrshare Social Accounts
          <ExternalLink className="w-4 h-4" />
        </a>
      </HECard>

      <HECard className="bg-[#FEF3C7] border-2 border-[#F59E0B]">
        <div className="flex items-start gap-3">
          <Bug className="w-5 h-5 text-[#F59E0B] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[#0F172A] mb-2">🔧 API Connection Test</h3>
            <p className="text-sm text-[#64748B] mb-3">
              Having issues? Click below to test your Ayrshare API key and see the exact error.
            </p>
            <HEButton variant="secondary" onClick={handleTestConnection} disabled={loading}>
              {loading ? 'Testing...' : 'Test API Connection'}
            </HEButton>
            <p className="text-xs text-[#64748B] mt-2">
              Press F12 to open browser console for detailed error messages
            </p>
          </div>
        </div>
      </HECard>

      {showConnectionUrl && (
        <HECard className="bg-gradient-to-r from-[#1D4ED8] to-[#22C55E] text-white border-none">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-lg font-semibold">🔗 Connect Your Accounts</h3>
            <button onClick={() => setShowConnectionUrl(false)} className="text-white/80 hover:text-white">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm mb-4 opacity-90">
            To connect your social media accounts, you'll need to set up Ayrshare. Follow these steps:
          </p>
          <ol className="text-sm space-y-2 mb-4 opacity-90">
            <li>1. Sign up at <strong>ayrshare.com</strong></li>
            <li>2. Get your API key from the dashboard</li>
            <li>3. Add your API key to the app settings</li>
            <li>4. Click the link below to connect accounts</li>
          </ol>
          <a
            href="https://app.ayrshare.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-[#1D4ED8] rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Open Ayrshare Dashboard
            <ExternalLink className="w-4 h-4" />
          </a>
        </HECard>
      )}

      <div className="space-y-3">
        {platforms.map((platform) => (
          <HECard key={platform.id}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{platform.icon}</span>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#0F172A]">{platform.name}</h3>
                {platform.connected ? (
                  <p className="text-sm text-[#22C55E]">✓ Connected & Ready</p>
                ) : (
                  <p className="text-sm text-[#64748B]">Not connected</p>
                )}
              </div>
              {platform.connected ? (
                <CheckCircle className="w-6 h-6 text-[#22C55E]" />
              ) : (
                <XCircle className="w-6 h-6 text-[#64748B]" />
              )}
            </div>

            {platform.connected ? (
              <div className="flex gap-2">
                <HEButton
                  variant="secondary"
                  onClick={() => handleDisconnect(platform.id)}
                  className="flex-1"
                >
                  Disconnect
                </HEButton>
                <HEButton
                  variant="secondary"
                  onClick={checkConnections}
                  className="flex-1"
                >
                  Refresh Status
                </HEButton>
              </div>
            ) : (
              <HEButton
                variant="primary"
                onClick={() => handleConnect(platform.id)}
                className="w-full flex items-center justify-center gap-2"
              >
                <LinkIcon className="w-4 h-4" />
                Connect {platform.name}
              </HEButton>
            )}
          </HECard>
        ))}
      </div>

      <HECard className="bg-[#F0F9FF] border border-[#1D4ED8]/20">
        <h3 className="text-base font-semibold text-[#0F172A] mb-2">💡 How It Works</h3>
        <p className="text-sm text-[#64748B] mb-2">
          HawkEye-Cue uses Ayrshare to securely connect and post to your social media accounts.
        </p>
        <ul className="text-sm text-[#64748B] space-y-1">
          <li>• Connect once, post everywhere</li>
          <li>• Schedule posts across all platforms</li>
          <li>• AI-adapted content for each audience</li>
          <li>• Revoke access anytime from Ayrshare dashboard</li>
        </ul>
      </HECard>

      <HECard>
        <h3 className="text-base font-semibold text-[#0F172A] mb-2">🔒 Your Data is Safe</h3>
        <p className="text-sm text-[#64748B]">
          Ayrshare handles all social media authentication. We never store your social media passwords.
          You can revoke access at any time through your Ayrshare dashboard.
        </p>
      </HECard>
    </div>
  );
}
