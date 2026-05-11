import React, { useEffect, useState } from 'react';
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
import {
  searchTermsApi,
  type RankHistoryPoint,
} from '../../api/searchTerms';
import { useToast } from '../../contexts/ToastContext';
import { LoadingRow, EmptyState } from '../ui';
import { ModalShell } from './ModalShell';

interface Props {
  statusId: number;
  keyword: string;
  bookId?: number | null;
  marketplace?: string | null;
  onClose(): void;
}

type Days = 30 | 60 | 90;

interface ChartPoint {
  date: string;
  rank: number;
}

/**
 * Phase J.1 Lane A — rank history modal.
 *
 * Backend endpoint опциональный (`/api/search-terms/:id/rank-history`).
 * Если backend возвращает 404 — `searchTermsApi.getRankHistory` отдаёт `null`,
 * и здесь рисуется graceful empty state «Endpoint not available» вместо ошибки.
 */
export const RankHistoryModal: React.FC<Props> = ({
  statusId,
  keyword,
  bookId,
  marketplace,
  onClose,
}) => {
  const { t } = useTranslation('searchTerms');
  const toast = useToast();
  const [days, setDays] = useState<Days>(90);
  const [points, setPoints] = useState<RankHistoryPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await searchTermsApi.getRankHistory({
          statusId,
          keyword,
          bookId,
          marketplace,
          days,
        });
        if (cancelled) return;
        if (res === null || res.unsupported) {
          setUnsupported(true);
          setPoints([]);
        } else {
          setUnsupported(false);
          setPoints(res.history ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setPoints([]);
          toast.error(
            err instanceof ApiError ? err.message : t('errors.rankHistory'),
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
    // `t` is intentionally outside deps — react-i18next returns a new
    // function reference each render, which would trigger infinite reloads.
  }, [statusId, keyword, bookId, marketplace, days, toast]);

  const chartData: ChartPoint[] = (points ?? [])
    .filter((p) => p.organicRank != null)
    .slice()
    .reverse()
    .map((p) => ({
      date: new Date(p.checkedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      rank: p.organicRank as number,
    }));

  return (
    <ModalShell
      title={t('rankHistory.title', { keyword })}
      closeAria={t('rankHistory.closeAria')}
      onClose={onClose}
      size="lg"
      testId="rank-history-modal"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="h-8 px-3 text-xs font-medium rounded-md text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors"
        >
          {t('rankHistory.close')}
        </button>
      }
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-zinc-700">
          {t('rankHistory.periodLabel')}
        </span>
        <div className="inline-flex bg-white border border-zinc-200 rounded-md p-0.5">
          {([30, 60, 90] as const).map((d) => (
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
              {t(`rankHistory.period.${d}d` as 'rankHistory.period.30d')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingRow />
      ) : unsupported ? (
        <EmptyState title={t('rankHistory.unsupported')} />
      ) : chartData.length === 0 ? (
        <EmptyState title={t('rankHistory.empty')} />
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
              reversed
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              tickLine={false}
              axisLine={false}
              width={60}
              label={{
                value: t('rankHistory.yLabel'),
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 10, fill: '#a1a1aa' },
              }}
            />
            <Tooltip
              formatter={(value: unknown) => {
                const v = typeof value === 'number' ? value : Number(value);
                return [`#${v}`, t('rankHistory.yLabel')];
              }}
            />
            <Line
              type="monotone"
              dataKey="rank"
              stroke="#6E56CF"
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
