// GradientArea — single-metric area chart with soft gradient fill.
// Matches KDPBook mockup style: no vertical grid, minimal axis, soft fade from accent color
// to transparent. Used when a dashboard surface wants a "hero" visual rather than a
// multi-line analytical view.
//
// Phase Q.1.5 — chart primitive. Caller owns its container (Card, panel, etc.); the
// component renders only the chart + an optional absolutely-positioned headline overlay.
import React, { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltip, type ChartTooltipRow } from '../ChartTooltip';
import { EmptyState } from '../States';

// Module palette mirrors book-platform/design-dna.json → palette.modules.
export type ChartModule = 'ads' | 'analytics' | 'publishing' | 'ai' | 'marketplace';

const MODULE_COLOR: Record<ChartModule, string> = {
  ads: '#10b981',
  analytics: '#3b82f6',
  publishing: '#8b5cf6',
  ai: '#f59e0b',
  marketplace: '#f43f5e',
};

export interface GradientAreaProps<T extends Record<string, unknown>> {
  data: ReadonlyArray<T>;
  xKey: keyof T & string;
  yKey: keyof T & string;
  /** Default 'analytics' (blue) — matches the marketing mockup. */
  module?: ChartModule;
  /** Overrides the module color; useful for one-off accents. */
  color?: string;
  /** Default 240. */
  height?: number;
  tickFormatX?: (v: unknown) => string;
  tickFormatY?: (v: unknown) => string;
  tooltipFormatValue?: (v: unknown) => string;
  /** Shown as the tooltip row label; falls back to the y-axis key. */
  tooltipLabel?: string;
  /** Big number shown top-left of the chart (Playfair Display, font-display). */
  headlineValue?: React.ReactNode;
  /** Small uppercase caption above the headline. */
  headlineLabel?: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

const AXIS_TICK = {
  fill: '#a1a1aa',
  fontSize: 10,
  fontFamily: 'JetBrains Mono',
};

type RechartsTickFormatter = (value: unknown, index: number) => string;

// Recharts' tickFormatter signature is (value, index) => string. We expose a simpler
// (value) => string contract to callers; this adapter is internal.
const adapt = (
  fn: ((v: unknown) => string) | undefined,
): RechartsTickFormatter | undefined =>
  fn ? (value) => fn(value) : undefined;

export function GradientArea<T extends Record<string, unknown>>({
  data,
  xKey,
  yKey,
  module = 'analytics',
  color: colorOverride,
  height = 240,
  tickFormatX,
  tickFormatY,
  tooltipFormatValue,
  tooltipLabel,
  headlineValue,
  headlineLabel,
  className,
  'data-testid': testId,
}: GradientAreaProps<T>): React.ReactElement {
  // useId guarantees a stable, collision-free gradient id even when multiple
  // GradientArea instances mount in the same tree.
  const rawId = useId();
  const gradientId = `gradient-area-${rawId.replace(/:/g, '')}`;
  const color = colorOverride ?? MODULE_COLOR[module];

  if (data.length === 0) {
    return (
      <div
        className={className}
        style={{ height }}
        data-testid={testId}
      >
        <EmptyState />
      </div>
    );
  }

  return (
    <div
      className={`relative ${className ?? ''}`.trim()}
      style={{ height }}
      data-testid={testId}
    >
      {(headlineValue != null || headlineLabel != null) && (
        <div className="absolute top-3 left-3 pointer-events-none z-10">
          {headlineLabel != null && (
            <div className="text-[10px] uppercase tracking-wider text-zinc-400">
              {headlineLabel}
            </div>
          )}
          {headlineValue != null && (
            <div className="font-display text-2xl font-bold tracking-tight text-zinc-900">
              {headlineValue}
            </div>
          )}
        </div>
      )}

      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data as ReadonlyArray<Record<string, unknown>> as Array<Record<string, unknown>>}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#f4f4f5" />
          <XAxis
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataKey={xKey as any}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            tickFormatter={adapt(tickFormatX)}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            tickFormatter={adapt(tickFormatY)}
          />
          <Tooltip
            content={({ active, label, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const point = payload[0];
              const value = point.value;
              const rows: ChartTooltipRow[] = [
                {
                  label: tooltipLabel ?? yKey,
                  value: tooltipFormatValue
                    ? tooltipFormatValue(value)
                    : String(value ?? '—'),
                  color,
                },
              ];
              return <ChartTooltip active title={label != null ? String(label) : undefined} rows={rows} />;
            }}
            cursor={{ stroke: '#e4e4e7' }}
          />
          <Area
            type="monotone"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dataKey={yKey as any}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
