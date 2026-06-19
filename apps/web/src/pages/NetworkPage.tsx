import { useState } from 'react';
import { useTrade } from '../contexts/TradeContext';
import { TRADES } from '@social-lead-gen/shared';

interface Message {
  id: string;
  author: string;
  trade: string;
  content: string;
  timestamp: string;
}

const MOCK_MESSAGES: Message[] = [
  { id: '1', author: 'Mike R.', trade: 'Roofing', content: 'Anyone doing storm damage work in the Dallas area? Got overflow I can refer.', timestamp: '2 min ago' },
  { id: '2', author: 'Sarah T.', trade: 'Insurance Agent', content: 'Looking for reliable roofers to partner with for claims. DM me!', timestamp: '15 min ago' },
  { id: '3', author: 'Jake L.', trade: 'General Contractor', content: 'Need a licensed electrician for a remodel in Austin. Who\'s available next week?', timestamp: '1 hr ago' },
  { id: '4', author: 'Lisa M.', trade: 'Real Estate Agent', content: 'Just closed a deal — homeowner needs full landscaping. Any landscapers here?', timestamp: '2 hr ago' },
];

export default function NetworkPage() {
  const { selectedTrade } = useTrade();
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES);
  const [newMessage, setNewMessage] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const filteredMessages = filter === 'all'
    ? messages
    : messages.filter((m) => m.trade === filter);

  const handleSend = () => {
    if (!newMessage.trim()) return;
    const msg: Message = {
      id: Date.now().toString(),
      author: 'You',
      trade: selectedTrade?.name ?? 'Unknown',
      content: newMessage.trim(),
      timestamp: 'Just now',
    };
    setMessages([msg, ...messages]);
    setNewMessage('');
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Network</h2>
      <p className="text-sm text-slate-400">Connect with other trades for referrals and partnerships</p>

      {/* Trade Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-3 px-3 scrollbar-hide">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-2 min-h-[44px] rounded-full text-sm whitespace-nowrap ${
            filter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          All Trades
        </button>
        {TRADES.slice(0, 6).map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.name)}
            className={`px-3 py-2 min-h-[44px] rounded-full text-sm whitespace-nowrap ${
              filter === t.name ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* Post a Message */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <div className="flex gap-2">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Post a networking opportunity, referral request, or introduction..."
            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 resize-none h-16"
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim()}
            className="self-end bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Post
          </button>
        </div>
      </div>

      {/* Message Feed */}
      <div className="space-y-3">
        {filteredMessages.map((msg) => (
          <div key={msg.id} className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <div className="flex items-start justify-between mb-2 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 shrink-0 bg-slate-600 rounded-full flex items-center justify-center text-sm font-bold text-white">
                  {msg.author[0]}
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-white">{msg.author}</span>
                  <span className="text-xs text-blue-400 ml-2 block sm:inline">{msg.trade}</span>
                </div>
              </div>
              <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">{msg.timestamp}</span>
            </div>
            <p className="text-sm text-slate-300">{msg.content}</p>
            <div className="flex gap-3 mt-3">
              <button className="text-xs text-slate-400 hover:text-blue-400 min-h-[44px] flex items-center">💬 Reply</button>
              <button className="text-xs text-slate-400 hover:text-blue-400 min-h-[44px] flex items-center">🤝 Connect</button>
              <button className="text-xs text-slate-400 hover:text-blue-400 min-h-[44px] flex items-center">📌 Save</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
