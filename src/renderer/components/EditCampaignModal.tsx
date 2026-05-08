import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { CampaignAnalyticsItem } from '../api/metrics';
import { campaignsApi, CampaignState } from '../api/campaigns';
import { ApiError } from '../api/client';
import { useToast } from '../contexts/ToastContext';
import { fmtMoney } from '../lib/format';

interface Props {
  campaign: CampaignAnalyticsItem;
  onClose(): void;
  onSaved(): void;
}

export const EditCampaignModal: React.FC<Props> = ({ campaign, onClose, onSaved }) => {
  const toast = useToast();
  const [state, setState] = useState<CampaignState>(
    campaign.status === 'paused' ? 'paused' : 'enabled',
  );
  // Backend в /api/metrics/summary/by-campaign не возвращает текущий budget,
  // поэтому начинаем с пустого поля и не пушим если пусто.
  const [budget, setBudget] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.body.dataset.modalOpen = 'true';
    return () => {
      delete document.body.dataset.modalOpen;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaign.campaign_id) return;
    const trimmed = budget.trim();
    let budgetNum: number | undefined;
    if (trimmed) {
      budgetNum = Number(trimmed);
      if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
        toast.error('Budget должен быть положительным числом');
        return;
      }
    }
    setSubmitting(true);
    try {
      await campaignsApi.update(campaign.campaign_id, {
        state,
        ...(budgetNum != null ? { budget: budgetNum } : {}),
      });
      toast.success('Сохранено');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    } finally {
      setSubmitting(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !submitting) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-zinc-900/20 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      onKeyDown={onKey}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden"
      >
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-zinc-900 tracking-tight truncate">
                {campaign.campaign_name}
              </h2>
              <div className="text-xs text-zinc-500 mt-0.5">
                {campaign.book_title} · {campaign.marketplace} · {campaign.campaign_type.toUpperCase()}
              </div>
            </div>
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="text-zinc-400 hover:text-zinc-700 transition-colors"
              aria-label="Закрыть"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* State toggle */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              Статус
            </label>
            <div className="inline-flex bg-white border border-zinc-200 rounded-md p-0.5">
              {(['enabled', 'paused'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setState(s)}
                  className={`
                    px-3 h-8 text-xs font-medium rounded transition-colors
                    ${state === s
                      ? s === 'enabled'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'text-zinc-500 hover:text-zinc-900'}
                  `}
                >
                  {s === 'enabled' ? 'Активна' : 'На паузе'}
                </button>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              Дневной бюджет ({campaign.currency || 'USD'})
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="оставить без изменений"
              className="
                w-full h-9 px-3 text-sm rounded-md
                border border-zinc-200 bg-white
                text-zinc-900 placeholder:text-zinc-400
                focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
              "
              autoFocus
            />
            <p className="text-[11px] text-zinc-400">
              Spend за период: {fmtMoney(campaign.cost, campaign.currency)}.
              Поле пустое = бюджет не меняется.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="
              h-8 px-3 text-xs font-medium rounded-md
              text-zinc-700 border border-zinc-200 bg-white
              hover:bg-zinc-50 transition-colors
              disabled:opacity-50
            "
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="
              h-8 px-4 text-xs font-medium rounded-md
              bg-zinc-900 text-white hover:bg-zinc-800 transition-colors
              flex items-center gap-1.5
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            Сохранить
          </button>
        </div>
      </form>
    </div>
  );
};
