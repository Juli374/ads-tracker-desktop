import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, ChartTooltip, EmptyState } from '../ui';
import type { DailySummaryMetric } from '../../api/metrics';
import { fmtMoney } from '../../lib/format';

interface PnLChartProps {
  daily: DailySummaryMetric[];
  loading?: boolean;
}

// 30-day rolling net profit chart. Uses backend's `profit` daily field directly
// (royalty - spend - print*orders is approximated as `profit` server-side).
// If the daily payload lacks profit, falls back to (royalty - spend) so the
// chart is never empty when at least one of those fields is present.
export const PnLChart: React.FC<PnLChartProps> = ({ daily, loading = false }) => {
  const { t } = useTranslation('pnl');

  // Phase Q.5+ — sort ascending (oldest→newest left-to-right). Backend returns
  // daily series descending; without sort the x-axis reads right-to-left.
  const data = useMemo(() => {
    return [...daily]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((d) => {
        const profit =
          d.profit != null && Number.isFinite(d.profit)
            ? d.profit
            : (d.royalty ?? 0) - (d.spend ?? 0);
        return { date: d.date, profit };
      });
  }, [daily]);

  return (
    <Card title={t('chart.title')} bodyClassName="px-5 py-4" data-testid="pnl-chart">
      {loading && data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-xs text-zinc-400">
          …
        </div>
      ) : data.length === 0 ? (
        <EmptyState title={t('chart.empty')} />
      ) : (
        <div className="h-48" data-testid="pnl-chart-body">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickFormatter={(v) => (typeof v === 'string' ? v.slice(5) : '')}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickFormatter={(v) => fmtMoney(v)}
              />
              <Tooltip
                content={({ active, label, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const v = payload[0].value as number;
                  return (
                    <ChartTooltip
                      active
                      title={String(label)}
                      rows={[
                        {
                          label: t('chart.tooltipProfit'),
                          value: fmtMoney(v),
                          color: '#3b82f6',
                        },
                      ]}
                    />
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="profit"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};
