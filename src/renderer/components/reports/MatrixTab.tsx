import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, EmptyState, LoadingRow } from '../ui';
import { metricsApi, type BookMetric } from '../../api/metrics';
import { ApiError } from '../../api/client';
import { fmtMoney, fmtNumber, fmtPct } from '../../lib/format';

type MatrixMetric = 'spend' | 'sales' | 'orders' | 'acos';

interface Props {
  from: string;
  to: string;
  attribution: '7d' | '14d' | '30d' | '1d';
  marketplaces?: string[];
  bookIds?: number[];
  accounts?: string[];
}

interface MatrixCellMap {
  // bookId → marketplace → BookMetric
  [bookId: string]: { [mp: string]: BookMetric };
}

function metricValue(row: BookMetric | undefined, m: MatrixMetric): number {
  if (!row) return 0;
  switch (m) {
    case 'spend':
      return row.cost ?? 0;
    case 'sales':
      return row.sales ?? 0;
    case 'orders':
      return row.orders ?? 0;
    case 'acos':
      return row.acos ?? 0;
  }
}

function formatCell(value: number, metric: MatrixMetric): React.ReactNode {
  if (metric === 'orders') return value === 0 ? '—' : fmtNumber(value);
  if (metric === 'acos') {
    if (value <= 0) return '—';
    return (
      <span className={value > 100 ? 'text-red-600' : value > 50 ? 'text-amber-600' : ''}>
        {fmtPct(value)}
      </span>
    );
  }
  return value === 0 ? '—' : fmtMoney(value);
}

export const MatrixTab: React.FC<Props> = ({
  from,
  to,
  attribution,
  marketplaces,
  bookIds,
  accounts,
}) => {
  const { t } = useTranslation('reports');
  const [books, setBooks] = useState<BookMetric[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<MatrixMetric>('spend');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    metricsApi
      .summaryByBook({ from, to, attribution, marketplaces, bookIds, accounts })
      .then((res) => {
        if (!cancelled) setBooks(Array.isArray(res.books) ? res.books : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : t('matrix.loadFailed'));
        setBooks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, attribution, marketplaces, bookIds, accounts]);

  const { byBook, bookIdsOrdered, mpsOrdered } = useMemo(() => {
    const map: MatrixCellMap = {};
    const titles = new Map<number, string>();
    const mpSet = new Set<string>();
    (books ?? []).forEach((b) => {
      const id = String(b.book_id);
      if (!map[id]) map[id] = {};
      const mp = (b.marketplace ?? '').toUpperCase() || '—';
      map[id][mp] = b;
      mpSet.add(mp);
      if (!titles.has(b.book_id)) titles.set(b.book_id, b.title);
    });

    // Order books by total spend desc.
    const totalsByBook = Object.entries(map).map(([id, perMp]) => {
      const total = Object.values(perMp).reduce((sum, r) => sum + (r.cost ?? 0), 0);
      return [id, total] as const;
    });
    totalsByBook.sort((a, b) => b[1] - a[1]);

    return {
      byBook: map,
      bookTitles: titles,
      bookIdsOrdered: totalsByBook.map(([id]) => id),
      mpsOrdered: Array.from(mpSet).sort(),
    };
  }, [books]);

  const titleByBookId = useMemo(() => {
    const m = new Map<string, string>();
    (books ?? []).forEach((b) => m.set(String(b.book_id), b.title));
    return m;
  }, [books]);

  return (
    <Card
      title={t('matrix.title')}
      bodyClassName="px-0 py-0"
      rightSlot={
        <div className="inline-flex items-center bg-white border border-zinc-200 rounded-md p-0.5">
          {(['spend', 'sales', 'orders', 'acos'] as MatrixMetric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              data-testid={`matrix-metric-${m}`}
              className={`
                px-2.5 h-6 text-[11px] font-medium rounded transition-colors
                ${metric === m
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'text-zinc-500 hover:text-zinc-900'}
              `}
            >
              {t(`matrix.metric.${m}` as 'matrix.metric.spend')}
            </button>
          ))}
        </div>
      }
    >
      {loading && !books ? (
        <div className="px-5 py-4">
          <LoadingRow />
        </div>
      ) : error ? (
        <div className="px-5 py-4 text-sm text-red-600">{error}</div>
      ) : !books || bookIdsOrdered.length === 0 ? (
        <EmptyState title={t('matrix.empty')} />
      ) : (
        <div className="overflow-x-auto" data-testid="reports-matrix-table">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide bg-zinc-50">
                <th className="text-left px-4 py-2 sticky left-0 bg-zinc-50 z-10 font-medium">
                  {t('matrix.th.book')}
                </th>
                {mpsOrdered.map((mp) => (
                  <th key={mp} className="text-right px-3 py-2 font-medium">
                    {mp}
                  </th>
                ))}
                <th className="text-right px-3 py-2 font-medium border-l border-zinc-200">
                  {t('matrix.th.total')}
                </th>
              </tr>
            </thead>
            <tbody>
              {bookIdsOrdered.map((bookId) => {
                const row = byBook[bookId];
                const title = titleByBookId.get(bookId) ?? '—';
                let total = 0;
                let totalSales = 0;
                mpsOrdered.forEach((mp) => {
                  total += metricValue(row[mp], metric);
                  totalSales += metricValue(row[mp], 'sales');
                });
                const totalDisplay =
                  metric === 'acos'
                    ? totalSales > 0
                      ? (mpsOrdered.reduce(
                          (acc, mp) => acc + (row[mp]?.cost ?? 0),
                          0,
                        ) /
                          totalSales) *
                        100
                      : 0
                    : total;
                return (
                  <tr key={bookId} className="border-t border-zinc-100">
                    <td className="text-left px-4 py-2 text-xs text-zinc-900 sticky left-0 bg-white z-10 truncate max-w-xs">
                      {title}
                    </td>
                    {mpsOrdered.map((mp) => (
                      <td
                        key={mp}
                        className="text-right px-3 py-2 text-xs text-zinc-900 tabular-nums whitespace-nowrap"
                      >
                        {formatCell(metricValue(row[mp], metric), metric)}
                      </td>
                    ))}
                    <td className="text-right px-3 py-2 text-xs text-zinc-900 tabular-nums whitespace-nowrap font-medium border-l border-zinc-200">
                      {formatCell(totalDisplay, metric)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
