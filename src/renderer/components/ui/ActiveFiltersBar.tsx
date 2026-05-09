import React from 'react';
import { X } from 'lucide-react';

export interface ActiveFilterChip {
  label: string;
  onRemove(): void;
}

interface Props {
  chips: ActiveFilterChip[];
}

export const ActiveFiltersBar: React.FC<Props> = ({ chips }) => {
  if (chips.length === 0) return null;
  return (
    <div className="flex items-center flex-wrap gap-1.5">
      <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
        Активные фильтры
      </span>
      {chips.map((c) => (
        <button
          key={c.label}
          onClick={c.onRemove}
          className="
            inline-flex items-center gap-1.5 h-6 px-2 rounded-md
            text-[11px] font-medium bg-zinc-100 text-zinc-700
            border border-zinc-200
            hover:bg-zinc-200 transition-colors
          "
          title="Сбросить"
        >
          <span className="max-w-[180px] truncate">{c.label}</span>
          <X size={10} className="text-zinc-500" />
        </button>
      ))}
    </div>
  );
};
