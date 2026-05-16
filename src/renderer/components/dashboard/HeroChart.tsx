import React, { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DailySummaryMetric } from '../../api/metrics';
import { ChartTooltip, GradientArea, type ChartTooltipRow } from '../ui';
import { fmtMoney, fmtNumber, fmtPct } from '../../lib/format';

type MetricId =
  | 'spend'
  | 'sales'
  | 'profit'
  | 'royalty'
  | 'acos'
  | 'roi'
  | 'ctr'
  | 'orders'
  | 'clicks'
  | 'impressions'
  | 'tacos'
  | 'roas';

type Axis = 'money' | 'percent' | 'count';
type FmtKind = 'money' | 'percent' | 'count';

interface MetricSpec {
  id: MetricId;
  label: string;
  color: string;
  axis: Axis;
  fmt: FmtKind;
}

// Палитра в стиле Tailwind/zinc + 2 акцента, чтобы не сливаться с UI.
const METRICS: MetricSpec[] = [
  { id: 'spend',       label: 'Spend',       color: '#ef4444', axis: 'money',   fmt: 'money'   },
  { id: 'sales',       label: 'Sales',       color: '#10b981', axis: 'money',   fmt: 'money'   },
  { id: 'profit',      label: 'Profit',      color: '#3b82f6', axis: 'money',   fmt: 'money'   },
  { id: 'royalty',     label: 'Royalty',     color: '#8b5cf6', axis: 'money',   fmt: 'money'   },
  { id: 'acos',        label: 'ACOS',        color: '#f97316', axis: 'percent', fmt: 'percent' },
  { id: 'roi',         label: 'ROI',         color: '#0ea5e9', axis: 'percent', fmt: 'percent' },
  { id: 'ctr',         label: 'CTR',         color: '#a855f7', axis: 'percent', fmt: 'percent' },
  { id: 'tacos',       label: 'TACoS',       color: '#ec4899', axis: 'percent', fmt: 'percent' },
  { id: 'roas',        label: 'ROAS',        color: '#14b8a6', axis: 'percent', fmt: 'percent' },
  { id: 'orders',      label: 'Orders',      color: '#71717a', axis: 'count',   fmt: 'count'   },
  { id: 'clicks',      label: 'Clicks',      color: '#a1a1aa', axis: 'count',   fmt: 'count'   },
  { id: 'impressions', label: 'Impressions', color: '#d4d4d8', axis: 'count',   fmt: 'count'   },
];

const DEFAULT_ACTIVE: MetricId[] = ['spend', 'sales', 'profit', 'orders', 'acos', 'roi'];
const MAX_ACTIVE = 6;
const STORAGE_KEY = 'dashboard:hero:metrics';

function loadActive(): MetricId[] {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_ACTIVE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ACTIVE;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_ACTIVE;
    const valid = parsed.filter((id): id is MetricId =>
      METRICS.some((m) => m.id === id),
    );
    return valid.length > 0 ? valid.slice(0, MAX_ACTIVE) : DEFAULT_ACTIVE;
  } catch {
    return DEFAULT_ACTIVE;
  }
}

function fmtForKind(kind: FmtKind, n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (kind === 'money') return fmtMoney(n);
  if (kind === 'percent') return fmtPct(n);
  return fmtNumber(n);
}

// Phase Q.4 perf fix: HeroTooltip used to be redefined on every render of HeroChart
// (creating a new component identity each time, suppressing Recharts memoization).
// Hoisted to module scope; closes over METRICS which is also module-scoped.
const HeroTooltip: React.FC<{
  active?: boolean;
  payload?: ReadonlyArray<{ payload: Record<string, number>; dataKey?: string | number; color?: string }>;
  label?: string;
}> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const rows: ChartTooltipRow[] = payload.map((p) => {
    const id = String(p.dataKey) as MetricId;
    const spec = METRICS.find((m) => m.id === id);
    const value = (p.payload[id] ?? 0) as number;
    return {
      label: spec?.label ?? id,
      value: fmtForKind(spec?.fmt ?? 'count', value),
      color: p.color ?? spec?.color,
    };
  });
  return <ChartTooltip active title={label} rows={rows} />;
};

// Aggregates the per-day metric series into a single hero-mode headline value.
// Sum for cumulative metrics (money/count), average for ratios (percent).
function aggregateForHero(
  kind: FmtKind,
  data: ReadonlyArray<Record<MetricId, number>>,
  id: MetricId,
): number | null {
  if (data.length === 0) return null;
  if (kind === 'percent') {
    const vals = data.map((d) => d[id]).filter((v): v is number => Number.isFinite(v));
    if (vals.length === 0) return null;
    return vals.reduce((acc, v) => acc + v, 0) / vals.length;
  }
  return data.reduce((acc, d) => acc + (Number.isFinite(d[id]) ? d[id] : 0), 0);
}

interface HeroChartProps {
  data: DailySummaryMetric[];
  loading?: boolean;
  // Целевая ACOS для горизонтальной reference-линии.
  targetAcos?: number;
  // Если передано — компонент не использует localStorage, controlled-режим.
  activeMetrics?: MetricId[];
  onActiveChange?: (next: MetricId[]) => void;
  onLimitReached?: () => void;
}

export const HeroChart: React.FC<HeroChartProps> = ({
  data,
  loading,
  targetAcos,
  activeMetrics: controlled,
  onActiveChange,
  onLimitReached,
}) => {
  const { t } = useTranslation('dashboard');
  const [internalActive, setInternalActive] = useState<MetricId[]>(loadActive);
  const active = controlled ?? internalActive;

  useEffect(() => {
    if (controlled) return;
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(internalActive));
    } catch {
      // localStorage может быть отключён — молча игнорируем.
    }
  }, [internalActive, controlled]);

  const toggle = (id: MetricId) => {
    const isActive = active.includes(id);
    let next: MetricId[];
    if (isActive) {
      next = active.filter((x) => x !== id);
    } else {
      if (active.length >= MAX_ACTIVE) {
        onLimitReached?.();
        return;
      }
      next = [...active, id];
    }
    if (controlled) onActiveChange?.(next);
    else setInternalActive(next);
  };

  const activeSpecs = useMemo(
    () => METRICS.filter((m) => active.includes(m.id)),
    [active],
  );

  // Какие оси в реальности используются.
  const axisInUse = useMemo(() => {
    const set = new Set<Axis>();
    activeSpecs.forEach((m) => set.add(m.axis));
    return set;
  }, [activeSpecs]);

  const hasMoney = axisInUse.has('money');
  const hasPercent = axisInUse.has('percent');
  // count разделяет ось с money (количество не в $, но без %).

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        date: d.date,
        spend: d.spend,
        sales: d.sales,
        profit: d.profit ?? 0,
        royalty: d.royalty ?? 0,
        acos: d.acos,
        roi: d.roi ?? 0,
        ctr: d.ctr,
        tacos: d.tacos ?? 0,
        roas: d.roas ?? 0,
        orders: d.orders,
        clicks: d.clicks,
        impressions: d.impressions,
      })),
    [data],
  );

  // Phase Q.2.5 — single-metric hero mode. When only one metric is active, render
  // <GradientArea> with an editorial headline overlay (Playfair display).
  // Keep multi-metric LineChart for power-users.
  const heroSpec = activeSpecs.length === 1 ? activeSpecs[0] : null;
  const heroHeadline =
    heroSpec && chartData.length > 0
      ? fmtForKind(heroSpec.fmt, aggregateForHero(heroSpec.fmt, chartData as ReadonlyArray<Record<MetricId, number>>, heroSpec.id))
      : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {METRICS.map((m) => {
          const on = active.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              className={`
                inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium
                border transition-colors select-none
                ${on
                  ? 'bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900'}
              `}
              aria-pressed={on}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: on ? m.color : '#d4d4d8' }}
              />
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="h-72 w-full">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-zinc-400">
            {loading ? t('hero.loading') : t('hero.noData')}
          </div>
        ) : heroSpec ? (
          <GradientArea
            data={chartData}
            xKey="date"
            yKey={heroSpec.id}
            color={heroSpec.color}
            height={288}
            tickFormatY={(v) => fmtForKind(heroSpec.fmt, Number(v))}
            tooltipFormatValue={(v) => fmtForKind(heroSpec.fmt, Number(v))}
            tooltipLabel={heroSpec.label}
            headlineLabel={heroSpec.label}
            headlineValue={heroHeadline ?? '—'}
            data-testid="hero-chart-single"
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis
                dataKey="date"
                fontSize={10}
                stroke="#a1a1aa"
                tickLine={false}
                axisLine={{ stroke: '#e4e4e7' }}
              />
              {hasMoney && (
                <YAxis
                  yAxisId="money"
                  fontSize={10}
                  stroke="#a1a1aa"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => fmtMoney(Number(v))}
                  width={56}
                />
              )}
              {hasPercent && (
                <YAxis
                  yAxisId="percent"
                  orientation="right"
                  fontSize={10}
                  stroke="#a1a1aa"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                  width={40}
                />
              )}
              <Tooltip content={<HeroTooltip />} cursor={{ stroke: '#e4e4e7' }} />
              {activeSpecs.map((m) => (
                <Line
                  key={m.id}
                  type="monotone"
                  dataKey={m.id}
                  yAxisId={m.axis === 'percent' ? 'percent' : 'money'}
                  stroke={m.color}
                  strokeWidth={1.75}
                  dot={false}
                  activeDot={{ r: 3 }}
                  name={m.label}
                  isAnimationActive={false}
                />
              ))}
              {targetAcos != null && hasPercent && active.includes('acos') && (
                <ReferenceLine
                  y={targetAcos}
                  yAxisId="percent"
                  stroke="#f97316"
                  strokeDasharray="3 3"
                  label={{
                    value: `target ACOS ${targetAcos}%`,
                    fill: '#f97316',
                    fontSize: 10,
                    position: 'right',
                  }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export type { MetricId };
