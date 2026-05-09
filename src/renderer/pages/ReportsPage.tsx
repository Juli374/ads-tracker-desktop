import React, { useEffect, useMemo, useState } from 'react';
import { Download, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  metricsApi,
  DailySummary,
  WeeklySummary,
  DailySummaryMetric,
  WeeklySummaryMetric,
  MarketplaceSummary,
} from '../api/metrics';
import {
  PageHeader,
  RangePicker,
  Card,
  Kpi,
  EmptyState,
  LoadingRow,
  ChartTooltip,
  ChartTooltipRow,
  ActiveFiltersBar,
} from '../components/ui';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import { dateRangeFor, RangeId, RANGE_IDS } from '../lib/dateRange';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { toCsv, downloadCsv } from '../lib/csv';
import { useToast } from '../contexts/ToastContext';
import {
  useGlobalFilters,
  useGlobalFilterChips,
} from '../contexts/GlobalFiltersContext';
import { useBooks } from '../contexts/BooksContext';
import { BreakdownTab } from '../components/reports/BreakdownTab';
import { MatrixTab } from '../components/reports/MatrixTab';

type ReportTab =
  | 'overview'
  | 'marketplace'
  | 'account'
  | 'book'
  | 'campaign'
  | 'keyword'
  | 'matrix'
  | 'placement'
  | 'match_type'
  | 'targeting_type'
  | 'bidding_strategy'
  | 'campaign_type';

const TAB_IDS: ReportTab[] = [
  'overview',
  'marketplace',
  'account',
  'book',
  'campaign',
  'keyword',
  'matrix',
  'placement',
  'match_type',
  'targeting_type',
  'bidding_strategy',
  'campaign_type',
];

const BREAKDOWN_CONFIG: Record<
  Exclude<ReportTab, 'overview' | 'matrix'>,
  { endpoint: string; pluralKey: string; dimensionField: string }
> = {
  marketplace: {
    endpoint: '/api/metrics/summary/by-marketplace',
    pluralKey: 'marketplaces',
    dimensionField: 'key',
  },
  account: {
    endpoint: '/api/metrics/summary/by-account',
    pluralKey: 'accounts',
    dimensionField: 'account',
  },
  book: {
    endpoint: '/api/metrics/summary/by-book',
    pluralKey: 'books',
    dimensionField: 'title',
  },
  campaign: {
    endpoint: '/api/metrics/summary/by-campaign',
    pluralKey: 'campaigns',
    dimensionField: 'campaign_name',
  },
  keyword: {
    endpoint: '/api/metrics/summary/by-keyword',
    pluralKey: 'keywords',
    dimensionField: 'keyword_text',
  },
  placement: {
    endpoint: '/api/metrics/summary/by-placement',
    pluralKey: 'placements',
    dimensionField: 'placement',
  },
  match_type: {
    endpoint: '/api/metrics/summary/by-match-type',
    pluralKey: 'match_types',
    dimensionField: 'match_type',
  },
  targeting_type: {
    endpoint: '/api/metrics/summary/by-targeting-type',
    pluralKey: 'targeting_types',
    dimensionField: 'targeting_type',
  },
  bidding_strategy: {
    endpoint: '/api/metrics/summary/by-bidding-strategy',
    pluralKey: 'bidding_strategies',
    dimensionField: 'bidding_strategy',
  },
  campaign_type: {
    endpoint: '/api/metrics/summary/by-campaign-type',
    pluralKey: 'campaign_types',
    dimensionField: 'campaign_type',
  },
};

type Granularity = 'daily' | 'weekly';

interface PeriodRow {
  label: string;
  range: string;
  spend: number;
  sales: number;
  orders: number;
  clicks: number;
  acos: number;
  royalty: number | null;
  profit: number | null;
}

export const ReportsPage: React.FC = () => {
  const { t } = useTranslation('reports');
  const toast = useToast();
  const { filters: globalFilters } = useGlobalFilters();
  const { list: booksList } = useBooks();
  const chips = useGlobalFilterChips(booksList);
  const [tab, setTab] = useState<ReportTab>('overview');
  const [range, setRange] = useState<RangeId>('30d');
  const [granularity, setGranularity] = useState<Granularity>('weekly');
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [byMp, setByMp] = useState<MarketplaceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const { from, to } = useMemo(() => dateRangeFor(range), [range]);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      const common = {
        from,
        to,
        attribution: '7d' as const,
        marketplaces: globalFilters.marketplaces.length
          ? globalFilters.marketplaces
          : undefined,
        bookIds: globalFilters.bookId != null ? [globalFilters.bookId] : undefined,
        accounts: globalFilters.accounts.length ? globalFilters.accounts : undefined,
      };
      try {
        const [d, w, mp] = await Promise.all([
          metricsApi.summaryDaily(common),
          metricsApi.summaryWeekly(common),
          metricsApi.summaryByMarketplace(common),
        ]);
        setDaily(d);
        setWeekly(w);
        setByMp(mp);
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : t('errors.load'),
        );
      } finally {
        setLoading(false);
      }
    },
    [from, to, toast, globalFilters.marketplaces, globalFilters.bookId, globalFilters.accounts],
  );

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo<PeriodRow[]>(() => {
    if (granularity === 'daily' && daily) {
      return daily.daily.map(toPeriodRowDaily);
    }
    if (granularity === 'weekly' && weekly) {
      return weekly.weekly.map(toPeriodRowWeekly);
    }
    return [];
  }, [granularity, daily, weekly]);

  const totals = useMemo(() => {
    const acc = rows.reduce(
      (a, r) => ({
        spend: a.spend + r.spend,
        sales: a.sales + r.sales,
        orders: a.orders + r.orders,
        royalty: a.royalty + (r.royalty || 0),
        profit: a.profit + (r.profit || 0),
      }),
      { spend: 0, sales: 0, orders: 0, royalty: 0, profit: 0 },
    );
    return {
      ...acc,
      acos: acc.sales > 0 ? (acc.spend / acc.sales) * 100 : 0,
      tacos: acc.royalty > 0 ? (acc.spend / acc.royalty) * 100 : 0,
    };
  }, [rows]);

  const handleExport = () => {
    const columns = [
      'period',
      'range',
      'spend',
      'sales',
      'orders',
      'clicks',
      'acos',
      'royalty',
      'profit',
    ];
    const data = rows.map((r) => ({
      period: r.label,
      range: r.range,
      spend: r.spend.toFixed(2),
      sales: r.sales.toFixed(2),
      orders: r.orders,
      clicks: r.clicks,
      acos: r.acos.toFixed(2),
      royalty: (r.royalty ?? 0).toFixed(2),
      profit: (r.profit ?? 0).toFixed(2),
    }));
    downloadCsv(
      `ads-tracker-${granularity}-${from}-${to}.csv`,
      toCsv(data, columns),
    );
    toast.success(
      granularity === 'daily'
        ? t('summary.exported', { count: rows.length })
        : t('summary.exportedWeeks', { count: rows.length }),
    );
  };

  return (
    <div className="space-y-6" data-testid="reports-page">
      <PageHeader
        title={t('title')}
        subtitle={
          daily || weekly
            ? granularity === 'daily'
              ? t('subtitleDays', { from, to, count: rows.length })
              : t('subtitleWeeks', { from, to, count: rows.length })
            : t('loading')
        }
        rightSlot={
          <RangePicker
            value={range}
            onChange={setRange}
            onRefresh={() => load()}
            refreshing={loading}
            ranges={RANGE_IDS}
            autoRefresh={{ storageKey: 'auto-refresh-reports' }}
          />
        }
      />

      <ActiveFiltersBar chips={chips} />

      {/* Tabs */}
      <div role="tablist" className="flex items-center gap-1 border-b border-zinc-200 overflow-x-auto">
        {TAB_IDS.map((tabId) => {
          const label = t(`tabs.${tabId}` as 'tabs.overview');
          return (
            <button
              key={tabId}
              role="tab"
              data-testid={`reports-tab-${tabId}`}
              aria-selected={tab === tabId}
              aria-label={t('tabs.ariaLabel', { label })}
              type="button"
              onClick={() => setTab(tabId)}
              className={`
                h-9 px-3 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap
                ${tab === tabId
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900'}
              `}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab !== 'overview' && tab !== 'matrix' && (
        <BreakdownTab
          {...BREAKDOWN_CONFIG[tab]}
          dimensionLabel={t(`tabs.${tab}` as 'tabs.placement')}
          dimensionFormat={(raw) =>
            String(raw ?? '—')
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase())
          }
          from={from}
          to={to}
          attribution="7d"
          marketplaces={
            globalFilters.marketplaces.length ? globalFilters.marketplaces : undefined
          }
          bookIds={globalFilters.bookId != null ? [globalFilters.bookId] : undefined}
          accounts={globalFilters.accounts.length ? globalFilters.accounts : undefined}
        />
      )}

      {tab === 'matrix' && (
        <MatrixTab
          from={from}
          to={to}
          attribution="7d"
          marketplaces={
            globalFilters.marketplaces.length ? globalFilters.marketplaces : undefined
          }
          bookIds={globalFilters.bookId != null ? [globalFilters.bookId] : undefined}
          accounts={globalFilters.accounts.length ? globalFilters.accounts : undefined}
        />
      )}

      {tab === 'overview' && <>

      <div className="grid grid-cols-4 gap-3">
        <Kpi label={t('kpi.spend')} value={fmtMoney(totals.spend)} loading={loading} />
        <Kpi label={t('kpi.sales')} value={fmtMoney(totals.sales)} loading={loading} />
        <Kpi
          label={t('kpi.acos')}
          value={fmtPct(totals.acos)}
          loading={loading}
          tone={totals.acos > 100 ? 'negative' : 'default'}
        />
        <Kpi label={t('kpi.tacos')} value={fmtPct(totals.tacos)} loading={loading} />
      </div>

      {/* Daily spend/sales line chart */}
      <Card
        title={
          <div className="flex items-center gap-2" data-testid="reports-daily-card">
            <BarChart3 size={14} className="text-zinc-400" />
            {t('daily.title')}
          </div>
        }
      >
        {loading && !daily ? (
          <LoadingRow />
        ) : !daily || daily.daily.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="px-2 py-3 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={daily.daily}
                margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
              >
                <CartesianGrid stroke="#f4f4f5" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e4e4e7' }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e4e4e7' }}
                  width={48}
                />
                <Tooltip content={<DailyTooltip />} cursor={{ stroke: '#e4e4e7' }} />
                <Legend
                  iconType="plainline"
                  wrapperStyle={{ fontSize: 11, color: '#52525b' }}
                />
                <Line
                  type="monotone"
                  dataKey="spend"
                  name={t('daily.spend')}
                  stroke="#3f3f46"
                  strokeWidth={1.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="sales"
                  name={t('daily.sales')}
                  stroke="#a1a1aa"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Periodic breakdown */}
      <Card
        title={
          <div className="flex items-center gap-2" data-testid="reports-summary-card">
            <BarChart3 size={14} className="text-zinc-400" />
            {t('summary.title')}
          </div>
        }
        rightSlot={
          <div className="flex items-center gap-2">
            <GranularityToggle value={granularity} onChange={setGranularity} />
            <button
              onClick={handleExport}
              disabled={rows.length === 0 || loading}
              className="
                inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md
                text-xs text-zinc-700 border border-zinc-200 bg-white
                hover:bg-zinc-50 transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed
              "
            >
              <Download size={12} />
              CSV
            </button>
          </div>
        }
      >
        {loading && rows.length === 0 ? (
          <LoadingRow />
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="w-full text-sm table-sticky-head">
            <thead>
              <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2 font-medium">{t('summary.th.period')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('summary.th.spend')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('summary.th.sales')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('summary.th.orders')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('summary.th.clicks')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('summary.th.acos')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('summary.th.royalty')}</th>
                <th className="text-right px-5 py-2 font-medium">{t('summary.th.profit')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.label}
                  className="border-t border-zinc-100 hover:bg-zinc-50/60"
                >
                  <td className="px-5 py-2.5">
                    <div className="text-xs text-zinc-900 font-medium">
                      {r.label}
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      {r.range}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
                    {fmtMoney(r.spend)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
                    {fmtMoney(r.sales)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
                    {r.orders}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-600 text-right tabular-nums">
                    {fmtNumber(r.clicks)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-right tabular-nums">
                    <span className={r.acos > 100 ? 'text-red-600' : 'text-zinc-700'}>
                      {r.acos > 0 ? fmtPct(r.acos) : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-600 text-right tabular-nums">
                    {r.royalty != null && r.royalty > 0 ? fmtMoney(r.royalty) : '—'}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-right tabular-nums">
                    <span
                      className={
                        r.profit == null
                          ? 'text-zinc-400'
                          : r.profit < 0
                          ? 'text-red-600'
                          : 'text-emerald-600'
                      }
                    >
                      {r.profit != null ? fmtMoney(r.profit) : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* By marketplace */}
      <Card title={t('marketplace.title')} data-testid="reports-mp-card">
        {loading && !byMp ? (
          <LoadingRow />
        ) : !byMp || Object.keys(byMp.marketplaces).length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="px-2 py-3 h-[220px] border-b border-zinc-100">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={Object.entries(byMp.marketplaces)
                    .map(([code, m]) => ({
                      code,
                      spend: m.cost,
                      sales: m.sales,
                    }))
                    .sort((a, b) => b.spend - a.spend)}
                  margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
                >
                  <CartesianGrid stroke="#f4f4f5" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#a1a1aa' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e4e4e7' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="code"
                    tick={{ fontSize: 10, fill: '#a1a1aa' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e4e4e7' }}
                    width={48}
                  />
                  <Tooltip
                    content={<MarketplaceTooltip />}
                    cursor={{ fill: '#f4f4f5' }}
                  />
                  <Bar dataKey="spend" fill="#3f3f46" radius={[2, 2, 2, 2]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="w-full text-sm table-sticky-head">
            <thead>
              <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2 font-medium">{t('marketplace.th.marketplace')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('marketplace.th.spend')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('marketplace.th.sales')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('marketplace.th.orders')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('marketplace.th.acos')}</th>
                <th className="text-right px-5 py-2 font-medium">{t('marketplace.th.tacos')}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byMp.marketplaces)
                .sort(([, a], [, b]) => b.cost - a.cost)
                .map(([code, m]) => (
                  <tr
                    key={code}
                    className="border-t border-zinc-100 hover:bg-zinc-50/60"
                  >
                    <td className="px-5 py-2.5 text-xs text-zinc-900 uppercase font-medium">
                      {code}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
                      {fmtMoney(m.cost)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
                      {fmtMoney(m.sales)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
                      {m.orders}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-right tabular-nums">
                      <span className={m.acos > 100 ? 'text-red-600' : 'text-zinc-700'}>
                        {m.acos > 0 ? fmtPct(m.acos) : '—'}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
                      {m.tacos != null && m.tacos > 0 ? fmtPct(m.tacos) : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          </>
        )}
      </Card>
      </>}
    </div>
  );
};

interface TooltipPayload {
  payload: Record<string, unknown>;
  color?: string;
  name?: string;
  dataKey?: string;
}

interface RechartsTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

const DailyTooltip: React.FC<RechartsTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;
  const rows: ChartTooltipRow[] = payload.map((p) => ({
    label: p.name ?? String(p.dataKey),
    value: fmtMoney(Number(p.payload[String(p.dataKey)] ?? 0)),
    color: p.color,
  }));
  return <ChartTooltip active title={label} rows={rows} />;
};

const MarketplaceTooltip: React.FC<RechartsTooltipProps> = ({ active, payload }) => {
  const { t } = useTranslation('reports');
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload as { code: string; spend: number; sales: number };
  const rows: ChartTooltipRow[] = [
    { label: t('marketplace.tooltipSpend'), value: fmtMoney(data.spend), color: '#3f3f46' },
    { label: t('marketplace.tooltipSales'), value: fmtMoney(data.sales), color: '#a1a1aa' },
  ];
  return <ChartTooltip active title={data.code} rows={rows} />;
};

const GranularityToggle: React.FC<{
  value: Granularity;
  onChange: (v: Granularity) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation('reports');
  return (
    <div className="inline-flex items-center bg-white border border-zinc-200 rounded-md p-0.5">
      {(['daily', 'weekly'] as const).map((g) => (
        <button
          key={g}
          onClick={() => onChange(g)}
          className={`
            px-2.5 h-6 text-[11px] font-medium rounded
            transition-colors
            ${value === g
              ? 'bg-zinc-100 text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-900'}
          `}
        >
          {g === 'daily' ? t('summary.granularityDaily') : t('summary.granularityWeekly')}
        </button>
      ))}
    </div>
  );
};

function toPeriodRowDaily(d: DailySummaryMetric): PeriodRow {
  return {
    label: d.date,
    range: d.date,
    spend: d.spend,
    sales: d.sales,
    orders: d.orders,
    clicks: d.clicks,
    acos: d.acos,
    royalty: d.royalty,
    profit: d.profit,
  };
}

function toPeriodRowWeekly(w: WeeklySummaryMetric): PeriodRow {
  return {
    label: `${w.week_start} → ${w.week_end}`,
    range: `${w.week_start} … ${w.week_end}`,
    spend: w.spend,
    sales: w.sales,
    orders: w.orders,
    clicks: w.clicks,
    acos: w.acos,
    royalty: w.royalty,
    profit: w.profit,
  };
}
