import React, { useState } from 'react';
import { Loader2, Lock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Field } from '../ui/Field';
import { useToast } from '../../contexts/ToastContext';

const MIN_PASSWORD_LENGTH = 10;

/**
 * ChangePasswordSection — settings card that lets the user rotate their KDPBook
 * password. On success the backend revokes all OTHER sessions, so we surface a
 * persistent warning. This is a *section* (not a tab) so it can drop into the
 * existing Account / Application area without a tab-spec change.
 */
export const ChangePasswordSection: React.FC = () => {
  const { t } = useTranslation('auth');
  const { t: tSettings } = useTranslation('settings');
  const toast = useToast();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState(false);

  const passwordTooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const passwordsMismatch = confirm.length > 0 && next !== confirm;
  const samePassword = current.length > 0 && next === current;

  const canSubmit =
    !!current &&
    next.length >= MIN_PASSWORD_LENGTH &&
    next === confirm &&
    next !== current &&
    !busy;

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setSubmitted(false);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!current) {
      setError(t('errors.changePasswordFailed'));
      return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(t('errors.passwordTooShort'));
      return;
    }
    if (next !== confirm) {
      setError(t('errors.passwordsMustMatch'));
      return;
    }
    if (next === current) {
      setError(t('errors.samePassword'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await window.api.auth.changePassword(current, next);
      if (!result.ok) {
        setError(result.error || t('errors.changePasswordFailed'));
        return;
      }
      setSuccess(true);
      reset();
      toast.success(t('changePassword.success'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.changePasswordFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="bg-white border border-zinc-200 rounded-xl overflow-hidden"
      data-testid="change-password-section"
    >
      <div className="px-5 pt-5 pb-3 border-b border-zinc-100">
        <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">
          {tSettings('account.changePasswordTitle')}
        </h3>
        <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
          {tSettings('account.changePasswordSubtitle')}
        </p>
      </div>

      <form onSubmit={onSubmit} className="px-5 py-4 space-y-4" noValidate>
        <Field label={t('fields.currentPassword')}>
          <div className="relative">
            <Lock
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
              strokeWidth={2}
            />
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder={t('fields.currentPasswordPlaceholder')}
              autoComplete="current-password"
              data-testid="change-password-current"
              className={inputClass}
            />
          </div>
        </Field>

        <Field
          label={t('fields.newPassword')}
          error={submitted && passwordTooShort ? t('errors.passwordTooShort') : undefined}
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
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder={t('fields.passwordPlaceholder')}
              autoComplete="new-password"
              data-testid="change-password-new"
              className={inputClass}
            />
          </div>
        </Field>

        <Field
          label={t('fields.confirmPassword')}
          error={
            submitted && passwordsMismatch
              ? t('errors.passwordsMustMatch')
              : submitted && samePassword
              ? t('errors.samePassword')
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
              data-testid="change-password-confirm"
              className={inputClass}
            />
          </div>
        </Field>

        {error && (
          <div
            role="alert"
            data-testid="change-password-error"
            className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            data-testid="change-password-success"
            className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2 flex items-start gap-2"
          >
            <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 flex-shrink-0" strokeWidth={2.2} />
            <div className="leading-relaxed">
              <div className="font-medium text-emerald-900">
                {t('changePassword.success')}
              </div>
              <div className="text-emerald-700 mt-0.5 flex items-center gap-1">
                <ShieldAlert size={12} />
                {t('changePassword.otherSessionsRevoked')}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!canSubmit}
            data-testid="change-password-submit"
            className="h-9 px-4 rounded-md bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {busy ? t('actions.changingPassword') : t('actions.changePassword')}
          </button>
        </div>
      </form>
    </div>
  );
};

const inputClass =
  'w-full h-9 pl-8 pr-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';
