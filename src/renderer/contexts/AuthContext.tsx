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
  /**
   * Legacy single-token entry point: writes the token via auth:setToken and
   * verifies it. Kept for the at_live_* fallback in LoginScreen and for any
   * other caller that doesn't use the Phase R.7 email/password flow.
   */
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

  // Phase R.7 — listen to the auth:authenticated push event. main emits this
  // whenever a successful login/signup/2FA-verify stores a fresh token pair.
  // We flip to authenticated WITHOUT re-verifying (the backend already gave
  // us the user); the optimistic transition makes the screen swap instant.
  useEffect(() => {
    const onAuthd = window.api?.auth?.onAuthenticated;
    if (typeof onAuthd !== 'function') return;
    const unsub = onAuthd((event) => {
      const u = event?.user;
      if (!u) return;
      const authUser: AuthUser = {
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
        avatar: u.avatar,
      };
      setUser(authUser);
      setStatus('authenticated');
      setError(null);
      // Phase K: refresh entitlements so the first paint of the authenticated
      // UI has the right tier. Push will also arrive via EntitlementsChanged.
      if (typeof window.api?.entitlements?.refresh === 'function') {
        void window.api.entitlements.refresh().catch(() => undefined);
      }
    });
    return unsub;
  }, []);

  const saveTokenAndVerify = useCallback(async (token: string) => {
    setError(null);
    await window.api.auth.setToken(token);
    try {
      const verifiedUser = await authApi.verify(token);
      setUser(verifiedUser);
      setStatus('authenticated');
      // Phase K: main уже триггерит refresh при AuthSetToken, но дополнительно
      // явно дёргаем — чтобы UI получил свежие entitlements синхронно с
      // первым рендером authenticated-state. Fire-and-forget: главное — push
      // через EntitlementsChanged всё равно прилетит.
      if (typeof window.api?.entitlements?.refresh === 'function') {
        void window.api.entitlements.refresh().catch(() => undefined);
      }
    } catch (err) {
      await window.api.auth.clearToken();
      const msg = err instanceof Error ? err.message : 'Failed to verify token';
      setError(msg);
      setStatus('unauthenticated');
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    // Phase R.7 — try server-side logout (revokes refresh token). On failure
    // we still clear local state so the user gets out of the authenticated
    // UI. The fallback to clearToken matches the pre-R.7 contract for legacy
    // installs that never had a refresh token to revoke.
    try {
      if (typeof window.api?.auth?.logout === 'function') {
        await window.api.auth.logout();
      } else {
        await window.api.auth.clearToken();
      }
    } catch {
      // ignore — best effort
      try {
        await window.api.auth.clearToken();
      } catch {
        // ignore
      }
    }
    setUser(null);
    setStatus('unauthenticated');
    // Phase K: на logout main очистит cache и эмитит EntitlementsChanged
    // с EMPTY snapshot — нам ничего дополнительно делать не нужно. Но
    // на всякий случай форсим refresh, чтобы renderer гарантированно получил
    // EMPTY на следующий тик.
    if (typeof window.api?.entitlements?.refresh === 'function') {
      void window.api.entitlements.refresh().catch(() => undefined);
    }
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
