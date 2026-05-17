import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../api/client';
import { ForgotPasswordModal } from './auth/ForgotPasswordModal';

/**
 * LoginScreen — Phase R.7 entry point. Three modes:
 *
 *   - 'email'   : email + password (Phase R.7 primary)
 *   - 'token'   : at_live_* API key paste (legacy fallback; preserved per
 *                  parity-plan constraint)
 *   - '2fa'     : 6-digit TOTP input (entered after a partial-token login)
 *   - '2fa-setup': QR code + secret display + TOTP input (first-time 2FA users)
 *
 * The IPC layer drives mode transitions: an `auth:login` call may resolve with
 * `requires2fa` or `requiresSetup`, in which case we swap to the matching mode
 * without unmounting (so the partial token stays in component state).
 *
 * Switching to SignupScreen is a parent-side concern; we expose `onShowSignup`
 * so App.tsx can flip the route without us owning the routing state.
 */

type Mode = 'email' | 'token' | '2fa' | '2fa-setup';

/**
 * Решает, показывать ли dedicated retry-screen вместо обычной формы:
 * срабатывает при TIMEOUT (AbortSignal.timeout сработал в main) или при
 * NETWORK (net.fetch упал до получения ответа). Cтатус 0 в legacy-ветке
 * (если по какой-то причине code не пришёл) тоже считаем сетевой ошибкой.
 */
function isNetworkUnreachable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.code === 'TIMEOUT' || err.code === 'NETWORK') return true;
  // Fallback на legacy-ответы без code: status 0 = network failure.
  if (err.code === undefined && err.status === 0) return true;
  return false;
}

interface LoginScreenProps {
  /** Switch to SignupScreen. Owned by App.tsx route state. */
  onShowSignup(): void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onShowSignup }) => {
  const { t } = useTranslation('auth');
  const { saveTokenAndVerify, error: ctxError } = useAuth();
  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // Когда true — рисуем retry-экран вместо формы. Сбрасывается по кнопке Retry.
  const [networkUnreachable, setNetworkUnreachable] = useState(false);
  const [apiHost, setApiHost] = useState<string>('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // 2FA-only state. `partialToken` is what the backend issued at the first
  // step of login when 2FA is required; we keep it in state so the user can
  // type their TOTP code and submit it back.
  const [partialToken, setPartialToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [setupQr, setSetupQr] = useState<{ secret: string; otpauthUri: string } | null>(
    null,
  );
  const [setupLoading, setSetupLoading] = useState(false);

  // Тянем base URL для красивого отображения хоста на retry-экране.
  // Падать если не получили — не страшно, экран просто покажет дефолтный текст.
  useEffect(() => {
    let cancelled = false;
    void window.api?.app
      ?.getApiBaseUrl()
      .then((url) => {
        if (cancelled) return;
        try {
          const u = new URL(url);
          setApiHost(u.host);
        } catch {
          setApiHost(url);
        }
      })
      .catch(() => {
        // ignore: pretty host — nice-to-have, не критично.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch the 2FA setup details (secret + otpauth URI) when we enter setup mode.
  useEffect(() => {
    if (mode !== '2fa-setup' || setupQr) return;
    let cancelled = false;
    setSetupLoading(true);
    void window.api.auth
      .setup2fa()
      .then((data) => {
        if (cancelled) return;
        setSetupQr(data);
      })
      .catch(() => {
        if (cancelled) return;
        setLocalError(t('twoFactor.setupFailed'));
      })
      .finally(() => {
        if (!cancelled) setSetupLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, setupQr, t]);

  const resetTo = (next: Mode) => {
    setMode(next);
    setLocalError(null);
    setTotpCode('');
    if (next !== '2fa-setup') setSetupQr(null);
    if (next !== '2fa' && next !== '2fa-setup') setPartialToken(null);
  };

  const handleAuthError = (err: unknown, fallbackKey: 'errors.loginFailed' | 'errors.tokenVerifyFailed') => {
    if (isNetworkUnreachable(err)) {
      setNetworkUnreachable(true);
      return;
    }
    if (err instanceof ApiError && err.status === 401) {
      setLocalError(t('errors.invalidCredentials'));
      return;
    }
    setLocalError(err instanceof Error ? err.message : t(fallbackKey));
  };

  const onEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLocalError(null);
    setBusy(true);
    try {
      const result = await window.api.auth.login(email.trim(), password);
      if (!result.ok) {
        setLocalError(result.error || t('errors.loginFailed'));
        return;
      }
      if (result.requires2fa && result.partialToken) {
        setPartialToken(result.partialToken);
        resetTo('2fa');
        return;
      }
      if (result.requiresSetup && result.partialToken) {
        setPartialToken(result.partialToken);
        resetTo('2fa-setup');
        return;
      }
      // Regular login succeeded — main has stored the token pair and will
      // emit auth:authenticated. AuthContext picks it up and Gate unmounts
      // this component; we don't need to do anything else.
    } catch (err) {
      handleAuthError(err, 'errors.loginFailed');
    } finally {
      setBusy(false);
    }
  };

  const onTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLocalError(null);
    setBusy(true);
    try {
      // Legacy single-token path: AuthContext.saveTokenAndVerify writes the
      // token via window.api.auth.setToken (no refresh token will exist for
      // this install). api-client knows to skip refresh-on-401 when refresh
      // token is missing.
      await saveTokenAndVerify(token.trim());
    } catch (err) {
      handleAuthError(err, 'errors.tokenVerifyFailed');
    } finally {
      setBusy(false);
    }
  };

  const onTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partialToken || !totpCode.trim()) return;
    setLocalError(null);
    setBusy(true);
    try {
      const result = await window.api.auth.verify2fa(partialToken, totpCode.trim());
      if (!result.ok) {
        setLocalError(result.error || t('errors.invalidCode'));
        return;
      }
      // Same as email-login success — AuthContext flips us out of here.
    } catch (err) {
      handleAuthError(err, 'errors.loginFailed');
    } finally {
      setBusy(false);
    }
  };

  // Retry-screen для TIMEOUT / NETWORK. Не показываем raw error message —
  // юзер не должен видеть "AbortError" или "fetch failed", это бесполезный шум.
  if (networkUnreachable) {
    return (
      <div
        className="h-screen w-screen flex items-center justify-center bg-zinc-50"
        data-testid="login-screen-retry"
      >
        <div className="w-full max-w-md mx-auto px-8">
          <div className="bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden">
            <div className="px-7 pt-7 pb-6 text-center">
              <div className="w-10 h-10 rounded-lg bg-red-50 mx-auto flex items-center justify-center mb-4">
                <WifiOff size={18} strokeWidth={2.2} className="text-red-600" />
              </div>
              <h1 className="text-base font-semibold text-zinc-900 tracking-tight">
                {t('retry.title')}
              </h1>
              <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                {t('retry.description', { host: apiHost || t('appName') })}
              </p>
            </div>
            <div className="px-7 pb-7">
              <button
                type="button"
                data-testid="login-retry-button"
                onClick={() => {
                  setNetworkUnreachable(false);
                  setLocalError(null);
                }}
                className={submitClass}
              >
                <RefreshCw size={14} />
                {t('retry.button')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayError = localError ?? ctxError;

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-zinc-50" data-testid="login-screen">
      <div className="w-full max-w-md mx-auto px-8">
        <div className="bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden">
          <div className="px-7 pt-7 pb-5 border-b border-zinc-100">
            <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center mb-4">
              {mode === '2fa' || mode === '2fa-setup' ? (
                <ShieldCheck size={16} strokeWidth={2.2} className="text-white" />
              ) : mode === 'email' ? (
                <Mail size={16} strokeWidth={2.2} className="text-white" />
              ) : (
                <KeyRound size={16} strokeWidth={2.2} className="text-white" />
              )}
            </div>
            <h1 className="font-display text-lg font-bold text-zinc-900 tracking-tight">
              {t('appName')}
            </h1>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              {mode === 'email'
                ? t('intro.email')
                : mode === 'token'
                ? t('intro.token')
                : mode === '2fa'
                ? t('intro.twoFactor')
                : t('intro.twoFactorSetup')}
            </p>
          </div>

          {/* Tabs only visible on the primary login modes. */}
          {(mode === 'email' || mode === 'token') && (
            <div role="tablist" className="flex border-b border-zinc-100 bg-zinc-50/40">
              {(['email', 'token'] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  data-testid={`auth-tab-${m}`}
                  aria-selected={mode === m}
                  aria-label={m === 'email' ? t('tabs.ariaEmail') : t('tabs.ariaToken')}
                  type="button"
                  onClick={() => {
                    resetTo(m);
                  }}
                  className={`
                    flex-1 h-10 text-xs font-medium border-b-2 -mb-px transition-colors
                    ${mode === m
                      ? 'border-zinc-900 text-zinc-900 bg-white'
                      : 'border-transparent text-zinc-500 hover:text-zinc-900'}
                  `}
                >
                  {m === 'email' ? t('tabs.email') : t('tabs.token')}
                </button>
              ))}
            </div>
          )}

          {mode === 'email' && (
            <form onSubmit={onEmailSubmit} className="px-7 py-6 space-y-4">
              <Field label={t('fields.email')}>
                <div className="relative">
                  <Mail
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
                    strokeWidth={2}
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('fields.emailPlaceholder')}
                    autoComplete="email"
                    required
                    data-testid="login-email"
                    className={inputClass}
                  />
                </div>
              </Field>
              <Field label={t('fields.password')}>
                <div className="relative">
                  <Lock
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
                    strokeWidth={2}
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('fields.passwordPlaceholder')}
                    autoComplete="current-password"
                    required
                    data-testid="login-password"
                    className={inputClass}
                  />
                </div>
              </Field>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-zinc-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    data-testid="login-remember-me"
                    className="w-3.5 h-3.5 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500/30 focus:ring-2"
                  />
                  {t('fields.rememberMe')}
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  data-testid="login-forgot-password"
                  className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  {t('actions.forgotPassword')}
                </button>
              </div>

              {displayError && <ErrorBox message={displayError} />}

              <button
                type="submit"
                disabled={busy || !email.trim() || !password}
                data-testid="login-submit"
                className={submitClass}
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy ? t('actions.signingIn') : t('actions.signIn')}
              </button>

              <button
                type="button"
                onClick={onShowSignup}
                data-testid="login-switch-signup"
                className="w-full text-center text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                {t('actions.needAccount')}
              </button>
            </form>
          )}

          {mode === 'token' && (
            <form onSubmit={onTokenSubmit} className="px-7 py-6 space-y-4">
              <Field label={t('fields.token')}>
                <textarea
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={t('fields.tokenPlaceholder')}
                  rows={4}
                  spellCheck={false}
                  data-testid="login-token-input"
                  className={`${inputClassNoIcon} font-mono resize-none`}
                />
              </Field>

              {displayError && <ErrorBox message={displayError} />}

              <button
                type="submit"
                disabled={busy || !token.trim()}
                data-testid="login-token-submit"
                className={submitClass}
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy ? t('actions.verifying') : t('actions.signIn')}
              </button>
            </form>
          )}

          {(mode === '2fa' || mode === '2fa-setup') && (
            <form onSubmit={onTotpSubmit} className="px-7 py-6 space-y-4">
              {mode === '2fa-setup' && (
                <div data-testid="2fa-setup-block">
                  <div className="text-xs text-zinc-600 leading-relaxed mb-3">
                    {t('twoFactor.setupIntro')}
                  </div>
                  {setupLoading && !setupQr && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Loader2 size={13} className="animate-spin" />
                      {t('twoFactor.loadingSetup')}
                    </div>
                  )}
                  {setupQr && (
                    <div className="space-y-2.5">
                      <div
                        data-testid="2fa-setup-otpauth"
                        className="font-mono text-[10px] break-all bg-zinc-50 border border-zinc-200 rounded-md p-3 text-zinc-700"
                      >
                        {setupQr.otpauthUri}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {t('twoFactor.manualSecretLabel')}
                      </div>
                      <div
                        data-testid="2fa-setup-secret"
                        className="font-mono text-xs tracking-widest text-zinc-900 bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2 select-all"
                      >
                        {setupQr.secret}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Field label={t('fields.totpCode')} hint={t('twoFactor.codeHint')}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder={t('fields.totpCodePlaceholder')}
                  autoComplete="one-time-code"
                  required
                  autoFocus
                  data-testid="login-totp-input"
                  className={`${inputClassNoIcon} font-mono tracking-widest text-center`}
                />
              </Field>

              {displayError && <ErrorBox message={displayError} />}

              <button
                type="submit"
                disabled={busy || !totpCode.trim()}
                data-testid="login-totp-submit"
                className={submitClass}
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy ? t('actions.verifying') : t('actions.verifyCode')}
              </button>

              <button
                type="button"
                onClick={() => {
                  resetTo('email');
                }}
                data-testid="login-back-from-2fa"
                className="w-full text-center text-xs text-zinc-500 hover:text-zinc-900 transition-colors inline-flex items-center justify-center gap-1"
              >
                <ArrowLeft size={11} />
                {t('actions.backToLogin')}
              </button>
            </form>
          )}
        </div>

        <div className="mt-4 text-[11px] text-zinc-400 leading-relaxed text-center">
          {mode === 'email'
            ? t('footer.noAccount')
            : mode === 'token'
            ? t('footer.createKey')
            : t('appName')}
        </div>
      </div>

      <ForgotPasswordModal
        open={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
        initialEmail={email}
      />
    </div>
  );
};

const inputClass =
  'w-full h-9 pl-8 pr-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';

const inputClassNoIcon =
  'w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';

const submitClass =
  'w-full h-9 rounded-md bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2';

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <div>
    <label className="block text-xs font-medium text-zinc-700 mb-1.5">{label}</label>
    {children}
    {hint && <div className="text-[11px] text-zinc-500 mt-1.5">{hint}</div>}
  </div>
);

const ErrorBox: React.FC<{ message: string }> = ({ message }) => (
  <div
    role="alert"
    data-testid="login-error"
    className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2"
  >
    {message}
  </div>
);
