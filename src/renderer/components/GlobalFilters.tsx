import React, { useEffect, useRef, useState } from 'react';
import { Filter, X } from 'lucide-react';
import { useGlobalFilters } from '../contexts/GlobalFiltersContext';
import { useMarketplaces } from '../contexts/MarketplacesContext';

export const GlobalFilters: React.FC = () => {
  const { list: marketplaces } = useMarketplaces();
  const { filters, toggleMarketplace, reset, hasAny } = useGlobalFilters();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Закрытие по клику вне
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectedCount = filters.marketplaces.length;
  const buttonLabel =
    selectedCount === 0
      ? 'Все MPs'
      : selectedCount === 1
      ? filters.marketplaces[0]
      : `${selectedCount} MPs`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`
          flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs transition-colors
          border
          ${hasAny
            ? 'bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800'
            : 'bg-white text-zinc-600 border-zinc-200 hover:text-zinc-900 hover:bg-zinc-50'}
        `}
        aria-label="Глобальные фильтры"
        aria-expanded={open}
      >
        <Filter size={11} />
        <span className="font-medium">{buttonLabel}</span>
        {hasAny && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              reset();
            }}
            className="ml-1 hover:text-zinc-300 transition-colors cursor-pointer"
            role="button"
            aria-label="Сбросить фильтры"
          >
            <X size={11} />
          </span>
        )}
      </button>

      {open && (
        <div
          className="
            absolute right-0 top-9 z-40 w-64 bg-white border border-zinc-200
            rounded-lg shadow-card overflow-hidden
          "
        >
          <div className="px-3 py-2 border-b border-zinc-100 flex items-center justify-between">
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Маркетплейсы
            </div>
            {hasAny && (
              <button
                onClick={() => reset()}
                className="text-[10px] text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                Сбросить
              </button>
            )}
          </div>
          <div className="max-h-[280px] overflow-y-auto py-1">
            {marketplaces.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-400">Загрузка…</div>
            ) : (
              marketplaces.map((code) => {
                const selected = filters.marketplaces.includes(code);
                return (
                  <button
                    key={code}
                    onClick={() => toggleMarketplace(code)}
                    className="
                      w-full flex items-center gap-2.5 px-3 h-8 text-sm text-left
                      hover:bg-zinc-50 transition-colors
                    "
                  >
                    <span
                      className={`
                        w-3.5 h-3.5 rounded border flex items-center justify-center
                        ${selected
                          ? 'bg-zinc-900 border-zinc-900'
                          : 'bg-white border-zinc-300'}
                      `}
                    >
                      {selected && (
                        <svg
                          width="9"
                          height="9"
                          viewBox="0 0 9 9"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M1 4.5L3.5 7L8 1.5"
                            stroke="white"
                            strokeWidth="1.5"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="text-xs text-zinc-700 uppercase font-mono">
                      {code}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
