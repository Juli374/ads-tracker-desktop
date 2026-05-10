import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { BooksDrillLevel, BooksDrillState } from '../../contexts/NavContext';

interface Props {
  drill: BooksDrillState;
  onNavigate(level: BooksDrillLevel): void;
}

export const BookBreadcrumb: React.FC<Props> = ({ drill, onNavigate }) => {
  const { t } = useTranslation('books');

  const crumbs: Array<{ label: string; level: BooksDrillLevel; testId: string }> = [
    { label: t('drill.breadcrumbAll'), level: 'list', testId: 'book-breadcrumb-list' },
  ];

  if (drill.level !== 'list' && drill.selectedBookTitle) {
    crumbs.push({
      label: drill.selectedBookTitle,
      level: 'marketplaces',
      testId: 'book-breadcrumb-marketplaces',
    });
  }

  if (drill.level === 'campaigns' && drill.selectedMarketplace) {
    crumbs.push({
      label: drill.selectedMarketplace.toUpperCase(),
      level: 'campaigns',
      testId: 'book-breadcrumb-campaigns',
    });
  }

  return (
    <nav className="flex items-center gap-1 text-xs text-zinc-500" aria-label="Books breadcrumb">
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <React.Fragment key={crumb.level}>
            {idx > 0 && <ChevronRight size={12} className="text-zinc-300 flex-shrink-0" />}
            <button
              type="button"
              data-testid={crumb.testId}
              onClick={() => !isLast && onNavigate(crumb.level)}
              className={
                isLast
                  ? 'text-zinc-900 font-medium cursor-default'
                  : 'hover:text-zinc-900 transition-colors cursor-pointer'
              }
            >
              {crumb.label}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
};
