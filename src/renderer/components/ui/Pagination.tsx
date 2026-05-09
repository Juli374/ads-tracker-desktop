import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fmtNumber } from '../../lib/format';

interface Props {
  page: number;
  pages: number;
  total: number;
  perPage: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

export const Pagination: React.FC<Props> = ({
  page,
  pages,
  total,
  perPage,
  onChange,
  disabled = false,
}) => {
  const { t } = useTranslation('common');
  if (pages <= 1) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  return (
    <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-between">
      <div className="text-[11px] text-zinc-500">
        {t('pagination.showingRange', { from, to, total: fmtNumber(total) })}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={disabled || page <= 1}
          className="
            h-7 w-7 flex items-center justify-center rounded-md
            text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100
            disabled:opacity-40 disabled:cursor-not-allowed transition-colors
          "
          aria-label={t('pagination.prevPage')}
        >
          <ChevronLeft size={14} />
        </button>
        <div className="text-[11px] text-zinc-700 tabular-nums px-2">
          {page} / {pages}
        </div>
        <button
          onClick={() => onChange(Math.min(pages, page + 1))}
          disabled={disabled || page >= pages}
          className="
            h-7 w-7 flex items-center justify-center rounded-md
            text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100
            disabled:opacity-40 disabled:cursor-not-allowed transition-colors
          "
          aria-label={t('pagination.nextPage')}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
