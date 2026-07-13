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
          <p className="text-sm text-slate-400 mt-1">Two tools that work together to find you leads</p>
        </div>

        {/* Browser Extension */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🌐</span>
            <h3 className="font-bold text-blue-300">Browser Extension</h3>
          </div>
          <p className="text-sm text-slate-300 mb-3">
            Scans posts <span className="text-white font-medium">while you scroll</span> Facebook, Instagram, LinkedIn, and TikTok on your computer.
          </p>
          <div className="space-y-1.5 text-xs text-slate-400">
            <p>✓ Detects keywords in <span className="text-white">other people's posts</span> and group discussions</p>
            <p>✓ Shows a 🦅 hawk icon on matching posts in real-time</p>
            <p>✓ One click saves the post as a lead</p>
            <p>✓ Works on Facebook groups, LinkedIn feeds, and more</p>
          </div>
          <div className="mt-3 p-2 bg-blue-500/10 rounded text-xs text-blue-400">
            💡 Best for: Finding people actively asking for your services in groups and feeds
          </div>
        </div>

        {/* Connected Accounts (Bundle.social) */}
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🔗</span>
            <h3 className="font-bold text-purple-300">Connected Accounts</h3>
          </div>
          <p className="text-sm text-slate-300 mb-3">
            Runs <span className="text-white font-medium">automatically every 15 minutes</span> in the background — even when you're not online.
          </p>
          <div className="space-y-1.5 text-xs text-slate-400">
            <p>✓ Scans comments and mentions on <span className="text-white">your own posts</span></p>
            <p>✓ Catches leads from people engaging with your content</p>
            <p>✓ Works 24/7 without you doing anything</p>
            <p>✓ Sends you a notification when a match is found</p>
          </div>
          <div className="mt-3 p-2 bg-purple-500/10 rounded text-xs text-purple-400">
            💡 Best for: Catching hot leads who comment on your posts asking for help
          </div>
        </div>

        {/* How they work together */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-4">
          <h3 className="font-bold text-white text-sm mb-2">🤝 Better Together</h3>
          <p className="text-xs text-slate-400">
            The extension finds leads while you browse. Connected accounts find leads while you sleep. Together, you never miss an opportunity.
          </p>
        </div>

        {/* Setup status */}
        <div className="space-y-2 text-xs">
          <p className="text-slate-500 font-medium">To get started:</p>
          <p className="text-slate-400">1. <span className="text-white">Connect accounts</span> in Settings → Connected Social Accounts</p>
          <p className="text-slate-400">2. <span className="text-white">Install extension</span> in Settings → Browser Extension</p>
          <p className="text-slate-400">3. <span className="text-white">Add keywords</span> in Settings → Keyword Tracking</p>
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
