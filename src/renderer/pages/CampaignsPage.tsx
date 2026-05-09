import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, ArrowDownUp, Pencil, Plus } from 'lucide-react';
import { ApiError } from '../api/client';
import {
  metricsApi,
  CampaignSummary,
  CampaignAnalyticsItem,
} from '../api/metrics';
import { EditCampaignModal } from '../components/EditCampaignModal';
import { AddCampaignModal } from '../components/AddCampaignModal';
import {
  PageHeader,
  RangePicker,
  Card,
  Kpi,
  EmptyState,
  LoadingRow,
  Pagination,
  ActiveFiltersBar,
} from '../components/ui';
import { dateRangeFor, RangeId } from '../lib/dateRange';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { useToast } from '../contexts/ToastContext';
import { useNav, useInitialFilters } from '../contexts/NavContext';
import { useMarketplaces } from '../contexts/MarketplacesContext';
import {
  useGlobalFilters,
  useGlobalFilterChips,
} from '../contexts/GlobalFiltersContext';
import { useBooks } from '../contexts/BooksContext';

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
  const { t } = useTranslation('campaigns');
  const toast = useToast();
  const { navigate } = useNav();
  const { list: globalMarketplaces } = useMarketplaces();
  const { filters: globalFilters } = useGlobalFilters();
  const { list: booksList } = useBooks();
  const chips = useGlobalFilterChips(booksList);
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
  const [creating, setCreating] = useState(false);

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
        toast.error(err instanceof ApiError ? err.message : t('list.loadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [
      from,
      to,
      activeOnly,
      toast,
      t,
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
    <div className="space-y-6" data-testid="campaigns-page">
      <PageHeader
        title={t('list.title')}
        subtitle={
          summary
            ? t('list.subtitle.withDates', {
                from: summary.date_from,
                to: summary.date_to,
                filtered: filtered.length,
                total: summary.campaigns.length,
              })
            : t('list.subtitle.loading')
        }
        rightSlot={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-md
                text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800
                transition-colors
              "
            >
              <Plus size={14} strokeWidth={2.5} />
              {t('list.addCampaign')}
            </button>
            <RangePicker
              value={range}
              onChange={setRange}
              onRefresh={() => load()}
              refreshing={loading}
              autoRefresh={{ storageKey: 'auto-refresh-campaigns' }}
            />
          </div>
        }
      />

      <ActiveFiltersBar chips={chips} />

      <div className="grid grid-cols-4 gap-3">
        <Kpi label={t('list.kpi.campaignCount')} value={fmtNumber(filtered.length)} loading={loading} />
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
        title={t('list.card.title')}
        rightSlot={
          <div className="flex items-center gap-2">
            <Select
              value={marketplace}
              onChange={setMarketplace}
              options={[
                { value: 'all', label: t('list.filters.marketplaceAll') },
                ...marketplaceOptions.map((m) => ({ value: m, label: m })),
              ]}
            />
            <Select
              value={campaignType}
              onChange={setCampaignType}
              options={[
                { value: 'all', label: t('list.filters.typeAll') },
                ...typeOptions.map((tp) => ({ value: tp, label: tp.toUpperCase() })),
              ]}
            />
            <ToggleChip
              active={activeOnly}
              onClick={() => setActiveOnly((v) => !v)}
              label={t('list.filters.activeOnly')}
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
            title={search ? t('list.empty.search') : t('list.empty.noData')}
          />
        ) : (
          <table className="w-full text-sm table-sticky-head">
            <thead>
              <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2 font-medium">{t('list.th.campaign')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('list.th.book')}</th>
                <th className="text-left px-3 py-2 font-medium">MP</th>
                <th className="text-left px-3 py-2 font-medium">{t('list.th.type')}</th>
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
                    navigate('campaign_details', {
                      campaignId: c.campaign_id,
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

      {creating && (
        <AddCampaignModal
          onClose={() => setCreating(false)}
          onCreated={() => load()}
        />
      )}
    </div>
  );
};

const CampaignRow: React.FC<{
  c: CampaignAnalyticsItem;
  onDrillDown: () => void;
  onEdit: () => void;
}> = ({ c, onDrillDown, onEdit }) => {
  const { t } = useTranslation('campaigns');
  return (
  <tr
    className="group border-t border-zinc-100 hover:bg-zinc-50/80 cursor-pointer transition-colors"
    onClick={onDrillDown}
    title={t('list.row.openSearchTerms')}
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
        title={t('list.row.edit')}
        aria-label={t('list.row.editAria')}
      >
        <Pencil size={11} />
      </button>
    </td>
  </tr>
  );
};

const SearchInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({
  value,
  onChange,
}) => {
  const { t } = useTranslation('campaigns');
  return (
  <div className="relative">
    <Search
      size={12}
      className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400"
    />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('list.filters.search')}
      className="
        w-52 h-7 pl-7 pr-2 text-xs rounded-md
        border border-zinc-200 bg-white
        text-zinc-900 placeholder:text-zinc-400
        focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
      "
    />
  </div>
  );
};

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
