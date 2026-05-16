import React from 'react';
import { useTranslation } from 'react-i18next';
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
import { LoadingRow, EmptyState, Modal, ModalBody, ModalHeader } from '../ui';

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

  const chartData: ChartPoint[] = points?.map((p) => ({
    time: new Date(p.ts).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
    }),
    bsr: p.bsr,
  })) ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      ariaLabel={t('bsr.modalTitle')}
      data-testid="bsr-modal"
    >
      <ModalHeader
        title={t('bsr.modalTitle')}
        description={
          <>
            {bookTitle} · <span className="font-mono uppercase">{marketplace}</span>
          </>
        }
        onClose={onClose}
      />
      <ModalBody className="p-5">
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
      </ModalBody>
    </Modal>
  );
};
