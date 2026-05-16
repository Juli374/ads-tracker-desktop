import React, { useEffect, useMemo, useState } from 'react';
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
import { ApiError } from '../../api/client';
import { searchTermsApi, type TrendPoint } from '../../api/searchTerms';
import { useToast } from '../../contexts/ToastContext';
import { LoadingRow, EmptyState } from '../ui';
import { ModalShell } from './ModalShell';

interface Props {
  statusId: number;
  keyword: string;
  currency?: string;
  onClose(): void;
}

type Days = 14 | 30 | 60;
type Metric = 'clicks' | 'spend' | 'orders' | 'sales';

const COLORS: Record<Metric, string> = {
  clicks: '#3b82f6',
  spend: '#10b981',
  orders: '#10b981',
  sales: '#f43f5e',
};

/**
 * Phase J.1 Lane A — trend modal (clicks / spend / orders / sales by day).
 *
 * Backend endpoint опциональный (`/api/search-terms/:id/trend`). Если
 * `null` (404/501) — рисуется graceful empty state.
 */
export const TrendModal: React.FC<Props> = ({ statusId, keyword, onClose }) => {
  const { t } = useTranslation('searchTerms');
  const toast = useToast();
  const [days, setDays] = useState<Days>(30);
  const [metric, setMetric] = useState<Metric>('clicks');
  const [points, setPoints] = useState<TrendPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await searchTermsApi.getTrend({ statusId, days });
        if (cancelled) return;
        if (res === null || res.unsupported) {
          setUnsupported(true);
          setPoints([]);
        } else {
          setUnsupported(false);
          setPoints(res.points ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setPoints([]);
          toast.error(
            err instanceof ApiError ? err.message : t('errors.trend'),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // `t` is intentionally outside deps — see RankHistoryModal for rationale.
  }, [statusId, days, toast]);

  const chartData = useMemo(
    () =>
      (points ?? []).map((p) => ({
        date: new Date(p.date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        clicks: p.clicks,
        spend: p.spend,
        orders: p.orders,
        sales: p.sales,
      })),
    [points],
  );

  return (
    <ModalShell
      title={t('trend.title', { keyword })}
      closeAria={t('trend.closeAria')}
      onClose={onClose}
      size="lg"
      testId="trend-modal"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="h-8 px-3 text-xs font-medium rounded-md text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors"
        >
          {t('trend.close')}
        </button>
      }
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex bg-white border border-zinc-200 rounded-md p-0.5">
          {(['clicks', 'spend', 'orders', 'sales'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={`
                px-2.5 h-6 text-[11px] font-medium rounded transition-colors
                ${metric === m
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:text-zinc-900'}
              `}
            >
              {t(`trend.metric.${m}` as 'trend.metric.clicks')}
            </button>
          ))}
        </div>
        <div className="inline-flex bg-white border border-zinc-200 rounded-md p-0.5">
          {([14, 30, 60] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`
                px-2.5 h-6 text-[11px] font-medium rounded transition-colors
                ${days === d
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:text-zinc-900'}
              `}
            >
              {t(`trend.period.${d}d` as 'trend.period.14d')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingRow />
      ) : unsupported ? (
        <EmptyState title={t('trend.unsupported')} />
      ) : chartData.length === 0 ? (
        <EmptyState title={t('trend.empty')} />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip />
            <Line
              type="monotone"
              dataKey={metric}
              stroke={COLORS[metric]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ModalShell>
  );
};
