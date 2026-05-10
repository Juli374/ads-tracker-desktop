import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { ApiError, apiClient } from '../../api/client';
import { Card, EmptyState, ErrorBanner, LoadingRow } from '../ui';
import { fmtMoney, fmtNumber, fmtPct } from '../../lib/format';
import { useToast } from '../../contexts/ToastContext';

type HourlyMetricKind = 'spend' | 'sales' | 'orders' | 'acos';

interface HourlyTabProps {
  from: string;
  to: string;
  attribution: '7d' | '14d' | '30d' | '1d';
  marketplaces?: string[];
  bookIds?: number[];
  accounts?: string[];
}

interface HourlyCellRaw {
  // Backend can return either ISO timestamp or a "YYYY-MM-DD HH:00" string.
  hour?: string;
  timestamp?: string;
  // Or split fields:
  date?: string;
  hour_of_day?: number;
  day_of_week?: number;
  weekday?: number;
  // Metrics
  spend?: number;
  cost?: number;
  sales?: number;
  orders?: number;
  acos?: number;
  clicks?: number;
}

interface HourlyResponse {
  date_from?: string;
  date_to?: string;
  attribution_window?: string;
  hourly?: HourlyCellRaw[];
  cells?: HourlyCellRaw[];
  error?: string;
}

interface NormalizedCell {
  dow: number; // 0=Mon ... 6=Sun
  hour: number; // 0..23
  spend: number;
  sales: number;
  orders: number;
  acos: number;
}

const DOW_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function toDayOfWeekISO(d: Date): number {
  // ISO week: Mon=1..Sun=7 → 0..6 Mon-first index.
  const js = d.getUTCDay(); // 0=Sun..6=Sat
  return js === 0 ? 6 : js - 1;
}

function normalizeCells(raw: HourlyCellRaw[] | undefined): NormalizedCell[] {
  if (!raw || raw.length === 0) return [];
  const out: NormalizedCell[] = [];
  for (const r of raw) {
    let dow: number | null = null;
    let hour: number | null = null;

    if (typeof r.day_of_week === 'number') {
      dow = ((r.day_of_week + 6) % 7); // backend may use 0=Sunday or 1=Monday
      // Heuristic: if backend uses 1..7 (ISO), map to 0..6 Monday-first.
      if (r.day_of_week >= 1 && r.day_of_week <= 7) dow = r.day_of_week - 1;
    } else if (typeof r.weekday === 'number') {
      dow = ((r.weekday + 6) % 7);
    }
    if (typeof r.hour_of_day === 'number') hour = r.hour_of_day;

    if (dow == null || hour == null) {
      const ts = r.hour ?? r.timestamp ?? r.date;
      if (ts) {
        const d = new Date(ts);
        if (!Number.isNaN(d.getTime())) {
          if (dow == null) dow = toDayOfWeekISO(d);
          if (hour == null) hour = d.getUTCHours();
        }
      }
    }
    if (dow == null || hour == null) continue;
    out.push({
      dow,
      hour,
      spend: Number(r.spend ?? r.cost ?? 0) || 0,
      sales: Number(r.sales ?? 0) || 0,
      orders: Number(r.orders ?? 0) || 0,
      acos: Number(r.acos ?? 0) || 0,
    });
  }
  return out;
}

function aggregateGrid(
  cells: NormalizedCell[],
  metric: HourlyMetricKind,
): { grid: number[][]; max: number; min: number; total: number } {
  // grid[dow][hour] — sums spend/sales/orders, avg for acos
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const counts: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const c of cells) {
    const v = c[metric];
    grid[c.dow][c.hour] += v;
    counts[c.dow][c.hour] += 1;
  }
  if (metric === 'acos') {
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (counts[d][h] > 0) grid[d][h] = grid[d][h] / counts[d][h];
      }
    }
  }
  let max = 0;
  let min = Number.POSITIVE_INFINITY;
  let total = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const v = grid[d][h];
      total += v;
      if (v > max) max = v;
      if (v > 0 && v < min) min = v;
    }
  }
  if (!Number.isFinite(min)) min = 0;
  return { grid, max, min, total };
}

function colorScale(ratio: number): string {
  // White → violet (#6E56CF). ratio in [0,1]; 0 returns near-white.
  const r = Math.round(255 + (110 - 255) * ratio);
  const g = Math.round(255 + (86 - 255) * ratio);
  const b = Math.round(255 + (207 - 255) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatMetric(kind: HourlyMetricKind, v: number): string {
  switch (kind) {
    case 'spend':
    case 'sales':
      return fmtMoney(v);
    case 'orders':
      return fmtNumber(v);
    case 'acos':
      return v > 0 ? fmtPct(v) : '—';
  }
}

export const HourlyTab: React.FC<HourlyTabProps> = ({
  from,
  to,
  attribution,
  marketplaces,
  bookIds,
  accounts,
}) => {
  const { t } = useTranslation('reports');
  const toast = useToast();
  const [metric, setMetric] = useState<HourlyMetricKind>('spend');
  const [data, setData] = useState<NormalizedCell[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [drillCell, setDrillCell] = useState<{ dow: number; hour: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUnsupported(false);
    apiClient
      .get<HourlyResponse>('/api/metrics/summary/hourly', {
        from,
        to,
        attribution,
        'marketplaces[]': marketplaces,
        'book_ids[]': bookIds?.map(String),
        'accounts[]': accounts,
      })
      .then((res) => {
        if (cancelled) return;
        const raw = res.hourly ?? res.cells ?? [];
        setData(normalizeCells(raw));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          setUnsupported(true);
          setData([]);
          return;
        }
        toast.error(err instanceof ApiError ? err.message : t('hourly.loadFailed'));
        setData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, attribution, marketplaces, bookIds, accounts, toast]);

  const { grid, max, total } = useMemo(
    () => aggregateGrid(data ?? [], metric),
    [data, metric],
  );

  if (unsupported) {
    return <ErrorBanner message={t('hourly.unsupported')} />;
  }

  return (
    <Card
      data-testid="reports-hourly-card"
      title={
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-zinc-400" />
          {t('hourly.title')}
        </div>
      }
      rightSlot={
        <div
          className="inline-flex items-center bg-white border border-zinc-200 rounded-md p-0.5"
          data-testid="reports-hourly-metric-toggle"
        >
          {(['spend', 'sales', 'orders', 'acos'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              data-testid={`reports-hourly-metric-${m}`}
              className={`
                px-2.5 h-6 text-[11px] font-medium rounded transition-colors
                ${metric === m
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'text-zinc-500 hover:text-zinc-900'}
              `}
            >
              {t(`hourly.metric.${m}` as 'hourly.metric.spend')}
            </button>
          ))}
        </div>
      }
    >
      {loading && !data ? (
        <LoadingRow />
      ) : !data || data.length === 0 ? (
        <EmptyState title={t('hourly.empty')} />
      ) : (
        <div className="px-5 py-4 space-y-3" data-testid="reports-hourly-heatmap">
          <div className="flex items-center gap-2 text-[10px] text-zinc-500">
            <span>{t('hourly.legend.low')}</span>
            <div className="flex-1 h-1.5 rounded-sm bg-gradient-to-r from-zinc-50 to-violet-500" />
            <span>{t('hourly.legend.high')}</span>
            <span className="text-zinc-400 ml-3 tabular-nums">
              {t('hourly.totalLabel', { total: formatMetric(metric, total) })}
            </span>
          </div>

          <div className="overflow-x-auto">
            <div
              className="grid"
              style={{
                gridTemplateColumns: '36px repeat(24, minmax(20px, 1fr))',
                gap: 2,
              }}
            >
              {/* Header row: hour labels */}
              <div />
              {Array.from({ length: 24 }).map((_, h) => (
                <div
                  key={`h-${h}`}
                  className="text-[9px] text-zinc-400 text-center tabular-nums"
                >
                  {h % 3 === 0 ? `${h}h` : ''}
                </div>
              ))}

              {DOW_KEYS.map((dowKey, d) => (
                <React.Fragment key={dowKey}>
                  <div className="text-[10px] text-zinc-500 text-right pr-1 leading-5">
                    {t(`hourly.dow.${dowKey}` as 'hourly.dow.mon')}
                  </div>
                  {Array.from({ length: 24 }).map((_, h) => {
                    const v = grid[d][h];
                    const ratio = max > 0 ? Math.min(1, v / max) : 0;
                    const isActive =
                      drillCell != null && drillCell.dow === d && drillCell.hour === h;
                    return (
                      <button
                        key={`c-${d}-${h}`}
                        type="button"
                        onClick={() => setDrillCell({ dow: d, hour: h })}
                        data-testid={`reports-hourly-cell-${d}-${h}`}
                        title={`${t(`hourly.dow.${dowKey}` as 'hourly.dow.mon')} ${h}:00 — ${formatMetric(
                          metric,
                          v,
                        )}`}
                        className={`
                          h-5 rounded-sm transition-shadow
                          ${isActive ? 'ring-2 ring-violet-500 ring-offset-1' : ''}
                        `}
                        style={{ backgroundColor: colorScale(ratio) }}
                      />
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>

          {drillCell && (
            <div
              className="flex items-center justify-between border-t border-zinc-100 pt-3 text-xs text-zinc-600"
              data-testid="reports-hourly-drill"
            >
              <div>
                {t('hourly.drillLabel', {
                  dow: t(
                    `hourly.dow.${DOW_KEYS[drillCell.dow]}` as 'hourly.dow.mon',
                  ),
                  hour: `${drillCell.hour}:00`,
                })}
                <span className="ml-2 text-zinc-900 font-medium tabular-nums">
                  {formatMetric(metric, grid[drillCell.dow][drillCell.hour])}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDrillCell(null)}
                className="text-[11px] text-zinc-500 hover:text-zinc-900"
              >
                {t('hourly.drillClear')}
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
