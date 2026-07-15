import * as SecureStore from 'expo-secure-store';

const API_URL = 'https://29p0xwb5v8.execute-api.us-east-1.amazonaws.com';
const COGNITO_REGION = 'us-east-1';
const COGNITO_CLIENT_ID = '333anc07o123neh75j0d5ui4dk';

// ─── Token Management ─────────────────────────────────────────────────────────

export async function getToken(): Promise<string | null> {
  const token = await SecureStore.getItemAsync('authToken');
  const expiry = await SecureStore.getItemAsync('tokenExpiry');
  if (!token || !expiry || Date.now() >= parseInt(expiry)) {
    return null;
  }
  return token;
}

export async function saveToken(idToken: string, expiresIn: number): Promise<void> {
  await SecureStore.setItemAsync('authToken', idToken);
  await SecureStore.setItemAsync('tokenExpiry', String(Date.now() + expiresIn * 1000));
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync('authToken');
  await SecureStore.deleteItemAsync('tokenExpiry');
  await SecureStore.deleteItemAsync('userEmail');
}

export async function getUserEmail(): Promise<string | null> {
  return SecureStore.getItemAsync('userEmail');
}

export async function saveUserEmail(email: string): Promise<void> {
  await SecureStore.setItemAsync('userEmail', email);
}

// ─── Cognito Auth ─────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<string> {
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
        ClientId: COGNITO_CLIENT_ID,
        AuthParameters: { USERNAME: email, PASSWORD: password },
      }),
    }
  );

  const data = await response.json();
  if (data.__type) throw new Error(data.message || 'Authentication failed');

  const idToken = data.AuthenticationResult?.IdToken;
  const expiresIn = data.AuthenticationResult?.ExpiresIn || 3600;
  if (!idToken) throw new Error('No token received');

  await saveToken(idToken, expiresIn);
  await saveUserEmail(email);
  return idToken;
}

export async function signUp(email: string, password: string): Promise<void> {
  const response = await fetch(
    `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.SignUp',
      },
      body: JSON.stringify({
        ClientId: COGNITO_CLIENT_ID,
        Username: email,
        Password: password,
        UserAttributes: [{ Name: 'email', Value: email }],
      }),
    }
  );

  const data = await response.json();
  if (data.__type) throw new Error(data.message || 'Registration failed');
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  const response = await fetch(
    `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.ConfirmSignUp',
      },
      body: JSON.stringify({
        ClientId: COGNITO_CLIENT_ID,
        Username: email,
        ConfirmationCode: code,
      }),
    }
  );

  const data = await response.json();
  if (data.__type) throw new Error(data.message || 'Confirmation failed');
}

// ─── API Client ───────────────────────────────────────────────────────────────

export async function apiRequest<T>(method: string, path: string, body?: any): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const init: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) init.body = JSON.stringify(body);

  const response = await fetch(`${API_URL}${path}`, init);

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody?.error?.message || `Request failed (${response.status})`);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}
