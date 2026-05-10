import { useEffect } from 'react';

/**
 * Listens for the Escape key and calls `onClose` when pressed. Pair with
 * `aria-modal="true"` and `role="dialog"` on the modal container for a basic
 * a11y contract: keyboard users can exit, screen readers know it's a dialog.
 *
 * The handler is scoped to `document` (capture phase) so it works even when
 * focus is inside a deeply nested input or button.
 */
export function useEscapeClose(onClose: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [onClose, enabled]);
}
