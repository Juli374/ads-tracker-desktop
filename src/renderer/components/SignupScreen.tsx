import React, { useState } from 'react';
import { Loader2, Mail, User, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Field } from './ui/Field';

/**
 * SignupScreen — email + password + confirm password + optional full name +
 * Terms agreement. Validates client-side (passwords match, ≥ 10 chars) before
 * the IPC call so the user gets fast feedback. On success, AuthContext flips
 * to authenticated via the auth:authenticated push event.
 */
interface SignupScreenProps {
  /** Switch back to the LoginScreen. */
  onSwitchToLogin(): void;
  /** Pre-fill the email from LoginScreen. */
  initialEmail?: string;
}

const MIN_PASSWORD_LENGTH = 10;

export const SignupScreen: React.FC<SignupScreenProps> = ({
  onSwitchToLogin,
  initialEmail = '',
}) => {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fullName, setFullName] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const passwordsMismatch =
    confirm.length > 0 && password !== confirm;

  const canSubmit =
    !!email.trim() &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === confirm &&
    agreeTerms &&
    !busy;

  const validateOnSubmit = (): string | null => {
    if (!email.trim()) return t('errors.emailRequired');
    if (password.length < MIN_PASSWORD_LENGTH) return t('errors.passwordTooShort');
    if (password !== confirm) return t('errors.passwordsMustMatch');
    if (!agreeTerms) return t('errors.termsRequired');
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const validationError = validateOnSubmit();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await window.api.auth.signup(
        email.trim(),
        password,
        fullName.trim() || undefined,
      );
      if (!result.ok) {
        setError(result.error || t('errors.signupFailed'));
        return;
      }
      // On success, AuthContext picks up the auth:authenticated push event
      // and the screen unmounts. Don't reset state here — the unmount cleanup
      // handles it.
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.signupFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="h-screen w-screen flex items-center justify-center bg-zinc-50 overflow-y-auto py-8"
      data-testid="signup-screen"
    >
      <div className="w-full max-w-md mx-auto px-8">
        <div className="bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden">
          <div className="px-7 pt-7 pb-5 border-b border-zinc-100">
            <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center mb-4">
              <User size={16} strokeWidth={2.2} className="text-white" />
            </div>
            <h1 className="font-display text-lg font-bold text-zinc-900 tracking-tight">
              {t('signup.title')}
            </h1>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              {t('intro.signup')}
            </p>
          </div>

          <form onSubmit={onSubmit} className="px-7 py-6 space-y-4" noValidate>
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
                  data-testid="signup-email"
                  className={inputClass}
                />
              </div>
            </Field>

            <Field label={t('fields.fullName')}>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('fields.fullNamePlaceholder')}
                autoComplete="name"
                data-testid="signup-full-name"
                className={inputClassNoIcon}
              />
            </Field>

            <Field
              label={t('fields.newPassword')}
              error={
                submitted && passwordTooShort
                  ? t('errors.passwordTooShort')
                  : undefined
              }
              hint={!submitted ? t('fields.newPasswordPlaceholder') : undefined}
            >
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
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  data-testid="signup-password"
                  className={inputClass}
                />
              </div>
            </Field>

            <Field
              label={t('fields.confirmPassword')}
              error={
                submitted && passwordsMismatch
                  ? t('errors.passwordsMustMatch')
                  : undefined
              }
            >
              <div className="relative">
                <Lock
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
                  strokeWidth={2}
                />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={t('fields.confirmPasswordPlaceholder')}
                  autoComplete="new-password"
                  required
                  data-testid="signup-confirm"
                  className={inputClass}
                />
              </div>
            </Field>

            <label className="flex items-start gap-2 text-xs text-zinc-600 leading-relaxed cursor-pointer">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                data-testid="signup-agree-terms"
                className="mt-0.5 w-3.5 h-3.5 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500/30 focus:ring-2"
              />
              <span>{t('fields.agreeTerms')}</span>
            </label>

            {error && <ErrorBox message={error} />}

            <button
              type="submit"
              disabled={!canSubmit}
              data-testid="signup-submit"
              className="w-full h-9 rounded-md bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy ? t('actions.creatingAccount') : t('actions.createAccount')}
            </button>

            <button
              type="button"
              onClick={onSwitchToLogin}
              data-testid="signup-switch-login"
              className="w-full text-center text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              {t('actions.haveAccount')}
            </button>
          </form>
        </div>

        <div className="mt-4 text-[11px] text-zinc-400 leading-relaxed text-center">
          {t('appName')} · {t('tagline')}
        </div>
      </div>
    </div>
  );
};

const inputClass =
  'w-full h-9 pl-8 pr-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';

const inputClassNoIcon =
  'w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';

const ErrorBox: React.FC<{ message: string }> = ({ message }) => (
  <div
    role="alert"
    data-testid="signup-error"
    className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2"
  >
    {message}
  </div>
);
