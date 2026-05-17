import React, { useState } from 'react';
import { Loader2, Mail, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal, ModalBody, ModalFooter } from '../ui/Modal';
import { Field } from '../ui/Field';

/**
 * ForgotPasswordModal — single-field "send reset link" modal triggered from
 * LoginScreen. The IPC layer guarantees we always render the same success
 * message regardless of whether the email exists (anti-user-enumeration).
 */
export interface ForgotPasswordModalProps {
  open: boolean;
  onClose(): void;
  /** Pre-fill the email from the LoginScreen form. */
  initialEmail?: string;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  open,
  onClose,
  initialEmail = '',
}) => {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState(initialEmail);
  const [submitting, setSubmitting] = useState(false);
  const [sentForEmail, setSentForEmail] = useState<string | null>(null);

  // Reset state when modal opens — caller can reuse this with different emails
  // without us hanging onto stale success / submitting flags.
  React.useEffect(() => {
    if (open) {
      setEmail(initialEmail);
      setSentForEmail(null);
      setSubmitting(false);
    }
  }, [open, initialEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await window.api.auth.forgotPassword(trimmed);
    } catch {
      // Backend contract: always succeeds. We mirror the contract — even on
      // transport failure show the same success screen.
    } finally {
      setSentForEmail(trimmed);
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('forgotPasswordModal.title')}
      data-testid="forgot-password-modal"
    >
      {sentForEmail ? (
        <>
          <ModalBody>
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={18} className="text-emerald-600" strokeWidth={2.2} />
              </div>
              <div className="text-sm font-semibold text-zinc-900">
                {t('forgotPasswordModal.successTitle')}
              </div>
              <div className="text-xs text-zinc-500 leading-relaxed">
                {t('forgotPasswordModal.successDescription', { email: sentForEmail })}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <button
              type="button"
              data-testid="forgot-password-close"
              onClick={onClose}
              className="h-9 px-4 rounded-md bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors"
            >
              {t('forgotPasswordModal.close')}
            </button>
          </ModalFooter>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <div className="text-xs text-zinc-500 leading-relaxed">
              {t('intro.forgotPassword')}
            </div>
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
                  autoFocus
                  data-testid="forgot-password-email"
                  className="w-full h-9 pl-8 pr-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>
            </Field>
          </ModalBody>
          <ModalFooter justify="between">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 rounded-md text-xs font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              {t('forgotPasswordModal.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || !email.trim()}
              data-testid="forgot-password-submit"
              className="h-9 px-4 rounded-md bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {submitting && <Loader2 size={13} className="animate-spin" />}
              {submitting ? t('actions.sending') : t('actions.sendResetLink')}
            </button>
          </ModalFooter>
        </form>
      )}
    </Modal>
  );
};
