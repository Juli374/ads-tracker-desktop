import React from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface KpiDeltaProps {
  label: string;
  value: React.ReactNode;
  change?: number | null;
  inverseChange?: boolean;
  changeLabel?: string;
  loading?: boolean;
  tone?: 'default' | 'positive' | 'negative';
  icon?: React.ReactNode;
}

const valueTone: Record<NonNullable<KpiDeltaProps['tone']>, string> = {
  default: 'text-zinc-900',
  positive: 'text-emerald-600',
  negative: 'text-red-600',
};

const isFiniteNumber = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);

const formatChange = (n: number) => {
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 0 : 1;
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${abs.toFixed(digits)}%`;
};

export const KpiDelta: React.FC<KpiDeltaProps> = ({
  label,
  value,
  change,
  inverseChange = false,
  changeLabel,
  loading = false,
  tone = 'default',
  icon,
}) => {
  const { t } = useTranslation('common');
  const effectiveChangeLabel = changeLabel ?? t('kpi.vsPrevious');
  const hasChange = isFiniteNumber(change) && change !== 0;
  const isUp = isFiniteNumber(change) && change > 0;
  const isPositive = inverseChange ? !isUp : isUp;

  const deltaColor = !hasChange
    ? 'text-zinc-400'
    : isPositive
    ? 'text-emerald-600'
    : 'text-red-600';

  const ArrowIcon = !hasChange ? Minus : isUp ? ArrowUp : ArrowDown;

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
          {label}
        </div>
        {icon ? (
          <div className="text-zinc-400">{icon}</div>
        ) : null}
      </div>
      <div
        className={`mt-2 text-2xl font-semibold tabular-nums ${
          loading ? 'text-zinc-300' : valueTone[tone]
        }`}
      >
        {value}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        <span className={`flex items-center gap-0.5 font-medium tabular-nums ${deltaColor}`}>
          <ArrowIcon size={11} strokeWidth={2.5} />
          {isFiniteNumber(change) ? formatChange(change) : '—'}
        </span>
        <span className="text-zinc-400">{effectiveChangeLabel}</span>
      </div>
    </div>
  );
};
