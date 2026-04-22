// HawkEye-Cue Background Service Worker

// Handle notifications
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NEW_OPPORTUNITY') {
    // Create notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: '🦅 New Lead Found!',
      message: \`From: \${message.opportunity.author}\n\${message.opportunity.content.substring(0, 100)}...\`,
      priority: 2
    });

    // Update badge
    updateBadge();
  }
});

// Update extension badge with opportunity count
async function updateBadge() {
  try {
    const result = await chrome.storage.local.get(['opportunities']);
    const opportunities = result.opportunities || [];
    const unread = opportunities.filter(o => !o.read).length;

    if (unread > 0) {
      chrome.action.setBadgeText({ text: unread.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (error) {
    console.error('Error updating badge:', error);
  }
}

// Initialize
updateBadge();
setInterval(updateBadge, 30000); // Update every 30 seconds
