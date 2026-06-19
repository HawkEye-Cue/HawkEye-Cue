import { useTrade } from '../contexts/TradeContext';
import { useCalendar } from '../contexts/CalendarContext';
import { TRADES } from '@social-lead-gen/shared';
import TradeSelector from '../components/TradeSelector';

export default function DashboardPage() {
  const { selectedTrade } = useTrade();
  const { events, toggleComplete } = useCalendar();

  const todayStr = new Date().toISOString().split('T')[0];
  const todayEvents = events.filter((e) => e.date === todayStr);

  const typeColors: Record<string, string> = {
    post: 'text-blue-400',
    task: 'text-amber-400',
    reminder: 'text-green-400',
  };
  const typeIcons: Record<string, string> = {
    post: '📤',
    task: '✅',
    reminder: '🔔',
  };

  if (!selectedTrade) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-white">Welcome! Select your trade to get started</h2>
        <TradeSelector />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Dashboard</h2>
        <span className="text-sm bg-blue-500/15 text-blue-300 px-3 py-1 rounded-full border border-blue-500/20">
          {selectedTrade.name}
        </span>
      </div>

      {/* Daily Cues */}
      <div className="glass-card">
        <h3 className="font-semibold mb-3 text-white">Today's Action Items</h3>
        {todayEvents.length > 0 ? (
          <div className="space-y-2">
            {todayEvents.map((event) => (
              <label key={event.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={event.completed}
                  onChange={() => toggleComplete(event.id)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">{typeIcons[event.type]}</span>
                <span className={`text-sm ${event.completed ? 'line-through text-slate-500' : 'text-slate-300'}`}>
                  {event.title}
                </span>
                <span className={`text-xs capitalize ml-auto ${typeColors[event.type]}`}>{event.type}</span>
              </label>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
              <input type="checkbox" className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-300">Post a {selectedTrade.postTypes[0]} on social media</span>
            </label>
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
              <input type="checkbox" className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-300">Check for new keyword matches</span>
            </label>
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
              <input type="checkbox" className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-300">Follow up on recent leads</span>
            </label>
            <p className="text-xs text-slate-500 mt-2">Add items via the Calendar tab to see them here</p>
          </div>
        )}
      </div>

      {/* Lead Summary */}
      <div className="glass-card">
        <h3 className="font-semibold mb-3 text-white">Lead Summary</h3>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="text-center p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
            <div className="text-xl sm:text-2xl font-bold text-blue-400">0</div>
            <div className="text-xs text-slate-400">New Leads</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
            <div className="text-xl sm:text-2xl font-bold text-yellow-400">0</div>
            <div className="text-xs text-slate-400">Followed Up</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-green-500/5 border border-green-500/10">
            <div className="text-xl sm:text-2xl font-bold text-green-400">0</div>
            <div className="text-xs text-slate-400">Converted</div>
          </div>
        </div>
      </div>

      {/* AI Post Suggestion */}
      <div className="glass-card-strong gradient-border relative overflow-hidden">
        {/* Subtle animated glow */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl animate-pulse-glow pointer-events-none"></div>
        <h3 className="font-semibold mb-2 text-white relative z-10">✨ AI Post Suggestion</h3>
        <p className="text-sm text-slate-300 mb-3 relative z-10">
          Generate a {selectedTrade.postTypes[0]} post tailored for {selectedTrade.name} professionals.
        </p>
        <button className="btn-primary px-4 py-2 text-sm relative z-10 btn-shimmer">
          Generate Post
        </button>
      </div>

      {/* Upcoming Posts */}
      <div className="glass-card">
        <h3 className="font-semibold mb-3 text-white">Today's Scheduled Posts</h3>
        <p className="text-sm text-slate-400">No posts scheduled for today</p>
      </div>
    </div>
  );
}
