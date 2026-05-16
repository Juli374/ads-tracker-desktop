import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { CampaignAnalyticsItem } from '../api/metrics';
import { campaignsApi, CampaignState, type BiddingStrategy, type CampaignUpdate } from '../api/campaigns';
import { ApiError } from '../api/client';
import { useToast } from '../contexts/ToastContext';
import { fmtMoney } from '../lib/format';
import { Modal, ModalBody, ModalFooter, ModalHeader } from './ui';

interface Props {
  campaign: CampaignAnalyticsItem;
  onClose(): void;
  onSaved(): void;
}

const BIDDING_STRATEGIES: BiddingStrategy[] = [
  'Fixed bids',
  'Dynamic bids - down only',
  'Dynamic bids - up and down',
];

// Парсит число из строки или возвращает undefined если строка пустая.
// Невалидные числа возвращают NaN — caller валидирует через Number.isFinite.
const parseOptionalNumber = (s: string): number | undefined => {
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  return Number(trimmed);
};

export const EditCampaignModal: React.FC<Props> = ({ campaign, onClose, onSaved }) => {
  const { t } = useTranslation('campaigns');
  const toast = useToast();
  const [state, setState] = useState<CampaignState>(
    campaign.status === 'paused' ? 'paused' : 'enabled',
  );
  const [name, setName] = useState<string>(campaign.campaign_name || '');
  // Backend в /api/metrics/summary/by-campaign не возвращает текущий budget /
  // bidding strategy / placements — поэтому поля начинаются пустыми и пушатся
  // только если юзер ввёл значение.
  const [budget, setBudget] = useState<string>('');
  const [bidding, setBidding] = useState<BiddingStrategy | ''>('');
  const [topOfSearch, setTopOfSearch] = useState<string>('');
  const [productPages, setProductPages] = useState<string>('');
  const [restOfSearch, setRestOfSearch] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaign.campaign_id) return;

    const budgetNum = parseOptionalNumber(budget);
    if (budgetNum !== undefined && (!Number.isFinite(budgetNum) || budgetNum <= 0)) {
      toast.error(t('edit.errors.budgetPositive'));
      return;
    }
    const placements: Array<[string, number | undefined]> = [
      ['top_of_search', parseOptionalNumber(topOfSearch)],
      ['product_pages', parseOptionalNumber(productPages)],
      ['rest_of_search', parseOptionalNumber(restOfSearch)],
    ];
    for (const [field, value] of placements) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 900)) {
        toast.error(t('edit.errors.fieldRange', { field }));
        return;
      }
    }

    const trimmedName = name.trim();
    const payload: CampaignUpdate = { state };
    if (budgetNum !== undefined) payload.budget = budgetNum;
    if (trimmedName && trimmedName !== campaign.campaign_name) payload.name = trimmedName;
    if (bidding) payload.bidding_strategy = bidding;
    if (placements[0][1] !== undefined) payload.top_of_search = placements[0][1];
    if (placements[1][1] !== undefined) payload.product_pages = placements[1][1];
    if (placements[2][1] !== undefined) payload.rest_of_search = placements[2][1];

    setSubmitting(true);
    try {
      await campaignsApi.update(campaign.campaign_id, payload);
      toast.success(t('edit.saved'));
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('edit.errors.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !submitting && onClose()}
      size="lg"
      closeOnEsc={!submitting}
      closeOnOverlay={!submitting}
      ariaLabel={campaign.campaign_name}
    >
      <form onSubmit={handleSubmit}>
        <ModalHeader
          title={campaign.campaign_name}
          description={`${campaign.book_title} · ${campaign.marketplace} · ${campaign.campaign_type.toUpperCase()}`}
          onClose={() => !submitting && onClose()}
        />

        <ModalBody>
          {/* State toggle */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              {t('edit.fields.status')}
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
                  {s === 'enabled' ? t('edit.fields.statusActive') : t('edit.fields.statusPaused')}
                </button>
              ))}
            </div>
          </div>

          {/* Имя */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              {t('edit.fields.name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              autoFocus
            />
          </div>

          {/* Budget */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              {t('edit.fields.dailyBudget', { currency: campaign.currency || 'USD' })}
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder={t('edit.fields.budgetPlaceholder')}
              className={inputClass}
            />
            <p className="text-[11px] text-zinc-400">
              {t('edit.fields.spendHint', { value: fmtMoney(campaign.cost, campaign.currency) })}{' '}
              {t('edit.fields.budgetEmptyHint')}
            </p>
          </div>

          {/* Bidding strategy */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              Bidding strategy
            </label>
            <select
              value={bidding}
              onChange={(e) => setBidding(e.target.value as BiddingStrategy | '')}
              className="
                w-full h-9 px-2 text-sm rounded-md
                border border-zinc-200 bg-white text-zinc-900
                focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
              "
            >
              <option value="">{t('edit.fields.noChange')}</option>
              {BIDDING_STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Placement adjustments */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              Placement bid adjustments (%)
            </label>
            <div className="grid grid-cols-3 gap-2">
              <PlacementInput
                label="Top of search"
                value={topOfSearch}
                onChange={setTopOfSearch}
              />
              <PlacementInput
                label="Product pages"
                value={productPages}
                onChange={setProductPages}
              />
              <PlacementInput
                label="Rest of search"
                value={restOfSearch}
                onChange={setRestOfSearch}
              />
            </div>
            <p className="text-[11px] text-zinc-400">
              {t('edit.fields.placementHint')}
            </p>
          </div>
        </ModalBody>

        <ModalFooter>
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
            {t('edit.actions.cancel')}
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
            {t('edit.actions.save')}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
};

const inputClass =
  'w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400';

const PlacementInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ label, value, onChange }) => (
  <div className="space-y-1">
    <div className="text-[10px] text-zinc-500">{label}</div>
    <input
      type="number"
      min="0"
      max="900"
      step="1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="—"
      className={inputClass}
    />
  </div>
);
