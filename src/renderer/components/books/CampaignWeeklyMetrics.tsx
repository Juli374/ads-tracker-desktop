import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import {
  metricsApi,
  type WeeklySummary,
  type WeeklySummaryMetric,
} from '../../api/metrics';
import { fmtMoney, fmtNumber, fmtPct } from '../../lib/format';
import { EmptyState, LoadingRow } from '../ui';

// Phase J.5 Lane E — Weekly metrics table for a book / asin drill.
// Layout is transposed vs. the daily view:
//   - columns = weeks (newest → oldest)
//   - rows    = metrics (Spend, Sales, Orders, ACOS, ROI, Royalty)
//
// The rationale is that on the Books drill the user is comparing a few
// metrics across many weeks — pivoting the table makes weeks scannable
// horizontally (one row per metric, weekly trend reads left-to-right).
//
// Backend contract: GET /api/metrics/summary/weekly?book_ids[]=X
//   → { date_from, date_to, attribution_window, weekly: WeeklySummaryMetric[] }
//
// If a future backend deploy exposes a per-asin variant we can switch to
// `/api/metrics/weekly?asin_id=X` here without touching callers — both
// shapes return `weekly: WeeklySummaryMetric[]`.

interface Props {
  /** Book id is the primary lookup (summary endpoint accepts book_ids[]). */
  bookId?: number;
  /** Optional ASIN id — preferred when backend supports per-asin weekly. */
  asinId?: number;
  /** Weeks to fetch (default 8). Caller can override e.g. 4/12. */
  weeks?: number;
  /** Marketplace filter (optional). */
  marketplace?: string;
  /** Currency for money cells. Defaults to USD. */
  currency?: string;
}

type MetricKey = 'spend' | 'sales' | 'orders' | 'acos' | 'roi' | 'royalty';

const METRIC_ORDER: MetricKey[] = [
  'spend',
  'sales',
  'orders',
  'acos',
  'roi',
  'royalty',
];

export const CampaignWeeklyMetrics: React.FC<Props> = ({
  bookId,
  asinId,
  weeks = 8,
  marketplace,
  currency = 'USD',
}) => {
  const { t } = useTranslation('books');
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compute the window: today → today - weeks*7 days. Pinned to UTC dates so
  // the test environment (TZ=UTC, see vitest.config.ts) and the backend
  // (which uses ISO weeks) line up.
  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - weeks * 7);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { from: fmt(from), to: fmt(to) };
  }, [weeks]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    metricsApi
      .summaryWeekly({
        from: range.from,
        to: range.to,
        attribution: '7d',
        bookIds: bookId != null ? [bookId] : undefined,
        marketplaces: marketplace ? [marketplace] : undefined,
      })
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : t('weekly.loadFailed'),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // asinId is included for forward-compat — currently no per-asin endpoint
    // is wired in; if/when it lands we'll branch on asinId here.
  }, [range.from, range.to, bookId, asinId, marketplace, t]);

  if (loading) {
    return (
      <div data-testid="campaign-weekly-metrics">
        <LoadingRow />
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="campaign-weekly-metrics">
        <EmptyState title={error} />
      </div>
    );
  }

  if (!summary || summary.weekly.length === 0) {
    return (
      <div data-testid="campaign-weekly-metrics">
        <EmptyState title={t('weekly.empty')} />
      </div>
    );
  }

  // Newest → oldest so the most recent week is the first column (the eye
  // lands left-most). `weekly` is loosely sorted from backend; sort defensively.
  const weeksSorted = [...summary.weekly].sort(
    (a, b) =>
      new Date(b.week_start).getTime() - new Date(a.week_start).getTime(),
  );

  const formatCell = (
    metric: MetricKey,
    week: WeeklySummaryMetric,
  ): string => {
    switch (metric) {
      case 'spend':
        return fmtMoney(week.spend, currency);
      case 'sales':
        return fmtMoney(week.sales, currency);
      case 'orders':
        return fmtNumber(week.orders);
      case 'acos':
        return week.acos > 0 ? fmtPct(week.acos) : '—';
      case 'roi':
        return week.roi > 0 ? fmtPct(week.roi) : '—';
      case 'royalty':
        return fmtMoney(week.royalty ?? 0, currency);
    }
  };

  // ACOS over 100 reads red; ROI < 0 also reads red. Other metrics neutral.
  const cellTone = (metric: MetricKey, week: WeeklySummaryMetric): string => {
    if (metric === 'acos' && week.acos > 100) return 'text-red-600';
    if (metric === 'roi' && week.roi < 0) return 'text-red-600';
    return 'text-zinc-900';
  };

  return (
    <div data-testid="campaign-weekly-metrics" className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
            <th className="text-left px-4 py-2 font-medium sticky left-0 bg-white z-10">
              {t('weekly.rowLabel')}
            </th>
            {weeksSorted.map((w) => (
              <th
                key={w.week_start}
                className="text-right px-3 py-2 font-medium tabular-nums"
              >
                {/* Compact "MM-DD" label keeps the header narrow at 8+ cols. */}
                {w.week_start.slice(5)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRIC_ORDER.map((metric) => (
            <tr
              key={metric}
              className="border-t border-zinc-100 hover:bg-zinc-50/60"
              data-testid={`weekly-row-${metric}`}
            >
              <td className="px-4 py-2.5 text-xs font-medium text-zinc-700 sticky left-0 bg-white z-10">
                {t(`weekly.metric.${metric}` as 'weekly.metric.spend')}
              </td>
              {weeksSorted.map((w) => (
                <td
                  key={`${w.week_start}-${metric}`}
                  className={`px-3 py-2.5 text-xs text-right tabular-nums ${cellTone(metric, w)}`}
                >
                  {formatCell(metric, w)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
