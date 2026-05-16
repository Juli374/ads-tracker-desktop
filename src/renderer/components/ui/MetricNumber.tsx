// MetricNumber — Phase Q.1 primitive.
// Big metric/number display in JetBrains Mono + tabular-nums.
// Replaces inline `text-2xl font-semibold tabular-nums` usages across Kpi.tsx,
// KpiDelta.tsx, and other KPI / dashboard / table summary cells.
//
// Sizes (the four canonical metric sizes used in the app):
//   sm   — secondary stat in a row (text-sm)
//   md   — default; medium emphasis (text-xl + semibold)
//   lg   — KPI card big number (text-2xl + semibold)
//   hero — splash / empty-state "0 spend" hero figures (text-4xl + bold)
//
// Tones map onto the existing zinc/emerald/red palette used by Kpi & KpiDelta.
import React from 'react';

export type MetricNumberSize = 'sm' | 'md' | 'lg' | 'hero';
export type MetricNumberTone = 'default' | 'positive' | 'negative' | 'muted';

const SIZE_CLASS: Record<MetricNumberSize, string> = {
  sm: 'text-sm',
  md: 'text-xl font-semibold',
  lg: 'text-2xl font-semibold',
  hero: 'text-4xl font-bold',
};

const TONE_CLASS: Record<MetricNumberTone, string> = {
  default: 'text-zinc-900',
  positive: 'text-emerald-600',
  negative: 'text-red-600',
  muted: 'text-zinc-400',
};

export interface MetricNumberProps {
  value: React.ReactNode;
  size?: MetricNumberSize;
  tone?: MetricNumberTone;
  className?: string;
}

export const MetricNumber: React.FC<MetricNumberProps> = ({
  value,
  size = 'md',
  tone = 'default',
  className = '',
}) => (
  <span
    className={`font-mono tabular-nums tracking-tight ${SIZE_CLASS[size]} ${TONE_CLASS[tone]} ${className}`}
  >
    {value}
  </span>
);
