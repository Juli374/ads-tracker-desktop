# CS5. Linear — modern Electron + macOS-native polish

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

Linear's desktop app is **confirmed Electron** since the 2019 launch and remains so as of 2026-04. It is the canonical reference for "an Electron app that doesn't feel like one" — keyboard-first UX, careful animation, dock badges, and a local-first sync engine that pushes structured deltas over WebSocket instead of polling REST. The take-away for KB readers: native polish in Electron is achievable through obsessive UX work and a real client-side data layer, not by abandoning Electron.

## Confirmed Electron

Linear announced the desktop app on 2019-04-25. The launch changelog states explicitly:

> "It uses the same Javascript/React application we build for the web, but with the **Electron wrapper** you get nicer notifications, dock badge for unread messages, and most importantly: it's always on." — *Linear changelog, 2019-04-25* ([source](https://linear.app/changelog/2019-04-25-linear-desktop-app))

The 2020-03-19 changelog adds multi-window support and notes "Updated to **Electron 8** for improved performance" ([source](https://linear.app/changelog/2020-03-19-desktop-app-improvements-multi-window-support)). Linear's own design retrospective on `linear.app/now` confirms the framework continues to be Electron in production: "Our app runs on Electron, so our navigation needed to work not just on macOS and Windows as a native app but also in any browser." ([source](https://linear.app/now/how-we-redesigned-the-linear-ui), as of 2026-04).

This rules out the common assumption (visible on developer threads) that "fast and polished = native." It's Electron, all the way down — the polish comes from engineering choices on top of the framework.

## Why Linear feels native

Linear's brand is **speed**. Electron is not naturally fast at startup or input handling; the app feels fast because of deliberate decisions, most of which are observable from the outside.

### 1. Speed obsession + a real client database

The single biggest reason Linear feels different from a typical "wrap a web app in BrowserWindow" Electron app is that **the data layer lives on the client**. Linear loads issues into an in-memory object pool backed by IndexedDB on startup; subsequent operations are local reads and writes that update the UI synchronously, with mutations queued and pushed to the server in the background.

Linear has not published a definitive engineering post on the sync engine, but the team's CTO (and co-founder) Tuomas Artman publicly endorsed a multi-month reverse-engineering write-up as accurate. He wrote: *"This is a pretty awesome (and correct) write-up of our sync engine"* and *"...probably the best documentation that exists — internally or externally"* ([reverse-engineering repo, endorsed 2025](https://github.com/wzhudev/reverse-linear-sync-engine)). Treat that repository as a *secondary* source: it is endorsed by Linear's CTO but it is not Linear's own publication. We cite it here only for the structural shape of the system, not for any specific implementation detail (as of 2026-04).

The structural shape: **IndexedDB** (durable cache of models and a pending-transactions queue), **MobX** (observable in-memory object pool), **GraphQL** (mutations to the server), and a **WebSocket** that streams delta packets back to clients with global sync IDs ([endorsed reverse-engineering, 2025](https://github.com/wzhudev/reverse-linear-sync-engine)). The renderer reads from the local store, never from a network round-trip; the perceived latency of "create issue" or "filter board" is bounded by IndexedDB and JS object iteration, not the WAN.

The KB take-away: a sync-engine pattern is a viable Electron architecture, and the renderer's IndexedDB / Origin Private File System / `better-sqlite3` (in main) toolkit is enough to build it. See [C9 Backend connectivity](../core/09-backend-connectivity.md) for the patterns.

### 2. Keyboard-first UX

Every action has a shortcut. The 2019 launch changelog already shipped two new ones (`Shift+Esc` for "mark all as read", `Cmd/Ctrl+Shift+M` for comments) ([Linear changelog, 2019-04-25](https://linear.app/changelog/2019-04-25-linear-desktop-app)) and the 2020 multi-window release added `Cmd/Ctrl+N` and `Cmd/Ctrl+W` for windows ([Linear changelog, 2020-03-19](https://linear.app/changelog/2020-03-19-desktop-app-improvements-multi-window-support)). The Cmd-K command palette and per-page shortcut menus are renderer-side keyboard handling — `keydown` listeners over the React tree, not native `globalShortcut` registrations (those are reserved for system-wide hotkeys).

For an Electron app, this implies:
- Use renderer-side keyboard events for in-app shortcuts; reserve `globalShortcut` for the few that should fire when the window is unfocused.
- Mind platform conventions (`Cmd` on macOS, `Ctrl` elsewhere — see [C6 Cross-platform porting](../core/06-cross-platform-porting.md) for the swap pattern).
- Build a discoverable command palette early; it doubles as the routing layer.

### 3. Animations and transitions

Linear's screen transitions, list reorderings, and modal entrances are deliberately animated with timing curves that do not look webby. This is plain CSS / React work, not anything Electron-specific, but it requires the renderer to be fast enough to hit frame budgets. Practically: keep the JS thread quiet during transitions, avoid layout thrash, prefer CSS transforms over layout-triggering animations. Their UI redesign post calls out using "Apple standards" as a north star for matching native platform feel ([Linear, *How we redesigned the Linear UI*](https://linear.app/now/how-we-redesigned-the-linear-ui), as of 2026-04).

### 4. Window chrome and dock integration

The launch post calls out two macOS-specific behaviors that web apps can't do:

- **Dock badge for unread messages** — `app.setBadgeCount()` on macOS, taskbar overlay icons on Windows.
- **Native notifications** — `new Notification(...)` from the renderer (Chromium routes through OS notification center on macOS, Action Center on Windows).

Linear's design retro suggests the team values chrome that "doesn't fight the OS" ([linear.app/now](https://linear.app/now/how-we-redesigned-the-linear-ui)). The window itself uses a tightly designed top bar that integrates with macOS traffic-light controls; the conventional Electron pattern for that is `titleBarStyle: 'hiddenInset'` plus CSS `-webkit-app-region: drag` zones. (We can't quote a Linear primary source on the exact `BrowserWindow` options — Linear has not published one — but the visible behavior is consistent with this configuration. See [C6 Cross-platform porting](../core/06-cross-platform-porting.md#frameless-titlebar) for the cross-platform implementation pattern.)

### 5. Multi-window architecture

The 2020 update made multi-window first-class: users can `Cmd/Ctrl+N` a new window, links open in new windows on `Cmd/Ctrl+click`, and "narrow window sizes" are supported ([Linear changelog, 2020-03-19](https://linear.app/changelog/2020-03-19-desktop-app-improvements-multi-window-support)). In Electron terms, this means the main process owns a `Map<windowId, BrowserWindow>` and the sync engine in each renderer subscribes to the same store — every window stays consistent because they all read from the same client-side dataset that's pinned by IndexedDB and patched by the WebSocket stream.

Compare with Slack and Discord (see [CS2](02-slack-discord.md)), which use one window per workspace and embed the same web app in each. Linear's pattern is closer to "one workspace, many lenses" — viewing different issues, projects, or filters side by side.

## Engineering practices (inferred + cited)

Linear's public engineering writing is sparse. The team has published:

- A design retrospective on the UI rebuild ([linear.app/now](https://linear.app/now/how-we-redesigned-the-linear-ui)) — focused on visual design, color systems (LCH), and cross-platform consistency, not Electron internals.
- The product changelogs ([linear.app/changelog](https://linear.app/changelog)) — useful for confirming what shipped and when.
- The endorsed reverse-engineering of the sync engine ([wzhudev/reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine)) — secondary source, but explicitly correct per their CTO.

What we do **not** have, as of 2026-04:
- A primary Linear post on Electron architecture (BrowserWindow config, preload boundary, IPC patterns).
- Performance benchmarks from Linear (startup, memory, V8 snapshots).
- Linear's own write-up of the sync engine.

That asymmetry is itself instructive: Linear has chosen *not* to publish on the desktop framework, and the reverse-engineering write-up suggests the sync-engine documentation is not even fully complete internally. Treat any third-party claim about Linear's stack with caution unless it appears in one of the three primary sources above.

## Take-aways for KB readers

1. **Native polish in Electron is achievable through obsessive UX work, not by abandoning Electron.** Linear is the proof. The framework is fine; the team's standards are the variable.
2. **Frameless window + custom controls + careful animation = looks-native.** Don't try to reproduce platform UI literally — a custom design system that respects platform conventions (drag regions, traffic lights, OS-correct shortcuts) feels right.
3. **Local-first sync + IndexedDB is a viable Electron pattern.** Linear's sync engine is the case study: in-memory object pool backed by IndexedDB, mutations via GraphQL, deltas via WebSocket. See [C9 Backend connectivity](../core/09-backend-connectivity.md) for the implementation toolkit.
4. **Speed is a UX problem, not an Electron problem.** Measure (DevTools performance traces, V8 sampling), optimize the renderer hot paths, and reach for V8 snapshots / lazy module loading only when you've earned it. See [C10 Performance & observability](../core/10-performance-and-observability.md).
5. **Keyboard-first works because the renderer owns it.** Renderer-side `keydown` plus a Cmd-K command palette beats sprinkled `globalShortcut` registrations.
6. **Multi-window is cheap when the data layer is shared.** Each renderer subscribes to the same client-side store; the main process is just a window factory.

## When this case study applies to your app

- You're building a productivity / workflow tool where perceived latency is the brand.
- You have (or are building) a backend that can stream incremental deltas, not just answer REST.
- You want a tight macOS feel without abandoning a single web codebase.

## When it does not apply

- You're wrapping a content-heavy web app where freshness ≫ latency (e.g., dashboards, docs viewers). The local-first investment is overkill; just use `BrowserWindow` over your web app — see Slack/Discord ([CS2](02-slack-discord.md)) and Notion/Figma ([CS3](03-notion-figma.md)).
- You don't control the backend protocol. Linear-style sync requires a server that can produce ordered deltas; bolting it onto an off-the-shelf REST API is most of the work for none of the reward.
- You need the Mac App Store. Linear distributes outside MAS; an MAS build forces App Sandbox + entitlements work that's orthogonal to this case study (see [A3 Store distribution](../awareness/03-store-distribution.md)).

## Cross-links

- [C6 Cross-platform porting](../core/06-cross-platform-porting.md) — frameless titlebar tricks, platform-conventional shortcuts.
- [C8 Frontend stack](../core/08-frontend-stack.md) — React + Vite + Electron, the renderer foundation.
- [C9 Backend connectivity](../core/09-backend-connectivity.md) — sync engine patterns, IndexedDB, WebSocket reconnect, offline.
- [C10 Performance & observability](../core/10-performance-and-observability.md) — V8 snapshots, renderer profiling, the moves that buy "feels native."
- [CS2 Slack & Discord](02-slack-discord.md) — contrast: BrowserView-per-workspace vs. Linear's one-app-many-windows.
- [CS3 Notion & Figma](03-notion-figma.md) — contrast: web-app shells with WASM heavy lifting vs. Linear's structured-data sync.

## Sources

Primary (Linear):
- [Linear desktop app | Linear changelog (2019-04-25)](https://linear.app/changelog/2019-04-25-linear-desktop-app) — confirms Electron, dock badge, notifications, initial keyboard shortcuts.
- [Desktop app improvements + multi-window support | Linear changelog (2020-03-19)](https://linear.app/changelog/2020-03-19-desktop-app-improvements-multi-window-support) — Electron 8 upgrade, multi-window, narrow-window support.
- [How we redesigned the Linear UI | linear.app/now](https://linear.app/now/how-we-redesigned-the-linear-ui) — confirms Electron is current; Apple standards as a design north star (as of 2026-04).
- [Linear desktop](https://linear.app/desktop) — distribution page (as of 2026-04).

Secondary (CTO-endorsed external):
- [wzhudev/reverse-linear-sync-engine | GitHub](https://github.com/wzhudev/reverse-linear-sync-engine) — multi-month reverse engineering of the sync engine; explicitly endorsed as correct by Linear's CTO Tuomas Artman in 2025. Cited only for structural shape of the sync engine (IndexedDB + MobX + GraphQL + WebSocket + transaction queue).

## Unverified / open

- Exact `BrowserWindow` configuration (e.g., `titleBarStyle`, `vibrancy`) — inferred from visible behavior, not from a Linear primary source.
- Whether Linear ships V8 startup snapshots, ASAR integrity fuse, or hardened-runtime entitlements beyond the defaults — Linear has not published.
- Linear's exact Electron version as of 2026-04 (last public confirmation: Electron 8 in 2020).

---

*Phase 3 draft v1, 2026-04-30. Status bumped 🟥 stub → 🟨 draft v1.*
