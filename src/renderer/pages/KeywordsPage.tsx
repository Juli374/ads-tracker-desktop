import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ApiError } from '../api/client';
import {
  metricsApi,
  type KeywordAnalyticsItem,
  type KeywordSummary,
} from '../api/metrics';
import { targetsApi } from '../api/targets';
import { amazonAdsApi } from '../api/amazonAds';
import { ReverseAsinPanel } from '../components/keywords/ReverseAsinPanel';
import { LockedFeature } from '../components/LockedFeature';
import {
  ActiveFiltersBar,
  Card,
  EditableNumber,
  EmptyState,
  ExportMenu,
  Kpi,
  LoadingRow,
  PageHeader,
  RangePicker,
} from '../components/ui';
import { dateRangeFor, RangeId } from '../lib/dateRange';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { useSessionState } from '../lib/useSessionState';
import { downloadExcel, type ExportColumn } from '../lib/export';
import { useToast } from '../contexts/ToastContext';
import { useNav } from '../contexts/NavContext';
import {
  useGlobalFilters,
  useGlobalFilterChips,
} from '../contexts/GlobalFiltersContext';
import { useBooks } from '../contexts/BooksContext';

type SortKey = 'cost' | 'sales' | 'orders' | 'clicks' | 'acos' | 'bid';
const NUMERIC_KEY: Record<SortKey, keyof KeywordAnalyticsItem> = {
  cost: 'cost',
  sales: 'sales',
  orders: 'orders',
  clicks: 'clicks',
  acos: 'acos',
  bid: 'bid',
};
const SORT_KEYS: SortKey[] = ['cost', 'sales', 'orders', 'acos', 'clicks', 'bid'];

// Phase J.5 Lane E: virtualization. We size each row at ~40px and let the
// virtualizer overscan to keep scrolling smooth. With 5k rows the table
// renders only ~30 row elements at a time vs all 5000.
const ROW_HEIGHT = 44;
const ROW_OVERSCAN = 8;

// Noise filter defaults — match frontend/src/components/pages/KeywordsPage.tsx:104-107
// (parity is the point: the same Books trader sees the same default rows).
const NOISE_DEFAULT_MIN_TARGETS = 30;
const NOISE_DEFAULT_MAX_CPC = 0.2;

interface NoiseFilter {
  enabled: boolean;
  minTargets: number;
  maxCpc: number;
  hideLowVolume: boolean;
}

const NOISE_FILTER_INITIAL: NoiseFilter = {
  enabled: true,
  minTargets: NOISE_DEFAULT_MIN_TARGETS,
  maxCpc: NOISE_DEFAULT_MAX_CPC,
  hideLowVolume: false,
};

interface PersistedFilters {
  matchFilter: string;
  statusFilter: string;
  sortKey: SortKey;
  noise: NoiseFilter;
}

const FILTERS_INITIAL: PersistedFilters = {
  matchFilter: 'all',
  statusFilter: 'all',
  sortKey: 'cost',
  noise: NOISE_FILTER_INITIAL,
};

export const KeywordsPage: React.FC = () => {
  const { t } = useTranslation('keywords');
  const toast = useToast();
  const { navigate } = useNav();
  const { filters: globalFilters } = useGlobalFilters();
  const { list: booksList } = useBooks();
  const chips = useGlobalFilterChips(booksList);

  // Phase L.4: sub-tab switch between the original analytics list and the
  // new Reverse-ASIN mining panel. We intentionally keep state local (no
  // sessionState) — the panel is transient: import → action → done.
  const [tab, setTab] = useState<'list' | 'reverseAsin'>('list');
  const [range, setRange] = useState<RangeId>('30d');
  const [summary, setSummary] = useState<KeywordSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [persisted, setPersisted] = useSessionState<PersistedFilters>(
    'keywords:filters',
    FILTERS_INITIAL,
  );

  const { matchFilter, statusFilter, sortKey, noise } = persisted;
  const setMatchFilter = (v: string) =>
    setPersisted((p) => ({ ...p, matchFilter: v }));
  const setStatusFilter = (v: string) =>
    setPersisted((p) => ({ ...p, statusFilter: v }));
  const setSortKey = (v: SortKey) => setPersisted((p) => ({ ...p, sortKey: v }));
  const setNoise = (next: NoiseFilter | ((prev: NoiseFilter) => NoiseFilter)) =>
    setPersisted((p) => ({
      ...p,
      noise: typeof next === 'function' ? (next as (prev: NoiseFilter) => NoiseFilter)(p.noise) : next,
    }));

  // Bulk-select state. We track target_ids (not keyword_ids) because all
  // bulk endpoints accept target_ids. Selection lives outside `persisted`
  // because it's intentionally per-session, not cross-session.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bidModalOpen, setBidModalOpen] = useState(false);

  const { from, to } = useMemo(() => dateRangeFor(range), [range]);

  // Reset selection on any structural change (filter / period / global).
  useEffect(() => {
    setSelected(new Set());
  }, [
    from,
    to,
    search,
    sortKey,
    matchFilter,
    statusFilter,
    noise.enabled,
    noise.minTargets,
    noise.maxCpc,
    noise.hideLowVolume,
    globalFilters.bookId,
    globalFilters.accounts,
    globalFilters.marketplaces,
  ]);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const data = await metricsApi.summaryByKeyword({
          from,
          to,
          marketplaces: globalFilters.marketplaces.length
            ? globalFilters.marketplaces
            : undefined,
          bookIds: globalFilters.bookId != null ? [globalFilters.bookId] : undefined,
          accounts: globalFilters.accounts.length ? globalFilters.accounts : undefined,
        });
        setSummary(data);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t('errors.load'));
      } finally {
        setLoading(false);
      }
    },
    [from, to, toast, t, globalFilters.marketplaces, globalFilters.bookId, globalFilters.accounts],
  );

  useEffect(() => {
    load();
  }, [load]);

  const matchOptions = useMemo(() => {
    const set = new Set<string>();
    summary?.keywords.forEach((k) => k.match_type && set.add(k.match_type));
    return Array.from(set).sort();
  }, [summary]);

  // Targets-per-campaign count powers the noise filter — a campaign with
  // hundreds of low-CPC auto-targets is research/research-paid noise that
  // drowns out the rows worth taking action on.
  const targetsPerCampaign = useMemo(() => {
    const counts = new Map<number, number>();
    summary?.keywords.forEach((k) => {
      counts.set(k.campaign_id, (counts.get(k.campaign_id) ?? 0) + 1);
    });
    return counts;
  }, [summary]);

  const filtered = useMemo(() => {
    if (!summary) return [];
    const q = search.toLowerCase();
    return summary.keywords
      .filter((k) => {
        if (matchFilter !== 'all' && k.match_type !== matchFilter) return false;
        if (statusFilter !== 'all' && (k.status || '').toLowerCase() !== statusFilter) return false;
        if (q) {
          const matchesSearch =
            (k.keyword_text || '').toLowerCase().includes(q) ||
            (k.campaign_name || '').toLowerCase().includes(q) ||
            (k.book_title || '').toLowerCase().includes(q);
          if (!matchesSearch) return false;
        }
        // Noise filter: hide auto/research-style noise — campaigns with
        // many targets where CPC is well below max bid signal volume noise.
        if (noise.enabled) {
          const count = targetsPerCampaign.get(k.campaign_id) ?? 0;
          const isNoisy = count > noise.minTargets && k.cpc < noise.maxCpc;
          if (isNoisy) return false;
        }
        // Optional low-volume hide: zero impressions and zero clicks.
        if (noise.hideLowVolume) {
          if ((k.impressions || 0) === 0 && (k.clicks || 0) === 0) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const key = NUMERIC_KEY[sortKey];
        const av = (a[key] as number | null | undefined) ?? 0;
        const bv = (b[key] as number | null | undefined) ?? 0;
        return bv - av;
      });
  }, [summary, search, matchFilter, statusFilter, sortKey, noise, targetsPerCampaign]);

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
      toast.error(t('errors.noTargetId'));
      throw new Error('no target_id');
    }
    try {
      await amazonAdsApi.setTargetBid(item.target_id, next);
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
      toast.error(err instanceof ApiError ? err.message : t('errors.updateBid'));
      throw err;
    }
  };

  // ──────────────────────────────────────────────────────────────────────
  // Bulk-action helpers.
  //
  // Selection identifies rows via target_id (only rows with target_id are
  // selectable — the checkbox is hidden for auto-targets without one).
  // After a bulk op finishes successfully we refresh the data; on failure
  // the toast surfaces the message and selection is preserved so the user
  // can retry.
  // ──────────────────────────────────────────────────────────────────────
  const selectableTargetIds = useMemo(() => {
    return filtered
      .map((k) => k.target_id)
      .filter((id): id is number => id != null);
  }, [filtered]);

  const allSelected =
    selectableTargetIds.length > 0 &&
    selectableTargetIds.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableTargetIds));
    }
  };

  const toggleOne = (targetId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
  };

  const runBulk = async (op: 'pause' | 'resume') => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const ids = Array.from(selected);
      const result =
        op === 'pause'
          ? await targetsApi.bulkPause(ids)
          : await targetsApi.bulkResume(ids);
      toast.success(t('bulk.result', { count: result.updated ?? ids.length }));
      setSelected(new Set());
      await load();
    } catch (err) {
      toast.error(
        t('bulk.error', {
          message: err instanceof ApiError ? err.message : String(err),
        }),
      );
    } finally {
      setBulkBusy(false);
    }
  };

  const runBidChange = async (op: { multiplier: number } | { delta: number }) => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const ids = Array.from(selected);
      const result = await targetsApi.bulkUpdateBid(ids, op);
      toast.success(t('bulk.result', { count: result.updated ?? ids.length }));
      setSelected(new Set());
      setBidModalOpen(false);
      await load();
    } catch (err) {
      toast.error(
        t('bulk.error', {
          message: err instanceof ApiError ? err.message : String(err),
        }),
      );
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="keywords-page">
      <PageHeader
        title={t('title')}
        subtitle={
          tab === 'reverseAsin'
            ? t('reverseAsin.subtitle')
            : summary
              ? t('subtitle', {
                  from: summary.date_from,
                  to: summary.date_to,
                  filtered: filtered.length,
                  total: summary.total_count,
                })
              : t('loading')
        }
        rightSlot={
          // The export menu and range picker only apply to the analytics
          // list — hide them while the Reverse-ASIN tab is active so the
          // header doesn't suggest export/refresh options for that view.
          tab === 'list' ? (
          <div className="flex items-center gap-2">
            <ExportMenu
              testId="keywords-export"
              buttonLabel={t('export.label')}
              items={[
                {
                  id: 'xlsx',
                  label: 'XLSX',
                  disabled: filtered.length === 0 || loading,
                  onClick: () => {
                    const columns: ExportColumn[] = [
                      { key: 'keyword', label: 'Keyword', width: 36 },
                      { key: 'match', label: 'Match', width: 18 },
                      { key: 'campaign', label: 'Campaign', width: 36 },
                      { key: 'marketplace', label: 'MP', width: 14 },
                      { key: 'bid', label: 'Bid', align: 'right', width: 16 },
                      { key: 'spend', label: 'Spend', align: 'right', width: 18 },
                      { key: 'sales', label: 'Sales', align: 'right', width: 18 },
                      { key: 'orders', label: 'Orders', align: 'right', width: 14 },
                      { key: 'clicks', label: 'Clicks', align: 'right', width: 14 },
                      { key: 'acos', label: 'ACOS%', align: 'right', width: 14 },
                    ];
                    const exportRows = filtered.map((k) => ({
                      keyword: k.keyword_text || '',
                      match: k.match_type || '',
                      campaign: k.campaign_name || '',
                      marketplace: k.marketplace || '',
                      bid: k.bid != null ? Number(k.bid).toFixed(2) : '',
                      spend: Number(k.cost ?? 0).toFixed(2),
                      sales: Number(k.sales ?? 0).toFixed(2),
                      orders: k.orders ?? 0,
                      clicks: k.clicks ?? 0,
                      acos: Number(k.acos ?? 0).toFixed(2),
                    }));
                    downloadExcel(
                      `ads-tracker-keywords-${from}-${to}.xlsx`,
                      exportRows,
                      columns,
                      'Keywords',
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
              autoRefresh={{ storageKey: 'auto-refresh-keywords' }}
            />
          </div>
          ) : null
        }
      />

      <KeywordsTabs tab={tab} onChange={setTab} />

      {tab === 'reverseAsin' ? (
        <LockedFeature feature="ai.reverse_asin" mode="dim">
          <ReverseAsinPanel />
        </LockedFeature>
      ) : (
        <>
      <ActiveFiltersBar chips={chips} />

      <div className="grid grid-cols-4 gap-3">
        <Kpi label={t('kpi.keywords')} value={fmtNumber(filtered.length)} loading={loading} />
        <Kpi label={t('kpi.spend')} value={fmtMoney(totals.cost)} loading={loading} />
        <Kpi label={t('kpi.sales')} value={fmtMoney(totals.sales)} loading={loading} />
        <Kpi
          label={t('kpi.acos')}
          value={fmtPct(totals.acos)}
          loading={loading}
          tone={totals.acos > 100 ? 'negative' : 'default'}
        />
      </div>

      <NoisePanel value={noise} onChange={setNoise} hiddenCount={
        summary ? summary.keywords.length - filtered.length : 0
      } />

      {/* Loud banner — without it the noise filter silently hides rows and the
          page looks empty. The collapsed NoisePanel header says "filtered: N"
          but it's small text; users miss it. Show this whenever the filter
          actually removed anything. */}
      {noise.enabled && summary && summary.keywords.length - filtered.length > 0 && (
        <div
          data-testid="noise-filter-banner"
          className="flex items-center justify-between gap-3 px-4 py-2 rounded-md border border-amber-200 bg-amber-50 text-xs text-amber-900"
        >
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            <span>
              Noise filter is hiding <strong className="tabular-nums">{summary.keywords.length - filtered.length}</strong>{' '}
              of {summary.keywords.length} keywords (minTargets ≥ {noise.minTargets}, CPC &lt; ${noise.maxCpc.toFixed(2)}).
            </span>
          </div>
          <button
            type="button"
            onClick={() => setNoise((p) => ({ ...p, enabled: false }))}
            data-testid="noise-filter-disable"
            className="
              inline-flex items-center h-6 px-2 rounded text-[11px] font-medium
              text-amber-900 bg-white hover:bg-amber-100 border border-amber-300
              transition-colors
            "
          >
            Show all
          </button>
        </div>
      )}

      <Card
        title={t('card.title')}
        rightSlot={
          <div className="flex items-center gap-2">
            <Select
              value={matchFilter}
              onChange={setMatchFilter}
              options={[
                { value: 'all', label: t('filters.matchAll') },
                ...matchOptions.map((m) => ({ value: m, label: m })),
              ]}
            />
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: t('filters.statusAll') },
                { value: 'enabled', label: t('filters.statusEnabled') },
                { value: 'paused', label: t('filters.statusPaused') },
              ]}
            />
            <SortSelect value={sortKey} onChange={setSortKey} />
            <SearchInput value={search} onChange={setSearch} />
          </div>
        }
      >
        {selected.size > 0 && (
          <BulkToolbar
            count={selected.size}
            busy={bulkBusy}
            onPause={() => runBulk('pause')}
            onResume={() => runBulk('resume')}
            onChangeBid={() => setBidModalOpen(true)}
            onClear={() => setSelected(new Set())}
          />
        )}

        {loading && !summary ? (
          <LoadingRow />
        ) : filtered.length === 0 ? (
          noise.enabled && summary && summary.keywords.length > 0 ? (
            // Filter wiped the list. EmptyState alone is confusing — surface
            // a one-click way out so the user can see their data immediately.
            <div className="py-10 text-center space-y-3" data-testid="empty-noise-filtered">
              <div className="text-sm text-zinc-700 font-medium">
                {t('empty.filteredOut')}
              </div>
              <div className="text-xs text-zinc-500">
                Noise filter removed all {summary.keywords.length} keywords for the current period.
              </div>
              <button
                type="button"
                onClick={() => setNoise((p) => ({ ...p, enabled: false }))}
                className="
                  inline-flex items-center h-7 px-3 rounded-md text-xs font-medium
                  text-white bg-zinc-900 hover:bg-zinc-800 transition-colors
                "
              >
                Disable noise filter
              </button>
            </div>
          ) : (
            <EmptyState
              title={search ? t('empty.noResults') : t('empty.noPeriod')}
            />
          )
        ) : (
          <KeywordTable
            rows={filtered}
            selected={selected}
            allSelected={allSelected}
            selectableCount={selectableTargetIds.length}
            onToggleAll={toggleAll}
            onToggleOne={toggleOne}
            onSaveBid={onSaveBid}
            onCampaignClick={(k) =>
              navigate('campaign_details', { campaignId: k.campaign_id })
            }
          />
        )}
      </Card>

      {bidModalOpen && (
        <ChangeBidModal
          count={selected.size}
          busy={bulkBusy}
          onApply={runBidChange}
          onClose={() => setBidModalOpen(false)}
        />
      )}
        </>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Tab strip — switches between the analytics list and the Reverse-ASIN panel.
// Lightweight component (no Headless UI / Radix) to match the rest of the
// app's home-grown UI primitives. Hides itself behind a data-testid so e2e
// tests can drive it.
// ────────────────────────────────────────────────────────────────────────────

const KeywordsTabs: React.FC<{
  tab: 'list' | 'reverseAsin';
  onChange: (t: 'list' | 'reverseAsin') => void;
}> = ({ tab, onChange }) => {
  const { t } = useTranslation('keywords');
  return (
    <div
      className="inline-flex bg-white border border-zinc-200 rounded-md p-0.5"
      data-testid="keywords-tabs"
      role="tablist"
    >
      {(['list', 'reverseAsin'] as const).map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => onChange(id)}
          data-testid={`keywords-tab-${id}`}
          className={`px-4 h-8 text-xs font-medium rounded transition-colors ${
            tab === id
              ? 'bg-zinc-900 text-white'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          {t(`tabs.${id}` as 'tabs.list')}
        </button>
      ))}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Virtualized keyword table.
//
// Implementation note: for rows-as-children-of-tbody the parent must be a
// scroll container. We use a div wrapper around <table> and let useVirtualizer
// position absolute rows inside a sized inner div (the "spacer"). This keeps
// table-row semantics (a11y) while only rendering visible rows.
// ────────────────────────────────────────────────────────────────────────────

interface KeywordTableProps {
  rows: KeywordAnalyticsItem[];
  selected: Set<number>;
  allSelected: boolean;
  selectableCount: number;
  onToggleAll: () => void;
  onToggleOne: (targetId: number) => void;
  onSaveBid: (item: KeywordAnalyticsItem, next: number) => Promise<void>;
  onCampaignClick: (item: KeywordAnalyticsItem) => void;
}

const KeywordTable: React.FC<KeywordTableProps> = ({
  rows,
  selected,
  allSelected,
  selectableCount,
  onToggleAll,
  onToggleOne,
  onSaveBid,
  onCampaignClick,
}) => {
  const { t } = useTranslation('keywords');
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: ROW_OVERSCAN,
    // jsdom (vitest) returns 0 for getBoundingClientRect, which makes the
    // virtualizer render zero rows. Provide a sane initial viewport so
    // tests can observe row elements; production runs always re-measure
    // on real DOM via ResizeObserver and override this default.
    initialRect: { width: 1024, height: 640 },
  });

  const total = virtualizer.getTotalSize();
  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="max-h-[640px] overflow-auto relative"
      data-testid="keywords-virtual-container"
    >
      <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '36px' }} />
          <col />
          <col style={{ width: '90px' }} />
          <col />
          <col style={{ width: '60px' }} />
          <col style={{ width: '90px' }} />
          <col style={{ width: '90px' }} />
          <col style={{ width: '90px' }} />
          <col style={{ width: '70px' }} />
          <col style={{ width: '70px' }} />
          <col style={{ width: '80px' }} />
        </colgroup>
        <thead className="sticky top-0 bg-white z-10">
          <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
            <th className="text-left px-3 py-2 font-medium">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                aria-label={t('bulk.selectAll')}
                disabled={selectableCount === 0}
                data-testid="keywords-select-all"
              />
            </th>
            <th className="text-left px-2 py-2 font-medium">{t('th.keyword')}</th>
            <th className="text-left px-2 py-2 font-medium">{t('th.match')}</th>
            <th className="text-left px-2 py-2 font-medium">{t('th.campaign')}</th>
            <th className="text-left px-2 py-2 font-medium">{t('th.marketplace')}</th>
            <th className="text-right px-2 py-2 font-medium">{t('th.bid')}</th>
            <th className="text-right px-2 py-2 font-medium">{t('th.spend')}</th>
            <th className="text-right px-2 py-2 font-medium">{t('th.sales')}</th>
            <th className="text-right px-2 py-2 font-medium">{t('th.orders')}</th>
            <th className="text-right px-2 py-2 font-medium">{t('th.ctr')}</th>
            <th className="text-right px-3 py-2 font-medium">{t('th.acos')}</th>
          </tr>
        </thead>
      </table>

      {/* The virtualizer renders an absolutely-positioned spacer inside
          a relative container. Each row is rendered with `transform:
          translateY(...)` so React reuses the same element pool while
          scrolling — keeping render cost flat regardless of total rows. */}
      <div
        style={{ height: `${total}px`, position: 'relative' }}
        data-testid="keywords-virtual-spacer"
      >
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '36px' }} />
            <col />
            <col style={{ width: '90px' }} />
            <col />
            <col style={{ width: '60px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '70px' }} />
            <col style={{ width: '70px' }} />
            <col style={{ width: '80px' }} />
          </colgroup>
          <tbody>
            {items.map((vi) => {
              const k = rows[vi.index];
              return (
                <KeywordRow
                  key={k.keyword_id}
                  k={k}
                  selected={k.target_id != null && selected.has(k.target_id)}
                  onToggle={() => k.target_id != null && onToggleOne(k.target_id)}
                  offsetY={vi.start}
                  rowHeight={ROW_HEIGHT}
                  onCampaignClick={() => onCampaignClick(k)}
                  onSaveBid={(v) => onSaveBid(k, v)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const KeywordRow: React.FC<{
  k: KeywordAnalyticsItem;
  selected: boolean;
  onToggle: () => void;
  offsetY: number;
  rowHeight: number;
  onCampaignClick: () => void;
  onSaveBid: (next: number) => Promise<void>;
}> = ({ k, selected, onToggle, offsetY, rowHeight, onCampaignClick, onSaveBid }) => {
  const { t } = useTranslation('keywords');
  return (
    <tr
      className="hover:bg-zinc-50/60 absolute left-0 right-0 border-b border-zinc-100 flex"
      style={{
        transform: `translateY(${offsetY}px)`,
        height: `${rowHeight}px`,
      }}
      data-testid={`keyword-row-${k.keyword_id}`}
    >
      <td className="px-3 py-2 text-sm flex items-center" style={{ width: '36px' }}>
        {k.target_id != null ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            onClick={(e) => e.stopPropagation()}
            aria-label={t('row.selectAria', { keyword: k.keyword_text })}
            data-testid={`keyword-checkbox-${k.keyword_id}`}
          />
        ) : null}
      </td>
      <td className="px-2 py-2 text-sm flex-1 min-w-0">
        <div className="text-zinc-900 font-mono truncate">
          {k.keyword_text || '—'}
        </div>
        <div className="text-xs text-zinc-400 truncate">{k.book_title}</div>
      </td>
      <td
        className="px-2 py-2 text-sm text-zinc-600 flex items-center"
        style={{ width: '90px' }}
      >
        {k.match_type || '—'}
      </td>
      <td className="px-2 py-2 text-sm flex-1 min-w-0 flex items-center">
        <button
          type="button"
          onClick={onCampaignClick}
          className="text-zinc-700 hover:text-zinc-900 hover:underline truncate text-left w-full"
          title={k.campaign_name}
        >
          {k.campaign_name}
        </button>
      </td>
      <td
        className="px-2 py-2 text-sm text-zinc-600 uppercase flex items-center"
        style={{ width: '60px' }}
      >
        {k.marketplace}
      </td>
      <td className="px-2 py-2 text-sm text-right flex items-center justify-end" style={{ width: '90px' }}>
        {k.bid != null && k.target_id != null ? (
          <EditableNumber
            value={k.bid}
            onSave={onSaveBid}
            format={(n) => fmtMoney(n)}
            min={0.02}
            step={0.01}
            ariaLabel={t('row.bidAria', { keyword: k.keyword_text })}
          />
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
      <td className="px-2 py-2 text-sm text-zinc-900 text-right tabular-nums flex items-center justify-end" style={{ width: '90px' }}>
        {fmtMoney(k.cost, k.currency)}
      </td>
      <td className="px-2 py-2 text-sm text-zinc-900 text-right tabular-nums flex items-center justify-end" style={{ width: '90px' }}>
        {fmtMoney(k.sales, k.currency)}
      </td>
      <td className="px-2 py-2 text-sm text-zinc-700 text-right tabular-nums flex items-center justify-end" style={{ width: '70px' }}>
        {k.orders}
      </td>
      <td className="px-2 py-2 text-sm text-zinc-600 text-right tabular-nums flex items-center justify-end" style={{ width: '70px' }}>
        {k.ctr > 0 ? fmtPct(k.ctr, 2) : '—'}
      </td>
      <td className="px-3 py-2 text-sm text-right tabular-nums flex items-center justify-end" style={{ width: '80px' }}>
        <span className={k.acos > 100 ? 'text-red-600' : 'text-zinc-700'}>
          {k.acos > 0 ? fmtPct(k.acos) : '—'}
        </span>
      </td>
    </tr>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Noise filter (collapsible).
// ────────────────────────────────────────────────────────────────────────────

const NoisePanel: React.FC<{
  value: NoiseFilter;
  onChange: (next: NoiseFilter | ((prev: NoiseFilter) => NoiseFilter)) => void;
  hiddenCount: number;
}> = ({ value, onChange, hiddenCount }) => {
  const { t } = useTranslation('keywords');
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div
      className="bg-white border border-zinc-200 rounded-lg"
      data-testid="keywords-noise-panel"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <Chevron size={14} className="text-zinc-400" />
          <span className="text-xs font-medium text-zinc-700">
            {t('noise.title')}
          </span>
          {value.enabled && hiddenCount > 0 && (
            <span className="text-[11px] text-zinc-400 tabular-nums">
              {t('noise.summary', { filtered: hiddenCount })}
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 text-[11px] text-zinc-500" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) =>
              onChange((p) => ({ ...p, enabled: e.target.checked }))
            }
            data-testid="noise-enable"
          />
          {t('noise.enable')}
        </label>
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-zinc-100 grid grid-cols-3 gap-4">
          <Slider
            label={t('noise.minTargets')}
            min={1}
            max={50}
            step={1}
            value={value.minTargets}
            onChange={(n) => onChange((p) => ({ ...p, minTargets: n }))}
            format={(n) => String(n)}
            testId="noise-min-targets"
          />
          <Slider
            label={t('noise.maxCpc')}
            min={0.01}
            max={5}
            step={0.01}
            value={value.maxCpc}
            onChange={(n) => onChange((p) => ({ ...p, maxCpc: n }))}
            format={(n) => `$${n.toFixed(2)}`}
            testId="noise-max-cpc"
          />
          <label className="flex items-center gap-2 text-xs text-zinc-700 self-center">
            <input
              type="checkbox"
              checked={value.hideLowVolume}
              onChange={(e) =>
                onChange((p) => ({ ...p, hideLowVolume: e.target.checked }))
              }
              data-testid="noise-hide-low-volume"
            />
            <span>Hide low-volume terms</span>
          </label>
          <p className="col-span-3 text-[11px] text-zinc-400">
            {t('noise.hint')}
          </p>
        </div>
      )}
    </div>
  );
};

const Slider: React.FC<{
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (n: number) => void;
  format: (n: number) => string;
  testId?: string;
}> = ({ label, min, max, step, value, onChange, format, testId }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between text-[11px] text-zinc-500">
      <span>{label}</span>
      <span className="font-mono tabular-nums text-zinc-700">{format(value)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full"
      data-testid={testId}
    />
  </div>
);

// ────────────────────────────────────────────────────────────────────────────
// Bulk toolbar — appears above the table when ≥1 row is selected.
// ────────────────────────────────────────────────────────────────────────────

const BulkToolbar: React.FC<{
  count: number;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onChangeBid: () => void;
  onClear: () => void;
}> = ({ count, busy, onPause, onResume, onChangeBid, onClear }) => {
  const { t } = useTranslation('keywords');
  return (
    <div
      className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 flex items-center gap-3 text-xs"
      data-testid="keywords-bulk-toolbar"
    >
      <span className="text-zinc-700 font-medium tabular-nums">
        {t('bulk.selected', { count })}
      </span>
      <div className="h-4 w-px bg-zinc-300" />
      <BulkButton onClick={onPause} disabled={busy} testId="bulk-pause">
        {t('bulk.pause')}
      </BulkButton>
      <BulkButton onClick={onResume} disabled={busy} testId="bulk-resume">
        {t('bulk.resume')}
      </BulkButton>
      <BulkButton onClick={onChangeBid} disabled={busy} testId="bulk-change-bid">
        {t('bulk.changeBid')}
      </BulkButton>
      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        className="ml-auto text-zinc-500 hover:text-zinc-700 underline-offset-2 hover:underline disabled:opacity-50"
      >
        {t('bulk.deselect')}
      </button>
    </div>
  );
};

const BulkButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  children: React.ReactNode;
}> = ({ onClick, disabled, testId, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    data-testid={testId}
    className="
      h-7 px-3 text-xs font-medium rounded-md
      border border-zinc-200 bg-white text-zinc-700
      hover:bg-zinc-100 hover:border-zinc-300
      disabled:opacity-50 disabled:cursor-not-allowed
    "
  >
    {children}
  </button>
);

const ChangeBidModal: React.FC<{
  count: number;
  busy: boolean;
  onApply: (op: { multiplier: number } | { delta: number }) => Promise<void>;
  onClose: () => void;
}> = ({ count, busy, onApply, onClose }) => {
  const { t } = useTranslation('keywords');
  const [mode, setMode] = useState<'multiplier' | 'delta'>('multiplier');
  const [multiplier, setMultiplier] = useState(1.0);
  const [delta, setDelta] = useState(0.05);

  const apply = () => {
    if (mode === 'multiplier') {
      onApply({ multiplier });
    } else {
      onApply({ delta });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40">
      <div
        className="bg-white rounded-lg shadow-xl border border-zinc-200 w-[420px] p-5"
        data-testid="bulk-change-bid-modal"
      >
        <h2 className="text-sm font-semibold text-zinc-900 mb-3">
          {t('bulk.modal.title', { count })}
        </h2>
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setMode('multiplier')}
            className={`flex-1 h-8 text-xs rounded-md border ${mode === 'multiplier' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200'}`}
          >
            {t('bulk.modal.modeMultiplier')}
          </button>
          <button
            type="button"
            onClick={() => setMode('delta')}
            className={`flex-1 h-8 text-xs rounded-md border ${mode === 'delta' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200'}`}
          >
            {t('bulk.modal.modeDelta')}
          </button>
        </div>
        {mode === 'multiplier' ? (
          <label className="block text-[11px] text-zinc-500 mb-1">
            {t('bulk.modal.multiplierLabel')}
            <input
              type="number"
              value={multiplier}
              min={0.1}
              max={5}
              step={0.05}
              onChange={(e) => setMultiplier(parseFloat(e.target.value) || 1)}
              className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              data-testid="bulk-bid-multiplier"
            />
          </label>
        ) : (
          <label className="block text-[11px] text-zinc-500 mb-1">
            {t('bulk.modal.deltaLabel')}
            <input
              type="number"
              value={delta}
              step={0.01}
              onChange={(e) => setDelta(parseFloat(e.target.value) || 0)}
              className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              data-testid="bulk-bid-delta"
            />
          </label>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-8 px-3 text-xs rounded-md border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {t('bulk.modal.cancel')}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={busy}
            className="h-8 px-3 text-xs rounded-md bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
            data-testid="bulk-bid-apply"
          >
            {t('bulk.modal.apply')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Small subcomponents (unchanged from previous version).
// ────────────────────────────────────────────────────────────────────────────

const SearchInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({
  value,
  onChange,
}) => {
  const { t } = useTranslation('keywords');
  return (
    <div className="relative">
      <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('filters.search.placeholder')}
        className="
          h-7 pl-7 pr-2 w-56 text-xs rounded-md
          border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400
          focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
        "
      />
    </div>
  );
};

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
}> = ({ value, onChange }) => {
  const { t } = useTranslation('keywords');
  return (
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
        aria-label={t('filters.sort.ariaLabel')}
      >
        {SORT_KEYS.map((key) => (
          <option key={key} value={key}>
            {t(`filters.sort.${key}` as 'filters.sort.cost')}
          </option>
        ))}
      </select>
    </div>
  );
};
