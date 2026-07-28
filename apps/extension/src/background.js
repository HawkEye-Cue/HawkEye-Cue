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
    
    // Use fresh token from storage (may have been refreshed since page load)
    chrome.storage.local.get(['authToken'], function(authResult) {
      var token = authResult.authToken || d.authToken;
      
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
    });
    return true;
  }

  if (message.type === 'SAVE_APPRECIATION') {
    var d2 = message.data;
    
    // Use fresh token from storage
    chrome.storage.local.get(['authToken'], function(authResult) {
      var token2 = authResult.authToken || d2.authToken;
      
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
        fetch(API_BASE + '/opportunities/stats', { headers: { 'Authorization': 'Bearer ' + authResult.authToken } }).then(function(r) { return r.json(); }).catch(function() { return {}; }),
        fetch(API_BASE + '/appreciations', { headers: { 'Authorization': 'Bearer ' + authResult.authToken } }).then(function(r) { return r.json(); }).catch(function() { return { items: [] }; })
      ]).then(function(results) {
        var stats = results[0].stats || results[0];
        sendResponse({ leadsFound: stats.total || 0, appreciations: (results[1].items || []).length });
      });
    });
    return true;
  }

  return false;
});

// Refresh keywords every 15 minutes
chrome.alarms.create('refreshKeywords', { periodInMinutes: 15 });

// Poll team deal notifications every 5 minutes
chrome.alarms.create('checkTeamNotifications', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === 'refreshKeywords') {
    chrome.storage.local.get(['authToken'], function(result) {
      if (!result.authToken) return;
      // Refresh regular keywords
      fetch(API_BASE + '/keywords', { headers: { 'Authorization': 'Bearer ' + result.authToken } })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var keywords = (Array.isArray(data) ? data : data.keywords || []).map(function(k) { return k.keyword || k; });
        chrome.storage.local.set({ keywords: keywords });
      })
      .catch(function() {});
      // Refresh wingman keywords from profile preferences
      fetch(API_BASE + '/profile/preferences', { headers: { 'Authorization': 'Bearer ' + result.authToken } })
      .then(function(res) { return res.json(); })
      .then(function(prefs) {
        var updates = {};
        if (prefs.wingmanKeywords && Array.isArray(prefs.wingmanKeywords)) {
          updates.wingmanKeywords = prefs.wingmanKeywords;
        }
        if (prefs.wingmanName) {
          updates.wingmanName = prefs.wingmanName;
        }
        if (Object.keys(updates).length > 0) {
          chrome.storage.local.set(updates);
        }
      })
      .catch(function() {});
    });
  }

  // Team deal notification badge
  if (alarm.name === 'checkTeamNotifications') {
    chrome.storage.local.get(['authToken'], function(result) {
      if (!result.authToken) {
        chrome.action.setBadgeText({ text: '' });
        return;
      }
      fetch(API_BASE + '/team/notifications', {
        headers: { 'Authorization': 'Bearer ' + result.authToken }
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var count = (data.notifications || []).filter(function(n) { return !n.dismissed; }).length;
        chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
      })
      .catch(function() {
        chrome.action.setBadgeText({ text: '' });
      });
    });
  }

  // Auto-refresh token before it expires
  if (alarm.name === 'refreshToken') {
    chrome.storage.local.get(['refreshToken', 'tokenExpiry'], function(result) {
      if (!result.refreshToken) return;
      // Only refresh if token expires within 10 minutes
      if (result.tokenExpiry && Date.now() < result.tokenExpiry - (10 * 60 * 1000)) return;

      fetch('https://cognito-idp.us-east-1.amazonaws.com/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
        },
        body: JSON.stringify({
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          ClientId: '2cr45bt815hr68i0j021murak',
          AuthParameters: { REFRESH_TOKEN: result.refreshToken },
        }),
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.AuthenticationResult && data.AuthenticationResult.IdToken) {
          chrome.storage.local.set({
            authToken: data.AuthenticationResult.IdToken,
            tokenExpiry: Date.now() + ((data.AuthenticationResult.ExpiresIn || 3600) * 1000),
          });
          console.log('[HawkEye] Token refreshed automatically');
        }
      })
      .catch(function(e) { console.log('[HawkEye] Token refresh failed:', e); });
    });
  }
});

// Create token refresh alarm (runs every 45 minutes — token lasts 60 min)
chrome.alarms.create('refreshToken', { periodInMinutes: 45 });

// ─── External message listener (receives token from hawkeyecue.com website) ───
chrome.runtime.onMessageExternal.addListener(function(message, sender, sendResponse) {
  if (message.type === 'ACTIVATE_EXTENSION' && message.token) {
    chrome.storage.local.set({
      authToken: message.token,
      refreshToken: message.refreshToken || null,
      tokenExpiry: Date.now() + (3600 * 1000), // 1 hour
      userEmail: message.email || '',
    }, function() {
      // Fetch keywords immediately
      fetch(API_BASE + '/keywords', { headers: { 'Authorization': 'Bearer ' + message.token } })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var keywords = (Array.isArray(data) ? data : data.keywords || []).map(function(k) { return k.keyword || k; });
        chrome.storage.local.set({ keywords: keywords });
      })
      .catch(function() {});
      // Fetch wingman keywords from profile preferences
      fetch(API_BASE + '/profile/preferences', { headers: { 'Authorization': 'Bearer ' + message.token } })
      .then(function(res) { return res.json(); })
      .then(function(prefs) {
        var updates = {};
        if (prefs.wingmanKeywords && Array.isArray(prefs.wingmanKeywords)) {
          updates.wingmanKeywords = prefs.wingmanKeywords;
        }
        if (prefs.wingmanName) {
          updates.wingmanName = prefs.wingmanName;
        }
        if (Object.keys(updates).length > 0) {
          chrome.storage.local.set(updates);
        }
      })
      .catch(function() {});
      sendResponse({ success: true });
    });
    return true;
  }
  if (message.type === 'CHECK_EXTENSION') {
    sendResponse({ installed: true, version: chrome.runtime.getManifest().version });
    return false;
  }
});
