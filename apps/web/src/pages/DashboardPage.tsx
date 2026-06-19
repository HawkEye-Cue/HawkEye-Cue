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
        <span className="text-sm bg-blue-900/50 text-blue-300 px-3 py-1 rounded-full">
          {selectedTrade.name}
        </span>
      </div>

      {/* Daily Cues */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold mb-3 text-white">Today's Action Items</h3>
        {todayEvents.length > 0 ? (
          <div className="space-y-2">
            {todayEvents.map((event) => (
              <label key={event.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700 cursor-pointer">
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
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-300">Post a {selectedTrade.postTypes[0]} on social media</span>
            </label>
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-300">Check for new keyword matches</span>
            </label>
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-300">Follow up on recent leads</span>
            </label>
            <p className="text-xs text-slate-500 mt-2">Add items via the Calendar tab to see them here</p>
          </div>
        )}
      </div>

      {/* Lead Summary */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold mb-3 text-white">Lead Summary</h3>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="text-center">
            <div className="text-xl sm:text-2xl font-bold text-blue-400">0</div>
            <div className="text-xs text-slate-400">New Leads</div>
          </div>
          <div className="text-center">
            <div className="text-xl sm:text-2xl font-bold text-yellow-400">0</div>
            <div className="text-xs text-slate-400">Followed Up</div>
          </div>
          <div className="text-center">
            <div className="text-xl sm:text-2xl font-bold text-green-400">0</div>
            <div className="text-xs text-slate-400">Converted</div>
          </div>
        </div>
      </div>

      {/* AI Post Suggestion */}
      <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold mb-2 text-white">✨ AI Post Suggestion</h3>
        <p className="text-sm text-slate-300 mb-3">
          Generate a {selectedTrade.postTypes[0]} post tailored for {selectedTrade.name} professionals.
        </p>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          Generate Post
        </button>
      </div>

      {/* Upcoming Posts */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold mb-3 text-white">Today's Scheduled Posts</h3>
        <p className="text-sm text-slate-400">No posts scheduled for today</p>
      </div>
    </div>
  );
}
