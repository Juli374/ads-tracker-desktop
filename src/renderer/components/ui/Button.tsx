import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md';

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Optional left icon slot (e.g. a lucide-react icon). */
  leftIcon?: React.ReactNode;
}

export type ButtonProps = ButtonOwnProps &
  React.ButtonHTMLAttributes<HTMLButtonElement>;

const variantClass: Record<ButtonVariant, string> = {
  // Flat violet (no gradient — see anti-slop list)
  primary:
    'bg-accent text-accent-fg hover:bg-accent-hover border border-transparent',
  // 1px border, transparent body
  secondary:
    'bg-surface text-fg border border-border hover:bg-surface-2 hover:border-border-strong',
  // Transparent, border-less
  ghost:
    'bg-transparent text-fg-muted hover:text-fg hover:bg-surface-2 border border-transparent',
  // Error-red destructive
  destructive:
    'bg-error text-white hover:opacity-90 border border-transparent',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-sm',
  md: 'px-3.5 py-1.5 text-sm',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      leftIcon,
      className = '',
      type = 'button',
      children,
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={`
        inline-flex items-center justify-center gap-1.5
        font-medium rounded-sm
        transition-colors duration-100 ease-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:border-accent
        disabled:opacity-50 disabled:pointer-events-none
        ${sizeClass[size]}
        ${variantClass[variant]}
        ${className}
      `}
      {...rest}
    >
      {leftIcon}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
