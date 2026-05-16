import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { ApiError } from '../api/client';
import { targetsApi, type MatchType } from '../api/targets';
import type { AdGroup } from '../api/adGroups';
import { Modal, ModalBody, ModalFooter } from './ui';

interface Props {
  adGroups: AdGroup[];
  defaultAdGroupId?: number;
  // Default bid из выбранной ad group — применяется по умолчанию если не override.
  onClose(): void;
  onAdded(): void;
}

const splitNonEmpty = (raw: string): string[] =>
  Array.from(
    new Set(
      raw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );

export const AddTargetModal: React.FC<Props> = ({
  adGroups,
  defaultAdGroupId,
  onClose,
  onAdded,
}) => {
  const { t } = useTranslation('campaigns');
  const toast = useToast();
  const [adGroupId, setAdGroupId] = useState<number | null>(
    defaultAdGroupId ?? adGroups[0]?.id ?? null,
  );
  const [type, setType] = useState<'keyword' | 'asin'>('keyword');
  const [keywords, setKeywords] = useState('');
  const [matchType, setMatchType] = useState<MatchType>('exact');
  const [bidOverride, setBidOverride] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const selectedGroup = adGroups.find((g) => g.id === adGroupId) ?? null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adGroupId) {
      toast.error(t('addTarget.errors.selectAdGroup'));
      return;
    }
    const items = splitNonEmpty(keywords);
    if (items.length === 0) {
      toast.error(t('addTarget.errors.listEmpty'));
      return;
    }
    const overrideBid = bidOverride.trim() ? Number(bidOverride) : undefined;
    if (overrideBid !== undefined && (!Number.isFinite(overrideBid) || overrideBid <= 0)) {
      toast.error(t('addTarget.errors.bidOverridePositive'));
      return;
    }
    const bid = overrideBid ?? selectedGroup?.default_bid ?? 0.75;

    setSubmitting(true);
    try {
      let failed = 0;
      if (type === 'keyword') {
        const results = await targetsApi.createKeywordsBulk(adGroupId, items, matchType, bid);
        failed = results.filter((r) => !r.ok).length;
      } else {
        // ASIN-targets: сериализуем в отдельных POST'ах через api.create.
        for (const asin of items) {
          try {
            await targetsApi.create(adGroupId, { asin, match_type: 'asin', bid });
          } catch {
            failed += 1;
          }
        }
      }
      if (failed > 0) {
        toast.error(
          t('addTarget.errors.partialFailure', {
            ok: items.length - failed,
            total: items.length,
            fail: failed,
          }),
        );
      } else {
        toast.success(t('addTarget.added', { count: items.length }));
      }
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('addTarget.errors.addFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !submitting && onClose()}
      size="lg"
      title={t('addTarget.title')}
      closeOnEsc={!submitting}
      closeOnOverlay={!submitting}
    >
      <form onSubmit={handleSubmit}>
        <ModalBody>
          {/* Ad group */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">Ad Group</label>
            <select
              value={adGroupId ?? ''}
              onChange={(e) => setAdGroupId(Number(e.target.value))}
              className="w-full h-9 px-2 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
              required
            >
              {adGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} (default ${g.default_bid?.toFixed(2) ?? '0.00'})
                </option>
              ))}
            </select>
          </div>

          {/* Тип target */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">{t('addTarget.fields.type')}</label>
            <div className="inline-flex bg-white border border-zinc-200 rounded-md p-0.5">
              {(['keyword', 'asin'] as const).map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setType(tp)}
                  className={`px-3 h-7 text-xs font-medium rounded transition-colors ${
                    type === tp ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {tp === 'keyword' ? 'Keywords' : 'ASIN'}
                </button>
              ))}
            </div>
          </div>

          {/* Список */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              {type === 'keyword' ? t('addTarget.fields.keywords') : t('addTarget.fields.asins')}
              <span className="text-zinc-400 font-normal ml-1">{t('addTarget.fields.perLineHint')}</span>
            </label>
            <textarea
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder={
                type === 'keyword'
                  ? 'crockpot recipes\nslow cooker meals'
                  : 'B08XXXXXXX\nB09YYYYYYY'
              }
              rows={5}
              className="w-full px-3 py-2 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 font-mono resize-y min-h-[100px]"
              required
            />
          </div>

          {/* Match type — только для keywords */}
          {type === 'keyword' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-700">Match type</label>
              <div className="inline-flex bg-white border border-zinc-200 rounded-md p-0.5">
                {(['exact', 'phrase', 'broad'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMatchType(m)}
                    className={`px-3 h-7 text-xs font-medium rounded transition-colors ${
                      matchType === m ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bid override */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              Bid override ($)
              <span className="text-zinc-400 font-normal ml-1">
                {t('addTarget.fields.defaultBidEmpty', {
                  value: selectedGroup?.default_bid?.toFixed(2) ?? '—',
                })}
              </span>
            </label>
            <input
              type="number"
              min="0.02"
              step="0.01"
              value={bidOverride}
              onChange={(e) => setBidOverride(e.target.value)}
              placeholder={selectedGroup?.default_bid?.toFixed(2) ?? '0.75'}
              className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
            />
          </div>
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 px-3 text-xs font-medium rounded-md text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            {t('addTarget.actions.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-8 px-4 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {t('addTarget.actions.submit')}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
};
