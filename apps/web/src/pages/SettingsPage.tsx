import { useAuth } from '../contexts/AuthContext';
import { useTrade } from '../contexts/TradeContext';
import TradeSelector from '../components/TradeSelector';

export default function SettingsPage() {
  const { user } = useAuth();
  const { selectedTrade } = useTrade();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Settings</h2>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold mb-3 text-white">Account</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Email</span>
            <span className="text-white">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Trade</span>
            <span className="text-white">{selectedTrade?.name ?? 'Not selected'}</span>
          </div>
        </div>
      </div>

      <TradeSelector />

      {/* Subscription Plans */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold mb-4 text-white">Subscription Plans</h3>

        {/* Beta Tester Banner */}
        <div className="border border-amber-500/50 rounded-xl p-4 mb-3 bg-amber-950/20">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-lg font-bold text-amber-300">🦅 Beta Tester</span>
              <span className="text-sm text-amber-400 ml-2">FREE for 3 months</span>
            </div>
            <span className="bg-amber-600 text-white px-2 py-1 rounded text-xs font-bold">LIMITED</span>
          </div>
          <p className="text-sm text-slate-300 mb-2">First 5 users get full Growth access completely free for 3 months. Help us shape the product!</p>
          <p className="text-xs text-amber-400 mb-3">⚡ Spots remaining: 5/5</p>
          <button className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-black py-2 rounded-lg text-sm font-bold hover:opacity-90">
            Claim Beta Tester Spot
          </button>
        </div>

        {/* Base Tier */}
        <div className="border border-slate-600 rounded-xl p-4 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-lg font-bold text-white">Base</span>
              <span className="text-sm text-slate-400 ml-2">$9.99/mo</span>
            </div>
            <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded text-xs">Current</span>
          </div>
          <ul className="text-sm text-slate-300 space-y-1.5 mb-3">
            <li className="flex items-center gap-2">✓ AI-powered post creation</li>
            <li className="flex items-center gap-2">✓ Post scheduling & calendar</li>
            <li className="flex items-center gap-2">✓ Track all your posts & analytics</li>
            <li className="flex items-center gap-2">✓ Trade-specific content suggestions</li>
          </ul>
        </div>

        {/* Growth Tier */}
        <div className="border border-blue-500/50 rounded-xl p-4 bg-blue-950/20">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-lg font-bold text-white">Growth</span>
              <span className="text-sm text-blue-400 ml-2">$19.99/mo</span>
            </div>
            <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs">Upgrade</span>
          </div>
          <ul className="text-sm text-slate-300 space-y-1.5 mb-3">
            <li className="flex items-center gap-2">✓ Everything in Base</li>
            <li className="flex items-center gap-2">🦅 Keyword tracking while scrolling social media</li>
            <li className="flex items-center gap-2">🦅 Hawk icon alerts on keyword matches</li>
            <li className="flex items-center gap-2">🦅 Appreciations — track who tags you in posts</li>
            <li className="flex items-center gap-2">🦅 Connection tracking — see who you've connected with</li>
            <li className="flex items-center gap-2">🦅 Browser extension for lead detection</li>
          </ul>
          <button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:opacity-90">
            Upgrade to Growth
          </button>
        </div>

        {/* Team Tier */}
        <div className="border border-purple-500/50 rounded-xl p-4 bg-purple-950/20 mt-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-lg font-bold text-white">Team</span>
              <span className="text-sm text-purple-400 ml-2">$79.99/mo</span>
            </div>
            <span className="bg-purple-600 text-white px-2 py-1 rounded text-xs">Team</span>
          </div>
          <ul className="text-sm text-slate-300 space-y-1.5 mb-3">
            <li className="flex items-center gap-2">✓ Everything in Growth</li>
            <li className="flex items-center gap-2">👥 Up to 5 team members on one account</li>
            <li className="flex items-center gap-2">👥 Shared keyword tracking & leads</li>
            <li className="flex items-center gap-2">👥 Team collaboration on content</li>
            <li className="flex items-center gap-2">👥 Shared calendar & scheduling</li>
            <li className="flex items-center gap-2">👥 Team analytics dashboard</li>
          </ul>
          <button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-2 rounded-lg text-sm font-medium hover:opacity-90">
            Upgrade to Team
          </button>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold mb-2 text-white">Quick Links</h3>
        <div className="space-y-2">
          <a href="/keywords" className="block text-sm text-blue-400 hover:underline">Manage Keywords →</a>
          <a href="/calendar" className="block text-sm text-blue-400 hover:underline">View Calendar →</a>
        </div>
      </div>
    </div>
  );
}
