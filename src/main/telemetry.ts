// Phase N — Telemetry stub.
//
// Architecture-only scaffold. Wire-up plan (deferred):
//
//   1. User toggles consent in Settings → Privacy. Renderer calls
//      `telemetry:setConsent(true)` IPC; main persists to local-db
//      (`telemetry.consent` row, defaults to false).
//   2. `init()` reads SENTRY_DSN (env / build-time constant), constructs
//      a Sentry client gated by consent. When consent=false → no init,
//      no transport, no network.
//   3. `track(event, props)` becomes the single emission point for product
//      analytics + crash breadcrumbs. Callers do not check consent — this
//      module owns the gate.
//   4. On signOut → `clearUser()` so the next user's events don't carry
//      the previous user's id.
//
// For now: no transport, every call is a console.debug in dev and a no-op
// in production. Callers can wire in unconditionally; flipping to real
// transport is a single-module change.
//
// Privacy invariant: this module MUST NOT auto-initialise on app boot.
// It only activates after explicit user consent. The default of
// `consent=false` is sticky — re-confirmed on every app boot until the
// user opts in.

import { app } from 'electron';

let consent = false;
let userId: string | null = null;

export interface TelemetryEvent {
  /** Short dotted event name, e.g. `ai.generate.title`. */
  name: string;
  /**
   * Sanitised properties. Callers must NOT pass raw user content, API keys,
   * tokens, or PII. Numeric / boolean / short enum strings only.
   */
  props?: Record<string, string | number | boolean | null | undefined>;
}

/**
 * Initialise the telemetry transport. STUB — no-op. Real impl reads
 * SENTRY_DSN and constructs a Sentry client when consent=true.
 */
export function init(initialConsent: boolean): void {
  consent = !!initialConsent;
  if (!consent) {
    // No transport. Real impl: also call `Sentry.close()` if it was
    // previously initialised, to flush any buffered events.
    return;
  }
  // STUB. Real impl: lazy-import @sentry/electron and call Sentry.init().
}

/**
 * Update consent at runtime. Flips telemetry on/off without an app restart.
 */
export function setConsent(next: boolean): void {
  if (consent === next) return;
  consent = next;
  if (!consent) {
    // STUB. Real impl: Sentry.close() to flush + tear down transport.
    return;
  }
  // STUB. Real impl: Sentry.init() with cached DSN.
}

export function getConsent(): boolean {
  return consent;
}

/** Attach a user id to subsequent events. Cleared on signOut. */
export function setUser(id: string | null): void {
  userId = id;
}

export function clearUser(): void {
  userId = null;
}

/**
 * Track an event. STUB — gated by consent; in dev with consent=true, logs
 * to console.debug so the wiring is verifiable. In production with
 * consent=true, real impl forwards to Sentry.captureMessage / posthog.capture.
 */
export function track(event: TelemetryEvent): void {
  if (!consent) return;
  if (!event || typeof event.name !== 'string' || event.name.length === 0) return;
  if (app.isPackaged) {
    // STUB. Real impl: Sentry.addBreadcrumb({ category: 'event', message: name, data: props })
    //                 OR posthog.capture(name, { ...props, distinct_id: userId })
    return;
  }
  // Dev only — let the developer see what would have been sent.
  // eslint-disable-next-line no-console
  console.debug('[telemetry stub]', event.name, { ...event.props, userId });
}
