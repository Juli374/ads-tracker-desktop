import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { searchTermsApi } from '../../api/searchTerms';
import { useToast } from '../../contexts/ToastContext';
import { ModalShell } from './ModalShell';

type Preset = '30d' | '60d' | '90d' | '120d';

const PRESET_DAYS: Record<Preset, number> = {
  '30d': 30,
  '60d': 60,
  '90d': 90,
  '120d': 120,
};

interface Props {
  statusIds: number[];
  onClose(): void;
  onDone(updated: number): void;
}

/**
 * Phase J.1 Lane A — bulk pause modal.
 *
 * Pause = «keyword не работает сейчас, может пригодиться позже». Backend
 * переводит выбранные search-term'ы в `archived_pause` со сроком возврата
 * в inbox + пытается paused-нуть связанные ad-targeting-targets. Free-text
 * reason помогает понять при возврате почему мы паузили.
 */
export const PauseModal: React.FC<Props> = ({ statusIds, onClose, onDone }) => {
  const { t } = useTranslation('searchTerms');
  const toast = useToast();
  const [preset, setPreset] = useState<Preset>('60d');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await searchTermsApi.pauseTargets({
        statusIds,
        days: PRESET_DAYS[preset],
        reason: reason.trim() || undefined,
      });
      const updated = typeof res.updated === 'number' && res.updated > 0
        ? res.updated
        : statusIds.length;
      toast.success(t('bulk.results.paused', { count: updated }));
      onDone(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('errors.pause'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      title={t('pause.title')}
      subtitle={t('pause.subtitle', { count: statusIds.length })}
      closeAria={t('pause.closeAria')}
      onClose={onClose}
      busy={submitting}
      size="md"
      testId="pause-modal"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 px-3 text-xs font-medium rounded-md text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            {t('pause.cancel')}
          </button>
          <button
            type="submit"
            form="pause-form"
            disabled={submitting}
            className="h-8 px-4 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {t('pause.submit')}
          </button>
        </>
      }
    >
      <form id="pause-form" onSubmit={submit} className="space-y-4">
        <p className="text-[12px] text-zinc-600 leading-relaxed border-l-2 border-amber-300 pl-3">
          {t('pause.info')}
        </p>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-zinc-700">
            {t('pause.presetLabel')}
          </legend>
          <div className="grid grid-cols-4 gap-2">
            {(['30d', '60d', '90d', '120d'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className={`
                  h-8 px-2 text-xs font-medium rounded-md border transition-colors
                  ${preset === p
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300'}
                `}
                data-testid={`pause-preset-${p}`}
              >
                {t(`pause.preset.${p}` as 'pause.preset.30d')}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-zinc-700">
            {t('pause.reasonLabel')}{' '}
            <span className="font-normal text-zinc-400">{t('pause.reasonOptional')}</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={t('pause.reasonPlaceholder')}
            className="w-full px-3 py-2 text-xs rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 resize-y min-h-[60px]"
          />
        </div>
      </form>
    </ModalShell>
  );
};
