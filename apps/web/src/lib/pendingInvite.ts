// Small helper to carry a team-invite token across the unauthenticated hops
// (landing → register → email verification → login) without losing it.
//
// When an invited employee opens /team?invite=<token> while logged out, the AuthGuard
// redirects to /landing and the query string is dropped. We stash the token in
// sessionStorage first, then restore it after authentication so the invite can be
// accepted for the intended account. sessionStorage (not localStorage) keeps it scoped
// to the browser session and auto-clears when the tab closes.
//
// SECURITY: the token is an opaque invite id. We never log it. acceptInvite on the
// backend still enforces email-match, expiry, revoke, and single-use — this helper only
// preserves the token through the auth flow.

const KEY = 'hawkeye_pending_invite';

// Accept only a plausible invite token (UUID-ish / url-safe) to avoid stashing junk.
function isValidToken(t: string | null | undefined): t is string {
  return !!t && /^[A-Za-z0-9._-]{8,128}$/.test(t);
}

export function stashInvite(token: string | null | undefined): void {
  if (!isValidToken(token)) return;
  try { sessionStorage.setItem(KEY, token); } catch { /* storage unavailable */ }
}

// Read without clearing (for prefill / redirect decisions).
export function peekInvite(): string | null {
  try {
    const t = sessionStorage.getItem(KEY);
    return isValidToken(t) ? t : null;
  } catch { return null; }
}

// Read and clear (single consumption, e.g. after a successful accept attempt).
export function consumeInvite(): string | null {
  const t = peekInvite();
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  return t;
}

// Capture an invite token from a URL search string (e.g. window.location.search).
export function stashInviteFromSearch(search: string): void {
  try {
    const code = new URLSearchParams(search).get('invite');
    stashInvite(code);
  } catch { /* ignore */ }
}
