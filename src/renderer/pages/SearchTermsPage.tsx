import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Ban, Loader2, X, ListOrdered, TrendingUp, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  searchTermsApi,
  SearchTermsResponse,
  SearchTermItem,
  SearchTermsFilters,
  NegativeMatchType,
  SearchTermInboxStatus,
  SearchTermsTabId,
} from '../api/searchTerms';
import {
  PageHeader,
  RangePicker,
  Card,
  Kpi,
  EmptyState,
  ExportMenu,
  LoadingRow,
  Pagination,
  ActiveFiltersBar,
  ActiveFilterChip,
  SegmentedControl,
} from '../components/ui';
import { dateRangeFor, RangeId } from '../lib/dateRange';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { downloadExcel, type ExportColumn } from '../lib/export';
import { useToast } from '../contexts/ToastContext';
import { useInitialFilters } from '../contexts/NavContext';
import {
  useGlobalFilters,
  useGlobalFilterChips,
} from '../contexts/GlobalFiltersContext';
import { useBooks } from '../contexts/BooksContext';
import { NegativeListsTab } from '../components/NegativeListsTab';
import { SnoozeModal } from '../components/searchTerms/SnoozeModal';
import { PauseModal } from '../components/searchTerms/PauseModal';
import { MoveModal } from '../components/searchTerms/MoveModal';
import { RankHistoryModal } from '../components/searchTerms/RankHistoryModal';
import { TrendModal } from '../components/searchTerms/TrendModal';

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

const TAB_ORDER: SearchTermsTabId[] = [
  'inbox',
  'snoozed',
  'done',
  'archived_pause',
  'archived_final',
  'all',
];

type ModalState =
  | { kind: 'none' }
  | { kind: 'snooze'; statusIds: number[] }
  | { kind: 'pause'; statusIds: number[] }
  | {
      kind: 'move';
      statusIds: number[];
      bookId: number | null;
      marketplace: string | null;
      sourceCampaignId: number | null;
    }
  | {
      kind: 'rankHistory';
      statusId: number;
      keyword: string;
      bookId: number | null;
      marketplace: string | null;
    }
  | {
      kind: 'trend';
      statusId: number;
      keyword: string;
      currency?: string;
    };

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
  const [tab, setTab] = useState<SearchTermsTabId>('inbox');
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [showRightPane, setShowRightPane] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [bulkBusy, setBulkBusy] = useState(false);
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
      // 'all' tab → undefined (backend treats absent inbox_status as "all").
      inboxStatus: tab === 'all' ? undefined : tab,
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
      tab,
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
        // After a successful reload selection is invalidated — items могут быть
        // на других страницах / в другом табе.
        setSelected(new Set());
        setHidden(new Set());
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : t('errors.load'),
        );
      } finally {
        setLoading(false);
      }
    },
    // `t` is intentionally outside deps — react-i18next returns a new
    // function reference on every render, which would re-create `load`
    // every render and re-fire the load() effect → infinite loop.
    [filters, toast],
  );

  useEffect(() => {
    load();
  }, [load, reloadTick]);

  useEffect(() => {
    setPage(1);
  }, [from, to, sortKey, termType, minClicks, search, campaignFilter, tab]);

  const totals = data?.summary;

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const campaignChipId =
    campaignFilter?.localId ?? campaignFilter?.amazonId ?? '';

  const visibleItems = useMemo(
    () => (data?.items ?? []).filter((item) => !hidden.has(item.id)),
    [data, hidden],
  );

  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every((it) => selected.has(it.id));
  const someVisibleSelected =
    !allVisibleSelected && visibleItems.some((it) => selected.has(it.id));

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const it of visibleItems) next.delete(it.id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const it of visibleItems) next.add(it.id);
        return next;
      });
    }
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const selectedCount = selectedIds.length;

  // Resolve context info for Move modal — берём из первой выделенной item'ы,
  // т.к. typically все выбранные принадлежат одному book/marketplace/campaign.
  const selectedContext = useMemo(() => {
    if (!data) return null;
    const first = data.items.find((it) => selected.has(it.id));
    if (!first) return null;
    return {
      bookId: first.bookId ?? null,
      marketplace: first.marketplace ?? null,
      sourceCampaignId: first.localCampaignId ?? null,
    };
  }, [data, selected]);

  const bulkUpdateStatus = async (newStatus: SearchTermInboxStatus) => {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await searchTermsApi.bulkUpdateInboxStatus({
        statusIds: selectedIds,
        newStatus,
      });
      const updated = typeof res.updated === 'number' && res.updated > 0
        ? res.updated
        : selectedIds.length;
      toast.success(t('bulk.results.marked', { count: updated }));
      setSelected(new Set());
      setReloadTick((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('errors.bulkStatus'));
    } finally {
      setBulkBusy(false);
    }
  };

  const counts = data?.inboxCounts ?? {};
  const tabCount = (id: SearchTermsTabId): number | null => {
    if (id === 'all') {
      const v = counts.total;
      return typeof v === 'number' ? v : null;
    }
    const v = counts[id];
    return typeof v === 'number' ? v : null;
  };

  const closeModal = () => setModal({ kind: 'none' });

  const onModalDone = () => {
    closeModal();
    setSelected(new Set());
    setReloadTick((n) => n + 1);
  };

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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRightPane((v) => !v)}
              className={`
                inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium
                border border-zinc-200 bg-white transition-colors
                ${showRightPane ? 'text-zinc-900 bg-zinc-50' : 'text-zinc-600 hover:text-zinc-900'}
              `}
              aria-pressed={showRightPane}
              data-testid="toggle-right-pane"
            >
              {showRightPane ? <PanelRightClose size={12} /> : <PanelRightOpen size={12} />}
              {showRightPane ? t('rightPane.toggleHide') : t('rightPane.toggleShow')}
            </button>
            <ExportMenu
              testId="search-terms-export"
              buttonLabel={t('export.label')}
              items={[
                {
                  id: 'xlsx',
                  label: 'XLSX',
                  disabled: !data || data.items.length === 0 || loading,
                  onClick: () => {
                    const items = data?.items ?? [];
                    const columns: ExportColumn[] = [
                      { key: 'term', label: 'Search term', width: 36 },
                      { key: 'campaign', label: 'Campaign', width: 30 },
                      { key: 'marketplace', label: 'MP', width: 14 },
                      { key: 'impressions', label: 'Impr', align: 'right', width: 14 },
                      { key: 'clicks', label: 'Clicks', align: 'right', width: 14 },
                      { key: 'cost', label: 'Spend', align: 'right', width: 16 },
                      { key: 'sales', label: 'Sales', align: 'right', width: 16 },
                      { key: 'orders', label: 'Orders', align: 'right', width: 14 },
                      { key: 'acos', label: 'ACOS%', align: 'right', width: 14 },
                    ];
                    const exportRows = items.map((it: SearchTermItem) => ({
                      term: it.searchTerm || '',
                      campaign: it.campaignName || '',
                      marketplace: it.marketplace || '',
                      impressions: it.impressions ?? 0,
                      clicks: it.clicks ?? 0,
                      cost: Number(it.cost ?? 0).toFixed(2),
                      sales: Number(it.sales ?? 0).toFixed(2),
                      orders: it.orders ?? 0,
                      acos: Number(it.acos ?? 0).toFixed(2),
                    }));
                    downloadExcel(
                      `ads-tracker-search-terms-${from}-${to}.xlsx`,
                      exportRows,
                      columns,
                      'Search Terms',
                    );
                    toast.success(t('export.success', { count: exportRows.length }));
                  },
                },
              ]}
            />
            <RangePicker
              value={range}
              onChange={setRange}
              onRefresh={() => load()}
              refreshing={loading}
            />
          </div>
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

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
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

      <div
        className={`grid gap-6 ${showRightPane ? 'grid-cols-[1fr_320px]' : 'grid-cols-1'}`}
      >
        <div className="space-y-3 min-w-0">
          {/* Tabs */}
          <nav
            role="tablist"
            aria-label={t('tabs.ariaLabel')}
            className="inline-flex flex-wrap gap-1 border-b border-zinc-200"
            data-testid="search-terms-tabs"
          >
            {TAB_ORDER.map((id) => {
              const active = tab === id;
              const count = tabCount(id);
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={active}
                  data-testid={`tab-${id}`}
                  onClick={() => setTab(id)}
                  className={`
                    relative h-8 px-3 text-xs font-medium transition-colors
                    ${active
                      ? 'text-zinc-900'
                      : 'text-zinc-500 hover:text-zinc-900'}
                  `}
                >
                  <span className="flex items-center gap-1.5">
                    {t(`tabs.${id}` as 'tabs.inbox')}
                    {count != null && (
                      <span
                        className={`
                          inline-flex items-center justify-center min-w-[18px] h-[18px] px-1
                          rounded-full text-[10px] font-medium tabular-nums
                          ${active
                            ? 'bg-zinc-900 text-white'
                            : 'bg-zinc-100 text-zinc-600'}
                        `}
                        data-testid={`tab-${id}-count`}
                      >
                        {count}
                      </span>
                    )}
                  </span>
                  {active && (
                    <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-zinc-900" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Bulk select bar — sticky, появляется при selectedCount > 0 */}
          {selectedCount > 0 && (
            <div
              className="
                sticky top-0 z-10 -mx-1 px-3 py-2 rounded-md
                bg-zinc-900 text-white text-xs
                flex items-center justify-between gap-3 shadow-card
              "
              data-testid="bulk-select-bar"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-medium">
                  {t('bulk.selected', { count: selectedCount })}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-zinc-400 hover:text-white transition-colors text-[11px]"
                >
                  {t('bulk.clear')}
                </button>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <BulkBtn
                  onClick={() => bulkUpdateStatus('done')}
                  disabled={bulkBusy}
                  label={t('bulk.actions.done')}
                  testId="bulk-done"
                />
                <BulkBtn
                  onClick={() => setModal({ kind: 'snooze', statusIds: selectedIds })}
                  disabled={bulkBusy}
                  label={t('bulk.actions.snooze')}
                  testId="bulk-snooze"
                />
                <BulkBtn
                  onClick={() => setModal({ kind: 'pause', statusIds: selectedIds })}
                  disabled={bulkBusy}
                  label={t('bulk.actions.pause')}
                  testId="bulk-pause"
                />
                <BulkBtn
                  onClick={() =>
                    selectedContext &&
                    setModal({
                      kind: 'move',
                      statusIds: selectedIds,
                      bookId: selectedContext.bookId,
                      marketplace: selectedContext.marketplace,
                      sourceCampaignId: selectedContext.sourceCampaignId,
                    })
                  }
                  disabled={bulkBusy || !selectedContext}
                  label={t('bulk.actions.move')}
                  testId="bulk-move"
                />
                {tab !== 'inbox' && (
                  <BulkBtn
                    onClick={() => bulkUpdateStatus('inbox')}
                    disabled={bulkBusy}
                    label={t('bulk.actions.returnInbox')}
                    testId="bulk-return-inbox"
                  />
                )}
                {tab !== 'archived_final' && (
                  <BulkBtn
                    onClick={() => bulkUpdateStatus('archived_final')}
                    disabled={bulkBusy}
                    label={t('bulk.actions.archiveFinal')}
                    testId="bulk-archive"
                  />
                )}
              </div>
            </div>
          )}

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
                    <X size={11} className="text-zinc-500" />
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
            ) : !data || visibleItems.length === 0 ? (
              <EmptyState
                title={
                  search
                    ? t('empty.noResults')
                    : t(`empty.tab${tabCamel(tab)}` as 'empty.tabInbox')
                }
                hint={search ? t('empty.noResultsHint') : undefined}
              />
            ) : (
              <>
                <table className="w-full text-sm table-sticky-head">
                  <thead>
                    <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                      <th className="px-3 py-2 w-9">
                        <input
                          type="checkbox"
                          aria-label={t('th.select')}
                          checked={allVisibleSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someVisibleSelected;
                          }}
                          onChange={toggleAllVisible}
                          data-testid="bulk-select-all"
                        />
                      </th>
                      <th className="text-left px-3 py-2 font-medium">{t('th.term')}</th>
                      <th className="text-left px-3 py-2 font-medium">{t('th.campaign')}</th>
                      <th className="text-left px-3 py-2 font-medium">{t('th.marketplace')}</th>
                      <th className="text-right px-3 py-2 font-medium">{t('th.impressions')}</th>
                      <th className="text-right px-3 py-2 font-medium">{t('th.clicks')}</th>
                      <th className="text-right px-3 py-2 font-medium">{t('th.spend')}</th>
                      <th className="text-right px-3 py-2 font-medium">{t('th.sales')}</th>
                      <th className="text-right px-3 py-2 font-medium">{t('th.orders')}</th>
                      <th className="text-right px-3 py-2 font-medium">{t('th.acos')}</th>
                      <th className="px-3 py-2 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item) => (
                      <TermRow
                        key={`${item.id}-${item.keywordId ?? item.searchTerm}`}
                        item={item}
                        selected={selected.has(item.id)}
                        onToggleSelect={() => toggleOne(item.id)}
                        onAddedNegative={() =>
                          setHidden((prev) => new Set(prev).add(item.id))
                        }
                        onOpenRank={() =>
                          setModal({
                            kind: 'rankHistory',
                            statusId: item.id,
                            keyword: item.searchTerm,
                            bookId: item.bookId ?? null,
                            marketplace: item.marketplace ?? null,
                          })
                        }
                        onOpenTrend={() =>
                          setModal({
                            kind: 'trend',
                            statusId: item.id,
                            keyword: item.searchTerm,
                            currency: item.currency,
                          })
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

        {showRightPane && (
          <aside
            className="space-y-3"
            aria-label={t('rightPane.title')}
            data-testid="search-terms-right-pane"
          >
            <div className="text-[11px] uppercase tracking-wide text-zinc-500 px-1">
              {t('rightPane.title')}
            </div>
            <p className="text-[11px] text-zinc-500 px-1">
              {t('rightPane.hint')}
            </p>
            <NegativeListsTab />
          </aside>
        )}
      </div>

      {modal.kind === 'snooze' && (
        <SnoozeModal
          statusIds={modal.statusIds}
          onClose={closeModal}
          onDone={onModalDone}
        />
      )}
      {modal.kind === 'pause' && (
        <PauseModal
          statusIds={modal.statusIds}
          onClose={closeModal}
          onDone={onModalDone}
        />
      )}
      {modal.kind === 'move' && (
        <MoveModal
          statusIds={modal.statusIds}
          bookId={modal.bookId}
          marketplace={modal.marketplace}
          sourceCampaignId={modal.sourceCampaignId}
          onClose={closeModal}
          onDone={onModalDone}
        />
      )}
      {modal.kind === 'rankHistory' && (
        <RankHistoryModal
          statusId={modal.statusId}
          keyword={modal.keyword}
          bookId={modal.bookId}
          marketplace={modal.marketplace}
          onClose={closeModal}
        />
      )}
      {modal.kind === 'trend' && (
        <TrendModal
          statusId={modal.statusId}
          keyword={modal.keyword}
          currency={modal.currency}
          onClose={closeModal}
        />
      )}
    </div>
  );
};

const tabCamel = (id: SearchTermsTabId): string => {
  switch (id) {
    case 'archived_pause':
      return 'ArchivedPause';
    case 'archived_final':
      return 'ArchivedFinal';
    case 'all':
      return 'All';
    default:
      return id.charAt(0).toUpperCase() + id.slice(1);
  }
};

const BulkBtn: React.FC<{
  onClick(): void;
  disabled?: boolean;
  label: string;
  testId?: string;
}> = ({ onClick, disabled, label, testId }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    data-testid={testId}
    className="
      h-7 px-2.5 rounded text-[11px] font-medium
      bg-white/10 text-white hover:bg-white/20
      transition-colors disabled:opacity-50 disabled:cursor-not-allowed
    "
  >
    {label}
  </button>
);

const TermRow: React.FC<{
  item: SearchTermItem;
  selected: boolean;
  onToggleSelect(): void;
  onAddedNegative(): void;
  onOpenRank(): void;
  onOpenTrend(): void;
}> = ({ item, selected, onToggleSelect, onAddedNegative, onOpenRank, onOpenTrend }) => {
  const { t } = useTranslation('searchTerms');
  return (
    <tr
      className={`
        group border-t border-zinc-100 hover:bg-zinc-50/60
        ${selected ? 'bg-zinc-50' : ''}
      `}
      data-testid={`term-row-${item.id}`}
    >
      <td className="px-3 py-2.5 align-top">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={t('th.select')}
          data-testid={`term-row-${item.id}-checkbox`}
        />
      </td>
      <td className="px-3 py-2.5 max-w-[260px]">
        <div className="text-sm text-zinc-900 truncate" title={item.searchTerm}>
          {item.searchTerm}
        </div>
        {item.keywordText && item.keywordText !== item.searchTerm && (
          <div className="text-xs text-zinc-400 mt-0.5 truncate">
            ↳ {item.keywordText} · {item.matchType}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 max-w-[180px]">
        <div className="text-sm text-zinc-600 truncate" title={item.campaignName}>
          {item.campaignName || '—'}
        </div>
        {item.bookTitle && (
          <div className="text-xs text-zinc-400 mt-0.5 truncate">
            {item.bookTitle}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 text-sm text-zinc-600 uppercase">
        {item.marketplace || '—'}
      </td>
      <td className="px-3 py-2.5 text-sm text-zinc-700 text-right tabular-nums">
        {fmtNumber(item.impressions)}
      </td>
      <td className="px-3 py-2.5 text-sm text-zinc-700 text-right tabular-nums">
        {fmtNumber(item.clicks)}
      </td>
      <td className="px-3 py-2.5 text-sm text-zinc-900 text-right tabular-nums">
        {fmtMoney(item.cost, item.currency)}
      </td>
      <td className="px-3 py-2.5 text-sm text-zinc-900 text-right tabular-nums">
        {fmtMoney(item.sales, item.currency)}
      </td>
      <td className="px-3 py-2.5 text-sm text-zinc-700 text-right tabular-nums">
        {item.orders}
      </td>
      <td className="px-3 py-2.5 text-sm text-right tabular-nums">
        <span className={item.acos > 100 ? 'text-red-600' : 'text-zinc-700'}>
          {item.acos > 0 ? fmtPct(item.acos) : '—'}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onOpenTrend}
            className="h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"
            title="Trend"
            aria-label="Trend"
            data-testid={`term-row-${item.id}-trend`}
          >
            <TrendingUp size={11} />
          </button>
          <button
            type="button"
            onClick={onOpenRank}
            className="h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"
            title="Rank"
            aria-label="Rank"
            data-testid={`term-row-${item.id}-rank`}
          >
            <ListOrdered size={11} />
          </button>
          <NegativeQuickAction item={item} onAdded={onAddedNegative} />
        </div>
      </td>
    </tr>
  );
};

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
          transition-colors
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
  return (
    <SegmentedControl<'all' | 'keywords' | 'asins'>
      value={value}
      onChange={onChange}
      options={[
        { value: 'all', label: t('filters.type.all') },
        { value: 'keywords', label: t('filters.type.keywords') },
        { value: 'asins', label: t('filters.type.asins') },
      ]}
      size="sm"
      aria-label={t('filters.type.all')}
    />
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
