import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { BsrPoint } from '../../api/books';
import { useEscapeClose } from '../../lib/useEscapeClose';
import { LoadingRow, EmptyState } from '../ui';

interface Props {
  bookTitle: string;
  marketplace: string;
  points: BsrPoint[] | null;
  loading: boolean;
  onClose(): void;
}

interface ChartPoint {
  time: string;
  bsr: number;
}

export const BsrModal: React.FC<Props> = ({
  bookTitle,
  marketplace,
  points,
  loading,
  onClose,
}) => {
  const { t } = useTranslation('books');

  useEscapeClose(onClose);

  const chartData: ChartPoint[] = points?.map((p) => ({
    time: new Date(p.ts).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
    }),
    bsr: p.bsr,
  })) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-zinc-900/20 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('bsr.modalTitle')}
      data-testid="bsr-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">{t('bsr.modalTitle')}</h2>
            <div className="text-xs text-zinc-500 mt-0.5">
              {bookTitle} · <span className="font-mono uppercase">{marketplace}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5">
          {loading ? (
            <LoadingRow />
          ) : chartData.length === 0 ? (
            <EmptyState title={t('bsr.empty')} />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                <XAxis
                  dataKey="time"
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
                  tickFormatter={(v: number) => `#${v.toLocaleString()}`}
                />
                <Tooltip
                  formatter={(value: unknown) => [
                    `#${Number(value).toLocaleString()}`,
                    t('bsr.value'),
                  ]}
                  labelFormatter={(label: unknown) => `${t('bsr.hour')}: ${String(label)}`}
                  contentStyle={{ fontSize: 12, border: '1px solid #e4e4e7', borderRadius: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="bsr"
                  stroke="#18181b"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};
