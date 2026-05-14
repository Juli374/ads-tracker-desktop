import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Sparkles } from 'lucide-react';
import { Card, LoadingRow } from '../ui';
import { metricsApi, type CampaignAnalyticsItem } from '../../api/metrics';
import { ApiError } from '../../api/client';
import { fmtMoney, fmtNumber, fmtPct, formatDate } from '../../lib/format';
import {
  getFullWeeksDateRange,
  useWeeksFilter,
  type WeekRange,
} from '../../contexts/WeeksFilterContext';
import { useToast } from '../../contexts/ToastContext';
import { useEntitlement } from '../../hooks/useEntitlement';
import { UpgradeModal } from '../UpgradeModal';

interface Props {
  campaignId: number;
  currency?: string;
}

interface ColumnData {
  id: string;
  label: string;
  hint?: string;
  metrics: CampaignAnalyticsItem | null;
}

type RowKey = 'adSales' | 'spend' | 'orders' | 'impressions' | 'clicks' | 'acos' | 'ctr' | 'cpc' | 'cvr' | 'roas';

const ROWS: RowKey[] = ['adSales', 'spend', 'orders', 'impressions', 'clicks', 'acos', 'ctr', 'cpc', 'cvr', 'roas'];

function daysAgo(n: number): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - n + 1);
  return { from: formatDate(from), to: formatDate(today) };
}

function acosTone(acos: number | null | undefined): string {
  if (acos == null || !Number.isFinite(acos) || acos <= 0) return 'text-zinc-500';
  if (acos > 100) return 'text-red-600';
  if (acos > 50) return 'text-amber-600';
  return 'text-emerald-600';
}

function cellValue(row: RowKey, m: CampaignAnalyticsItem | null, currency?: string): React.ReactNode {
  if (!m) return <span className="text-zinc-300">—</span>;
  switch (row) {
    case 'adSales':
      return fmtMoney(m.sales, currency);
    case 'spend':
      return fmtMoney(m.cost, currency);
    case 'orders':
      return fmtNumber(m.orders);
    case 'impressions':
      return fmtNumber(m.impressions);
    case 'clicks':
      return fmtNumber(m.clicks);
    case 'acos':
      return (
        <span className={acosTone(m.acos)}>
          {m.acos > 0 ? fmtPct(m.acos) : '—'}
        </span>
      );
    case 'ctr':
      return m.ctr > 0 ? fmtPct(m.ctr, 2) : '—';
    case 'cpc':
      return m.cpc > 0 ? fmtMoney(m.cpc, currency) : '—';
    case 'cvr':
      return m.cr > 0 ? fmtPct(m.cr, 2) : '—';
    case 'roas': {
      const sales = Number(m.sales) || 0;
      const cost = Number(m.cost) || 0;
      if (cost <= 0) return '—';
      const roas = sales / cost;
      return `${roas.toFixed(2)}×`;
    }
  }
}

export const MultiPeriodMetricsTable: React.FC<Props> = ({ campaignId, currency }) => {
  const { t } = useTranslation('campaigns');
  const { t: tCommon } = useTranslation('common');
  const toast = useToast();
  const { weeksCount } = useWeeksFilter();
  const [columns, setColumns] = useState<ColumnData[] | null>(null);
  const [loading, setLoading] = useState(true);
  // Phase K: Pro feature. Locked-state — короткий placeholder + upgrade-CTA.
  const ent = useEntitlement('analytics.multi_period_metrics');
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const weekRanges: WeekRange[] = useMemo(
    () => getFullWeeksDateRange(weeksCount),
    [weeksCount],
  );

  useEffect(() => {
    // Skip fetch когда locked — экономим вызов backend'а.
    if (!ent.on) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const sixty = daysAgo(60);
    const thirty = daysAgo(30);

    const tasks: Array<Promise<ColumnData>> = [];
    tasks.push(
      metricsApi
        .campaignMetrics(campaignId, { from: sixty.from, to: sixty.to })
        .then((m) => ({
          id: '60d',
          label: t('details.multiPeriod.th.60d'),
          hint: `${sixty.from} → ${sixty.to}`,
          metrics: m,
        })),
    );
    tasks.push(
      metricsApi
        .campaignMetrics(campaignId, { from: thirty.from, to: thirty.to })
        .then((m) => ({
          id: '30d',
          label: t('details.multiPeriod.th.30d'),
          hint: `${thirty.from} → ${thirty.to}`,
          metrics: m,
        })),
    );
    weekRanges.forEach((wr) => {
      tasks.push(
        metricsApi
          .campaignMetrics(campaignId, { from: wr.from, to: wr.to })
          .then((m) => ({
            id: `W${wr.index}`,
            label: t('details.multiPeriod.th.weekN', { n: wr.index }),
            hint: t('details.multiPeriod.th.weekRange', { from: wr.from, to: wr.to }),
            metrics: m,
          })),
      );
    });

    Promise.allSettled(tasks).then((settled) => {
      if (cancelled) return;
      const cols: ColumnData[] = settled.map((res, i) => {
        if (res.status === 'fulfilled') return res.value;
        const fallbackId =
          i === 0 ? '60d' : i === 1 ? '30d' : `W${weekRanges[i - 2]?.index ?? i}`;
        return { id: fallbackId, label: fallbackId, metrics: null };
      });
      setColumns(cols);
      const failed = settled.filter((r) => r.status === 'rejected');
      if (failed.length > 0 && failed.length === settled.length) {
        const reason = (failed[0] as PromiseRejectedResult).reason;
        toast.error(reason instanceof ApiError ? reason.message : t('details.errors.loadFailed'));
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [campaignId, weekRanges, ent.on]);

  if (!ent.on) {
    return (
      <Card
        title={t('details.multiPeriod.title')}
        bodyClassName="px-5 py-4"
        rightSlot={
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-violet-100 text-violet-700">
            <Lock size={10} />
            {ent.tierRequired === 'business'
              ? tCommon('entitlements.lockedBadgeBusiness')
              : tCommon('entitlements.lockedBadge')}
          </span>
        }
      >
        <div
          data-testid="multi-period-locked"
          className="flex flex-col items-center justify-center gap-3 py-10 text-sm bg-gradient-to-b from-violet-50/40 to-transparent rounded-md"
        >
          <Sparkles size={20} className="text-violet-500" />
          <div className="text-center max-w-sm">
            <div className="text-zinc-900 font-medium mb-1">
              {tCommon('entitlements.nudge.title')}
            </div>
            <div className="text-xs text-zinc-600">
              {t('details.multiPeriod.title')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUpgradeOpen(true)}
            data-testid="multi-period-upgrade-cta"
            className="h-8 px-3 rounded-md text-xs font-medium bg-violet-600 text-white hover:bg-violet-700"
          >
            {tCommon('entitlements.nudge.cta')}
          </button>
        </div>
        <UpgradeModal
          open={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          triggeredBy="analytics.multi_period_metrics"
          recommendedTier={ent.tierRequired}
        />
      </Card>
    );
  }

  return (
    <Card title={t('details.multiPeriod.title')} bodyClassName="px-0 py-0">
      {loading && !columns ? (
        <div className="px-5 py-4">
          <LoadingRow />
        </div>
      ) : !columns || columns.length === 0 ? (
        <div className="px-5 py-6 text-sm text-zinc-400">
          {t('details.multiPeriod.empty')}
        </div>
      ) : (
        <div className="overflow-x-auto" data-testid="multi-period-table">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide bg-zinc-50">
                <th className="text-left px-4 py-2 sticky left-0 bg-zinc-50 z-10 font-medium">
                  {t('details.multiPeriod.th.metric')}
                </th>
                {columns.map((c) => (
                  <th
                    key={c.id}
                    className="text-right px-3 py-2 font-medium whitespace-nowrap"
                    title={c.hint}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row} className="border-t border-zinc-100">
                  <td className="text-left px-4 py-2 text-xs text-zinc-700 sticky left-0 bg-white z-10">
                    {t(`details.multiPeriod.rows.${row}` as 'details.multiPeriod.rows.adSales')}
                  </td>
                  {columns.map((c) => (
                    <td
                      key={c.id}
                      className="text-right px-3 py-2 text-xs text-zinc-900 tabular-nums whitespace-nowrap"
                    >
                      {cellValue(row, c.metrics, currency)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
