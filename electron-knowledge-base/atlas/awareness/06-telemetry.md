# A6. Telemetry & crash reporting in production

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

Desktop apps fail on machines you cannot SSH into. Without telemetry, the user's only feedback channel is "it crashed" — useless. Electron ships **Crashpad** built-in for native minidumps; layer **JavaScript-error and performance reporting** on top via Sentry, GlitchTip, Datadog RUM, or your own HTTPS endpoint. The privacy surface is non-trivial: GDPR/CCPA/LGPD demand consent for anything identifying, stack traces leak `/Users/<name>/...` paths, and Apple privacy nutrition labels make you declare what you collect. Default posture for a new app: **Crashpad on by default (anonymous), feature-usage and identified telemetry behind an opt-in toggle, scrub PII from stack frames before upload.**

This page is the awareness/privacy/vendor-choice surface. C10 ([Performance & observability](../core/10-performance-and-observability.md)) owns the engineering depth (V8 snapshots, electron-log, Sentry instrumentation patterns).

## Why telemetry matters in desktop

In a web app, every request hits your server logs. In a desktop app, the renderer crashes in the user's process on the user's machine — you find out only if (a) they file a bug or (b) you instrumented it. "Bug reports without context" are usually a screenshot and the words "doesn't work." Telemetry is how you replace that with stack traces, OS versions, and reproduction frequency.

The two pillars:

1. **Crash reports** — native crashes (segfaults, V8 OOM, GPU process death). Captured by Crashpad as minidumps.
2. **JavaScript errors + metrics** — uncaught renderer exceptions, unhandled promise rejections, startup time, action latency, feature usage. Captured by an SDK like `@sentry/electron`.

You want both. Crashpad alone tells you the binary died but not which user action triggered it; JS error reporting alone misses everything that happens in C++ Chromium.

## What to collect (and what NEVER to collect)

**Collect:**

- Crashes (always — sanitize stack frames, redact paths).
- Uncaught errors and unhandled promise rejections.
- Performance metrics: app startup time, slow IPC calls, frame drops in long tasks.
- Feature usage counters (with consent — this is the GDPR-sensitive bucket).
- App version, Electron version, OS + version, locale, CPU arch, screen size bucket.
- A pseudonymous install ID (UUID generated locally, stored in app data).

**Never collect (without explicit, granular consent):**

- User-authored content — document text, file contents, anything they typed.
- Tokens, API keys, OAuth refresh tokens, session cookies.
- File paths containing `/Users/<name>/...`, `C:\Users\<name>\...`, `/home/<name>/...` — strip these before sending.
- Email addresses, account IDs, real names — even hashed; an authenticated user ID is **PII** under GDPR if it can be re-identified server-side.
- Clipboard contents, screen contents, microphone, anything from a permission-gated API.

Stack traces are the sneaky channel: they contain absolute paths that include the username. Sentry's [data scrubbers](https://docs.sentry.io/platforms/javascript/guides/electron/data-management/sensitive-data/) strip these by default for known patterns, but verify in your test reports before going live.

## Vendors (as of 2026-04)

### Crashpad / Breakpad — built into Electron

Electron uses **Crashpad** (Chromium's successor to Breakpad) on macOS, Windows, and Linux. You enable it with `crashReporter.start({ submitURL })` in main. Crash reports POST to your `submitURL` as `multipart/form-data` with `upload_file_minidump`, app/Electron versions, platform, a unique GUID, and any extra params you set. Reports queue in the app's user-data `Crashpad/` subdirectory until upload succeeds. (Source: [crashReporter | Electron docs](https://www.electronjs.org/docs/latest/api/crash-reporter), as of 2026-04.)

You don't have to write a server: any Sentry-compatible endpoint, BugSplat, Backtrace, or self-hosted [mini-breakpad-server](https://github.com/electron/mini-breakpad-server) accepts the format.

### Sentry — most popular for Electron

`@sentry/electron` v7.11.0 (latest as of 2026-04, per [npm](https://www.npmjs.com/package/@sentry/electron)) wraps both Crashpad-native-crash uploads and JavaScript error reporting in a single SDK. Init once in main, once in renderer. It auto-installs the Crashpad uploader, injects a renderer-side global handler, and forwards renderer events through IPC to main (so you get one DSN, one quota). (Source: [Sentry for Electron](https://docs.sentry.io/platforms/javascript/guides/electron/), as of 2026-04.) `@sentry/electron` also bridges `electron-log` and supports source-map upload via `@sentry/cli` so production stack traces resolve to readable filenames.

### GlitchTip — open-source Sentry-compatible

[GlitchTip](https://glitchtip.com/) speaks the Sentry ingest protocol; point `@sentry/electron` at your self-hosted GlitchTip DSN and it works. Useful for EU data residency or when you don't want a per-event SaaS bill.

### Datadog RUM, Rollbar, Bugsnag

Alternatives with their own Electron SDKs or plain JavaScript SDKs that work in renderer. Datadog RUM is heavier and pricier; reasonable if your backend is already on Datadog. Bugsnag's Electron support is solid but the ecosystem of community examples is smaller than Sentry.

### Self-hosted Sentry

If you're on the Sentry self-hosted stack (Docker compose), you control the data residency story end-to-end. Operationally heavier than GlitchTip; pick it if you specifically need Sentry's full feature set on-prem.

### Custom HTTPS endpoint

The simplest option for early-stage apps: POST a JSON payload to your own backend (e.g., `Railway` — see C9). You lose Sentry's grouping/triage UI, but you also avoid a vendor and a privacy-policy line item. Combine with Crashpad pointing at your endpoint for native crashes; do JS error capture with a small custom handler that POSTs to the same backend.

## Privacy & consent

### GDPR / CCPA / LGPD

- **Anonymous crash reports** (no user ID, scrubbed paths) generally fall under "legitimate interest" and don't require explicit opt-in in the EU — but you must disclose them in the privacy policy and offer an opt-out.
- **Identified telemetry** (any user ID, account email, feature usage tied to a session) requires opt-in (GDPR), opt-out with prominent notice (CCPA), or opt-in (LGPD).
- **Apple privacy nutrition labels** (App Store): you must declare every data type collected and whether it's linked to identity. Same for Google Play if you ship Android via a wrapper (not relevant for pure Electron — desktop only).

### Consent UI pattern

- First-launch dialog: "Help us improve [App] by sharing anonymous crash reports and usage data. [Yes / No / Customize]." Default to "yes" only for crash reports; require explicit toggle for usage analytics.
- Settings → Privacy: a panel with the same toggles, always reachable.
- Persist consent state in plain app-data JSON (not `safeStorage` — consent is not secret) keyed by data category. Re-prompt on major version change if categories change.

### Pseudonymous install ID

Generate `crypto.randomUUID()` on first launch, store in app data, send with every event. **Never** key telemetry on the user's email or account ID — that re-identifies them in your analytics database, and a leak becomes a GDPR incident. The install ID resets if the user clicks "reset analytics" or reinstalls; that's the feature.

### Data minimization

- Configure Sentry's `beforeSend` hook to strip `/Users/<name>/`, `C:\\Users\\<name>\\`, `/home/<name>/` from frames, breadcrumbs, and extras.
- Drop request bodies, headers, and query strings unless explicitly needed.
- Mask any text input with `data-sentry-mask` (Sentry SDK has this for renderer DOM).
- For custom endpoints: scrub server-side as a defense in depth — clients can be patched to leak.

### Don't log secrets

Cross-link to [C3 Security](../core/03-security.md): tokens, refresh tokens, and decrypted credentials must never reach the telemetry pipeline. A common bug is logging the full HTTP request including the `Authorization` header — review your `electron-log` and Sentry breadcrumb config before shipping.

## Mini-example — Sentry main + renderer with consent gate

```ts
// main/telemetry.ts
import { app } from 'electron';
import * as Sentry from '@sentry/electron/main';
import { readConsent } from './consent';

const consent = readConsent();
if (consent.crashes || consent.errors) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    release: app.getVersion(),
    environment: app.isPackaged ? 'production' : 'dev',
    sendDefaultPii: false,            // explicit
    autoSessionTracking: consent.usage,
    beforeSend(event) {
      // Strip absolute paths from stack frames + breadcrumbs.
      const home = app.getPath('home');
      const scrub = (s?: string) => s?.split(home).join('~');
      event.exception?.values?.forEach(v =>
        v.stacktrace?.frames?.forEach(f => { f.filename = scrub(f.filename); }));
      return event;
    },
  });
  Sentry.setUser({ id: consent.installId }); // UUID, not email
}
```

```ts
// renderer/telemetry.ts
import * as Sentry from '@sentry/electron/renderer';
Sentry.init({}); // inherits DSN + config from main via IPC
```

Renderer init is a one-liner because `@sentry/electron/main` configures the IPC bridge for you. (Source: [Sentry for Electron docs](https://docs.sentry.io/platforms/javascript/guides/electron/), as of 2026-04.)

## Cross-links

- [C3 Security](../core/03-security.md) — never log secrets, tokens, or auth headers.
- [C10 Performance & observability](../core/10-performance-and-observability.md) — engineering depth on V8 snapshots, perf instrumentation, and `electron-log`.
- [A4 Accessibility & i18n](04-accessibility-i18n.md) — locale is a useful telemetry dimension.
- [C9 Backend connectivity](../core/09-backend-connectivity.md) — if you self-host the telemetry endpoint on your Railway backend.

## Sources

- [crashReporter | Electron docs](https://www.electronjs.org/docs/latest/api/crash-reporter) — minidump upload protocol, `submitURL`, multipart/form-data fields (as of 2026-04)
- [Crashpad overview | Chromium docs](https://chromium.googlesource.com/crashpad/crashpad/+/main/doc/overview_design.md) — what minidumps contain
- [Sentry for Electron](https://docs.sentry.io/platforms/javascript/guides/electron/) — `@sentry/electron` SDK, main+renderer pattern
- [@sentry/electron — npm](https://www.npmjs.com/package/@sentry/electron) — v7.11.0 latest (as of 2026-04)
- [Sentry — Scrubbing Sensitive Data](https://docs.sentry.io/platforms/javascript/guides/electron/data-management/sensitive-data/) — `beforeSend`, default scrubbers
- [Native Crash Reporting | Sentry Electron](https://docs.sentry.io/platforms/javascript/guides/electron/features/native-crash-reporting/) — Crashpad integration via SDK
- [GlitchTip](https://glitchtip.com/) — open-source Sentry-compatible backend
- [mini-breakpad-server | electron GitHub](https://github.com/electron/mini-breakpad-server) — minimal self-hosted minidump receiver
