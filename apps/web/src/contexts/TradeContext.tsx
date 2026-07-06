import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Trade } from '@social-lead-gen/shared';
import { ApiClient, TRADES } from '@social-lead-gen/shared';
import { useAuth } from './AuthContext';

interface TradeState {
  selectedTrade: Trade | null;
  setSelectedTrade: (trade: Trade) => void;
}

const TradeContext = createContext<TradeState | undefined>(undefined);

export function TradeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, getToken } = useAuth();

  const [selectedTrade, setSelectedTradeState] = useState<Trade | null>(() => {
    const saved = localStorage.getItem('selected_trade');
    return saved ? JSON.parse(saved) : null;
  });

  // On login, fetch the user's saved trade from the server
  useEffect(() => {
    if (!isAuthenticated) return;
    // If we already have a trade locally, don't overwrite
    if (selectedTrade) return;

    async function fetchSavedTrade() {
      try {
        const token = await getToken();
        const client = new ApiClient({
          baseUrl: import.meta.env.VITE_API_URL as string,
          getToken: async () => token,
        });
        const profile = await client.request<{ selectedTradeId?: string }>('GET', '/profile');
        if (profile?.selectedTradeId) {
          const trade = TRADES.find((t) => t.id === profile.selectedTradeId);
          if (trade) {
            setSelectedTradeState(trade);
            localStorage.setItem('selected_trade', JSON.stringify(trade));
          }
        }
      } catch {
        // ignore — profile might not have a trade yet
      }
    }

    fetchSavedTrade();
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSelectedTrade = useCallback(async (trade: Trade) => {
    setSelectedTradeState(trade);
    localStorage.setItem('selected_trade', JSON.stringify(trade));

    // Also save to server so it persists across devices
    try {
      const token = await getToken();
      const client = new ApiClient({
        baseUrl: import.meta.env.VITE_API_URL as string,
        getToken: async () => token,
      });
      await client.selectTrade(trade.id);
    } catch {
      // ignore — local save is enough as fallback
    }
  }, [getToken]);

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
