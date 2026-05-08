# A2. Other web-to-desktop frameworks — Wails, Neutralino, WebView2, PWA

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

Beyond Electron and Tauri (covered in [A1 Tauri vs Electron](01-tauri-vs-electron.md)), at least seven other web-to-desktop options exist. Most are niche tools — they shine for a specific language preference, a Windows-only deployment, an embedded native shell, or a "this is really just a website" app. **For most readers building a generic cross-platform desktop app with a JS team and a Railway backend, Electron remains the default.** This page is a map of the alternatives so you can recognize when one of them is actually the better fit.

## When to scan this page

- You already know Electron is "fine" but want a sanity check that nothing else fits your niche better.
- You have a non-JS team (Go, Rust, .NET) and the team's language is the gravity well.
- You're shipping Windows-only and don't want to bundle 80MB of Chromium per install.
- The "desktop app" is one feature away from being a regular PWA.

## When NOT to use this page

- You are deciding Electron vs. Tauri specifically — go to [A1 Tauri vs Electron](01-tauri-vs-electron.md).
- You want a build recommendation — go to [build-kit/decision-tree.md](../../build-kit/decision-tree.md).
- You want deep coverage of any single framework here — this page is *survey only*. Each framework's home docs are linked.

## Anatomy — the seven alternatives

### Wails — Go core + system WebView

Wails lets a Go backend drive a system WebView (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux), with bidirectional method binding between Go and the JS frontend ([wails.io](https://wails.io/)). Architecturally it is the Go-flavoured cousin of Tauri — same "rust-the-OS-webview, ship a small binary" pattern, different language for the native side. Wails v2 is the current stable line; **Wails v3 is alpha as of 2026-04** with a "reasonably stable API, applications running in production," nightly builds, and active development on documentation and tooling before final release ([v3alpha.wails.io status](https://v3alpha.wails.io/status/)).

**Niche over Electron**: your team writes Go and wants their domain logic in Go rather than Node, *and* you can absorb the cross-WebView inconsistency tax (especially WebKitGTK on Linux). If your team is already JS-heavy, Wails buys you nothing over Electron or Tauri.

### Neutralino.js — lightweight, no Node, system WebView

Neutralino.js bundles a small native runtime (~6MB binaries) that hosts a system WebView and exposes a JS API for files, OS, storage, and processes — but **no embedded Node.js** ([neutralino.js.org](https://neutralino.js.org/)). The frontend is a static HTML/JS/CSS bundle; the runtime is "just enough OS" for desktop integration. Actively maintained: the JS client library and core framework both received updates on 2026-04-19, and `@neutralinojs/lib` 6.5.0 is current `(as of 2026-04)` ([neutralino.js releases](https://github.com/neutralinojs/neutralino.js/releases)).

**Niche over Electron**: tiny installers, you don't need npm packages at runtime, and your "app" is essentially a JS frontend that wants minor OS access (file dialogs, notifications, simple storage). Compared to Electron, you trade away the Node ecosystem and Chromium consistency for a footprint that is one to two orders of magnitude smaller.

### WebView2 — Microsoft's Chromium Edge, Windows-only

WebView2 is a Microsoft control that embeds the Chromium-based Edge runtime into a host process (Win32, WPF, WinForms, WinUI 3, .NET MAUI, even MFC) ([Microsoft Learn — WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/)). On Windows 11 the runtime ships with the OS; on Windows 10 it's a small evergreen redistributable. There is no Mac/Linux story — that's the point.

**Niche over Electron**: you are shipping **Windows-only**, you already have a native shell (.NET, WPF, WinUI), and you want to embed web UI inside it rather than carry a second Chromium copy. Examples: Office, Teams classic, and many Microsoft-internal apps use WebView2. Don't pick this for a fresh cross-platform consumer app.

### WKWebView (macOS / iOS) and WebKitGTK (Linux) — native system WebViews

These are the OS-provided web engines that Tauri / Wails / Neutralino sit on top of. On macOS, **WKWebView** is the supported embedded browser (`WKWebView` class in WebKit, `import WebKit`) and ships with every Mac. On Linux, **WebKitGTK** is the GTK-integrated build of WebKit that distributions package. You usually don't pick these directly unless you're writing the native shell yourself.

**Niche over Electron**: you're writing a native macOS app (Swift / AppKit / SwiftUI) or a native GTK app and you want to embed a small web pane (a help viewer, an OAuth popup, a settings view rendered from web tech) inside an otherwise native UI. Don't try to build a whole cross-platform desktop product on raw WKWebView — you'll re-invent the platform abstractions Tauri / Wails already solved.

### PWA + browser install — "the desktop app you don't ship"

A Progressive Web App is a regular website that browsers can "install" as a standalone window with its own icon, separate process group, and OS integration ([web.dev — Progressive Web Apps](https://web.dev/explore/progressive-web-apps)). Modern browsers expose increasingly desktop-like capabilities to PWAs: notifications, service-worker offline, the File System Access API, badging, file handling, protocol handling, and window controls overlay. Chrome, Edge, Brave, and Arc support installs out of the box; Safari ships a more limited PWA on macOS Sonoma+; Firefox does not officially install PWAs on desktop (extensions exist).

**Niche over Electron**: your "desktop app" doesn't actually need any of the things Electron uniquely gives you (Node modules, native deep OS access, IPC patterns, custom window chrome, code-signed installer flow). It's really a logged-in web app that users want as a window with an icon. PWA gets you that for $0 of build infrastructure and zero auto-update code — the browser updates the page. Limits: corporate environments often block "install this site"; macOS PWAs are weaker than on Windows; you cannot bundle Node modules or call OS APIs Chromium hasn't exposed.

### NW.js — the Electron predecessor

NW.js (formerly "node-webkit") is the original Chromium+Node bundling framework, started at Intel in 2011 ([nwjs.io](https://nwjs.io/)). Architecturally similar to Electron but with one fundamental difference: NW.js exposes Node *directly inside the renderer's DOM context*, instead of Electron's main/preload/renderer split. **Still actively maintained** — v0.111.0 shipped 2026-04-23 on Chromium 148 / Node.js 25.8.2 `(as of 2026-04)` ([NW.js downloads](https://nwjs.io/downloads/)), but the community is much smaller than Electron's, with a thinner ecosystem of tools, packagers, and documentation.

**Niche over Electron**: legacy NW.js codebases (don't migrate without reason); apps that genuinely benefit from Node-in-the-renderer (rare and a security anti-pattern by today's standards — Electron deliberately abandoned that model). For new projects in 2026, **prefer Electron** unless you have a specific NW.js feature requirement.

### Sciter — HTML/CSS/JS with a custom engine

Sciter is a tiny (~5MB) HTML/CSS/Script engine that is **not** Chromium — it's a from-scratch engine with its own CSS support and a JS-flavoured "Script" language ([sciter.com](https://sciter.com/)). Notable production users: Norton, Bitdefender, ESET (security UIs that need a tiny footprint and tight control). Sciter is commercial / dual-licensed for redistribution.

**Niche over Electron**: extreme footprint sensitivity (ship an installer in single-digit MB), embedded into an existing native binary, and you control the design system tightly enough that "almost-CSS" is acceptable. **Not** a drop-in for a React/Vue app — Sciter doesn't run modern web frontends without porting.

### Hybrid native shells — Swift+WKWebView, Kotlin+WebView, .NET MAUI Blazor

When the team is already a native shop (iOS/macOS, Android, .NET) and just wants *a* slice of web UI inside the native chrome, the right answer is usually the platform's native WebView control:

- **macOS / iOS**: `WKWebView` inside Swift/AppKit/SwiftUI.
- **Android**: `WebView` inside Kotlin/Compose (and JetBrains' Compose Multiplatform now does desktop too).
- **.NET cross-platform**: **.NET MAUI Blazor Hybrid**, which embeds a Blazor renderer inside a MAUI-managed WebView2/WKWebView per platform ([Microsoft Learn — Blazor Hybrid](https://learn.microsoft.com/en-us/aspnet/core/blazor/hybrid/)).

**Niche over Electron**: the team's existing native skills are the bigger asset than the JS ecosystem reuse Electron offers, and the web portion is a small fraction of the app rather than its core. Don't reach for Electron just because you want to render some HTML inside a native app.

## Comparison table

| Framework | Core lang | Render engine | OS coverage | License | When to consider |
|---|---|---|---|---|---|
| **Electron** | JS (Node) | Bundled Chromium | Win / macOS / Linux | MIT | JS team, consistent rendering, deep Node ecosystem reuse — the default |
| **Tauri 2** | Rust | System WebView (WebView2 / WKWebView / WebKitGTK) | Win / macOS / Linux + iOS / Android | MIT / Apache-2.0 | Rust team, small binaries, mobile target — see [A1](01-tauri-vs-electron.md) |
| **Wails** | Go | System WebView | Win / macOS / Linux | MIT | Go team wants Go domain logic; v3 alpha `(as of 2026-04)` |
| **Neutralino.js** | C++ runtime, JS app | System WebView | Win / macOS / Linux | MIT | Tiny installers, JS-only frontend, minor OS access |
| **WebView2** | .NET / C++ / native shell | Chromium Edge | Windows-only | Free runtime; permissive | Windows-only, embedded into existing native shell |
| **WKWebView / WebKitGTK** | Swift / Obj-C / GTK | System WebKit | macOS+iOS / Linux | OS-provided | Native shell embedding a web pane |
| **PWA** | JS | The user's browser | Anywhere a browser runs | n/a | The "app" is really a web app; users install via Chrome/Edge/Safari |
| **NW.js** | JS (Node) | Bundled Chromium | Win / macOS / Linux | MIT | Legacy codebases; new projects: prefer Electron `(as of 2026-04)` |
| **Sciter** | Native + Script | Custom HTML/CSS engine | Win / macOS / Linux | Commercial / dual | Extreme footprint sensitivity, tight design control |
| **Hybrid native** (MAUI Blazor / Swift+WKWebView / Kotlin+WebView) | .NET / Swift / Kotlin | Per-platform WebView | Per-platform | Various | Team is native-first, web pane is a small slice of the app |

## Decision pointer

Most readers, after [A1 Tauri vs Electron](01-tauri-vs-electron.md) and this page, will still pick Electron — and that's correct for the typical "JS team, cross-platform desktop, remote backend" profile this knowledge base targets. The frameworks above exist for specific niches:

1. **Different core language** → Wails (Go), Tauri (Rust), MAUI (.NET).
2. **Tiny installer above all else** → Neutralino, Sciter.
3. **Windows-only with existing native shell** → WebView2 directly.
4. **Native app with a web pane** → WKWebView / WebKitGTK / Android WebView.
5. **It's really just a website** → PWA.
6. **Legacy codebase** → NW.js (don't start there).

Frame these as *"things that exist and might be the right tool for X niche,"* not as recommendations. If your project doesn't match one of those niches, route through [build-kit/decision-tree.md](../../build-kit/decision-tree.md) and you'll likely land on Electron.

## Cross-links

- [A1 Tauri vs Electron](01-tauri-vs-electron.md) — the most-asked alternative gets its own page.
- [build-kit/decision-tree.md](../../build-kit/decision-tree.md) — Electron vs. Tauri vs. PWA vs. native, with a Railway-backend branch.
- [C1 Fundamentals](../core/01-fundamentals.md) — what Electron is, when it's the right tool.
- [A3 Store distribution](03-store-distribution.md) — Mac App Store and Microsoft Store specifics; PWA install paths overlap with these.

## Sources

- [Wails homepage](https://wails.io/) — Wails v2 stable line, Go + system WebView pattern.
- [Wails v3 alpha status / roadmap](https://v3alpha.wails.io/status/) — "reasonably stable API, applications running in production" `(as of 2026-04)`.
- [Wails GitHub releases](https://github.com/wailsapp/wails/releases) — active maintenance through 2026.
- [Neutralino.js homepage](https://neutralino.js.org/) — lightweight, system WebView, no Node.
- [Neutralino.js GitHub releases](https://github.com/neutralinojs/neutralino.js/releases) — `@neutralinojs/lib` 6.5.0, active updates `(as of 2026-04)`.
- [Microsoft Learn — WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/) — Chromium Edge embedded control for Windows host apps.
- [Microsoft Learn — Blazor Hybrid](https://learn.microsoft.com/en-us/aspnet/core/blazor/hybrid/) — .NET MAUI Blazor, web UI inside a MAUI WebView.
- [web.dev — Progressive Web Apps](https://web.dev/explore/progressive-web-apps) — PWA capabilities, install paths, service-worker patterns.
- [NW.js homepage](https://nwjs.io/) — formerly node-webkit; v0.111.0 on Chromium 148 / Node 25.8.2 `(as of 2026-04)`.
- [NW.js GitHub](https://github.com/nwjs/nw.js/) — actively maintained, smaller community than Electron.
- [Sciter homepage](https://sciter.com/) — custom HTML/CSS/Script engine, ~5MB footprint, used in Norton / Bitdefender / ESET.
- [Web-to-desktop framework comparison](https://github.com/Elanis/web-to-desktop-framework-comparison) — empirical benchmark across multiple frameworks.

---

*Awareness page; surveys the landscape, does not recommend. For Electron-specific decisions, go to [build-kit/decision-tree.md](../../build-kit/decision-tree.md).*
