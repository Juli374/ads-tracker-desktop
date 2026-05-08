import React from 'react';

interface Props {
  title: string;
  description: string;
}

export const PagePlaceholder: React.FC<Props> = ({ title, description }) => {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          {title}
        </h1>
        <p className="text-sm text-zinc-500">{description}</p>
      </div>

      {/* Skeleton stat cards row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Spend', value: '—', hint: 'за период' },
          { label: 'Sales', value: '—', hint: 'за период' },
          { label: 'ACOS', value: '—', hint: 'средний' },
          { label: 'TACoS', value: '—', hint: 'средний' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white border border-zinc-200 rounded-lg p-4 shadow-soft"
          >
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
              {stat.label}
            </div>
            <div className="mt-2 text-2xl font-semibold text-zinc-900 tabular-nums">
              {stat.value}
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">{stat.hint}</div>
          </div>
        ))}
      </div>

      {/* Skeleton card */}
      <div className="bg-white border border-zinc-200 rounded-lg shadow-soft">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-900">
              Скоро здесь будет контент
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Скелет страницы — реальные данные появятся в следующих фазах
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            wip
          </span>
        </div>

        {/* Empty state pattern */}
        <div className="px-6 py-16 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mb-3">
            <div className="w-6 h-6 rounded-md bg-zinc-200" />
          </div>
          <div className="text-sm font-medium text-zinc-900 mb-1">
            Заглушка для «{title}»
          </div>
          <div className="text-xs text-zinc-500 max-w-sm">
            После переноса логики из текущего фронта здесь появятся таблицы, графики и фильтры.
          </div>
        </div>
      </div>
    </div>
  );
};
