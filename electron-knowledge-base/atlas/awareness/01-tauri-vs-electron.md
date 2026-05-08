# A1. Tauri 2.x vs. Electron tradeoff

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

[Tauri 2.0](https://v2.tauri.app/blog/tauri-20/) (stable since Oct 2024, currently in the 2.10.x line as of 2026-04 per [Tauri releases](https://github.com/tauri-apps/tauri/releases)) is the most credible Electron alternative: a Rust core paired with each OS's *system* WebView (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux) instead of a bundled Chromium ([Tauri Architecture](https://v2.tauri.app/concept/architecture/)). The headline win is binary size — apps in the **2-10 MB range** versus Electron's **80-200 MB** baseline ([pkgpulse 2026 benchmark](https://www.pkgpulse.com/blog/electron-vs-tauri-2026)) — plus first-class iOS/Android targets that Electron does not have. The headline cost is per-platform WebView drift (your code runs on three different rendering engines instead of one Chromium), a younger ecosystem, and the assumption that someone on your team writes Rust. **If you are already shipping on Electron and it works, do not migrate for binary size alone.**

## When to consult this page

- You are picking the stack for a *new* desktop app and want a one-paragraph reason to stay on Electron — or to leave.
- A stakeholder asks "why aren't we on Tauri?" and you need the honest tradeoff list, not the marketing one.
- You are about to add iOS/Android to a desktop product and Electron has no story there ([build-kit/decision-tree.md](../../build-kit/decision-tree.md)).
- A binary-size or RAM regression is hurting you — read this *and* [C10 Performance & observability](../core/10-performance-and-observability.md) before reaching for Tauri.

## When to ignore (you've already chosen Electron)

- Your team is JS/TS-only, you reuse Node modules heavily, and you ship to all three desktop OSes today. The migration cost is real and the per-OS WebView debt is a permanent tax.
- You need *guaranteed identical rendering* across platforms (e.g., a design tool, a Markdown previewer with rich CSS). Electron ships one Chromium; Tauri does not.
- You are within ~3 months of a ship date. Tauri's [Migrate from Electron guide](https://v2.tauri.app/start/migrate/) is honest about this — it is *architectural*, not a codemod.

If any of those apply, close this page and go to [C1 Fundamentals](../core/01-fundamentals.md).

## Anatomy

### What Tauri actually is

A binary structure: **Rust host process** (your "main" equivalent, with file system / native API access) + **system WebView** rendering your HTML/CSS/JS frontend. The frontend is framework-agnostic — React, Vue, Svelte, Solid, vanilla all work, same as Electron ([What is Tauri?](https://v2.tauri.app/start/)). The Rust↔JS bridge is the `invoke` API: JS calls a named Rust *command*, gets a `Promise` back. That is the entire surface area you must learn, versus Electron's `contextBridge` + `ipcMain.handle` + `ipcRenderer.invoke` triple.

What Tauri 2.0 changed vs. v1: stable mobile (iOS, Android) targets sharing the same UI codebase, an overhauled plugin architecture (most v1 built-ins are now official plugins), a permissions/capabilities system replacing the old `allowlist`, and HMR extending to mobile devices and emulators ([Tauri 2.0 release blog](https://v2.tauri.app/blog/tauri-20/)).

### What changes vs. Electron — the matrix

| Dimension | Electron 41 (2026-04) | Tauri 2.10.x (2026-04) | Notes |
|---|---|---|---|
| Bundle size | 80-200 MB (ships Chromium + Node) | **2-10 MB** | ~25x smaller binaries on disk; `(as of 2026-04)` per [pkgpulse](https://www.pkgpulse.com/blog/electron-vs-tauri-2026). Directional, not benchmark-precise. |
| Idle RAM (simple app) | ~120-300 MB | ~30-50 MB | 30-50% lower for *simple* apps; varies wildly with content ([gethopp](https://www.gethopp.app/blog/tauri-vs-electron)). The [Tauri issue #5889](https://github.com/tauri-apps/tauri/issues/5889) acknowledges measurement caveats. |
| Cold start | ~1-2 s | ~0.4-0.6 s | ~3-4x faster boot for trivial apps; `(as of 2026-04)`. Benchmarks are workload-sensitive. |
| Renderer | One bundled Chromium across all OSes | **WKWebView (mac) / WebView2 / WebKitGTK** | This is the decisive tradeoff. WebKitGTK has the worst track record for parity bugs. |
| Backend language | JS / TS (Node) + native modules | **Rust** (TS allowed for some plumbing, but commands are Rust) | If nobody on the team writes Rust, Tauri is a hidden hire. |
| Mobile (iOS / Android) | None — use Capacitor or React Native instead | **Yes (stable in 2.0+)** | The single biggest unique-to-Tauri feature in v2. |
| API surface | All of Node + most of Chromium APIs | Opinionated: explicit commands + permissions | Tauri is *less* powerful by design; Electron exposes ~everything. |
| Plugin maturity | 11+ years, npm ecosystem | 5 years; `notification`, `fs`, `store`, `sql`, `http`, `shell`, etc. as official v2 plugins ([Tauri releases](https://v2.tauri.app/release/)) | Tauri's catalog is smaller but the official plugins cover ~80% of common needs. |
| Auto-update | `electron-updater` / `autoUpdater` ([C7](../core/07-auto-update.md)) | Tauri Updater plugin (signed updates baked in) | Both work; Tauri's is more opinionated. |
| Security defaults | Strong but you must opt in ([C3](../core/03-security.md)) | Capability/permissions-based by default | Tauri's smaller default attack surface is real; Electron requires discipline. |

### Rendering inconsistency — the under-discussed cost

Electron solves "it works on my machine" by shipping the same Chromium everywhere. Tauri trades that uniformity for size: your CSS animation might jitter on WebKitGTK, your `Intl` formatting might differ on WKWebView, your fetch behavior might surprise you on WebView2. You will write per-platform shims. Teams that have ported between Tauri targets describe this as the *real* tax — not the Rust learning curve, the WebView matrix ([gethopp's writeup](https://www.gethopp.app/blog/tauri-vs-electron)).

For a heavily-styled product (think Notion, Figma, Linear), this is a reason to stay on Electron. For a "shell around a backend dashboard" type product, the variance is tolerable.

### Tauri's "Migrate from Electron" guide — what it actually is

The official [Migrate from Electron](https://v2.tauri.app/start/migrate/) doc exists, and it is honest: there is **no automated converter**. The frontend (React / Vue / etc.) ports cleanly. Everything else — IPC channels, native modules, auto-update, build tooling, signing pipelines, deep links — is a rewrite against Tauri's Rust-side equivalents. Plan it as an *architectural rebuild* on the same UI, not a port.

### Hybrid options — Electron + Rust via napi-rs

If the appeal is "Rust performance for the hot path" rather than "smaller binaries," you can keep Electron and call into Rust through [napi-rs](https://napi.rs/) — what 1Password did for its crypto core ([CS4 1Password](../case-studies/04-1password.md)). You get the Rust perf wins without changing UI stacks, signing, packaging, auto-update, or the security model. See [C4 Native integrations](../core/04-native-integrations.md#native-modules) for the pattern.

This is often the right answer for an existing Electron team that envies one specific Tauri property (CPU-bound speed) without wanting the whole rewrite.

### Decision matrix

| Pick **Electron** if... | Pick **Tauri** if... |
|---|---|
| Team is JS/TS-only | Team has at least one Rust engineer |
| You reuse Node ecosystem (DB drivers, native modules) | You are starting fresh |
| Identical rendering across OSes is a product requirement | Per-platform browser-quirk testing is acceptable |
| You ship desktop only | iOS / Android is on the roadmap |
| You're already shipping and it works | Bundle size or RAM is a measurable user complaint |
| You need the broader plugin/community surface | Official Tauri plugins cover what you need |

### What to AVOID conflating

- **"Tauri is just a smaller Electron"** — no. It is a different stack with a different runtime, different security model, different APIs, and a Rust learning curve. Treat it as a peer technology, not a drop-in.
- **"Tauri = free binary-size win"** — only if you have not shipped yet. For an existing Electron app the migration cost dwarfs almost any binary-size benefit.
- **"WebKitGTK is fine, it's just WebKit"** — it is *a* WebKit, but lags Safari significantly and has its own bug catalog. Plan testing accordingly.
- **"Tauri has no Node, so it's automatically more secure"** — Tauri's default surface is smaller, but a misconfigured `fs` plugin scope or wide-open `shell` permission is just as dangerous as a broken `contextIsolation`. Both stacks reward discipline.

### Recent Tauri ecosystem (as of 2026-04)

- Stable line is **2.10.x** ([Tauri releases](https://github.com/tauri-apps/tauri/releases)). Mobile targets (iOS, Android) are stable since 2.0 (Oct 2024).
- Official v2 plugins live at [v2.tauri.app/release](https://v2.tauri.app/release/): `notification`, `fs`, `store`, `sql`, `http`, `shell`, `clipboard-manager`, `dialog`, `os`, `process`, `updater`, `window-state`, plus mobile-specific plugins (NFC, Barcode Scanner, Biometric, Haptics, Geolocation) contributed by partners.
- Updater plugin produces signed deltas; signing keys are mandatory by default — closer to Electron's `autoUpdater` posture than to ad-hoc download-and-replace patterns.
- Tauri's permissions/capabilities system replaced v1's `allowlist`; expect to write capability files, not edit `tauri.conf.json` flags.

## Cross-links

- [A2 Other web-to-desktop frameworks](02-other-frameworks.md) — Wails, Neutralino, WebView2-only, PWA
- [build-kit/decision-tree.md](../../build-kit/decision-tree.md) — full Electron vs. Tauri vs. PWA vs. native flowchart
- [CS4 1Password](../case-studies/04-1password.md) — the canonical "Electron + Rust core via napi-rs" hybrid
- [C4 Native integrations](../core/04-native-integrations.md) — napi-rs pattern for staying on Electron while gaining Rust perf
- [C1 Fundamentals](../core/01-fundamentals.md) — what Electron actually is, for the reverse direction

## Sources

- [Tauri 2.0 Stable Release | Tauri blog](https://v2.tauri.app/blog/tauri-20/) — Oct 2024 stable, mobile, plugin architecture
- [Tauri Architecture | Tauri docs](https://v2.tauri.app/concept/architecture/) — Rust core + system WebView
- [What is Tauri? | Tauri docs](https://v2.tauri.app/start/) — framework-agnostic frontend
- [Migrate from Electron to Tauri | Tauri docs](https://v2.tauri.app/start/migrate/) — official migration guidance, no automated tool
- [Tauri Core Ecosystem Releases | Tauri](https://v2.tauri.app/release/) — current 2.10.x line, plugin matrix `(as of 2026-04)`
- [Releases · tauri-apps/tauri | GitHub](https://github.com/tauri-apps/tauri/releases) — version source of truth
- [Tauri vs. Electron — performance, bundle size, real trade-offs | gethopp](https://www.gethopp.app/blog/tauri-vs-electron) — directional benchmarks, WebView-drift discussion
- [Electron vs Tauri in 2026 | pkgpulse](https://www.pkgpulse.com/blog/electron-vs-tauri-2026) — bundle/RAM directional numbers `(as of 2026-04)`
- [Tauri RAM measurement caveats | Issue #5889](https://github.com/tauri-apps/tauri/issues/5889) — official acknowledgment that simple memory comparisons mislead
- [napi-rs](https://napi.rs/) — the hybrid path: stay on Electron, add Rust via N-API
