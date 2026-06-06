import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { adGroupsApi } from '../../api/adGroups';
import { metricsApi } from '../../api/metrics';
import {
  searchTermsApi,
  type MoveTargetsRequest,
} from '../../api/searchTerms';
import { useToast } from '../../contexts/ToastContext';
import { ModalShell } from './ModalShell';

interface AdGroupChoice {
  id: number;
  campaignId: number;
  campaignName: string;
  name: string;
}

interface Props {
  statusIds: number[];
  // Контекст для подбора кампаний-кандидатов: книга, маркетплейс, source-кампания.
  bookId?: number | null;
  marketplace?: string | null;
  sourceCampaignId?: number | null;
  onClose(): void;
  onDone(moved: number): void;
}

/**
 * Phase J.1 Lane A — bulk move modal.
 *
 * Загружает кандидатные ad-groups через existing API:
 *   1. `/api/metrics/summary/by-campaign` (с фильтрами book/marketplace) —
 *      получаем список campaigns кроме источника
 *   2. для каждой — `/api/campaigns/:id/ad-groups`
 *
 * Затем шлёт `searchTermsApi.moveTargets`. Опция «add negative в исходной
 * ad-group» включена по умолчанию — типичный паттерн harvesting'а.
 */
export const MoveModal: React.FC<Props> = ({
  statusIds,
  bookId,
  marketplace,
  sourceCampaignId,
  onClose,
  onDone,
}) => {
  const { t } = useTranslation('searchTerms');
  const toast = useToast();
  const [adGroupChoices, setAdGroupChoices] = useState<AdGroupChoice[] | null>(null);
  const [loadingChoices, setLoadingChoices] = useState(true);
  const [adGroupId, setAdGroupId] = useState<number | ''>('');
  const [matchType, setMatchType] = useState<MoveTargetsRequest['matchType']>('Exact');
  const [bid, setBid] = useState<string>('0.75');
  const [addNegative, setAddNegative] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingChoices(true);
      try {
        const summary = await metricsApi.summaryByCampaign({
          bookIds: bookId != null ? [bookId] : undefined,
          marketplaces: marketplace ? [marketplace] : undefined,
          activeOnly: true,
        });
        const campaigns = summary.campaigns.filter(
          (c) => sourceCampaignId == null || c.campaign_id !== sourceCampaignId,
        );
        const groups: AdGroupChoice[] = [];
        // Limit to first 8 campaigns to keep the request count sane in UI;
        // realistic books rarely have >8 active SP-кампаний per marketplace.
        for (const c of campaigns.slice(0, 8)) {
          try {
            const ags = await adGroupsApi.listByCampaign(c.campaign_id);
            for (const ag of ags) {
              groups.push({
                id: ag.id,
                campaignId: c.campaign_id,
                campaignName: c.campaign_name,
                name: ag.name,
              });
            }
          } catch {
            // Skip campaigns that don't expose ad-groups (auto-targeting can return 404).
          }
        }
        if (!cancelled) {
          setAdGroupChoices(groups);
          setLoadingChoices(false);
        }
      } catch (err) {
        if (!cancelled) {
          setAdGroupChoices([]);
          setLoadingChoices(false);
          toast.error(
            err instanceof ApiError ? err.message : t('move.errors.noCampaigns'),
          );
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // `t` is intentionally outside deps — react-i18next returns a new
    // function reference each render, which triggers infinite reloads.
  }, [bookId, marketplace, sourceCampaignId, toast]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adGroupId === '') {
      toast.error(t('move.errors.adGroupRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const bidNum = Number(bid);
      const res = await searchTermsApi.moveTargets({
        statusIds,
        adGroupId: Number(adGroupId),
        matchType,
        bid: Number.isFinite(bidNum) && bidNum > 0 ? bidNum : undefined,
        addNegative,
      });
      // Trust the server count (`succeeded`). 0/absent → neutral info toast,
      // not a false success.
      const moved = typeof res.succeeded === 'number' ? res.succeeded : 0;
      if (moved > 0) {
        toast.success(t('bulk.results.moved', { count: moved }));
      } else {
        toast.info(t('bulk.results.movedNone'));
      }
      onDone(moved);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('errors.move'));
    } finally {
      setSubmitting(false);
    }
  };

  const groupedByCampaign = useMemo(() => {
    if (!adGroupChoices) return [];
    const map = new Map<number, { campaignName: string; groups: AdGroupChoice[] }>();
    for (const g of adGroupChoices) {
      if (!map.has(g.campaignId)) {
        map.set(g.campaignId, { campaignName: g.campaignName, groups: [] });
      }
      map.get(g.campaignId)?.groups.push(g);
    }
    return Array.from(map.values());
  }, [adGroupChoices]);

  return (
    <ModalShell
      title={t('move.title')}
      subtitle={t('move.subtitle', { count: statusIds.length })}
      closeAria={t('move.closeAria')}
      onClose={onClose}
      busy={submitting}
      size="md"
      testId="move-modal"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 px-3 text-xs font-medium rounded-md text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            {t('move.cancel')}
          </button>
          <button
            type="submit"
            form="move-form"
            disabled={submitting || loadingChoices}
            className="h-8 px-4 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {t('move.submit')}
          </button>
        </>
      }
    >
      <form id="move-form" onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-zinc-700">
            {t('move.adGroupLabel')}
          </label>
          {loadingChoices ? (
            <div className="flex items-center gap-2 h-9 px-3 text-xs text-zinc-500">
              <Loader2 size={12} className="animate-spin" />
              {t('loading')}
            </div>
          ) : (
            <select
              value={adGroupId}
              onChange={(e) =>
                setAdGroupId(e.target.value === '' ? '' : Number(e.target.value))
              }
              className="w-full h-9 px-2 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
              data-testid="move-adgroup-select"
              required
            >
              <option value="">{t('move.adGroupPlaceholder')}</option>
              {groupedByCampaign.map((cg) => (
                <optgroup key={cg.campaignName} label={cg.campaignName}>
                  {cg.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              {t('move.matchTypeLabel')}
            </label>
            <div className="inline-flex bg-white border border-zinc-200 rounded-md p-0.5 w-full">
              {(['Exact', 'Phrase', 'Broad'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMatchType(m)}
                  className={`
                    flex-1 h-7 text-xs font-medium rounded transition-colors
                    ${matchType === m
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-600 hover:text-zinc-900'}
                  `}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              {t('move.bidLabel')}
            </label>
            <input
              type="number"
              min="0.02"
              step="0.01"
              value={bid}
              onChange={(e) => setBid(e.target.value)}
              placeholder={t('move.bidPlaceholder')}
              className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
            />
          </div>
        </div>

        <label className="flex items-start gap-2 text-xs text-zinc-700 cursor-pointer">
          <input
            type="checkbox"
            checked={addNegative}
            onChange={(e) => setAddNegative(e.target.checked)}
            className="mt-0.5"
          />
          <span>{t('move.addNegativeLabel')}</span>
        </label>
      </form>
    </ModalShell>
  );
};
