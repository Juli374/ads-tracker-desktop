import React from 'react';

/**
 * iOS-style on/off switch. Extracted (Phase R) from UpdateChecker's local
 * SettingToggle so the module-activation catalog — and any future settings —
 * reuse one primitive. Controlled: pass `checked` + `onChange(next)`.
 *
 * Design tokens (DESIGN.md): emerald-on / zinc-off, duration-fast + ease-smooth
 * transitions, emerald focus ring. Keeps role="switch" + aria-checked so it is
 * accessible and selectable in tests via [role="switch"] or data-testid.
 */
export const Switch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  testId?: string;
  'aria-label'?: string;
}> = ({ checked, onChange, disabled = false, testId, 'aria-label': ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    data-testid={testId}
    className={`
      relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full
      transition-colors duration-fast ease-smooth
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40
      disabled:opacity-50 disabled:cursor-not-allowed
      ${checked ? 'bg-emerald-500' : 'bg-zinc-300'}
    `}
  >
    <span
      className={`
        inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm
        transition-transform duration-fast ease-smooth
        ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}
      `}
    />
  </button>
);
