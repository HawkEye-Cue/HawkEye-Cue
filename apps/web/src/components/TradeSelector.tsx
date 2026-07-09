import { useState } from 'react';
import { TRADES } from '@social-lead-gen/shared';
import { useTrade } from '../contexts/TradeContext';

export default function TradeSelector({ onDone }: { onDone?: () => void } = {}) {
  const { selectedTrades, toggleTrade, setSelectedTrades } = useTrade();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(!onDone); // auto-open if no onDone (first time)

  const filtered = search.trim()
    ? TRADES.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : TRADES;

  function handleDone() {
    setIsOpen(false);
    if (onDone) onDone();
    // Save trades to server
    setSelectedTrades(selectedTrades);
  }

  return (
    <div className="glass-card">
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-slate-300">
          Your Trades
        </label>
        {selectedTrades.length > 0 && (
          <button
            onClick={handleDone}
            className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-green-500 transition-colors"
          >
            ✓ Done
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-3">Select all trades you work in. Keywords and content will be customized for each.</p>

      {/* Selected trades */}
      {selectedTrades.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {selectedTrades.map((trade) => (
            <span
              key={trade.id}
              className="inline-flex items-center gap-1 bg-blue-900/40 text-blue-300 px-3 py-1.5 rounded-full text-sm"
            >
              {trade.name}
              <button onClick={() => toggleTrade(trade)} className="text-blue-400 hover:text-red-400 ml-1">×</button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search trades..."
        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 focus:border-blue-500/50 focus:outline-none mb-2"
      />

      {/* Trade list */}
      <div className="max-h-48 overflow-y-auto space-y-1">
        {filtered.map((trade) => {
          const isSelected = selectedTrades.some((t) => t.id === trade.id);
          return (
            <button
              key={trade.id}
              onClick={() => toggleTrade(trade)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                isSelected
                  ? 'bg-blue-600/20 border border-blue-500/30 text-blue-300'
                  : 'bg-white/5 border border-transparent text-slate-300 hover:bg-white/10'
              }`}
            >
              {isSelected ? '✓ ' : ''}{trade.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
