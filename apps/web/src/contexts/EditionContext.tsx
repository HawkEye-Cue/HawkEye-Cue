import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { ApiClient, resolveEdition } from '@social-lead-gen/shared';
import type { Edition } from '@social-lead-gen/shared';

interface EditionState {
  edition: Edition;
  isDiscover: boolean;
  isGrow: boolean;
  /** Persists first; resolves false if the write failed (edition reverts). */
  setEdition: (e: Edition) => Promise<boolean>;
  loaded: boolean;
}

const EditionContext = createContext<EditionState | undefined>(undefined);

function storageKey(sub?: string) {
  return sub ? `hawkeye_edition_${sub}` : 'hawkeye_edition';
}

export function EditionProvider({ children }: { children: ReactNode }) {
  const { user, getToken } = useAuth();
  // Default to Grow (Req 1.4, 2.7).
  const [edition, setEditionState] = useState<Edition>(() => {
    try { return resolveEdition(localStorage.getItem(storageKey(user?.sub))); }
    catch { return 'grow'; }
  });
  const [loaded, setLoaded] = useState(false);

  // On login: local-first (instant), then hydrate from server.
  useEffect(() => {
    const sub = user?.sub;
    if (!sub) return;
    try {
      const local = resolveEdition(localStorage.getItem(storageKey(sub)));
      setEditionState(local);
    } catch { /* ignore */ }
    async function hydrate() {
      try {
        const token = await getToken();
        const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
        const prefs = await client.request<{ edition?: string }>('GET', '/profile/preferences');
        const resolved = resolveEdition(prefs.edition);
        setEditionState(resolved);
        localStorage.setItem(storageKey(sub), resolved);
      } catch { /* offline — keep local */ }
      finally { setLoaded(true); }
    }
    hydrate();
  }, [user?.sub]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist first; only apply visibility on success (Req 2.3, 2.4, 3.7).
  const setEdition = useCallback(async (next: Edition): Promise<boolean> => {
    const prev = edition;
    try {
      const token = await getToken();
      const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });
      await client.request('PUT', '/profile/preferences', { edition: next });
      setEditionState(next);
      try { localStorage.setItem(storageKey(user?.sub), next); } catch { /* ignore */ }
      return true;
    } catch {
      // Persist failed — revert to previous edition, caller shows "not saved".
      setEditionState(prev);
      return false;
    }
  }, [edition, user?.sub]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <EditionContext.Provider value={{ edition, isDiscover: edition === 'discover', isGrow: edition === 'grow', setEdition, loaded }}>
      {children}
    </EditionContext.Provider>
  );
}

export function useEdition(): EditionState {
  const ctx = useContext(EditionContext);
  if (!ctx) {
    // Safe fallback — never crash if used outside the provider.
    return { edition: 'grow', isDiscover: false, isGrow: true, setEdition: async () => true, loaded: true };
  }
  return ctx;
}
