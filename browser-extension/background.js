// Social Lead Gen - Background Service Worker
const API_BASE_URL = 'https://api.socialleadgen.com'; // Configure with actual API Gateway URL

let authToken = null;
let keywords = [];
let offlineQueue = [];

// --- Auth ---
async function getToken() {
  const result = await chrome.storage.local.get('auth_token');
  authToken = result.auth_token || null;
  return authToken;
}

async function setToken(token) {
  authToken = token;
  await chrome.storage.local.set({ auth_token: token });
}

// --- API Calls ---
async function apiRequest(method, path, body = null) {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };

  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${API_BASE_URL}${path}`, options);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

// --- Keyword Sync ---
async function syncKeywords() {
  try {
    const data = await apiRequest('GET', '/keywords');
    keywords = (data.keywords || []).map(k => k.keyword.toLowerCase());
    await chrome.storage.local.set({ keywords });
    chrome.action.setBadgeText({ text: String(keywords.length) });
    chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  } catch (error) {
    console.error('Keyword sync failed:', error);
    // Load from cache
    const cached = await chrome.storage.local.get('keywords');
    keywords = cached.keywords || [];
  }
}

// --- Opportunity Submission ---
async function submitOpportunity(opportunity) {
  try {
    await apiRequest('POST', '/opportunities', opportunity);
    return true;
  } catch (error) {
    // Queue for later if offline
    offlineQueue.push(opportunity);
    await chrome.storage.local.set({ offline_queue: offlineQueue.slice(-100) });
    return false;
  }
}

// --- Offline Queue Sync ---
async function syncOfflineQueue() {
  const stored = await chrome.storage.local.get('offline_queue');
  offlineQueue = stored.offline_queue || [];

  const remaining = [];
  for (const item of offlineQueue) {
    try {
      await apiRequest('POST', '/opportunities', item);
    } catch {
      remaining.push(item);
    }
  }

  offlineQueue = remaining;
  await chrome.storage.local.set({ offline_queue: remaining });
}

// --- Message Handlers ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_KEYWORDS') {
    sendResponse({ keywords });
  } else if (message.type === 'SUBMIT_OPPORTUNITY') {
    submitOpportunity(message.data).then(success => {
      sendResponse({ success });
    });
    return true; // async response
  } else if (message.type === 'LOGIN') {
    setToken(message.token).then(() => {
      syncKeywords();
      sendResponse({ success: true });
    });
    return true;
  } else if (message.type === 'LOGOUT') {
    chrome.storage.local.remove(['auth_token', 'keywords']);
    authToken = null;
    keywords = [];
    sendResponse({ success: true });
  }
});

// --- Periodic Sync ---
chrome.alarms.create('sync-keywords', { periodInMinutes: 5 });
chrome.alarms.create('sync-queue', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sync-keywords') syncKeywords();
  if (alarm.name === 'sync-queue') syncOfflineQueue();
});

// --- Init ---
syncKeywords();
syncOfflineQueue();
