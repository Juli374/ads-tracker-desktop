import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useEscapeClose } from '../../lib/useEscapeClose';

interface Props {
  title: string;
  subtitle?: string;
  testId?: string;
  closeAria: string;
  onClose(): void;
  // Если true — disable закрытие по Esc / overlay / X (например, во время submit'а).
  busy?: boolean;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const SIZE_CLASS: Record<NonNullable<Props['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

/**
 * Shared shell for all Search Terms modals (Phase J.1 Lane A).
 *
 * Styling, Esc-handling, overlay-click-to-close and ARIA contract are
 * unified so the 5 modals stay visually consistent and keyboard-accessible
 * without copy-pasting the boilerplate. Mirrors the pattern used by
 * `AddCampaignModal` / `BsrModal`.
 */
export const ModalShell: React.FC<Props> = ({
  title,
  subtitle,
  testId,
  closeAria,
  onClose,
  busy = false,
  size = 'md',
  children,
  footer,
}) => {
  useEscapeClose(onClose, !busy);

  // Pause global hotkeys (G K, etc.) while a modal is open. Same
  // convention as AddCampaignModal — MainLayout reads `data-modal-open`
  // and skips its own hotkey dispatch.
  useEffect(() => {
    document.body.dataset.modalOpen = 'true';
    return () => {
      delete document.body.dataset.modalOpen;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-zinc-900/20 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid={testId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className={`w-full ${SIZE_CLASS[size]} bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden my-auto`}
      >
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 tracking-tight">{title}</h2>
            {subtitle && (
              <div className="text-xs text-zinc-500 mt-0.5">{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
            aria-label={closeAria}
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
