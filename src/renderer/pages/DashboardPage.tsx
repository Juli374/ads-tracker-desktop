import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { metricsApi, BookSummary, BookMetric } from '../api/metrics';
import { ApiError } from '../api/client';

type Range = '7d' | '30d' | 'mtd';

interface RangeOption {
  id: Range;
  label: string;
  days: number;
}

const RANGES: RangeOption[] = [
  { id: '7d', label: '7 дней', days: 7 },
  { id: '30d', label: '30 дней', days: 30 },
  { id: 'mtd', label: 'MTD', days: -1 },
];

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dateRangeFor(range: Range): { from: string; to: string } {
  const today = new Date();
  const to = formatDate(today);
  if (range === 'mtd') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: formatDate(first), to };
  }
  const opt = RANGES.find((r) => r.id === range)!;
  const from = new Date(today);
  from.setDate(from.getDate() - opt.days + 1);
  return { from: formatDate(from), to };
}

// Backend возвращает currency как символ ($, €, £, ¥), не ISO-код.
// ISO_TO_SYMBOL для случая когда придёт код вроде "USD".
const ISO_TO_SYMBOL: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'A$', INR: '₹',
};

const fmtNumber = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);

const fmtMoney = (n: number, currency?: string) => {
  const symbol = currency
    ? ISO_TO_SYMBOL[currency.toUpperCase()] ?? currency
    : '$';
  const sign = n < 0 ? '-' : '';
  return `${sign}${symbol}${fmtNumber(Math.abs(n))}`;
};

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export const DashboardPage: React.FC = () => {
  const [range, setRange] = useState<Range>('7d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BookSummary | null>(null);

  const { from, to } = useMemo(() => dateRangeFor(range), [range]);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await metricsApi.summaryByBook({ from, to, attribution: '7d' });
        setSummary(data);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить данные';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [from, to],
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
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Обзор</h1>
          <p className="text-sm text-zinc-500">
            {summary
              ? `${summary.date_from} → ${summary.date_to} · окно атрибуции ${summary.attribution_window}`
              : 'Загрузка…'}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="inline-flex items-center bg-white border border-zinc-200 rounded-md p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`
                  px-2.5 h-7 text-xs font-medium rounded
                  transition-colors
                  ${range === r.id
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-900'}
                `}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => load()}
            className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
            title="Обновить"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      ) : null}

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-3">
        <Kpi label="Spend" value={totals ? fmtMoney(totals.cost) : '—'} loading={loading} />
        <Kpi label="Sales" value={totals ? fmtMoney(totals.sales) : '—'} loading={loading} />
        <Kpi label="ACOS" value={totals ? fmtPct(totals.acos) : '—'} loading={loading} />
        <Kpi label="TACoS" value={totals ? fmtPct(totals.tacos) : '—'} loading={loading} />
      </div>

      {/* Books table */}
      <div className="bg-white border border-zinc-200 rounded-lg shadow-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-900">Книги</div>
          <div className="text-xs text-zinc-500">
            {summary ? `${summary.books.length} всего` : null}
          </div>
        </div>

        {loading && !summary ? (
          <div className="px-5 py-12 flex items-center justify-center">
            <Loader2 size={16} className="animate-spin text-zinc-400" />
          </div>
        ) : !summary || summary.books.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <div className="text-sm text-zinc-500">Нет данных за выбранный период.</div>
          </div>
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
      </div>
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: string; loading: boolean }> = ({
  label,
  value,
  loading,
}) => (
  <div className="bg-white border border-zinc-200 rounded-lg p-4 shadow-soft">
    <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</div>
    <div className="mt-2 text-2xl font-semibold text-zinc-900 tabular-nums">
      {loading && value === '—' ? <span className="text-zinc-300">—</span> : value}
    </div>
  </div>
);

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
    <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">{book.orders}</td>
    <td className="px-5 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
      {book.tacos != null && book.tacos > 0 ? fmtPct(book.tacos) : '—'}
    </td>
  </tr>
);
