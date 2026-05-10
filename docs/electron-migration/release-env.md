# Release env vars & secrets

> **Audience:** the human who runs releases (Juli374). Claude does not have
> access to any of these — every value below must be procured manually,
> stored in 1Password (`Ads Tracker / Release` vault), and mirrored into
> GitHub Actions Secrets at `https://github.com/Juli374/ads-tracker-desktop/settings/secrets/actions`.
>
> See `release-runbook.md` for the actual release procedure.
> See `electron-knowledge-base/atlas/core/05-packaging-and-signing.md`
> for the cryptographic background.

This document is the single source of truth for what each secret is, where
to obtain it, where to store it, and what breaks without it. **Update this
file whenever a new secret is added to a workflow.**

---

## Quick reference

| Secret | Used by | Hard fail? | Renewal |
|---|---|---|---|
| `APPLE_DEVELOPER_ID`         | release.yml (macOS)  | No (degrades to unsigned) | n/a (string) |
| `APPLE_CERT_BASE64`          | release.yml (macOS)  | No (degrades to unsigned) | 5 years (cert validity) |
| `APPLE_CERT_PASSWORD`        | release.yml (macOS)  | Only if cert provided    | n/a |
| `APPLE_ID`                   | release.yml (macOS)  | Only if cert provided    | n/a |
| `APPLE_APP_SPECIFIC_PASSWORD`| release.yml (macOS)  | Only if cert provided    | rotate yearly |
| `APPLE_TEAM_ID`              | release.yml (macOS)  | Only if cert provided    | n/a |
| `WIN_CSC_LINK`               | release.yml (Win)    | No (degrades to unsigned) | 1-3 years (cert validity) |
| `WIN_CSC_KEY_PASSWORD`       | release.yml (Win)    | Only if cert provided    | n/a |
| `GH_TOKEN`                   | release.yml (publish)| No (skips publish)       | rotate every 90 days |
| `SENTRY_DSN`                 | Phase N (crash reporting) | No (no telemetry) | n/a |
| `STRIPE_WEBHOOK_SECRET`      | Phase N (billing)    | yes once billing ships   | rotate on compromise |
| `LICENSE_HMAC_SECRET`        | Phase N (entitlements) | yes once gating ships  | rotate on compromise (forces re-issue of all licenses) |

---

## macOS — Apple Developer ID signing & notarization

To distribute outside the Mac App Store, every binary must be Developer-ID
signed AND notarized — otherwise Gatekeeper shows the "App is damaged" alert
on first launch (Catalina+). All five vars below are needed together; if any
one is missing the macOS job in `release.yml` will fall back to producing
an unsigned `.app` (useful for self-testing, useless for distribution).

### `APPLE_DEVELOPER_ID`

The full identity string used by `codesign` to pick the right cert from
the keychain. Looks like `Developer ID Application: Yulii Parfonov (ABCDE12345)`.

**Where to obtain.** After enrolling in the Apple Developer Program ($99/yr,
[developer.apple.com](https://developer.apple.com)), open Keychain Access
on a Mac that already has the Developer ID Application certificate
installed → Certificates → right-click → Get Info → copy the "Common
Name" field exactly.

**Where to store.** GitHub Actions Secrets + 1Password (`Ads Tracker /
Release / Apple Developer ID`).

**What fails if missing.** The `Import Apple Developer ID certificate`
step is skipped (its `if` clause checks `APPLE_CERT_BASE64`, but the env
var is still consumed by Forge during `package`/`make`). Forge falls
back to an unsigned `.app`, which the macOS job marks as "succeeded but
unsigned." Nothing crashes.

**Rotation.** The string changes only if you renew or replace the
certificate. Update both 1Password and GitHub Secrets in lockstep.

### `APPLE_CERT_BASE64`

The Developer ID Application certificate (.p12 export) encoded as
base64. The runner imports it into a temporary keychain.

**Where to obtain.**
1. On a Mac with the cert installed: Keychain Access → Certificates →
   select "Developer ID Application: …" + its private key → File →
   Export Items → save as `developer-id.p12` with a strong password
   (this password becomes `APPLE_CERT_PASSWORD`).
2. Convert: `base64 -i developer-id.p12 | pbcopy` (macOS) or
   `base64 -w0 developer-id.p12` (Linux).
3. Paste the copied string into the GitHub Secret value field.

**Where to store.** GitHub Actions Secrets only — **do not** keep a
plain-text base64 dump in 1Password; instead store the original `.p12`
file as a 1Password attachment plus the password, and re-encode when
rotating.

**What fails if missing.** macOS job runs unsigned. The
`apple-actions/import-codesign-certs` step is gated behind `if: env.APPLE_CERT_BASE64 != ''`,
so it cleanly no-ops.

**Rotation.** Apple-issued Developer ID certs are valid for 5 years.
Rotate ~90 days before expiry; expired certs invalidate auto-update on
older clients (the new build is signed by a different cert and
electron-updater rejects the chain). See
`electron-knowledge-base/atlas/core/05-packaging-and-signing.md` § "Cert
rotation."

### `APPLE_CERT_PASSWORD`

The password used when exporting the .p12.

**Where to obtain.** You set it during the `.p12` export step above.
Use a 24-char random string from 1Password.

**Where to store.** GitHub Actions Secrets + 1Password.

**What fails if missing (but `APPLE_CERT_BASE64` present).** Hard fail
on import; the workflow stops at the keychain step. Always rotate
together with `APPLE_CERT_BASE64`.

### `APPLE_ID`

The Apple ID email used for notarization (`notarytool submit`).

**Where to obtain.** Your Apple Developer account email.

**Where to store.** GitHub Actions Secrets + 1Password.

**What fails if missing.** Notarization fails after signing succeeds.
The `.app` is signed but Gatekeeper still rejects it on download
(needs the Apple-issued notary ticket stapled in).

### `APPLE_APP_SPECIFIC_PASSWORD`

App-specific password (NOT your Apple ID login password) for `notarytool`.

**Where to obtain.** [appleid.apple.com](https://appleid.apple.com) →
Sign-In and Security → App-Specific Passwords → Generate. Label it
`ads-tracker-desktop notarization`.

**Where to store.** GitHub Actions Secrets + 1Password.

**What fails if missing.** Same as missing `APPLE_ID` — notarization
hard-fails. Apple deliberately requires this so a leaked Apple ID
password alone cannot upload binaries to the notary service.

**Rotation.** App-specific passwords don't auto-expire, but rotate
yearly as a hygiene practice. Apple invalidates them automatically if
you change your Apple ID password.

### `APPLE_TEAM_ID`

10-character Team ID, e.g. `ABCDE12345`.

**Where to obtain.** [developer.apple.com/account](https://developer.apple.com/account)
→ Membership Details → Team ID. It's also visible at the end of
`APPLE_DEVELOPER_ID` (in the parens).

**Where to store.** GitHub Actions Secrets + 1Password (low-sensitivity —
the Team ID is technically public information once you publish anything).

**What fails if missing.** `notarytool` rejects the submission
(`Error: Team ID not specified for notarytool`).

---

## Windows — code signing

Two paths today, see `electron-knowledge-base/atlas/core/05-packaging-and-signing.md`
§ "Windows":

1. **Standard / EV cert (.pfx file)** — works with the env vars below.
2. **Azure Trusted Signing** — replaces the .pfx with cloud HSM; needs
   different env vars (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
   `AZURE_CLIENT_SECRET`, plus a Trusted Signing endpoint). **Open
   decision** — see bottom of this file.

The vars below assume path 1.

### `WIN_CSC_LINK`

Base64-encoded `.pfx` file containing the code-signing certificate +
private key. The release workflow decodes it on the Windows runner into
`$RUNNER_TEMP\win-codesign.pfx` and re-exports its absolute path as
`WIN_CSC_LINK` (which is what `electron-builder` / Forge with
`MakerSquirrel({ certificateFile: ... })` consume).

**Where to obtain.**
- **Standard cert (~$80-250/yr):** DigiCert, Sectigo, or SSL.com.
  Issued to an individual or company; delivered as a `.pfx`. Note: as of
  June 2023 the CA/B Forum requires HSM-backed keys for EV certs, so
  Standard certs may also start moving to HSM — check with your CA.
- **EV cert (~$300-500/yr):** Same vendors, requires legal entity (LLC,
  ИП, etc.) and a physical USB token. Cannot be exported as a plain
  `.pfx` — sign via the token directly, base64 the token's exported
  cert (without private key) only if the workflow supports it.

If using a `.pfx`:
```
base64 -w0 ads-tracker-codesign.pfx
```
Paste the output as the GitHub Secret value.

**Where to store.** GitHub Actions Secrets only. Original `.pfx` lives
in 1Password as an attachment — never as plain text.

**What fails if missing.** Windows job produces unsigned installer.
SmartScreen will pop a "Windows protected your PC" warning the first
~1000 downloads, with a hidden "Run anyway" link. Acceptable for
internal/personal-use builds, blocking for paid customers.

**Rotation.** Standard certs: 1-3 years. EV certs: 1-3 years. As of
March 2026, max validity is **460 days** ([CA/B Forum vote, Oct 2025](https://www.globalsign.com/en/company/news-events/news/businesses-must-prepare-two-significant-certificate-lifecycle-reductions-march-2026)).
Rotate ~60 days before expiry to give SmartScreen reputation time to
transfer to the new cert.

### `WIN_CSC_KEY_PASSWORD`

Password for the .pfx file.

**Where to obtain.** You set it when exporting the cert from your CA's
download page or from `certmgr.msc`.

**Where to store.** GitHub Actions Secrets + 1Password.

**What fails if missing (but `WIN_CSC_LINK` present).** The signtool
step hard-fails: "Internal error". Always rotate together.

---

## Publish

### `GH_TOKEN`

GitHub Personal Access Token (PAT) with `repo` scope, used by
`@electron-forge/publisher-github` to upload installers to GitHub
Releases as a draft.

**Where to obtain.** [github.com/settings/tokens](https://github.com/settings/tokens)
(classic, **not** fine-grained — fine-grained tokens don't work
reliably with `publisher-github` as of 2026-04). Scopes: `repo`
(full). Expiry: 90 days max — set a calendar reminder.

**Where to store.** GitHub Actions Secrets + 1Password.

**What fails if missing.** Publish step in `release.yml` is gated
behind `if: env.GH_TOKEN != ''`, so it cleanly skips. Installers are
still uploaded as workflow artefacts (14-day retention) so you can
manually create a Release. **Soft fail by design** — keeps the
pipeline useful in dry-run mode.

**Rotation.** Every 90 days. After rotating, re-run any in-flight
release workflow (the old token gets revoked the moment you create
the new one in GitHub UI).

> **Note on `GITHUB_TOKEN` vs `GH_TOKEN`.** GitHub provides a built-in
> `GITHUB_TOKEN` automatically, but Forge's publisher-github expects
> the env var name `GITHUB_TOKEN` or `GH_TOKEN`; we use `GH_TOKEN` to
> avoid confusion with the auto-injected one. The auto-injected
> `GITHUB_TOKEN` would also work for our own repo, but a long-lived
> PAT lets us trigger publishes from `workflow_dispatch` and to
> potentially mirror to a second org later.

---

## Phase N (deferred — not yet wired)

These secrets are documented now so future agents don't have to dig.
Workflows do not consume them yet.

### `SENTRY_DSN`

Sentry crash-reporting endpoint. Used by `@sentry/electron` in
main + renderer.

**Where to obtain.** [sentry.io](https://sentry.io) → Projects → Create
Project (Electron) → Client Keys → DSN. Free tier: 5K events/month.

**Where to store.** GitHub Actions Secrets + 1Password +
`.env.production` baked in via Webpack `DefinePlugin`.

**What fails if missing.** Crash reports go nowhere. App still works.
**Soft fail by design** — Sentry is opt-in observability, not a
correctness dependency.

**Notes.** DSN is technically a public string (it's embedded in the
client binary anyway), so storing it as a Secret is for convenience
not security. The corresponding **auth token** (used to upload
sourcemaps in CI) is a separate, sensitive value — to be added as
`SENTRY_AUTH_TOKEN` when Phase N starts.

### `STRIPE_WEBHOOK_SECRET`

Signing secret for verifying inbound Stripe webhooks (subscription
created/cancelled/payment-failed → updates entitlements). Lives on the
**backend**, not in this desktop repo, but referenced here for cross-repo
traceability.

**Where to obtain.** [Stripe dashboard](https://dashboard.stripe.com/webhooks)
→ create endpoint pointing to `https://ads-tracker-production.up.railway.app/api/billing/webhook`
→ copy "Signing secret".

**Where to store.** Railway env vars (backend), not GitHub Actions.
1Password mirror.

**What fails if missing.** Webhooks are rejected; subscription state
gets out of sync with Stripe. **Hard fail** — without it billing is
unsafe (replay attacks possible).

**Rotation.** On any suspected compromise, regenerate from the Stripe
dashboard and update Railway in lockstep.

### `LICENSE_HMAC_SECRET`

Server-side HMAC-SHA256 key used to sign entitlements payloads
(`/api/me/entitlements`). The desktop client verifies the `sig`
field offline so a paused-server outage doesn't lock paid features.

**Where to obtain.** Generate once: `openssl rand -hex 32`.

**Where to store.** Railway env vars (backend) + 1Password
**only on the founder's machine**. Never check into any repo.

**What fails if missing.** All entitlement responses are rejected
by the desktop client → every user falls back to `EMPTY_ENTITLEMENTS`
→ all paid features lock. **Hard fail** — keep redundant 1Password
backups.

**Rotation.** Forces re-issuing the entitlements blob for every
active user (the next refresh re-fetches with the new sig). Plan a
5-min downtime window. Only rotate on actual compromise — proactive
rotation has high blast radius for low gain.

---

## Open decisions (TODO before public release)

### Azure Trusted Signing vs OV/EV cert

**Status:** undecided. Default in `release.yml` is **Standard `.pfx`
on physical individual** (`WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD`).

**Trade-off:**

| Option | Cost/yr | SmartScreen instant trust | Requires legal entity | Cloud-native |
|---|---|---|---|---|
| Standard .pfx (individual) | $80-250 | No (1-3 month warm-up) | No | No |
| EV cert + USB token        | $300-500 | Yes              | Yes (LLC / ИП) | No |
| Azure Trusted Signing      | ~$120    | Yes              | Yes (Microsoft Partner Center verifies) | Yes |

**Recommendation (post personal-use):** switch to **Azure Trusted
Signing** as soon as a legal entity is registered. Reasoning:
- Cheapest of the "instant trust" options.
- No physical USB token to lose / get blocked at customs / require
  HSM emulator on CI runner.
- Microsoft-native, future-proof against further CA/B tightening
  (the 460-day max-validity rule lands March 2026).
- Cloud HSM means the signing key never lives on the CI runner
  filesystem, even briefly.

**Action when ready.** Add `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
`AZURE_CLIENT_SECRET` to GitHub Secrets; rewrite the `Decode Windows
code-signing certificate` step in `release.yml` to use
`actions/azure-trusted-signing-action` (or whatever the current
official action is called); update this doc.

### macOS: Individual vs Organization Apple Developer account

**Status:** Individual ($99/yr). Sufficient for personal-use track.

**Action when public:** consider upgrading to Organization so the
"Developer ID Application: <Name>" string in Gatekeeper shows the
company name instead of a personal name. Requires D-U-N-S Number
(free, ~7 days from Dun & Bradstreet) and a registered legal entity.

---

## Procurement order (when ready to ship)

1. Apple Developer Program — register 5+ days before first release
   (verification can take 24-48h).
2. Open legal entity if going Organization / Windows EV / Azure
   Trusted Signing.
3. Apple cert: export `.p12`, base64-encode, store in GitHub Secrets.
4. Apple notarization: generate app-specific password.
5. Windows cert: order from CA, wait for verification (Standard:
   2-7 days; EV: 1-3 weeks for token shipping).
6. Windows cert: export `.pfx` (or fetch HSM creds for Azure Trusted
   Signing), store.
7. GitHub PAT: generate with 90-day expiry, add to Secrets.
8. Push first tag (`v0.0.1-rc.1`), watch `release.yml` produce a
   draft Release. See `release-runbook.md` for the full procedure.
