import { useEffect } from 'react';
import type { DeepLinkEvent } from '../../shared/ipc';

// Подписка на deeplink-события из main процесса. Хендлер получает URL вида
// ads-tracker-desktop://callback?code=...&state=...
//
// Если window.api недоступен (vitest/jsdom) — хук просто ничего не делает.
export function useDeepLink(handler: (e: DeepLinkEvent) => void) {
  useEffect(() => {
    if (typeof window.api?.onDeepLink !== 'function') return;
    const unsub = window.api.onDeepLink(handler);
    return () => {
      try {
        unsub?.();
      } catch {
        // ignore unsubscribe errors
      }
    };
  }, [handler]);
}
