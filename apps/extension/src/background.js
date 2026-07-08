/**
 * HawkEye-Cue Background Service Worker
 * Manages auth tokens, keyword cache, and communication between popup/content scripts.
 */

const API_BASE = 'https://29p0xwb5v8.execute-api.us-east-1.amazonaws.com';

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getToken() {
  const result = await chrome.storage.local.get(['authToken', 'tokenExpiry']);
  if (result.authToken && result.tokenExpiry && Date.now() < result.tokenExpiry) {
    return result.authToken;
  }
  return null;
}

async function apiRequest(method, path, body = null) {
  const token = await getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }
  return response.json();
}

// ─── Keywords Cache ───────────────────────────────────────────────────────────

async function refreshKeywords() {
  try {
    const data = await apiRequest('GET', '/keywords');
    const keywords = (Array.isArray(data) ? data : data.keywords || data.items || []).map((k) => k.keyword || k);
    await chrome.storage.local.set({ keywords, keywordsUpdatedAt: Date.now() });
    return keywords;
  } catch (e) {
    console.error('[HawkEye] Failed to refresh keywords:', e);
    return [];
  }
}

// Refresh keywords every 15 minutes
chrome.alarms.create('refreshKeywords', { periodInMinutes: 15 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refreshKeywords') {
    refreshKeywords();
  }
});

// ─── Message Handling ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_KEYWORDS') {
    chrome.storage.local.get(['keywords']).then((result) => {
      if (result.keywords && result.keywords.length > 0) {
        sendResponse({ keywords: result.keywords });
      } else {
        refreshKeywords().then((keywords) => {
          sendResponse({ keywords });
        });
      }
    });
    return true; // async response
  }

  if (message.type === 'SAVE_LEAD') {
    apiRequest('POST', '/opportunities', message.data)
      .then((result) => sendResponse({ success: true, result }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (message.type === 'SAVE_APPRECIATION') {
    apiRequest('POST', '/appreciations', message.data)
      .then((result) => sendResponse({ success: true, result }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (message.type === 'CHECK_AUTH') {
    getToken().then((token) => {
      sendResponse({ authenticated: !!token });
    });
    return true;
  }

  if (message.type === 'GET_STATS') {
    Promise.all([
      apiRequest('GET', '/opportunities/stats').catch(() => ({ total: 0, new: 0 })),
      apiRequest('GET', '/appreciations').catch(() => ({ items: [] })),
    ]).then(([oppStats, appreciations]) => {
      sendResponse({
        leadsFound: oppStats.total || 0,
        appreciations: (appreciations.items || []).length,
      });
    });
    return true;
  }
});

// On install, open the login page
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'src/popup/popup.html' });
  }
});
