import React, { useState } from 'react';
import { KeyRound, Loader2, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/auth';
import { ApiError } from '../api/client';

type Mode = 'email' | 'token';

export const LoginScreen: React.FC = () => {
  const { t } = useTranslation('auth');
  const { saveTokenAndVerify, error: ctxError } = useAuth();
  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const onEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLocalError(null);
    setBusy(true);
    try {
      const res = await authApi.login(email.trim(), password);
      await saveTokenAndVerify(res.access_token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setLocalError(t('errors.invalidCredentials'));
      } else {
        setLocalError(err instanceof Error ? err.message : t('errors.loginFailed'));
      }
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
      await saveTokenAndVerify(token.trim());
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : t('errors.tokenVerifyFailed'));
    } finally {
      setBusy(false);
    }
  };

  const displayError = localError ?? ctxError;

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-zinc-50" data-testid="login-screen">
      <div className="w-full max-w-md mx-auto px-8">
        <div className="bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden">
          <div className="px-7 pt-7 pb-5 border-b border-zinc-100">
            <div className="w-9 h-9 rounded-lg bg-zinc-900 flex items-center justify-center mb-4">
              {mode === 'email' ? (
                <Mail size={16} strokeWidth={2.2} className="text-white" />
              ) : (
                <KeyRound size={16} strokeWidth={2.2} className="text-white" />
              )}
            </div>
            <h1 className="text-base font-semibold text-zinc-900 tracking-tight">
              {t('appName')}
            </h1>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              {mode === 'email' ? t('intro.email') : t('intro.token')}
            </p>
          </div>

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
                  setMode(m);
                  setLocalError(null);
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

          {mode === 'email' ? (
            <form onSubmit={onEmailSubmit} className="px-7 py-6 space-y-4">
              <Field label={t('fields.email')}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('fields.emailPlaceholder')}
                  autoComplete="email"
                  required
                  className={inputClass}
                />
              </Field>
              <Field label={t('fields.password')}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('fields.passwordPlaceholder')}
                  autoComplete="current-password"
                  required
                  className={inputClass}
                />
              </Field>

              {displayError && <ErrorBox message={displayError} />}

              <button
                type="submit"
                disabled={busy || !email.trim() || !password}
                className={submitClass}
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy ? t('actions.signingIn') : t('actions.signIn')}
              </button>
            </form>
          ) : (
            <form onSubmit={onTokenSubmit} className="px-7 py-6 space-y-4">
              <Field label={t('fields.token')}>
                <textarea
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={t('fields.tokenPlaceholder')}
                  rows={4}
                  spellCheck={false}
                  className={`${inputClass} font-mono resize-none`}
                />
              </Field>

              {displayError && <ErrorBox message={displayError} />}

              <button type="submit" disabled={busy || !token.trim()} className={submitClass}>
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy ? t('actions.verifying') : t('actions.signIn')}
              </button>
            </form>
          )}
        </div>

        <div className="mt-4 text-[11px] text-zinc-400 leading-relaxed text-center">
          {mode === 'email' ? t('footer.noAccount') : t('footer.createKey')}
        </div>
      </div>
    </div>
  );
};

const inputClass =
  'w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400';

const submitClass =
  'w-full h-9 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div>
    <label className="block text-xs font-medium text-zinc-700 mb-1.5">{label}</label>
    {children}
  </div>
);

const ErrorBox: React.FC<{ message: string }> = ({ message }) => (
  <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
    {message}
  </div>
);
