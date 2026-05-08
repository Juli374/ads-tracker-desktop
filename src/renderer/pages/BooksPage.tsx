import React, { useEffect, useMemo, useState } from 'react';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { ApiError } from '../api/client';
import { metricsApi, BookMetric, BookSummary } from '../api/metrics';
import {
  PageHeader,
  RangePicker,
  Card,
  Kpi,
  EmptyState,
  LoadingRow,
} from '../components/ui';
import { dateRangeFor, RangeId } from '../lib/dateRange';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { useToast } from '../contexts/ToastContext';

interface BookGroup {
  book_id: number;
  title: string;
  cover_image: string | null;
  account: string | null;
  rows: BookMetric[];
  totals: {
    cost: number;
    sales: number;
    royalty: number;
    orders: number;
    clicks: number;
  };
  acos: number;
  tacos: number;
}

type SortKey = 'spend' | 'sales' | 'orders' | 'acos';

export const BooksPage: React.FC = () => {
  const toast = useToast();
  const [range, setRange] = useState<RangeId>('30d');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<BookSummary | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { from, to } = useMemo(() => dateRangeFor(range), [range]);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const data = await metricsApi.summaryByBook({
          from,
          to,
          attribution: '7d',
        });
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

  // Книги приходят разбиты по book_id × marketplace. Группируем.
  const groups = useMemo<BookGroup[]>(() => {
    if (!summary) return [];
    const byBook = new Map<number, BookGroup>();
    for (const row of summary.books) {
      let g = byBook.get(row.book_id);
      if (!g) {
        g = {
          book_id: row.book_id,
          title: row.title,
          cover_image: row.cover_image,
          account: row.account,
          rows: [],
          totals: { cost: 0, sales: 0, royalty: 0, orders: 0, clicks: 0 },
          acos: 0,
          tacos: 0,
        };
        byBook.set(row.book_id, g);
      }
      g.rows.push(row);
      g.totals.cost += row.cost || 0;
      g.totals.sales += row.sales || 0;
      g.totals.royalty += row.royalty || 0;
      g.totals.orders += row.orders || 0;
      g.totals.clicks += row.clicks || 0;
    }
    for (const g of byBook.values()) {
      g.acos = g.totals.sales > 0 ? (g.totals.cost / g.totals.sales) * 100 : 0;
      g.tacos =
        g.totals.royalty > 0 ? (g.totals.cost / g.totals.royalty) * 100 : 0;
      g.rows.sort((a, b) => b.cost - a.cost);
    }
    return [...byBook.values()];
  }, [summary]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? groups.filter((g) => g.title.toLowerCase().includes(q))
      : groups;
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'sales':
          return b.totals.sales - a.totals.sales;
        case 'orders':
          return b.totals.orders - a.totals.orders;
        case 'acos':
          return b.acos - a.acos;
        case 'spend':
        default:
          return b.totals.cost - a.totals.cost;
      }
    });
    return list;
  }, [groups, search, sortKey]);

  const totals = useMemo(() => {
    const acc = filtered.reduce(
      (a, g) => ({
        cost: a.cost + g.totals.cost,
        sales: a.sales + g.totals.sales,
        orders: a.orders + g.totals.orders,
        royalty: a.royalty + g.totals.royalty,
      }),
      { cost: 0, sales: 0, orders: 0, royalty: 0 },
    );
    return {
      ...acc,
      acos: acc.sales > 0 ? (acc.cost / acc.sales) * 100 : 0,
      tacos: acc.royalty > 0 ? (acc.cost / acc.royalty) * 100 : 0,
    };
  }, [filtered]);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Книги"
        subtitle={
          summary
            ? `${summary.date_from} → ${summary.date_to} · ${groups.length} ${
                groups.length === 1 ? 'книга' : 'книг'
              }`
            : 'Загрузка…'
        }
        rightSlot={
          <RangePicker
            value={range}
            onChange={setRange}
            onRefresh={() => load()}
            refreshing={loading}
          />
        }
      />

      <div className="grid grid-cols-4 gap-3">
        <Kpi label="Книг" value={fmtNumber(filtered.length)} loading={loading} />
        <Kpi label="Spend" value={fmtMoney(totals.cost)} loading={loading} />
        <Kpi label="Orders" value={fmtNumber(totals.orders)} loading={loading} />
        <Kpi
          label="ACOS"
          value={fmtPct(totals.acos)}
          loading={loading}
          tone={totals.acos > 100 ? 'negative' : 'default'}
        />
      </div>

      <Card
        title="По книгам"
        rightSlot={
          <div className="flex items-center gap-2">
            <SortControl value={sortKey} onChange={setSortKey} />
            <SearchInput value={search} onChange={setSearch} />
          </div>
        }
      >
        {loading && !summary ? (
          <LoadingRow />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? 'Ничего не нашлось.' : 'Нет данных за выбранный период.'}
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2 font-medium">Книга</th>
                <th className="text-left px-3 py-2 font-medium">MPs</th>
                <th className="text-right px-3 py-2 font-medium">Spend</th>
                <th className="text-right px-3 py-2 font-medium">Sales</th>
                <th className="text-right px-3 py-2 font-medium">Orders</th>
                <th className="text-right px-3 py-2 font-medium">ACOS</th>
                <th className="text-right px-5 py-2 font-medium">TACoS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <BookGroupRows
                  key={g.book_id}
                  group={g}
                  expanded={expanded.has(g.book_id)}
                  onToggle={() => toggle(g.book_id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

const BookGroupRows: React.FC<{
  group: BookGroup;
  expanded: boolean;
  onToggle: () => void;
}> = ({ group, expanded, onToggle }) => {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <>
      <tr
        className="border-t border-zinc-100 hover:bg-zinc-50/60 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-5 py-2.5">
          <div className="flex items-center gap-2.5">
            <Chevron size={14} className="text-zinc-400 flex-shrink-0" />
            {group.cover_image ? (
              <img
                src={group.cover_image}
                alt=""
                className="w-7 h-9 object-cover rounded-sm border border-zinc-200 flex-shrink-0"
              />
            ) : (
              <div className="w-7 h-9 rounded-sm bg-zinc-100 border border-zinc-200 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-xs text-zinc-900 truncate max-w-md">
                {group.title}
              </div>
              {group.account && (
                <div className="text-[10px] text-zinc-400 mt-0.5">{group.account}</div>
              )}
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs text-zinc-600 uppercase">
          {group.rows.length}
        </td>
        <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
          {fmtMoney(group.totals.cost)}
        </td>
        <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
          {fmtMoney(group.totals.sales)}
        </td>
        <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
          {group.totals.orders}
        </td>
        <td className="px-3 py-2.5 text-xs text-right tabular-nums">
          <span className={group.acos > 100 ? 'text-red-600' : 'text-zinc-700'}>
            {group.acos > 0 ? fmtPct(group.acos) : '—'}
          </span>
        </td>
        <td className="px-5 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
          {group.tacos > 0 ? fmtPct(group.tacos) : '—'}
        </td>
      </tr>
      {expanded &&
        group.rows.map((row) => (
          <tr
            key={`${row.book_id}-${row.marketplace}`}
            className="border-t border-zinc-100 bg-zinc-50/40"
          >
            <td className="pl-14 pr-5 py-2 text-[11px] text-zinc-600">
              <span className="font-mono uppercase">{row.marketplace || '—'}</span>
              {row.currency && (
                <span className="ml-2 text-zinc-400">{row.currency}</span>
              )}
            </td>
            <td className="px-3 py-2 text-[11px] text-zinc-400">—</td>
            <td className="px-3 py-2 text-[11px] text-zinc-700 text-right tabular-nums">
              {fmtMoney(row.cost, row.currency)}
            </td>
            <td className="px-3 py-2 text-[11px] text-zinc-700 text-right tabular-nums">
              {fmtMoney(row.sales, row.currency)}
            </td>
            <td className="px-3 py-2 text-[11px] text-zinc-600 text-right tabular-nums">
              {row.orders}
            </td>
            <td className="px-3 py-2 text-[11px] text-right tabular-nums">
              <span className={row.acos > 100 ? 'text-red-600' : 'text-zinc-600'}>
                {row.acos > 0 ? fmtPct(row.acos) : '—'}
              </span>
            </td>
            <td className="px-5 py-2 text-[11px] text-zinc-600 text-right tabular-nums">
              {row.tacos != null && row.tacos > 0 ? fmtPct(row.tacos) : '—'}
            </td>
          </tr>
        ))}
    </>
  );
};

const SearchInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({
  value,
  onChange,
}) => (
  <div className="relative">
    <Search
      size={12}
      className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400"
    />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Поиск…"
      className="
        w-44 h-7 pl-7 pr-2 text-xs rounded-md
        border border-zinc-200 bg-white
        text-zinc-900 placeholder:text-zinc-400
        focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
      "
    />
  </div>
);

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'spend', label: 'Spend' },
  { value: 'sales', label: 'Sales' },
  { value: 'orders', label: 'Orders' },
  { value: 'acos', label: 'ACOS' },
];

const SortControl: React.FC<{
  value: SortKey;
  onChange: (v: SortKey) => void;
}> = ({ value, onChange }) => (
  <div className="inline-flex items-center bg-white border border-zinc-200 rounded-md p-0.5">
    {SORT_OPTIONS.map((o) => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        className={`
          px-2 h-6 text-[11px] font-medium rounded
          transition-colors
          ${value === o.value
            ? 'bg-zinc-100 text-zinc-900'
            : 'text-zinc-500 hover:text-zinc-900'}
        `}
      >
        {o.label}
      </button>
    ))}
  </div>
);
