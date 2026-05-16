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
import { Lock, Sparkles } from 'lucide-react';
import { Card, ChartTooltip, type ChartTooltipRow, LoadingRow } from '../ui';
import { metricsApi, type HourlyResponse } from '../../api/metrics';
import { fmtMoney, fmtNumber } from '../../lib/format';
import { useApiQuery } from '../../lib/useApiQuery';
import { useEntitlement } from '../../hooks/useEntitlement';
import { UpgradeModal } from '../UpgradeModal';

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
  attribution = '14d',
}) => {
  const { t } = useTranslation('campaigns');
  const { t: tCommon } = useTranslation('common');
  const [metric, setMetric] = useState<HourlyMetricId>('all');
  // Phase K: Pro feature. На start — рисуем skeleton placeholder с upgrade-CTA.
  const ent = useEntitlement('analytics.hourly_dynamics');
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const { data, loading, error } = useApiQuery<HourlyResponse>(
    () => metricsApi.campaignHourly(amazonCampaignId, { from, to, attribution }),
    [amazonCampaignId, from, to, attribution],
    {
      silentStatuses: [404],
      // Не дёргаем сеть когда фича locked — экономим вызов backend'а.
      enabled: !!amazonCampaignId && ent.on,
    },
  );

  const hourly = data?.hourly ?? [];
  // useMemo вызывается ВСЕГДА — нельзя класть его после раннего return'а,
  // иначе React ругается "Rendered more hooks than during the previous render".
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

  if (!ent.on) {
    return (
      <Card
        title={t('details.hourly.title')}
        bodyClassName="px-5 py-4"
        rightSlot={
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-violet-100 text-violet-700">
            <Lock size={10} />
            {ent.tierRequired === 'business'
              ? tCommon('entitlements.lockedBadgeBusiness')
              : tCommon('entitlements.lockedBadge')}
          </span>
        }
      >
        <div
          data-testid="hourly-dynamics-locked"
          className="h-72 flex flex-col items-center justify-center gap-3 text-sm bg-gradient-to-b from-violet-50/40 to-transparent rounded-md"
        >
          <Sparkles size={20} className="text-violet-500" />
          <div className="text-center max-w-sm">
            <div className="text-zinc-900 font-medium mb-1">
              {tCommon('entitlements.nudge.title')}
            </div>
            <div className="text-xs text-zinc-600">
              {t('details.hourly.title')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUpgradeOpen(true)}
            data-testid="hourly-dynamics-upgrade-cta"
            className="h-8 px-3 rounded-md text-xs font-medium bg-violet-600 text-white hover:bg-violet-700"
          >
            {tCommon('entitlements.nudge.cta')}
          </button>
        </div>
        <UpgradeModal
          open={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          triggeredBy="analytics.hourly_dynamics"
          recommendedTier={ent.tierRequired}
        />
      </Card>
    );
  }

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
