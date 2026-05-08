import React from 'react';
import { RefreshCw } from 'lucide-react';
import { RANGES, RangeId, RangeOption } from '../../lib/dateRange';

interface RangePickerProps {
  value: RangeId;
  onChange: (next: RangeId) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  ranges?: RangeOption[];
}

export const RangePicker: React.FC<RangePickerProps> = ({
  value,
  onChange,
  onRefresh,
  refreshing = false,
  ranges = RANGES.slice(0, 3),
}) => (
  <div className="flex items-center gap-1.5">
    <div className="inline-flex items-center bg-white border border-zinc-200 rounded-md p-0.5">
      {ranges.map((r) => (
        <button
          key={r.id}
          onClick={() => onChange(r.id)}
          className={`
            px-2.5 h-7 text-xs font-medium rounded
            transition-colors
            ${value === r.id
              ? 'bg-zinc-100 text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-900'}
          `}
        >
          {r.label}
        </button>
      ))}
    </div>
    {onRefresh && (
      <button
        onClick={onRefresh}
        className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
        title="Обновить"
      >
        <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
      </button>
    )}
  </div>
);
