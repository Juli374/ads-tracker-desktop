import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, ChartTooltip, type ChartTooltipRow, LoadingRow } from '../ui';
import { metricsApi, type HourlyResponse } from '../../api/metrics';
import { fmtMoney, fmtNumber } from '../../lib/format';
import { useApiQuery } from '../../lib/useApiQuery';

type HourlyMetricId = 'all' | 'impressions' | 'clicks' | 'spend';

interface Props {
  amazonCampaignId: string;
  currency?: string;
  from: string;
  to: string;
  attribution?: '1d' | '7d' | '14d' | '30d';
}

const SHORT_HOUR = (raw: string): string => {
  // Backend can send "YYYY-MM-DD HH:00" or full ISO. Trim to "MM-DD HH:00".
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2})/);
  if (m) return `${m[2]}-${m[3]} ${m[4]}h`;
  return raw;
};

export const HourlyDynamicsChart: React.FC<Props> = ({
  amazonCampaignId,
  currency,
  from,
  to,
  attribution = '7d',
}) => {
  const { t } = useTranslation('campaigns');
  const [metric, setMetric] = useState<HourlyMetricId>('all');

  const { data, loading, error } = useApiQuery<HourlyResponse>(
    () => metricsApi.campaignHourly(amazonCampaignId, { from, to, attribution }),
    [amazonCampaignId, from, to, attribution],
    { silentStatuses: [404], enabled: !!amazonCampaignId },
  );

  const hourly = data?.hourly ?? [];
  const chartData = useMemo(
    () =>
      hourly.map((row) => ({
        hourLabel: SHORT_HOUR(row.hour),
        impressions: row.impressions,
        clicks: row.clicks,
        spend: row.spend,
      })),
    [hourly],
  );

  const showImpressions = metric === 'all' || metric === 'impressions';
  const showClicks = metric === 'all' || metric === 'clicks';
  const showSpend = metric === 'all' || metric === 'spend';

  return (
    <Card
      title={t('details.hourly.title')}
      bodyClassName="px-5 py-4"
      rightSlot={
        <div className="inline-flex items-center bg-white border border-zinc-200 rounded-md p-0.5">
          {(['all', 'impressions', 'clicks', 'spend'] as HourlyMetricId[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              data-testid={`hourly-metric-${m}`}
              className={`
                px-2 h-6 text-[11px] font-medium rounded transition-colors
                ${metric === m
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'text-zinc-500 hover:text-zinc-900'}
              `}
            >
              {t(`details.hourly.metric.${m}` as 'details.hourly.metric.all')}
            </button>
          ))}
        </div>
      }
    >
      {loading && !data ? (
        <LoadingRow />
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : hourly.length === 0 ? (
        <div className="text-sm text-zinc-400 py-4">{t('details.hourly.empty')}</div>
      ) : (
        <div className="h-72" data-testid="hourly-dynamics-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 12, bottom: 12, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis
                dataKey="hourLabel"
                tick={{ fontSize: 10, fill: '#71717a' }}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickFormatter={(v) => fmtNumber(v as number)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickFormatter={(v) => fmtNumber(v as number)}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const rows: ChartTooltipRow[] = payload.map((p) => {
                    const key = p.dataKey as 'impressions' | 'clicks' | 'spend';
                    return {
                      label: t(`details.hourly.metric.${key}` as 'details.hourly.metric.impressions'),
                      value:
                        key === 'spend'
                          ? fmtMoney(Number(p.value), currency)
                          : fmtNumber(Number(p.value)),
                      colorClass:
                        key === 'impressions'
                          ? 'bg-zinc-400'
                          : key === 'clicks'
                          ? 'bg-blue-500'
                          : 'bg-emerald-500',
                    };
                  });
                  return <ChartTooltip title={String(label)} rows={rows} />;
                }}
              />
              {showImpressions && (
                <Bar
                  yAxisId="right"
                  dataKey="impressions"
                  fill="#a1a1aa"
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                />
              )}
              {showClicks && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="clicks"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {showSpend && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="spend"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {chartData.length > 24 && (
                <Brush
                  dataKey="hourLabel"
                  height={20}
                  stroke="#a1a1aa"
                  travellerWidth={8}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};
