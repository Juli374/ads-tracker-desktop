// SegmentedControl — replaces 14+ inline `inline-flex bg-white border-zinc-200 rounded-md p-0.5`
// patterns. Active state is NEUTRAL (bg-zinc-100), not colored. Cosmetic-only — if a
// segmented control needs to convey status (active/paused), use a Badge instead.
import React from 'react';

export interface SegmentedControlOption<T> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  testId?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange(value: T): void;
  options: ReadonlyArray<SegmentedControlOption<T>>;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  'aria-label': ariaLabel,
  'data-testid': dataTestId,
}: SegmentedControlProps<T>): JSX.Element {
  const sizeClasses =
    size === 'sm' ? 'h-6 text-[11px] px-2' : 'h-7 text-xs px-2.5';

  return (
    <div
      className={`inline-flex items-center bg-white border border-zinc-200 rounded-btn p-0.5 gap-0.5${
        className ? ` ${className}` : ''
      }`}
      role="radiogroup"
      aria-label={ariaLabel}
      data-testid={dataTestId}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        const isDisabled = option.disabled === true;

        let stateClasses: string;
        if (isDisabled) {
          stateClasses = 'text-zinc-300 cursor-not-allowed';
        } else if (isActive) {
          stateClasses = 'bg-zinc-100 text-zinc-900 font-medium';
        } else {
          stateClasses = 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50';
        }

        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-disabled={isDisabled || undefined}
            disabled={isDisabled}
            data-testid={option.testId ?? `segmented-${option.value}`}
            onClick={() => {
              if (!isDisabled && !isActive) {
                onChange(option.value);
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-[5px] ${sizeClasses} transition-colors duration-fast ease-smooth ${stateClasses}`}
          >
            {option.icon != null && (
              <span aria-hidden="true" className="inline-flex items-center">
                {option.icon}
              </span>
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
