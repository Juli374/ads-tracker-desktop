import React from 'react';

export interface FieldProps {
  /** Label text or node above the control. */
  label: React.ReactNode;
  /** Pairs the label with the control via `htmlFor`. */
  htmlFor?: string;
  /** Helper text shown below the control (muted). */
  hint?: React.ReactNode;
  /** Error text shown below the control (red). Overrides `hint` when set. */
  error?: React.ReactNode;
  /** Marks the field as required and renders a red asterisk after the label. */
  required?: boolean;
  /** The control (Input / Select / Textarea / etc.). */
  children: React.ReactNode;
  /** Extra classes on the wrapper. */
  className?: string;
}

/**
 * Field — label + control + helper/error text triplet.
 * Replaces the ad-hoc `<label className="text-xs ...">...</label><Input />`
 * blocks scattered across modal forms.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className = '',
}: FieldProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-zinc-700"
      >
        {label}
        {required && (
          <span className="text-error ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-error">{error}</p>
      ) : hint ? (
        <p className="text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
