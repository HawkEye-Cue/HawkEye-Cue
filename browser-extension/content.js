// Social Lead Gen - Content Script for Keyword Detection
let keywords = [];
let highlightedElements = [];

// Get keywords from background
function loadKeywords() {
  chrome.runtime.sendMessage({ type: 'GET_KEYWORDS' }, (response) => {
    if (response && response.keywords) {
      keywords = response.keywords;
      if (keywords.length > 0) scanPage();
    }
  });
}

// Scan page for keyword matches
function scanPage() {
  clearHighlights();

  if (keywords.length === 0) return;

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
  );

  const matches = [];
  let node;

  while ((node = walker.nextNode())) {
    const text = node.textContent.toLowerCase();
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        matches.push({ node, keyword });
        break;
      }
    }
  }

  // Highlight matches
  for (const match of matches) {
    const parent = match.node.parentElement;
    if (!parent || parent.classList.contains('slg-highlight')) continue;

    const wrapper = document.createElement('span');
    wrapper.className = 'slg-highlight';
    wrapper.style.cssText = 'background: rgba(37, 99, 235, 0.15); border: 1px solid rgba(37, 99, 235, 0.3); border-radius: 4px; padding: 1px 3px; cursor: pointer;';
    wrapper.title = `Keyword match: "${match.keyword}" — Click to save as lead`;
    wrapper.dataset.keyword = match.keyword;

    // Wrap the text node
    try {
      parent.insertBefore(wrapper, match.node);
      wrapper.appendChild(match.node);
      highlightedElements.push(wrapper);
    } catch (e) {
      // Skip if DOM manipulation fails
    }
  }

  // Add click handlers
  for (const el of highlightedElements) {
    el.addEventListener('click', handleHighlightClick);
  }

  // Show notification if matches found
  if (matches.length > 0) {
    chrome.runtime.sendMessage({
      type: 'MATCHES_FOUND',
      count: matches.length,
    });
  }
}

function handleHighlightClick(event) {
  const element = event.currentTarget;
  const keyword = element.dataset.keyword;
  const sourceContent = getPostContent(element);
  const sourceUrl = window.location.href;
  const sourcePlatform = detectPlatform();
  const sourceAuthor = getPostAuthor(element);

  chrome.runtime.sendMessage({
    type: 'SUBMIT_OPPORTUNITY',
    data: {
      keywordId: keyword, // Backend will resolve to actual keyword ID
      sourceContent: sourceContent.substring(0, 5000),
      sourcePlatform,
      sourceUrl,
      sourceAuthor: sourceAuthor || 'Unknown',
    },
  }, (response) => {
    if (response && response.success) {
      element.style.background = 'rgba(16, 185, 129, 0.2)';
      element.style.borderColor = 'rgba(16, 185, 129, 0.5)';
      element.title = '✓ Saved as lead!';
    } else {
      element.title = '⏳ Queued — will sync when online';
      element.style.background = 'rgba(245, 158, 11, 0.2)';
    }
  });
}

function getPostContent(element) {
  // Walk up to find the post container
  let container = element.closest('[data-testid="post"], article, [role="article"], .feed-shared-update-v2');
  if (!container) container = element.parentElement?.parentElement?.parentElement;
  return container ? container.textContent.substring(0, 2000) : element.textContent;
}

function getPostAuthor(element) {
  const container = element.closest('[data-testid="post"], article, [role="article"]');
  if (!container) return '';
  const authorEl = container.querySelector('a[role="link"] span, h3 a, .update-components-actor__name');
  return authorEl ? authorEl.textContent.trim() : '';
}

function detectPlatform() {
  const host = window.location.hostname;
  if (host.includes('facebook.com')) return 'facebook';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('linkedin.com')) return 'linkedin';
  if (host.includes('tiktok.com')) return 'tiktok';
  return 'facebook';
}

function clearHighlights() {
  for (const el of highlightedElements) {
    el.removeEventListener('click', handleHighlightClick);
    if (el.parentNode) {
      const text = el.textContent;
      const textNode = document.createTextNode(text);
      el.parentNode.replaceChild(textNode, el);
    }
  }
  highlightedElements = [];
}

// --- Init ---
loadKeywords();

// Re-scan on DOM changes (infinite scroll, new posts loading)
const observer = new MutationObserver(() => {
  if (keywords.length > 0) {
    clearHighlights();
    scanPage();
  }
});

observer.observe(document.body, { childList: true, subtree: true });
