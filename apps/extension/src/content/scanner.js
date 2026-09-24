/**
 * HawkEye-Cue Content Script v1.9.0
 * Scans social media feeds for keyword matches, shows hawk icon overlay,
 * and scores each match in real time with HawkEye Radar (opportunity score,
 * urgency, suggested reply).
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
      panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><span style="font-size:14px;font-weight:600;color:#3b82f6;">🦅 HawkEye Match</span><span id="hawkeye-panel-close" style="color:#94a3b8;font-size:20px;cursor:pointer;line-height:1;">&times;</span></div><p style="font-size:12px;color:#94a3b8;margin:0 0 8px 0;">Keywords: <strong style="color:#3b82f6;">' + matchedKeywords.join(', ') + '</strong></p><div id="hawkeye-memory-box" style="display:none;margin:0 0 10px 0;padding:8px 10px;background:#3b0764;border-radius:10px;border:1px solid rgba(192,132,252,0.3);"></div><div id="hawkeye-radar-box" style="margin:0 0 12px 0;padding:10px;background:#1e293b;border-radius:10px;border:1px solid rgba(255,255,255,0.08);"><p style="font-size:11px;color:#94a3b8;margin:0;text-align:center;">📡 Scoring opportunity…</p></div><p style="font-size:11px;color:#cbd5e1;margin:0 0 14px 0;max-height:50px;overflow:hidden;">"' + postText.slice(0, 150).replace(/"/g, '&quot;') + (postText.length > 150 ? '...' : '') + '"</p><div style="display:flex;gap:8px;"><button id="hawkeye-save-lead" style="flex:1;padding:10px;background:#1e40af;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">💼 Save as Lead</button><button id="hawkeye-save-appreciate" style="flex:1;padding:10px;background:#7c3aed;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">🙏 Appreciation</button></div><p id="hawkeye-panel-status" style="font-size:11px;margin:8px 0 0 0;text-align:center;display:none;"></p>';
    }

    document.body.appendChild(panel);

    // ─── Hawk Memory: recall prior interactions with this person ───
    if (type !== 'wingman') {
      var memAuthor = extractAuthorName(postElement) || '';
      if (memAuthor && memAuthor !== 'Unknown') {
        chrome.runtime.sendMessage({ type: 'GET_MEMORY', data: { name: memAuthor } }, function(memResp) {
          var memBox = document.getElementById('hawkeye-memory-box');
          if (!memBox) return;
          if (chrome.runtime.lastError || !memResp || !memResp.success || !memResp.memory || !memResp.memory.summary) {
            memBox.style.display = 'none';
            return;
          }
          var m = memResp.memory;
          memBox.style.display = 'block';
          memBox.innerHTML = '<p style="font-size:10px;color:#e9d5ff;margin:0;line-height:1.35;"><span style="font-weight:700;">🧠 Hawk Memory</span> · ' + m.summary.replace(/</g, '&lt;') + (m.count > 1 ? ' <span style="color:#c084fc;">(' + m.count + ' past touches)</span>' : '') + '</p>';
        });
      }
    }

    // ─── HawkEye Radar: score this post in real time ───
    if (type !== 'wingman') {
      var scoreAuthor = extractAuthorName(postElement) || '';
      chrome.runtime.sendMessage({ type: 'SCORE_POST', data: { postText: postText, group: '', authorName: scoreAuthor } }, function(resp) {
        const box = document.getElementById('hawkeye-radar-box');
        if (!box) return;
        if (chrome.runtime.lastError || !resp || !resp.success || !resp.result) {
          box.style.display = 'none';
          return;
        }
        const r = resp.result;
        // Remember competitors by author so all their future posts are flagged too.
        if ((r.isCompetitor === true || r.classification === 'competitor') && scoreAuthor && scoreAuthor !== 'Unknown') {
          chrome.runtime.sendMessage({ type: 'SAVE_MEMORY', data: { personName: scoreAuthor, kind: 'competitor', note: 'Flagged as competitor', platform: platform } });
        }
        const isCompetitor = r.isCompetitor === true || r.classification === 'competitor';
        const scoreColor = isCompetitor ? '#f472b6' : r.score >= 80 ? '#f87171' : r.score >= 50 ? '#fbbf24' : r.score >= 20 ? '#38bdf8' : '#64748b';
        const urg = isCompetitor ? '🏢 COMPETITOR' : ({ now: '🔥 NOW', soon: '⚡ SOON', nurture: '🌱 NURTURE', not_a_lead: '🚫 NOT A LEAD' }[r.urgency] || '🌱 NURTURE');
        let html = '<div style="display:flex;align-items:center;gap:10px;">';
        html += '<div style="width:44px;height:44px;border-radius:50%;border:4px solid ' + scoreColor + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="font-size:16px;font-weight:800;color:' + scoreColor + ';">' + r.score + '</span></div>';
        html += '<div style="flex:1;min-width:0;"><span style="font-size:10px;font-weight:700;color:' + scoreColor + ';">' + urg + '</span>';
        if (r.estimatedValue) html += '<span style="font-size:10px;color:#4ade80;margin-left:6px;">~$' + Number(r.estimatedValue).toLocaleString() + '</span>';
        html += '<p style="font-size:10px;color:#cbd5e1;margin:3px 0 0 0;line-height:1.3;">' + (r.reason || '') + '</p></div></div>';
        if (r.isLead && r.suggestedResponse) {
          html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);"><p style="font-size:10px;color:#93c5fd;margin:0 0 4px 0;font-weight:600;">💬 Suggested reply</p><p style="font-size:10px;color:#e2e8f0;font-style:italic;margin:0 0 6px 0;line-height:1.35;">"' + r.suggestedResponse.replace(/"/g, '&quot;') + '"</p><button id="hawkeye-copy-reply" style="width:100%;padding:6px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">📋 Copy Reply</button></div>';
        }
        box.innerHTML = html;
        const copyBtn = document.getElementById('hawkeye-copy-reply');
        if (copyBtn) copyBtn.addEventListener('click', function() { navigator.clipboard.writeText(r.suggestedResponse); copyBtn.textContent = '✓ Copied!'; });
      });
    }

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

    // Save as Lead button — routes through background service worker (avoids Facebook CSP blocking)
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
          status.textContent = 'Failed: ' + (response?.error || chrome.runtime.lastError?.message || 'Unknown error — try again');
          status.style.display = 'block';
          status.style.color = '#f87171';
        } else {
          btn.textContent = '✓ Lead Saved!';
          btn.style.background = '#16a34a';
          btn.style.opacity = '1';
          status.textContent = authorName + ' saved to Leads (' + platform + ')';
          status.style.display = 'block';
          status.style.color = '#4ade80';
          // Hawk Memory — remember we saved a lead from this person
          if (authorName && authorName !== 'Unknown') {
            chrome.runtime.sendMessage({ type: 'SAVE_MEMORY', data: { personName: authorName, kind: 'saved', note: postText.slice(0, 120), platform: platform } });
          }
        }
      });
    });

    // Save Appreciation button — routes through background service worker
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
          status.textContent = 'Failed: ' + (response?.error || chrome.runtime.lastError?.message || 'Unknown error — try again');
          status.style.display = 'block';
          status.style.color = '#f87171';
        } else {
          btn.textContent = '✓ Saved!';
          btn.style.background = '#16a34a';
          btn.style.opacity = '1';
          status.textContent = authorName + ' saved to Appreciations (' + platform + ')';
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
      facebook: 'a[role="link"] strong, h3 a span, h4 a span, a[role="link"] span strong, strong a, a.x1i10hfl span, span.xt0psk2, a[aria-label] span',
      instagram: 'a.x1i10hfl header a, article header a',
      linkedin: '.update-components-actor__name span, .feed-shared-actor__name span',
      tiktok: '[data-e2e="browse-username"], a[data-e2e="video-author-uniqueid"]',
    };
    const sel = selectors[platform];
    if (!sel) return null;
    let container = postElement;
    for (let i = 0; i < 8; i++) {
      if (!container.parentElement) break;
      container = container.parentElement;
      const author = container.querySelector(sel);
      if (author && author.textContent.trim().length > 1 && author.textContent.trim().length < 60) {
        return author.textContent.trim();
      }
    }
    // Facebook fallback: look for any strong tag inside a link near the post
    if (platform === 'facebook') {
      let c = postElement;
      for (let i = 0; i < 10; i++) {
        if (!c.parentElement) break;
        c = c.parentElement;
        const strong = c.querySelector('strong');
        if (strong && strong.closest('a') && strong.textContent.trim().length > 1 && strong.textContent.trim().length < 50) {
          return strong.textContent.trim();
        }
      }
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

  // Walk up from a text node to the stable post container (an <article>, or the
  // nearest reasonably-large ancestor). Matching the whole container's text — not a
  // single fragment — is what makes phrase keywords and Facebook's split text work.
  function findPostContainer(el) {
    // Prefer a semantic article/feed unit if present.
    var article = el.closest('div[role="article"], article, [data-pagelet^="FeedUnit"]');
    if (article) return article;
    // Otherwise climb until the element's text looks like a full post (or we hit a cap).
    var c = el;
    for (var i = 0; i < 12; i++) {
      if (!c.parentElement) break;
      c = c.parentElement;
      var t = c.innerText || '';
      if (t.length >= 60) return c;
    }
    return el;
  }

  // Expand any "See more" inside a container so we capture the FULL post text.
  // Facebook truncates long posts; the competitor signal ("I own … agency") is often
  // in the hidden part, so scoring the preview alone misclassifies competitors as leads.
  function expandSeeMore(container) {
    try {
      var candidates = container.querySelectorAll('div[role="button"], span[role="button"], span');
      for (var i = 0; i < candidates.length; i++) {
        var t = (candidates[i].innerText || candidates[i].textContent || '').trim().toLowerCase();
        if (t === 'see more' || t === '… see more' || t === '...see more' || t === '…see more') {
          candidates[i].click();
          return true;
        }
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function scanFeed() {
    if (isScanning) return;
    // Always re-read the latest keywords from storage so newly-added keywords reach
    // tabs that are already open (the 15-min alarm / popup updates storage, not memory).
    if (keywords.length === 0 && wingmanKeywords.length === 0) return;
    isScanning = true;

    try {
      // Collect candidate post containers. Start from text-bearing nodes, then dedupe
      // up to their containers so we match combined post text once per post.
      var textNodes = document.querySelectorAll(
        'div[data-ad-preview="message"], div[data-ad-comet-preview="message"], div[dir="auto"], span[dir="auto"], ' +
        '.feed-shared-update-v2__description, .update-components-text, .feed-shared-text, ' +
        'article div span, [data-e2e="browse-video-desc"], [data-e2e="video-desc"]'
      );

      var seenContainers = new Set();

      textNodes.forEach(function(node) {
        var container = findPostContainer(node);
        if (seenContainers.has(container)) return;
        seenContainers.add(container);

        // Skip if we already badged this container.
        if (container.querySelector && container.querySelector('.hawkeye-overlay, .wingman-overlay')) return;

        var text = container.innerText ? container.innerText.trim() : (container.textContent ? container.textContent.trim() : '');
        if (!text || text.length < 15) return;
        if (text.startsWith('Create a post') || text.startsWith("What's on your mind") || text.indexOf('Write a comment') === 0) return;

        // Dedupe by container identity via a marker attribute (avoids text-prefix collisions).
        if (container.getAttribute && container.getAttribute('data-hawkeye-seen') === '1') return;

        // Lead keywords first.
        if (keywords.length > 0) {
          var matched = matchesKeywords(text);
          if (matched.length > 0) {
            if (container.setAttribute) container.setAttribute('data-hawkeye-seen', '1');
            createHawkOverlay(container, matched, text);
            return;
          }
        }
        // Wingman keywords.
        if (wingmanKeywords.length > 0) {
          var lower = text.toLowerCase();
          var wmMatched = wingmanKeywords.filter(function(kw) { return lower.includes(kw.toLowerCase()); });
          if (wmMatched.length > 0) {
            if (container.setAttribute) container.setAttribute('data-hawkeye-seen', '1');
            createWingmanOverlay(container, wmMatched, text);
          }
        }
      });
    } catch (e) {
      console.log('[HawkEye] scan error', e);
    }

    isScanning = false;
  }

  // ─── Initialize ───────────────────────────────────────────────────────────

  // Always fetch the latest keywords from the API (falls back to whatever's cached).
  async function refreshKeywords(authToken) {
    try {
      const response = await fetch('https://29p0xwb5v8.execute-api.us-east-1.amazonaws.com/keywords', {
        headers: { 'Authorization': 'Bearer ' + authToken },
      });
      if (response.ok) {
        const data = await response.json();
        const fresh = (Array.isArray(data) ? data : data.keywords || []).map(function(k) { return k.keyword || k; });
        if (fresh.length > 0) {
          keywords = fresh;
          chrome.storage.local.set({ keywords: fresh, keywordsUpdatedAt: Date.now() });
        }
      }
    } catch (e) { console.log('[HawkEye] Failed to fetch keywords:', e); }
  }

  async function init() {
    const result = await chrome.storage.local.get(['authToken', 'tokenExpiry', 'keywords']);

    if (!result.authToken || !result.tokenExpiry || Date.now() >= result.tokenExpiry) {
      console.log('[HawkEye] Not authenticated — scanner inactive');
      return;
    }

    // Use cached keywords immediately, then refresh from the API in the background so
    // newly-added keywords always take effect (previously only fetched when empty).
    keywords = result.keywords || [];
    const wmResult = await chrome.storage.local.get(['wingmanKeywords', 'wingmanName']);
    wingmanKeywords = wmResult.wingmanKeywords || [];
    wingmanName = wmResult.wingmanName || '';

    await refreshKeywords(result.authToken);

    // If still nothing, retry a few times (keywords may have just been added).
    if (keywords.length === 0 && wingmanKeywords.length === 0) {
      console.log('[HawkEye] No keywords yet — will retry');
      let tries = 0;
      const retry = setInterval(async function() {
        tries++;
        const r = await chrome.storage.local.get(['authToken']);
        if (r.authToken) await refreshKeywords(r.authToken);
        if (keywords.length > 0 || tries >= 5) { clearInterval(retry); if (keywords.length > 0) scanFeed(); }
      }, 6000);
    }

    console.log('[HawkEye] Scanning for ' + keywords.length + ' keywords + ' + wingmanKeywords.length + ' wingman keywords on ' + platform);

    scanFeed();

    // Live-update keywords when storage changes (15-min alarm, popup, or web app).
    chrome.storage.onChanged.addListener(function(changes, area) {
      if (area !== 'local') return;
      if (changes.keywords && Array.isArray(changes.keywords.newValue)) {
        keywords = changes.keywords.newValue.map(function(k) { return k.keyword || k; });
        // Let newly-matched posts get badged on the next scan.
        document.querySelectorAll('[data-hawkeye-seen]').forEach(function(el) { el.removeAttribute('data-hawkeye-seen'); });
        scanFeed();
      }
      if (changes.wingmanKeywords && Array.isArray(changes.wingmanKeywords.newValue)) {
        wingmanKeywords = changes.wingmanKeywords.newValue;
      }
    });

    const observer = new MutationObserver(function() {
      clearTimeout(observer._debounce);
      observer._debounce = setTimeout(scanFeed, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(scanFeed, 4000);
  }

  if (document.readyState === 'complete') { init(); }
  else { window.addEventListener('load', init); }
})();
