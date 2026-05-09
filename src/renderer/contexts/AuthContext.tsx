import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi, AuthUser } from '../api/auth';
import { ApiError } from '../api/client';

type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  saveTokenAndVerify(token: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verifyExisting = useCallback(async () => {
    const token = await window.api.auth.getToken();
    if (!token) {
      setStatus('unauthenticated');
      setUser(null);
      return;
    }
    try {
      const verifiedUser = await authApi.verify(token);
      setUser(verifiedUser);
      setStatus('authenticated');
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await window.api.auth.clearToken();
      }
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    verifyExisting();
  }, [verifyExisting]);

  const saveTokenAndVerify = useCallback(async (token: string) => {
    setError(null);
    await window.api.auth.setToken(token);
    try {
      const verifiedUser = await authApi.verify(token);
      setUser(verifiedUser);
      setStatus('authenticated');
    } catch (err) {
      await window.api.auth.clearToken();
      const msg = err instanceof Error ? err.message : 'Failed to verify token';
      setError(msg);
      setStatus('unauthenticated');
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    await window.api.auth.clearToken();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  return (
    <AuthContext.Provider
      value={{ status, user, error, saveTokenAndVerify, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
