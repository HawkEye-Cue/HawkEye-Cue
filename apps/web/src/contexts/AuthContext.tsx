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
} from 'aws-amplify/auth';

interface AuthUser {
  email: string;
  sub: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    async function restoreSession() {
      try {
        const cognitoUser = await getCurrentUser();
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString() ?? null;
        const email = cognitoUser.signInDetails?.loginId ?? '';
        const sub = cognitoUser.userId;

        setUser({ email, sub });
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
    const result = await signIn({ username: email, password });

    if (result.isSignedIn) {
      const cognitoUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString() ?? null;
      const sub = cognitoUser.userId;

      setUser({ email, sub });
      setToken(idToken);
      setIsAuthenticated(true);
    } else {
      // Handle intermediate steps (MFA, new password required, etc.)
      throw new Error(result.nextStep.signInStep);
    }
  }, []);

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

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        token,
        login,
        register,
        confirmSignUp: handleConfirmSignUp,
        resendCode,
        logout,
        getToken,
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
