# Decision Tree — Electron vs. Tauri vs. PWA vs. native

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

Walk this tree top-down. Start at "do you actually need a desktop app?" — most teams answering "yes" reflexively will discover a PWA covers their case. If you genuinely need a desktop binary, the order of branching is **team & priorities → perf budget → UI parity → feature requirements → backend shape → distribution → special cases**. Each branch ends in a recommended framework with cross-links into the atlas. The base's bias is **Electron as the default for JS-shop teams shipping a desktop app against a remote HTTP backend** — but Tauri 2.x, Wails, MAUI, and PWA are real alternatives, and the tree calls them out where they win. Date-stamp on all version-sensitive claims: `(as of 2026-04)`.

---

## Question 0 — Do you actually need a desktop app?

```
Need a desktop binary?
├── No, web is enough → ship a web app, optionally with a PWA install option. Done.
└── Yes → continue to Branch A
```

The honest first question. A PWA — installable from the browser, works offline, gets a dock/Start-menu icon, can request notifications and a subset of OS hooks — covers a lot of ground that used to require Electron. You give it up when you need: deep OS integration (file-system browse without a picker, custom protocols, kernel APIs, native menus and tray, native code-signed binaries for IT compliance), multi-window UX with non-trivial inter-window state, or distribution channels that demand a real installer (Mac App Store, Microsoft Store, MSI deployment to enterprise endpoints).

If you don't need any of those, **stop here**. Ship a PWA, save 80MB and the signing/notarization tax. See [PWA on the desktop | web.dev](https://web.dev/learn/pwa) and [A2 — Other web-to-desktop frameworks](../atlas/awareness/02-other-frameworks.md) for the framing.

If you genuinely need a desktop binary, continue.

---

## Branch A — your team & priorities

The team's existing stack is the single biggest predictor of which framework you'll actually ship. A "better" framework you can't staff is worse than a slightly heavier one your team writes daily.

```
Team profile?
├── JS / web only, no Rust or Go appetite ......... Electron (or Tauri w/ caveats)
├── Rust expertise + binary size matters .......... Tauri 2.x        → A1
├── Go expertise .................................. Wails            → A2
├── .NET / native-first ........................... MAUI Blazor Hybrid / WebView2 → A2
└── Native iOS/Android team, desktop secondary .... React Native / Flutter / Capacitor (Tauri 2 also viable) → A1
```

- **JS-only team**: → **Electron**. The whole stack is JS / TypeScript / Node — preload, main, renderer all use the same language. Tauri is technically possible without Rust (you can ship a Tauri app where most logic stays in JS and Rust is a thin shim), but the moment you need a custom command, plugin, or native integration, you're writing Rust. If cross-OS rendering parity matters, skip Tauri entirely — see Branch C.
- **Rust + binary size**: → **Tauri 2.x** (stable since [Oct 2024](https://v2.tauri.app/blog/tauri-20/)). ~600KB Rust core + system WebView vs. Electron's ~80MB Chromium baseline. See [A1 — Tauri 2.x vs. Electron](../atlas/awareness/01-tauri-vs-electron.md).
- **Go team**: → **Wails**. Go backend, system WebView, similar bundle-size win to Tauri without the Rust learning curve. See [A2](../atlas/awareness/02-other-frameworks.md).
- **.NET / native-first**: → **MAUI Blazor Hybrid** (cross-platform .NET + Blazor for UI) or vanilla **WebView2** (Windows-only, very thin shell). Same Microsoft toolchain you already use. See [A2](../atlas/awareness/02-other-frameworks.md).

---

## Branch B — perf & resource budget

Bundle size and RAM ceilings are the second filter. Electron has a fixed-cost floor: ~80MB compressed installer baseline, ~150-300MB RAM per renderer with a non-trivial app. If your distribution channel or user device class can't absorb that, Electron is out before you start.

```
Constraint?
├── 100 MB+ bundle OK, 200 MB+ RAM OK ............ Electron is fine
├── < 20 MB binary, < 50 MB RAM .................. Tauri or native
└── < 5 MB binary ................................. native (Win32, Cocoa, GTK) or Sciter
```

- **Generous budget**: → **Electron**. The bundled Chromium is the cost of consistent rendering and a mature debugging story. VS Code, Slack, Discord, Notion, Figma, 1Password, Linear all live here.
- **Tight budget**: → **Tauri** (system WebView, Rust core) or **native** (no WebView at all). Even a hello-world Electron app is ~80MB compressed and won't fit a "small utility" mental model.
- **Extreme tight**: → **native** or **Sciter** (HTML/CSS/JS rendered by a tiny custom engine, ~5MB). Even Tauri's overhead is too much when you need a sub-5MB binary.

The intermediate region — say, "I'd like under 20MB" with a JS team — is where the real tradeoff lives. Tauri buys you the size win at the cost of the WebView consistency tax (next branch).

---

## Branch C — UI consistency vs. OS coverage

This is the branch most teams underweight, and the one where switching from Electron later costs the most.

```
UI requirement?
├── Pixel-identical rendering across Win/Mac/Linux ..... Electron
├── Native look-feel matters more than codebase reuse .. SwiftUI / .NET / GTK (different codebases per OS)
└── "Web-y" UI is fine, OS skin is fine ................ Tauri / Wails / native WebView fine
```

- **Pixel parity**: → **Electron**. The bundled Chromium gives identical CSS rendering, identical font handling (within the OS's font shaping rules), identical DevTools, identical canvas behavior on Win/Mac/Linux. Design tools (Figma desktop), IDEs (VS Code, Cursor), and audio/video tools (Audacity, OBS-style apps) usually live here because their UI bugs are visual and a per-OS WebView delta means a per-OS bug.
- **Native look-feel**: → **separate codebases** with SwiftUI on macOS, .NET / WinUI on Windows, GTK or Qt on Linux. Maximum native polish, ~3x the engineering cost. Most teams who say they want this discover they actually wanted point 1.
- **Web-y is fine**: → **Tauri** / **Wails** / vanilla native WebView. You accept that on Linux you're rendering with WebKitGTK (which lags Chromium on a long list of features), on Windows with Edge/WebView2, on macOS with WebKit. Three different rendering contexts means three different bug surfaces. See [A1](../atlas/awareness/01-tauri-vs-electron.md) for the concrete deltas.

---

## Branch D — feature requirements

```
Special requirements?
├── Mobile (iOS/Android) on the roadmap ........... Tauri 2 (native mobile) or React Native / Flutter / Capacitor
├── OS deep integration (drivers, kernel hooks) ... native
├── WebRTC / real-time canvas / heavy WebGL/WASM .. Electron
├── WebHID / WebUSB / WebSerial .................... Electron (mature) or PWA in supported browsers
└── Background services / scheduled wake-ups ...... native (Electron can't run truly headless on mobile-style schedulers)
```

- **Mobile target**: → **Tauri 2** added native iOS / Android support in v2.0 ([Oct 2024](https://v2.tauri.app/blog/tauri-20/)). Electron has none — desktop-only by design. Alternatives: React Native, Flutter, Capacitor (mobile-first, then desktop via wrappers).
- **OS deep integration**: → **native**. Kernel modules, system extensions, drivers, custom file-system handlers (FUSE-class), low-level audio routing — none of this lives in Electron or Tauri. You'll write Swift, Objective-C, C++, Rust, or Kotlin.
- **WebRTC / real-time canvas / heavy WebGL**: → **Electron** is the safest choice. Bundled Chromium means feature parity with the desktop browser you tested in. Tauri's per-OS WebView is where WebRTC and WebGL bugs go to live (especially WebKitGTK on Linux, as of 2026-04).
- **WebHID / WebUSB / WebSerial**: → **Electron** has mature session handlers (`select-hid-device`, `select-serial-port`, `select-usb-device`, `setDevicePermissionHandler` — see [Device Access | Electron docs](https://www.electronjs.org/docs/latest/tutorial/devices)). PWAs in Chromium-based browsers can also access these APIs but with a stricter permission model and no offline distribution.

---

## Branch E — backend already on Railway / cloud HTTP API

This is the user's specific case and it deserves a dedicated branch.

```
Backend shape?
├── Existing HTTP+WS API on Railway / Render / Fly / etc. ⭐
│   └── → Electron is the fastest path. Reasons below.
├── Pure local-first / no remote backend
│   └── → tie. Tauri / Electron / Wails / native all work.
└── Backend is itself a heavy native dependency (e.g., GPU-bound model)
    └── → consider native or Tauri+Rust. Sidecar pattern is cleaner outside Electron.
```

When you already have a working HTTP / WebSocket API on Railway, **Electron is the fastest path to a shipping desktop app**. The argument:

1. **JS familiarity → faster shipping.** Same fetch / undici / WebSocket libs your backend probably uses. No FFI layer between the desktop client and the API contract — the same TypeScript types can be shared if you publish them.
2. **`net.fetch` from main process avoids CORS and picks up system proxies.** Renderer-process fetches obey browser-style CORS; main-process Node fetches don't. Electron's [`net.fetch`](https://www.electronjs.org/docs/latest/api/net) uses Chromium's network stack, which transparently handles system proxies, captive-portal redirects, and corporate-CA device certificates — see [C9 — Backend connectivity](../atlas/core/09-backend-connectivity.md).
3. **`safeStorage` for tokens.** OS-keychain-backed token storage built into Electron 15+ (Keychain on macOS, DPAPI on Windows, libsecret on Linux). No `keytar` (unmaintained as of 2024 — atom/node-keytar archived Dec 2022). See [C9](../atlas/core/09-backend-connectivity.md) and [safeStorage | Electron API](https://www.electronjs.org/docs/latest/api/safe-storage).
4. **WebSocket / SSE work in renderer or main without changes.** Whatever Railway-side WebSocket reconnect logic you already have ports directly. Reconnect-on-network-flap, auth header re-injection, exponential-backoff — all stock Node patterns.
5. **Starter scaffold exists.** → [build-kit/templates/05-railway-backend-client.md](templates/05-railway-backend-client.md) covers auth, safeStorage, WebSocket reconnect, offline cache.

**Tauri also works here**, and if your team has Rust, the binary-size win is real. The cost: you'll write the auth flow, OAuth callback handler, token storage, WebSocket reconnect, and SQLite persistence layer in Rust on the backend-client side (Tauri's command pattern), or split it across Rust + JS with FFI in the middle. For a JS-only team, that's a real tax for the binary-size win — and the binary size of an internal-tool client is rarely the constraint that wins or loses the project.

---

## Branch F — distribution

Distribution channel filters again. Most teams self-distribute via a download page; some need stores; a few need MDM-deployable installers.

```
Distribution channel?
├── Self-distribution (own download page) ....... any framework works
├── Mac App Store ............................... Electron (mas build) or Tauri or native
├── Microsoft Store ............................. Electron (MSIX) or Tauri or native
├── Linux distros (Snap / Flatpak / .deb / .rpm) Electron has the most templates; Tauri close behind
└── Enterprise MSI + MDM ........................ Electron (mature) or native
```

- **Self-distribution**: any framework. You sign + notarize on macOS, EV / OV sign on Windows (post-CA/B-Forum-2023 with HSM or cloud signing), and ship from your own page or GitHub Releases. See [C5 — Packaging & code signing](../atlas/core/05-packaging-and-signing.md).
- **Mac App Store / Microsoft Store**: both Electron and Tauri can target stores; Electron has more mature tooling. Electron has the [official Mac App Store submission guide](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide), `mas` build target, and the App Sandbox entitlement story documented. Tauri's store path exists but is less battle-tested. See [A3 — Store distribution](../atlas/awareness/03-store-distribution.md).
- **Enterprise IT-deployed**: Electron has the most material on MSI building, EV signing, SmartScreen reputation building, and surviving corporate-proxy environments (`net.fetch` again).

---

## Branch G — special cases

A handful of cultural / political constraints that don't fit the technical filters above but bite real projects.

- **Open-source, anti-bloat audience** (think Linux-native dev tools, hacker-news-front-page utilities): **Tauri** or native scores cultural points. Electron + 80MB will earn you a "still using Electron in 2026?" comment thread under any release announcement. The complaint is real even when the technical choice is correct — factor in the goodwill cost.
- **Enterprise B2B, IT-compliant**: **Electron** has more battle-tested guides (SmartScreen reputation building, MSI deployment, MDM packaging, corporate-proxy survival, certificate-pinning, audit-trail telemetry). The "Slack / 1Password / Notion all use it" social proof matters in the procurement-checklist conversation.
- **Privacy-sensitive vertical** (legal, healthcare, defense): both Electron and Tauri can hit the bar. Electron has the longer security-checklist pedigree (the [17-point official checklist](https://www.electronjs.org/docs/latest/tutorial/security), `electron-secure-defaults` from 1Password, `electronegativity` static analysis). Tauri's smaller surface area is the counter-argument.
- **Audio / video creative tools**: pick **Electron** if you're rendering canvas / WebGL / WebGPU and want to test on one Chromium build. Native Web Audio works in both, but the "does it sound the same on Win/Mac/Linux" question is a Chromium-version question for Electron and a per-OS-WebView question for Tauri.

---

## Final cheat sheet table

| Constraint | Electron | Tauri | Wails | PWA | Native |
|---|---|---|---|---|---|
| JS-only team | ✅ | ⚠️ Rust | ❌ Go | ✅ | ❌ |
| Need < 20 MB binary | ❌ | ✅ | ✅ | ✅ | ✅ |
| Cross-OS pixel parity | ✅ | ⚠️ | ⚠️ | ⚠️ | ❌ |
| Mobile target | ❌ | ✅ | ❌ | ✅ | varies |
| Railway HTTP backend ⭐ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mature ecosystem | ✅ (11+ yrs) | ⚠️ (2.0 GA Oct 2024) | ⚠️ | ✅ | ✅ |
| OS deep integration | ⚠️ via native module | ⚠️ via Rust | ⚠️ via Go | ❌ | ✅ |
| Mac App Store | ✅ (`mas` build) | ⚠️ | ⚠️ | ❌ | ✅ |
| Microsoft Store | ✅ (MSIX) | ⚠️ | ⚠️ | ❌ | ✅ |
| Anti-bloat audience | ❌ cultural | ✅ | ✅ | ✅ | ✅ |
| Enterprise B2B / MDM | ✅ | ⚠️ | ⚠️ | ❌ | ✅ |

Legend: ✅ = good fit, ⚠️ = works with caveats, ❌ = poor fit. All ratings as of 2026-04.

---

## Closing pointer

- If your answer is **Electron** → start at [build-kit/checklist.md](checklist.md) for the preflight, then [atlas/core/01-fundamentals.md](../atlas/core/01-fundamentals.md). If you have a Railway backend, jump to [build-kit/templates/05-railway-backend-client.md](templates/05-railway-backend-client.md).
- If your answer is **Tauri** → see [A1 — Tauri 2.x vs. Electron](../atlas/awareness/01-tauri-vs-electron.md) and Tauri's [own docs](https://v2.tauri.app/start/). The migration guide [Migrate from Electron to Tauri](https://v2.tauri.app/start/migrate/) is also useful as a *what's actually different* comparison.
- If your answer is **Wails / MAUI / WebView2 / native** → see [A2 — Other web-to-desktop frameworks](../atlas/awareness/02-other-frameworks.md).
- If your answer is **PWA** → [PWA on the desktop | web.dev](https://web.dev/learn/pwa). You're done with this KB.

This KB is opinionated about Electron because that's the user's case and the synthesis target — but the bias is *toward simplicity, against fashion*. If a PWA covers your case, ship a PWA. If Tauri's binary-size win is worth the Rust tax for your team, ship Tauri. The cost of carrying around 80MB of Chromium is real; the cost of writing your auth + WebSocket + SQLite layer twice (once in JS, once in Rust) is also real. This tree just makes the tradeoffs explicit.

---

## Sources

- [Electron homepage](https://www.electronjs.org/) — current stable, framework status
- [Tauri 2.0 stable release | Tauri blog](https://v2.tauri.app/blog/tauri-20/) — Oct 2024 GA, mobile support added
- [Tauri Architecture | Tauri docs](https://v2.tauri.app/concept/architecture/) — Rust core + system WebView
- [Migrate from Electron to Tauri | Tauri docs](https://v2.tauri.app/start/migrate/) — official migration framing
- [PWA on the desktop | web.dev](https://web.dev/learn/pwa) — PWA install + offline + capabilities surface
- [Web-to-desktop framework comparison | GitHub](https://github.com/Elanis/web-to-desktop-framework-comparison) — empirical benchmarks across Electron / Tauri / Wails / Neutralino
- [safeStorage | Electron API](https://www.electronjs.org/docs/latest/api/safe-storage) — OS-keychain-backed token storage
- [net | Electron API](https://www.electronjs.org/docs/latest/api/net) — main-process HTTP client (no CORS, system proxies)
- [Device Access (WebHID, WebUSB, WebSerial) | Electron docs](https://www.electronjs.org/docs/latest/tutorial/devices) — session handlers
- [Mac App Store Submission Guide | Electron docs](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)
- [Wails | GitHub](https://github.com/wailsapp/wails) — Go + system WebView
- [WebView2 | Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-edge/webview2/) — .NET / native Windows option
- [Electron vs. Tauri | DoltHub blog (Nov 2025)](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/) — supplementary; vendor-engineering perspective
