// Telemetry — the single emission point for product analytics + (future) crash
// reporting. Two tiers:
//
//   1. ESSENTIAL, PII-free product analytics — module-activation events
//      (`feature.activation.*`). Sent regardless of the consent toggle, because
//      they carry only {module, source, ts, count, enabled}: no royalty, no
//      titles, no ad copy, no account identifiers, nothing personal. They are
//      how the team learns which optional modules users actually turn on, in
//      what order, and what goes unused. Transport: POST /api/events on the
//      Railway backend; the account is attributed SERVER-SIDE from the auth
//      token, never sent from here. See, in the ads-tracker repo,
//      docs/architecture/ACTIVATION_TELEMETRY_PIPELINE.md.
//
//   2. OPTIONAL diagnostics — crash reports / richer usage. Consent-gated, OFF
//      by default, opt-in via Settings → Privacy. The transport (Sentry) is
//      still deferred: today these are a console.debug in dev and a no-op in
//      packaged builds.
//
// The consent toggle (`telemetry_consent` in local-db) governs tier 2 ONLY.
// Callers never branch on the tier — this module owns the policy: they just
// `track({ name, props })` and the right thing happens.
//
// Privacy invariant: for tier 1 the only bytes that leave the machine are the
// dotted event name + the sanitized props above, and the backend re-validates
// against a strict allowlist (dropping anything else). Royalty/PII can never be
// transmitted. Tier 2 stays inert until the user explicitly opts in.

import { app } from 'electron';

let consent = false;
let userId: string | null = null;

// Essential, always-sent (PII-free) event families. Everything else is treated
// as optional / consent-gated. Keep in sync with the backend ingest allowlist
// in ads-tracker/backend/routes/events.py (ALLOWED_EVENT_NAMES).
const ESSENTIAL_EVENT_PREFIXES = ['feature.activation.'] as const;

function isEssentialEvent(name: string): boolean {
  return ESSENTIAL_EVENT_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export interface TelemetryEvent {
  /** Short dotted event name, e.g. `feature.activation.enable`. */
  name: string;
  /**
   * Sanitised properties. Callers must NOT pass raw user content, API keys,
   * tokens, royalty figures, or PII — numeric / boolean / short enum strings
   * only. The backend re-validates against a strict allowlist regardless.
   */
  props?: Record<string, string | number | boolean | null | undefined>;
}

/**
 * Initialise the OPTIONAL/diagnostics tier. Reads persisted consent; essential
 * product analytics do not depend on this. STUB — real impl constructs a Sentry
 * client when consent=true.
 */
export function init(initialConsent: boolean): void {
  consent = !!initialConsent;
  if (!consent) {
    // No optional transport. Real impl: Sentry.close() if previously inited.
    return;
  }
  // STUB. Real impl: lazy-import @sentry/electron and call Sentry.init().
}

/**
 * Update consent at runtime — flips the OPTIONAL tier on/off without a restart.
 * Does NOT affect essential product analytics.
 */
export function setConsent(next: boolean): void {
  if (consent === next) return;
  consent = next;
  // STUB. Real impl: Sentry.init() / Sentry.close() with cached DSN.
}

export function getConsent(): boolean {
  return consent;
}

/**
 * Attach a user id to subsequent dev-log lines. Cleared on signOut. The backend
 * attributes events by auth token, so this id is NEVER transmitted.
 */
export function setUser(id: string | null): void {
  userId = id;
}

export function clearUser(): void {
  userId = null;
}

/**
 * Track an event. Essential events (`feature.activation.*`) are always emitted;
 * optional events require consent. In dev, logs to console.debug so the wiring
 * is verifiable. In packaged builds, essential events are forwarded to the
 * backend events sink; optional transport (Sentry) is deferred.
 */
export function track(event: TelemetryEvent): void {
  if (!event || typeof event.name !== 'string' || event.name.length === 0) return;

  const essential = isEssentialEvent(event.name);
  // Consent gates the optional tier only. Essential, PII-free analytics flow
  // regardless (see the header note + the Settings → Privacy disclosure).
  if (!essential && !consent) return;

  if (!app.isPackaged) {
    // Dev only — let the developer see what would have been sent.
    // eslint-disable-next-line no-console
    console.debug('[telemetry]', event.name, { ...event.props, userId });
    return;
  }

  // Packaged transport. The only sink wired today is the PII-free product-
  // events endpoint (essential tier). Optional/diagnostics (Sentry) transport
  // remains deferred — non-essential events are a no-op for now.
  if (essential) {
    void forwardToBackend(event);
  }
}

/**
 * Forward one essential event to the backend events sink. Fire-and-forget: a
 * telemetry call must NEVER block, throw, or surface an error to the user.
 *
 * Lazy-imports api-client / auth-store so the non-packaged path (and the
 * modules that import telemetry very early at boot) don't pull the network
 * stack, and to sidestep any import cycle. Skips entirely when signed out —
 * there is no account to attribute the event to, and we must not provoke the
 * 401 → refresh → auth:expired path from a background telemetry call.
 */
async function forwardToBackend(event: TelemetryEvent): Promise<void> {
  try {
    const { readToken } = await import('./auth-store');
    const token = await readToken();
    if (!token) return; // not signed in — drop silently

    const { performApiRequest } = await import('./api-client');
    await performApiRequest({
      method: 'POST',
      path: '/api/events',
      body: { name: event.name, props: event.props ?? {} },
    });
  } catch {
    // fire-and-forget: swallow everything (offline, timeout, transport error)
  }
}
