import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { ApiClient } from '@social-lead-gen/shared';
import { resolveSummitAccess, type SummitAccess, type TeamRole } from '../lib/summitAccess';

// App-wide Summit (Team) access state. Drives whether "Summit HQ" appears in the main
// navigation and which team experience a user gets. A single source of truth so the nav
// reacts to subscription/team changes WITHOUT a logout/login — call refresh() after a
// checkout or team join and the nav updates in place.

interface SummitState extends SummitAccess {
  loaded: boolean;
  /** Re-fetch subscription + team state (e.g. after checkout or accepting an invite). */
  refresh: () => Promise<void>;
}

const SummitContext = createContext<SummitState | undefined>(undefined);

const DEFAULT: SummitAccess = { isSummit: false, teamRole: null, hasTeam: false, isOwner: false };

export function SummitProvider({ children }: { children: ReactNode }) {
  const { user, getToken } = useAuth();
  const [access, setAccess] = useState<SummitAccess>(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.sub) {
      setAccess(DEFAULT);
      setLoaded(true);
      return;
    }
    try {
      const token = await getToken();
      const client = new ApiClient({ baseUrl: import.meta.env.VITE_API_URL as string, getToken: async () => token });

      // Fetch both in parallel; tolerate either failing (user may have no sub/team yet).
      const [subRes, teamRes] = await Promise.allSettled([
        client.request<{ tier?: string; status?: string }>('GET', '/subscription'),
        client.request<{ team: { role?: string } | null }>('GET', '/team'),
      ]);

      const sub = subRes.status === 'fulfilled' ? subRes.value : null;
      const team = teamRes.status === 'fulfilled' ? teamRes.value?.team : null;
      const teamRole = (team?.role as TeamRole) ?? null;

      // Fail CLOSED: if we couldn't read subscription AND couldn't read team, don't
      // fabricate Summit access — leave it off until a successful read.
      if (subRes.status === 'rejected' && teamRes.status === 'rejected') {
        setAccess(DEFAULT);
        return;
      }

      setAccess(
        resolveSummitAccess({
          subscriptionTier: sub?.tier,
          subscriptionStatus: sub?.status,
          teamRole,
        }),
      );
    } catch {
      // Unexpected failure — fail closed, keep nav from showing a paid feature.
      setAccess(DEFAULT);
    } finally {
      setLoaded(true);
    }
  }, [user?.sub]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hydrate on login / user change.
  useEffect(() => {
    setLoaded(false);
    refresh();
  }, [user?.sub]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SummitContext.Provider value={{ ...access, loaded, refresh }}>
      {children}
    </SummitContext.Provider>
  );
}

export function useSummit(): SummitState {
  const ctx = useContext(SummitContext);
  if (!ctx) {
    // Safe fallback — never crash if used outside the provider.
    return { ...DEFAULT, loaded: true, refresh: async () => {} };
  }
  return ctx;
}
