// Social Lead Gen - Extension Popup
// Uses Cognito USER_PASSWORD_AUTH flow via InitiateAuth API

const COGNITO_REGION = 'us-east-1';
const COGNITO_CLIENT_ID = '2cr45bt815hr68i0j021murak'; // ExtensionClient ID from CDK output

document.addEventListener('DOMContentLoaded', () => {
  const loginSection = document.getElementById('login-section');
  const mainSection = document.getElementById('main-section');
  const loginForm = document.getElementById('login-form');
  const logoutBtn = document.getElementById('logout-btn');
  const scanBtn = document.getElementById('scan-btn');
  const keywordCount = document.getElementById('keyword-count');
  const statusText = document.getElementById('status-text');
  const loginError = document.getElementById('login-error');

  // Check auth state
  chrome.storage.local.get(['auth_token', 'refresh_token', 'token_expiry'], (result) => {
    if (result.auth_token && result.token_expiry && Date.now() < result.token_expiry) {
      showMain();
    } else if (result.refresh_token) {
      // Try to refresh the token
      refreshSession(result.refresh_token).then((success) => {
        if (success) showMain();
        else showLogin();
      });
    } else {
      showLogin();
    }
  });

  function showLogin() {
    loginSection.style.display = 'block';
    mainSection.style.display = 'none';
    if (loginError) loginError.style.display = 'none';
  }

  function showMain() {
    loginSection.style.display = 'none';
    mainSection.style.display = 'block';
    updateStats();
  }

  function showError(message) {
    if (loginError) {
      loginError.textContent = message;
      loginError.style.display = 'block';
    }
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

  // Cognito InitiateAuth — SRP is complex in plain JS, so we use USER_PASSWORD_AUTH
  // The extension client must have USER_PASSWORD_AUTH enabled in Cognito
  async function cognitoAuth(email, password) {
    const endpoint = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: COGNITO_CLIENT_ID,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorType = data.__type || 'AuthError';
      const errorMessage = data.message || data.Message || 'Authentication failed';

      if (errorType.includes('NotAuthorizedException')) {
        throw new Error('Incorrect email or password.');
      } else if (errorType.includes('UserNotFoundException')) {
        throw new Error('No account found with that email.');
      } else if (errorType.includes('UserNotConfirmedException')) {
        throw new Error('Please verify your email before signing in.');
      } else {
        throw new Error(errorMessage);
      }
    }

    return data.AuthenticationResult;
  }

  async function refreshSession(refreshToken) {
    try {
      const endpoint = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
        },
        body: JSON.stringify({
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          ClientId: COGNITO_CLIENT_ID,
          AuthParameters: {
            REFRESH_TOKEN: refreshToken,
          },
        }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      const result = data.AuthenticationResult;

      if (result && result.IdToken) {
        const expiry = Date.now() + (result.ExpiresIn || 3600) * 1000;
        await chrome.storage.local.set({
          auth_token: result.IdToken,
          token_expiry: expiry,
        });

        chrome.runtime.sendMessage({ type: 'LOGIN', token: result.IdToken });
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  // Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      showError('Please enter email and password.');
      return;
    }

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    try {
      const authResult = await cognitoAuth(email, password);

      if (authResult && authResult.IdToken) {
        const expiry = Date.now() + (authResult.ExpiresIn || 3600) * 1000;

        await chrome.storage.local.set({
          auth_token: authResult.IdToken,
          refresh_token: authResult.RefreshToken || null,
          token_expiry: expiry,
        });

        chrome.runtime.sendMessage({ type: 'LOGIN', token: authResult.IdToken }, (response) => {
          if (response && response.success) showMain();
        });
      } else {
        showError('Authentication failed. Please try again.');
      }
    } catch (err) {
      showError(err.message || 'Sign in failed.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  });

  // Logout
  logoutBtn.addEventListener('click', () => {
    chrome.storage.local.remove(['auth_token', 'refresh_token', 'token_expiry', 'keywords']);
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
