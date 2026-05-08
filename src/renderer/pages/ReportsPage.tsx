import React, { useEffect, useMemo, useState } from 'react';
import { Download, BarChart3 } from 'lucide-react';
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
  ErrorBanner,
  EmptyState,
  LoadingRow,
} from '../components/ui';
import { dateRangeFor, RangeId, RANGES } from '../lib/dateRange';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';

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
  const [range, setRange] = useState<RangeId>('30d');
  const [granularity, setGranularity] = useState<Granularity>('weekly');
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [byMp, setByMp] = useState<MarketplaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { from, to } = useMemo(() => dateRangeFor(range), [range]);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setError(null);
      try {
        const [d, w, mp] = await Promise.all([
          metricsApi.summaryDaily({ from, to, attribution: '7d' }),
          metricsApi.summaryWeekly({ from, to, attribution: '7d' }),
          metricsApi.summaryByMarketplace({ from, to, attribution: '7d' }),
        ]);
        setDaily(d);
        setWeekly(w);
        setByMp(mp);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Не удалось загрузить отчёты',
        );
      } finally {
        setLoading(false);
      }
    },
    [from, to],
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
    const headers = [
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
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.label,
          r.range,
          r.spend.toFixed(2),
          r.sales.toFixed(2),
          r.orders,
          r.clicks,
          r.acos.toFixed(2),
          (r.royalty ?? 0).toFixed(2),
          (r.profit ?? 0).toFixed(2),
        ].join(','),
      );
    }
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ads-tracker-${granularity}-${from}-${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Отчёты"
        subtitle={
          daily || weekly
            ? `${from} → ${to} · ${rows.length} ${granularity === 'daily' ? 'дней' : 'недель'}`
            : 'Загрузка…'
        }
        rightSlot={
          <RangePicker
            value={range}
            onChange={setRange}
            onRefresh={() => load()}
            refreshing={loading}
            ranges={RANGES}
          />
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-4 gap-3">
        <Kpi label="Spend" value={fmtMoney(totals.spend)} loading={loading} />
        <Kpi label="Sales" value={fmtMoney(totals.sales)} loading={loading} />
        <Kpi
          label="ACOS"
          value={fmtPct(totals.acos)}
          loading={loading}
          tone={totals.acos > 100 ? 'negative' : 'default'}
        />
        <Kpi label="TACoS" value={fmtPct(totals.tacos)} loading={loading} />
      </div>

      {/* Periodic breakdown */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <BarChart3 size={14} className="text-zinc-400" />
            Динамика
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
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2 font-medium">Период</th>
                <th className="text-right px-3 py-2 font-medium">Spend</th>
                <th className="text-right px-3 py-2 font-medium">Sales</th>
                <th className="text-right px-3 py-2 font-medium">Orders</th>
                <th className="text-right px-3 py-2 font-medium">Clicks</th>
                <th className="text-right px-3 py-2 font-medium">ACOS</th>
                <th className="text-right px-3 py-2 font-medium">Royalty</th>
                <th className="text-right px-5 py-2 font-medium">Profit</th>
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
      <Card title="По маркетплейсам">
        {loading && !byMp ? (
          <LoadingRow />
        ) : !byMp || Object.keys(byMp.marketplaces).length === 0 ? (
          <EmptyState />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2 font-medium">MP</th>
                <th className="text-right px-3 py-2 font-medium">Spend</th>
                <th className="text-right px-3 py-2 font-medium">Sales</th>
                <th className="text-right px-3 py-2 font-medium">Orders</th>
                <th className="text-right px-3 py-2 font-medium">ACOS</th>
                <th className="text-right px-5 py-2 font-medium">TACoS</th>
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
        )}
      </Card>
    </div>
  );
};

const GranularityToggle: React.FC<{
  value: Granularity;
  onChange: (v: Granularity) => void;
}> = ({ value, onChange }) => (
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
        {g === 'daily' ? 'По дням' : 'По неделям'}
      </button>
    ))}
  </div>
);

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
