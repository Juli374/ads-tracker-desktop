import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BookMetric } from '../../api/metrics';
import { flagFor } from '../../lib/marketplaceFlags';
import { fmtMoney, fmtPct } from '../../lib/format';
import { EmptyState } from '../ui';

interface Props {
  bookId: number;
  rows: BookMetric[];
  loading: boolean;
  onSelectMarketplace(marketplace: string): void;
}

export const BooksMarketplacesPanel: React.FC<Props> = ({
  rows,
  loading,
  onSelectMarketplace,
}) => {
  const { t } = useTranslation('books');

  const mpRows = useMemo(() => rows.filter((r) => r.marketplace), [rows]);

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse" data-testid="books-marketplaces-panel">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-zinc-100 rounded-lg" />
        ))}
      </div>
    );
  }

  if (mpRows.length === 0) {
    return (
      <div data-testid="books-marketplaces-panel">
        <EmptyState title={t('drill.empty')} />
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="books-marketplaces-panel">
      {mpRows.map((row) => {
        const mp = row.marketplace ?? '';
        const flag = flagFor(mp);
        return (
          <button
            key={mp}
            type="button"
            onClick={() => onSelectMarketplace(mp)}
            className="w-full text-left bg-white border border-zinc-200 rounded-xl px-4 py-3 hover:border-zinc-400 hover:shadow-sm transition-all flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{flag}</span>
              <span className="text-sm font-medium text-zinc-900 uppercase font-mono">{mp}</span>
            </div>
            <div className="flex items-center gap-6 text-xs tabular-nums text-right">
              <KpiPill label="Spend" value={fmtMoney(row.cost, row.currency)} />
              <KpiPill label="Sales" value={fmtMoney(row.sales, row.currency)} />
              <KpiPill
                label="ACOS"
                value={row.acos > 0 ? fmtPct(row.acos) : '—'}
                warn={row.acos > 100}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
};

const KpiPill: React.FC<{ label: string; value: string; warn?: boolean }> = ({
  label,
  value,
  warn,
}) => (
  <div className="flex flex-col items-end">
    <div className="text-[10px] text-zinc-400 uppercase">{label}</div>
    <div className={`text-xs font-medium ${warn ? 'text-red-600' : 'text-zinc-800'}`}>{value}</div>
  </div>
);
