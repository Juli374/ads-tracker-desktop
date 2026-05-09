import React from 'react';
import { useTranslation } from 'react-i18next';
import type { RangeId } from '../../lib/dateRange';

export type QuickPeriod = 'last30' | 'thisMonth' | 'lastMonth' | 'custom';

const QUICK_TO_RANGE: Record<Exclude<QuickPeriod, 'custom'>, RangeId> = {
  last30: '30d',
  thisMonth: 'mtd',
  lastMonth: 'lastMonth',
};

export function rangeFromQuick(q: QuickPeriod): RangeId | null {
  if (q === 'custom') return null;
  return QUICK_TO_RANGE[q];
}

export function quickFromRange(r: RangeId): QuickPeriod {
  if (r === '30d') return 'last30';
  if (r === 'mtd') return 'thisMonth';
  if (r === 'lastMonth') return 'lastMonth';
  return 'custom';
}

const ORDER: QuickPeriod[] = ['last30', 'thisMonth', 'lastMonth', 'custom'];

interface Props {
  value: QuickPeriod;
  onChange: (next: QuickPeriod) => void;
}

export const QuickPeriodSegment: React.FC<Props> = ({ value, onChange }) => {
  const { t } = useTranslation('dashboard');

  return (
    <div
      className="inline-flex items-center bg-white border border-zinc-200 rounded-md p-0.5"
      role="tablist"
      aria-label="Quick period"
      data-testid="quick-period-segment"
    >
      {ORDER.map((id) => (
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          data-testid={`quick-period-${id}`}
          onClick={() => onChange(id)}
          className={`
            px-2.5 h-7 text-xs font-medium rounded transition-colors
            ${value === id
              ? 'bg-zinc-100 text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-900'}
          `}
        >
          {t(`quickPeriod.${id}` as 'quickPeriod.last30')}
        </button>
      ))}
    </div>
  );
};
