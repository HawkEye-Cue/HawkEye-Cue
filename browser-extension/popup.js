// Social Lead Gen - Extension Popup
document.addEventListener('DOMContentLoaded', () => {
  const loginSection = document.getElementById('login-section');
  const mainSection = document.getElementById('main-section');
  const loginForm = document.getElementById('login-form');
  const logoutBtn = document.getElementById('logout-btn');
  const scanBtn = document.getElementById('scan-btn');
  const keywordCount = document.getElementById('keyword-count');
  const statusText = document.getElementById('status-text');

  // Check auth state
  chrome.storage.local.get('auth_token', (result) => {
    if (result.auth_token) {
      showMain();
    } else {
      showLogin();
    }
  });

  function showLogin() {
    loginSection.style.display = 'block';
    mainSection.style.display = 'none';
  }

  function showMain() {
    loginSection.style.display = 'none';
    mainSection.style.display = 'block';
    updateStats();
  }

  function updateStats() {
    chrome.storage.local.get(['keywords', 'offline_queue'], (result) => {
      const keywords = result.keywords || [];
      const queue = result.offline_queue || [];
      keywordCount.textContent = keywords.length;
      statusText.textContent = queue.length > 0
        ? `${queue.length} items queued`
        : 'Active — scanning for keywords';
    });
  }

  // Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    // In production, authenticate with Cognito and get token
    const mockToken = btoa(JSON.stringify({ email, sub: 'user-ext' }));

    chrome.runtime.sendMessage({ type: 'LOGIN', token: mockToken }, (response) => {
      if (response.success) showMain();
    });
  });

  // Logout
  logoutBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => showLogin());
  });

  // Manual scan
  scanBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SCAN_PAGE' });
        statusText.textContent = 'Scanning...';
      }
    });
  });
});
