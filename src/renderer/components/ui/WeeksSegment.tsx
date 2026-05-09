import React from 'react';
import { useTranslation } from 'react-i18next';
import { useWeeksFilter, WEEKS_OPTIONS, WeeksCount } from '../../contexts/WeeksFilterContext';

interface Props {
  className?: string;
}

export const WeeksSegment: React.FC<Props> = ({ className }) => {
  const { t } = useTranslation('common');
  const { weeksCount, setWeeksCount } = useWeeksFilter();
  return (
    <div
      className={`inline-flex items-center bg-white border border-zinc-200 rounded-md p-0.5 ${className ?? ''}`}
      role="tablist"
      aria-label={t('weeks.aria')}
      data-testid="weeks-segment"
    >
      {WEEKS_OPTIONS.map((n: WeeksCount) => (
        <button
          key={n}
          type="button"
          role="tab"
          aria-selected={weeksCount === n}
          data-testid={`weeks-option-${n}`}
          onClick={() => setWeeksCount(n)}
          className={`
            px-2.5 h-7 text-xs font-medium rounded transition-colors
            ${weeksCount === n
              ? 'bg-zinc-100 text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-900'}
          `}
          title={t('weeks.optionTitle', { count: n })}
        >
          {n}W
        </button>
      ))}
    </div>
  );
};
