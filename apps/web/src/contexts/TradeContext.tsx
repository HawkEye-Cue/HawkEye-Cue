import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Trade } from '@social-lead-gen/shared';

interface TradeState {
  selectedTrade: Trade | null;
  setSelectedTrade: (trade: Trade) => void;
}

const TradeContext = createContext<TradeState | undefined>(undefined);

export function TradeProvider({ children }: { children: ReactNode }) {
  const [selectedTrade, setSelectedTradeState] = useState<Trade | null>(() => {
    const saved = localStorage.getItem('selected_trade');
    return saved ? JSON.parse(saved) : null;
  });

  const setSelectedTrade = useCallback((trade: Trade) => {
    setSelectedTradeState(trade);
    localStorage.setItem('selected_trade', JSON.stringify(trade));
  }, []);

  return (
    <TradeContext.Provider value={{ selectedTrade, setSelectedTrade }}>
      {children}
    </TradeContext.Provider>
  );
}

export function useTrade() {
  const context = useContext(TradeContext);
  if (!context) throw new Error('useTrade must be used within TradeProvider');
  return context;
}
