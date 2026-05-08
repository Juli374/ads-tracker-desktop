# CS4. 1Password 8 — Rust core + Electron UI, electron-secure-defaults

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

1Password 8 (2021-2022) is the canonical hybrid **Rust core + Electron UI** desktop app, and a deliberate **counter-narrative** to the popular "everyone is migrating *away* from Electron" story. 1Password 7 was a constellation of platform-native clients (SwiftUI on macOS, separate Windows/Android codebases). With 8, the team consolidated to a **single shared Rust backend** plus a **single Electron UI** for macOS, Windows, and Linux — they migrated *toward* Electron, not away from it. They also open-sourced two security primitives — [`electron-secure-defaults`](https://github.com/1Password/electron-secure-defaults) and [`electron-hardener`](https://github.com/1Password/electron-hardener) — which are now reference points for the wider Electron community. (As of 2026-04.)

## When to apply this case study

- You're considering "Electron-bad / native-good" as a default and want a counter-data-point.
- You need a productionized template for **JS UI + Rust core** and aren't sure if it's actually viable at scale.
- You're picking between Tauri (Rust + system webview) and Electron, and "I want Rust for the security-critical core" is your reason for considering Tauri — 1Password shows you can have the Rust core *with* Electron.
- You need authoritative starter code or hardening tools for an Electron security review.

## When NOT to apply

- Your app is a thin web-shell (Slack, Notion, Figma archetype). The Rust-core complexity is unjustified — see [CS2 Slack & Discord](./02-slack-discord.md) and [CS3 Notion & Figma](./03-notion-figma.md).
- You don't have crypto, sync, or a security-sensitive data layer that benefits from Rust's memory-safety guarantees. Plain Node + TypeScript in main process is cheaper and good enough for most apps.
- Your team has zero Rust experience and a tight ship deadline. The FFI layer plus dual-toolchain CI is a nontrivial up-front cost.

## Migration story — correcting the myth

The popular narrative around 1Password 8 is "1Password abandoned native Mac for Electron and got dragged for it." That's directionally true but obscures the architectural point: **they didn't migrate from native to Electron, they migrated from N siloed implementations to one Rust core + one Electron UI.**

### What 1Password 7 actually was

1Password 7 was a set of platform-specific clients with shared *protocol* but no shared *code*: a SwiftUI-flavoured native macOS app, a separate native Windows app, native Android (Java/Kotlin), and SwiftUI on iOS. As 1Password's CEO put it in their own retrospective, when they introduced the hosted 1Password.com service, "we rebuilt the APIs separately for each platform" — eventually framing the situation as "this is ridiculous. Can we do better?" ([1Password 8: The Story So Far](https://1password.com/blog/1password-8-the-story-so-far), Aug 2021). Each platform team had to re-implement crypto, sync, vault parsing, and server communication, and they drifted apart in subtle ways.

### What 1Password 8 became

In 2021-2022, 1Password rolled out a unified architecture across desktop platforms:

- **Linux** — Electron UI on a Rust core (this was the *first* shipped target, in 2021 — Linux had no prior native client to lose).
- **Windows** — migrated from the native Windows client to Electron + Rust core.
- **macOS** — migrated from the SwiftUI-native client to Electron + Rust core, "covering all supported Mac operating systems" with one binary.
- **iOS** — kept SwiftUI on top of the same Rust core (FFI'd in via TypeShare-generated Swift types, see below).
- **Android** — kept native Android View framework on top of the Rust core.

The macOS migration is what triggered the visible backlash, but Windows users got the same architecture with much less drama (the prior native Windows client was already ~70% Rust per [Serokell's interview with Michael Fey](https://serokell.io/blog/rust-in-production-1password), so Windows users were partway there architecturally and never had a "loss of native feel" benchmark to grieve). (As of 2026-04.)

### Why migrate toward Electron at all

The official rationale ([1Password blog, 2021](https://1password.com/blog/1password-8-the-story-so-far)) names three drivers:

1. **Code reuse** — one Rust core for crypto, vault, sync, server protocol; one Electron UI for desktop. Shipping a feature once instead of three to four times.
2. **Consistency of UX** — keyboard shortcuts, theming, accessibility, and feature parity across OSes. Users on multiple devices stop noticing platform-specific quirks.
3. **Security via memory safety** — moving the cryptographic and data-layer code from Objective-C/Swift/C# to Rust gave the team compile-time guarantees against a class of memory-corruption bugs that are catastrophic in a password manager. Rust's borrow checker plus the `Ring` crypto crate became the trusted core.

### The backlash and the response

Mac power users who had grown up with the SwiftUI-native 1Password 7 protested the change loudly — the Hacker News thread and contemporary commentary (e.g. [Six Colors, Aug 2021](https://sixcolors.com/post/2021/08/not-important-enough-1password-abandons-its-native-mac-app/)) were uniformly negative on the "feel." 1Password's response was to invest in Electron polish rather than retreat:

- Native-style menu bar (real `Menu` / `MenuItem` constructs via Electron's `Menu` API, not in-window menus).
- Touch ID / Apple Watch / Windows Hello / Linux PAM unlock via FFI from the Rust core through Electron's main process — biometrics call into platform APIs (Touch ID, Face ID, Windows Hello) via Rust-side integrations, surfaced to the renderer via the typed FFI bridge ([Serokell, 2022](https://serokell.io/blog/rust-in-production-1password)).
- System tray, drag-and-drop, OS-keychain integration where appropriate.
- Quick Access (the in-app launcher, opened with a keyboard shortcut even when the main window is closed) — built as a separate `BrowserWindow` with Electron lifecycle hooks.

The result is widely considered the highest-fidelity "doesn't feel like Electron" Electron app outside of VS Code. Native polish is achievable in Electron, but it is *effort*.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      1Password 8 desktop                       │
│                                                                │
│  ┌─────────────────────┐        ┌──────────────────────────┐   │
│  │   Renderer (React)  │  IPC   │     Main process (TS)    │   │
│  │   - Vault list      │ ─────> │  - Window mgmt           │   │
│  │   - Search          │ <───── │  - Quick Access window   │   │
│  │   - Item editor     │        │  - System tray, menus    │   │
│  └─────────────────────┘        │  - OS-keychain via Rust  │   │
│                                 └─────────┬────────────────┘   │
│                                           │ Neon (N-API FFI)   │
│                                  ┌────────▼─────────────────┐  │
│                                  │   Rust core (1Password   │  │
│                                  │     "Brain" / Core)      │  │
│                                  │   - SRP-K auth           │  │
│                                  │   - AES-GCM crypto (Ring)│  │
│                                  │   - Vault DB (SQLite)    │  │
│                                  │   - Sync (Tokio/Reqwest) │  │
│                                  │   - WebSocket realtime   │  │
│                                  │   - Biometric FFI        │  │
│                                  └──────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Browser extension <─── local socket / native msging ────┘  │
│  │ (Chrome/Firefox/Safari) — also calls the same Rust Brain   │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Rust core

All crypto, vault data, and server-sync logic lives in Rust. The dependency stack is well-documented: **Tokio** for async, **Hyper / Reqwest** for HTTP, **Ring** for cryptography, **SQLite** for the local vault, and **Neon** to expose the Rust crate as a Node-loadable native module ([Serokell, 2022](https://serokell.io/blog/rust-in-production-1password); [Dave Teare on 1Password for Linux](https://dteare.medium.com/behind-the-scenes-of-1password-for-linux-d59b19143a23), 2021).

Compiled to a `.node` (N-API) addon, the Rust core is loaded into Electron's main process and called from TypeScript. Note: 1Password chose **Neon** specifically; Neon and `napi-rs` are the two mainstream Rust→Node FFI bindings on N-API today (as of 2026-04 — see [napi-rs.com](https://napi.rs/)). Neon predates `napi-rs` and is closer to a hand-rolled binding API; `napi-rs` leans more on derive-macros. Either works; 1Password picked Neon and stuck with it. See [C4 Native integrations](../core/04-native-integrations.md) for the general Rust-via-N-API pattern.

### TypeShare — types across the FFI

The biggest practical pain of multi-language FFI is keeping struct definitions synchronized between Rust and the languages calling it. 1Password built **TypeShare** — a procedural macro that generates equivalent type definitions in Swift, Kotlin, and TypeScript from Rust types ([Serokell, 2022](https://serokell.io/blog/rust-in-production-1password)). Quoting Michael Fey: "our client-side devs can continue to work in their language of choice while interacting with the Rust library and can be free from the concerns of JSON parsing over the foreign function interface." TypeShare was later open-sourced; it's now maintained at [github.com/1Password/typeshare](https://github.com/1Password/typeshare). (As of 2026-04.)

### Electron UI

The renderer is a React app. The main process is a relatively thin TypeScript orchestration layer that owns windows, the tray, the menu bar, and the bridge to the Rust core. Application logic — anything that touches a vault, a key, or the network — flows through the Rust core, never through Node-native crypto.

### System keychain integration

Touch ID on macOS, Windows Hello on Windows, Apple Watch unlock, and Linux PAM all flow through the Rust core's biometric module, which calls platform APIs via FFI and gates an in-memory unlock decision back to the UI ([Serokell, 2022](https://serokell.io/blog/rust-in-production-1password)). This keeps the "what is the user authorized to see right now" decision out of JavaScript.

### Browser extension integration

The 1Password browser extension talks to the desktop app over a local socket / native messaging channel. The browser extension's autofill engine — historically called **1Password Brain** — was itself ported from Go to Rust in 2019 (per [Serokell, 2022](https://serokell.io/blog/rust-in-production-1password)) and shares code with the desktop core. Hooking up the extension is what gave 1Password the architecturally-clean "the desktop app is the source of truth; the extension is a thin client" model that competitors with bundled-in-browser-only architectures can't easily match.

## Open-source contributions

1Password didn't just ship 1Password 8 — they extracted security primitives from it and open-sourced them. Two are worth knowing:

### `electron-secure-defaults`

[`github.com/1Password/electron-secure-defaults`](https://github.com/1Password/electron-secure-defaults) is a starter Electron+TypeScript app that ships with hardened defaults out of the box ([repo README, as of 2026-04](https://github.com/1Password/electron-secure-defaults/blob/main/README.md)):

- **Restrictive CSP** in the session HTTP header.
- **`contextIsolation: true`** with a tiny, deliberately minimal contextBridge surface.
- **`sandbox: true`** globally and per `BrowserWindow`.
- **`webview` tag creation blocked** in the main process (`will-attach-webview` denial).
- **Session cache disabled** to prevent automatic network resource caching.
- **[Electronegativity](https://github.com/doyensec/electronegativity) integration** — `npm run electronegativity` runs Doyensec's static analyzer over the codebase.

It's referenced from the official Electron security docs as one of the example hardened starter kits, and it's one of the few security-conscious starters that 1Password actually maintains in lockstep with their production app — they use this same configuration "in conjunction with electron-hardener to provide a secure frontend foundation for the 1Password desktop app" (per the repo README).

### `electron-hardener`

[`github.com/1Password/electron-hardener`](https://github.com/1Password/electron-hardener) is a **Rust** library and CLI (latest v0.2.2 as of 2026-04, dual-licensed Apache 2.0 / MIT) that hardens already-packaged Electron binaries. It does two things:

1. **Fuse management** — view and modify Electron Fuses on a packaged app, similar to Electron's official `@electron/fuses` package (see [C3 Security](../core/03-security.md#fuses) for what fuses are).
2. **Evil-feature patching** — disables a specific list of dangerous Electron command-line flags inside the binary, so an attacker who can launch your packaged app can't pass `--inspect`, `--remote-debugging-port`, etc. to escalate. This is a fast Rust reimplementation of Dimitri Witkowski's `electron-evil-feature-patcher`.

`electron-hardener` is "tested on a minimum version of Electron 15" per its README — not unique to 1Password's deployment. It's a community-useful tool that sits *next to* `@electron/fuses` rather than replacing it.

The two repos taken together — a secure starter + a Rust binary-hardening tool — are a reasonable signal of an engineering team that takes Electron security seriously. They're cited from [C3 Security](../core/03-security.md) as canonical hardening references.

## Take-aways

1. **Hybrid Electron + Rust is real and productionized.** You don't have to pick "Electron *xor* Tauri." You can have a JS UI + a native (Rust, C++, Go) core today, in production, at the scale of a password manager trusted by millions. The pattern is well-trodden — see [C4 Native integrations](../core/04-native-integrations.md#native-modules) for the general N-API recipe.
2. **The migration direction is *toward* Electron, not away from it.** When you hear "company X migrated to Tauri" or "everyone's leaving Electron," remember that 1Password — a security-paranoid, performance-sensitive, native-feel-loving customer base — went the other way and stayed there.
3. **Native polish is achievable in Electron, but it is effort.** Real menus, real tray, real biometric unlock, Quick Access windows, keyboard-first interactions — none of it is free. 1Password invested in the polish; not every Electron app does, which is why "feels like a web page" is often a fair criticism but doesn't have to be.
4. **Open-sourcing security primitives is a reasonable trust signal.** `electron-secure-defaults` and `electron-hardener` are *not* marketing artefacts — they're consumed in production by the same team that publishes them, and they're maintained alongside Electron releases.
5. **TypeShare is the unsung hero of cross-language teams.** If you're staring at a multi-language FFI and wondering how to keep types in sync, you don't have to invent it from scratch — [`1Password/typeshare`](https://github.com/1Password/typeshare) is a working open-source answer.

## Cross-links

- [C3 Security](../core/03-security.md) — `electron-secure-defaults` and `electron-hardener` are referenced from the canonical security checklist as community hardening tools.
- [C4 Native integrations](../core/04-native-integrations.md) — Rust via Neon / `napi-rs` (the general pattern that 1Password's Rust core is one instance of).
- [A1 Tauri vs. Electron](../awareness/01-tauri-vs-electron.md) — the "should I just use Tauri instead?" debate. 1Password's hybrid is the answer that says you don't have to choose.
- [CS1 VS Code](./01-vscode.md) — the *other* Electron app frequently held up as "doesn't feel like Electron." Same lesson: investment in polish.

## Sources

- [1Password 8: The Story So Far | 1Password blog](https://1password.com/blog/1password-8-the-story-so-far) — primary Aug 2021 retrospective from 1Password (as of 2026-04)
- [Behind the scenes of 1Password for Linux | Dave Teare (Medium)](https://dteare.medium.com/behind-the-scenes-of-1password-for-linux-d59b19143a23) — co-founder author-identity primary on the Linux client (2021) (as of 2026-04)
- [Rust in Production: 1Password | Serokell](https://serokell.io/blog/rust-in-production-1password) — supplementary interview with Michael Fey (Director of Engineering, 1Password), incl. Tokio/Hyper/Reqwest/Ring/Neon stack and TypeShare details (2022) (as of 2026-04)
- [`1Password/electron-secure-defaults` | GitHub](https://github.com/1Password/electron-secure-defaults) (as of 2026-04)
- [`1Password/electron-secure-defaults` README](https://github.com/1Password/electron-secure-defaults/blob/main/README.md) (as of 2026-04)
- [`1Password/electron-hardener` | GitHub](https://github.com/1Password/electron-hardener) — Rust hardening library; v0.2.2 (as of 2026-04)
- [`1Password/typeshare` | GitHub](https://github.com/1Password/typeshare) — Rust→Swift/Kotlin/TypeScript type generator (as of 2026-04)
- [Not important enough: 1Password abandons its native Mac app | Six Colors (Aug 2021)](https://sixcolors.com/post/2021/08/not-important-enough-1password-abandons-its-native-mac-app/) — contemporaneous Mac-community backlash, supplementary
- [Electron Fuses | Electron docs](https://www.electronjs.org/docs/latest/tutorial/fuses) — what `electron-hardener`'s fuse management interacts with
