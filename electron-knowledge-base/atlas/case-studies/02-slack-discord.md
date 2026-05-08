# CS2. Slack & Discord — wrap-a-web-app archetype, BrowserView per workspace

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

Slack and Discord are the canonical examples of the **wrap-a-web-app archetype**: ship the same web React codebase that runs in the browser, plus an Electron shell that adds notifications, deep links, multi-account isolation, tray/dock integration, and (for Discord) heavy native audio modules. Both publish openly about their engineering — Slack's blog covers a webview→BrowserView→shared-store rebuild and a major memory-footprint reduction; Discord's posts cover their custom WebRTC voice stack and Krisp native-module integration. The shared lesson: web wrapper saves the rendering codebase, but you pay for it in RAM, in OS-feature plumbing, and in a permanent migration backlog (now: BrowserView → WebContentsView, deprecated since Electron 30+).

## When this archetype applies

- You already ship a substantial **web app** and want a desktop presence without forking the codebase.
- You need **multi-account / multi-workspace** isolation per window — independent cookies, independent service workers, independent renderers.
- Your differentiation is the **product**, not the rendering engine; you're happy with Chromium output.
- You need OS hooks the browser cannot give you: tray icon, native notifications with custom actions, global hotkeys, deep links, badge counts, system menu integration.
- Voice/video/screen-share is on the roadmap and you can lean on Chromium's WebRTC stack.

## When NOT to apply

- You can ship as a PWA — no tray, no global hotkeys, no protocol handler — see [A2 other frameworks](../awareness/02-other-frameworks.md).
- Memory budget is the headline metric (e.g. you sit alongside an IDE all day) and a system-webview alternative (Tauri) would be acceptable — see [A1 Tauri vs Electron](../awareness/01-tauri-vs-electron.md).
- The product needs to feel deeply native (Linear, Things, native macOS apps); a wrapper will always have a polish gap.

---

## Slack

### Architecture

Slack's desktop app is fundamentally **the same React/Redux web app that runs at app.slack.com**, hosted by an Electron shell. Slack's "Building Hybrid Applications with Electron" engineering post describes the model directly: Electron inherits Chromium's multi-process model, with the main app and every signed-in Slack team living in a separate process with its own memory space, tied together by IPC. ([Slack — Building Hybrid Applications with Electron](https://slack.engineering/building-hybrid-applications-with-electron/), 2016, foundation post — *as of 2026-04*.)

On top of the shared web bundle, the desktop client adds desktop-only features: **native notifications** (with custom actions like "Reply"), **dock/taskbar badge counts**, **deep links** (`slack://channel/...`), **drag-and-drop file uploads via the OS shell**, **screen sharing**, **global hotkeys**, and a **tray icon** with quick controls. These all live in the Electron main process and are exposed to the renderer via a preload script. See [C2 Process model & IPC](../core/02-process-model-and-ipc.md) for the boundary pattern, and [C4 Native integrations](../core/04-native-integrations.md) for the OS-feature surface.

### The webview → BrowserView → shared-store evolution

Slack's per-workspace architecture went through three generations, all publicly chronicled:

1. **`<webview>` tag (Slack 2.x)** — One Electron `BrowserWindow`, multiple Chromium `<webview>` tags inside it (one per workspace). Cheap to integrate, but the post "Growing Pains: Migrating Slack's Desktop App to BrowserView" enumerates the breakage: hidden webviews would sometimes refuse to render content the next time they were shown, focus management was fragile, and the webview tag itself was already on the deprecation track inside Chromium / Electron. ([Slack — Growing Pains](https://slack.engineering/growing-pains-migrating-slacks-desktop-app-to-browserview/), 2017.)

2. **`BrowserView` per workspace (Slack 3.x, 2017)** — Slack rewrote the shell to give each workspace its own `BrowserView`, a top-level Electron view that "behaves more like a Chrome tab and is part of the operating system window hierarchy." ([Slack 3.0 — InfoQ coverage of the BrowserView migration](https://www.infoq.com/news/2017/11/slack-browser-view-3/), 2017.) Switching workspaces became a **visibility toggle** between BrowserView instances inside one `BrowserWindow`, instead of process churn.

3. **Shared Redux store (the "rewrite that wasn't", 2019)** — At BrowserView-per-workspace scale, RAM was still painful: each workspace ran a stand-alone copy of the web client inside its own Electron renderer process. Slack's post "When a rewrite isn't: rebuilding Slack on the desktop" describes the fix as moving each workspace's data into its own **Redux store** with everything (workspace data, connectivity status, real-time WebSocket) living within it — without housing each container in its own Electron process. The result, per Slack: more than 70% of original code reused, doubled test coverage, and substantially reduced memory usage. ([Slack — When a rewrite isn't](https://slack.engineering/rebuilding-slack-on-the-desktop/), 2019.)

The companion post "Reducing Slack's memory footprint" lays out the underlying problem in plain terms: the desktop client's memory footprint grew as the user signed into more teams, because each team ran in its own webview with its own copy of the application. ([Slack — Reducing memory footprint](https://slack.engineering/reducing-slacks-memory-footprint/).)

### BrowserView → WebContentsView (the migration ahead)

⚠️ **`BrowserView` is deprecated as of Electron 30+** (March 2024). It's now a thin shim over `WebContentsView`, and the official Electron migration blog walks through the constructor/parent-window/auto-resize differences. ([Electron blog — Migrating from BrowserView to WebContentsView](https://www.electronjs.org/blog/migrate-to-webcontentsview), Apr 2024 — *current as of 2026-04*.) Any wrap-a-web-app product still on BrowserView (Slack's architecture per the 2017–2019 posts is built around it; whether a 2026 silent rewrite has happened is not publicly disclosed) faces the same migration. The mechanical changes are small:

- `new BrowserView()` → `new WebContentsView()`
- `browserWindow.addBrowserView(view)` → `browserWindow.contentView.addChildView(view)`
- Default background changes (white in WebContentsView vs. transparent in BrowserView — set RGBA with alpha `00` for the old behaviour).
- `setAutoResize` is gone; you wire window-resize events manually.

The bigger story is alignment: WebContentsView sits on top of Chromium's modern **Views API**, which is where Chromium's UI work is going. Anyone building a multi-pane desktop app today should write WebContentsView from day one.

### Key engineering wins and tradeoffs

- ✅ **Web codebase shared** — one bundle ships in browser and desktop; the desktop polish is additive, not a fork.
- ✅ **Multi-workspace via OS view hierarchy** — BrowserView/WebContentsView gives independent rendering trees, isolated cookies and storage partitions, and clean focus/lifecycle.
- ❌ **RAM cost grows with workspaces** — per the 2019 rebuild, each workspace was originally a full Electron renderer; the Redux-store consolidation pushed shared state into a single store but each workspace's view still costs a renderer. Hacker News threads ([HN on memory](https://news.ycombinator.com/item?id=36415818)) routinely mention 600 MB+ resident usage with multiple workspaces — *user reports, not Slack-published numbers*.
- ❌ **Permanent migration backlog** — webview → BrowserView (2017) → shared store (2019) → WebContentsView (the next round) — wrap-a-web-app archetypes inherit every Chromium UI re-platforming.

---

## Discord

### Architecture

Discord's desktop app is **Electron + React + Redux**, sharing UI code with the web client at discord.com. Where Discord diverges from Slack is in the **native module surface** for audio: Discord ships a custom C/C++ media engine, a Krisp noise-suppression native add-on, and a non-standard transport layer for voice traffic.

### WebRTC voice stack — Chromium's WebRTC, with Discord's plumbing on top

Discord's "How Discord Handles Two and a Half Million Concurrent Voice Users using WebRTC" post is the canonical source. ([Discord blog — WebRTC at scale](https://discord.com/blog/how-discord-handles-two-and-half-million-concurrent-voice-users-using-webrtc), 2018 — *as of 2026-04*.) The relevant points for an Electron architect:

- Desktop, iOS, and Android share **a single C++ media engine built on top of the WebRTC native library**, not the JS WebRTC API. This means voice/video paths bypass much of Chromium's renderer-level WebRTC plumbing.
- Discord **replaced DTLS/SRTP with Salsa20** for faster encryption on the voice path — a custom transport layer the native WebRTC library makes possible.
- **Voice activity detection** drops audio packets entirely during silence, with both client and server prepared to cease and rewrite packet sequence numbers.
- Selective forwarding is server-side (Elixir media servers); the client publishes one stream per source and subscribes to the streams it wants.

### Krisp noise suppression — the canonical "native add-on" example

Krisp's noise-suppression integration is **a native Node.js add-on compiled against Electron's ABI**, built on Krisp's Native Audio SDK. ([Krisp Electron SDK docs](https://sdk-docs.krisp.ai/docs/electron), *as of 2026-04*; [Discord support — Krisp FAQ](https://support.discord.com/hc/en-us/articles/360040843952-Krisp-FAQ).) Each batch of microphone audio is handed from JS to the native add-on, processed off the main thread, and returned cleaned. This is the textbook case where native modules earn their keep: DSP at audio sample rates is impractical in JS, and the audio path needs to stay outside the renderer's busy event loop.

The compatibility wrinkle (visible in third-party Discord clients like Vencord/Vesktop and WebCord) is that the Krisp add-on **verifies the binary is signed by Discord** — likely a license check. When users replace the bundled Electron binary with a system Electron, signature verification fails and Krisp silently no-ops. ([Vesktop issue #479](https://github.com/Vencord/Vesktop/issues/479).) This is a useful pattern (and warning) for anyone shipping a licensed native module: signature gating is real, and it complicates third-party packaging.

### Custom packaging and update infrastructure

Discord ships its **own auto-update infrastructure** rather than `electron-updater` / Squirrel.Mac in their canonical configurations. Updates are pulled from Discord's own CDN/host, integrity-checked, and applied with a custom updater binary. Documentation on the internals is sparse (no public engineering post), but reverse-engineering work like [`Discord-Linux`](https://github.com/mbilker/Discord-Linux) and the Arch Linux `discord_arch_electron` package make the structure visible: a stub bootstrapper plus an `app.asar` patched in by the updater. For [C7 Auto-update](../core/07-auto-update.md) this matters as a counter-example to "always use electron-updater" — at Discord's scale, owning the update path is a deliberate choice.

### Other native concerns

- **Custom voice protocol** rides on UDP via the native engine; the JS side handles signalling only.
- **Hardware audio device enumeration** uses platform-native APIs (Core Audio / WASAPI / PulseAudio/PipeWire) rather than Web Audio's enumerator, for lower latency and more device metadata.
- **Screen sharing with audio** — getDisplayMedia + Chromium's audio capture, where supported per platform.

### Engineering wins and tradeoffs

- ✅ **Voice quality and scale** — the native WebRTC engine and Salsa20 transport are demonstrably worth the integration cost at Discord's scale.
- ✅ **Krisp DSP path** — clean separation of JS UI and native audio processing; the add-on pattern is reusable.
- ❌ **Native module = ABI rebuild matrix** — every Electron upgrade rebuilds the native add-ons against the new Node ABI. See [C4 Native integrations](../core/04-native-integrations.md#native-modules).
- ❌ **Custom updater = own the failure mode** — when an update goes wrong, there's no `electron-updater` / Squirrel community to lean on.

---

## Common pattern: wrap-a-web-app archetype

### Pros

- **Shared codebase** with the web client. The desktop ships *additions* (notifications, tray, deep links), not a parallel UI.
- **Cross-OS consistency** — bundled Chromium renders the same on macOS, Windows, Linux, removing the WebKit/WebView2/WebKitGTK matrix that Tauri and Wails leave you to manage.
- **Hireability** — every web engineer can contribute; native specialists are needed only for native-module slices.
- **Multi-window / multi-account** is straightforward via WebContentsView per account, each in its own session/partition for cookie isolation.

### Cons

- **RAM and CPU overhead** — bundled Chromium + Node + V8 starts at ~80 MB and grows with each workspace/account view. See [A1 Tauri vs Electron](../awareness/01-tauri-vs-electron.md) for the size comparison.
- **OS-feature plumbing per app** — every wrapper re-implements deep-link registration, notification permission flows, tray icon sizing per platform, badge counts, dock bouncing, etc. See [C4 Native integrations](../core/04-native-integrations.md) and [C6 Cross-platform porting](../core/06-cross-platform-porting.md).
- **Native polish gap** — wrap-a-web-app apps feel less native than truly polished Electron apps (Linear: see [CS5](./05-linear.md)) and noticeably less native than apps that go further into WASM / WebGL rendering (Figma, Notion: see [CS3](./03-notion-figma.md)) or Rust cores (1Password: [CS4](./04-1password.md)).
- **Permanent Chromium-UI migration backlog** — webview → BrowserView → WebContentsView is the visible chain; the next one will come.

### Multi-account / multi-workspace pattern

The shape both Slack and Discord converge on:

- One `BrowserWindow` (the chrome around the experience).
- One **WebContentsView per account/workspace** inside that window — formerly `BrowserView` before Electron 30+.
- Each view gets its **own `session` / partition** so cookies, storage, and service workers are isolated.
- A **shared Redux/state layer in main or a singleton renderer** to cut RAM versus running N independent renderers (Slack's 2019 rebuild).
- Switching is a **visibility toggle**, not a process spawn.

If you're starting a wrap-a-web-app today, write directly against `WebContentsView` and skip the BrowserView API — see [C2 Process model & IPC](../core/02-process-model-and-ipc.md) for the boundary pattern.

---

## Take-aways for KB readers

1. **If your product is a web app + you need a desktop presence, this is the archetype** — accept the RAM cost and the OS-feature plumbing as the price of reusing the codebase.
2. **Plan for `BrowserView` → `WebContentsView` migration if any code uses BrowserView**. Mechanical and small (5 call-sites in a typical app), but compounds with style/layout work.
3. **Native modules earn their keep only for DSP / audio / GPU / cryptography.** Everything else stays in JS. Discord's Krisp add-on is the canonical "yes, native here" example; UI state, business logic, networking — JS.
4. **Multi-account isolation = WebContentsView + partitioned `session`.** Both Slack and Discord's architecture converges on this; don't re-invent the per-account isolation pattern.
5. **Owning the auto-updater (Discord) is a scale decision.** Default to `electron-updater` / Squirrel via [C7](../core/07-auto-update.md); only walk away from it when you have the staffing to own the failure mode.
6. **Engineering blogs are slow.** Slack's last detailed Electron post is 2019; Discord's WebRTC post is 2018. Both companies have shipped years of work since with no public retrospective. Treat the canonical posts as architectural foundations, not a current snapshot.

---

## Cross-links

- [C1 Fundamentals](../core/01-fundamentals.md) — three-process model
- [C2 Process model & IPC](../core/02-process-model-and-ipc.md) — main/renderer/preload boundary
- [C4 Native integrations](../core/04-native-integrations.md) — notifications, deep links, native modules, ABI rebuilds
- [C6 Cross-platform porting](../core/06-cross-platform-porting.md) — tray, badges, deep-link registration per OS
- [C7 Auto-update](../core/07-auto-update.md) — `electron-updater` vs custom (Discord)
- [C8 Frontend stack](../core/08-frontend-stack.md) — shared web/desktop bundle
- [C10 Performance & observability](../core/10-performance-and-observability.md) — RAM, V8 snapshots, renderer-per-window cost
- [CS1 VS Code](./01-vscode.md) — native-first counterpoint
- [CS3 Notion & Figma](./03-notion-figma.md) — WASM-heavy web shell variant
- [CS4 1Password](./04-1password.md) — Rust-core counterexample
- [CS5 Linear](./05-linear.md) — native-polish counterpoint
- [A1 Tauri vs Electron](../awareness/01-tauri-vs-electron.md) — system-webview alternative

---

## Sources

### Slack engineering — primary

- [Building Hybrid Applications with Electron — Slack engineering](https://slack.engineering/building-hybrid-applications-with-electron/) — foundation post on the Electron model and multi-process layout *(as of 2026-04)*
- [Growing Pains: Migrating Slack's Desktop App to BrowserView — Slack engineering, 2017](https://slack.engineering/growing-pains-migrating-slacks-desktop-app-to-browserview/) — webview→BrowserView migration story
- [When a rewrite isn't: rebuilding Slack on the desktop — Slack engineering, 2019](https://slack.engineering/rebuilding-slack-on-the-desktop/) — Redux-store consolidation, 70% code reuse, RAM reduction
- [Reducing Slack's memory footprint — Slack engineering](https://slack.engineering/reducing-slacks-memory-footprint/) — per-team webview cost
- [Interop's Labyrinth: Sharing Code Between Web & Electron Apps — Slack engineering](https://slack.engineering/interops-labyrinth-sharing-code-between-web-electron-apps/) — shared-bundle architecture
- [Engineering at Slack — Electron tag (index)](https://slack.engineering/tag/electron/) — full post list

### Slack — secondary

- [Slack Desktop Migrated to BrowserView for 3.0 — InfoQ, 2017](https://www.infoq.com/news/2017/11/slack-browser-view-3/) — independent coverage of the BrowserView migration

### Discord engineering — primary

- [How Discord Handles Two and a Half Million Concurrent Voice Users using WebRTC — Discord blog, 2018](https://discord.com/blog/how-discord-handles-two-and-half-million-concurrent-voice-users-using-webrtc) — native WebRTC engine, Salsa20 transport, voice activity dropping
- [Discord Engineering blog — index](https://discord.com/category/engineering) — full blog
- [Tune into Discord with Krisp noise suppression on iOS and Android — Discord blog](https://discord.com/blog/tune-into-discord-with-krisp-noise-suppression-on-ios-and-android) — Krisp partnership announcement

### Discord — Krisp native module

- [Krisp Electron SDK documentation](https://sdk-docs.krisp.ai/docs/electron) — Native Add-on compiled against Electron's ABI *(as of 2026-04)*
- [Krisp FAQ — Discord support](https://support.discord.com/hc/en-us/articles/360040843952-Krisp-FAQ) — user-facing description
- [Vesktop issue #479 — Krisp signature check fails on system Electron](https://github.com/Vencord/Vesktop/issues/479) — third-party-client compatibility quirk

### BrowserView → WebContentsView migration

- [Migrating from BrowserView to WebContentsView — Electron blog](https://www.electronjs.org/blog/migrate-to-webcontentsview) — official migration guide; BrowserView deprecated since Electron 30+ *(as of 2026-04)*
- [WebContentsView — Electron API docs](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [BrowserView — Electron API docs](https://www.electronjs.org/docs/latest/api/browser-view) — now a shim over WebContentsView
- [Electron breaking changes (canonical changelog)](https://github.com/electron/electron/blob/main/docs/breaking-changes.md)

### Community / context

- [Slack 600 MB RAM — Hacker News thread](https://news.ycombinator.com/item?id=36415818) — *user reports, not Slack-published*
- [Discord-Linux reverse engineering — GitHub](https://github.com/mbilker/Discord-Linux) — visibility into Discord's Electron packaging and updater layout
