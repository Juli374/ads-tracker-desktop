import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { Download, Cloud, HardDrive } from 'lucide-react';
import {
  ActiveFiltersBar,
  PageHeader,
  RangePicker,
  SegmentedControl,
} from '../components/ui';
import { dateRangeFor, RangeId } from '../lib/dateRange';
import {
  useGlobalFilters,
  useGlobalFilterChips,
} from '../contexts/GlobalFiltersContext';
import { useBooks } from '../contexts/BooksContext';
import { useToast } from '../contexts/ToastContext';
import { computePnL, type PnLData, type PnLSource } from '../api/pnl';
import { metricsApi, type DailySummary } from '../api/metrics';
import { ApiError } from '../api/client';
import { PnLKpiRow } from '../components/pnl/PnLKpiRow';
import { PnLMatrix } from '../components/pnl/PnLMatrix';
import { PnLChart } from '../components/pnl/PnLChart';
import { downloadExcel, type ExportColumn } from '../lib/export';

const SOURCE_KEY = 'pnl:source';

function readSource(): PnLSource {
  if (typeof window === 'undefined') return 'cloud';
  const v = window.localStorage?.getItem(SOURCE_KEY);
  return v === 'local' ? 'local' : 'cloud';
}

export const PnLPage: React.FC = () => {
  const { t } = useTranslation('pnl');
  const toast = useToast();
  const { filters: globalFilters } = useGlobalFilters();
  const { list: booksList } = useBooks();
  const chips = useGlobalFilterChips(booksList);

  const [range, setRange] = useState<RangeId>('30d');
  // Phase Q.4.1 — attribution is now globally controlled via topbar
  // GlobalAttributionToggle (was local state here, hardcoded "14d" elsewhere).
  const attribution = globalFilters.attribution;
  const [source, setSource] = useState<PnLSource>(readSource);
  const [data, setData] = useState<PnLData | null>(null);
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage?.setItem(SOURCE_KEY, source);
  }, [source]);

  const { from, to } = useMemo(() => dateRangeFor(range), [range]);

  // Build per-book print cost map from BooksContext. Backend currently doesn't
  // expose a `print_cost` field on /api/books; printCost stays 0 until field appears.
  const printCostByBookId = useMemo<Record<number, number>>(() => {
    const out: Record<number, number> = {};
    for (const b of booksList) {
      // future: read b.print_cost / b.paperback_cost when backend adds it
      const maybe = (b as unknown as Record<string, unknown>).print_cost;
      if (typeof maybe === 'number' && Number.isFinite(maybe)) {
        out[b.id] = maybe;
      }
    }
    return out;
  }, [booksList]);

  const filterParams = useMemo(
    () => ({
      from,
      to,
      attribution,
      marketplaces: globalFilters.marketplaces.length
        ? globalFilters.marketplaces
        : undefined,
      bookIds: globalFilters.bookId != null ? [globalFilters.bookId] : undefined,
      accounts: globalFilters.accounts.length ? globalFilters.accounts : undefined,
    }),
    [from, to, attribution, globalFilters],
  );

  const load = useMemo(
    () => async () => {
      setLoading(true);
      const [pnlRes, dailyRes] = await Promise.allSettled([
        computePnL({ ...filterParams, source, printCostByBookId }),
        metricsApi.summaryDaily(filterParams),
      ]);
      if (pnlRes.status === 'fulfilled') {
        setData(pnlRes.value);
      } else {
        setData(null);
        const err = pnlRes.reason;
        toast.error(
          err instanceof ApiError
            ? err.message
            : i18n.t('errors.load', { ns: 'pnl' }),
        );
      }
      if (dailyRes.status === 'fulfilled') setDaily(dailyRes.value);
      else setDaily(null);
      setLoading(false);
    },
    [filterParams, source, printCostByBookId, toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  const subtitle = data
    ? t('subtitle.loaded', { from: data.from, to: data.to, window: data.attribution })
    : t('subtitle.loading');

  const exportColumns: ExportColumn[] = [
    { key: 'title', label: 'Book' },
    { key: 'marketplace', label: 'MP' },
    { key: 'revenue', label: 'Revenue', align: 'right' },
    { key: 'spend', label: 'Spend', align: 'right' },
    { key: 'printCost', label: 'Print cost', align: 'right' },
    { key: 'returns', label: 'Returns', align: 'right' },
    { key: 'netProfit', label: 'Net profit', align: 'right' },
    { key: 'marginPct', label: 'Margin %', align: 'right' },
  ];

  const handleExport = () => {
    if (!data || data.rows.length === 0) return;
    try {
      const rows = data.rows.map((r) => ({
        title: r.title,
        marketplace: r.marketplace,
        revenue: r.revenue.toFixed(2),
        spend: r.spend.toFixed(2),
        printCost: r.printCost.toFixed(2),
        returns: r.returns.toFixed(2),
        netProfit: r.netProfit.toFixed(2),
        marginPct: (r.margin * 100).toFixed(2),
      }));
      const filename = t('exportFilename', { from, to });
      downloadExcel(filename, rows, exportColumns, 'P&L');
      toast.success(t('exportSuccess', { count: rows.length }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.exportFailed'));
    }
  };

  const totals = data?.totals ?? {
    revenue: 0,
    spend: 0,
    printCost: 0,
    returns: 0,
    netProfit: 0,
    margin: 0,
  };

  return (
    <div className="space-y-6" data-testid="pnl-page">
      <PageHeader
        title={t('title')}
        subtitle={subtitle}
        rightSlot={
          <div className="flex items-center gap-2">
            {/* Phase Q.4.1 — AttributionToggle moved to topbar (global). */}
            <SourceToggle value={source} onChange={setSource} />
            <RangePicker
              value={range}
              onChange={setRange}
              onRefresh={() => load()}
              refreshing={loading}
              ranges={['7d', '30d', '90d', 'mtd', 'lastMonth']}
              autoRefresh={{ storageKey: 'auto-refresh-pnl' }}
            />
            <button
              type="button"
              data-testid="pnl-export"
              onClick={handleExport}
              disabled={!data || data.rows.length === 0}
              className="
                inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium
                text-zinc-700 border border-zinc-200 bg-white
                hover:bg-zinc-50 hover:text-zinc-900 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
              title={t('exportButton')}
            >
              <Download size={11} />
              {t('exportButton')}
            </button>
          </div>
        }
      />

      <ActiveFiltersBar chips={chips} />

      <PnLKpiRow totals={totals} loading={loading && !data} />

      <PnLMatrix rows={data?.rows ?? []} loading={loading && !data} />

      <PnLChart daily={daily?.daily ?? []} loading={loading && !daily} />
    </div>
  );
};

// Phase Q.1 — SourceToggle migrated to SegmentedControl primitive (was inline radiogroup).
const SourceToggle: React.FC<{
  value: PnLSource;
  onChange: (s: PnLSource) => void;
}> = ({ value, onChange }) => (
  <SegmentedControl<PnLSource>
    value={value}
    onChange={onChange}
    options={[
      { value: 'cloud', label: 'Cloud', icon: <Cloud size={11} />, testId: 'pnl-source-cloud' },
      { value: 'local', label: 'Local', icon: <HardDrive size={11} />, testId: 'pnl-source-local' },
    ]}
    size="sm"
    aria-label="P&L source"
  />
);

// Phase Q.4.1 — AttributionToggle removed from PnL; lifted to topbar
// via GlobalAttributionToggle (see MainLayout.tsx).
