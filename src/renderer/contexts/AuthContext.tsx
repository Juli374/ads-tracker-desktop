import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi, AuthUser } from '../api/auth';
import { ApiError } from '../api/client';
import { useToast } from './ToastContext';

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
  const toast = useToast();
  const { t } = useTranslation('auth');
  // Дебаунс для onExpired: если несколько параллельных запросов одновременно
  // вернут 401, мы получим 5 push-event'ов подряд → не хотим 5 тостов.
  const expiredHandlingRef = useRef<boolean>(false);

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

  // Слушаем push-event "сессия истекла" из main процесса. main эмитит его
  // при 401 от backend (api-client.ts). Нужно сделать signOut + редирект +
  // показать тост — иначе юзер останется на authenticated-странице
  // с 401-ошибками на всех запросах.
  useEffect(() => {
    if (typeof window.api?.auth?.onExpired !== 'function') return;
    const unsub = window.api.auth.onExpired(() => {
      // Дебаунс: одна сессия истечения = один редирект + один тост.
      if (expiredHandlingRef.current) return;
      expiredHandlingRef.current = true;
      // main уже сделал clearToken до эмита события — нам остаётся только
      // обновить локальный state и показать UX-feedback.
      setUser(null);
      setStatus('unauthenticated');
      setError(null);
      try {
        toast.error(t('errors.sessionExpired'));
      } catch {
        // ignore: toast недоступен в тестовом окружении
      }
      // Сбрасываем флаг через короткий тик — следующий 401 (например, после
      // нового логина и опять протухания) должен пройти заново.
      setTimeout(() => {
        expiredHandlingRef.current = false;
      }, 1000);
    });
    return unsub;
  }, [toast, t]);

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
