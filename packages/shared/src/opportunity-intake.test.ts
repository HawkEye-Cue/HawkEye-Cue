import { describe, it, expect } from 'vitest';
import {
  isAutoDetected,
  isUsableAuthor,
  sanitizeAuthorForStorage,
  displayAuthorOrUnavailable,
  canonicalizePostUrl,
  dedupeKeyForPost,
  isDuplicatePost,
  AUTHOR_UNAVAILABLE,
} from './opportunity-intake.js';

describe('isAutoDetected — review-first gating for both automatic write paths', () => {
  it('flags extension content-script saves (keywordId extension-detected)', () => {
    expect(isAutoDetected({ keywordId: 'extension-detected' })).toBe(true);
  });
  it('flags background-scanner saves (source background-scan)', () => {
    expect(isAutoDetected({ source: 'background-scan' })).toBe(true);
  });
  it('flags legacy scanner records carrying matchedKeywords', () => {
    expect(isAutoDetected({ matchedKeywords: ['roofer'] })).toBe(true);
  });
  it('does NOT flag manual entry', () => {
    expect(isAutoDetected({ keywordId: 'manual-entry' })).toBe(false);
  });
  it('does NOT flag a user-configured keyword capture that is not auto', () => {
    expect(isAutoDetected({ keywordId: 'kw-123' })).toBe(false);
  });
});

describe('isUsableAuthor — author quality (regression cases)', () => {
  it('rejects the known junk authors from the production incident', () => {
    for (const bad of ['Photos', 'Unnamed', 'Unknown', 'm.me', 'Go.IcaAgencyAlliance.com', 'HTTPS://TOTALCSR.COM/DEMO-SCHEDULE/']) {
      expect(isUsableAuthor(bad)).toBe(false);
    }
  });
  it('rejects empty / whitespace / single char', () => {
    expect(isUsableAuthor('')).toBe(false);
    expect(isUsableAuthor('   ')).toBe(false);
    expect(isUsableAuthor('A')).toBe(false);
    expect(isUsableAuthor(null)).toBe(false);
  });
  it('rejects marketing headlines leaked into the author slot', () => {
    expect(isUsableAuthor('See What You’ve Been Waiting For')).toBe(false);
  });
  it('rejects pure-punctuation / numeric junk', () => {
    expect(isUsableAuthor('••••')).toBe(false);
    expect(isUsableAuthor('12345')).toBe(false);
  });
  it('rejects overly long values (post text, not a name)', () => {
    expect(isUsableAuthor('a'.repeat(80))).toBe(false);
  });
  it('ACCEPTS real personal names', () => {
    for (const ok of ['Dana Prospect', 'Fernando', 'Tina Lockwood', 'José García']) {
      expect(isUsableAuthor(ok)).toBe(true);
    }
  });
  it('ACCEPTS legitimate business names (not personal)', () => {
    for (const ok of ['Rocky Mountain Insurance', 'Acme Roofing LLC', 'Brighton Realty Group']) {
      expect(isUsableAuthor(ok)).toBe(true);
    }
  });
});

describe('sanitizeAuthorForStorage / displayAuthorOrUnavailable', () => {
  it('stores null for junk, trimmed name for real identities', () => {
    expect(sanitizeAuthorForStorage('Photos')).toBeNull();
    expect(sanitizeAuthorForStorage('m.me')).toBeNull();
    expect(sanitizeAuthorForStorage('  Dana Prospect  ')).toBe('Dana Prospect');
  });
  it('displays the fallback for junk, the name otherwise', () => {
    expect(displayAuthorOrUnavailable('Photos')).toBe(AUTHOR_UNAVAILABLE);
    expect(displayAuthorOrUnavailable(null)).toBe(AUTHOR_UNAVAILABLE);
    expect(displayAuthorOrUnavailable('Acme Roofing LLC')).toBe('Acme Roofing LLC');
  });
});

describe('canonicalizePostUrl', () => {
  it('returns null for a bare feed root (not a per-post id)', () => {
    expect(canonicalizePostUrl('https://www.facebook.com/')).toBeNull();
    expect(canonicalizePostUrl('https://m.facebook.com')).toBeNull();
    expect(canonicalizePostUrl('')).toBeNull();
  });
  it('extracts a stable key for a /posts/ permalink and ignores tracking params', () => {
    const a = canonicalizePostUrl('https://www.facebook.com/groups/x/posts/1001/?utm_source=foo');
    const b = canonicalizePostUrl('https://facebook.com/groups/x/posts/1001?ref=bar#comment');
    expect(a).toBe(b);
    expect(a).toContain('/posts/1001');
  });
  it('uses story_fbid when present', () => {
    expect(canonicalizePostUrl('https://www.facebook.com/permalink.php?story_fbid=555&id=9')).toContain('555');
  });
});

describe('dedupeKeyForPost — cross-session dedupe', () => {
  it('prefers an explicit post id', () => {
    expect(dedupeKeyForPost({ postId: 'ABC' })).toBe('id:abc');
  });
  it('falls back to a canonical URL when no id', () => {
    const k = dedupeKeyForPost({ sourceUrl: 'https://www.facebook.com/posts/1001/' });
    expect(k).toBe('url:facebook.com/posts/1001');
  });
  it('falls back to author+content when no id or usable url', () => {
    const k = dedupeKeyForPost({ sourceUrl: 'https://www.facebook.com/', sourceAuthor: 'Dana', sourceContent: 'Need insurance quote please' });
    expect(k).toBe('ac:dana|need insurance quote please');
  });
  it('returns null when there is nothing to key on (never dedupe blindly)', () => {
    expect(dedupeKeyForPost({ sourceUrl: 'https://www.facebook.com/' })).toBeNull();
    expect(dedupeKeyForPost({})).toBeNull();
  });
  it('does NOT merge different posts from the same author (content disambiguates)', () => {
    const a = dedupeKeyForPost({ sourceAuthor: 'Dana', sourceContent: 'Looking for auto insurance' });
    const b = dedupeKeyForPost({ sourceAuthor: 'Dana', sourceContent: 'Looking for home insurance' });
    expect(a).not.toBe(b);
  });
  it('treats the same post reposted (same first 80 chars) as a duplicate', () => {
    // Shared prefix must be >= 80 chars for the conservative fallback to match.
    const prefix = 'Does anyone know a good insurance agent near Brighton? Looking to bundle home and auto';
    const a = dedupeKeyForPost({ sourceAuthor: 'Dana', sourceContent: prefix + ' insurance this week.' });
    const b = dedupeKeyForPost({ sourceAuthor: 'Dana', sourceContent: prefix + ' insurance. (reposting in case anyone missed it)' });
    expect(a).toBe(b);
  });
});

describe('isDuplicatePost', () => {
  it('detects a URL-keyed duplicate across sessions', () => {
    const seen = new Set(['url:facebook.com/posts/1001']);
    expect(isDuplicatePost({ sourceUrl: 'https://facebook.com/posts/1001?ref=x' }, seen)).toBe(true);
  });
  it('does not flag a keyless candidate as duplicate', () => {
    expect(isDuplicatePost({ sourceUrl: 'https://www.facebook.com/' }, new Set(['url:x']))).toBe(false);
  });
});

describe('cross-path key compatibility (extension handler vs background scanner)', () => {
  // The opportunities handler keys a comment-derived capture off postId ?? sourceCommentId.
  // The background lead-scanner stores sourceCommentId and dedupes on it directly. Both must
  // resolve to the SAME stable identifier so a post captured by one path matches the other.
  it('a sourceCommentId produces the same id: key the scanner would use', () => {
    const handlerKey = dedupeKeyForPost({ postId: 'cmt-abc' });
    const scannerCommentId = 'cmt-abc'; // scanner stores this; its id: key is id:<lowercased>
    expect(handlerKey).toBe('id:' + scannerCommentId.toLowerCase());
  });
  it('comment-id keys take precedence over URL/content so the two paths converge', () => {
    const viaCommentId = dedupeKeyForPost({ postId: 'cmt-1', sourceUrl: 'https://facebook.com/posts/9', sourceContent: 'x' });
    expect(viaCommentId).toBe('id:cmt-1');
  });
});
