import React, { useEffect, useMemo, useState } from 'react';
import { Search, ArrowDownUp, Pencil } from 'lucide-react';
import { ApiError } from '../api/client';
import {
  metricsApi,
  CampaignSummary,
  CampaignAnalyticsItem,
} from '../api/metrics';
import { EditCampaignModal } from '../components/EditCampaignModal';
import {
  PageHeader,
  RangePicker,
  Card,
  Kpi,
  EmptyState,
  LoadingRow,
  Pagination,
} from '../components/ui';
import { dateRangeFor, RangeId } from '../lib/dateRange';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { useToast } from '../contexts/ToastContext';
import { useNav, useInitialFilters } from '../contexts/NavContext';
import { useMarketplaces } from '../contexts/MarketplacesContext';
import { useGlobalFilters } from '../contexts/GlobalFiltersContext';

type SortKey = 'cost' | 'sales' | 'acos' | 'orders' | 'clicks';
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'cost', label: 'Spend' },
  { value: 'sales', label: 'Sales' },
  { value: 'orders', label: 'Orders' },
  { value: 'acos', label: 'ACOS' },
  { value: 'clicks', label: 'Clicks' },
];

const PER_PAGE = 50;

export const CampaignsPage: React.FC = () => {
  const toast = useToast();
  const { navigate } = useNav();
  const { list: globalMarketplaces } = useMarketplaces();
  const { filters: globalFilters } = useGlobalFilters();
  const incomingFilters = useInitialFilters();
  const [range, setRange] = useState<RangeId>('30d');
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('cost');
  const [marketplace, setMarketplace] = useState<string>(
    incomingFilters.marketplace ?? 'all',
  );
  const [campaignType, setCampaignType] = useState<string>('all');
  const [activeOnly, setActiveOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CampaignAnalyticsItem | null>(null);

  const { from, to } = useMemo(() => dateRangeFor(range), [range]);

  // Сброс на первую страницу при смене любого фильтра
  useEffect(() => {
    setPage(1);
  }, [
    from,
    to,
    search,
    sortKey,
    marketplace,
    campaignType,
    activeOnly,
    globalFilters.bookId,
    globalFilters.accounts,
    globalFilters.marketplaces,
  ]);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const data = await metricsApi.summaryByCampaign({
          from,
          to,
          attribution: '7d',
          activeOnly,
          marketplaces: globalFilters.marketplaces.length
            ? globalFilters.marketplaces
            : undefined,
          bookIds: globalFilters.bookId != null ? [globalFilters.bookId] : undefined,
          accounts: globalFilters.accounts.length ? globalFilters.accounts : undefined,
        });
        setSummary(data);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Не удалось загрузить кампании');
      } finally {
        setLoading(false);
      }
    },
    [
      from,
      to,
      activeOnly,
      toast,
      globalFilters.marketplaces,
      globalFilters.bookId,
      globalFilters.accounts,
    ],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Сначала глобальный список из /api/marketplaces (всегда полный),
  // если ещё не загрузился — собираем из текущих данных как fallback.
  const marketplaceOptions = useMemo(() => {
    if (globalMarketplaces.length > 0) return globalMarketplaces;
    if (!summary) return [];
    const set = new Set<string>();
    summary.campaigns.forEach((c) => c.marketplace && set.add(c.marketplace));
    return [...set].sort();
  }, [summary, globalMarketplaces]);

  const typeOptions = useMemo(() => {
    if (!summary) return [];
    const set = new Set<string>();
    summary.campaigns.forEach((c) => c.campaign_type && set.add(c.campaign_type));
    return [...set].sort();
  }, [summary]);

  const filtered = useMemo(() => {
    if (!summary) return [];
    const q = search.trim().toLowerCase();
    let list = summary.campaigns.filter((c) => {
      if (marketplace !== 'all' && c.marketplace !== marketplace) return false;
      if (campaignType !== 'all' && c.campaign_type !== campaignType) return false;
      if (q) {
        return (
          c.campaign_name.toLowerCase().includes(q) ||
          c.book_title?.toLowerCase().includes(q)
        );
      }
      return true;
    });
    list = [...list].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
    return list;
  }, [summary, search, sortKey, marketplace, campaignType]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [filtered, page],
  );

  const totals = useMemo(() => {
    const acc = filtered.reduce(
      (a, c) => ({
        cost: a.cost + (c.cost || 0),
        sales: a.sales + (c.sales || 0),
        orders: a.orders + (c.orders || 0),
        clicks: a.clicks + (c.clicks || 0),
      }),
      { cost: 0, sales: 0, orders: 0, clicks: 0 },
    );
    return {
      ...acc,
      acos: acc.sales > 0 ? (acc.cost / acc.sales) * 100 : 0,
    };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Кампании"
        subtitle={
          summary
            ? `${summary.date_from} → ${summary.date_to} · ${filtered.length} из ${summary.campaigns.length}`
            : 'Загрузка…'
        }
        rightSlot={
          <RangePicker
            value={range}
            onChange={setRange}
            onRefresh={() => load()}
            refreshing={loading}
            autoRefresh={{ storageKey: 'auto-refresh-campaigns' }}
          />
        }
      />

      <div className="grid grid-cols-4 gap-3">
        <Kpi label="Кампаний" value={fmtNumber(filtered.length)} loading={loading} />
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
              value={marketplace}
              onChange={setMarketplace}
              options={[
                { value: 'all', label: 'Все MP' },
                ...marketplaceOptions.map((m) => ({ value: m, label: m })),
              ]}
            />
            <Select
              value={campaignType}
              onChange={setCampaignType}
              options={[
                { value: 'all', label: 'Все типы' },
                ...typeOptions.map((t) => ({ value: t, label: t.toUpperCase() })),
              ]}
            />
            <ToggleChip
              active={activeOnly}
              onClick={() => setActiveOnly((v) => !v)}
              label="Только активные"
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
            title={
              search ? 'Ничего не нашлось.' : 'Нет кампаний за выбранный период.'
            }
          />
        ) : (
          <table className="w-full text-sm table-sticky-head">
            <thead>
              <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2 font-medium">Кампания</th>
                <th className="text-left px-3 py-2 font-medium">Книга</th>
                <th className="text-left px-3 py-2 font-medium">MP</th>
                <th className="text-left px-3 py-2 font-medium">Тип</th>
                <th className="text-right px-3 py-2 font-medium">Spend</th>
                <th className="text-right px-3 py-2 font-medium">Sales</th>
                <th className="text-right px-3 py-2 font-medium">Orders</th>
                <th className="text-right px-3 py-2 font-medium">CTR</th>
                <th className="text-right px-3 py-2 font-medium">ACOS</th>
                <th className="px-3 py-2 w-9"></th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((c) => (
                <CampaignRow
                  key={c.campaign_id ?? c.amazon_campaign_id}
                  c={c}
                  onDrillDown={() =>
                    navigate('search_terms', {
                      localCampaignId: c.campaign_id,
                      amazonCampaignId: c.amazon_campaign_id,
                    })
                  }
                  onEdit={() => setEditing(c)}
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

      {editing && (
        <EditCampaignModal
          campaign={editing}
          onClose={() => setEditing(null)}
          onSaved={() => load()}
        />
      )}
    </div>
  );
};

const CampaignRow: React.FC<{
  c: CampaignAnalyticsItem;
  onDrillDown: () => void;
  onEdit: () => void;
}> = ({ c, onDrillDown, onEdit }) => (
  <tr
    className="group border-t border-zinc-100 hover:bg-zinc-50/80 cursor-pointer transition-colors"
    onClick={onDrillDown}
    title="Открыть поисковые запросы этой кампании"
  >
    <td className="px-5 py-2.5 max-w-[280px]">
      <div className="text-xs text-zinc-900 truncate" title={c.campaign_name}>
        {c.campaign_name}
      </div>
      {c.status && (
        <div className="text-[10px] text-zinc-400 mt-0.5">
          {c.targeting_type} · {c.status}
        </div>
      )}
    </td>
    <td className="px-3 py-2.5 max-w-[160px]">
      <div className="text-xs text-zinc-700 truncate" title={c.book_title}>
        {c.book_title || '—'}
      </div>
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-600 uppercase">
      {c.marketplace || '—'}
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-600 uppercase">
      {c.campaign_type}
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
      {fmtMoney(c.cost, c.currency)}
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
      {fmtMoney(c.sales, c.currency)}
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
      {c.orders}
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-600 text-right tabular-nums">
      {c.ctr > 0 ? fmtPct(c.ctr, 2) : '—'}
    </td>
    <td className="px-3 py-2.5 text-xs text-right tabular-nums">
      <span className={c.acos > 100 ? 'text-red-600' : 'text-zinc-700'}>
        {c.acos > 0 ? fmtPct(c.acos) : '—'}
      </span>
    </td>
    <td className="px-3 py-2.5 text-right">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="
          h-6 w-6 flex items-center justify-center rounded
          text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200
          opacity-0 group-hover:opacity-100 transition-opacity
        "
        title="Редактировать"
        aria-label="Редактировать кампанию"
      >
        <Pencil size={11} />
      </button>
    </td>
  </tr>
);

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
      placeholder="Кампания / книга…"
      className="
        w-52 h-7 pl-7 pr-2 text-xs rounded-md
        border border-zinc-200 bg-white
        text-zinc-900 placeholder:text-zinc-400
        focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
      "
    />
  </div>
);

interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

const Select: React.FC<SelectProps> = ({ value, onChange, options }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="
      h-7 px-2 pr-6 text-xs rounded-md
      border border-zinc-200 bg-white
      text-zinc-700
      focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
      cursor-pointer
    "
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

const ToggleChip: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
}> = ({ active, onClick, label }) => (
  <button
    onClick={onClick}
    className={`
      h-7 px-2.5 text-xs rounded-md border transition-colors
      ${active
        ? 'bg-zinc-900 text-white border-zinc-900'
        : 'bg-white text-zinc-600 border-zinc-200 hover:text-zinc-900'}
    `}
  >
    {label}
  </button>
);

const SortSelect: React.FC<{
  value: SortKey;
  onChange: (v: SortKey) => void;
}> = ({ value, onChange }) => (
  <div className="inline-flex items-center bg-white border border-zinc-200 rounded-md h-7 px-1.5 gap-1.5">
    <ArrowDownUp size={11} className="text-zinc-400" />
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortKey)}
      className="
        h-6 text-xs bg-transparent text-zinc-700 cursor-pointer
        focus:outline-none
      "
    >
      {SORT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
);
