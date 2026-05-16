import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Modal — canonical overlay primitive (Phase Q.1.1).
 *
 * Promoted from `searchTerms/ModalShell` so the rest of the app (15+ modal
 * components reimplementing overlay/Esc/focus-trap from scratch) can converge
 * on one shell. Provides:
 *
 *   - Backdrop (zinc-900/20 + backdrop-blur-sm, the 12-modal majority pattern).
 *   - Esc to close (opt-out via `closeOnEsc={false}`).
 *   - Overlay click to close (opt-out via `closeOnOverlay={false}`).
 *   - Body scroll lock + `data-modal-open` on <body> while open (MainLayout
 *     reads this flag to pause global hotkeys, see `useGlobalHotkeys`).
 *   - Focus management: focus first focusable on open, restore previous focus
 *     on close.
 *   - Renders via `createPortal` into `document.body` to escape stacking
 *     contexts (z-index pitfalls inside scrollable parents).
 *
 * Canonical structure:
 *
 *   <Modal open={open} onClose={onClose} size="md" title="Edit campaign">
 *     <ModalBody>...</ModalBody>
 *     <ModalFooter>
 *       <Button variant="secondary" onClick={onClose}>Cancel</Button>
 *       <Button variant="primary"   onClick={onSave}>Save</Button>
 *     </ModalFooter>
 *   </Modal>
 *
 * Or compose explicitly (omit the `title` prop):
 *
 *   <Modal open={open} onClose={onClose} ariaLabel="Edit campaign">
 *     <ModalHeader title="Edit campaign" onClose={onClose} />
 *     <ModalBody>...</ModalBody>
 *     <ModalFooter>...</ModalFooter>
 *   </Modal>
 */

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  open: boolean;
  onClose(): void;
  /** Width preset. Default `'md'`. */
  size?: ModalSize;
  /** When set, renders `<ModalHeader>` internally with this title + a close button. */
  title?: React.ReactNode;
  /** Screen-reader label used when no `title` is provided. */
  ariaLabel?: string;
  /** Default `true`. */
  closeOnOverlay?: boolean;
  /** Default `true`. */
  closeOnEsc?: boolean;
  /** Override classes on the inner card (rare — prefer the size variants). */
  containerClassName?: string;
  children: React.ReactNode;
  'data-testid'?: string;
}

export interface ModalHeaderProps {
  title: React.ReactNode;
  onClose?: () => void;
  description?: React.ReactNode;
}

export interface ModalBodyProps {
  children: React.ReactNode;
  className?: string;
}

export interface ModalFooterProps {
  children: React.ReactNode;
  /** Default `'end'`. */
  justify?: 'between' | 'end';
  className?: string;
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

const FOCUSABLE_SELECTOR =
  'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export const ModalHeader: React.FC<ModalHeaderProps> = ({ title, onClose, description }) => (
  <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-zinc-100">
    <div>
      <h2 className="font-display text-base font-bold tracking-tight text-zinc-900">
        {title}
      </h2>
      {description && <div className="text-xs text-zinc-500 mt-0.5">{description}</div>}
    </div>
    {onClose && (
      <button
        type="button"
        onClick={onClose}
        className="text-zinc-400 hover:text-zinc-700 transition-colors"
        aria-label="Close"
      >
        <X size={16} strokeWidth={2} />
      </button>
    )}
  </div>
);
ModalHeader.displayName = 'ModalHeader';

export const ModalBody: React.FC<ModalBodyProps> = ({ children, className }) => (
  <div className={className ?? 'px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto'}>
    {children}
  </div>
);
ModalBody.displayName = 'ModalBody';

export const ModalFooter: React.FC<ModalFooterProps> = ({
  children,
  justify = 'end',
  className,
}) => (
  <div
    className={
      className ??
      `flex items-center ${justify === 'between' ? 'justify-between' : 'justify-end'} gap-2 px-5 py-3 border-t border-zinc-100`
    }
  >
    {children}
  </div>
);
ModalFooter.displayName = 'ModalFooter';

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  size = 'md',
  title,
  ariaLabel,
  closeOnOverlay = true,
  closeOnEsc = true,
  containerClassName,
  children,
  'data-testid': testId,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Remember which element had focus before opening so we can restore it.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Escape-key handler. Registered at the document level so it works no
  // matter where focus is inside the modal.
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [open, closeOnEsc, onClose]);

  // Body scroll lock + the global `data-modal-open` flag MainLayout uses to
  // pause hotkeys (G K, etc.) while a modal is on screen.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.dataset.modalOpen = 'true';
    return () => {
      document.body.style.overflow = previousOverflow;
      delete document.body.dataset.modalOpen;
    };
  }, [open]);

  // Focus management: capture the previously focused element on open,
  // move focus into the modal, and restore it on close.
  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    // Defer the focus call by one tick so the portal has mounted into the DOM
    // and `containerRef.current` is populated.
    const id = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const focusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable) {
        focusable.focus();
      } else {
        // No interactive element inside? Focus the container itself so Esc/Tab
        // still works for keyboard users.
        container.focus();
      }
    }, 0);

    return () => {
      window.clearTimeout(id);
      const previous = previouslyFocusedRef.current;
      if (previous && typeof previous.focus === 'function') {
        previous.focus();
      }
    };
  }, [open]);

  const handleOverlayMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!closeOnOverlay) return;
      // Only treat clicks on the overlay itself (not on the card) as a
      // close gesture. Without this, a drag that starts inside an input
      // and ends outside would close the modal — a common UX papercut.
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [closeOnOverlay, onClose],
  );

  if (!open) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-zinc-900/20 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={title && typeof title === 'string' ? title : ariaLabel}
      data-testid={testId}
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className={
          containerClassName ??
          `w-full ${SIZE_CLASS[size]} my-auto bg-white border border-zinc-200 rounded-modal shadow-modal overflow-hidden focus:outline-none`
        }
      >
        {title !== undefined && <ModalHeader title={title} onClose={onClose} />}
        {children}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};
Modal.displayName = 'Modal';
