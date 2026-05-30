import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthHandoffErrorCode } from '../../shared/ipc';
import { useToast } from '../contexts/ToastContext';
import { useDeepLink } from './useDeepLink';

/**
 * Phase 0 — Identity bridge deep-link handler.
 *
 * The website mints a one-time handoff token after a browser login and sends
 * it back to the desktop via:
 *
 *   ads-tracker-desktop://callback?token=<base64url>&type=handoff
 *
 * This hook subscribes to that deep-link, filters for the handoff discriminator
 * (host `callback` AND `token` present AND `type=handoff` — Amazon OAuth uses
 * the same `callback` host but carries `code`+`state` instead), and redeems the
 * token via `window.api.auth.handoffRedeem`. On success main persists the token
 * pair and emits auth:authenticated; AuthContext flips to authenticated.
 *
 * It is mounted in AuthContext so it is always live (login screen AND inside the
 * app). Because it lives where auth status is known, the caller passes a getter
 * for "are we already authenticated?" — if a stale / duplicate deep-link arrives
 * after we're already signed in, we swallow the error silently instead of
 * showing a confusing toast over a working session.
 *
 * SECURITY / robustness:
 *  - In-flight guard via useRef tracking the token already being processed.
 *    macOS re-delivers `open-url` events (e.g. focus + activation), so the same
 *    token can arrive twice; we must redeem it at most once (it's single-use on
 *    the server anyway, but a second redeem would surface a spurious "invalid"
 *    toast).
 *  - The token is never logged anywhere in the renderer.
 */
export function useHandoffDeepLink(isAuthenticated: () => boolean): void {
  const { t } = useTranslation('auth');
  const toast = useToast();
  // Tokens we've already started (or finished) redeeming. Prevents the macOS
  // double open-url from firing two redeems for the same token.
  const handledTokensRef = useRef<Set<string>>(new Set());

  const errorMessage = useCallback(
    (code: AuthHandoffErrorCode | undefined): string => {
      switch (code) {
        case 'NETWORK':
          return t('errors.handoffNetwork');
        case 'BRIDGE_UNREACHABLE':
          return t('errors.handoffBridgeUnreachable');
        case 'INVALID':
          return t('errors.handoffInvalid');
        case 'EMAIL_NOT_VERIFIED':
          return t('errors.handoffEmailNotVerified');
        case 'ACCOUNT_DISABLED':
          return t('errors.handoffAccountDisabled');
        case 'CONFLICT':
          return t('errors.handoffConflict');
        case 'DISABLED':
          return t('errors.handoffDisabled');
        default:
          return t('errors.handoffFailed');
      }
    },
    [t],
  );

  useDeepLink(
    useCallback(
      async (event) => {
        let url: URL;
        try {
          url = new URL(event.url);
        } catch {
          return;
        }
        // Same host as Amazon OAuth (`callback`) — disambiguate on the handoff
        // discriminator. Anything without token+type=handoff is not ours.
        if (url.host !== 'callback' && url.pathname.replace(/\/+/g, '') !== 'callback') {
          return;
        }
        const token = url.searchParams.get('token');
        const type = url.searchParams.get('type');
        if (!token || type !== 'handoff') {
          return;
        }

        // In-flight / already-handled guard. Single-use server-side, but the OS
        // may deliver the same URL twice.
        if (handledTokensRef.current.has(token)) {
          return;
        }
        handledTokensRef.current.add(token);

        if (typeof window.api?.auth?.handoffRedeem !== 'function') {
          return;
        }

        try {
          const result = await window.api.auth.handoffRedeem(token);
          if (result.ok) {
            try {
              toast.success(t('handoff.success'));
            } catch {
              // toast may be unavailable in test environments
            }
            return;
          }
          // Failed. If we're somehow already authenticated (e.g. a late /
          // duplicate link after a separate login), stay quiet — don't paint an
          // error over a working session.
          if (isAuthenticated()) {
            return;
          }
          try {
            toast.error(errorMessage(result.code));
          } catch {
            // ignore: toast unavailable in tests
          }
        } catch {
          if (isAuthenticated()) {
            return;
          }
          try {
            toast.error(t('errors.handoffFailed'));
          } catch {
            // ignore
          }
        }
      },
      [toast, t, errorMessage, isAuthenticated],
    ),
  );
}
