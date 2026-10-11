/**
 * HawkEye-Cue — pure post-text helpers (no DOM-mutation side effects).
 *
 * These functions isolate the actual social post MESSAGE from Facebook's
 * surrounding interface chrome (profile wordmarks, menu/action labels, repeated
 * "Facebook" tokens, timestamps) and decide whether what remains is a real post.
 *
 * They are intentionally framework-free and loaded as a classic content script
 * BEFORE scanner.js (see manifest content_scripts order). The UMD-ish footer
 * exposes them on globalThis for the content script AND via module.exports for
 * the vitest regression tests — identical code runs in both.
 */
(function (root) {
  'use strict';

  // Interface tokens that are NOT post content. Lowercased, exact-line matches.
  // Conservative on purpose: only unambiguous Facebook UI chrome.
  var CHROME_LINES = new Set([
    'facebook', 'sponsored', 'suggested for you', 'follow', 'following',
    'like', 'comment', 'share', 'send', 'reply', 'see more', 'see less',
    'write a comment', 'active now', 'top contributor', 'author',
    'all reactions', 'most relevant', 'view more comments', 'view previous comments',
    'join', 'joined', 'group', 'public group', 'private group', 'members',
  ]);

  // A relative-timestamp line like "3h", "2 d", "5 hrs", "Yesterday at 4:12 PM",
  // "Just now", or a bare date fragment. These are post chrome, not content.
  var TIME_RE = /^(just now|yesterday(?:\s+at\s+.+)?|\d+\s*(s|m|h|d|w|y|sec|min|hr|hrs|hour|hours|day|days|week|weeks|min(?:ute)?s?)\b.*|\d{1,2}:\d{2}\s*(am|pm)?)$/i;

  // Collapse runs of whitespace to single spaces within a line.
  function squashWs(s) {
    return String(s == null ? '' : s).replace(/[ \t\f\v\u00a0]+/g, ' ').trim();
  }

  // Remove immediately-repeated identical words ("Facebook Facebook Facebook" →
  // "Facebook"), case-insensitive, preserving the first occurrence's casing.
  function dedupeAdjacentWords(line) {
    var words = line.split(' ');
    var out = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (out.length && out[out.length - 1].toLowerCase() === w.toLowerCase()) continue;
      out.push(w);
    }
    return out.join(' ');
  }

  function isChromeLine(line) {
    var l = line.toLowerCase().trim();
    if (!l) return true;
    if (CHROME_LINES.has(l)) return true;
    if (TIME_RE.test(l)) return true;
    // A line that is just the word "facebook" repeated (post-dedupe safety net).
    if (/^(facebook)(\s+facebook)*$/i.test(l)) return true;
    return false;
  }

  /**
   * Clean a raw text blob into post message text:
   *  - split into lines, drop interface-chrome lines,
   *  - collapse whitespace, de-duplicate adjacent repeated words,
   *  - drop lines that become empty.
   * Returns a trimmed string (possibly empty if nothing meaningful remains).
   */
  function cleanPostText(raw) {
    var text = String(raw == null ? '' : raw);
    var lines = text.split(/\r?\n+/);
    var kept = [];
    for (var i = 0; i < lines.length; i++) {
      var line = squashWs(lines[i]);
      if (!line) continue;
      line = dedupeAdjacentWords(line);
      if (isChromeLine(line)) continue;
      kept.push(line);
    }
    // Also de-dupe adjacent identical kept lines (chrome often repeats).
    var dedupedLines = [];
    for (var j = 0; j < kept.length; j++) {
      if (dedupedLines.length && dedupedLines[dedupedLines.length - 1].toLowerCase() === kept[j].toLowerCase()) continue;
      dedupedLines.push(kept[j]);
    }
    return dedupedLines.join(' ').trim();
  }

  /**
   * Decide whether cleaned text is a meaningful post (not residual chrome).
   * Requires a minimum length and at least some alphabetic content, and rejects
   * text that is still only interface tokens.
   */
  function isMeaningfulPost(text) {
    var t = squashWs(text);
    if (t.length < 15) return false;
    // Must contain letters (not just emoji/punctuation/numbers).
    if (!/[a-z]{3,}/i.test(t)) return false;
    // Reject if, after cleaning, it is still only chrome words.
    var words = t.toLowerCase().split(' ').filter(Boolean);
    var chromeCount = 0;
    for (var i = 0; i < words.length; i++) {
      if (CHROME_LINES.has(words[i]) || words[i] === 'facebook') chromeCount++;
    }
    if (words.length > 0 && chromeCount / words.length > 0.8) return false;
    return true;
  }

  /**
   * Extract the actual post MESSAGE from a container element, preferring
   * Facebook's dedicated message nodes; falls back to the largest dir="auto"
   * text block. Returns the CLEANED message, or '' if nothing reliable is found.
   *
   * CRITICAL (fail-safe): if we cannot find a reliable message element, we return
   * '' rather than the whole container's innerText. Callers must treat '' as
   * "no reliable post text" and must NOT substitute container chrome.
   */
  function extractPostMessage(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return '';

    // 1) Facebook's explicit message nodes (most reliable).
    var messageNodes = container.querySelectorAll(
      'div[data-ad-preview="message"], div[data-ad-comet-preview="message"]'
    );
    for (var i = 0; i < messageNodes.length; i++) {
      var cleaned = cleanPostText(messageNodes[i].innerText || messageNodes[i].textContent || '');
      if (isMeaningfulPost(cleaned)) return cleaned;
    }

    // 2) Fallback: the largest dir="auto" text block that cleans to a real post.
    //    Facebook renders the post body in one or more dir="auto" blocks; the
    //    body is typically the single largest meaningful one.
    var autoNodes = container.querySelectorAll('div[dir="auto"], span[dir="auto"]');
    var best = '';
    for (var j = 0; j < autoNodes.length; j++) {
      // Skip nodes that are inside a comment composer / reply area.
      var cleanedAuto = cleanPostText(autoNodes[j].innerText || autoNodes[j].textContent || '');
      if (isMeaningfulPost(cleanedAuto) && cleanedAuto.length > best.length) {
        best = cleanedAuto;
      }
    }
    if (best) return best;

    // 3) FAIL SAFE: we could not isolate a reliable message node or a meaningful
    //    dir="auto" body. Per requirement, do NOT substitute the whole container's
    //    chrome-laden text — return '' so callers skip badging/scoring/saving rather
    //    than persisting corrupted content.
    return '';
  }

  // ─── Duplicate-badge prevention ───────────────────────────────────────────

  var ARTICLE_SELECTOR = 'div[role="article"], article, [data-pagelet^="FeedUnit"]';

  /**
   * Given a starting element, return the OUTERMOST article/feed-unit ancestor
   * (collapsing Facebook's nested role="article" layouts to ONE logical post).
   * Falls back to the nearest article, then the element itself.
   */
  function pickOutermostArticle(el) {
    if (!el || typeof el.closest !== 'function') return el;
    var nearest = el.closest(ARTICLE_SELECTOR);
    if (!nearest) return el;
    var outermost = nearest;
    var cur = nearest.parentElement;
    while (cur) {
      if (typeof cur.closest === 'function') {
        var ancestorArticle = cur.closest(ARTICLE_SELECTOR);
        if (ancestorArticle) { outermost = ancestorArticle; cur = ancestorArticle.parentElement; continue; }
      }
      break;
    }
    return outermost;
  }

  /**
   * True if this logical post already carries a HawkEye badge/marker anywhere in
   * its subtree OR on any ancestor — so a differently-resolved node for the same
   * post cannot get a second badge.
   */
  function postAlreadyBadged(container) {
    if (!container) return false;
    var markerSel = '.hawkeye-overlay, .wingman-overlay, [data-hawkeye-seen="1"]';
    if (typeof container.querySelector === 'function' && container.querySelector(markerSel)) return true;
    if (typeof container.matches === 'function' && container.matches('[data-hawkeye-seen="1"]')) return true;
    // Walk ancestors — a parent post unit may already be badged.
    var cur = container.parentElement;
    for (var i = 0; i < 15 && cur; i++) {
      if (typeof cur.querySelector === 'function' && cur.querySelector(markerSel)) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  var api = {
    squashWs: squashWs,
    dedupeAdjacentWords: dedupeAdjacentWords,
    isChromeLine: isChromeLine,
    cleanPostText: cleanPostText,
    isMeaningfulPost: isMeaningfulPost,
    extractPostMessage: extractPostMessage,
    pickOutermostArticle: pickOutermostArticle,
    postAlreadyBadged: postAlreadyBadged,
    ARTICLE_SELECTOR: ARTICLE_SELECTOR,
  };

  // Expose for the content script (browser) and for tests (CommonJS).
  root.HawkEyePostText = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
