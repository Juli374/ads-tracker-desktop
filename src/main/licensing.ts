// Phase N — License verification stub.
//
// Architecture-only scaffold. Wire-up plan (deferred to a separate phase):
//
//   1. User completes Stripe/Paddle checkout → webhook hits backend
//      `/api/license/issue` which mints an HMAC-signed license token
//      (signed with LICENSE_HMAC_SECRET — see docs/electron-migration/release-env.md).
//   2. Backend returns the token; renderer writes it via `licensing.setToken()`
//      into safeStorage (same Keychain item family as the auth token).
//   3. On every entitlements refresh, main calls `verifyLicense()` which
//      either round-trips with backend `/api/license/verify` (fresh issue)
//      or validates the HMAC + expiry locally (offline grace period).
//   4. `getCurrentEntitlements()` in `src/main/entitlements.ts` already has
//      hooks for tier override — when this lands, replace the synthetic
//      `forcedTierEntitlements` branch with `verifyLicense()` → real tier.
//
// For now: returns `pro` so dev-builds aren't blocked, but never persists,
// never network-calls. The `ADS_TRACKER_FORCE_TIER` env var continues to be
// the primary developer override (already wired in entitlements.ts).
//
// Do NOT add billing logic here. This module's surface is intentionally
// minimal — verification only. Issuance lives on the backend.

import type { Tier } from '../shared/entitlements';

export interface LicenseVerification {
  /** True when the stored license is valid (signature + expiry both ok). */
  valid: boolean;
  /** Tier granted by the license. `null` when invalid / not present. */
  tier: Tier | null;
  /** ISO timestamp of license expiry. `null` for perpetual licenses. */
  expiresAt: string | null;
  /**
   * When the license is valid but expires within the grace window, this is
   * a renewal nudge string for the UI. Empty when no nudge needed.
   */
  expiringNotice: string;
}

const STUB_RESULT: LicenseVerification = {
  valid: true,
  tier: 'pro',
  expiresAt: null,
  expiringNotice: '',
};

/**
 * Verify the currently-stored license token. STUB — returns a stable
 * `pro` snapshot until the real backend hook lands. When implemented this
 * will:
 *   - Read the license token via `getToken()` below.
 *   - Decode the HMAC payload, verify signature with LICENSE_HMAC_SECRET.
 *   - Check `expiresAt` against current time; honour an offline grace window.
 *   - Optionally call `/api/license/verify` for revocation check.
 */
export async function verifyLicense(): Promise<LicenseVerification> {
  return { ...STUB_RESULT };
}

/**
 * Persist a license token issued by the backend. STUB — no-op. Real impl
 * stores in safeStorage (`license.bin`, scrubbed on signOut).
 */
export async function setToken(_token: string): Promise<void> {
  // Intentionally empty in stub. Renderer can call this safely; nothing
  // is persisted until the real wiring lands.
}

/**
 * Read the stored license token. STUB — returns null. Real impl reads from
 * safeStorage and decrypts.
 */
export async function getToken(): Promise<string | null> {
  return null;
}

/**
 * Clear the stored license token (called on signOut / on revocation push).
 * STUB — no-op.
 */
export async function clearToken(): Promise<void> {
  // Intentionally empty in stub.
}
