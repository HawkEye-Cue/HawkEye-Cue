/**
 * HawkEye-Cue Content Script
 * Scans social media feeds for keyword matches and shows hawk icon overlay.
 */

(function () {
  'use strict';

  let keywords = [];
  let wingmanKeywords = [];
  let wingmanName = '';
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
    facebook: '[data-ad-preview="message"], [data-ad-comet-preview="message"], div[dir="auto"][style*="text-align"], div[data-ad-rendering-role="story_message"], div.x1iorvi4[dir="auto"], div.xdj266r[dir="auto"], div[data-ad-comet-preview="message-text"], div.x11i5rnm[dir="auto"], div.xz9dl7a[dir="auto"], span[dir="auto"] > div[dir="auto"]',
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
          <p class="hawkeye-preview">"${postText.slice(0, 300)}${postText.length > 300 ? '...' : ''}"</p>
          <div class="hawkeye-actions">
            <button class="hawkeye-btn hawkeye-btn-lead">💼 Save as Lead</button>
            <button class="hawkeye-btn hawkeye-btn-appreciate">🙏 Save Appreciation</button>
          </div>
        </div>
      </div>
    `;

    // Position relative to the post
    postElement.style.position = postElement.style.position || 'relative';
    postElement.style.border = '2px solid #3b82f6';
    postElement.style.borderRadius = '12px';
    postElement.style.boxShadow = '0 0 12px rgba(59, 130, 246, 0.3)';
    postElement.appendChild(overlay);

    // Toggle panel on badge click
    const badge = overlay.querySelector('.hawkeye-badge');
    const panel = overlay.querySelector('.hawkeye-panel');
    const closeBtn = overlay.querySelector('.hawkeye-close');

    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const isShowing = panel.style.display !== 'none';
      panel.style.display = isShowing ? 'none' : 'block';
      // Add/remove backdrop
      let backdrop = document.getElementById('hawkeye-backdrop');
      if (!isShowing) {
        if (!backdrop) {
          backdrop = document.createElement('div');
          backdrop.id = 'hawkeye-backdrop';
          backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:999998;';
          backdrop.addEventListener('click', () => { panel.style.display = 'none'; backdrop.remove(); });
          document.body.appendChild(backdrop);
        }
      } else if (backdrop) {
        backdrop.remove();
      }
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.style.display = 'none';
      const backdrop = document.getElementById('hawkeye-backdrop');
      if (backdrop) backdrop.remove();
    });

    // Save as Lead
    overlay.querySelector('.hawkeye-btn-lead').addEventListener('click', async (e) => {
      e.stopPropagation();
      const authorName = extractAuthorName(postElement) || 'Unknown';
      const { authToken, tokenExpiry } = await chrome.storage.local.get(['authToken', 'tokenExpiry']);
      if (!authToken || (tokenExpiry && Date.now() >= tokenExpiry)) { showToast('Please sign in — open the HawkEye-Cue extension popup'); return; }

      const btn = overlay.querySelector('.hawkeye-btn-lead');
      btn.textContent = 'Saving...';
      btn.disabled = true;

      // Retry logic for MV3 service worker wake
      let attempts = 0;
      function trySave() {
        attempts++;
        chrome.runtime.sendMessage({
          type: 'SAVE_LEAD',
          data: {
            authToken,
            platform,
            authorName,
            postContent: postText.slice(0, 500),
            postUrl: extractPostUrl(postElement) || window.location.href,
          },
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[HawkEye] sendMessage error:', chrome.runtime.lastError);
            if (attempts < 3) {
              setTimeout(trySave, 500);
              return;
            }
            btn.textContent = '💼 Save as Lead';
            btn.disabled = false;
            showToast('Extension error — try again');
            return;
          }
          if (!response || !response.success) {
            console.error('[HawkEye] Save failed:', response);
            btn.textContent = '💼 Save as Lead';
            btn.disabled = false;
            showToast(response?.error || 'Failed to save lead');
          } else {
            showToast('Lead saved! 🦅');
            btn.textContent = '✓ Saved';
          }
        });
      }

      // Wake service worker first, then save
      try { await chrome.runtime.sendMessage({ type: 'PING' }); } catch { /* ignore */ }
      trySave();
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
          postUrl: extractPostUrl(postElement) || window.location.href,
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

  function createWingmanOverlay(postElement, matchedKeywords, postText) {
    if (postElement.querySelector('.hawkeye-overlay')) return;
    if (postElement.querySelector('.wingman-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'wingman-overlay';
    overlay.style.cssText = 'position:absolute;top:8px;right:8px;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;gap:4px;background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid #f59e0b;border-radius:20px;padding:4px 10px;cursor:pointer;box-shadow:0 2px 8px rgba(245,158,11,0.3);">
        <span style="font-size:16px;">🤝</span>
        <span style="font-size:11px;font-weight:700;color:#f59e0b;">Wingman</span>
      </div>
      <div class="wingman-panel" style="display:none;position:absolute;top:100%;right:0;margin-top:8px;width:280px;background:#1a1a2e;border:1px solid #f59e0b;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);padding:12px 14px;">
        <p style="font-size:13px;font-weight:600;color:#f59e0b;margin:0 0 6px 0;">🤝 Shout out ${wingmanName || 'your Wingman'}!</p>
        <p style="font-size:11px;color:#94a3b8;margin:0 0 8px 0;">This post mentions: <strong style="color:#f59e0b;">${matchedKeywords.join(', ')}</strong></p>
        <p style="font-size:11px;color:#cbd5e1;margin:0;">Recommend ${wingmanName || 'your partner'} in the comments to build the relationship. They will reciprocate!</p>
      </div>
    `;

    postElement.style.position = postElement.style.position || 'relative';
    postElement.style.border = '2px solid #f59e0b';
    postElement.style.borderRadius = '12px';
    postElement.style.boxShadow = '0 0 12px rgba(245, 158, 11, 0.3)';
    postElement.appendChild(overlay);

    const badge = overlay.querySelector('div');
    const panel = overlay.querySelector('.wingman-panel');
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
  }

  // ─── Extract Author Name (original) ──────────────────────────────────────

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

  // ─── Extract Post URL ───────────────────────────────────────────────────

  function extractPostUrl(postElement) {
    // Try to find a permalink link in or near the post
    let container = postElement;
    for (let i = 0; i < 5; i++) {
      if (!container.parentElement) break;
      container = container.parentElement;

      // Facebook: look for timestamp links that are usually permalinks
      const links = container.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid"], a[href*="/p/"], a[href*="/reel/"]');
      if (links.length > 0) {
        const href = links[0].href;
        if (href && href.startsWith('http')) return href;
      }

      // LinkedIn: look for activity links
      const liLinks = container.querySelectorAll('a[href*="/feed/update/"], a[href*="activity"]');
      if (liLinks.length > 0) return liLinks[0].href;

      // Instagram: look for /p/ links
      const igLinks = container.querySelectorAll('a[href*="/p/"]');
      if (igLinks.length > 0) return igLinks[0].href;
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

    // Facebook individual post page: also scan comments and the main story container
    if (platform === 'facebook' && window.location.pathname.includes('/posts/') || window.location.pathname.includes('/permalink/') || window.location.pathname.includes('/photo/') || window.location.pathname.includes('/reel/')) {
      const extraElements = document.querySelectorAll('div[dir="auto"], span[dir="auto"]');
      if (extraElements.length > elements.length) {
        elements = extraElements;
      }
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
      } else if (wingmanKeywords.length > 0) {
        // Check wingman keywords
        const wingmanMatched = wingmanKeywords.filter((kw) => text.toLowerCase().includes(kw.toLowerCase()));
        if (wingmanMatched.length > 0) {
          let postContainer = el;
          for (let i = 0; i < 3; i++) {
            if (postContainer.parentElement) postContainer = postContainer.parentElement;
          }
          createWingmanOverlay(postContainer, wingmanMatched, text);
        }
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

    // Load wingman keywords from storage
    const wmResult = await chrome.storage.local.get(['wingmanKeywords', 'wingmanName']);
    wingmanKeywords = wmResult.wingmanKeywords || [];
    wingmanName = wmResult.wingmanName || '';

    if (keywords.length === 0 && wingmanKeywords.length === 0) {
      console.log('[HawkEye] No keywords configured');
      return;
    }

    console.log(`[HawkEye] Scanning for ${keywords.length} keywords + ${wingmanKeywords.length} wingman keywords on ${platform}`);
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
