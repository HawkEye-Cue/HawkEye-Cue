/**
 * HawkEye-Cue Content Script
 * Scans social media feeds for keyword matches and shows hawk icon overlay.
 */

(function () {
  'use strict';

  let keywords = [];
  let processedPosts = new Set();
  let isScanning = false;

  // ─── Platform Detection ───────────────────────────────────────────────────

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('facebook.com')) return 'facebook';
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('linkedin.com')) return 'linkedin';
    if (host.includes('tiktok.com')) return 'tiktok';
    return 'unknown';
  }

  const platform = detectPlatform();

  // ─── Post Selectors Per Platform ──────────────────────────────────────────

  const POST_SELECTORS = {
    facebook: '[data-ad-preview="message"], [data-ad-comet-preview="message"], div[dir="auto"][style*="text-align"], div[data-ad-rendering-role="story_message"], div.x1iorvi4[dir="auto"], div.xdj266r[dir="auto"]',
    instagram: 'article div span, article h1, article div._a9zs',
    linkedin: '.feed-shared-update-v2__description, .update-components-text, .feed-shared-text',
    tiktok: '[data-e2e="browse-video-desc"], .tiktok-1ejylhp-DivContainer, [data-e2e="video-desc"]',
  };

  // ─── Keyword Matching ─────────────────────────────────────────────────────

  function matchesKeywords(text) {
    const lower = text.toLowerCase();
    return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
  }

  // ─── Create Hawk Icon Overlay ─────────────────────────────────────────────

  function createHawkOverlay(postElement, matchedKeywords, postText) {
    // Don't add duplicate overlays
    if (postElement.querySelector('.hawkeye-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'hawkeye-overlay';
    overlay.innerHTML = `
      <div class="hawkeye-badge">
        <span class="hawkeye-icon">🦅</span>
        <span class="hawkeye-count">${matchedKeywords.length}</span>
      </div>
      <div class="hawkeye-panel" style="display:none;">
        <div class="hawkeye-panel-header">
          <span>🦅 HawkEye Match</span>
          <button class="hawkeye-close">&times;</button>
        </div>
        <div class="hawkeye-panel-body">
          <p class="hawkeye-keywords">Keywords: <strong>${matchedKeywords.join(', ')}</strong></p>
          <p class="hawkeye-preview">"${postText.slice(0, 120)}${postText.length > 120 ? '...' : ''}"</p>
          <div class="hawkeye-actions">
            <button class="hawkeye-btn hawkeye-btn-lead">💼 Save as Lead</button>
            <button class="hawkeye-btn hawkeye-btn-appreciate">🙏 Save Appreciation</button>
          </div>
        </div>
      </div>
    `;

    // Position relative to the post
    postElement.style.position = postElement.style.position || 'relative';
    postElement.appendChild(overlay);

    // Toggle panel on badge click
    const badge = overlay.querySelector('.hawkeye-badge');
    const panel = overlay.querySelector('.hawkeye-panel');
    const closeBtn = overlay.querySelector('.hawkeye-close');

    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.style.display = 'none';
    });

    // Save as Lead
    overlay.querySelector('.hawkeye-btn-lead').addEventListener('click', async (e) => {
      e.stopPropagation();
      const authorName = extractAuthorName(postElement) || 'Unknown';
      const { authToken } = await chrome.storage.local.get(['authToken']);
      if (!authToken) { showToast('Please sign in first'); return; }

      const btn = overlay.querySelector('.hawkeye-btn-lead');
      btn.textContent = 'Saving...';
      btn.disabled = true;

      try {
        // Wake service worker and send save request
        await chrome.runtime.sendMessage({ type: 'PING' });
      } catch { /* ignore wake failure */ }

      chrome.runtime.sendMessage({
        type: 'SAVE_LEAD',
        data: {
          authToken,
          platform,
          authorName,
          postContent: postText.slice(0, 500),
          postUrl: window.location.href.startsWith('http') ? window.location.href : 'https://facebook.com',
        },
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[HawkEye] sendMessage error:', chrome.runtime.lastError);
          btn.textContent = '💼 Save as Lead';
          btn.disabled = false;
          showToast('Extension error — try again');
          return;
        }
        if (!response || !response.success) {
          console.error('[HawkEye] Save failed:', response);
          btn.textContent = '💼 Save as Lead';
          btn.disabled = false;
          showToast('Failed to save lead');
        } else {
          showToast('Lead saved! 🦅');
          btn.textContent = '✓ Saved';
        }
      });
    });

    // Save Appreciation
    overlay.querySelector('.hawkeye-btn-appreciate').addEventListener('click', async (e) => {
      e.stopPropagation();
      const authorName = extractAuthorName(postElement) || 'Unknown';
      const { authToken } = await chrome.storage.local.get(['authToken']);
      if (!authToken) { showToast('Please sign in first'); return; }

      const btn = overlay.querySelector('.hawkeye-btn-appreciate');
      btn.textContent = 'Saving...';
      btn.disabled = true;

      try {
        await chrome.runtime.sendMessage({ type: 'PING' });
      } catch { /* ignore */ }

      chrome.runtime.sendMessage({
        type: 'SAVE_APPRECIATION',
        data: {
          authToken,
          taggerName: authorName,
          platform,
          postContent: postText.slice(0, 500),
          postUrl: window.location.href,
        },
      }, (response) => {
        if (chrome.runtime.lastError) {
          btn.textContent = '🙏 Save Appreciation';
          btn.disabled = false;
          showToast('Extension error — try again');
          return;
        }
        if (!response || !response.success) {
          btn.textContent = '🙏 Save Appreciation';
          btn.disabled = false;
          showToast('Failed to save');
        } else {
          showToast('Appreciation saved! 🙏');
          btn.textContent = '✓ Saved';
        }
      });
    });
  }

  // ─── Extract Author Name ──────────────────────────────────────────────────

  function extractAuthorName(postElement) {
    // Try common selectors for author names per platform
    const selectors = {
      facebook: 'a[role="link"] strong, h3 a span, h4 a span',
      instagram: 'a.x1i10hfl header a, article header a',
      linkedin: '.update-components-actor__name span, .feed-shared-actor__name span',
      tiktok: '[data-e2e="browse-username"], a[data-e2e="video-author-uniqueid"]',
    };

    const sel = selectors[platform];
    if (!sel) return null;

    // Search upward from the post element to find the author
    let container = postElement;
    for (let i = 0; i < 5; i++) {
      if (!container.parentElement) break;
      container = container.parentElement;
      const author = container.querySelector(sel);
      if (author) return author.textContent.trim();
    }
    return null;
  }

  // ─── Toast Notification ───────────────────────────────────────────────────

  function showToast(message) {
    const existing = document.querySelector('.hawkeye-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'hawkeye-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('hawkeye-toast-show'), 10);
    setTimeout(() => {
      toast.classList.remove('hawkeye-toast-show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ─── Scan Feed ────────────────────────────────────────────────────────────

  function scanFeed() {
    if (isScanning || keywords.length === 0) return;
    isScanning = true;

    const selector = POST_SELECTORS[platform];
    if (!selector) {
      isScanning = false;
      return;
    }

    // Primary selectors
    let elements = document.querySelectorAll(selector);

    // Facebook fallback: if primary selectors find nothing, try broader approach
    if (platform === 'facebook' && elements.length === 0) {
      elements = document.querySelectorAll('div[dir="auto"]');
    }

    elements.forEach((el) => {
      // Create a unique ID for this element to avoid re-processing
      const text = el.textContent?.trim() || '';
      if (!text || text.length < 10) return;

      const postId = text.slice(0, 100);
      if (processedPosts.has(postId)) return;
      processedPosts.add(postId);

      const matched = matchesKeywords(text);
      if (matched.length > 0) {
        // Find the best parent container to attach the overlay to
        let postContainer = el;
        for (let i = 0; i < 3; i++) {
          if (postContainer.parentElement) {
            postContainer = postContainer.parentElement;
          }
        }
        createHawkOverlay(postContainer, matched, text);
      }
    });

    isScanning = false;
  }

  // ─── Initialize ───────────────────────────────────────────────────────────

  async function init() {
    // Get auth token and keywords directly from storage (no service worker needed)
    const result = await chrome.storage.local.get(['authToken', 'tokenExpiry', 'keywords']);

    if (!result.authToken || !result.tokenExpiry || Date.now() >= result.tokenExpiry) {
      console.log('[HawkEye] Not authenticated — scanner inactive');
      return;
    }

    // Try to get keywords from storage first
    let storedKeywords = result.keywords || [];

    // If no keywords in storage, fetch directly from API
    if (storedKeywords.length === 0) {
      try {
        const response = await fetch('https://29p0xwb5v8.execute-api.us-east-1.amazonaws.com/keywords', {
          headers: { 'Authorization': `Bearer ${result.authToken}`, 'Content-Type': 'application/json' },
        });
        if (response.ok) {
          const data = await response.json();
          storedKeywords = (Array.isArray(data) ? data : data.keywords || []).map((k) => k.keyword || k);
          chrome.storage.local.set({ keywords: storedKeywords, keywordsUpdatedAt: Date.now() });
        }
      } catch (e) {
        console.log('[HawkEye] Failed to fetch keywords:', e);
      }
    }

    keywords = storedKeywords;

    if (keywords.length === 0) {
      console.log('[HawkEye] No keywords configured');
      return;
    }

    console.log(`[HawkEye] Scanning for ${keywords.length} keywords on ${platform}`);
    console.log(`[HawkEye] Keywords:`, keywords);

    // Initial scan
    scanFeed();

    // Watch for new content (infinite scroll)
    const observer = new MutationObserver(() => {
      clearTimeout(observer._timeout);
      observer._timeout = setTimeout(scanFeed, 500);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Also scan periodically as a fallback
    setInterval(scanFeed, 5000);
  }

  // Wait for page to be ready
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
