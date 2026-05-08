import React, { useEffect, useMemo, useState } from 'react';
import { metricsApi, BookSummary, BookMetric } from '../api/metrics';
import { ApiError } from '../api/client';
import {
  Card,
  Kpi,
  PageHeader,
  RangePicker,
  EmptyState,
  LoadingRow,
} from '../components/ui';
import { dateRangeFor, RangeId } from '../lib/dateRange';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { useToast } from '../contexts/ToastContext';

export const DashboardPage: React.FC = () => {
  const toast = useToast();
  const [range, setRange] = useState<RangeId>('7d');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<BookSummary | null>(null);

  const { from, to } = useMemo(() => dateRangeFor(range), [range]);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const data = await metricsApi.summaryByBook({ from, to, attribution: '7d' });
        setSummary(data);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Не удалось загрузить данные');
      } finally {
        setLoading(false);
      }
    },
    [from, to, toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    if (!summary) return null;
    const acc = summary.books.reduce(
      (a, b) => ({
        cost: a.cost + (b.cost || 0),
        sales: a.sales + (b.sales || 0),
        royalty: a.royalty + (b.royalty || 0),
        orders: a.orders + (b.orders || 0),
        clicks: a.clicks + (b.clicks || 0),
      }),
      { cost: 0, sales: 0, royalty: 0, orders: 0, clicks: 0 },
    );
    const acos = acc.sales > 0 ? (acc.cost / acc.sales) * 100 : 0;
    const tacos = acc.royalty > 0 ? (acc.cost / acc.royalty) * 100 : 0;
    return { ...acc, acos, tacos };
  }, [summary]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Обзор"
        subtitle={
          summary
            ? `${summary.date_from} → ${summary.date_to} · окно атрибуции ${summary.attribution_window}`
            : 'Загрузка…'
        }
        rightSlot={
          <RangePicker
            value={range}
            onChange={setRange}
            onRefresh={() => load()}
            refreshing={loading}
            autoRefresh={{ storageKey: 'auto-refresh-dashboard' }}
          />
        }
      />

      <div className="grid grid-cols-4 gap-3">
        <Kpi label="Spend" value={totals ? fmtMoney(totals.cost) : '—'} loading={loading} />
        <Kpi label="Sales" value={totals ? fmtMoney(totals.sales) : '—'} loading={loading} />
        <Kpi
          label="ACOS"
          value={totals ? fmtPct(totals.acos) : '—'}
          loading={loading}
          tone={totals && totals.acos > 100 ? 'negative' : 'default'}
        />
        <Kpi label="TACoS" value={totals ? fmtPct(totals.tacos) : '—'} loading={loading} />
      </div>

      <Card
        title="Книги"
        rightSlot={
          <div className="text-xs text-zinc-500">
            {summary ? `${summary.books.length} всего` : null}
          </div>
        }
      >
        {loading && !summary ? (
          <LoadingRow />
        ) : !summary || summary.books.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2 font-medium">Книга</th>
                <th className="text-left px-3 py-2 font-medium">MP</th>
                <th className="text-right px-3 py-2 font-medium">Spend</th>
                <th className="text-right px-3 py-2 font-medium">Sales</th>
                <th className="text-right px-3 py-2 font-medium">ACOS</th>
                <th className="text-right px-3 py-2 font-medium">Orders</th>
                <th className="text-right px-5 py-2 font-medium">TACoS</th>
              </tr>
            </thead>
            <tbody>
              {[...summary.books]
                .sort((a, b) => b.cost - a.cost)
                .map((b) => (
                  <BookRow key={`${b.book_id}-${b.marketplace}`} book={b} />
                ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

const BookRow: React.FC<{ book: BookMetric }> = ({ book }) => (
  <tr className="border-t border-zinc-100 hover:bg-zinc-50/60">
    <td className="px-5 py-2.5">
      <div className="flex items-center gap-2.5">
        {book.cover_image ? (
          <img
            src={book.cover_image}
            alt=""
            className="w-7 h-9 object-cover rounded-sm border border-zinc-200 flex-shrink-0"
          />
        ) : (
          <div className="w-7 h-9 rounded-sm bg-zinc-100 border border-zinc-200 flex-shrink-0" />
        )}
        <div className="text-xs text-zinc-900 truncate max-w-md">{book.title}</div>
      </div>
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-600 uppercase">{book.marketplace || '—'}</td>
    <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
      {fmtMoney(book.cost, book.currency)}
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
      {fmtMoney(book.sales, book.currency)}
    </td>
    <td className="px-3 py-2.5 text-xs text-right tabular-nums">
      <span className={book.acos > 100 ? 'text-red-600' : 'text-zinc-700'}>
        {book.acos > 0 ? fmtPct(book.acos) : '—'}
      </span>
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
      {fmtNumber(book.orders)}
    </td>
    <td className="px-5 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
      {book.tacos != null && book.tacos > 0 ? fmtPct(book.tacos) : '—'}
    </td>
  </tr>
);
