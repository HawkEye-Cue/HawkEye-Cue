// HawkEye-Cue Facebook Monitor
// Monitors Facebook group posts for keywords

let keywords = [];
let monitoringActive = false;
let tradeId = '';
let processedPosts = new Set();

// Load keywords from Chrome storage
async function loadKeywords() {
  try {
    const result = await chrome.storage.sync.get(['keywords', 'monitoringActive', 'tradeId']);
    keywords = result.keywords || [];
    monitoringActive = result.monitoringActive !== false;
    tradeId = result.tradeId || 'default';

    if (monitoringActive && keywords.length > 0) {
      console.log(`🦅 HawkEye-Cue monitoring active for trade: ${tradeId}`, keywords);
      startMonitoring();
    }
  } catch (error) {
    console.error('Error loading keywords:', error);
  }
}

// Check if text contains any keywords
function containsKeywords(text) {
  if (!text) return { found: false, matches: [] };

  const lowerText = text.toLowerCase();
  const matches = keywords.filter(keyword =>
    lowerText.includes(keyword.toLowerCase())
  );

  return {
    found: matches.length > 0,
    matches: matches
  };
}

// Extract post information
function extractPostInfo(postElement) {
  try {
    const textElements = postElement.querySelectorAll('[dir="auto"]');
    let postText = '';
    textElements.forEach(el => {
      postText += ' ' + el.innerText;
    });

    let authorName = 'Unknown';
    const authorLinks = postElement.querySelectorAll('a[role="link"]');
    if (authorLinks.length > 0) {
      authorName = authorLinks[0].innerText || 'Unknown';
    }

    let timestamp = 'Recently';
    const timeElements = postElement.querySelectorAll('abbr, span[class*="timestamp"]');
    if (timeElements.length > 0) {
      timestamp = timeElements[0].getAttribute('title') || timeElements[0].innerText || 'Recently';
    }

    let postUrl = window.location.href;
    const permalinkElements = postElement.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"]');
    if (permalinkElements.length > 0) {
      postUrl = permalinkElements[0].href;
    }

    return {
      text: postText.trim(),
      author: authorName.trim(),
      timestamp: timestamp,
      url: postUrl,
      element: postElement
    };
  } catch (error) {
    console.error('Error extracting post info:', error);
    return null;
  }
}

// Highlight a post
function highlightPost(postElement, matches) {
  if (postElement.classList.contains('hawkeye-highlighted')) return;

  postElement.classList.add('hawkeye-highlighted');
  postElement.style.border = '3px solid #1D4ED8';
  postElement.style.borderRadius = '8px';

  const badge = document.createElement('div');
  badge.className = 'hawkeye-badge';
  badge.innerHTML = `
    <div style="background: linear-gradient(135deg, #1D4ED8 0%, #22C55E 100%); color: white; padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: bold; margin-bottom: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
      🦅 HawkEye-Cue Lead Found!
      <div style="font-size: 10px; font-weight: normal; margin-top: 2px;">
        Keywords: ${matches.join(', ')}
      </div>
    </div>
  `;

  postElement.insertBefore(badge, postElement.firstChild);
}

// Save opportunity (per trade)
async function saveOpportunity(postInfo, matches) {
  try {
    const opportunity = {
      id: Date.now().toString(),
      author: postInfo.author,
      content: postInfo.text.substring(0, 200),
      url: postInfo.url,
      timestamp: postInfo.timestamp,
      keywords: matches,
      source: 'Facebook',
      date: new Date().toISOString(),
      read: false,
      tradeId: tradeId
    };

    // Save opportunities per trade
    const storageKey = `opportunities_${tradeId}`;
    const result = await chrome.storage.local.get([storageKey]);
    const opportunities = result[storageKey] || [];
    opportunities.unshift(opportunity);
    const trimmed = opportunities.slice(0, 100);

    await chrome.storage.local.set({ [storageKey]: trimmed });

    chrome.runtime.sendMessage({
      type: 'NEW_OPPORTUNITY',
      opportunity: opportunity,
      tradeId: tradeId
    });

    console.log(`✅ Opportunity saved for ${tradeId}:`, opportunity);
  } catch (error) {
    console.error('Error saving opportunity:', error);
  }
}

// Scan posts
async function scanPosts() {
  if (!monitoringActive || keywords.length === 0) return;

  const postSelectors = ['[role="article"]', '[data-pagelet^="FeedUnit"]'];
  let allPosts = [];

  postSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(post => {
      if (!allPosts.includes(post)) allPosts.push(post);
    });
  });

  allPosts.forEach((post, index) => {
    if (!post.getAttribute('data-hawkeye-id')) {
      post.setAttribute('data-hawkeye-id', `post-${Date.now()}-${index}`);
    }
  });

  for (const post of allPosts) {
    const postId = post.getAttribute('data-hawkeye-id');
    if (processedPosts.has(postId)) continue;

    const postInfo = extractPostInfo(post);
    if (!postInfo || !postInfo.text) continue;

    const { found, matches } = containsKeywords(postInfo.text);

    if (found) {
      console.log('🎯 Keyword match found!', matches);
      highlightPost(post, matches);
      await saveOpportunity(postInfo, matches);
      processedPosts.add(postId);
    }
  }
}

// Start monitoring
function startMonitoring() {
  console.log(`🦅 Starting HawkEye-Cue monitoring for ${tradeId}...`);
  scanPosts();

  const observer = new MutationObserver(() => scanPosts());
  observer.observe(document.body, { childList: true, subtree: true });

  setInterval(scanPosts, 5000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_KEYWORDS') {
    keywords = message.keywords;
    monitoringActive = message.active;
    tradeId = message.tradeId || tradeId;
    processedPosts.clear();
    console.log(`🔄 Keywords updated for ${tradeId}:`, keywords);
    if (monitoringActive) scanPosts();
    sendResponse({ success: true });
  } else if (message.type === 'SCAN_NOW') {
    scanPosts();
    sendResponse({ success: true });
  }
  return true;
});

loadKeywords();
