import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { email: string; sub: string } | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  logout: () => void;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<{ email: string; sub: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Check for existing session
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // In production, this calls Cognito via Amplify
    // For now, simulate auth flow
    const mockToken = btoa(JSON.stringify({ email, sub: 'user-' + Date.now() }));
    const mockUser = { email, sub: 'user-' + Date.now() };
    setToken(mockToken);
    setUser(mockUser);
    setIsAuthenticated(true);
    localStorage.setItem('auth_token', mockToken);
    localStorage.setItem('auth_user', JSON.stringify(mockUser));
  }, []);

  const register = useCallback(async (email: string, _password: string) => {
    // In production, calls Cognito signUp
    // Stores email for confirmation step
    localStorage.setItem('pending_email', email);
  }, []);

  const confirmSignUp = useCallback(async (email: string, _code: string) => {
    // In production, calls Cognito confirmSignUp
    console.log(`Confirmed signup for ${email}`);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  }, []);

  const getToken = useCallback(async () => token, [token]);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isLoading, user, token, login, register, confirmSignUp, logout, getToken }}
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
