import { TRADES } from '@social-lead-gen/shared';
import { useTrade } from '../contexts/TradeContext';

export default function TradeSelector() {
  const { selectedTrade, setSelectedTrade } = useTrade();

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <label className="block text-sm font-medium text-slate-300 mb-2">
        Select Your Trade
      </label>
      <select
        value={selectedTrade?.id ?? ''}
        onChange={(e) => {
          const trade = TRADES.find((t) => t.id === e.target.value);
          if (trade) setSelectedTrade(trade);
        }}
        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Choose your industry...</option>
        {TRADES.map((trade) => (
          <option key={trade.id} value={trade.id}>
            {trade.name}
          </option>
        ))}
      </select>
    </div>
  );
}
