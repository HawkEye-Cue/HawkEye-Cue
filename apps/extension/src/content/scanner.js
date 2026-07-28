/**
 * HawkEye-Cue Content Script v1.5.4
 * Scans social media feeds for keyword matches and shows hawk icon overlay.
 * Uses floating panel on document.body to bypass Facebook's event interception.
 */

(function () {
  'use strict';

  let keywords = [];
  let wingmanKeywords = [];
  let wingmanName = '';
  let processedPosts = new Set();
  let isScanning = false;

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('facebook.com')) return 'facebook';
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('linkedin.com')) return 'linkedin';
    if (host.includes('tiktok.com')) return 'tiktok';
    return 'unknown';
  }

  const platform = detectPlatform();

  const POST_SELECTORS = {
    facebook: 'div[data-ad-preview="message"], div[data-ad-comet-preview="message"], div[dir="auto"], span[dir="auto"], div.xdj266r, div.x11i5rnm, div.x1iorvi4, div.xz9dl7a, div.x1yc453h, span.x193iq5w, span.xdj266r',
    instagram: 'article div span, article h1, article div._a9zs',
    linkedin: '.feed-shared-update-v2__description, .update-components-text, .feed-shared-text',
    tiktok: '[data-e2e="browse-video-desc"], .tiktok-1ejylhp-DivContainer, [data-e2e="video-desc"]',
  };

  function matchesKeywords(text) {
    const lower = text.toLowerCase();
    return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
  }

  // ─── Floating Panel (on document.body — outside Facebook's React tree) ────

  function openFloatingPanel(postElement, matchedKeywords, postText, type) {
    // Remove any existing panel
    const existing = document.getElementById('hawkeye-floating-panel');
    if (existing) existing.remove();

    const rect = postElement.getBoundingClientRect();
    const panel = document.createElement('div');
    panel.id = 'hawkeye-floating-panel';
    panel.style.cssText = 'position:fixed;top:' + Math.min(rect.top + 40, window.innerHeight - 250) + 'px;right:20px;width:320px;background:#0f172a;border:2px solid ' + (type === 'wingman' ? '#f59e0b' : '#3b82f6') + ';border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.8);padding:16px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';

    if (type === 'wingman') {
      panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><span style="font-size:14px;font-weight:600;color:#f59e0b;">🤝 Wingman Cue</span><span id="hawkeye-panel-close" style="color:#94a3b8;font-size:20px;cursor:pointer;line-height:1;">&times;</span></div><p style="font-size:12px;color:#94a3b8;margin:0 0 8px 0;">Keywords matched: <strong style="color:#f59e0b;">' + matchedKeywords.join(', ') + '</strong></p><p style="font-size:12px;color:#cbd5e1;margin:0;">Recommend <strong style="color:#f59e0b;">' + (wingmanName || 'your partner') + '</strong> in the comments. They will reciprocate with referrals!</p>';
    } else {
      panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><span style="font-size:14px;font-weight:600;color:#3b82f6;">🦅 HawkEye Match</span><span id="hawkeye-panel-close" style="color:#94a3b8;font-size:20px;cursor:pointer;line-height:1;">&times;</span></div><p style="font-size:12px;color:#94a3b8;margin:0 0 8px 0;">Keywords: <strong style="color:#3b82f6;">' + matchedKeywords.join(', ') + '</strong></p><p style="font-size:11px;color:#cbd5e1;margin:0 0 14px 0;max-height:50px;overflow:hidden;">"' + postText.slice(0, 150).replace(/"/g, '&quot;') + (postText.length > 150 ? '...' : '') + '"</p><div style="display:flex;gap:8px;"><button id="hawkeye-save-lead" style="flex:1;padding:10px;background:#1e40af;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">💼 Save as Lead</button><button id="hawkeye-save-appreciate" style="flex:1;padding:10px;background:#7c3aed;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">🙏 Appreciation</button></div><p id="hawkeye-panel-status" style="font-size:11px;margin:8px 0 0 0;text-align:center;display:none;"></p>';
    }

    document.body.appendChild(panel);

    // Close button
    document.getElementById('hawkeye-panel-close').addEventListener('click', function() { panel.remove(); });

    // Close on outside click (after a brief delay so this click doesn't trigger it)
    setTimeout(function() {
      function closeOnOutside(ev) {
        if (!panel.contains(ev.target)) { panel.remove(); document.removeEventListener('mousedown', closeOnOutside); }
      }
      document.addEventListener('mousedown', closeOnOutside);
    }, 200);

    if (type === 'wingman') return;

    // Save as Lead button
    document.getElementById('hawkeye-save-lead').addEventListener('click', async function() {
      const btn = document.getElementById('hawkeye-save-lead');
      const status = document.getElementById('hawkeye-panel-status');
      btn.textContent = 'Saving...';
      btn.style.opacity = '0.6';

      const authorName = extractAuthorName(postElement) || 'Unknown';
      const { authToken } = await chrome.storage.local.get(['authToken']);
      if (!authToken) {
        status.textContent = 'Not signed in — open extension popup to log in';
        status.style.display = 'block';
        status.style.color = '#f87171';
        btn.textContent = '💼 Save as Lead';
        btn.style.opacity = '1';
        return;
      }

      try { await chrome.runtime.sendMessage({ type: 'PING' }); } catch {}

      chrome.runtime.sendMessage({
        type: 'SAVE_LEAD',
        data: { authToken: authToken, platform: platform, authorName: authorName, postContent: postText.slice(0, 500), postUrl: extractPostUrl(postElement) || window.location.href },
      }, function(response) {
        if (chrome.runtime.lastError || !response || !response.success) {
          btn.textContent = '💼 Save as Lead';
          btn.style.opacity = '1';
          status.textContent = 'Failed: ' + (response && response.error ? response.error : (chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Unknown error'));
          status.style.display = 'block';
          status.style.color = '#f87171';
        } else {
          btn.textContent = '✓ Lead Saved!';
          btn.style.background = '#16a34a';
          btn.style.opacity = '1';
          status.textContent = 'Saved to your Leads tab on HawkEye-Cue';
          status.style.display = 'block';
          status.style.color = '#4ade80';
        }
      });
    });

    // Save Appreciation button
    document.getElementById('hawkeye-save-appreciate').addEventListener('click', async function() {
      const btn = document.getElementById('hawkeye-save-appreciate');
      const status = document.getElementById('hawkeye-panel-status');
      btn.textContent = 'Saving...';
      btn.style.opacity = '0.6';

      const authorName = extractAuthorName(postElement) || 'Unknown';
      const { authToken } = await chrome.storage.local.get(['authToken']);
      if (!authToken) {
        status.textContent = 'Not signed in — open extension popup';
        status.style.display = 'block';
        status.style.color = '#f87171';
        btn.textContent = '🙏 Appreciation';
        btn.style.opacity = '1';
        return;
      }

      try { await chrome.runtime.sendMessage({ type: 'PING' }); } catch {}

      chrome.runtime.sendMessage({
        type: 'SAVE_APPRECIATION',
        data: { authToken: authToken, taggerName: authorName, platform: platform, postContent: postText.slice(0, 500), postUrl: extractPostUrl(postElement) || window.location.href },
      }, function(response) {
        if (chrome.runtime.lastError || !response || !response.success) {
          btn.textContent = '🙏 Appreciation';
          btn.style.opacity = '1';
          status.textContent = 'Failed: ' + (response && response.error ? response.error : 'Unknown error');
          status.style.display = 'block';
          status.style.color = '#f87171';
        } else {
          btn.textContent = '✓ Saved!';
          btn.style.background = '#16a34a';
          btn.style.opacity = '1';
          status.textContent = 'Saved to Appreciations';
          status.style.display = 'block';
          status.style.color = '#4ade80';
        }
      });
    });
  }

  // ─── Create Badge on Post ─────────────────────────────────────────────────

  function createHawkOverlay(postElement, matchedKeywords, postText) {
    if (postElement.querySelector('.hawkeye-overlay')) return;

    const badge = document.createElement('div');
    badge.className = 'hawkeye-overlay';
    badge.style.cssText = 'position:absolute;top:8px;right:8px;z-index:2147483647;display:flex;align-items:center;gap:4px;background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid #3b82f6;border-radius:20px;padding:6px 12px;cursor:pointer;box-shadow:0 2px 8px rgba(59,130,246,0.4);user-select:none;';
    badge.innerHTML = '<span style="font-size:18px;">🦅</span><span style="font-size:12px;font-weight:700;color:#3b82f6;">' + matchedKeywords.length + '</span>';

    postElement.style.position = postElement.style.position || 'relative';
    postElement.style.border = '2px solid #3b82f6';
    postElement.style.borderRadius = '12px';
    postElement.style.boxShadow = '0 0 12px rgba(59, 130, 246, 0.3)';
    postElement.appendChild(badge);

    // On badge click, open floating panel on document.body
    badge.addEventListener('mousedown', function(e) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      openFloatingPanel(postElement, matchedKeywords, postText, 'lead');
    });
  }

  function createWingmanOverlay(postElement, matchedKeywords, postText) {
    if (postElement.querySelector('.hawkeye-overlay')) return;
    if (postElement.querySelector('.wingman-overlay')) return;

    const badge = document.createElement('div');
    badge.className = 'wingman-overlay';
    badge.style.cssText = 'position:absolute;top:8px;right:8px;z-index:2147483647;display:flex;align-items:center;gap:4px;background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid #f59e0b;border-radius:20px;padding:6px 12px;cursor:pointer;box-shadow:0 2px 8px rgba(245,158,11,0.4);user-select:none;';
    badge.innerHTML = '<span style="font-size:16px;">🤝</span><span style="font-size:11px;font-weight:700;color:#f59e0b;">Wingman</span>';

    postElement.style.position = postElement.style.position || 'relative';
    postElement.style.border = '2px solid #f59e0b';
    postElement.style.borderRadius = '12px';
    postElement.style.boxShadow = '0 0 12px rgba(245, 158, 11, 0.3)';
    postElement.appendChild(badge);

    badge.addEventListener('mousedown', function(e) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      openFloatingPanel(postElement, matchedKeywords, postText, 'wingman');
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function extractAuthorName(postElement) {
    const selectors = {
      facebook: 'a[role="link"] strong, h3 a span, h4 a span',
      instagram: 'a.x1i10hfl header a, article header a',
      linkedin: '.update-components-actor__name span, .feed-shared-actor__name span',
      tiktok: '[data-e2e="browse-username"], a[data-e2e="video-author-uniqueid"]',
    };
    const sel = selectors[platform];
    if (!sel) return null;
    let container = postElement;
    for (let i = 0; i < 5; i++) {
      if (!container.parentElement) break;
      container = container.parentElement;
      const author = container.querySelector(sel);
      if (author) return author.textContent.trim();
    }
    return null;
  }

  function extractPostUrl(postElement) {
    let container = postElement;
    for (let i = 0; i < 5; i++) {
      if (!container.parentElement) break;
      container = container.parentElement;
      const links = container.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid"], a[href*="/p/"], a[href*="/reel/"]');
      if (links.length > 0 && links[0].href && links[0].href.startsWith('http')) return links[0].href;
      const liLinks = container.querySelectorAll('a[href*="/feed/update/"], a[href*="activity"]');
      if (liLinks.length > 0) return liLinks[0].href;
      const igLinks = container.querySelectorAll('a[href*="/p/"]');
      if (igLinks.length > 0) return igLinks[0].href;
    }
    return null;
  }

  function showToast(message) {
    const existing = document.querySelector('.hawkeye-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'hawkeye-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function() { toast.classList.add('hawkeye-toast-show'); }, 10);
    setTimeout(function() { toast.classList.remove('hawkeye-toast-show'); setTimeout(function() { toast.remove(); }, 300); }, 3000);
  }

  // ─── Scan Feed ────────────────────────────────────────────────────────────

  function scanFeed() {
    if (isScanning || (keywords.length === 0 && wingmanKeywords.length === 0)) return;
    isScanning = true;

    const selector = POST_SELECTORS[platform];
    if (!selector) { isScanning = false; return; }

    let elements = document.querySelectorAll(selector);

    // Facebook fallback
    if (platform === 'facebook' && elements.length < 5) {
      elements = document.querySelectorAll('div[dir="auto"], span[dir="auto"], div.xdj266r, span.x193iq5w, div.x11i5rnm');
    }

    // Individual post pages — use broadest scan
    if (platform === 'facebook') {
      const path = window.location.pathname;
      if (path.includes('/posts/') || path.includes('/permalink/') || path.includes('/photo/') || path.includes('/reel/')) {
        const extra = document.querySelectorAll('div[dir="auto"], span[dir="auto"], div.xdj266r, span.x193iq5w');
        if (extra.length > elements.length) elements = extra;
      }
    }

    elements.forEach(function(el) {
      const text = el.innerText ? el.innerText.trim() : (el.textContent ? el.textContent.trim() : '');
      if (!text || text.length < 20) return;
      // Skip navigation/UI elements
      if (text.startsWith('Create a post') || text.startsWith('What\'s on your mind') || text.includes('Write a comment')) return;

      const postId = text.slice(0, 100);
      if (processedPosts.has(postId)) return;
      processedPosts.add(postId);

      // Check lead keywords first
      if (keywords.length > 0) {
        const matched = matchesKeywords(text);
        if (matched.length > 0) {
          let postContainer = el;
          for (let i = 0; i < 3; i++) { if (postContainer.parentElement) postContainer = postContainer.parentElement; }
          createHawkOverlay(postContainer, matched, text);
          return;
        }
      }

      // Then check wingman keywords
      if (wingmanKeywords.length > 0) {
        const wmMatched = wingmanKeywords.filter(function(kw) { return text.toLowerCase().includes(kw.toLowerCase()); });
        if (wmMatched.length > 0) {
          let postContainer = el;
          for (let i = 0; i < 3; i++) { if (postContainer.parentElement) postContainer = postContainer.parentElement; }
          createWingmanOverlay(postContainer, wmMatched, text);
        }
      }
    });

    isScanning = false;
  }

  // ─── Initialize ───────────────────────────────────────────────────────────

  async function init() {
    const result = await chrome.storage.local.get(['authToken', 'tokenExpiry', 'keywords']);

    if (!result.authToken || !result.tokenExpiry || Date.now() >= result.tokenExpiry) {
      console.log('[HawkEye] Not authenticated — scanner inactive');
      return;
    }

    let storedKeywords = result.keywords || [];
    if (storedKeywords.length === 0) {
      try {
        const response = await fetch('https://29p0xwb5v8.execute-api.us-east-1.amazonaws.com/keywords', {
          headers: { 'Authorization': 'Bearer ' + result.authToken },
        });
        if (response.ok) {
          const data = await response.json();
          storedKeywords = (Array.isArray(data) ? data : data.keywords || []).map(function(k) { return k.keyword || k; });
          chrome.storage.local.set({ keywords: storedKeywords, keywordsUpdatedAt: Date.now() });
        }
      } catch (e) { console.log('[HawkEye] Failed to fetch keywords:', e); }
    }
    keywords = storedKeywords;

    const wmResult = await chrome.storage.local.get(['wingmanKeywords', 'wingmanName']);
    wingmanKeywords = wmResult.wingmanKeywords || [];
    wingmanName = wmResult.wingmanName || '';

    if (keywords.length === 0 && wingmanKeywords.length === 0) {
      console.log('[HawkEye] No keywords configured');
      return;
    }

    console.log('[HawkEye] Scanning for ' + keywords.length + ' keywords + ' + wingmanKeywords.length + ' wingman keywords on ' + platform);

    scanFeed();

    const observer = new MutationObserver(function() {
      clearTimeout(observer._debounce);
      observer._debounce = setTimeout(scanFeed, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(scanFeed, 5000);
  }

  if (document.readyState === 'complete') { init(); }
  else { window.addEventListener('load', init); }
})();
