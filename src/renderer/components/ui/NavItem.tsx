import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface NavItemProps {
  /** lucide-react icon component, e.g. `Home`. Rendered at 16px per DESIGN.md. */
  icon?: LucideIcon | React.ReactNode;
  label: React.ReactNode;
  active?: boolean;
  /** Optional right-aligned count, mono-formatted. */
  count?: number | string;
  /**
   * Phase K / Q.1: when set, renders a small uppercase tier badge to the
   * right of the label. Amber for `pro`, purple for `business` per
   * design-dna. Click is NOT blocked — the page itself renders the upgrade
   * card.
   */
  lockedTier?: 'pro' | 'business';
  /** Text to display inside the locked badge (typically the translated tier name). */
  lockedBadgeText?: string;
  /** Test ID forwarded to the locked badge `<span>`. */
  lockedBadgeTestId?: string;
  /**
   * Optional keyboard-shortcut hint shown on the right (visible on hover,
   * faintly visible when active). Example: `'G O'`. Hidden when `lockedTier`
   * is set — the badge takes priority.
   */
  shortcut?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  /** Preferred way to set the test ID. `data-testid` is still accepted for back-compat. */
  dataTestId?: string;
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
 * - lockedTier: small uppercase tier badge (amber=pro, purple=business)
 * - shortcut: mono shortcut hint shown on hover (or active)
 */
export const NavItem: React.FC<NavItemProps> = ({
  icon,
  label,
  active = false,
  count,
  lockedTier,
  lockedBadgeText,
  lockedBadgeTestId,
  shortcut,
  onClick,
  className = '',
  dataTestId,
  'data-testid': dataTestIdLegacy,
  'aria-label': ariaLabel,
  title,
  as = 'button',
  href,
}) => {
  const baseClass = `
    group w-full flex items-center gap-2
    px-2.5 py-1.5 rounded-sm text-sm
    transition-colors duration-100 ease-out
    ${
      active
        ? 'bg-accent-soft text-accent font-medium'
        : 'text-fg-muted hover:bg-surface-2 hover:text-fg font-normal'
    }
    ${className}
  `.trim();

  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) {
      return <span className="flex-shrink-0 inline-flex">{icon}</span>;
    }
    // Treat as a LucideIcon component.
    const IconCmp = icon as LucideIcon;
    return <IconCmp size={16} className="flex-shrink-0" />;
  };

  const badgeTier = lockedTier;
  const showShortcut = shortcut && !badgeTier;
  const badgeText = lockedBadgeText ?? (badgeTier === 'business' ? 'Business' : 'Pro');
  const badgeColorClass =
    badgeTier === 'business'
      ? 'bg-purple-100 text-purple-700'
      : 'bg-amber-100 text-amber-700';

  const content = (
    <>
      {renderIcon()}
      <span className="flex-1 min-w-0 truncate text-left">{label}</span>
      {badgeTier && (
        <span
          data-testid={lockedBadgeTestId}
          className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${badgeColorClass}`}
        >
          {badgeText}
        </span>
      )}
      {showShortcut && (
        <span
          className={`text-[10px] font-mono tracking-wider text-fg-subtle transition-opacity ${
            active ? 'opacity-60' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {shortcut}
        </span>
      )}
      {count != null && (
        <span className="ml-auto text-xs font-mono tabular-nums text-fg-subtle">
          {count}
        </span>
      )}
    </>
  );

  const testId = dataTestId ?? dataTestIdLegacy;
  const dataLocked = badgeTier ? 'true' : undefined;

  if (as === 'a') {
    return (
      <a
        href={href}
        className={baseClass}
        data-testid={testId}
        data-locked={dataLocked}
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
      data-testid={testId}
      data-locked={dataLocked}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      title={title}
      onClick={onClick}
    >
      {content}
    </button>
  );
};
