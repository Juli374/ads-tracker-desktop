# CS3. Notion & Figma — web app shells, WASM SQLite, WebGL/WebGPU rendering

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

Notion and Figma are the canonical "Electron is just a window" apps. Both ship the *same* web codebase to the browser and the desktop; the desktop binary exists for OS integrations (icon, tray, deep links, offline boot, notifications), not for code reuse with native APIs. They lean hard on the web platform's two big perf escape hatches — **WASM** for CPU-bound work and **WebGL/WebGPU** for GPU-bound rendering — and let Electron do the boring shell job. If you have a working web product and you're tempted to "rewrite for native performance," study these two before you start: they ship to millions of paying users on a single TS/C++ codebase. (Notion blog 2024 [^1]; Figma blog 2017–2025 [^2][^3][^4].) *(as of 2026-04)*

## When to apply this archetype

- You already have a web product and the browser is the primary surface; desktop is parity, not the lead platform.
- Most of your perf hot paths can be solved by **WebAssembly** (compute) and/or **WebGL/WebGPU** (rendering), not by Node-native modules.
- Real-time collaboration is in scope — and your collab engine is already websocket-based, so it works the same in the browser tab and in the Electron renderer.
- You want one engineering team and one codebase across web and desktop.

## When NOT to apply

- The product *is* the desktop integration (terminal, IDE, system utility). Use a thicker Electron shell or a different framework entirely.
- You need bundle size below ~50 MB (Electron baseline ≈ 80 MB compressed; see [A1 Tauri vs. Electron](../awareness/01-tauri-vs-electron.md)).
- Hot paths are I/O-bound on system APIs (filesystem watchers, CLI tools, deep OS hooks) — those want native or main-process Node modules, not renderer-side WASM.

## Anatomy

### Notion — Electron wrapping a React + WASM SQLite web app

**Architecture.** Notion's desktop app is "the web app, wrapped." The renderer loads the same React + TypeScript codebase that the browser ships [^5]. The Electron main process is a thin host: window management, the menu bar, deep-link handlers, badge counts, OS-level notifications, and the auto-update path. There is no special "desktop client" — the URL bar just lives behind chrome instead of a Chrome tab.

That sounds boring, but it's the *whole* point. Notion can A/B-test a new editor in the browser and the desktop app inherits it the next time a user reloads the renderer. The production cost of "ship a desktop app" is bounded to the cost of Electron itself: signing, notarization, auto-update plumbing.

**WASM SQLite for the offline / fast-query path.** In July 2024 Notion shipped sqlite3 compiled to WebAssembly (the official `sqlite-wasm` build) inside the renderer, persisting via the **Origin Private File System** (OPFS) [^1]. The result, per their post: page navigation got **20% faster on average**, with regional wins of **28% in Australia, 31% in China, 33% in India** — i.e., the bigger the round-trip latency to Notion's servers, the bigger the win, because reads now hit a local cache instead of the network [^1].

The mechanics worth stealing:
- **One SQLite per origin, multiple tabs.** Each tab spawns its own Web Worker that talks to OPFS, but only one tab is the "active writer" at a time. Notion uses a `SharedWorker` to elect the active tab and gate writes [^1]. This is the canonical pattern for browser-side SQLite in 2026 — you'll hit the same problem with `better-sqlite3` in the main process if you open multiple windows.
- **Async load, never block first paint.** The WASM binary is a few hundred KB; Notion loads it asynchronously after the initial HTML shell so it never sits on the critical path [^1]. If your WASM lib delays first contentful paint by 300 ms to save 50 ms on a query that fires 10 seconds later, you've made the product feel slower.
- **Cache, not source of truth.** Notion's SQLite is a *cache*. Authoritative state lives on their server; the local DB is a fast lookup that gets repopulated. This sidesteps the hardest local-first problem (conflict resolution) — they don't promise offline edits, just offline reads and faster online reads.

**Performance discipline.** Notion has been public about editor perf — large pages with thousands of blocks were a known sore spot. Third-party teardowns (e.g., the 3perf.com case study, *supplementary*) have characterized the bottlenecks; Notion's own engineering category at `notion.com/blog/category/eng` is the primary source for any perf claim [^6]. The WASM SQLite work and a ~20% caching improvement reported via reverse-proxy/edge caching [^7] are the two well-documented wins; treat anything beyond that as inference, not fact.

**Shared codebase.** The same TS bundle ships to browser, Electron renderer, iOS, and Android (the mobile apps wrap React Native, not the web view, but the editor primitives are shared) [^5][^8]. Strategically: every engineer writes one frontend, and "desktop bug" usually decomposes to "web bug + Electron-specific environment quirk."

### Figma — Electron wrapping a C++/WASM canvas app

**Architecture.** Figma's renderer is a 2D canvas-and-WebGL/WebGPU surface, not a DOM tree. The drawing engine — vector flattening, layout, rasterization, hit-testing — is **C++ compiled to WebAssembly via Emscripten** [^2]. The HTML/JS layer is just the chrome around the canvas: panels, properties, comments, modals. In the desktop app, all of this runs inside an Electron renderer; the main process orchestrates window state, deep links, and OS services [^9].

**Why C++/WASM and not JS?** Figma's original 2017 post `building-a-professional-design-tool-on-the-web` lays out the rationale: a vector design tool needs deterministic float math, custom memory layouts, and tight render loops that are painful in JS. C++ gives them all three; Emscripten lets them ship that C++ to every browser without rewriting [^3].

**The 3x load-time win.** Figma's 2017 post `webassembly-cut-figmas-load-time-by-3x` is the canonical "WASM is real" datapoint: switching from asm.js to WebAssembly cut their cold-load time by **roughly 3x** at the time of the post, including app init, document download, and first render [^2]. The win came from the WASM binary being smaller than the equivalent asm.js bundle and the browser's WASM compiler being faster than parsing+optimizing JS — both costs paid before any Figma-specific code runs.

**WebGPU upgrade (2025).** In September 2025 Figma announced their renderer migration from WebGL to WebGPU [^4]. The post is engineering-blog-quality, not a marketing recap: they redesigned their graphics interface to make draw-call arguments explicit, wrote a custom GLSL→WGSL shader processor, switched uniform handling to batched buffer uploads, and adapted to WebGPU's asynchronous-only pixel readback (WebGL's was synchronous). Critically, they **kept a WebGPU→WebGL fallback** for stability on Windows, where WebGPU on the underlying Direct3D 12 path is still maturing in Chromium [^4]. *(as of 2026-04 — verify before quoting; WebGPU surface is moving fast.)*

The takeaway for any Electron app considering WebGPU: Chromium ships it, but you want a runtime fallback. Don't trust your hardware-detection table; let the GPU process tell you it failed and fail forward.

**Real-time collab.** Multi-cursor presence, comments, and live editing are websocket-based and run identically in the browser and the desktop app — Electron is not in that loop. The collab engine is part of the same web bundle. The desktop app inherits it by being the web app.

**Why Electron and not native?** Figma's team is web-native; the renderer is web-native (canvas + WebGL/WebGPU + WASM); the design files live on the server; the desktop app's job is mostly window-and-icon. A native rewrite would mean reimplementing the 2D engine three times (macOS, Windows, Linux) for a perf delta that WebGPU already mostly closes. *(As of 2026-04, no public Figma announcement of a native rewrite — verify on `figma.com/blog` before citing.)*

### What's the same across both

| Dimension | Notion | Figma |
|---|---|---|
| Renderer surface | DOM (React) | Canvas + WebGL/WebGPU |
| Hot-path language | TypeScript + WASM SQLite | C++ → WASM |
| Real-time collab | Websocket-based, same in web & desktop | Websocket-based, same in web & desktop |
| Local persistence | SQLite-WASM in OPFS (cache) | None client-side; doc state ships from server |
| Electron main process job | Window, tray, deep links, notifications, auto-update | Window, tray, deep links, notifications, auto-update |
| Shared codebase with web | Yes, primary | Yes, primary |
| Native modules | None of note | None of note |

The shared row is the punch line: **the main process is a thin orchestrator** in both cases. Almost nothing app-specific runs there. Compare that to VS Code's main process (extension host, shared process, multiple BrowserViews — see [CS1 VS Code](01-vscode.md)) or 1Password's (Rust core via FFI — see [CS4 1Password](04-1password.md)). Notion and Figma are deliberately on the opposite end of the spectrum: renderer-heavy, main-process-thin.

## Mini-example — the WASM-in-renderer pattern

The minimum viable "Notion approach" in your own Electron renderer:

```ts
// renderer/db.ts — runs in the renderer (browser-context, sandboxed)
import sqlite3InitModule, { type Database } from "@sqlite.org/sqlite-wasm";

let dbPromise: Promise<Database> | null = null;

async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const sqlite3 = await sqlite3InitModule({
        // print/printErr forwarded to console for dev visibility
        print: console.log,
        printErr: console.error,
      });
      // OPFS-backed; falls back to in-memory if OPFS unavailable
      const db = "opfs" in sqlite3
        ? new sqlite3.oo1.OpfsDb("/cache.sqlite3")
        : new sqlite3.oo1.DB(":memory:");
      db.exec(`
        CREATE TABLE IF NOT EXISTS pages (
          id TEXT PRIMARY KEY,
          title TEXT,
          updated_at INTEGER
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

export async function getPage(id: string) {
  const db = await getDb();
  return db.exec({
    sql: "SELECT id, title, updated_at FROM pages WHERE id = ?",
    bind: [id],
    returnValue: "resultRows",
  });
}
```

Three things to notice:

1. **Lazy init.** The WASM module isn't loaded until the first `getDb()` call. The renderer's first paint is unaffected.
2. **OPFS feature detection.** Older Electron / older Chromium need the in-memory fallback. As of Electron 41 (Chromium 146, *as of 2026-04*) OPFS is broadly available in the renderer.
3. **No `nodeIntegration`, no preload IPC for the DB.** The DB runs in the *renderer*, not the main process. This is the Notion pattern. If you instead use `better-sqlite3` in the main process, you're in the [C9 backend connectivity](../core/09-backend-connectivity.md) "main-process Node module" pattern — different tradeoffs (synchronous, can't be sandboxed, ABI rebuild required).

For multi-window apps you'll also need a `SharedWorker` (or BroadcastChannel + a leader-election protocol) so two windows don't race on writes — exactly the problem Notion's `SharedWorker` tab-election solves [^1].

## Take-aways

1. **WASM is a real escape hatch for renderer-side perf.** No native modules, no ABI rebuild, no signing surface. C++ for compute (Figma's renderer); SQLite-WASM for storage (Notion's cache). Both ship the same binary to web and Electron. *(as of 2026-04)*
2. **Real-time collab is not Electron-specific.** If your collab engine works in a browser tab, it works in an Electron renderer. Don't design a special "desktop sync" path; reuse the websocket layer.
3. **Canvas + WebGL/WebGPU is native-ish on perf.** Figma's renderer is C++/WASM, but the *display* path is the web's GPU API. You get hardware-accelerated rendering for the cost of a Chromium bundle.
4. **Keep the main process thin.** If your main.ts is more than window management + deep links + notifications + auto-update, ask whether you really need that complexity. Notion and Figma sized to billion-dollar valuations on thin main processes.
5. **A web-first product that ships to desktop should reuse, not fork.** A separate desktop codebase is technical debt waiting to happen. The Notion/Figma model is "web is canonical; desktop is wrapper."
6. **WebGPU has a fallback story.** Even Figma — who can afford a long migration — kept a WebGPU→WebGL fallback for stability. Plan for it on day one.

## Cross-links

- [C1 Fundamentals](../core/01-fundamentals.md) — three-process model is the foundation; Notion and Figma exemplify "renderer-heavy, main-thin."
- [C8 Frontend stack](../core/08-frontend-stack.md) — Vite + framework + ESM are the same patterns Notion's web bundle uses.
- [C9 Backend connectivity](../core/09-backend-connectivity.md) — alternate offline pattern: `better-sqlite3` in the main process vs. SQLite-WASM in the renderer.
- [C10 Performance & observability](../core/10-performance-and-observability.md) — startup perf, V8 snapshots, Sentry; relevant when measuring whether your WASM-heavy renderer is actually faster.
- [CS1 VS Code](01-vscode.md) — the opposite archetype: thicker main process, extension host, multi-process orchestration.
- [CS2 Slack & Discord](02-slack-discord.md) — also "wrap a web app," but with multi-account `WebContentsView` per workspace; Notion/Figma run a single web app per window.
- [CS4 1Password](04-1password.md) — the *opposite* of Notion/Figma: thick Rust core, FFI, security-first; renderer-thin.

## Sources

[^1]: [How we sped up Notion in the browser with WASM SQLite | Notion blog](https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite) — primary source for the OPFS architecture, SharedWorker tab election, and the 20%/28%/31%/33% latency wins. *(as of 2026-04, confirmed live; Notion migrated `notion.so/blog` → `notion.com/blog` post-2024.)*
[^2]: [WebAssembly cut Figma's load time by 3x | Figma blog (2017)](https://www.figma.com/blog/webassembly-cut-figmas-load-time-by-3x/) — primary source for the 3x load-time claim. *(as of 2026-04.)*
[^3]: [Building a professional design tool on the web | Figma blog (2017)](https://www.figma.com/blog/building-a-professional-design-tool-on-the-web/) — primary source for "C++ → WASM, canvas+WebGL renderer, why not DOM." *(as of 2026-04.)*
[^4]: [Figma Rendering: Powered by WebGPU | Figma blog (2025-09)](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/) — primary source for WebGPU migration, GLSL→WGSL shader processor, async readbacks, WebGL fallback. *(as of 2026-04.)*
[^5]: [What Notion is built with — concepts and architecture | notion-enhancer docs](https://notion-enhancer.github.io/documentation/concepts/) — *supplementary*; community documentation describing the wrapper-around-web-client architecture. Prefer Notion's own engineering blog for any specific claim.
[^6]: [Notion engineering blog | Notion blog category](https://www.notion.com/blog/category/eng) — primary source for Notion engineering posts. *(as of 2026-04, URL verified; older `notion.so` URLs redirect.)*
[^7]: [Notion engineering — caching latency 20% blog post (referenced)](https://www.notion.com/blog/category/eng) — Notion's own caching writeup is on the engineering category index above; verify exact URL at draft-cite time.
[^8]: [Things people get wrong about Electron | Felix Rieseberg](https://felixrieseberg.com/things-people-get-wrong-about-electron/) — supplementary; ex-Electron-maintainer myth-busting that informs the "main process is thin" framing.
[^9]: [Introducing BrowserView for Electron | Figma blog](https://www.figma.com/blog/introducing-browserview-for-electron/) — Figma's own engineering post on Electron internals; useful corroboration that Figma actively engineers around Electron's renderer architecture rather than abandoning it. **Note**: as of Electron 30+, `BrowserView` is deprecated in favor of `WebContentsView`; the Figma post predates that migration.

### Unverified / verify before quoting

- **"Figma is considering a native rewrite."** No public source as of 2026-04 [WebSearch 2026-04-30]. Treat as rumor unless Figma posts an official announcement. The [Figma blog](https://www.figma.com/blog/) is the source to monitor.
- **Specific Notion editor block-count benchmarks** (e.g., "10k+ blocks"). The general perf-focus claim is well-supported by the engineering blog category, but quote a specific number only if you can pin it to a specific Notion post.
- **OPFS support matrix in older Electron versions.** As of 2026-04, Electron 41 / Chromium 146 supports OPFS in the renderer; older Electron majors (≤30) may need polyfills or fallbacks. Verify with the Chromium release notes for the specific Electron version you target.
