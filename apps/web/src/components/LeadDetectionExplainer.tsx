interface Props {
  onClose: () => void;
}

export default function LeadDetectionExplainer({ onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="glass-card-strong w-full max-w-md animate-scale-in space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="text-center">
          <span className="text-4xl">🦅</span>
          <h2 className="text-xl font-bold text-white mt-2">How Lead Detection Works</h2>
          <p className="text-sm text-slate-400 mt-1">Three ways HawkEye-Cue helps you find leads</p>
        </div>

        {/* Browser Extension */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🌐</span>
            <h3 className="font-bold text-blue-300">Browser Extension</h3>
            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full">Groups + Feeds</span>
          </div>
          <p className="text-sm text-slate-300 mb-3">
            Scans posts <span className="text-white font-medium">while you scroll</span> on your computer. This is the only way to catch leads in Facebook groups and personal feeds.
          </p>
          <div className="space-y-1.5 text-xs text-slate-400">
            <p>✓ Detects keywords in <span className="text-white">Facebook groups</span></p>
            <p>✓ Scans your <span className="text-white">personal feed</span> on all platforms</p>
            <p>✓ Shows a 🦅 hawk icon on matching posts</p>
            <p>✓ One click saves the post as a lead</p>
            <p>✓ Works on Facebook, Instagram, LinkedIn, TikTok</p>
          </div>
          <div className="mt-3 p-2 bg-blue-500/10 rounded text-xs text-blue-400">
            💡 Best for: Finding leads in Facebook groups where people ask "who knows a good roofer?" — this is your #1 lead source
          </div>
        </div>

        {/* Connected Accounts (Background Scanner) */}
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🔗</span>
            <h3 className="font-bold text-purple-300">Background Scanner</h3>
            <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full">Business Page Only</span>
          </div>
          <p className="text-sm text-slate-300 mb-3">
            Runs <span className="text-white font-medium">automatically every 15 minutes</span> — scans comments on posts made from your connected Business Page.
          </p>
          <div className="space-y-1.5 text-xs text-slate-400">
            <p>✓ Scans comments on <span className="text-white">your Business Page posts</span></p>
            <p>✓ Catches people asking for help in your comments</p>
            <p>✓ Works 24/7 without you doing anything</p>
            <p>✓ Sends you a notification when a match is found</p>
          </div>
          <div className="mt-3 p-2 bg-purple-500/10 rounded text-xs text-purple-400">
            💡 Best for: Catching hot leads who engage with your published content
          </div>
          <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-300">
            ⚠️ Note: Facebook only allows scanning Business Pages, not personal profiles or groups. To catch leads from groups, use the browser extension or the Calendar workflow below.
          </div>
        </div>

        {/* Calendar Cue Workflow */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">📅</span>
            <h3 className="font-bold text-amber-300">Calendar Cue Workflow</h3>
            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full">Personal + Groups</span>
          </div>
          <p className="text-sm text-slate-300 mb-3">
            Schedule daily reminders to post in Facebook groups from your <span className="text-white font-medium">personal account</span>. The extension scans while you're there.
          </p>
          <div className="space-y-1.5 text-xs text-slate-400">
            <p>✓ Add group links to your calendar as daily cues</p>
            <p>✓ Click the link → post in the group from your personal page</p>
            <p>✓ Extension scans for leads while you scroll</p>
            <p>✓ Tap "Done ✓" when finished → hawk swoops 🦅</p>
            <p>✓ Auto-highlights your next group to visit</p>
          </div>
          <div className="mt-3 p-2 bg-amber-500/10 rounded text-xs text-amber-400">
            💡 Best for: Daily group posting routine from your personal page — the extension catches leads as you go
          </div>
        </div>

        {/* Summary table */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-4">
          <h3 className="font-bold text-white text-sm mb-3">📊 What each method can scan:</h3>
          <div className="text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Facebook Groups</span>
              <div className="flex gap-2">
                <span className="text-blue-400">🌐 Extension ✓</span>
                <span className="text-slate-600">🔗 Scanner ✗</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Personal Feed</span>
              <div className="flex gap-2">
                <span className="text-blue-400">🌐 Extension ✓</span>
                <span className="text-slate-600">🔗 Scanner ✗</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Business Page Comments</span>
              <div className="flex gap-2">
                <span className="text-blue-400">🌐 Extension ✓</span>
                <span className="text-purple-400">🔗 Scanner ✓</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">LinkedIn Feed</span>
              <div className="flex gap-2">
                <span className="text-blue-400">🌐 Extension ✓</span>
                <span className="text-slate-600">🔗 Scanner ✗</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Instagram/TikTok</span>
              <div className="flex gap-2">
                <span className="text-blue-400">🌐 Extension ✓</span>
                <span className="text-purple-400">🔗 Scanner ✓</span>
              </div>
            </div>
          </div>
        </div>

        {/* Setup */}
        <div className="space-y-2 text-xs">
          <p className="text-slate-500 font-medium">To get the most leads:</p>
          <p className="text-slate-400">1. <span className="text-white">Install the extension</span> → catches leads in groups and feeds</p>
          <p className="text-slate-400">2. <span className="text-white">Connect your Business Page</span> → auto-scans your post comments 24/7</p>
          <p className="text-slate-400">3. <span className="text-white">Add group links to calendar</span> → daily posting routine with lead detection</p>
          <p className="text-slate-400">4. <span className="text-white">Add keywords</span> → tells HawkEye what to look for</p>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
