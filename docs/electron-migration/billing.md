# Billing & licensing architecture

> **Phase N — design only.** This document describes the end-to-end flow
> when billing and license verification go live. The code shipped in Phase N
> is a stub (`src/main/licensing.ts`) — no transport, no key verification,
> no Stripe / Paddle integration. The stub returns `tier='pro'` so dev /
> internal builds run unblocked; the `ADS_TRACKER_FORCE_TIER` env var stays
> the developer escape hatch.
>
> When this lands, swap the stub for the real wiring described here and
> remove the dev-fallback branch in `verifyLicense()`.

---

## Goals

1. **Subscription billing** for paid tiers (Pro / Business). The free tier
   (Start) needs no license at all — just an Amazon Ads token.
2. **Offline-friendly license verification.** The user should be able to
   work without internet for at least 7 days after the last successful
   server check.
3. **Resistant to obvious tampering.** A determined attacker can patch the
   client; the goal is not bulletproof DRM but discouraging casual abuse.
4. **No vendor lock-in in the client.** Stripe vs Paddle vs another provider
   is a backend decision; the client only knows about license tokens.

Non-goals (explicitly out of scope):

- Per-seat billing inside one license. We sell to individual authors.
- Feature flags as a paid plan. Feature gating is by tier (see
  `src/shared/entitlements.ts`); we do not sell features à la carte.
- Receipt printing, EU VAT, invoicing UI — all handled by the billing
  provider's hosted portal.

---

## Trust model

```
┌────────┐  hosted   ┌────────────┐   webhook   ┌─────────┐  HMAC token  ┌──────────┐
│  User  │ ────────▶ │ Billing CP │ ──────────▶ │ Backend │ ───────────▶ │  Client  │
└────────┘ checkout  └────────────┘  payment.*  └─────────┘  on success  └──────────┘
                                                    │                          │
                                                    │  /api/license/verify     │
                                                    │ ◀────────────────────────│
                                                    │   periodic, signed       │
                                                    ▼                          ▼
                                              issues HMAC(payload)        validates locally
                                              with LICENSE_HMAC_SECRET    + expiry window
```

**The backend is the source of truth.** The client only validates that a
license is genuine *for an offline window* — every periodic refresh hits
the backend, which can revoke any token before it expires naturally.

---

## License token shape

JSON payload, base64-url encoded, with a final `.<hmac>` segment. Format
mirrors JWT but we control issuance — no jwks rotation needed.

```json
{
  "v": 1,
  "user_id": 42,
  "tier": "pro",
  "issued_at": "2026-05-15T00:00:00Z",
  "expires_at": "2027-05-15T00:00:00Z",
  "subscription_status": "active",
  "grace_period_days": 7
}
```

Signed with `LICENSE_HMAC_SECRET` (32+ bytes, see
[release-env.md](release-env.md)). The client trusts the secret indirectly:
backend signs, client verifies. The secret never touches the binary.

---

## Client flow (target)

1. **Checkout.** User clicks "Upgrade" → renderer opens the billing CP URL
   in a system browser. Renderer does NOT embed checkout — no API keys in
   the client.
2. **Webhook fires.** Stripe/Paddle hits `POST /api/billing/webhook` with
   the signed subscription event. Backend validates with
   `STRIPE_WEBHOOK_SECRET`, mints the license token, attaches it to the
   user record.
3. **Client picks up the token.** Two paths:
   - **Same session** — renderer polls `GET /api/me/license` after returning
     from checkout. When the token shows up → calls
     `licensing.setToken(token)` (IPC) which writes to safeStorage.
   - **Restart** — on next boot, `auth-store` already has the auth bearer;
     main calls `GET /api/me/license` to fetch the latest token.
4. **Periodic verify.** Every entitlements refresh (today: 30 min), main
   calls `verifyLicense()`. Implementation:
   - Read token from safeStorage.
   - Decode payload; verify HMAC. Reject on mismatch.
   - Check `expires_at` is in the future. If within `grace_period_days` of
     expiry, set `expiringNotice` for the UI.
   - **If online**: hit `POST /api/license/verify` with the raw token. Backend
     replies `{ valid, revoked, current_tier }`. A `revoked=true` reply
     forces logout. A `current_tier` mismatch (downgrade in billing portal)
     re-issues the local token in the response.
   - **If offline**: succeed when payload still valid by HMAC + expiry.
     After 7 days offline, force a re-verify on next boot.
5. **Effective entitlements.** `src/main/entitlements.ts` calls into the
   licensing module to get the verified tier, then synthesises an
   `Entitlements` snapshot (via `forcedTierEntitlements` today — will
   become a richer composition once licensing lands).

---

## Backend endpoints (target)

| Method | Path                          | Purpose                                        |
|--------|-------------------------------|------------------------------------------------|
| POST   | `/api/billing/checkout`       | Start a checkout session. Returns hosted URL. |
| POST   | `/api/billing/webhook`        | Receives `payment.*` events from provider.    |
| GET    | `/api/me/license`             | Fetch current license token for the user.     |
| POST   | `/api/license/verify`         | Validate a token; reply with current status.  |
| POST   | `/api/billing/portal`         | Open the provider's portal for cancellations. |

All require the existing Bearer auth token (no separate billing auth).

---

## Failure modes & UX

| Scenario                          | Client behaviour                                                            |
|-----------------------------------|-----------------------------------------------------------------------------|
| No license, free tier             | All Start features work. Pro/Business features show upgrade nudge.          |
| License valid, no internet (≤7d)  | Full functionality. No nudges.                                              |
| License valid, no internet (>7d)  | Same as no license: degrades to free tier. Banner "Re-verify license".      |
| License expired by date           | Degrades to free tier immediately on next refresh. Banner with renew link.  |
| License revoked by backend        | Force logout. Renderer routes to LoginScreen with explanatory toast.        |
| HMAC mismatch (corrupted / forged)| Treat as no license. Log to scrubbed log file. No telemetry (could be PII). |

---

## Open questions

- **Provider choice (Stripe vs Paddle vs LemonSqueezy).** Tradeoff is
  EU VAT handling vs developer experience. Deferred until first 50 paid users.
- **Volume / educational discounts.** Probably out of scope for v1.
- **Refund window.** Provider hosted, so we don't decide UX — but the
  backend webhook must handle `payment.refunded` and revoke the license.
- **Team licenses.** Not in v1. If we add later: the token's `user_id`
  becomes a `org_id` and we add a `seat_limit` field.

---

## What Phase N actually ships

- `src/main/licensing.ts` — stub `verifyLicense` returning a static `pro`
  result; setToken/getToken/clearToken are all no-ops.
- `src/main/telemetry.ts` — stub `track` gated by consent; no transport
  yet.
- `src/renderer/components/settings/PrivacyTab.tsx` — consent toggle
  persisted to local-db via `telemetry:setConsent` IPC.
- This doc + the env reference in `release-env.md`.

No user-visible billing flow — that's a later wave. Phase N is purely
about having the interfaces in place so the integration is a swap-in.
