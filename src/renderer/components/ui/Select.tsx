import React from 'react';
import { ChevronDown } from 'lucide-react';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Select — native `<select>` styled to match Input (h-9, rounded-btn).
 * Native is preferred for desktop (Electron) — gets OS-native dropdown UX
 * + free keyboard/a11y behavior without dragging in Radix/headlessui.
 *
 * Rendered as a `relative` wrapper containing the `<select>` + an
 * absolutely-positioned chevron, since `appearance-none` strips the
 * native arrow.
 *
 * The wrapper receives the consumer-passed `className` (so layout
 * utilities like `w-full`, `flex-1` apply), while the inner select
 * keeps the visual primitive styling.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', children, ...rest }, ref) => (
    <div className={`relative ${className}`}>
      <select
        ref={ref}
        className={`
          w-full h-9 bg-surface text-fg
          border border-border rounded-btn
          pl-3 pr-8 text-sm
          appearance-none
          focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-fast ease-smooth
        `}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        aria-hidden="true"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none"
      />
    </div>
  ),
);
Select.displayName = 'Select';
