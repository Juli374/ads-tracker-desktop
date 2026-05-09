import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { MarketplaceSummary } from '../../api/metrics';
import { ChartTooltip, type ChartTooltipRow, EmptyState, LoadingRow } from '../ui';
import { fmtMoney, fmtNumber, fmtPct } from '../../lib/format';

type Mode = 'spend' | 'sales' | 'orders';

interface Props {
  summary: MarketplaceSummary | null;
  loading?: boolean;
}

// Палитра zinc + 1 акцент чтобы крупный сегмент выделялся.
const PALETTE = [
  '#27272a', '#3f3f46', '#52525b', '#71717a',
  '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5',
];

const labels: Record<Mode, string> = { spend: 'Spend', sales: 'Sales', orders: 'Orders' };

interface Slice {
  code: string;
  spend: number;
  sales: number;
  orders: number;
  acos: number;
  value: number;
}

export const MarketplaceDistribution: React.FC<Props> = ({ summary, loading }) => {
  const { t } = useTranslation('dashboard');
  const [mode, setMode] = useState<Mode>('spend');

  const slices = useMemo<Slice[]>(() => {
    if (!summary) return [];
    return Object.entries(summary.marketplaces)
      .map(([code, m]) => ({
        code,
        spend: m.cost,
        sales: m.sales,
        orders: m.orders,
        acos: m.acos,
        value: mode === 'spend' ? m.cost : mode === 'sales' ? m.sales : m.orders,
      }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [summary, mode]);

  const total = useMemo(() => slices.reduce((acc, s) => acc + s.value, 0), [slices]);

  const MpTooltip: React.FC<{
    active?: boolean;
    payload?: ReadonlyArray<{ payload: Slice }>;
  }> = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const s = payload[0].payload;
    const rows: ChartTooltipRow[] = [
      { label: 'Spend', value: fmtMoney(s.spend) },
      { label: 'Sales', value: fmtMoney(s.sales) },
      { label: 'Orders', value: fmtNumber(s.orders) },
      { label: 'ACOS', value: s.acos > 0 ? fmtPct(s.acos) : '—' },
    ];
    return <ChartTooltip active title={s.code} rows={rows} />;
  };

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <div className="inline-flex items-center bg-zinc-100 rounded-md p-0.5">
          {(Object.keys(labels) as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`
                px-2.5 h-6 text-[11px] font-medium rounded
                transition-colors
                ${mode === m
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'}
              `}
            >
              {labels[m]}
            </button>
          ))}
        </div>
      </div>

      {loading && !summary ? (
        <LoadingRow />
      ) : slices.length === 0 ? (
        <EmptyState title={t('marketplaceShare.empty')} />
      ) : (
        <div className="grid grid-cols-2 gap-6 items-center">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="code"
                  innerRadius="60%"
                  outerRadius="90%"
                  paddingAngle={1}
                  isAnimationActive={false}
                >
                  {slices.map((s, i) => (
                    <Cell key={s.code} fill={PALETTE[i % PALETTE.length]} stroke="#fff" />
                  ))}
                </Pie>
                <Tooltip content={<MpTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ul className="space-y-1.5">
            {slices.map((s, i) => {
              const share = total > 0 ? (s.value / total) * 100 : 0;
              return (
                <li
                  key={s.code}
                  className="flex items-center gap-2.5 text-xs"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                  />
                  <span className="font-medium text-zinc-700 w-10 uppercase">
                    {s.code}
                  </span>
                  <span className="flex-1 text-zinc-900 tabular-nums">
                    {mode === 'orders' ? fmtNumber(s.value) : fmtMoney(s.value)}
                  </span>
                  <span className="text-zinc-500 tabular-nums w-12 text-right">
                    {share.toFixed(1)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
