import React from 'react';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * Textarea — multiline text input. Matches Input styling tokens
 * (border-border, rounded-btn, accent focus ring) but uses
 * `px-3 py-2` padding (height is content-driven, no `h-9`).
 *
 * `resize-none` by default — callers can override with className.
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', ...rest }, ref) => (
    <textarea
      ref={ref}
      className={`
        w-full bg-surface text-fg
        border border-border rounded-btn
        px-3 py-2 text-sm resize-none
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
Textarea.displayName = 'Textarea';
