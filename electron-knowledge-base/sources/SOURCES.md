# Sources — Authoritative URLs for the Electron Knowledge Base

> Last updated: 2026-04-30 (post-Validator + Fixer pass).
>
> Cite these. Each URL has been spot-checked during Phase 1 research (2026-04-30). Phase 3 agents must use these sources or surface a justification before adding new ones.
>
> Priority order: official Electron docs > Electron blog > Electron GitHub > Apple/Microsoft dev docs > Chromium/V8 > MDN > vendor engineering blogs > everything else.

## C1 — Fundamentals

- [Electron — Build cross-platform desktop apps](https://www.electronjs.org/) — homepage; current stable advertised here
- [Electron Releases](https://releases.electronjs.org/) — full release history with Chromium / V8 / Node versions
- [Electron Release Schedule](https://releases.electronjs.org/schedule) — upcoming versions, EOL dates
- [Electron Timelines](https://www.electronjs.org/docs/latest/tutorial/electron-timelines) — versioning policy
- [endoflife.date — Electron](https://endoflife.date/electron) — third-party EOL tracker; useful as cross-check
- [Electron 28 release blog (ESM support)](https://www.electronjs.org/blog/electron-28-0) — "Added ESM support (a highly requested feature)"
- [Things people get wrong about Electron — Felix Rieseberg](https://felixrieseberg.com/things-people-get-wrong-about-electron/) — former Electron maintainer's myth-busting

## C2 — Process model & IPC

- [Process Model | Electron docs](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Inter-Process Communication | Electron docs](https://www.electronjs.org/docs/latest/tutorial/ipc) — canonical IPC patterns
- [contextBridge | Electron API](https://www.electronjs.org/docs/latest/api/context-bridge)
- [ipcMain | Electron API](https://www.electronjs.org/docs/latest/api/ipc-main)
- [ipcRenderer | Electron API](https://www.electronjs.org/docs/latest/api/ipc-renderer)
- [MessagePorts in Electron | Electron docs](https://www.electronjs.org/docs/latest/tutorial/message-ports)
- [UtilityProcess | Electron API](https://www.electronjs.org/docs/latest/api/utility-process) — added Electron 22

## C3 — Security 🔁

- [Security | Electron docs](https://www.electronjs.org/docs/latest/tutorial/security) — the 17-point official checklist
- [Context Isolation | Electron docs](https://www.electronjs.org/docs/latest/tutorial/context-isolation) — default since v12
- [Process Sandboxing | Electron docs](https://www.electronjs.org/docs/latest/tutorial/sandbox) — default since v20
- [Electron Fuses | Electron docs](https://www.electronjs.org/docs/latest/tutorial/fuses) — package-time toggles
- [ASAR Integrity | Electron docs](https://www.electronjs.org/docs/latest/tutorial/asar-integrity) — stable in Electron 39
- [Electron and the V8 Memory Cage | Electron blog](https://www.electronjs.org/blog/v8-memory-cage) — V8 sandbox, Electron 21
- [Breach to Barrier — Strengthening Apps with the Sandbox | Electron blog](https://www.electronjs.org/blog/breach-to-barrier)
- [CVE-2025-55305 / GHSA-vmqv-hx8q-j7mg — ASAR Integrity Bypass via resource modification (V8 snapshot); fixed in 35.7.5 / 36.8.1 / 37.3.1 / 38.0.0-beta.6](https://github.com/electron/electron/security/advisories/GHSA-vmqv-hx8q-j7mg)
- [CVE-2023-44402 / GHSA-7m48-wc93-9g85 — ASAR Integrity bypass via filetype confusion (macOS-only); fixed in 22.3.24+](https://github.com/electron/electron/security/advisories/GHSA-7m48-wc93-9g85)
- [CVE-2025-55305 — GitLab Advisory Database (cross-reference for the resource-modification advisory above)](https://advisories.gitlab.com/pkg/npm/electron/CVE-2025-55305/)
- [electron-secure-defaults | 1Password GitHub](https://github.com/1password/electron-secure-defaults/) — opinionated security starter
- [electron-hardener | 1Password GitHub](https://github.com/1Password/electron-hardener) — Rust library for further hardening
- [Electronegativity | Doyensec GitHub](https://github.com/doyensec/electronegativity) — security scanner
- [Penetration Testing of Electron-based Applications | Deepstrike](https://deepstrike.io/blog/penetration-testing-of-electron-based-applications) — concrete attack patterns
- [The App Sandbox | Slack engineering](https://slack.engineering/the-app-sandbox/) — production security migration story

## C4 — Native integrations

- [Deep Links / Launch from URL | Electron docs](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app)
- [protocol | Electron API](https://www.electronjs.org/docs/latest/api/protocol)
- [Native Code and Electron | Electron docs](https://www.electronjs.org/docs/latest/tutorial/native-code-and-electron)
- [Native Node Modules | Electron docs](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules) — ABI rebuild story
- [napi-rs](https://napi.rs/) — Rust → N-API bindings, latest 3.8.6 (Apr 29 2026) `(as of 2026-04)`
- [napi-rs changelog](https://napi.rs/changelog/napi)
- [Notifications | Electron docs](https://www.electronjs.org/docs/latest/tutorial/notifications)
- [Tray | Electron API](https://www.electronjs.org/docs/latest/api/tray)
- [Custom Protocols and Deeplinking in Electron apps | bloomca blog (2025)](https://blog.bloomca.me/2025/07/20/electron-apps-custom-protocols.html) — *supplementary*; prefer the official Electron deep-links docs above

### C4 — Device APIs (WebHID / WebUSB / WebSerial)

- [Device Access (WebHID, WebUSB, WebSerial) | Electron docs](https://www.electronjs.org/docs/latest/tutorial/devices) — session handlers (`select-hid-device`, `select-serial-port`, `select-usb-device`, `setDevicePermissionHandler`)

## C5 — Packaging & code signing 🔁

- [Distributing Apps With Electron Forge | Electron docs](https://www.electronjs.org/docs/latest/tutorial/forge-overview) — official endorsement of Forge
- [Why Electron Forge? | Forge docs](https://www.electronforge.io/core-concepts/why-electron-forge)
- [Electron Forge Vite template](https://www.electronforge.io/templates/vite)
- [electron-builder docs](https://www.electron.build/)
- [Code Signing | Electron docs](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [Notarizing macOS software before distribution | Apple Developer](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Apple — Resolving common notarization issues](https://developer.apple.com/documentation/security/resolving-common-notarization-issues)
- [Hardened Runtime | Apple Developer](https://developer.apple.com/documentation/security/hardened_runtime)
- [Code signing options for Windows app developers | Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [Microsoft Trusted Signing | Microsoft Learn](https://learn.microsoft.com/en-us/azure/trusted-signing/) — cloud-based EV alternative; **rebranded to "Azure Artifact Signing"** in Oct 2025; still US/Canada-only with 3+ year business history requirement
- [SmartScreen reputation for Windows app developers | Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation) — substantiates the EV-instant-trust change (March 2024)
- [Code Signing Baseline Requirements | CA/Browser Forum](https://cabforum.org/working-groups/code-signing/requirements/) — primary source for the 460-day (≈15-month) validity rule
- [Distributing software outside of the Mac App Store | Apple Developer](https://developer.apple.com/documentation/security/distributing-software-outside-of-the-mac-app-store-1) — DMG / ZIP / notarization workflow
- [Mac App Store Submission Guide | Electron docs](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)
- [@electron/osx-sign | GitHub](https://github.com/electron/osx-sign)
- [Configuring Electron Fuses | electron-builder docs](https://www.electron.build/tutorials/adding-electron-fuses.html)

## C6 — Cross-platform porting

- [Mac App Store Submission Guide | Electron docs](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)
- [Universal macOS binaries | Electron docs](https://www.electronjs.org/docs/latest/tutorial/mac-universal-binary)
- [Snap | Electron docs](https://www.electronjs.org/docs/latest/tutorial/snap)
- [Linux desktop integration via electron-builder](https://www.electron.build/configuration/linux)
- [NSIS targets in electron-builder](https://www.electron.build/configuration/nsis)
- [MSI / MSIX targets in electron-builder](https://www.electron.build/configuration/appx)
- [Tech Talk — How Electron went Wayland-native | Electron blog](https://www.electronjs.org/blog/tech-talk-wayland) — Electron 38 default, ELECTRON_OZONE_PLATFORM_HINT removal in 39
- [Electron 38.0.0 release | Electron blog](https://www.electronjs.org/blog/electron-38-0)

## C7 — Auto-update 🔁

- [Updating Applications | Electron docs](https://www.electronjs.org/docs/latest/tutorial/updates)
- [autoUpdater | Electron API](https://www.electronjs.org/docs/latest/api/auto-updater) — built-in, Squirrel-based
- [Auto Update | electron-builder docs](https://www.electron.build/auto-update.html)
- [electron-updater | npm](https://www.npmjs.com/package/electron-updater)
- [Hazel | GitHub](https://github.com/vercel/hazel) — update server, runs on Vercel
- [Nuts | GitHub](https://github.com/GitbookIO/nuts) — update server with private repo support
- [Squirrel.Windows | upstream GitHub repo](https://github.com/Squirrel/Squirrel.Windows) — still maintained upstream; deprecated only in electron-builder, remains Forge's default Windows maker

## C8 — Frontend stack (Vite + framework)

- [ES Modules (ESM) in Electron | Electron docs](https://www.electronjs.org/docs/latest/tutorial/esm) — supported since v28
- [Electron 28.0.0 release | Electron blog](https://www.electronjs.org/blog/electron-28-0)
- [electron-vite](https://electron-vite.org/) — community Vite tooling
- [Forge Vite template](https://www.electronforge.io/templates/vite)
- [Forge Vite plugin (config)](https://www.electronforge.io/config/plugins/vite)
- [vite-electron-builder | GitHub](https://github.com/cawa-93/vite-electron-builder) — alternative starter

## C9 — Backend connectivity (Railway use case) ⭐

- [safeStorage | Electron API](https://www.electronjs.org/docs/latest/api/safe-storage) — recommended token storage
- [Replacing Keytar with Electron's safeStorage | Freek Van der Herten](https://freek.dev/2103-replacing-keytar-with-electrons-safestorage-in-ray) — concrete migration
- [How to securely store sensitive information in Electron with node-keytar | Cameron Nokes](https://cameronnokes.com/blog/how-to-securely-store-sensitive-information-in-electron-with-node-keytar/) — for context (now legacy)
- [Build and Secure an Electron App — OpenID, OAuth, Node.js | Auth0](https://auth0.com/blog/securing-electron-applications-with-openid-connect-and-oauth-2/)
- [net | Electron API](https://www.electronjs.org/docs/latest/api/net) — main-process HTTP client (no CORS); `net.fetch` uses Chromium's network stack with system proxy / device-certificate support (matters for corporate-proxy users)
- [better-sqlite3 | GitHub](https://github.com/WiseLibs/better-sqlite3) — synchronous SQLite for Electron main
- [PKCE for OAuth public clients | RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)

## C10 — Performance & observability

- [Performance | Electron docs](https://www.electronjs.org/docs/latest/tutorial/performance)
- [Speeding up Electron apps with V8 snapshots | RaisinTen](https://github.com/RaisinTen/electron-snapshot-experiment)
- [How to make your Electron app launch 1,000ms faster | Takuya Matsuyama](https://www.devas.life/how-to-make-your-electron-app-launch-1000ms-faster/)
- [6 Ways Slack, Notion, and VSCode Improved Electron App Performance | Palette](https://palette.dev/blog/improving-performance-of-electron-apps) — *supplementary*; prefer original Slack/Notion/VSCode engineering posts as primary
- [crashReporter | Electron API](https://www.electronjs.org/docs/latest/api/crash-reporter)
- [Sentry for Electron docs](https://docs.sentry.io/platforms/javascript/guides/electron/)
- [sentry-electron | GitHub](https://github.com/getsentry/sentry-electron)
- [electron-log | npm](https://www.npmjs.com/package/electron-log)

## A1 — Tauri 2.x vs. Electron

- [Tauri 2.0 Stable Release | Tauri blog](https://v2.tauri.app/blog/tauri-20/) — Oct 2024 stable
- [Tauri Architecture | Tauri docs](https://v2.tauri.app/concept/architecture/)
- [What is Tauri? | Tauri docs](https://v2.tauri.app/start/)
- [Migrate from Electron to Tauri | Tauri docs](https://v2.tauri.app/start/migrate/) — official guidance
- [Tauri (software framework) | Wikipedia](https://en.wikipedia.org/wiki/Tauri_(software_framework))
- [Electron vs. Tauri | DoltHub blog (2025-11)](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/) — *supplementary*; vendor-engineering blog about a non-DoltHub product

## A2 — Other web-to-desktop frameworks

- [Wails | GitHub](https://github.com/wailsapp/wails)
- [Neutralino | GitHub](https://github.com/neutralinojs/neutralinojs)
- [WebView2 | Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-edge/webview2/)
- [Web-to-desktop framework comparison | GitHub](https://github.com/Elanis/web-to-desktop-framework-comparison) — empirical bench

## A3 — Store distribution

- [Mac App Store Submission Guide | Electron docs](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)
- [Microsoft Store policies for desktop apps](https://learn.microsoft.com/en-us/windows/uwp/publish/store-policies)
- [Submit an Electron App to the Mac App Store | DoltHub](https://www.dolthub.com/blog/2024-10-02-how-to-submit-an-electron-app-to-mac-app-store/)

## A4 — Accessibility & i18n

- [Accessibility | Electron docs](https://www.electronjs.org/docs/latest/tutorial/accessibility)
- [Chromium accessibility internals](https://www.chromium.org/developers/design-documents/accessibility/)
- [app.getLocale | Electron API](https://www.electronjs.org/docs/latest/api/app#appgetlocale)

## A5 — Testing Electron apps

- [Automated Testing | Electron docs](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
- [Electron | Playwright docs](https://playwright.dev/docs/api/class-electron) — experimental Electron support
- [electron-playwright-example | GitHub](https://github.com/spaceagetv/electron-playwright-example)

## A6 — Telemetry & crash reporting

- [crashReporter | Electron API](https://www.electronjs.org/docs/latest/api/crash-reporter)
- [Crashpad | Chromium docs](https://chromium.googlesource.com/crashpad/crashpad/+/main/doc/overview_design.md)
- [Sentry Electron guide](https://docs.sentry.io/platforms/javascript/guides/electron/)
- [Native Crash Reporting | Sentry Electron](https://docs.sentry.io/platforms/javascript/guides/electron/features/native-crash-reporting/)

## CS1 — VS Code

- [Migrating VS Code to Process Sandboxing | VS Code blog (2022-11)](https://code.visualstudio.com/blogs/2022/11/28/vscode-sandbox)
- [Update to Electron 28 | VS Code GitHub issue](https://github.com/microsoft/vscode/issues/201935)
- [VS Code source | GitHub](https://github.com/microsoft/vscode) — vanilla `electron` dep, custom patches
- [RFC: Plan for updating to Electron >= 21 | VS Code GitHub](https://github.com/microsoft/vscode/issues/177338)

## CS2 — Slack & Discord

- [Slack engineering — The App Sandbox](https://slack.engineering/the-app-sandbox/)
- [Slack engineering blog — Electron tag](https://slack.engineering/tag/electron/)
- [Discord engineering blog](https://discord.com/category/engineering)
- [Migrating from BrowserView to WebContentsView | Electron blog](https://www.electronjs.org/blog/migrate-to-webcontentsview) — BrowserView deprecated in Electron 30+; relevant to Slack/Discord per-workspace pattern

## CS3 — Notion & Figma

- [How Notion uses WASM SQLite for local-first | Notion blog](https://www.notion.so/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite)
- [Figma's WebAssembly journey | Figma blog](https://www.figma.com/blog/webassembly-cut-figmas-load-time-by-3x/)
- [How Figma renders | Figma blog](https://www.figma.com/blog/building-a-professional-design-tool-on-the-web/)

## CS4 — 1Password

- [1Password 8: The Story So Far | 1Password blog](https://blog.1password.com/1password-8-the-story-so-far/)
- [Behind the scenes of 1Password for Linux | Dave Teare](https://dteare.medium.com/behind-the-scenes-of-1password-for-linux-d59b19143a23)
- [Rust in Production: 1Password | Serokell interview](https://serokell.io/blog/rust-in-production-1password)
- [electron-secure-defaults | 1Password GitHub](https://github.com/1password/electron-secure-defaults/)
- [electron-hardener | 1Password GitHub](https://github.com/1Password/electron-hardener)

## CS5 — Linear

- [Linear desktop app launch | Linear changelog (2019-04-25)](https://linear.app/changelog/2019-04-25-linear-desktop-app) — confirms Electron
- [Desktop app improvements + multi-window support | Linear changelog (2020-03-19)](https://linear.app/changelog/2020-03-19-desktop-app-improvements-multi-window-support)
- [Linear desktop](https://linear.app/desktop)

## Build-kit references

### Decision tree
- [Electron homepage](https://www.electronjs.org/)
- [Tauri homepage](https://v2.tauri.app/)
- [PWA on the desktop | web.dev](https://web.dev/learn/pwa)

### Templates
- [contextBridge.exposeInMainWorld | Electron API](https://www.electronjs.org/docs/latest/api/context-bridge#contextbridgeexposeinmainworldapikey-api)
- [electron-builder.yml configuration](https://www.electron.build/configuration/configuration)
- [electron-updater integration guide](https://www.electron.build/auto-update.html)

---

## Source-priority rules (reminder)

1. **Always prefer official Electron docs** for API behavior. They reflect the current major version.
2. **Use Apple/Microsoft developer docs** for signing / store / OS-specific rules — not third-party recaps.
3. **Use Electron blog posts** for release notes and security advisories.
4. **Engineering blogs are valid only when** the team writes about *their own* product (e.g., 1Password blog for 1Password, Slack engineering for Slack). Not Medium / dev.to recaps of other people's posts.
5. **Date-stamp** version-sensitive material: `(as of YYYY-MM)`.
