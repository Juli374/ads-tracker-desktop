import React from 'react';

interface KpiProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  loading?: boolean;
  tone?: 'default' | 'positive' | 'negative';
}

const toneClass: Record<NonNullable<KpiProps['tone']>, string> = {
  default: 'text-zinc-900',
  positive: 'text-emerald-600',
  negative: 'text-red-600',
};

export const Kpi: React.FC<KpiProps> = ({
  label,
  value,
  hint,
  loading = false,
  tone = 'default',
}) => (
  <div className="bg-white border border-zinc-200 rounded-lg p-4 shadow-soft">
    <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
      {label}
    </div>
    <div
      className={`mt-2 text-2xl font-semibold font-mono tabular-nums tracking-tight ${
        loading ? 'text-zinc-300' : toneClass[tone]
      }`}
    >
      {value}
    </div>
    {hint != null && (
      <div className="text-xs text-zinc-400 mt-0.5">{hint}</div>
    )}
  </div>
);
