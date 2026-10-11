// @vitest-environment jsdom
//
// Regression tests for HawkEye-Cue extension post-text extraction + duplicate-badge
// prevention. Covers the two launch-blocking bugs:
//   1. Popup/scoring/saved-lead showed repeated "Facebook" interface text instead of
//      the actual post message.
//   2. A single logical Facebook post received two badges (header + image).
//
// The helpers are framework-free and exported via module.exports from post-text.js.
// We load them with require() so the SAME code the content script runs is tested.

import { describe, it, expect, beforeEach } from 'vitest';
// The helper file is a classic script with a UMD-ish footer. Importing it for side
// effects registers the API on globalThis (the browser path), which is robust across
// CJS/ESM interop. We read the API from there to mirror how the content script uses it.
import './post-text.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PT: any = (globalThis as any).HawkEyePostText;

describe('cleanPostText — strips Facebook chrome and repeated words', () => {
  it('collapses repeated "Facebook Facebook Facebook" and keeps the real message', () => {
    const raw = [
      'Facebook',
      'Facebook Facebook Facebook',
      'Jane Doe',
      '3h',
      'Recommendations Denver Commercial insurance broker?',
      'Like', 'Comment', 'Share',
    ].join('\n');
    const cleaned = PT.cleanPostText(raw);
    expect(cleaned).toContain('Recommendations Denver Commercial insurance broker?');
    // No stray "Facebook" wordmark survives.
    expect(cleaned.toLowerCase()).not.toContain('facebook');
    // Interface action labels removed.
    expect(cleaned.toLowerCase()).not.toMatch(/\blike\b|\bcomment\b|\bshare\b/);
  });

  it('de-duplicates adjacent repeated words regardless of case', () => {
    expect(PT.dedupeAdjacentWords('Facebook Facebook facebook Hello Hello world')).toBe('Facebook Hello world');
  });

  it('drops relative timestamps and bare interface lines', () => {
    const raw = 'Just now\n2 hrs\nYesterday at 4:12 PM\nActual message here about roofing';
    const cleaned = PT.cleanPostText(raw);
    expect(cleaned).toBe('Actual message here about roofing');
  });
});

describe('isMeaningfulPost — rejects residual chrome, accepts real posts', () => {
  it('rejects empty, too-short, or chrome-only text', () => {
    expect(PT.isMeaningfulPost('')).toBe(false);
    expect(PT.isMeaningfulPost('Facebook')).toBe(false);
    expect(PT.isMeaningfulPost('Like Comment Share')).toBe(false);
    expect(PT.isMeaningfulPost('👍🔥')).toBe(false);
  });
  it('accepts a genuine post message', () => {
    expect(PT.isMeaningfulPost('Recommendations Denver Commercial insurance broker?')).toBe(true);
  });
});

describe('extractPostMessage — isolates the message node, fails safe otherwise', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('extracts the Facebook message node, not the surrounding chrome', () => {
    document.body.innerHTML = `
      <div role="article">
        <div><a role="link"><strong>Jane Doe</strong></a><span>Facebook</span><span>3h</span></div>
        <div data-ad-preview="message">Recommendations Denver Commercial insurance broker?</div>
        <div aria-label="Like">Like</div><div aria-label="Comment">Comment</div>
      </div>`;
    const container = document.querySelector('div[role="article"]') as HTMLElement;
    const msg = PT.extractPostMessage(container);
    expect(msg).toBe('Recommendations Denver Commercial insurance broker?');
    expect(msg.toLowerCase()).not.toContain('facebook');
  });

  it('falls back to the largest meaningful dir="auto" block when no message node', () => {
    document.body.innerHTML = `
      <div role="article">
        <span dir="auto">Facebook</span>
        <div dir="auto">Looking for a reliable plumber near Lakewood for a burst pipe, any recommendations?</div>
        <span dir="auto">Like</span>
      </div>`;
    const container = document.querySelector('div[role="article"]') as HTMLElement;
    const msg = PT.extractPostMessage(container);
    expect(msg).toContain('reliable plumber near Lakewood');
  });

  it('FAILS SAFE: returns "" when the container is only interface chrome', () => {
    document.body.innerHTML = `
      <div role="article">
        <span>Facebook</span><span>Facebook</span><span>Like</span><span>Comment</span><span>Share</span>
      </div>`;
    const container = document.querySelector('div[role="article"]') as HTMLElement;
    expect(PT.extractPostMessage(container)).toBe('');
  });
});

describe('keyword matching uses cleaned content, not interface text', () => {
  it('matches a keyword present in the real message after cleaning', () => {
    const raw = 'Facebook\nFacebook\nRecommendations Denver Commercial insurance broker?\nLike Comment Share';
    const cleaned = PT.cleanPostText(raw);
    const keywords = ['insurance'];
    const matched = keywords.filter((k) => cleaned.toLowerCase().includes(k.toLowerCase()));
    expect(matched).toEqual(['insurance']);
  });
  it('does NOT match a keyword that only appears in interface chrome', () => {
    // "share" is a Facebook action label; it must be stripped so it cannot match.
    const raw = 'Facebook\nShare\nI just adopted a puppy today!';
    const cleaned = PT.cleanPostText(raw);
    const matched = ['share'].filter((k) => cleaned.toLowerCase().includes(k));
    expect(matched).toEqual([]);
  });
});

describe('duplicate-badge prevention', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('pickOutermostArticle collapses nested role="article" to the outer post', () => {
    document.body.innerHTML = `
      <div role="article" id="outer">
        <div data-ad-preview="message">Outer post text about insurance renewal</div>
        <div role="article" id="inner">
          <img alt="shared" /><div dir="auto">embedded shared content</div>
        </div>
      </div>`;
    const innerTextNode = document.querySelector('#inner div[dir="auto"]') as HTMLElement;
    const resolved = PT.pickOutermostArticle(innerTextNode.closest('div[role="article"]'));
    expect((resolved as HTMLElement).id).toBe('outer');
  });

  it('postAlreadyBadged detects a badge on an ancestor (prevents second badge)', () => {
    document.body.innerHTML = `
      <div role="article" id="outer">
        <div class="hawkeye-overlay">badge</div>
        <div role="article" id="inner"><div dir="auto">image caption</div></div>
      </div>`;
    const inner = document.querySelector('#inner') as HTMLElement;
    // The inner article resolves separately, but its ancestor already has a badge.
    expect(PT.postAlreadyBadged(inner)).toBe(true);
  });

  it('postAlreadyBadged is false for a fresh, unbadged post', () => {
    document.body.innerHTML = `<div role="article" id="fresh"><div dir="auto">a brand new post</div></div>`;
    const fresh = document.querySelector('#fresh') as HTMLElement;
    expect(PT.postAlreadyBadged(fresh)).toBe(false);
  });
});
