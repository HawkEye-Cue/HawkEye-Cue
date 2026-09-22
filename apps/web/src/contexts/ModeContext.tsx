import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { ApiClient } from '@social-lead-gen/shared';

export type AppMode = 'guided' | 'pro';

interface ModeState {
  mode: AppMode;
  isGuided: boolean;
  isPro: boolean;
  setMode: (mode: AppMode) => void;
  toggleMode: () => void;
  loaded: boolean;
}

const ModeContext = createContext<ModeState | undefined>(undefined);

function storageKey(sub?: string) {
  return sub ? `hawkeye_mode_${sub}` : 'hawkeye_mode';
}

export function ModeProvider({ children }: { children: ReactNode }) {
  const { user, getToken } = useAuth();
  // Default to Guided for new users.
  const [mode, setModeState] = useState<AppMode>(() => {
    try {
      const v = localStorage.getItem(storageKey(user?.sub));
      return v === 'pro' ? 'pro' : 'guided';
    } catch { return 'guided'; }
  });
  const [loaded, setLoaded] = useState(false);

  // On login, hydrate from profile preferences (cross-device), falling back to local.
  useEffect(() => {
    const sub = user?.sub;
    if (!sub) return;
    // Local first (instant)
    try {
      const v = localStorage.getItem(storageKey(sub));
      if (v === 'pro' || v === 'guided') setModeState(v);
    } catch { /* ignore */ }
    // Then server
    async function hydrate() {
      try {
        const token = await getToken();
        const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
        const prefs = await client.request<{ appMode?: string }>('GET', '/profile/preferences');
        if (prefs.appMode === 'pro' || prefs.appMode === 'guided') {
          setModeState(prefs.appMode);
          localStorage.setItem(storageKey(sub), prefs.appMode);
        }
      } catch { /* offline / no prefs — keep local */ }
      finally { setLoaded(true); }
    }
    hydrate();
  }, [user?.sub]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMode = useCallback((next: AppMode) => {
    setModeState(next);
    try { localStorage.setItem(storageKey(user?.sub), next); } catch { /* ignore */ }
    // Persist to server (best-effort)
    (async () => {
      try {
        const token = await getToken();
        const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
        await client.request('PUT', '/profile/preferences', { appMode: next });
      } catch { /* best-effort */ }
    })();
  }, [user?.sub]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMode = useCallback(() => setMode(mode === 'guided' ? 'pro' : 'guided'), [mode, setMode]);

  return (
    <ModeContext.Provider value={{ mode, isGuided: mode === 'guided', isPro: mode === 'pro', setMode, toggleMode, loaded }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode(): ModeState {
  const ctx = useContext(ModeContext);
  if (!ctx) {
    // Safe fallback so components never crash if used outside the provider.
    return { mode: 'guided', isGuided: true, isPro: false, setMode: () => {}, toggleMode: () => {}, loaded: true };
  }
  return ctx;
}
