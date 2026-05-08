# Preflight Checklist — new Electron app from scratch

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

Walk this top-to-bottom before the first `app.whenReady()`. ~88 items across 13 phases. Each links to the Core / Awareness / Template that explains the why. First pass: ~1-2h. Most-skipped, most-regretted sections: **Phase 3 (Security)** and **Phase 7 (Packaging & signing)**.

## How to use

- `[x]` done, `[ ]` pending, `[skip]` with a one-line reason.
- Codes: **C1-C10** = Core, **A1-A6** = Awareness, **T1-T5** = templates.
- Re-walk phases 3 + 7 + 8 before every release — those drift quarterly.
- For 🟥/🟧 pages (see [00-INDEX](../atlas/00-INDEX.md)), fall back to [SOURCES.md](../sources/SOURCES.md) until drafts land.

---

## Phase 0 — Decide

Electron is heavy (~80MB baseline, full Chromium per app). Use it deliberately.

- [ ] **1. Confirm Electron is the right tool** (not Tauri / PWA / Wails / native). Run the [decision tree](decision-tree.md). Real triggers: deep Node ecosystem reuse, consistent Chromium rendering, or team JS familiarity. → [A1](../atlas/awareness/01-tauri-vs-electron.md), [A2](../atlas/awareness/02-other-frameworks.md).
- [ ] **2. Decide target platforms** (Win / Mac / Linux). Each adds signing budget + CI runner cost. Be specific: "Win 10+ x64+ARM64; macOS 12+ universal; Linux AppImage." → [C5](../atlas/core/05-packaging-and-signing.md), [C6](../atlas/core/06-cross-platform-porting.md).
- [ ] **3. Decide distribution channel.** Own site, GitHub Releases, Mac App Store (sandbox + 4 certs + review), Microsoft Store (MSIX, no cert). → [A3](../atlas/awareness/03-store-distribution.md).
- [ ] **4. Pin the Electron major.** Latest stable = Electron 41.x `(as of 2026-04)` (Chromium 146 / V8 14.6 / Node 24). Electron supports the latest 3 majors, ~24 weeks each. → [C1](../atlas/core/01-fundamentals.md).
- [ ] **5. Document the threat model in one paragraph.** Renders user-controlled HTML? Loads remote URLs? Handles secrets? The answer drives Phase 3. → [C3](../atlas/core/03-security.md).
- [ ] **6. Confirm signing-cert budget.** macOS Apple Developer ID = $99/yr. Windows OV with HSM = $300-700/yr (HSM-mandatory since June 2023). Procurement: 1-3 weeks. → [C5](../atlas/core/05-packaging-and-signing.md).

---

## Phase 1 — Bootstrap

- [ ] **7. Pick scaffolding** `(as of 2026-04)`:
  - **Electron Forge** (officially recommended): Webpack template (stable, first-party) or Vite plugin (experimental v7.5+). **Webpack template is the safe bet today.**
  - **electron-vite + electron-builder** (community): production-ready Vite tooling.
  - → [C8](../atlas/core/08-frontend-stack.md).
- [ ] **8. Choose frontend framework.** React / Vue / Svelte / Solid — KB-agnostic. Renderer is just a Chromium tab.
- [ ] **9. Use TypeScript.** Standard; non-negotiable for typed IPC. → [T2](templates/02-ipc-contract.md).
- [ ] **10. Initialize git.** `.gitignore` must exclude: `node_modules/`, `out/`, `dist/`, `.vite/`, `.webpack/`, `.env`, `*.p12`, `*.pfx`, signing materials. **Never** commit certs or notarization keys.
- [ ] **11. Pin Node version** via `.nvmrc` matching Electron's bundled Node (Electron 41 = Node 24). Mismatch → native-module ABI rebuild loops. → [C4](../atlas/core/04-native-integrations.md#native-modules).
- [ ] **12. `package.json` scripts**: `dev`, `build`, `package`, `make`, `lint`, `test`. One command, one purpose.

---

## Phase 2 — Process model

The three-process model (main / preload / renderer) is Electron's defining feature. Get this layout right on day one; retrofitting means re-auditing every IPC channel.

- [ ] **13. Set up main / preload / renderer** per [C2](../atlas/core/02-process-model-and-ipc.md). Main owns Node + OS integrations; renderer is sandboxed and only sees what `contextBridge` exposes.
- [ ] **14. Use `contextBridge.exposeInMainWorld`** for every renderer API. Never disable `contextIsolation`. Never set `nodeIntegration: true`. → [T1](templates/01-secure-preload.md).
- [ ] **15. Typed IPC contract** with shared types. `invoke`/`handle` for request-response, `send`/`on` for events, `MessagePorts` for streams. → [T2](templates/02-ipc-contract.md).
- [ ] **16. Validate every IPC payload in main.** Renderer is hostile until proven otherwise. Type-check args with Zod / Valibot; never spread untrusted data into `shell` / `fs` / `exec`. → [C3](../atlas/core/03-security.md).
- [ ] **17. UtilityProcess for CPU-heavy work** (Electron 22+). Don't block main on parsing / hashing / inference. → [C2](../atlas/core/02-process-model-and-ipc.md).

---

## Phase 3 — Security

The 17-point Electron security checklist is canonical. **Don't skip this phase.**

- [ ] **18. Verify defaults**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Defaults since v12 / v20, but re-assert per `BrowserWindow` as documentation. → [C3](../atlas/core/03-security.md).
- [ ] **19. Set Content-Security-Policy.** Use `session.webRequest.onHeadersReceived` (preferred) or `<meta http-equiv>`. Restrict `connect-src` to your exact backend origin. No `unsafe-inline` in prod. → [C3](../atlas/core/03-security.md).
- [ ] **20. Permissions handler.** `session.setPermissionRequestHandler` — deny by default; allow camera / mic / notifications only when needed. → [C3](../atlas/core/03-security.md).
- [ ] **21. Navigation guards.** `webContents.on('will-navigate', ...)` blocks navigation away. `setWindowOpenHandler(...)` controls `window.open`. → [C3](../atlas/core/03-security.md).
- [ ] **22. ASAR integrity for production.** Flip `EnableEmbeddedAsarIntegrityValidation` + `OnlyLoadAppFromAsar` fuses; relies on code signing. Stable in Electron 39+. → [C3](../atlas/core/03-security.md), [C5](../atlas/core/05-packaging-and-signing.md).
- [ ] **23. Configure Electron Fuses.** Disable `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments` for production. Package-time, OS-enforced via signing. → [C3](../atlas/core/03-security.md).
- [ ] **24. Scan with Electronegativity** before first release and on every Electron major upgrade. → [C3](../atlas/core/03-security.md).
- [ ] **25. Subscribe to Electron security advisories** ([GHSA feed](https://github.com/electron/electron/security/advisories)). Recent: CVE-2025-55305 (ASAR bypass via V8 snapshot, fixed 35.7.5 / 36.8.1 / 37.3.1 / 38.0.0-beta.6). → [C3](../atlas/core/03-security.md).
- [ ] **26. Review `electron-secure-defaults`** (1Password) as a reference / linter even if you don't pull it. → [CS4](../atlas/case-studies/04-1password.md).

---

## Phase 4 — Backend wiring

For connected apps (Railway is the canonical backend in this KB), these decisions shape token flow, offline behavior, and proxy compatibility.

- [ ] **27. Read [T5](templates/05-railway-backend-client.md)** end-to-end first. Covers auth flow, `safeStorage`, WebSocket reconnect, offline cache, `net.fetch`. → [C9](../atlas/core/09-backend-connectivity.md).
- [ ] **28. Token storage = `safeStorage`** (Electron 15+, OS-keychain-backed). **Not `keytar`** (atom/node-keytar archived Dec 2022). Wrap token I/O in one module. → [C9](../atlas/core/09-backend-connectivity.md).
- [ ] **29. Pick an auth flow**: email+password (simplest), OAuth PKCE with custom protocol callback (`yourapp://oauth-callback`), or magic link. → [C9](../atlas/core/09-backend-connectivity.md).
- [ ] **30. Use `net.fetch`** (not Node `fetch`/`undici`) for HTTPS from main. Runs through Chromium's network stack — system proxy, device certs, OS trust store. Critical for corporate / VPN users. → [C9](../atlas/core/09-backend-connectivity.md).
- [ ] **31. WebSocket / SSE with reconnect + backoff.** Plan token refresh mid-stream + resumable cursors. No tight reconnect loops on auth failures.
- [ ] **32. Offline-first stance**: none / read-only cache / full local mirror with sync. SQLite via `better-sqlite3` is the workhorse; IndexedDB for renderer-only. → [C9](../atlas/core/09-backend-connectivity.md).
- [ ] **33. CSP `connect-src`** matches exact backend host + `wss://...`. Every new domain = CSP edit + review.

---

## Phase 5 — Native integrations

Add only what you need.

- [ ] **34. Tray icon + dock badge** (if applicable). Per-OS sizing; macOS template images need `@2x`. → [C4](../atlas/core/04-native-integrations.md), [C6](../atlas/core/06-cross-platform-porting.md).
- [ ] **35. Deep links / custom protocol** (`yourapp://`). Register via `app.setAsDefaultProtocolClient`. Win/Linux: `second-instance`; macOS: `open-url`. Test all three. → [C4](../atlas/core/04-native-integrations.md#deep-links).
- [ ] **36. Notifications.** Renderer `new Notification(...)` with permission. On Windows, set AppUserModelID or notifications attribute to "PowerShell". → [C4](../atlas/core/04-native-integrations.md).
- [ ] **37. File / dialog APIs.** `dialog.showOpenDialog` from main; never trust renderer-supplied paths. → [C3](../atlas/core/03-security.md).
- [ ] **38. Native Node modules / Rust.** Add only when JS won't cut it. Native modules need Electron-ABI rebuild (`@electron/rebuild`); Rust via `napi-rs` is the modern path. → [C4](../atlas/core/04-native-integrations.md#native-modules), [CS4](../atlas/case-studies/04-1password.md).
- [ ] **39. Hardware APIs** (WebHID / WebUSB / WebSerial). Permissioned via `setDevicePermissionHandler` + `select-*-device` events. → [C4](../atlas/core/04-native-integrations.md).

---

## Phase 6 — Frontend

- [ ] **40. Vite + framework + ESM.** Electron supports ESM since v28 (Dec 2023). Both main and renderer can be ESM. → [C8](../atlas/core/08-frontend-stack.md).
- [ ] **41. HMR works in dev.** Renderer hot-reloads, main hot-restarts. Verify early.
- [ ] **42. Production loads via `loadFile()` (or `file://` + ASAR)**, not a localhost server. Localhost on a packaged app = security red flag.
- [ ] **43. Static assets resolve in prod.** Verify after first packaged build — relative paths break under ASAR. Use `__dirname` + `path.join`, never `process.cwd()`.
- [ ] **44. Shared TS types** between main / preload / renderer (e.g., `src/shared/ipc.ts`). → [T2](templates/02-ipc-contract.md).

---

## Phase 7 — Packaging

Sign-from-day-one. Retrofitting signing means full rebuilds.

- [ ] **45. Pick Forge or electron-builder.** Forge officially endorsed; Builder has more downloads + features. → [C5](../atlas/core/05-packaging-and-signing.md), [T3](templates/03-electron-builder-config.md).
- [ ] **46. macOS: Developer ID + hardened runtime + notarization.** Sign with `@electron/osx-sign`; notarize with `@electron/notarize` using `notarytool` (legacy `altool` removed Nov 2023). Review `com.apple.security.cs.*` entitlements — every flag weakens the runtime. Notarization is **mandatory** for Gatekeeper outside MAS. → [C5](../atlas/core/05-packaging-and-signing.md).
- [ ] **47. Windows: code signing** `(as of 2026-04)`:
  - Private keys must live on HSM / hardware token / cloud signing since **CA/B Forum mandate (June 2023)**.
  - **EV instant-SmartScreen-trust removed March 2024** — even EV builds reputation organically now.
  - **Max validity 460 days (≈15 months) since March 2026.** Plan rotation.
  - Cloud: **Azure Trusted Signing** (rebranded "Azure Artifact Signing" Oct 2025) — US/Canada-only, 3+ yr business history. EU fallbacks: **DigiCert KeyLocker, Sectigo Signing Service, SSL.com eSigner**.
  - → [C5](../atlas/core/05-packaging-and-signing.md).
- [ ] **48. Linux formats.** AppImage (zero-deps) + .deb + .rpm. Snap / Flatpak add store discoverability at the cost of confined-runtime quirks. → [C5](../atlas/core/05-packaging-and-signing.md).
- [ ] **49. Universal macOS binary** for x64+arm64. Windows arm64 if applicable. → [C5](../atlas/core/05-packaging-and-signing.md).
- [ ] **50. Smoke-test installers on clean VMs** for each OS pre-tag. Windows AV false-positives are common pre-reputation.

---

## Phase 8 — Auto-update

Ship update infrastructure with v1.0, not v1.5.

- [ ] **51. Pick `electron-updater` or built-in `autoUpdater`.** `electron-updater` (from electron-builder): unified API, GitHub Releases / S3 / generic. Recommended. Built-in: Squirrel.Mac + Squirrel.Windows (still Forge's default Windows maker; deprecated only in electron-builder, unarchived upstream). → [C7](../atlas/core/07-auto-update.md), [T4](templates/04-auto-update.md).
- [ ] **52. Update server.** GitHub Releases (free) → Hazel / Nuts (Vercel) → S3. Pick the simplest. → [C7](../atlas/core/07-auto-update.md).
- [ ] **53. Channels: stable / beta** (and optionally alpha). Don't push experimental code to full user base.
- [ ] **54. Test update flow in staging.** Install N → publish N+1 → verify download + relaunch. macOS requires same Developer ID across versions. Windows may need elevation. → [T4](templates/04-auto-update.md).
- [ ] **55. Staged rollouts.** Differential downloads (Builder) reduce bandwidth. Phased % rollout catches regressions before 100%.

---

## Phase 9 — Observability

- [ ] **56. `crashReporter.start()`** in main *and* preload, before any window opens. Crashpad collects native minidumps from main + renderer + native modules. → [C10](../atlas/core/10-performance-and-observability.md).
- [ ] **57. Sentry main + renderer + native** via `@sentry/electron`. One SDK hooks crashReporter + JS exceptions both sides. → [C10](../atlas/core/10-performance-and-observability.md), [A6](../atlas/awareness/06-telemetry.md).
- [ ] **58. `electron-log`** rotating logs in `app.getPath('logs')`, bridged main↔renderer. Capture install / update / crash events. → [C10](../atlas/core/10-performance-and-observability.md).
- [ ] **59. Renderer crash recovery.** `webContents.on('render-process-gone', ...)` → "page crashed, reload?" UI. Don't let renderer crashes silently kill the window. → [C10](../atlas/core/10-performance-and-observability.md).
- [ ] **60. Unhandled rejections / exceptions in main** (`uncaughtException` + `unhandledRejection`) — log + report, then decide whether to stay alive.

---

## Phase 10 — Testing

- [ ] **61. Playwright `_electron`** for E2E. Spectron is dead (deprecated 2022). → [A5](../atlas/awareness/05-testing.md).
- [ ] **62. CI matrix Win / Mac / Linux.** GitHub Actions runners exist for all three; Linux uses `xvfb`. → [A5](../atlas/awareness/05-testing.md).
- [ ] **63. Mock IPC in renderer unit tests.** Don't boot the full app per test.
- [ ] **64. Smoke test on each OS pre-release.** Min: launch, sign-in, one main action, quit. → [A5](../atlas/awareness/05-testing.md).
- [ ] **65. Test with `contextIsolation: true` from day one.** Tests written against `nodeIntegration` shortcuts silently break when defaults get fixed.

---

## Phase 11 — Privacy & policy

- [ ] **66. Telemetry consent UI.** First-launch dialog or settings toggle. → [A6](../atlas/awareness/06-telemetry.md).
- [ ] **67. Privacy policy URL** in-app + on the website. Required by MAS, MS Store, GDPR, CCPA.
- [ ] **68. Crash report PII scrubbing.** Sentry `beforeSend` / electron-log filters for tokens, emails, file paths. → [A6](../atlas/awareness/06-telemetry.md).
- [ ] **69. App store nutrition labels** if shipping to MAS / MS Store. → [A3](../atlas/awareness/03-store-distribution.md).

---

## Phase 12 — Pre-release

30-minute checklist before tag.

- [ ] **70. Bump version** (semver) in `package.json` + any embedded `electron-builder.yml`.
- [ ] **71. Update CHANGELOG.** Match auto-update release-notes payload.
- [ ] **72. Sign + notarize all platforms.** Verify staple: `xcrun stapler validate`. Verify Windows: `signtool verify /pa`. → [C5](../atlas/core/05-packaging-and-signing.md).
- [ ] **73. Test installer + update flow on each OS.** Fresh + upgrade-from-prior. → [T4](templates/04-auto-update.md).
- [ ] **74. Tag in git; publish.** GitHub Release auto-publishes to electron-updater if configured.
- [ ] **75. Monitor Sentry + electron-log in first 24h.** Post-release crash spikes usually = signing / fuse / ASAR misconfig.

---

## Common omissions

Things teams forget on first release. Cross-reference before tag.

- [ ] **76. `app.requestSingleInstanceLock()`** in main. Without it, deep links launch a *second* copy on Win/Linux. Use the `second-instance` event to focus the existing window + forward argv. → [C4](../atlas/core/04-native-integrations.md).
- [ ] **77. AppUserModelID on Windows** via `app.setAppUserModelId('com.yourcompany.yourapp')`. Without it: notifications attribute to "Electron" / "PowerShell"; taskbar icon doesn't pin; Squirrel events misroute.
- [ ] **78. macOS keychain prompt on first launch.** `safeStorage` init triggers a keychain prompt. Test on clean account; tune the surrounding UX so users don't dismiss blindly.
- [ ] **79. Dock badge + Windows overlay icon** for unread counts. Two APIs; both expected for messaging apps. → [C4](../atlas/core/04-native-integrations.md).
- [ ] **80. Disable DevTools in production** (close on `devtools-opened`, or build-time flag). Otherwise users hit Cmd+Opt+I and find your renderer internals.
- [ ] **81. `Permissions-Policy` headers** on the backend serving the renderer. CSP isn't enough — feature gates (camera / mic / geo) follow server-set policies.
- [ ] **82. Logout clears `safeStorage` *and* `session.clearStorageData()`.** Tokens + cookies + localStorage all need to go, or next user signs in to previous user's data.
- [ ] **83. macOS Gatekeeper "damaged app"** on first launch = unsigned or quarantine-bit issue. Test by downloading the .dmg via a browser (sets quarantine bit) before shipping.
- [ ] **84. Windows SmartScreen warning** is normal until reputation builds. Verify cert: `signtool verify /pa`. EV no longer instant-bypasses since March 2024. → [C5](../atlas/core/05-packaging-and-signing.md).
- [ ] **85. Linux desktop integration.** `.desktop` file with `Icon=`, `Exec=`, `MimeType=`. AppImage doesn't install one — use `appimaged` or bundle in installer. → [C6](../atlas/core/06-cross-platform-porting.md).
- [ ] **86. Wayland default in Electron 38+** (Sept 2025): launched in Wayland session = native Wayland; `ELECTRON_OZONE_PLATFORM_HINT` removed in Electron 39. Test on GNOME/KDE Wayland, not just X11. → [C6](../atlas/core/06-cross-platform-porting.md) `(as of 2026-04)`.
- [ ] **87. Auto-launch on login.** `app.setLoginItemSettings()` (mac/Win); Linux: `~/.config/autostart/*.desktop`. Add a settings toggle.
- [ ] **88. License file in installer.** Required by stores; supported by NSIS + DMG.

---

## Cross-links

- [build-kit/decision-tree.md](decision-tree.md) — should you even use Electron?
- [build-kit/templates/01-secure-preload.md](templates/01-secure-preload.md) — preload skeleton.
- [build-kit/templates/02-ipc-contract.md](templates/02-ipc-contract.md) — typed IPC.
- [build-kit/templates/03-electron-builder-config.md](templates/03-electron-builder-config.md) — packaging config.
- [build-kit/templates/04-auto-update.md](templates/04-auto-update.md) — update wiring.
- [build-kit/templates/05-railway-backend-client.md](templates/05-railway-backend-client.md) — backend integration.
- [atlas/00-INDEX.md](../atlas/00-INDEX.md) — navigation map.

## Sources

This page is a meta-index over the Core / Awareness / Template pages. Authoritative sources for every claim live there. For the master URL list, see [sources/SOURCES.md](../sources/SOURCES.md).
