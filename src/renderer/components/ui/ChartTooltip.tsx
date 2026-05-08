import React from 'react';

export interface ChartTooltipRow {
  label: string;
  value: string;
  color?: string;
}

interface Props {
  active?: boolean;
  title?: string;
  rows?: ChartTooltipRow[];
}

// Обёртка под Recharts <Tooltip content={...} />.
// Recharts передаёт payload, мы трансформируем его в наш формат через props.
export const ChartTooltip: React.FC<Props> = ({ active, title, rows }) => {
  if (!active || !rows || rows.length === 0) return null;
  return (
    <div className="bg-white border border-zinc-200 rounded-md shadow-soft px-3 py-2 min-w-[140px]">
      {title && <div className="text-[10px] text-zinc-400 mb-1">{title}</div>}
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
              {r.color && (
                <span
                  className="w-2 h-2 rounded-sm"
                  style={{ backgroundColor: r.color }}
                />
              )}
              {r.label}
            </div>
            <div className="text-[11px] font-medium text-zinc-900 tabular-nums">
              {r.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
