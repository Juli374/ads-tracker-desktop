// Tabs — Phase Q.1 primitive.
// Canonical underline-style tab bar. Three different tab implementations exist
// today (AlertsPage / ReportsPage / NegativesPage have one style;
// SearchTermsPage another). This is the canonical replacement.
//
// Visual contract:
//   container: `flex items-center gap-1 border-b border-zinc-200 overflow-x-auto`
//   tab base:  `relative inline-flex items-center gap-1.5 h-9 px-3 text-sm
//               transition-colors`
//   inactive:  `text-zinc-500 hover:text-zinc-900`
//   active:    `text-zinc-900 font-medium border-b-2 border-zinc-900 -mb-px`
//   disabled:  `text-zinc-300 cursor-not-allowed`
//   count badge (when count > 0):
//     `text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-100
//      text-zinc-600`
//
// a11y: container is `role="tablist"`, each tab is `role="tab"
// aria-selected={isActive}`.
import React from 'react';

export interface TabItem<T extends string> {
  value: T;
  label: React.ReactNode;
  count?: number;
  icon?: React.ReactNode;
  disabled?: boolean;
  testId?: string;
}

export interface TabsProps<T extends string> {
  value: T;
  onChange(value: T): void;
  items: ReadonlyArray<TabItem<T>>;
  className?: string;
  'aria-label'?: string;
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
  'aria-label': ariaLabel,
}: TabsProps<T>): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-1 border-b border-zinc-200 overflow-x-auto${
        className ? ` ${className}` : ''
      }`}
    >
      {items.map((item) => {
        const isActive = item.value === value;
        const isDisabled = item.disabled === true;

        let stateClasses: string;
        if (isDisabled) {
          stateClasses = 'text-zinc-300 cursor-not-allowed';
        } else if (isActive) {
          stateClasses =
            'text-zinc-900 font-medium border-b-2 border-zinc-900 -mb-px';
        } else {
          stateClasses = 'text-zinc-500 hover:text-zinc-900';
        }

        return (
          <button
            key={String(item.value)}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={isDisabled || undefined}
            disabled={isDisabled}
            data-testid={item.testId ?? `tab-${item.value}`}
            onClick={() => {
              if (!isDisabled && !isActive) {
                onChange(item.value);
              }
            }}
            className={`relative inline-flex items-center gap-1.5 h-9 px-3 text-sm transition-colors duration-fast ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft ${stateClasses}`}
          >
            {item.icon != null && (
              <span aria-hidden="true" className="inline-flex items-center">
                {item.icon}
              </span>
            )}
            {item.label}
            {item.count != null && item.count > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
