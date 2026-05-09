import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { ApiError } from '../api/client';
import {
  metricsApi,
  type BookMetric,
  type BookSummary,
} from '../api/metrics';
import {
  ActiveFiltersBar,
  Card,
  EmptyState,
  ErrorBanner,
  Kpi,
  LoadingRow,
  PageHeader,
} from '../components/ui';
import { dateRangeFor, RangeId } from '../lib/dateRange';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { useToast } from '../contexts/ToastContext';
import {
  useGlobalFilters,
  useGlobalFilterChips,
} from '../contexts/GlobalFiltersContext';
import { useBooks } from '../contexts/BooksContext';

const RANGE_OPTIONS: Array<{ id: RangeId; label: string }> = [
  { id: '7d', label: '7 дней' },
  { id: '30d', label: '30 дней' },
  { id: '90d', label: '90 дней' },
  { id: 'mtd', label: 'MTD' },
  { id: 'ytd', label: 'YTD' },
];

interface PeriodTotals {
  cost: number;
  sales: number;
  orders: number;
  clicks: number;
  acos: number;
}

const totalsOf = (sum: BookSummary | null): PeriodTotals => {
  if (!sum) return { cost: 0, sales: 0, orders: 0, clicks: 0, acos: 0 };
  const acc = sum.books.reduce(
    (a, b) => ({
      cost: a.cost + (b.cost || 0),
      sales: a.sales + (b.sales || 0),
      orders: a.orders + (b.orders || 0),
      clicks: a.clicks + (b.clicks || 0),
    }),
    { cost: 0, sales: 0, orders: 0, clicks: 0 },
  );
  return {
    ...acc,
    acos: acc.sales > 0 ? (acc.cost / acc.sales) * 100 : 0,
  };
};

// Возвращает % изменения. Если before=0 — null (не определено).
const pctDelta = (after: number, before: number): number | null => {
  if (!Number.isFinite(before) || before === 0) return null;
  return ((after - before) / before) * 100;
};

export const ComparisonPage: React.FC = () => {
  const toast = useToast();
  const { filters: globalFilters } = useGlobalFilters();
  const { list: booksList } = useBooks();
  const chips = useGlobalFilterChips(booksList);

  const [rangeA, setRangeA] = useState<RangeId>('30d');
  const [rangeB, setRangeB] = useState<RangeId>('7d');
  const [sumA, setSumA] = useState<BookSummary | null>(null);
  const [sumB, setSumB] = useState<BookSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const aRange = useMemo(() => dateRangeFor(rangeA), [rangeA]);
  const bRange = useMemo(() => dateRangeFor(rangeB), [rangeB]);

  const filterParams = useMemo(
    () => ({
      attribution: '7d' as const,
      marketplaces: globalFilters.marketplaces.length ? globalFilters.marketplaces : undefined,
      bookIds: globalFilters.bookId != null ? [globalFilters.bookId] : undefined,
      accounts: globalFilters.accounts.length ? globalFilters.accounts : undefined,
    }),
    [globalFilters.marketplaces, globalFilters.bookId, globalFilters.accounts],
  );

  const load = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const [a, b] = await Promise.all([
          metricsApi.summaryByBook({ ...filterParams, ...aRange }),
          metricsApi.summaryByBook({ ...filterParams, ...bRange }),
        ]);
        setSumA(a);
        setSumB(b);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Не удалось загрузить сравнение');
      } finally {
        setLoading(false);
      }
    },
    [filterParams, aRange.from, aRange.to, bRange.from, bRange.to, toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  const totalsA = useMemo(() => totalsOf(sumA), [sumA]);
  const totalsB = useMemo(() => totalsOf(sumB), [sumB]);

  // Per-book сравнение: индексируем книги периода A и B по book_id+marketplace.
  const perBook = useMemo(() => {
    const key = (b: BookMetric) => `${b.book_id}-${b.marketplace ?? ''}`;
    const aMap = new Map<string, BookMetric>();
    const bMap = new Map<string, BookMetric>();
    sumA?.books.forEach((b) => aMap.set(key(b), b));
    sumB?.books.forEach((b) => bMap.set(key(b), b));
    const allKeys = new Set([...aMap.keys(), ...bMap.keys()]);
    return Array.from(allKeys)
      .map((k) => {
        const a = aMap.get(k);
        const b = bMap.get(k);
        // По построению allKeys, хотя бы один из (a, b) — defined.
        const meta = a ?? b;
        if (!meta) return null;
        return {
          key: k,
          book_id: meta.book_id,
          title: meta.title,
          cover_image: meta.cover_image,
          marketplace: meta.marketplace,
          spendA: a?.cost ?? 0,
          spendB: b?.cost ?? 0,
          salesA: a?.sales ?? 0,
          salesB: b?.sales ?? 0,
          ordersA: a?.orders ?? 0,
          ordersB: b?.orders ?? 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((x, y) => Math.abs(y.spendB - y.spendA) - Math.abs(x.spendB - x.spendA))
      .slice(0, 50);
  }, [sumA, sumB]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Сравнение"
        subtitle={
          sumA && sumB
            ? `${aRange.from} → ${aRange.to}  vs  ${bRange.from} → ${bRange.to}`
            : 'Загрузка…'
        }
        rightSlot={
          <div className="flex items-center gap-2">
            <PeriodSelect label="A" value={rangeA} onChange={setRangeA} />
            <span className="text-zinc-300">vs</span>
            <PeriodSelect label="B" value={rangeB} onChange={setRangeB} />
          </div>
        }
      />

      <ActiveFiltersBar chips={chips} />

      {rangeA === rangeB && (
        <ErrorBanner message="Период A и B одинаковые — выберите разные диапазоны." />
      )}

      <div className="grid grid-cols-4 gap-3">
        <DeltaKpi
          label="Spend"
          a={totalsA.cost}
          b={totalsB.cost}
          fmt={(n) => fmtMoney(n)}
          inverse
          loading={loading && !sumA}
        />
        <DeltaKpi
          label="Sales"
          a={totalsA.sales}
          b={totalsB.sales}
          fmt={(n) => fmtMoney(n)}
          loading={loading && !sumA}
        />
        <DeltaKpi
          label="Orders"
          a={totalsA.orders}
          b={totalsB.orders}
          fmt={(n) => fmtNumber(n)}
          loading={loading && !sumA}
        />
        <DeltaKpi
          label="ACOS"
          a={totalsA.acos}
          b={totalsB.acos}
          fmt={(n) => fmtPct(n)}
          inverse
          loading={loading && !sumA}
        />
      </div>

      <Card title="По книгам — top 50 по абсолютной разнице Spend">
        {loading && !sumA ? (
          <LoadingRow />
        ) : perBook.length === 0 ? (
          <EmptyState title="Нет данных" />
        ) : (
          <table className="w-full text-sm table-sticky-head">
            <thead>
              <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2 font-medium">Книга</th>
                <th className="text-left px-3 py-2 font-medium">MP</th>
                <th className="text-right px-3 py-2 font-medium">Spend A</th>
                <th className="text-right px-3 py-2 font-medium">Spend B</th>
                <th className="text-right px-3 py-2 font-medium">Δ Spend</th>
                <th className="text-right px-3 py-2 font-medium">Sales A</th>
                <th className="text-right px-3 py-2 font-medium">Sales B</th>
                <th className="text-right px-3 py-2 font-medium">Δ Sales</th>
                <th className="text-right px-5 py-2 font-medium">Δ Orders</th>
              </tr>
            </thead>
            <tbody>
              {perBook.map((r) => (
                <tr key={r.key} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {r.cover_image ? (
                        <img
                          src={r.cover_image}
                          alt=""
                          className="w-6 h-8 object-cover rounded-sm border border-zinc-200 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-6 h-8 rounded-sm bg-zinc-100 border border-zinc-200 flex-shrink-0" />
                      )}
                      <div className="text-xs text-zinc-900 truncate max-w-md">{r.title}</div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-zinc-600 uppercase">
                    {r.marketplace || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
                    {fmtMoney(r.spendA)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
                    {fmtMoney(r.spendB)}
                  </td>
                  <Cell delta={pctDelta(r.spendB, r.spendA)} inverse />
                  <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
                    {fmtMoney(r.salesA)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
                    {fmtMoney(r.salesB)}
                  </td>
                  <Cell delta={pctDelta(r.salesB, r.salesA)} />
                  <Cell delta={pctDelta(r.ordersB, r.ordersA)} last />
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

const PeriodSelect: React.FC<{
  label: string;
  value: RangeId;
  onChange: (v: RangeId) => void;
}> = ({ label, value, onChange }) => (
  <div className="flex items-center gap-1">
    <span className="text-[10px] font-semibold text-zinc-500 uppercase">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as RangeId)}
      className="
        h-7 pl-2 pr-7 text-xs rounded-md cursor-pointer
        border border-zinc-200 bg-white text-zinc-700
        focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
      "
      aria-label={`Период ${label}`}
    >
      {RANGE_OPTIONS.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
);

const DeltaKpi: React.FC<{
  label: string;
  a: number;
  b: number;
  fmt: (n: number) => string;
  inverse?: boolean;
  loading?: boolean;
}> = ({ label, a, b, fmt, inverse, loading }) => {
  const delta = pctDelta(b, a);
  const isUp = delta != null && delta > 0;
  const isPositive = inverse ? !isUp : isUp;
  const color =
    delta == null || delta === 0
      ? 'text-zinc-400'
      : isPositive
      ? 'text-emerald-600'
      : 'text-red-600';
  const Icon = delta == null || delta === 0 ? Minus : isUp ? ArrowUp : ArrowDown;

  return (
    <Kpi
      label={label}
      loading={loading}
      value={
        <span className="flex items-baseline gap-2">
          {fmt(b)}
          <span className={`text-xs font-medium tabular-nums inline-flex items-center gap-0.5 ${color}`}>
            <Icon size={11} />
            {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
          </span>
        </span>
      }
      hint={`A: ${fmt(a)}`}
    />
  );
};

const Cell: React.FC<{ delta: number | null; inverse?: boolean; last?: boolean }> = ({
  delta,
  inverse,
  last,
}) => {
  const isUp = delta != null && delta > 0;
  const isPositive = inverse ? !isUp : isUp;
  const color =
    delta == null || delta === 0
      ? 'text-zinc-400'
      : isPositive
      ? 'text-emerald-600'
      : 'text-red-600';
  return (
    <td className={`${last ? 'px-5' : 'px-3'} py-2.5 text-xs text-right tabular-nums ${color}`}>
      {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
    </td>
  );
};
