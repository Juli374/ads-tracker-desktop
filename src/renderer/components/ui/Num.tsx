import React from 'react';

type NumProps = React.HTMLAttributes<HTMLSpanElement> & {
  children: React.ReactNode;
};

/**
 * Num — thin wrapper that renders a span with `font-mono tabular-nums tracking-tight`.
 * Per DESIGN.md: every number-bearing JSX should use this.
 *
 * Caller-supplied className is merged AFTER the base classes, so callers can
 * override (e.g. add `text-success`, `text-right`, etc.).
 */
export const Num = React.forwardRef<HTMLSpanElement, NumProps>(
  ({ className = '', children, ...rest }, ref) => (
    <span
      ref={ref}
      className={`font-mono tabular-nums tracking-tight ${className}`.trim()}
      {...rest}
    >
      {children}
    </span>
  ),
);
Num.displayName = 'Num';
