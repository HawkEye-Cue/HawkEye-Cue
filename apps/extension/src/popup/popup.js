/**
 * HawkEye-Cue Popup Script
 * Handles login and displays dashboard stats.
 */

const API_BASE = 'https://29p0xwb5v8.execute-api.us-east-1.amazonaws.com';
const COGNITO_REGION = 'us-east-1';
const COGNITO_CLIENT_ID = 'g8j6k7n4lv6liuegi58aj752a';

// ─── Auth (SRP is complex, using InitiateAuth with USER_PASSWORD_AUTH via extension client) ───

async function signIn(email, password) {
  // Use the extension client which supports USER_PASSWORD_AUTH
  const response = await fetch(
    `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: '2cr45bt815hr68i0j021murak', // Extension client (supports USER_PASSWORD_AUTH)
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      }),
    }
  );

  const data = await response.json();

  if (data.__type) {
    throw new Error(data.message || 'Authentication failed');
  }

  const idToken = data.AuthenticationResult.IdToken;
  const expiresIn = data.AuthenticationResult.ExpiresIn; // seconds

  await chrome.storage.local.set({
    authToken: idToken,
    tokenExpiry: Date.now() + (expiresIn * 1000),
    userEmail: email,
  });

  return idToken;
}

// ─── UI Logic ─────────────────────────────────────────────────────────────────

const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');

async function showDashboard() {
  loginView.style.display = 'none';
  dashboardView.style.display = 'block';

  // Load stats
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
    if (response) {
      document.getElementById('leads-count').textContent = response.leadsFound || 0;
      document.getElementById('appreciations-count').textContent = response.appreciations || 0;
    }
  });

  // Load keywords info
  chrome.runtime.sendMessage({ type: 'GET_KEYWORDS' }, (response) => {
    const count = response?.keywords?.length || 0;
    document.getElementById('keywords-info').textContent =
      count > 0
        ? `Tracking ${count} keyword${count !== 1 ? 's' : ''}`
        : 'No keywords set up yet — add them in Settings';
  });
}

function showLogin() {
  loginView.style.display = 'block';
  dashboardView.style.display = 'none';
}

// Check auth state on popup open
chrome.storage.local.get(['authToken', 'tokenExpiry'], (result) => {
  if (result.authToken && result.tokenExpiry && Date.now() < result.tokenExpiry) {
    showDashboard();
  } else {
    showLogin();
  }
});

// Login form handler
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in...';

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    await signIn(email, password);
    showDashboard();
  } catch (err) {
    loginError.textContent = err.message || 'Sign in failed. Check your credentials.';
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';
  }
});

// Logout
logoutBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove(['authToken', 'tokenExpiry', 'userEmail', 'keywords']);
  showLogin();
});
