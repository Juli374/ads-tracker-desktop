import React from 'react';
import { useTranslation } from 'react-i18next';
import { fmtNumber, fmtPct } from '../../lib/format';
import type { PeriodMetrics } from '../../api/metrics';

interface Props {
  data: PeriodMetrics | null;
  loading?: boolean;
}

type StepId = 'impressions' | 'clicks' | 'orders';

interface Step {
  id: StepId;
  value: number;
  conversion: number | null; // % от предыдущего шага
  color: string;
}

export const FunnelChart: React.FC<Props> = ({ data, loading }) => {
  const { t } = useTranslation('dashboard');
  const impressions = data?.impressions ?? 0;
  const clicks = data?.clicks ?? 0;
  const orders = data?.orders ?? 0;

  const steps: Step[] = [
    { id: 'impressions', value: impressions, conversion: null, color: 'bg-zinc-300' },
    {
      id: 'clicks',
      value: clicks,
      conversion: impressions > 0 ? (clicks / impressions) * 100 : null,
      color: 'bg-zinc-500',
    },
    {
      id: 'orders',
      value: orders,
      conversion: clicks > 0 ? (orders / clicks) * 100 : null,
      color: 'bg-zinc-900',
    },
  ];

  const max = Math.max(impressions, 1);

  return (
    <div className="space-y-2.5">
      {loading && !data ? (
        <div className="text-xs text-zinc-400 py-3 text-center">{t('funnel.loading')}</div>
      ) : impressions === 0 ? (
        <div className="text-xs text-zinc-400 py-3 text-center">{t('funnel.noData')}</div>
      ) : (
        steps.map((s) => {
          const pct = max > 0 ? (s.value / max) * 100 : 0;
          return (
            <div key={s.id}>
              <div className="flex items-baseline justify-between text-[11px] mb-1">
                <span className="text-zinc-600 font-medium">{t(`funnel.steps.${s.id}`)}</span>
                <span className="text-zinc-900 tabular-nums font-medium">
                  {fmtNumber(s.value)}
                </span>
              </div>
              <div className="relative h-5 bg-zinc-100 rounded-sm overflow-hidden">
                <div
                  className={`absolute left-0 top-0 h-full ${s.color} rounded-sm transition-all`}
                  style={{ width: `${Math.max(pct, 1.5)}%` }}
                />
              </div>
              {s.conversion != null && (
                <div className="text-[10px] text-zinc-500 mt-0.5 tabular-nums">
                  {t('funnel.conversion', { value: fmtPct(s.conversion, 2) })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
