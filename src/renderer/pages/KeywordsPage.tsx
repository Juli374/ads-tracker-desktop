import React, { useEffect, useMemo, useState } from 'react';
import { Search, ArrowDownUp } from 'lucide-react';
import { ApiError } from '../api/client';
import {
  metricsApi,
  type KeywordAnalyticsItem,
  type KeywordSummary,
} from '../api/metrics';
import { targetsApi } from '../api/targets';
import {
  ActiveFiltersBar,
  Card,
  EditableNumber,
  EmptyState,
  Kpi,
  LoadingRow,
  PageHeader,
  Pagination,
  RangePicker,
} from '../components/ui';
import { dateRangeFor, RangeId } from '../lib/dateRange';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { useToast } from '../contexts/ToastContext';
import { useNav } from '../contexts/NavContext';
import {
  useGlobalFilters,
  useGlobalFilterChips,
} from '../contexts/GlobalFiltersContext';
import { useBooks } from '../contexts/BooksContext';

// Только числовые поля KeywordAnalyticsItem допустимы для сортировки.
type SortKey = 'cost' | 'sales' | 'orders' | 'clicks' | 'acos' | 'bid';
const NUMERIC_KEY: Record<SortKey, keyof KeywordAnalyticsItem> = {
  cost: 'cost',
  sales: 'sales',
  orders: 'orders',
  clicks: 'clicks',
  acos: 'acos',
  bid: 'bid',
};
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'cost', label: 'Spend' },
  { value: 'sales', label: 'Sales' },
  { value: 'orders', label: 'Orders' },
  { value: 'acos', label: 'ACOS' },
  { value: 'clicks', label: 'Clicks' },
  { value: 'bid', label: 'Bid' },
];

const PER_PAGE = 100;

export const KeywordsPage: React.FC = () => {
  const toast = useToast();
  const { navigate } = useNav();
  const { filters: globalFilters } = useGlobalFilters();
  const { list: booksList } = useBooks();
  const chips = useGlobalFilterChips(booksList);

  const [range, setRange] = useState<RangeId>('30d');
  const [summary, setSummary] = useState<KeywordSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('cost');
  const [matchFilter, setMatchFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const { from, to } = useMemo(() => dateRangeFor(range), [range]);

  useEffect(() => {
    setPage(1);
  }, [from, to, search, sortKey, matchFilter, statusFilter, globalFilters.bookId, globalFilters.accounts, globalFilters.marketplaces]);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const data = await metricsApi.summaryByKeyword({
          from,
          to,
          attribution: '7d',
          marketplaces: globalFilters.marketplaces.length
            ? globalFilters.marketplaces
            : undefined,
          bookIds: globalFilters.bookId != null ? [globalFilters.bookId] : undefined,
          accounts: globalFilters.accounts.length ? globalFilters.accounts : undefined,
        });
        setSummary(data);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Не удалось загрузить ключи');
      } finally {
        setLoading(false);
      }
    },
    [from, to, toast, globalFilters.marketplaces, globalFilters.bookId, globalFilters.accounts],
  );

  useEffect(() => {
    load();
  }, [load]);

  const matchOptions = useMemo(() => {
    const set = new Set<string>();
    summary?.keywords.forEach((k) => k.match_type && set.add(k.match_type));
    return Array.from(set).sort();
  }, [summary]);

  const filtered = useMemo(() => {
    if (!summary) return [];
    const q = search.toLowerCase();
    return summary.keywords
      .filter((k) => {
        if (matchFilter !== 'all' && k.match_type !== matchFilter) return false;
        if (statusFilter !== 'all' && (k.status || '').toLowerCase() !== statusFilter) return false;
        if (!q) return true;
        return (
          (k.keyword_text || '').toLowerCase().includes(q) ||
          (k.campaign_name || '').toLowerCase().includes(q) ||
          (k.book_title || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const key = NUMERIC_KEY[sortKey];
        const av = (a[key] as number | null | undefined) ?? 0;
        const bv = (b[key] as number | null | undefined) ?? 0;
        return bv - av;
      });
  }, [summary, search, matchFilter, statusFilter, sortKey]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [filtered, page],
  );

  const totals = useMemo(() => {
    const acc = filtered.reduce(
      (a, k) => ({
        cost: a.cost + (k.cost || 0),
        sales: a.sales + (k.sales || 0),
        orders: a.orders + (k.orders || 0),
        clicks: a.clicks + (k.clicks || 0),
      }),
      { cost: 0, sales: 0, orders: 0, clicks: 0 },
    );
    return {
      ...acc,
      acos: acc.sales > 0 ? (acc.cost / acc.sales) * 100 : 0,
    };
  }, [filtered]);

  const onSaveBid = async (item: KeywordAnalyticsItem, next: number) => {
    if (item.target_id == null) {
      toast.error('У этого ключа нет target_id (auto-target?), bid править нельзя');
      throw new Error('no target_id');
    }
    try {
      await targetsApi.update(item.target_id, { bid: next });
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              keywords: prev.keywords.map((k) =>
                k.keyword_id === item.keyword_id ? { ...k, bid: next } : k,
              ),
            }
          : prev,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Не удалось обновить bid');
      throw err;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ключевые слова"
        subtitle={
          summary
            ? `${summary.date_from} → ${summary.date_to} · ${filtered.length} из ${summary.total_count} ключей`
            : 'Загрузка…'
        }
        rightSlot={
          <RangePicker
            value={range}
            onChange={setRange}
            onRefresh={() => load()}
            refreshing={loading}
            autoRefresh={{ storageKey: 'auto-refresh-keywords' }}
          />
        }
      />

      <ActiveFiltersBar chips={chips} />

      <div className="grid grid-cols-4 gap-3">
        <Kpi label="Ключей" value={fmtNumber(filtered.length)} loading={loading} />
        <Kpi label="Spend" value={fmtMoney(totals.cost)} loading={loading} />
        <Kpi label="Sales" value={fmtMoney(totals.sales)} loading={loading} />
        <Kpi
          label="ACOS"
          value={fmtPct(totals.acos)}
          loading={loading}
          tone={totals.acos > 100 ? 'negative' : 'default'}
        />
      </div>

      <Card
        title="Список"
        rightSlot={
          <div className="flex items-center gap-2">
            <Select
              value={matchFilter}
              onChange={setMatchFilter}
              options={[
                { value: 'all', label: 'Все match' },
                ...matchOptions.map((m) => ({ value: m, label: m })),
              ]}
            />
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'Все статусы' },
                { value: 'enabled', label: 'Enabled' },
                { value: 'paused', label: 'Paused' },
              ]}
            />
            <SortSelect value={sortKey} onChange={setSortKey} />
            <SearchInput value={search} onChange={setSearch} />
          </div>
        }
      >
        {loading && !summary ? (
          <LoadingRow />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? 'Ничего не нашлось.' : 'Нет ключей за выбранный период.'}
          />
        ) : (
          <table className="w-full text-sm table-sticky-head">
            <thead>
              <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2 font-medium">Ключ</th>
                <th className="text-left px-3 py-2 font-medium">Match</th>
                <th className="text-left px-3 py-2 font-medium">Кампания</th>
                <th className="text-left px-3 py-2 font-medium">MP</th>
                <th className="text-right px-3 py-2 font-medium">Bid</th>
                <th className="text-right px-3 py-2 font-medium">Spend</th>
                <th className="text-right px-3 py-2 font-medium">Sales</th>
                <th className="text-right px-3 py-2 font-medium">Orders</th>
                <th className="text-right px-3 py-2 font-medium">CTR</th>
                <th className="text-right px-5 py-2 font-medium">ACOS</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((k) => (
                <KeywordRow
                  key={k.keyword_id}
                  k={k}
                  onCampaignClick={() =>
                    navigate('campaign_details', { campaignId: k.campaign_id })
                  }
                  onSaveBid={(v) => onSaveBid(k, v)}
                />
              ))}
            </tbody>
          </table>
        )}

        <Pagination
          page={page}
          pages={pages}
          total={filtered.length}
          perPage={PER_PAGE}
          onChange={setPage}
          disabled={loading}
        />
      </Card>
    </div>
  );
};

const KeywordRow: React.FC<{
  k: KeywordAnalyticsItem;
  onCampaignClick: () => void;
  onSaveBid: (next: number) => Promise<void>;
}> = ({ k, onCampaignClick, onSaveBid }) => (
  <tr className="border-t border-zinc-100 hover:bg-zinc-50/60">
    <td className="px-5 py-2.5 text-xs">
      <div className="text-zinc-900 font-mono truncate max-w-[280px]">
        {k.keyword_text || '—'}
      </div>
      <div className="text-[10px] text-zinc-400 truncate max-w-[280px]">
        {k.book_title}
      </div>
    </td>
    <td className="px-3 py-2.5 text-[11px] text-zinc-600">{k.match_type || '—'}</td>
    <td className="px-3 py-2.5 text-xs">
      <button
        type="button"
        onClick={onCampaignClick}
        className="text-zinc-700 hover:text-zinc-900 hover:underline truncate max-w-[200px] inline-block text-left"
        title={k.campaign_name}
      >
        {k.campaign_name}
      </button>
    </td>
    <td className="px-3 py-2.5 text-[11px] text-zinc-600 uppercase">{k.marketplace}</td>
    <td className="px-3 py-2.5 text-xs text-right">
      {k.bid != null && k.target_id != null ? (
        <EditableNumber
          value={k.bid}
          onSave={onSaveBid}
          format={(n) => fmtMoney(n)}
          min={0.02}
          step={0.01}
          ariaLabel={`Bid для ${k.keyword_text}`}
        />
      ) : (
        <span className="text-zinc-400">—</span>
      )}
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
      {fmtMoney(k.cost, k.currency)}
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
      {fmtMoney(k.sales, k.currency)}
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">{k.orders}</td>
    <td className="px-3 py-2.5 text-xs text-zinc-600 text-right tabular-nums">
      {k.ctr > 0 ? fmtPct(k.ctr, 2) : '—'}
    </td>
    <td className="px-5 py-2.5 text-xs text-right tabular-nums">
      <span className={k.acos > 100 ? 'text-red-600' : 'text-zinc-700'}>
        {k.acos > 0 ? fmtPct(k.acos) : '—'}
      </span>
    </td>
  </tr>
);

const SearchInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({
  value,
  onChange,
}) => (
  <div className="relative">
    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Ключ / кампания / книга…"
      className="
        h-7 pl-7 pr-2 w-56 text-xs rounded-md
        border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400
        focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
      "
    />
  </div>
);

const Select: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}> = ({ value, onChange, options }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="
      h-7 pl-2 pr-7 text-xs rounded-md cursor-pointer
      border border-zinc-200 bg-white text-zinc-700
      focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
    "
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

const SortSelect: React.FC<{
  value: SortKey;
  onChange: (v: SortKey) => void;
}> = ({ value, onChange }) => (
  <div className="relative">
    <ArrowDownUp
      size={11}
      className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400"
    />
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortKey)}
      className="
        h-7 pl-7 pr-7 text-xs rounded-md cursor-pointer
        border border-zinc-200 bg-white text-zinc-700
        focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
      "
      aria-label="Сортировка"
    >
      {SORT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
);
