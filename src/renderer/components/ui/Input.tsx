import React from 'react';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Input — base text input. Per DESIGN.md:
 * - 1px border-border, rounded-sm, px-3 py-1.5, text-sm
 * - bg-surface text-fg
 * - focus: border-accent + ring-2 ring-accent-soft, no outline
 * - disabled: opacity-50
 *
 * Callers can append className to override or extend.
 * Numeric inputs should also pass `font-mono tabular-nums` via className.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', type = 'text', ...rest }, ref) => (
    <input
      ref={ref}
      type={type}
      className={`
        w-full bg-surface text-fg
        border border-border rounded-sm
        px-3 py-1.5 text-sm
        placeholder:text-fg-subtle
        focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors duration-100 ease-out
        ${className}
      `}
      {...rest}
    />
  ),
);
Input.displayName = 'Input';
