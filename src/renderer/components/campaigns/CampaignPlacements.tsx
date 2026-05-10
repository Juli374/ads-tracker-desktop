/**
 * CampaignPlacements — placement (TOS / PP / ROS) bid-modifier editor +
 * per-week breakdown for CampaignDetailsPage.
 *
 * Phase J.2 Lane B. Источник правды: existing campaign update endpoint
 * PUT /api/campaigns/:id (placement_bid_adjustments fields).
 *
 * Поведение:
 *  - 3 поля (Top of Search / Product Pages / Rest of Search) с inline-edit.
 *  - Save commits ВСЕ три модификатора одним PUT'ом — backend требует
 *    атомарную выкатку (placement_bid_adjustments).
 *  - Per-week breakdown подгружается через campaignsApi.getPlacementHistory
 *    (graceful 404). Если бэк не отдаёт endpoint — рендерим только
 *    модификаторы без таблицы.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../ui';
import { ApiError } from '../../api/client';
import {
  campaignsApi,
  type PlacementHistoryResponse,
  type PlacementWeekRow,
} from '../../api/campaigns';
import { fmtMoney, fmtNumber, fmtPct } from '../../lib/format';
import { useToast } from '../../contexts/ToastContext';

interface Props {
  campaignId: number;
  initial: {
    top_of_search: number;
    product_pages: number;
    rest_of_search: number;
  };
  currency?: string;
}

type PlacementKey = 'top_of_search' | 'product_pages' | 'rest_of_search';

const PLACEMENT_KEYS: PlacementKey[] = ['top_of_search', 'product_pages', 'rest_of_search'];

export const CampaignPlacements: React.FC<Props> = ({ campaignId, initial, currency }) => {
  const { t } = useTranslation('campaigns');
  const toast = useToast();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PlacementHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Sync, если parent перезагрузил campaign (e.g. после save).
  useEffect(() => {
    setValues(initial);
  }, [initial.top_of_search, initial.product_pages, initial.rest_of_search]);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    campaignsApi
      .getPlacementHistory(campaignId)
      .then((data) => {
        if (cancelled) return;
        setHistory(data); // null если 404 — рендерим без chart
      })
      .catch(() => {
        // network/5xx — тихо: при сбое истории мы всё равно показываем editor.
        if (!cancelled) setHistory(null);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  // Inline label resolver — i18next strict-keyed t() не позволяет
  // динамические ключи через переменную, поэтому статически выбираем
  // нужный ключ через switch.
  const labelFull = (key: PlacementKey): string => {
    switch (key) {
      case 'top_of_search':
        return t('details.placements.tosLabel');
      case 'product_pages':
        return t('details.placements.ppLabel');
      case 'rest_of_search':
        return t('details.placements.rosLabel');
    }
  };

  const dirty = useMemo(
    () =>
      values.top_of_search !== initial.top_of_search ||
      values.product_pages !== initial.product_pages ||
      values.rest_of_search !== initial.rest_of_search,
    [values, initial],
  );

  const setField = (key: PlacementKey, raw: string) => {
    const n = parseInt(raw, 10);
    const clamped = Number.isFinite(n) ? Math.max(0, Math.min(900, n)) : 0;
    setValues((prev) => ({ ...prev, [key]: clamped }));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      // Используем существующий generic update endpoint, который принимает
      // top_of_search / product_pages / rest_of_search. Backend синхронизирует
      // это в placement_bid_adjustments + Amazon-side через тот же endpoint
      // (зеркально EditCampaignModal).
      await campaignsApi.update(campaignId, values);
      toast.success(t('details.placements.savedToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('details.placements.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const weeks = history?.weeks ?? [];

  return (
    <Card
      title={t('details.placements.title')}
      rightSlot={
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          data-testid="placements-save"
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('details.placements.saveAll')}
        </button>
      }
    >
      <div className="px-5 py-4">
        <div className="grid grid-cols-3 gap-3" data-testid="placements-editor">
          {PLACEMENT_KEYS.map((key) => (
            <label
              key={key}
              className="flex flex-col gap-1.5 p-3 rounded-lg border border-zinc-200 bg-zinc-50/40"
            >
              <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                {labelFull(key)}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-zinc-400 text-sm">+</span>
                <input
                  type="number"
                  min={0}
                  max={900}
                  step={1}
                  value={values[key]}
                  onChange={(e) => setField(key, e.target.value)}
                  data-testid={`placements-input-${key}`}
                  aria-label={t('details.placements.modAria', { label: labelFull(key) })}
                  className="flex-1 h-7 px-2 text-sm tabular-nums text-right rounded border border-zinc-200 bg-white"
                />
                <span className="text-zinc-400 text-sm">%</span>
              </div>
            </label>
          ))}
        </div>

        {/* History — per-week breakdown table.
            Если backend не выкатан endpoint — historyLoading=false и
            history=null → рендерим заглушку без таблицы. */}
        <div className="mt-5 pt-4 border-t border-zinc-100">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-zinc-700">
              {t('details.placements.historyTitle')}
            </h4>
          </div>
          {historyLoading ? (
            <div className="text-[11px] text-zinc-500">{t('details.placements.historyLoading')}</div>
          ) : weeks.length === 0 ? (
            <div className="text-[11px] text-zinc-500" data-testid="placements-history-empty">
              {t('details.placements.historyEmpty')}
            </div>
          ) : (
            <PlacementHistoryTable weeks={weeks} currency={currency} />
          )}
        </div>
      </div>
    </Card>
  );
};

const PlacementHistoryTable: React.FC<{
  weeks: PlacementWeekRow[];
  currency?: string;
}> = ({ weeks, currency }) => {
  const { t } = useTranslation('campaigns');

  const fmtAcos = (acos?: number) =>
    typeof acos === 'number' && acos > 0 ? fmtPct(acos) : '—';

  return (
    <div className="overflow-x-auto" data-testid="placements-history-table">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
            <th className="text-left px-2 py-1.5 font-medium">{t('details.placements.th.week')}</th>
            <th className="text-left px-2 py-1.5 font-medium">{t('details.placements.th.metric')}</th>
            <th className="text-right px-2 py-1.5 font-medium">{t('details.placements.th.tos')}</th>
            <th className="text-right px-2 py-1.5 font-medium">{t('details.placements.th.pp')}</th>
            <th className="text-right px-2 py-1.5 font-medium">{t('details.placements.th.ros')}</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => {
            const label = w.week_label ?? `${w.week_start} → ${w.week_end}`;
            const tos = w.top_of_search ?? null;
            const pp = w.product_pages ?? null;
            const ros = w.rest_of_search ?? null;
            return (
              <React.Fragment key={`${w.week_start}-${w.week_end}`}>
                <tr className="border-t border-zinc-100">
                  <td className="px-2 py-1 font-medium text-zinc-700" rowSpan={3}>
                    {label}
                  </td>
                  <td className="px-2 py-1 text-zinc-500">{t('details.placements.th.imps')}</td>
                  <td className="px-2 py-1 text-right">{fmtNumber(tos?.impressions ?? 0)}</td>
                  <td className="px-2 py-1 text-right">{fmtNumber(pp?.impressions ?? 0)}</td>
                  <td className="px-2 py-1 text-right">{fmtNumber(ros?.impressions ?? 0)}</td>
                </tr>
                <tr>
                  <td className="px-2 py-1 text-zinc-500">{t('details.placements.th.spend')}</td>
                  <td className="px-2 py-1 text-right">{fmtMoney(tos?.cost ?? 0, currency)}</td>
                  <td className="px-2 py-1 text-right">{fmtMoney(pp?.cost ?? 0, currency)}</td>
                  <td className="px-2 py-1 text-right">{fmtMoney(ros?.cost ?? 0, currency)}</td>
                </tr>
                <tr>
                  <td className="px-2 py-1 text-zinc-500">{t('details.placements.th.acos')}</td>
                  <td className="px-2 py-1 text-right">{fmtAcos(tos?.acos)}</td>
                  <td className="px-2 py-1 text-right">{fmtAcos(pp?.acos)}</td>
                  <td className="px-2 py-1 text-right">{fmtAcos(ros?.acos)}</td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
