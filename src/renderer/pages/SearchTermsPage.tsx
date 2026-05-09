import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Ban, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  searchTermsApi,
  SearchTermsResponse,
  SearchTermItem,
  SearchTermsFilters,
  NegativeMatchType,
} from '../api/searchTerms';
import {
  PageHeader,
  RangePicker,
  Card,
  Kpi,
  EmptyState,
  LoadingRow,
  Pagination,
  ActiveFiltersBar,
  ActiveFilterChip,
} from '../components/ui';
import { dateRangeFor, RangeId } from '../lib/dateRange';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { useToast } from '../contexts/ToastContext';
import { useInitialFilters } from '../contexts/NavContext';
import {
  useGlobalFilters,
  useGlobalFilterChips,
} from '../contexts/GlobalFiltersContext';
import { useBooks } from '../contexts/BooksContext';

type SortKey = NonNullable<SearchTermsFilters['sortBy']>;

const SORT_KEYS: SortKey[] = [
  'clicks',
  'cost',
  'sales',
  'orders',
  'acos',
  'impressions',
];

const PER_PAGE = 50;

export const SearchTermsPage: React.FC = () => {
  const { t } = useTranslation('searchTerms');
  const toast = useToast();
  const { filters: globalFilters } = useGlobalFilters();
  const { list: booksList } = useBooks();
  const globalChips = useGlobalFilterChips(booksList);
  const incomingFilters = useInitialFilters();
  const [range, setRange] = useState<RangeId>('30d');
  const [data, setData] = useState<SearchTermsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('clicks');
  const [termType, setTermType] = useState<'all' | 'keywords' | 'asins'>('all');
  const [minClicks, setMinClicks] = useState<number>(0);
  const [page, setPage] = useState(1);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [campaignFilter, setCampaignFilter] = useState<{
    localId?: number;
    amazonId?: string;
  } | null>(
    incomingFilters.localCampaignId || incomingFilters.amazonCampaignId
      ? {
          localId: incomingFilters.localCampaignId,
          amazonId: incomingFilters.amazonCampaignId,
        }
      : null,
  );

  const { from, to } = useMemo(() => dateRangeFor(range), [range]);

  const filters: SearchTermsFilters = useMemo(
    () => ({
      dateFrom: from,
      dateTo: to,
      sortBy: sortKey,
      sortOrder: 'desc',
      page,
      perPage: PER_PAGE,
      termType: termType === 'all' ? undefined : termType,
      minClicks: minClicks > 0 ? minClicks : undefined,
      search: search || undefined,
      localCampaignId: campaignFilter?.localId,
      campaignId: campaignFilter?.amazonId,
      marketplace:
        globalFilters.marketplaces.length === 1
          ? globalFilters.marketplaces[0]
          : undefined,
      bookId: globalFilters.bookId,
      account:
        globalFilters.accounts.length === 1 ? globalFilters.accounts[0] : undefined,
    }),
    [
      from,
      to,
      sortKey,
      page,
      termType,
      minClicks,
      search,
      campaignFilter,
      globalFilters.marketplaces,
      globalFilters.bookId,
      globalFilters.accounts,
    ],
  );

  const load = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const res = await searchTermsApi.list(filters);
        setData(res);
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : t('errors.load'),
        );
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [from, to, sortKey, termType, minClicks, search, campaignFilter]);

  const totals = data?.summary;

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const campaignChipId =
    campaignFilter?.localId ?? campaignFilter?.amazonId ?? '';

  return (
    <div className="space-y-6" data-testid="search_terms-page">
      <PageHeader
        title={t('title')}
        subtitle={
          data
            ? t('subtitle', { from, to, count: data.total })
            : t('loading')
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

      <ActiveFiltersBar
        chips={[
          ...globalChips,
          ...(campaignFilter
            ? [
                {
                  label: t('card.campaignChip', { id: campaignChipId }),
                  onRemove: () => setCampaignFilter(null),
                } as ActiveFilterChip,
              ]
            : []),
        ]}
      />

      <div className="grid grid-cols-4 gap-3">
        <Kpi
          label={t('kpi.terms')}
          value={totals ? fmtNumber(totals.termsCount) : '—'}
          loading={loading}
        />
        <Kpi
          label={t('kpi.spend')}
          value={totals ? fmtMoney(totals.totalCost) : '—'}
          loading={loading}
        />
        <Kpi
          label={t('kpi.orders')}
          value={totals ? fmtNumber(totals.totalOrders) : '—'}
          loading={loading}
        />
        <Kpi
          label={t('kpi.acos')}
          value={totals ? fmtPct(totals.avgAcos) : '—'}
          loading={loading}
          tone={totals && totals.avgAcos > 100 ? 'negative' : 'default'}
        />
      </div>

      <Card
        title={
          <div className="flex items-center gap-2">
            <span>{t('card.title')}</span>
            {campaignFilter && (
              <button
                onClick={() => setCampaignFilter(null)}
                className="
                  inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md
                  text-[11px] font-medium bg-zinc-100 text-zinc-700
                  hover:bg-zinc-200 transition-colors
                "
                title={t('card.clearCampaign')}
              >
                <span className="max-w-[200px] truncate">
                  {t('card.campaignChip', { id: campaignChipId })}
                </span>
                <span className="text-zinc-500">×</span>
              </button>
            )}
          </div>
        }
        rightSlot={
          <div className="flex items-center gap-2">
            <TypeToggle value={termType} onChange={setTermType} />
            <MinClicksFilter value={minClicks} onChange={setMinClicks} />
            <SortSelect value={sortKey} onChange={setSortKey} />
            <form onSubmit={onSearchSubmit}>
              <SearchInput
                value={searchInput}
                onChange={setSearchInput}
                onClear={() => {
                  setSearchInput('');
                  setSearch('');
                }}
              />
            </form>
          </div>
        }
      >
        {loading && !data ? (
          <LoadingRow />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title={search ? t('empty.noResults') : t('empty.noPeriod')}
            hint={search ? t('empty.noResultsHint') : undefined}
          />
        ) : (
          <>
            <table className="w-full text-sm table-sticky-head">
              <thead>
                <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-2 font-medium">{t('th.term')}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('th.campaign')}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('th.marketplace')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('th.impressions')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('th.clicks')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('th.spend')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('th.sales')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('th.orders')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('th.acos')}</th>
                  <th className="px-3 py-2 w-9"></th>
                </tr>
              </thead>
              <tbody>
                {data.items
                  .filter((item) => !hidden.has(item.id))
                  .map((item) => (
                    <TermRow
                      key={`${item.id}-${item.keywordId ?? item.searchTerm}`}
                      item={item}
                      onAddedNegative={() =>
                        setHidden((prev) => new Set(prev).add(item.id))
                      }
                    />
                  ))}
              </tbody>
            </table>

            <Pagination
              page={data.page}
              pages={data.pages}
              total={data.total}
              perPage={data.per_page}
              onChange={setPage}
              disabled={loading}
            />
          </>
        )}
      </Card>
    </div>
  );
};

const TermRow: React.FC<{
  item: SearchTermItem;
  onAddedNegative: () => void;
}> = ({ item, onAddedNegative }) => (
  <tr className="group border-t border-zinc-100 hover:bg-zinc-50/60">
    <td className="px-5 py-2.5 max-w-[260px]">
      <div className="text-xs text-zinc-900 truncate" title={item.searchTerm}>
        {item.searchTerm}
      </div>
      {item.keywordText && item.keywordText !== item.searchTerm && (
        <div className="text-[10px] text-zinc-400 mt-0.5 truncate">
          ↳ {item.keywordText} · {item.matchType}
        </div>
      )}
    </td>
    <td className="px-3 py-2.5 max-w-[180px]">
      <div className="text-xs text-zinc-600 truncate" title={item.campaignName}>
        {item.campaignName || '—'}
      </div>
      {item.bookTitle && (
        <div className="text-[10px] text-zinc-400 mt-0.5 truncate">
          {item.bookTitle}
        </div>
      )}
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-600 uppercase">
      {item.marketplace || '—'}
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
      {fmtNumber(item.impressions)}
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
      {fmtNumber(item.clicks)}
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
      {fmtMoney(item.cost, item.currency)}
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
      {fmtMoney(item.sales, item.currency)}
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
      {item.orders}
    </td>
    <td className="px-3 py-2.5 text-xs text-right tabular-nums">
      <span className={item.acos > 100 ? 'text-red-600' : 'text-zinc-700'}>
        {item.acos > 0 ? fmtPct(item.acos) : '—'}
      </span>
    </td>
    <td className="px-3 py-2.5 text-right">
      <NegativeQuickAction item={item} onAdded={onAddedNegative} />
    </td>
  </tr>
);

const NegativeQuickAction: React.FC<{
  item: SearchTermItem;
  onAdded: () => void;
}> = ({ item, onAdded }) => {
  const { t } = useTranslation('searchTerms');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const canAdd = item.localCampaignId != null && !!item.searchTerm;

  const submit = async (matchType: NegativeMatchType) => {
    if (!canAdd || submitting) return;
    setSubmitting(true);
    try {
      await searchTermsApi.addNegativeByText({
        keywordText: item.searchTerm,
        campaignId: item.localCampaignId as number,
        matchType,
      });
      toast.success(t('negative.added', { matchType }));
      onAdded();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t('errors.addNegative'),
      );
    } finally {
      setSubmitting(false);
      setOpen(false);
    }
  };

  if (!canAdd) return null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="
          h-6 w-6 flex items-center justify-center rounded
          text-zinc-400 hover:text-red-600 hover:bg-red-50
          opacity-0 group-hover:opacity-100 transition-opacity
        "
        title={t('negative.trigger')}
        aria-label={t('negative.trigger')}
      >
        {submitting ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />}
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-30 w-44 bg-white border border-zinc-200 rounded-md shadow-card overflow-hidden">
          <div className="px-3 py-1.5 border-b border-zinc-100 text-[10px] text-zinc-500 uppercase tracking-wider">
            {t('negative.menuTitle')}
          </div>
          {(['Exact', 'Phrase'] as const).map((m) => (
            <button
              key={m}
              onClick={() => submit(m)}
              disabled={submitting}
              className="
                w-full text-left px-3 h-8 text-xs text-zinc-700
                hover:bg-zinc-50 transition-colors
                disabled:opacity-50
              "
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
}> = ({ value, onChange, onClear }) => {
  const { t } = useTranslation('searchTerms');
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
        placeholder={t('filters.search.placeholder')}
        className="
          w-52 h-7 pl-7 pr-7 text-xs rounded-md
          border border-zinc-200 bg-white
          text-zinc-900 placeholder:text-zinc-400
          focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
        "
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 text-xs"
        >
          ×
        </button>
      )}
    </div>
  );
};

const TypeToggle: React.FC<{
  value: 'all' | 'keywords' | 'asins';
  onChange: (v: 'all' | 'keywords' | 'asins') => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation('searchTerms');
  const options: { value: 'all' | 'keywords' | 'asins'; label: string }[] = [
    { value: 'all', label: t('filters.type.all') },
    { value: 'keywords', label: t('filters.type.keywords') },
    { value: 'asins', label: t('filters.type.asins') },
  ];
  return (
    <div className="inline-flex items-center bg-white border border-zinc-200 rounded-md p-0.5">
      {options.map((o) => (
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
};

const MIN_CLICKS_OPTIONS = [
  { value: 0, label: '≥0' },
  { value: 1, label: '≥1' },
  { value: 5, label: '≥5' },
  { value: 10, label: '≥10' },
  { value: 50, label: '≥50' },
];

const MinClicksFilter: React.FC<{
  value: number;
  onChange: (v: number) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation('searchTerms');
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="
        h-7 px-2 pr-6 text-xs rounded-md
        border border-zinc-200 bg-white
        text-zinc-700
        focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
        cursor-pointer
      "
      title={t('filters.minClicks.title')}
    >
      {MIN_CLICKS_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {t('filters.minClicks.label', { label: o.label })}
        </option>
      ))}
    </select>
  );
};

const SortSelect: React.FC<{
  value: SortKey;
  onChange: (v: SortKey) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation('searchTerms');
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortKey)}
      className="
        h-7 px-2 pr-6 text-xs rounded-md
        border border-zinc-200 bg-white
        text-zinc-700
        focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
        cursor-pointer
      "
    >
      {SORT_KEYS.map((key) => (
        <option key={key} value={key}>
          {t('filters.sort.label', { label: t(`filters.sort.${key}` as 'filters.sort.clicks') })}
        </option>
      ))}
    </select>
  );
};
