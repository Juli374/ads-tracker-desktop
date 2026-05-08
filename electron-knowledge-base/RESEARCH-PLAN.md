# Research Plan — Electron Desktop App Knowledge Base

> Plan v1 (2026-04-30). Phase 1 produces a buildable atlas; afterward the base operates as a living document.
> Last updated: 2026-04-30 (Phases 1-4 complete; ready for Phase 5 living-document mode).

## Mode

**Buildable, not encyclopedic.** Each Core page should give an engineer enough to choose the pattern, write the code, and ship — but Claude already knows a lot about JavaScript, Node, and Chromium. The base is a *panorama of patterns + technologies + decision points* with cited primary sources, not a from-scratch tutorial. Target ~30-50K words total across all pages (vs. agents-research's ~446K).

---

## 0. Goal and non-goal

### Goal
Build a reference such that a developer who has a backend on Railway and zero Electron experience can:
1. Decide whether Electron is even the right tool (vs. Tauri, PWA, native).
2. Choose a stack (React vs. Vue, Vite vs. Webpack, Forge vs. Builder).
3. Understand the security model from day one (context isolation, fuses, ASAR integrity).
4. Ship signed, notarized, auto-updating builds for Windows / macOS / Linux.
5. Connect cleanly to a remote backend (auth, tokens, WebSockets, offline).

### "Buildable" depth
Open the relevant page → in 30-60 minutes pick a pattern → mini-example exists → links to authoritative source → write the code. Not "knowing everything"; "knowing enough to ship."

### Non-goal
- Not a JavaScript / Node tutorial. Reader is assumed to know modern JS.
- Not an Electron API reference. We link to the official docs; we don't restate them.
- Not framework evangelism. We have an opinion (Forge + Vite as 2026 default) but state alternatives clearly.

---

## 1. Topic map

Structure: **Core (deep) + Awareness (shallow) + Case studies + Build-kit**.

### Core — deep, with mini-examples (~2-4K words each)

#### C1. Fundamentals — what Electron is and when to use it
- Chromium + Node.js + V8 in one binary; what it actually means
- Main / renderer / preload three-process model; why each exists
- The Electron lifecycle (`app.whenReady`, `BrowserWindow`, `did-finish-load`, etc.)
- When Electron is the right choice; when it is overkill (decision matrix vs. Tauri / PWA / native)
- Brief history: Atom Shell → Electron 1.0 (2016) → modern releases (Electron 41, Apr 2026, Chromium 146)

#### C2. Process model & IPC
- Main process responsibilities (windowing, file system, native APIs)
- Renderer process (sandboxed by default since v20, can't `require()` Node)
- Preload script as the trust boundary
- `contextBridge.exposeInMainWorld` — the only correct way to expose APIs
- `ipcMain` / `ipcRenderer` patterns: `invoke`/`handle` (request-response) vs. `send`/`on` (fire-and-forget)
- `MessagePorts` for streaming / high-throughput
- UtilityProcess (Electron 22+) for CPU-heavy work without blocking main

#### C3. Security — the official checklist, line by line
- The 17-point Electron security checklist as the canonical structure
- `contextIsolation: true` (default since v12), `nodeIntegration: false`, `sandbox: true` (default since v20)
- Content Security Policy (CSP) — what to set, common mistakes
- Electron Fuses — package-time feature toggles, OS-enforced via code signing
- ASAR integrity validation — fuse + onlyLoadAppFromAsar combo, stable in Electron 39+
- V8 memory cage / sandboxed pointers (Electron 21+)
- Common CVEs (TWO distinct advisories — do NOT conflate):
  - **CVE-2025-55305** = GHSA-vmqv-hx8q-j7mg — ASAR Integrity Bypass via *resource modification* (V8 snapshot), fixed in Electron 35.7.5 / 36.8.1 / 37.3.1 / 38.0.0-beta.6
  - **CVE-2023-44402** = GHSA-7m48-wc93-9g85 — ASAR Integrity bypass via *filetype confusion* (macOS-only), fixed in 22.3.24+
  - contextBridge bypasses (various)
- Tools: `electronegativity`, `electron-secure-defaults` (1Password)

#### C4. Native integrations
- File system, dialogs, notifications, tray, menus
- Deep links / custom protocol handlers (`setAsDefaultProtocolClient`) — Windows/macOS/Linux gotchas, second-instance event, packaged-only on macOS
- Shell, clipboard, screen capture, power monitor
- Native Node modules: when needed, ABI-recompile gotchas (Electron ABI ≠ Node ABI)
- Rust integration via `napi-rs` (latest 3.8.4, Mar 2026 — verify at draft time) — when worth the complexity
- Hardware / device APIs: **WebUSB / WebSerial / WebHID** via session handlers (`select-hid-device`, `select-serial-port`, `select-usb-device`, `setDevicePermissionHandler`); see `https://www.electronjs.org/docs/latest/tutorial/devices`

#### C5. Packaging & code signing
- `electron-forge` (official, recommended for new projects) vs. `electron-builder` (third-party, larger feature set)
  - As of 2026-04: Forge is officially endorsed by the Electron project; Builder is community-maintained. Both are actively developed.
- ASAR archive — what it is, when to disable
- macOS: Developer ID certificate + hardened runtime + notarization (mandatory for distribution outside MAS)
- Windows: OV vs. EV code signing; **CA/B Forum mandate (June 2023)** — private keys must live on HSM/hardware token / cloud signing service. **EV instant-SmartScreen-trust removed March 2024.** **March 2026: max validity drops 39 → 15 months.** Azure Trusted Signing / cloud signing as token alternative.
- Linux: AppImage / Snap / Flatpak / .deb / .rpm — pick one or many
- Universal macOS binaries (x64 + arm64); Windows arm64

#### C6. Cross-platform porting
- Platform-specific gotchas: window chrome, menu bar (macOS app menu), keyboard shortcuts (Cmd vs. Ctrl)
- File paths (`app.getPath`), per-OS conventions
- Tray icon sizing per platform
- macOS App Sandbox — required for Mac App Store, requires MAS-specific Electron build
- Windows installers: NSIS (default in electron-builder), MSI, MSIX (modern, experimental as of Forge v7.10), **Squirrel.Windows** — deprecated *in electron-builder* but **still the default Windows maker in Electron Forge**; the upstream Squirrel.Windows project is unarchived and receives commits
- Linux desktop integration (.desktop files, MIME types)
- **Wayland callout**: Electron 38 (Sept 2025) made Wayland the default when launched in a Wayland session; `ELECTRON_OZONE_PLATFORM_HINT` is being deprecated and removed in Electron 39. Sources: `https://www.electronjs.org/blog/tech-talk-wayland`, `https://www.electronjs.org/blog/electron-38-0`

#### C7. Auto-update
- `autoUpdater` (built-in, Squirrel.Mac on macOS, requires Squirrel.Windows on Windows)
- `electron-updater` (from electron-builder) — multi-platform unified API; recommended in most cases
- Update servers: GitHub Releases (free), Hazel, Nuts, S3/Spaces, custom
- Channels (alpha/beta/stable), staged rollouts
- Differential downloads (Builder)
- Common pitfalls: signing-required-for-update on macOS; admin permissions on Windows

#### C8. Frontend stack (Vite + framework + Electron)
- **Bundler choice (as of 2026-04)**: Forge ships both a **Webpack template** (stable, first-party) and a **Vite template/plugin** (experimental as of v7.5+, still production-used). For new projects, Vite is the trajectory; **Webpack is the safe choice today**. Outside of Forge, **electron-vite** is a community-maintained, production-ready alternative.
- `electron-vite` ecosystem (HMR for renderer, hot-restart for main)
- React / Vue / Svelte / Solid integration patterns
- ESM in Electron: stable since v28 (Dec 2023). What works, what doesn't (CJS/ESM interop edge cases).
- Dev vs. production loading (file:// vs. localhost:5173)
- TypeScript setup; shared types between main and renderer

#### C9. Backend connectivity (Railway use case) ⭐
- HTTPS to remote API from main process: no CORS, full Node `fetch` / `undici`
- HTTPS from renderer: subject to CSP and CORS unless you proxy through main
- WebSocket / SSE for live data; reconnect strategies
- Token storage: `safeStorage` (Electron 15+, OS-keychain-backed) is the modern choice; `keytar` is unmaintained as of 2024 (atom/node-keytar archived). 1Password's `electron-secure-defaults` covers the pattern.
- OAuth flows in desktop apps: PKCE, custom protocol callback (`myapp://oauth-callback`)
- Offline-first patterns: SQLite via `better-sqlite3` or IndexedDB; sync when online
- Background sync, notifications when window is closed

#### C10. Performance & observability
- Startup: V8 snapshots (Atom team got 50% reduction); precompiled bundles; `app.commandLine.appendSwitch('disable-background-networking')`
- Memory: V8 heap profiling; renderer per window (significant)
- DevTools, `--inspect` for main process
- Crash reporting: `crashReporter` API + Sentry Electron SDK (handles minidumps from main + renderer + native add-ons)
- Logging: `electron-log` (rotating file logs; ipc-bridged main↔renderer)
- Telemetry: opt-in, GDPR-aware

### Awareness — shallow, ~1-2K words

#### A1. Tauri 2.x vs Electron tradeoff
- Tauri 2.0 stable since Oct 2024; Rust core + system webview (WebKit/WebView2) instead of bundled Chromium
- Bundle size: ~600KB vs. ~80MB for Electron baseline
- Cross-WebView inconsistency tax (WebKitGTK on Linux can be painful)
- Mobile support added in v2 (iOS / Android) — Electron has none
- When to pick which (decision tree in build-kit)

#### A2. Other web-to-desktop frameworks
- Wails (Go backend, system webview)
- Neutralino (smallest, C/C++ runtime)
- WebView2-only apps (Windows-only, .NET MAUI / vanilla)
- PWA + install prompt — covers a lot of "Electron-lite" cases for free
- When each makes sense

#### A3. Distribution: Mac App Store & Microsoft Store
- MAS: requires App Sandbox (use `mas` Electron build); 4 certificates; entitlements; reviewed
- MSIX on Microsoft Store — sandboxed, auto-updating, no signing cert needed
- Tradeoffs: discoverability vs. friction & restrictions

#### A4. Accessibility & i18n
- Chromium accessibility tree → assistive tech "just works" (mostly)
- `app.getLocale()`, electron-internationalization patterns
- High-contrast mode, screen reader announcements

#### A5. Testing Electron apps
- Playwright `_electron` (experimental but widely used)
- Spectron is dead (deprecated 2022)
- Unit testing main vs. renderer; mocking IPC
- E2E in CI (xvfb on Linux, headed on macOS/Windows)

#### A6. Telemetry & crash reporting in production
- Crashpad (built into Chromium / Electron), what minidumps contain
- Sentry vs. self-hosted (GlitchTip), DataDog Electron RUM
- Privacy policy implications

### Case studies — how real apps actually built it (~1.5-2.5K words each)

#### CS1. VS Code (Microsoft)
- Vanilla Electron with patches (not a fork — clarification correcting common myth)
- Custom sandbox migration (2022 blog) — moved renderer to fully-sandboxed late, with extension host workaround
- Bundling strategy, ESBuild, multi-window architecture
- Auto-update across stable/insiders/exploration channels

#### CS2. Slack & Discord — "wrap a web app" archetype
- Multi-account, BrowserView/WebContentsView per workspace
- Notifications, badge counts, deep-link flows
- Performance work (Slack's CoffeeScript→TS migration; Discord's Redux state)

#### CS3. Notion & Figma — "web app shell" archetype
- Notion: WASM SQLite for local-first behavior
- Figma: WebGL + WASM rendering; Electron is a thin shell over the same web app
- When Electron really is just a window manager

#### CS4. 1Password — Rust core + Electron UI
- Migration story: native macOS app → Electron + Rust core (1Password 8, 2021)
- Why they built `electron-hardener` (Rust) and `electron-secure-defaults`
- TypeShare + Neon for FFI between Rust core and TS UI
- Counter-narrative to "everyone migrates *away* from Electron"

#### CS5. Linear — modern Electron + macOS-native polish
- **Confirmed Electron** per Linear's own changelog (2019-04-25 launch; 2020-03-19 multi-window improvements)
- Tight integration with macOS (menu bar, keyboard shortcuts, system tray)
- Local-first sync engine; connecting Electron to a backend that's not a REST API
- Sources: `https://linear.app/changelog/2019-04-25-linear-desktop-app`, `https://linear.app/changelog/2020-03-19-desktop-app-improvements-multi-window-support`

### Build-kit — practical scaffolds

- `checklist.md` — preflight before starting a new Electron app (security, signing, packaging, update, testing)
- `decision-tree.md` — Electron vs. Tauri vs. PWA vs. native, with branch "I have a Railway backend"
- `templates/01-secure-preload.md` — preload script that exposes a typed, capability-limited API via `contextBridge`
- `templates/02-ipc-contract.md` — typed IPC channel pattern with shared types between main and renderer
- `templates/03-electron-builder-config.md` — `electron-builder.yml` for Windows + macOS + Linux
- `templates/04-auto-update.md` — `electron-updater` integration with GitHub Releases backend
- `templates/05-railway-backend-client.md` ⭐ — auth flow, token storage in safeStorage, WebSocket reconnect, offline cache

---

## 2. Page count rationale

| Tier | Pages | Avg words | Subtotal |
|---|---|---|---|
| Core | 9 (C1-C4, C6-C10) | ~3,500 | ~31.5K |
| Core (C5 — Packaging & code signing, raised budget per Validator) | 1 | ~5,500 | ~5.5K |
| Awareness | 6 | ~1,500 | ~9K |
| Case studies | 5 | ~2,000 | ~10K |
| Build-kit | 7 (2 docs + 5 templates) | ~1,200 | ~8K |
| **Total** | **28 atlas pages + 7 build-kit** | | **~64K** |

That's well under agents-research (446K) but supports the panorama-of-patterns goal. C5 budget raised from 3.5K → 5.5K per Validator (Forge vs. Builder + macOS notarization + Windows signing 2024-2026 + Linux formats + universal binaries + Trusted/Artifact Signing make 3.5K too tight). If the Validator pushes for tighter overall, Awareness is the trim target.

**Total stub files to create: 21** (10 Core + 6 Awareness + 5 Case studies). Build-kit adds 7 more for a grand total of 28 stubs across atlas + build-kit.

---

## 3. Drops, additions, merges vs. the user's draft

### Dropped
- **Separate "C2 Process model" + "C3 Security" + "C4 Native"** as the user drafted them — kept all three but compressed Native into one page (C4) instead of bullet-listing many sub-areas. Reason: keeps the budget at ~3K words; the official Electron docs already enumerate the APIs; we just need patterns + when-to-use.
- **"Frontend stack" wasn't drafted as separate Core but the user listed it under #8** — kept (C8) because Vite-vs-Webpack and ESM rollout are real 2026 decisions.
- **"Tauri 2.x vs Electron tradeoff" as a Core** was implicit in the user's draft; demoted to **Awareness A1** — Claude already knows both ecosystems; what's needed is the decision criteria and the size/perf delta, which fits 1.5K words.

### Added
- **Build-kit Template 05 — "Railway backend client"** is the user's specific use case and deserves a dedicated scaffold (auth, safeStorage, WebSocket reconnect, offline). This is the single highest-leverage build-kit page for the user.
- **CS4 — 1Password's Electron+Rust migration** as a deliberate counter-example to "everyone moves *away* from Electron." Their `electron-secure-defaults` and `electron-hardener` are also referenced from C3 Security.
- **CVE/security advisory references in C3** — TWO distinct advisories, kept separate:
  - **CVE-2025-55305** / GHSA-vmqv-hx8q-j7mg — ASAR Integrity Bypass via resource modification (V8 snapshot)
  - **CVE-2023-44402** / GHSA-7m48-wc93-9g85 — ASAR Integrity bypass via filetype confusion (macOS-only)
- **Windows code signing 2024-2026 changes section in C5** — CA/B Forum HSM mandate June 2023, EV SmartScreen change March 2024, validity drop to 15 months March 2026. Time-sensitive material the LLM probably has stale data on.

### Merged
- User's draft #4 "Native integrations — FS, notifications, tray, deep links, protocol handlers, native modules" — kept all of these in **C4** but treat them as a survey ("what API solves what problem") rather than tutorials. Native modules + Rust gets a sub-section because it has nontrivial gotchas (ABI mismatch).
- User's draft #5 "Packaging" + #6 "Cross-platform porting" — kept separate (C5, C6) because packaging is *what tool produces installers* while cross-platform porting is *what changes per OS in the app code*. Different mental models.

### Renamed
- User's draft "Backend connectivity (Railway)" → **C9** with explicit ⭐ marker. Same content, made the Railway angle first-class.

---

## 4. Page shape (mirror agents-research)

Each Core page:

```
# C{N}. {Title}

> Status: 🟥 stub | 🟧 skeleton | 🟨 draft | 🟩 done | 🔁 living
> Last updated: YYYY-MM-DD

## TL;DR
2-4 sentence summary.

## When to apply
Bulleted list of triggers.

## When NOT to apply
Bulleted list of anti-patterns.

## Anatomy
The actual content — diagrams, prose, tables.

## Mini-example
A code snippet (~20-50 lines) illustrating the pattern.

## Cross-links
- [C{X}](path) — related Core
- [A{X}](path) — related Awareness

## Sources
- [Title](URL) — (as of YYYY-MM)
- ...
```

Status legend: 🟥 stub / 🟧 skeleton / 🟨 draft / 🟩 done / 🔁 living. Same as agents-research.

---

## 5. Sources priority

Per user constraint, prefer in this order:
1. Official Electron docs (`electronjs.org/docs`)
2. Electron blog (release announcements, security advisories)
3. Electron GitHub (releases, security advisories, RFC issues)
4. Apple Developer Documentation (notarization, hardened runtime)
5. Microsoft Learn (code signing, MSIX, WebView2)
6. Chromium / V8 official docs
7. MDN
8. Engineering blogs of cited products *only their own posts* (Slack engineering, 1Password blog, VS Code blog)
9. Conference talks with transcripts (avoid transcript-less video)

Avoid: Medium opinion pieces, dev.to recap posts, content farms.

All claims about versions / deprecations / "current as of" must be date-stamped: `(as of YYYY-MM)`. Today is 2026-04-30.

---

## 6. Methodology

Mirrors agents-research's approach, scaled down:

1. **Phase 1 — Architect (this doc + skeletons + SOURCES.md)** — ✅ complete (2026-04-30).
2. **Phase 2 — Validator** — independent agent reviewed this plan, the topic map, and the open questions. ✅ complete (2026-04-30, pass-with-notes); 9 required + 14 suggested fixes applied by Fixer agent the same day.
3. **Phase 3 — Parallel topic agents** — ✅ complete (2026-04-30); 28 pages drafted (~81K total words). Every draft cites SOURCES.md and date-stamps version-sensitive claims.
4. **Phase 4 — Final audit** — ✅ complete (2026-04-30); PASS-WITH-NOTES (4 required + 9 suggested fixes; required fixes applied).
5. **After Phase 4** — ⏳ Phase 5 (living document mode); quarterly refresh of 🔁 pages.

---

## 7. Open questions

Validator pass on 2026-04-30 resolved several. Remaining unresolved questions are flagged for Phase 3 topic agents to investigate while drafting.

### Resolved by Validator (2026-04-30)

1. **Is `electron-forge` truly the primary recommendation as of 2026-04, or is `electron-builder` still the de-facto winner?** ✅ RESOLVED. Forge is *officially* recommended; Builder has ~1.6M weekly downloads vs. Forge significantly less; both actively developed. Plan's "Forge for new projects, Builder still works" framing is correct.

2. **Is `keytar` actually deprecated, or just unmaintained?** ✅ RESOLVED. atom/node-keytar archived Dec 2022; VS Code, Joplin, Element have all moved away; `safeStorage` is the recommended replacement. Plan's "unmaintained as of 2024" framing is correct.

3. **Should Tauri 2 get its own Core page rather than Awareness A1?** ✅ RESOLVED. Awareness A1 is sufficient — user has implicitly decided on Electron; deeper Tauri info would bloat the base.

4. **Linear desktop app — Electron or native?** ✅ RESOLVED. **Confirmed Electron** per Linear's own changelog (2019-04-25 launch; 2020-03-19 multi-window improvements). CS5 remains Linear; backup picks (Obsidian / Cursor / Raycast) archived as alternates and not needed.

5. **Is the Webpack template in Electron Forge actually deprecated, or just deprioritized?** ✅ RESOLVED. **Webpack template is the *stable* default in Forge today; Vite plugin is *experimental* (v7.5+, including current 7.11.x)**. Plan framing inverted accordingly in C8 and CLAUDE.md §5.3.

6. **Should we add a Core page on "Database / local storage" patterns in Electron?** ✅ RESOLVED. **NO new page.** Cover SQLite/IndexedDB/PGLite inside C9 backend connectivity as currently planned. Adding a separate page risks bloating beyond the 30-50K target.

7. **Is the V8 sandbox / V8 memory cage section in C3 valuable for a buildable KB, or is it too low-level?** ✅ RESOLVED. **Keep as a one-paragraph mention in C3** with link to the V8 memory cage blog. Users rarely flip the fuse; mentioning once is enough.

### Still unresolved — Phase 3 agents to investigate

A. **Forge Vite plugin going to "stable"** — Is there a public timeline for removing the experimental flag from `@electron-forge/plugin-vite`? Current behavior of marking 7.5+ as experimental may persist for several minor versions; CLAUDE.md notes "experimental as of last check (date-stamp)" rather than asserting "Vite is the 2026 default."

B. **`@electron/asar` v4.1+ ASAR digest embedding rollout** — Plan mentions in passing for C5; concrete adoption story (e.g., does any first-party Electron template or builder default to enabling it?) is still unclear. Phase 3 agent should investigate during C3/C5 drafting.

C. **Mac App Store-only pages** — Should A3 (Store distribution) get a dedicated `mas`-build configuration walkthrough, or is that a build-kit template? Currently planned in Awareness only. If user actually wants MAS distribution, this is undersized.

D. **Trusted Signing / Azure Artifact Signing geographic restrictions** — As of Oct 2025, Trusted/Artifact Signing is US/Canada-only with 3+ year business history. For users in EU / elsewhere, the plan needs to recommend a fallback (DigiCert KeyLocker, Sectigo Signing Service, SSL.com eSigner). Phase 3 agent should add this nuance to C5.

E. **Performance — V8 snapshots benchmark currency** — Plan claims "Atom team got 50% reduction." This is a real claim from a 2017-era post; should be re-cited and date-stamped, or replaced with a more recent benchmark from VS Code / Slack. `https://github.com/RaisinTen/electron-snapshot-experiment` (in SOURCES) is a personal experiment, not a benchmark study.

F. **Cursor case study collision with VS Code** — Plan's CS1 (VS Code) and any Cursor mention overlap heavily (Cursor is a VS Code fork). With Linear confirmed and CS5 not needing a backup, Cursor would not be the right replacement (too redundant). Better backups if a slot opens: Obsidian (confirmed Electron, plugin ecosystem) or Discord's voice/audio engineering.

---

## 8. Phase status

- ✅ **Phase 1 (Architect)** — complete (2026-04-30)
- ✅ **Phase 2 (Validator)** — pass-with-notes (2026-04-30); 9 required + 14 suggested fixes applied by Fixer agent (2026-04-30)
- ✅ **Phase 3 (Parallel topic agents)** — complete (2026-04-30); 28 pages drafted (~81K total words)
- ✅ **Phase 4 (Final audit)** — PASS-WITH-NOTES (2026-04-30); 4 required + 9 suggested fixes; required fixes applied
- ⏳ **Phase 5 (Living document mode)** — ready; quarterly refresh of 🔁 pages (C3, C5, C7)

---

*End of plan v1 (validated, drafted, audited, fixed). Architect: Claude Opus 4.7 (1M). Validator + Fixer + Phase 3 + Final audit + Final Fixer: 2026-04-30.*
