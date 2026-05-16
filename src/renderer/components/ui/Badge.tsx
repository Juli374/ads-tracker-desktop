import React from 'react';

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'neutral'
  | 'active';
export type BadgeSize = 'xs' | 'sm' | 'md';
export type BadgeShape = 'rect' | 'pill';

interface BadgeOwnProps {
  variant?: BadgeVariant;
  /** Show a small leading dot in the variant color. */
  dot?: boolean;
  /** xs = dense table status pill, sm = compact label, md = default */
  size?: BadgeSize;
  /** pill adds rounded-pill + uppercase tracking-wider */
  shape?: BadgeShape;
}

export type BadgeProps = BadgeOwnProps &
  React.HTMLAttributes<HTMLSpanElement>;

// Light-mode: soft-bg + colored fg.
// Dark-mode: transparent + bordered (per DESIGN.md "Status badges" rule).
//
// `active` (Phase Q.1) maps to emerald — explicit semantic "this thing is
// running / live". For paused/pending, callers should use existing `warning` or
// `neutral`. Active uses raw emerald tokens (not the success-* aliases) so it
// reads as "operational state" rather than "success outcome".
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
  active:
    'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-transparent dark:border dark:border-emerald-500',
};

const dotClass: Record<BadgeVariant, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-info',
  neutral: 'bg-fg-subtle',
  active: 'bg-emerald-500',
};

const sizeClass: Record<BadgeSize, string> = {
  xs: 'h-4 text-[10px] px-1.5',
  sm: 'h-5 text-[10px] px-2',
  md: 'h-5 text-xs px-2',
};

const shapeClass: Record<BadgeShape, string> = {
  rect: 'rounded-sm',
  pill: 'rounded-pill uppercase tracking-wider',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = 'neutral',
      dot = false,
      size = 'md',
      shape = 'rect',
      className = '',
      children,
      ...rest
    },
    ref,
  ) => (
    <span
      ref={ref}
      className={`
        inline-flex items-center gap-1
        font-medium
        py-0.5
        ${sizeClass[size]}
        ${shapeClass[shape]}
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
