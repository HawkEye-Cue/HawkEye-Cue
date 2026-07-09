import { useTrade } from '../contexts/TradeContext';
import type { Trade } from '@social-lead-gen/shared';

interface Props {
  value?: Trade | null;
  onChange?: (trade: Trade) => void;
}

/**
 * A compact dropdown to switch between selected trades.
 * If no onChange is provided, it switches the "active" trade context-wide.
 * Only shows if the user has multiple trades selected.
 */
export default function TradeSwitcher({ value, onChange }: Props) {
  const { selectedTrades, selectedTrade } = useTrade();

  if (selectedTrades.length <= 1) return null;

  const current = value || selectedTrade;

  return (
    <select
      value={current?.id || ''}
      onChange={(e) => {
        const trade = selectedTrades.find((t) => t.id === e.target.value);
        if (trade && onChange) onChange(trade);
      }}
      className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-blue-300 focus:border-blue-500/50 focus:outline-none"
    >
      {selectedTrades.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  );
}
