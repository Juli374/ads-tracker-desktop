import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { searchTermsApi } from '../../api/searchTerms';
import { useToast } from '../../contexts/ToastContext';
import { ModalShell } from './ModalShell';

type Preset = '1d' | '3d' | '7d' | 'custom';

const PRESET_DAYS: Record<Exclude<Preset, 'custom'>, number> = {
  '1d': 1,
  '3d': 3,
  '7d': 7,
};

interface Props {
  statusIds: number[];
  onClose(): void;
  onDone(updated: number): void;
}

/**
 * Phase J.1 Lane A — bulk snooze modal.
 *
 * Presets: 1d / 3d / 7d (most-used cases) plus "custom date" — a date input
 * for arbitrary future dates (e.g. snooze until next month's report). Reason
 * is optional free-text.
 */
export const SnoozeModal: React.FC<Props> = ({ statusIds, onClose, onDone }) => {
  const { t } = useTranslation('searchTerms');
  const toast = useToast();
  const [preset, setPreset] = useState<Preset>('3d');
  const [customDate, setCustomDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preset === 'custom') {
      const today = new Date().toISOString().slice(0, 10);
      if (!customDate || customDate <= today) {
        toast.error(t('snooze.errors.futureDateRequired'));
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await searchTermsApi.snooze({
        statusIds,
        days: preset === 'custom' ? undefined : PRESET_DAYS[preset],
        untilDate: preset === 'custom' ? customDate : undefined,
        reason: reason.trim() || undefined,
      });
      // Trust the server count. 0/absent → neutral info toast, not a false
      // success.
      const updated = typeof res.updated === 'number' ? res.updated : 0;
      if (updated > 0) {
        toast.success(t('bulk.results.snoozed', { count: updated }));
      } else {
        toast.info(t('bulk.results.snoozedNone'));
      }
      onDone(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('errors.snooze'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      title={t('snooze.title')}
      subtitle={t('snooze.subtitle', { count: statusIds.length })}
      closeAria={t('snooze.closeAria')}
      onClose={onClose}
      busy={submitting}
      size="md"
      testId="snooze-modal"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 px-3 text-xs font-medium rounded-md text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            {t('snooze.cancel')}
          </button>
          <button
            type="submit"
            form="snooze-form"
            disabled={submitting}
            className="h-8 px-4 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {t('snooze.submit')}
          </button>
        </>
      }
    >
      <form id="snooze-form" onSubmit={submit} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-zinc-700">
            {t('snooze.presetLabel')}
          </legend>
          <div className="grid grid-cols-4 gap-2">
            {(['1d', '3d', '7d', 'custom'] as const).map((p) => (
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
                data-testid={`snooze-preset-${p}`}
              >
                {t(`snooze.preset.${p}` as 'snooze.preset.1d')}
              </button>
            ))}
          </div>
        </fieldset>

        {preset === 'custom' && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              {t('snooze.customDateLabel')}
            </label>
            <input
              type="date"
              value={customDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setCustomDate(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
              data-testid="snooze-custom-date"
            />
            <p className="text-[11px] text-zinc-500">{t('snooze.customDateHint')}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-zinc-700">
            {t('snooze.reasonLabel')}{' '}
            <span className="font-normal text-zinc-400">{t('snooze.reasonOptional')}</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={t('snooze.reasonPlaceholder')}
            className="w-full px-3 py-2 text-xs rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 resize-y min-h-[60px]"
          />
        </div>
      </form>
    </ModalShell>
  );
};
