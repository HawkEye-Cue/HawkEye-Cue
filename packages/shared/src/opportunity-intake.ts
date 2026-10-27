// Opportunity intake — pure helpers shared by the extension, the background
// lead-scanner, and the web Pipeline. Three concerns, all pure + testable:
//
//   1. Auto-detection classification  — is this record auto-captured (review-first)?
//   2. Author quality                 — is a captured author a real identity?
//   3. Cross-session dedupe key       — a stable identifier for one source post.
//
// Keeping these in one shared module guarantees the extension write path, the
// background-scanner write path, and the web UI all apply the SAME rules.

// ─── 1. Auto-detection classification ───────────────────────────────────────
// Automatically detected opportunities must land in a review-first Inbox, not the
// Pipeline. Both automatic write paths are identifiable:
//   • extension content-script save → keywordId === 'extension-detected'
//   • background comment scanner    → source === 'background-scan' (and/or matchedKeywords[])
// Manual entry (keywordId 'manual-entry' or any real keyword the user configured) is
// NOT auto-detected and must preserve its existing straight-to-pipeline behavior.

export interface IntakeClassifiable {
  keywordId?: string | null;
  source?: string | null;
  matchedKeywords?: unknown;
  /** Explicit opt-in some callers set; when true, force auto-detected. */
  autoDetected?: boolean;
}

export function isAutoDetected(rec: IntakeClassifiable): boolean {
  if (rec.autoDetected === true) return true;
  if (rec.keywordId === 'extension-detected') return true;
  if (rec.source === 'background-scan') return true;
  if (Array.isArray(rec.matchedKeywords)) return true;
  return false;
}

// ─── 2. Author quality ───────────────────────────────────────────────────────
// Facebook author extraction frequently grabs UI chrome ("Photos"), navigation,
// Messenger/link domains ("m.me", "Go.lc"), or advertising URLs instead of the
// poster. Those must NOT be stored as an identity. We are deliberately conservative:
// we reject only clear non-identities, and we DO allow legitimate business names.

export const AUTHOR_UNAVAILABLE = 'Author unavailable';

// Exact-match UI/navigation labels Facebook renders as link text (case-insensitive).
const UI_LABELS = new Set([
  'unknown', 'unnamed', 'photos', 'photo', 'videos', 'video', 'reels', 'reel',
  'see more', 'see less', 'like', 'comment', 'share', 'follow', 'following',
  'message', 'sponsored', 'suggested for you', 'shared post', 'facebook',
  'write a comment', 'active', 'admin', 'top contributor', 'author',
  'see what you’ve been waiting for', "see what you've been waiting for",
]);

// Tokens that mark the value as a URL / domain / handle rather than a name.
const URL_OR_DOMAIN = /(https?:\/\/|www\.|m\.me\b|\bfb\.me\b|@|\.com\b|\.net\b|\.org\b|\.io\b|\.co\b|\.lc\b|\.gov\b|\.edu\b|\.biz\b|\.info\b|\.us\b|\.ca\b|\.uk\b)/i;

/**
 * Whether an extracted author string is a usable, real identity (person OR business).
 * Returns false for empty, UI labels, URLs/domains, and obviously non-name junk.
 * Does NOT reject multi-word business names ("Rocky Mountain Insurance LLC").
 */
export function isUsableAuthor(author?: string | null): boolean {
  const a = (author ?? '').trim();
  if (a.length < 2) return false;
  const lower = a.toLowerCase();
  if (UI_LABELS.has(lower)) return false;
  if (URL_OR_DOMAIN.test(a)) return false;
  // A value with no letters at all (pure punctuation/numbers) is not a name.
  if (!/[a-z\u00c0-\u024f]/i.test(a)) return false;
  // Overly long values are post text that leaked into the author slot, not a name.
  if (a.length > 60) return false;
  return true;
}

/**
 * The author to STORE for a captured record: the real author, or null when none is
 * usable (we never fabricate — the UI shows AUTHOR_UNAVAILABLE for null).
 */
export function sanitizeAuthorForStorage(author?: string | null): string | null {
  return isUsableAuthor(author) ? (author as string).trim() : null;
}

/** The author to DISPLAY: the real author, or the "Author unavailable" fallback. */
export function displayAuthorOrUnavailable(author?: string | null): string {
  return isUsableAuthor(author) ? (author as string).trim() : AUTHOR_UNAVAILABLE;
}

// ─── 3. Cross-session dedupe key ─────────────────────────────────────────────
// Prevent re-saving the same source post across scanning sessions. Prefer a stable
// post identifier / canonical URL; fall back conservatively to author+content so we
// do NOT merge different posts from the same author (the content fragment disambiguates).

/** Strip tracking params + fragments so the same post URL dedupes across sessions. */
export function canonicalizePostUrl(url?: string | null): string | null {
  const raw = (url ?? '').trim();
  if (!raw) return null;
  // A bare feed root (e.g. https://www.facebook.com/) is NOT a per-post identifier.
  const noProto = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/,'');
  if (/^(m\.|mobile\.)?facebook\.com$/i.test(noProto)) return null;
  try {
    const u = new URL(raw);
    // Known stable FB post identifiers.
    const fbid = u.searchParams.get('story_fbid') || u.searchParams.get('fbid');
    const path = u.pathname.replace(/\/+$/,'');
    const postMatch = path.match(/\/(posts|permalink|videos|reel|p)\/([^/]+)/i);
    if (postMatch) return (u.hostname.replace(/^www\./i,'') + path).toLowerCase();
    if (fbid) return (u.hostname.replace(/^www\./i,'') + '/' + fbid).toLowerCase();
    // Generic: host + path (no query/hash) when the path is more than just root.
    if (path && path !== '') return (u.hostname.replace(/^www\./i,'') + path).toLowerCase();
    return null;
  } catch {
    return null;
  }
}

/**
 * A stable dedupe key for one source post, consistent across sessions:
 *   • prefer an explicit post id  → "id:<postId>"
 *   • else a canonical post URL   → "url:<canonicalUrl>"
 *   • else conservative fallback  → "ac:<author>|<first 80 chars of content>"
 * Returns null only when there is truly nothing to key on (never dedupe blindly).
 */
export function dedupeKeyForPost(input: {
  postId?: string | null;
  sourceUrl?: string | null;
  sourceAuthor?: string | null;
  sourceContent?: string | null;
}): string | null {
  const id = (input.postId ?? '').trim();
  if (id) return 'id:' + id.toLowerCase();

  const canon = canonicalizePostUrl(input.sourceUrl);
  if (canon) return 'url:' + canon;

  const author = (input.sourceAuthor ?? '').trim().toLowerCase();
  const content = (input.sourceContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
  if (content) return 'ac:' + author + '|' + content;

  return null;
}

/** True when the candidate post's dedupe key already appears in the seen set. */
export function isDuplicatePost(
  candidate: Parameters<typeof dedupeKeyForPost>[0],
  seenKeys: Iterable<string>,
): boolean {
  const key = dedupeKeyForPost(candidate);
  if (!key) return false; // nothing to key on → do not treat as duplicate
  const set = seenKeys instanceof Set ? seenKeys : new Set(seenKeys);
  return set.has(key);
}
