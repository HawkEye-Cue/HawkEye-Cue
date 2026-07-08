/**
 * HawkEye-Cue Background Service Worker
 * Handles API calls from content scripts (avoids CORS).
 */

const API_BASE = 'https://29p0xwb5v8.execute-api.us-east-1.amazonaws.com';

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'PING') {
    sendResponse({ pong: true });
    return false;
  }

  if (message.type === 'GET_KEYWORDS') {
    chrome.storage.local.get(['keywords'], function(result) {
      if (result.keywords && result.keywords.length > 0) {
        sendResponse({ keywords: result.keywords });
      } else {
        // Try to fetch from API
        chrome.storage.local.get(['authToken'], function(authResult) {
          if (!authResult.authToken) {
            sendResponse({ keywords: [] });
            return;
          }
          fetch(API_BASE + '/keywords', {
            headers: { 'Authorization': 'Bearer ' + authResult.authToken }
          })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            var keywords = (Array.isArray(data) ? data : data.keywords || []).map(function(k) { return k.keyword || k; });
            chrome.storage.local.set({ keywords: keywords });
            sendResponse({ keywords: keywords });
          })
          .catch(function() { sendResponse({ keywords: [] }); });
        });
      }
    });
    return true;
  }

  if (message.type === 'SAVE_LEAD') {
    var d = message.data;
    var token = d.authToken;
    
    fetch(API_BASE + '/opportunities', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keywordId: 'extension-detected',
        sourceContent: d.postContent || 'No content',
        sourcePlatform: d.platform || 'facebook',
        sourceUrl: d.postUrl || 'https://facebook.com',
        sourceAuthor: d.authorName || 'Unknown'
      })
    })
    .then(function(res) {
      if (res.ok) {
        return res.json().then(function(result) {
          sendResponse({ success: true, result: result });
        });
      } else {
        return res.text().then(function(text) {
          console.error('[HawkEye BG] API error:', res.status, text);
          sendResponse({ success: false, error: 'API ' + res.status });
        });
      }
    })
    .catch(function(err) {
      console.error('[HawkEye BG] Fetch error:', err);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'SAVE_APPRECIATION') {
    var d2 = message.data;
    var token2 = d2.authToken;
    
    fetch(API_BASE + '/appreciations', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token2, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taggerName: d2.taggerName || 'Unknown',
        platform: d2.platform || 'facebook',
        postContent: d2.postContent || 'No content',
        postUrl: d2.postUrl || ''
      })
    })
    .then(function(res) {
      if (res.ok) {
        return res.json().then(function(result) {
          sendResponse({ success: true, result: result });
        });
      } else {
        sendResponse({ success: false, error: 'API ' + res.status });
      }
    })
    .catch(function(err) {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'CHECK_AUTH') {
    chrome.storage.local.get(['authToken', 'tokenExpiry'], function(result) {
      sendResponse({ authenticated: !!(result.authToken && result.tokenExpiry && Date.now() < result.tokenExpiry) });
    });
    return true;
  }

  if (message.type === 'GET_STATS') {
    chrome.storage.local.get(['authToken'], function(authResult) {
      if (!authResult.authToken) { sendResponse({ leadsFound: 0, appreciations: 0 }); return; }
      Promise.all([
        fetch(API_BASE + '/opportunities/stats', { headers: { 'Authorization': 'Bearer ' + authResult.authToken } }).then(function(r) { return r.json(); }).catch(function() { return { total: 0 }; }),
        fetch(API_BASE + '/appreciations', { headers: { 'Authorization': 'Bearer ' + authResult.authToken } }).then(function(r) { return r.json(); }).catch(function() { return { items: [] }; })
      ]).then(function(results) {
        sendResponse({ leadsFound: results[0].total || 0, appreciations: (results[1].items || []).length });
      });
    });
    return true;
  }

  return false;
});

// Refresh keywords every 15 minutes
chrome.alarms.create('refreshKeywords', { periodInMinutes: 15 });
chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === 'refreshKeywords') {
    chrome.storage.local.get(['authToken'], function(result) {
      if (!result.authToken) return;
      fetch(API_BASE + '/keywords', { headers: { 'Authorization': 'Bearer ' + result.authToken } })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var keywords = (Array.isArray(data) ? data : data.keywords || []).map(function(k) { return k.keyword || k; });
        chrome.storage.local.set({ keywords: keywords });
      })
      .catch(function() {});
    });
  }
});
