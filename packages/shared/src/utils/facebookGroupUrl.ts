// @social-lead-gen/shared
// Facebook group URL validation + normalization for Smart Flock Import and manual
// Flock entry. A valid, openable group URL is REQUIRED before a flock group can be
// saved so that "Copy & Open" can reliably open the correct group.
//
// We accept the common forms a user can copy from a browser or the FB app and
// normalize them to a canonical https URL. We never invent a URL — callers pass only
// what the user provided (or what the AI extracted verbatim).

export interface FacebookGroupUrlResult {
  ok: boolean;
  url?: string; // normalized canonical URL when ok
  error?: string; // human-readable reason when not ok
}

/**
 * Validate and normalize a Facebook group URL.
 *
 * Accepted inputs (case-insensitive host, optional scheme / www / m / mbasic):
 *   - facebook.com/groups/123456789
 *   - https://www.facebook.com/groups/mygroupname
 *   - http://m.facebook.com/groups/123/   (trailing slash / path tolerated)
 *   - facebook.com/groups/123/?ref=...     (query/fragment stripped)
 *   - fb.com/groups/123
 *
 * Normalized output: https://www.facebook.com/groups/<id-or-slug>
 *
 * Rejects: empty, non-facebook hosts, facebook URLs that are not /groups/ links,
 * or a /groups/ path with no group identifier.
 */
export function normalizeFacebookGroupUrl(input: string): FacebookGroupUrlResult {
  if (!input || typeof input !== 'string' || !input.trim()) {
    return { ok: false, error: 'Enter the Facebook group link.' };
  }
  let raw = input.trim();

  // Add a scheme if the user pasted a bare host (so URL() can parse it).
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    raw = 'https://' + raw;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "That doesn't look like a valid link." };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '').replace(/^mbasic\./, '');
  const isFacebookHost = host === 'facebook.com' || host === 'fb.com';
  if (!isFacebookHost) {
    return { ok: false, error: 'Use a facebook.com group link.' };
  }

  // Path must be /groups/<identifier>[/...]
  const segments = parsed.pathname.split('/').filter((s) => s.length > 0);
  if (segments.length < 2 || segments[0].toLowerCase() !== 'groups') {
    return { ok: false, error: 'Link must be a Facebook group (…/groups/…).' };
  }
  const identifier = segments[1].trim();
  if (!identifier) {
    return { ok: false, error: 'Group link is missing the group id.' };
  }

  // Canonical form — drop query/fragment, force https + www, numeric or slug id.
  return { ok: true, url: `https://www.facebook.com/groups/${identifier}` };
}

/** Convenience boolean check. */
export function isValidFacebookGroupUrl(input: string): boolean {
  return normalizeFacebookGroupUrl(input).ok;
}
