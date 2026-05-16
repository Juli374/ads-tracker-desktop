import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  metricsApi,
  type BookMetric,
  type BookSummary,
  type CampaignAnalyticsItem,
  type KeywordAnalyticsItem,
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
import { useNav } from '../contexts/NavContext';

const RANGE_IDS: RangeId[] = ['7d', '30d', '90d', 'mtd', 'ytd'];

export type ComparisonDimension =
  | 'book'
  | 'campaign'
  | 'keyword'
  | 'marketplace'
  | 'account'
  | 'placement'
  | 'match_type';

const DIMENSIONS: ComparisonDimension[] = [
  'book',
  'campaign',
  'keyword',
  'marketplace',
  'account',
  'placement',
  'match_type',
];

interface PeriodTotals {
  cost: number;
  sales: number;
  orders: number;
  clicks: number;
  acos: number;
}

interface ComparisonRow {
  key: string;
  label: string;
  cover_image?: string | null;
  marketplace?: string | null;
  campaignId?: number;
  spendA: number;
  spendB: number;
  salesA: number;
  salesB: number;
  ordersA: number;
  ordersB: number;
  acosA: number;
  acosB: number;
}

const totalsOfRows = (rows: ComparisonRow[], side: 'A' | 'B'): PeriodTotals => {
  const sumKey = side === 'A' ? 'spendA' : 'spendB';
  const salesKey = side === 'A' ? 'salesA' : 'salesB';
  const ordersKey = side === 'A' ? 'ordersA' : 'ordersB';
  const acc = rows.reduce(
    (a, r) => ({
      cost: a.cost + (r[sumKey] || 0),
      sales: a.sales + (r[salesKey] || 0),
      orders: a.orders + (r[ordersKey] || 0),
      clicks: 0,
    }),
    { cost: 0, sales: 0, orders: 0, clicks: 0 },
  );
  return { ...acc, acos: acc.sales > 0 ? (acc.cost / acc.sales) * 100 : 0 };
};

const totalsOfBookSummary = (sum: BookSummary | null): PeriodTotals => {
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

const pctDelta = (after: number, before: number): number | null => {
  if (!Number.isFinite(before) || before === 0) return null;
  return ((after - before) / before) * 100;
};

interface FetchParams {
  from: string;
  to: string;
  attribution: '1d' | '7d' | '14d' | '30d';
  marketplaces?: string[];
  bookIds?: number[];
  accounts?: string[];
}

async function fetchByDimension(
  dim: ComparisonDimension,
  params: FetchParams,
): Promise<ComparisonRow[]> {
  if (dim === 'book') {
    const res = await metricsApi.summaryByBook(params);
    return res.books.map((b: BookMetric) => ({
      key: `${b.book_id}-${b.marketplace ?? ''}`,
      label: b.title,
      cover_image: b.cover_image,
      marketplace: b.marketplace,
      spendA: 0,
      spendB: b.cost ?? 0,
      salesA: 0,
      salesB: b.sales ?? 0,
      ordersA: 0,
      ordersB: b.orders ?? 0,
      acosA: 0,
      acosB: b.acos ?? 0,
    }));
  }
  if (dim === 'campaign') {
    const res = await metricsApi.summaryByCampaign(params);
    return res.campaigns.map((c: CampaignAnalyticsItem) => ({
      key: `${c.campaign_id}`,
      label: c.campaign_name,
      marketplace: c.marketplace,
      campaignId: c.campaign_id,
      spendA: 0,
      spendB: c.cost ?? 0,
      salesA: 0,
      salesB: c.sales ?? 0,
      ordersA: 0,
      ordersB: c.orders ?? 0,
      acosA: 0,
      acosB: c.acos ?? 0,
    }));
  }
  if (dim === 'keyword') {
    const res = await metricsApi.summaryByKeyword(params);
    return res.keywords.map((k: KeywordAnalyticsItem) => ({
      key: `${k.keyword_id}`,
      label: k.keyword_text,
      marketplace: k.marketplace,
      campaignId: k.campaign_id,
      spendA: 0,
      spendB: k.cost ?? 0,
      salesA: 0,
      salesB: k.sales ?? 0,
      ordersA: 0,
      ordersB: k.orders ?? 0,
      acosA: 0,
      acosB: k.acos ?? 0,
    }));
  }
  // Generic breakdowns: marketplace / account / placement / match_type
  const dimConfig: Record<string, { endpoint: string; pluralKey: string; field: string }> = {
    marketplace: {
      endpoint: '/api/metrics/summary/by-marketplace',
      pluralKey: 'marketplaces',
      field: 'key',
    },
    account: {
      endpoint: '/api/metrics/summary/by-account',
      pluralKey: 'accounts',
      field: 'account',
    },
    placement: {
      endpoint: '/api/metrics/summary/by-placement',
      pluralKey: 'placements',
      field: 'placement',
    },
    match_type: {
      endpoint: '/api/metrics/summary/by-match-type',
      pluralKey: 'match_types',
      field: 'match_type',
    },
  };
  const cfg = dimConfig[dim];
  const res = await metricsApi.breakdown(cfg.endpoint, cfg.pluralKey, params);
  return res.items.map((it, i) => {
    const num = (k: string, fallback = 0): number => {
      const v = it[k];
      return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    };
    const labelRaw = String((it[cfg.field] as unknown) ?? '—');
    return {
      key: `${dim}-${labelRaw}-${i}`,
      label: labelRaw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      spendA: 0,
      spendB: num('cost', num('spend')),
      salesA: 0,
      salesB: num('sales'),
      ordersA: 0,
      ordersB: num('orders'),
      acosA: 0,
      acosB: num('acos'),
    };
  });
}

function mergeAB(rowsA: ComparisonRow[], rowsB: ComparisonRow[]): ComparisonRow[] {
  const aMap = new Map<string, ComparisonRow>();
  rowsA.forEach((r) => aMap.set(r.key, r));
  const bMap = new Map<string, ComparisonRow>();
  rowsB.forEach((r) => bMap.set(r.key, r));
  const allKeys = new Set([...aMap.keys(), ...bMap.keys()]);
  return Array.from(allKeys)
    .map((k) => {
      const a = aMap.get(k);
      const b = bMap.get(k);
      const meta = a ?? b;
      if (!meta) return null;
      return {
        key: k,
        label: meta.label,
        cover_image: meta.cover_image,
        marketplace: meta.marketplace,
        campaignId: meta.campaignId,
        spendA: a?.spendB ?? 0,
        spendB: b?.spendB ?? 0,
        salesA: a?.salesB ?? 0,
        salesB: b?.salesB ?? 0,
        ordersA: a?.ordersB ?? 0,
        ordersB: b?.ordersB ?? 0,
        acosA: a?.acosB ?? 0,
        acosB: b?.acosB ?? 0,
      } as ComparisonRow;
    })
    .filter((x): x is ComparisonRow => x !== null);
}

export const ComparisonPage: React.FC = () => {
  const { t } = useTranslation('comparison');
  const toast = useToast();
  const { navigate } = useNav();
  const { filters: globalFilters } = useGlobalFilters();
  const { list: booksList } = useBooks();
  const chips = useGlobalFilterChips(booksList);

  const [dimension, setDimension] = useState<ComparisonDimension>('book');
  const [rangeA, setRangeA] = useState<RangeId>('30d');
  const [rangeB, setRangeB] = useState<RangeId>('7d');
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [loading, setLoading] = useState(true);

  const aRange = useMemo(() => dateRangeFor(rangeA), [rangeA]);
  const bRange = useMemo(() => dateRangeFor(rangeB), [rangeB]);

  const filterParams = useMemo(
    () => ({
      attribution: '14d' as const,
      marketplaces: globalFilters.marketplaces.length ? globalFilters.marketplaces : undefined,
      bookIds: globalFilters.bookId != null ? [globalFilters.bookId] : undefined,
      accounts: globalFilters.accounts.length ? globalFilters.accounts : undefined,
    }),
    [globalFilters.marketplaces, globalFilters.bookId, globalFilters.accounts],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchByDimension(dimension, { ...filterParams, ...aRange }),
      fetchByDimension(dimension, { ...filterParams, ...bRange }),
    ])
      .then(([rowsA, rowsB]) => {
        if (!cancelled) setRows(mergeAB(rowsA, rowsB));
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err instanceof ApiError ? err.message : t('errors.load'));
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dimension, filterParams, aRange.from, aRange.to, bRange.from, bRange.to, toast]);

  const totalsA = useMemo(() => totalsOfRows(rows, 'A'), [rows]);
  const totalsB = useMemo(() => totalsOfRows(rows, 'B'), [rows]);

  const sortedRows = useMemo(
    () =>
      [...rows]
        .sort((x, y) => Math.abs(y.spendB - y.spendA) - Math.abs(x.spendB - x.spendA))
        .slice(0, 50),
    [rows],
  );

  const isInteractiveDim =
    dimension === 'campaign' || dimension === 'keyword';

  return (
    <div className="space-y-6" data-testid="comparison-page">
      <PageHeader
        title={t('title')}
        subtitle={
          rows.length > 0
            ? t('subtitle', {
                aFrom: aRange.from,
                aTo: aRange.to,
                bFrom: bRange.from,
                bTo: bRange.to,
              })
            : t('loading')
        }
        rightSlot={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <DimensionSelect value={dimension} onChange={setDimension} />
            <PeriodSelect label="A" value={rangeA} onChange={setRangeA} />
            <span className="text-zinc-300">vs</span>
            <PeriodSelect label="B" value={rangeB} onChange={setRangeB} />
          </div>
        }
      />

      <ActiveFiltersBar chips={chips} />

      {rangeA === rangeB && <ErrorBanner message={t('sameRangeWarning')} />}

      <div className="grid grid-cols-4 gap-3">
        <DeltaKpi
          label={t('kpi.spend')}
          a={totalsA.cost}
          b={totalsB.cost}
          fmt={(n) => fmtMoney(n)}
          inverse
          loading={loading && rows.length === 0}
        />
        <DeltaKpi
          label={t('kpi.sales')}
          a={totalsA.sales}
          b={totalsB.sales}
          fmt={(n) => fmtMoney(n)}
          loading={loading && rows.length === 0}
        />
        <DeltaKpi
          label={t('kpi.orders')}
          a={totalsA.orders}
          b={totalsB.orders}
          fmt={(n) => fmtNumber(n)}
          loading={loading && rows.length === 0}
        />
        <DeltaKpi
          label={t('kpi.acos')}
          a={totalsA.acos}
          b={totalsB.acos}
          fmt={(n) => fmtPct(n)}
          inverse
          loading={loading && rows.length === 0}
        />
      </div>

      <Card
        title={t('card.title', {
          dimension: t(`dimension.${dimension}` as 'dimension.book'),
        })}
      >
        {loading && rows.length === 0 ? (
          <LoadingRow />
        ) : sortedRows.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <table className="w-full text-sm table-sticky-head">
            <thead>
              <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2 font-medium">
                  {dimension === 'book'
                    ? t('th.book')
                    : t(`dimension.${dimension}` as 'dimension.campaign')}
                </th>
                {(dimension === 'book' || dimension === 'campaign' || dimension === 'keyword') && (
                  <th className="text-left px-3 py-2 font-medium">{t('th.marketplace')}</th>
                )}
                <th className="text-right px-3 py-2 font-medium">{t('th.spendA')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('th.spendB')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('th.deltaSpend')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('th.salesA')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('th.salesB')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('th.deltaSales')}</th>
                <th className="text-right px-5 py-2 font-medium">{t('th.deltaOrders')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => {
                const onClick =
                  isInteractiveDim && r.campaignId != null
                    ? () => navigate('campaign_details', { campaignId: r.campaignId })
                    : undefined;
                return (
                  <tr
                    key={r.key}
                    onClick={onClick}
                    className={`
                      border-t border-zinc-100 hover:bg-zinc-50/60
                      ${onClick ? 'cursor-pointer' : ''}
                    `}
                  >
                    <td className="px-5 py-2.5">
                      {dimension === 'book' ? (
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
                          <div className="text-xs text-zinc-900 truncate max-w-md">
                            {r.label}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-900 truncate max-w-md">
                          {r.label}
                        </div>
                      )}
                    </td>
                    {(dimension === 'book' || dimension === 'campaign' || dimension === 'keyword') && (
                      <td className="px-3 py-2.5 text-[11px] text-zinc-600 uppercase">
                        {r.marketplace || '—'}
                      </td>
                    )}
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
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

const DimensionSelect: React.FC<{
  value: ComparisonDimension;
  onChange: (v: ComparisonDimension) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation('comparison');
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] font-semibold text-zinc-500 uppercase">
        {t('dimension.label')}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ComparisonDimension)}
        className="
          h-7 pl-2 pr-7 text-xs rounded-md cursor-pointer
          border border-zinc-200 bg-white text-zinc-700
          focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
        "
        data-testid="comparison-dimension-select"
        aria-label={t('dimension.aria')}
      >
        {DIMENSIONS.map((d) => (
          <option key={d} value={d}>
            {t(`dimension.${d}` as 'dimension.book')}
          </option>
        ))}
      </select>
    </div>
  );
};

const PeriodSelect: React.FC<{
  label: string;
  value: RangeId;
  onChange: (v: RangeId) => void;
}> = ({ label, value, onChange }) => {
  const { t } = useTranslation('comparison');
  return (
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
        data-testid={`comparison-period-${label}`}
        aria-label={t('range.aria', { label })}
      >
        {RANGE_IDS.map((id) => (
          <option key={id} value={id}>
            {t(`ranges.${id}` as 'ranges.7d')}
          </option>
        ))}
      </select>
    </div>
  );
};

const DeltaKpi: React.FC<{
  label: string;
  a: number;
  b: number;
  fmt: (n: number) => string;
  inverse?: boolean;
  loading?: boolean;
}> = ({ label, a, b, fmt, inverse, loading }) => {
  const { t } = useTranslation('comparison');
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
          <span
            className={`text-xs font-medium tabular-nums inline-flex items-center gap-0.5 ${color}`}
          >
            <Icon size={11} />
            {delta == null
              ? '—'
              : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
          </span>
        </span>
      }
      hint={t('kpi.aHint', { value: fmt(a) })}
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
    <td
      className={`${last ? 'px-5' : 'px-3'} py-2.5 text-xs text-right tabular-nums ${color}`}
    >
      {delta == null
        ? '—'
        : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
    </td>
  );
};

// totalsOfBookSummary kept for backwards-compat with previous public API.
export { totalsOfBookSummary };
