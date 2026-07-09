import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Trade } from '@social-lead-gen/shared';
import { ApiClient, TRADES } from '@social-lead-gen/shared';
import { useAuth } from './AuthContext';

interface TradeState {
  selectedTrades: Trade[];
  selectedTrade: Trade | null; // primary trade (first selected) for backward compat
  setSelectedTrades: (trades: Trade[]) => void;
  toggleTrade: (trade: Trade) => void;
}

const TradeContext = createContext<TradeState | undefined>(undefined);

export function TradeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, getToken, user } = useAuth();
  const [selectedTrades, setSelectedTradesState] = useState<Trade[]>([]);

  // On login, fetch user's saved trades from the server
  useEffect(() => {
    if (!isAuthenticated || !user?.sub) {
      setSelectedTradesState([]);
      return;
    }

    // Check localStorage with user-specific key
    const localKey = `selected_trades_${user.sub}`;
    const saved = localStorage.getItem(localKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setSelectedTradesState(parsed);
        else if (parsed?.id) setSelectedTradesState([parsed]); // migrate old single trade
      } catch { /* ignore */ }
    }

    async function fetchSavedTrades() {
      try {
        const token = await getToken();
        const client = new ApiClient({
          baseUrl: import.meta.env.VITE_API_URL as string,
          getToken: async () => token,
        });
        const profile = await client.request<{ selectedTradeId?: string; selectedTradeIds?: string[] }>('GET', '/profile');
        
        // Support both single and multiple trade IDs
        const tradeIds = profile?.selectedTradeIds || (profile?.selectedTradeId ? [profile.selectedTradeId] : []);
        if (tradeIds.length > 0) {
          const trades = tradeIds.map((id) => TRADES.find((t) => t.id === id)).filter(Boolean) as Trade[];
          if (trades.length > 0) {
            setSelectedTradesState(trades);
            localStorage.setItem(localKey, JSON.stringify(trades));
          }
        }
      } catch {
        // ignore
      }
    }

    fetchSavedTrades();
  }, [isAuthenticated, user?.sub]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSelectedTrades = useCallback(async (trades: Trade[]) => {
    setSelectedTradesState(trades);
    if (user?.sub) {
      localStorage.setItem(`selected_trades_${user.sub}`, JSON.stringify(trades));
    }

    // Save to server
    try {
      const token = await getToken();
      const client = new ApiClient({
        baseUrl: import.meta.env.VITE_API_URL as string,
        getToken: async () => token,
      });
      // Save primary trade for backward compat + all trade IDs
      if (trades.length > 0) {
        await client.selectTrade(trades[0].id);
      }
    } catch {
      // ignore
    }
  }, [getToken, user?.sub]);

  const toggleTrade = useCallback((trade: Trade) => {
    setSelectedTradesState((prev) => {
      const exists = prev.some((t) => t.id === trade.id);
      const updated = exists ? prev.filter((t) => t.id !== trade.id) : [...prev, trade];
      if (user?.sub) {
        localStorage.setItem(`selected_trades_${user.sub}`, JSON.stringify(updated));
      }
      // Save to server async
      getToken().then((token) => {
        if (!token || updated.length === 0) return;
        const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
        client.selectTrade(updated[0].id).catch(() => {});
      });
      return updated;
    });
  }, [getToken, user?.sub]);

  // Primary trade is first selected (backward compat)
  const selectedTrade = selectedTrades.length > 0 ? selectedTrades[0] : null;

  return (
    <TradeContext.Provider value={{ selectedTrades, selectedTrade, setSelectedTrades, toggleTrade }}>
      {children}
    </TradeContext.Provider>
  );
}

export function useTrade() {
  const context = useContext(TradeContext);
  if (!context) throw new Error('useTrade must be used within TradeProvider');
  return context;
}
