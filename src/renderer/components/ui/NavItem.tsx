import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface NavItemProps {
  /** lucide-react icon component, e.g. `Home`. Rendered at 16px per DESIGN.md. */
  icon?: LucideIcon;
  label: React.ReactNode;
  active?: boolean;
  /** Optional right-aligned count, mono-formatted. */
  count?: number | string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  'data-testid'?: string;
  'aria-label'?: string;
  title?: string;
  /** Override the rendered element type (defaults to button). Pass 'a' for anchor. */
  as?: 'button' | 'a';
  href?: string;
}

/**
 * NavItem — sidebar nav row. Per DESIGN.md:
 * - padding 6px 10px, text-sm (13px)
 * - 16px lucide icon
 * - active: bg-accent-soft, text-accent, font-medium
 * - hover: bg-surface-2, text-fg
 * - count: right-aligned, mono+tabular-nums, text-fg-subtle
 */
export const NavItem: React.FC<NavItemProps> = ({
  icon: Icon,
  label,
  active = false,
  count,
  onClick,
  className = '',
  'data-testid': dataTestId,
  'aria-label': ariaLabel,
  title,
  as = 'button',
  href,
}) => {
  const baseClass = `
    w-full flex items-center gap-2
    px-2.5 py-1.5 rounded-sm text-sm
    transition-colors duration-100 ease-out
    ${
      active
        ? 'bg-accent-soft text-accent font-medium'
        : 'text-fg-muted hover:bg-surface-2 hover:text-fg font-normal'
    }
    ${className}
  `.trim();

  const content = (
    <>
      {Icon && <Icon size={16} className="flex-shrink-0" />}
      <span className="flex-1 min-w-0 truncate text-left">{label}</span>
      {count != null && (
        <span className="ml-auto text-xs font-mono tabular-nums text-fg-subtle">
          {count}
        </span>
      )}
    </>
  );

  if (as === 'a') {
    return (
      <a
        href={href}
        className={baseClass}
        data-testid={dataTestId}
        aria-label={ariaLabel}
        title={title}
        aria-current={active ? 'page' : undefined}
        onClick={(e) => onClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>)}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={baseClass}
      data-testid={dataTestId}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      title={title}
      onClick={onClick}
    >
      {content}
    </button>
  );
};
