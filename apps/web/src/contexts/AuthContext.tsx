import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  signIn,
  signUp,
  confirmSignUp,
  signOut,
  fetchAuthSession,
  getCurrentUser,
  resendSignUpCode,
  updatePassword,
  resetPassword,
  confirmResetPassword,
  updateUserAttributes,
  fetchUserAttributes,
  confirmSignIn,
} from 'aws-amplify/auth';

interface AuthUser {
  email: string;
  sub: string;
  phone?: string;
}

interface MfaChallenge {
  mfaMethod: 'email' | 'sms';
  deliveredTo: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  token: string | null;
  mfaPending: MfaChallenge | null;
  login: (email: string, password: string) => Promise<void>;
  confirmMfa: (code: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  forgotPasswordSubmit: (email: string, code: string, newPassword: string) => Promise<void>;
  updatePhone: (phone: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [mfaPending, setMfaPending] = useState<MfaChallenge | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string>('');

  // Restore session on mount
  useEffect(() => {
    async function restoreSession() {
      try {
        const cognitoUser = await getCurrentUser();
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString() ?? null;
        const email = cognitoUser.signInDetails?.loginId ?? '';
        const sub = cognitoUser.userId;

        // Fetch user attributes for phone
        let phone = '';
        try {
          const attrs = await fetchUserAttributes();
          phone = attrs.phone_number ?? '';
        } catch {
          // ignore
        }

        setUser({ email, sub, phone });
        setToken(idToken);
        setIsAuthenticated(true);
      } catch {
        // No active session — user is not logged in
        setIsAuthenticated(false);
        setUser(null);
        setToken(null);
      } finally {
        setIsLoading(false);
      }
    }

    restoreSession();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // Clear any stale/partial Amplify session before attempting sign-in.
    try {
      await signOut();
    } catch {
      // ignore
    }

    const result = await signIn({ username: email, password });

    if (result.isSignedIn) {
      const cognitoUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString() ?? null;
      const sub = cognitoUser.userId;

      let phone = '';
      try {
        const attrs = await fetchUserAttributes();
        phone = attrs.phone_number ?? '';
      } catch { /* ignore */ }

      setUser({ email, sub, phone });
      setToken(idToken);
      setIsAuthenticated(true);
      setMfaPending(null);
    } else if (result.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE') {
      // MFA challenge issued — user needs to enter code
      const params = result.nextStep.additionalInfo ?? {};
      setPendingEmail(email);
      setMfaPending({
        mfaMethod: (params.mfaMethod as 'email' | 'sms') || 'email',
        deliveredTo: params.deliveredTo || email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
      });
    } else {
      throw new Error(result.nextStep.signInStep);
    }
  }, []);

  const confirmMfa = useCallback(async (code: string) => {
    const result = await confirmSignIn({ challengeResponse: code });

    if (result.isSignedIn) {
      const cognitoUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString() ?? null;
      const sub = cognitoUser.userId;

      let phone = '';
      try {
        const attrs = await fetchUserAttributes();
        phone = attrs.phone_number ?? '';
      } catch { /* ignore */ }

      setUser({ email: pendingEmail, sub, phone });
      setToken(idToken);
      setIsAuthenticated(true);
      setMfaPending(null);
      setPendingEmail('');
    } else {
      throw new Error('MFA verification failed');
    }
  }, [pendingEmail]);

  const register = useCallback(async (email: string, password: string) => {
    await signUp({
      username: email,
      password,
      options: {
        userAttributes: { email },
        autoSignIn: false,
      },
    });
    // After signUp, user must confirm via email code before they can sign in
  }, []);

  const handleConfirmSignUp = useCallback(async (email: string, code: string) => {
    await confirmSignUp({ username: email, confirmationCode: code });
  }, []);

  const resendCode = useCallback(async (email: string) => {
    await resendSignUpCode({ username: email });
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  // Always fetches a fresh / auto-refreshed token from Cognito
  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString() ?? null;
      setToken(idToken);
      return idToken;
    } catch {
      return null;
    }
  }, []);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    await updatePassword({ oldPassword, newPassword });
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    await resetPassword({ username: email });
  }, []);

  const forgotPasswordSubmit = useCallback(async (email: string, code: string, newPassword: string) => {
    await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
  }, []);

  const updatePhone = useCallback(async (phone: string) => {
    await updateUserAttributes({
      userAttributes: { phone_number: phone },
    });
    setUser((prev) => prev ? { ...prev, phone } : prev);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const attrs = await fetchUserAttributes();
      const email = attrs.email ?? user?.email ?? '';
      const phone = attrs.phone_number ?? '';
      setUser((prev) => prev ? { ...prev, email, phone } : prev);
    } catch {
      // ignore
    }
  }, [user?.email]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        token,
        mfaPending,
        login,
        confirmMfa,
        register,
        confirmSignUp: handleConfirmSignUp,
        resendCode,
        logout,
        getToken,
        changePassword,
        forgotPassword,
        forgotPasswordSubmit,
        updatePhone,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
