import React from 'react';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeOwnProps {
  variant?: BadgeVariant;
  /** Show a small leading dot in the variant color. */
  dot?: boolean;
}

export type BadgeProps = BadgeOwnProps &
  React.HTMLAttributes<HTMLSpanElement>;

// Light-mode: soft-bg + colored fg.
// Dark-mode: transparent + bordered (per DESIGN.md "Status badges" rule).
const variantClass: Record<BadgeVariant, string> = {
  success:
    'bg-success-soft text-success dark:bg-transparent dark:border dark:border-success',
  warning:
    'bg-warning-soft text-warning dark:bg-transparent dark:border dark:border-warning',
  error:
    'bg-error-soft text-error dark:bg-transparent dark:border dark:border-error',
  info:
    'bg-info-soft text-info dark:bg-transparent dark:border dark:border-info',
  neutral:
    'bg-surface-2 text-fg-muted dark:bg-transparent dark:border dark:border-border-strong',
};

const dotClass: Record<BadgeVariant, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-info',
  neutral: 'bg-fg-subtle',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'neutral', dot = false, className = '', children, ...rest }, ref) => (
    <span
      ref={ref}
      className={`
        inline-flex items-center gap-1
        text-xs font-medium
        px-2 py-0.5 rounded-sm
        ${variantClass[variant]}
        ${className}
      `}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={`w-1.5 h-1.5 rounded-full ${dotClass[variant]}`}
        />
      )}
      {children}
    </span>
  ),
);
Badge.displayName = 'Badge';
