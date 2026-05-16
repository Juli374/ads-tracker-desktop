import React from 'react';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Input — base text input. Per DESIGN.md (Phase Q.1.3 height-aligned):
 * - 1px border-border, rounded-btn (6px), h-9, px-3, text-sm
 * - bg-surface text-fg
 * - focus: border-accent + ring-2 ring-accent-soft, no outline
 * - disabled: opacity-50
 *
 * Matches the inline `inputClass` pattern used across modal forms
 * (`h-9 px-3 rounded-md`) so swap-in is visually zero-diff.
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
        w-full h-9 bg-surface text-fg
        border border-border rounded-btn
        px-3 text-sm
        placeholder:text-fg-subtle
        focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors duration-fast ease-smooth
        ${className}
      `}
      {...rest}
    />
  ),
);
Input.displayName = 'Input';
