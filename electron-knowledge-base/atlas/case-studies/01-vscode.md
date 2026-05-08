# CS1. VS Code (Microsoft) — vanilla Electron + patches, sandbox migration

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

VS Code is the canonical Electron app — and it consumes Electron exactly the way the docs intend: a [vanilla `electron` npm dev-dependency, currently `39.8.8`](https://github.com/microsoft/vscode/blob/main/package.json) (as of 2026-04), with a small set of patches applied at build time per release. **Microsoft does not fork Electron.** They follow the upstream [8-week release cadence](https://www.electronjs.org/blog/8-week-cadence) and ship to Stable / Insiders / Exploration channels. The most instructive piece of the VS Code story is the [multi-year process-sandbox migration](https://code.visualstudio.com/blogs/2022/11/28/vscode-sandbox) (early 2020 → late 2022): every `require('fs')` from a renderer was an issue to close, and the destination architecture is sandboxed renderers + a dedicated extension host running on Electron's `utilityProcess` API, communicating via typed IPC and `MessagePort`s. If you want to know what "modern, secure, fast Electron" looks like in production, read VS Code's source organization, then read this page for the why.

## How VS Code uses Electron

### Vanilla npm dep, not a fork

The most common myth in the Electron community is that "Microsoft forks Electron for VS Code." It is wrong. VS Code's `package.json` lists `electron` under `devDependencies` like any other npm consumer. As of the `main` branch on 2026-04-30:

```jsonc
// https://github.com/microsoft/vscode/blob/main/package.json
"devDependencies": {
  "electron": "39.8.8",
  // …
  "@vscode/gulp-electron": "1.41.2"
}
```

[`electron@39.8.8`](https://github.com/microsoft/vscode/blob/main/package.json) ships [Chromium 142 and Node 22](https://github.com/ewanharris/vscode-versions) inside VS Code 1.118 (April 2026 release). That binary is *the same* Electron tarball the rest of the ecosystem downloads from `releases.electronjs.org`. Microsoft does maintain a small set of build-time patches against it — applied through `@vscode/gulp-electron` and a vendored patch directory — but the patch surface is intentionally tiny, because anything large enough to matter gets upstreamed instead.

This pattern — *vanilla dependency + thin patches + upstream contribution* — is the path Felix Rieseberg (former Electron maintainer) calls out in [Things people get wrong about Electron](https://felixrieseberg.com/things-people-get-wrong-about-electron/): forks rot, and rotting forks are why people imagine Electron apps are perpetually behind on Chromium CVEs. VS Code stays on the latest stable Electron, which is why VS Code 1.118 (April 2026) is on Chromium 142, only weeks behind upstream Chromium stable.

### Microsoft is the largest upstream contributor

Although the [Electron governance page](https://www.electronjs.org/governance) describes the project as OpenJS-Foundation-hosted with no formal corporate board, the contribution graph tells a different story: most of the people merging changes to `electron/electron` work for Microsoft, with `@deepak1556` in particular [owning the VS Code Electron-bump issues for years](https://github.com/microsoft/vscode/issues/177338). Many of the features VS Code needs — `utilityProcess`, the V8-sandbox-compatible allocator shim for native modules, the ESM loader, `MessagePortMain` plumbing — land in Electron *because* VS Code needs them, then become available to every other consumer. If you are choosing Electron in 2026, much of why it works for you is downstream of VS Code's roadmap.

### Process architecture

A running VS Code window today is a tree of cooperating Electron processes:

| Process | Electron primitive | Privilege | What it does |
|---|---|---|---|
| **Main** | `electron` main process | Full Node + native APIs | Window lifecycle, file I/O for the app shell, native menus, native dialogs, deep-link / protocol handlers, auto-updater, native authentication providers |
| **Workbench renderer** (one per window) | `BrowserWindow` with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` | Sandboxed Chromium (no Node) | The actual editor UI: tabs, side bar, status bar, the Monaco editor instance, Copilot Chat panel |
| **Shared process** | Hidden `BrowserWindow`, sandboxed | Sandboxed Chromium | Background services shared across all windows: settings sync, extension management, telemetry batching |
| **Extension host** (one per workspace) | [`utilityProcess`](https://www.electronjs.org/docs/latest/api/utility-process) (since Electron 22) | Full Node, no Chromium | Loads and runs every installed extension; gated behind a typed RPC API so the workbench renderer cannot reach Node directly |
| **Webview / webview-view renderers** | Per-iframe sandboxed `<webview>` / `WebContentsView` | Sandboxed Chromium | Extension-provided UI (Markdown preview, Copilot Chat surfaces, custom editors) |
| **Pty hosts, search hosts** | `utilityProcess` per role | Full Node, isolated | Terminal pty management, ripgrep-backed file search — kept off the main process so they cannot block UI |

The contract between these processes is enforced by Electron's [process model](https://www.electronjs.org/docs/latest/tutorial/process-model) and IPC primitives — nothing exotic. When a workbench renderer asks for the contents of a file, it does not call `fs.readFile`; it does an IPC call (`ipcRenderer.invoke` or a custom RPC layer over `MessagePort`s) into the extension host or the file-system service in main, and the *response* is what crosses the trust boundary.

For the canonical mental model, see [C1 Fundamentals](../core/01-fundamentals.md) and [C2 Process model & IPC](../core/02-process-model-and-ipc.md). VS Code is what those pages describe — at scale.

## Sandbox migration (2020–2022): the canonical refactor story

The single most useful thing VS Code's engineering team has published for the Electron community is the [Migrating VS Code to Process Sandboxing](https://code.visualstudio.com/blogs/2022/11/28/vscode-sandbox) blog post (Nov 2022). It documents how a large Electron app moved from "renderers can `require('fs')`" to "renderers are fully Chromium-sandboxed," over roughly three years. If you are inheriting an Electron codebase written before 2021, this is your playbook.

### What "sandbox" actually means

Pre-migration, VS Code renderer processes ran with `nodeIntegration: true` and could synchronously call any Node API. That is the 2017-era default Electron warns about loudly today (see [C3 Security](../core/03-security.md)). Post-migration, every renderer runs with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` — the same defaults Electron has shipped by default [since v20](https://www.electronjs.org/docs/latest/tutorial/sandbox). The renderer is, effectively, a hardened Chromium tab: HTML and JS, but no `require`, no `process`, no `fs`. Anything that used to be a synchronous Node call becomes an async IPC round-trip.

### The blockers, in order of pain

The blog post enumerates them. They will be familiar to anyone who has tried this:

1. **Every `require` from a renderer was an issue to close.** VS Code's renderer codebase historically called Node directly in dozens of modules — for file watchers, child processes, OS introspection, native crypto. Each call site became a tracked migration: replace direct call with IPC to a privileged process, define a typed channel, port consumers, delete the dead Node import. The blog calls out how the team pursued it incrementally: "we have been shipping changes that prepare us for sandboxing every month, without enabling the feature." Multi-year migrations are not a single big-bang PR; they are a thousand small ones.
2. **The `file://` protocol leaks.** Even with `sandbox: true`, loading workbench HTML from `file://` allows certain attacks (relative-path traversal, mixed-content surprises). VS Code introduced a custom `vscode-file://` protocol that "behaves like HTTPS" — registered in main via `protocol.registerStreamProtocol` — and migrated the renderer to load through it.
3. **The extension host was inside the renderer.** Originally, the extension host process was spawned *as a child of* the workbench renderer. That works only as long as the renderer has Node — i.e., it was incompatible with sandboxing. The fix was to migrate the extension host onto Electron's [`utilityProcess`](https://www.electronjs.org/docs/latest/api/utility-process) API, a primitive added in Electron 22 specifically because VS Code needed it. `utilityProcess` gives you "isolated processes supporting child spawning, full Node.js access, and direct `MessagePort` communication with sandboxed renderers" — exactly the shape an extension host needs.
4. **Native modules + V8 memory cage.** Electron 21 turned on V8's memory cage / sandboxed pointers ([Electron blog](https://www.electronjs.org/blog/v8-memory-cage)), which broke any native module using Node's external-buffer N-API surface — including ZeroMQ, used by the Jupyter extension. The [Plan for updating to Electron >= 21 RFC](https://github.com/microsoft/vscode/issues/177338) is worth reading for the engineering write-up. The fix was an *allocator shim* that "reroutes heap allocations from extension host into a partition inside the V8 sandbox," letting existing N-API native modules work without recompilation. This shim now ships in mainline Electron — another VS-Code-driven feature available to every Electron consumer.
5. **Webviews everywhere.** Every extension that draws UI does so in a sandboxed `<webview>` / `WebContentsView`. The migration formalized this boundary: extensions never share a process with workbench code, and workbench code never shares a process with arbitrary HTML.

The end state, shipped in stable VS Code at the end of 2022 and refined through 2023–2026, is the architecture summarized in the table above: every renderer is sandboxed, the extension host is a utility process, communication is exclusively typed IPC over `ipcMain.handle` / `ipcRenderer.invoke` and `MessagePort`s.

### Take-away for refactoring an existing Electron app

- Plan for **multi-year**, not multi-month. VS Code took ~3 calendar years from "we want sandboxing" to "every renderer ships sandboxed by default."
- Track call sites, not files. The unit of migration is "one Node API call from renderer," and you want a checklist you can decrement.
- Land changes behind an off-by-default flag (`enableSandbox`), enable on Insiders first, then Stable. Do not flip it for everyone on day one.
- Move "I need real Node here" code into a `utilityProcess` rather than the main process — keeps the main process responsive and lets you scale CPU-heavy work horizontally.

## Performance investments

Beyond security, VS Code has driven a number of Electron-wide performance improvements, most of which the community can copy directly.

### V8 snapshots for startup

VS Code uses V8 startup snapshots — pre-serialized V8 heaps that get `mmap`'d into a fresh isolate at process start, skipping the parse-and-evaluate cost for hot modules. The original benchmarks come from the [Atom team's snapshot work](https://github.com/RaisinTen/electron-snapshot-experiment) (pre-2017) reporting roughly 50% startup-time reduction for the JS bootstrap path. VS Code applies the same technique to its workbench bootstrap. (As of 2026-04, the Atom-era 50% number is the most-cited public benchmark; an updated VS-Code-specific measurement is the kind of data point that would belong in [C10 Performance & observability](../core/10-performance-and-observability.md) when one is published.)

### Lazy-loading everything

Extensions are lazy-loaded by *activation event* — a contributor manifest declares "I activate when the user opens a `.py` file" and only then does the extension host evaluate that extension's entry. Language servers (TypeScript, Python, Go) follow the same pattern: a stub registered in the workbench fires up the language server on demand and tears it down when the workspace closes. The engineering insight is that the cheapest code is code that never runs; everything in VS Code is contingent.

### WebAssembly for hot CPU paths

[Tree-sitter](https://tree-sitter.github.io/) (incremental parsing for syntax highlighting) and parts of the search stack run as WebAssembly modules inside the workbench renderer. WebAssembly is the right answer when (a) you need CPU-heavy work in a sandboxed renderer where you cannot ship native code, and (b) you want byte-identical behavior across macOS / Windows / Linux. See [CS3 Notion & Figma](./03-notion-figma.md) for the same pattern at scale.

### Sandboxed extension host = isolation, not just security

Once the extension host is its own utility process, an extension that goes into an infinite loop or allocates a 4 GB array does not freeze the editor; it kills only the extension host, which the workbench detects and restarts. The security boundary doubles as a fault-isolation boundary.

## Take-aways for KB readers

If you are designing an Electron app from scratch in 2026, the lessons VS Code teaches are:

1. **Vanilla Electron + patches > forking.** Fork only as a last resort, and only after you have tried (a) upstreaming the change, (b) configuration, (c) a runtime patch via `app.commandLine.appendSwitch` or fuses. VS Code maintains a tiny patch set and is on Chromium 142 in April 2026 — your fork will be on Chromium 110 by 2027.
2. **Renderer security is not optional, but it is a multi-year migration if you start from the 2017 defaults.** Greenfield: start with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` and never look back. Brownfield: budget for it. See [C3 Security](../core/03-security.md).
3. **Treat your extension / plugin host as a separate process from day one.** Even if you do not have third-party plugins, putting "trusted business logic" in a `utilityProcess` instead of the workbench renderer means future-you can sandbox the renderer cheaply. The extension host pattern is also how you keep the main process from becoming a bottleneck — *user input goes through main, business logic does not.*
4. **Ship fast: follow Electron's release cadence.** Electron ships a new major every 8 weeks ([8-week-cadence blog, Sept 2021](https://www.electronjs.org/blog/8-week-cadence)). VS Code follows it — they bump within a release or two of upstream stable. If you fall more than three majors behind, you are sitting on unpatched Chromium CVEs and you have lost access to whatever new Electron primitives have shipped (utilityProcess, ESM, ASAR integrity fuses, Wayland-native).
5. **Use IPC and `MessagePort`s, not shared memory.** Every cross-process communication in VS Code is typed RPC. It is slower than a shared array, and *that is the point* — the boundary is what makes the system safe and observable.

## Cross-links

- [C1 Fundamentals](../core/01-fundamentals.md) — three-process model in the abstract; VS Code is what it looks like at scale
- [C2 Process model & IPC](../core/02-process-model-and-ipc.md) — `utilityProcess`, `MessagePort`s, `ipcMain.handle` patterns; VS Code's extension host is the production reference
- [C3 Security](../core/03-security.md) — sandbox / contextIsolation / nodeIntegration defaults; VS Code's migration is the canonical refactor playbook
- [C10 Performance & observability](../core/10-performance-and-observability.md) — V8 snapshots, lazy loading, WASM for CPU-bound paths
- [CS3 Notion & Figma](./03-notion-figma.md) — the WebAssembly-in-renderer pattern, applied differently
- [CS4 1Password](./04-1password.md) — counter-narrative: when forking-ish (Rust core via Neon) is the right call

## Sources

- [microsoft/vscode `package.json` (main branch)](https://github.com/microsoft/vscode/blob/main/package.json) — `electron@39.8.8` as of 2026-04 (vanilla npm dep)
- [ewanharris/vscode-versions](https://github.com/ewanharris/vscode-versions) — VS Code → Electron / Chromium / Node version mapping (1.118.0 → Electron 39.8.8 → Chromium 142.0.7444.265 → Node 22.22.1)
- [Migrating VS Code to Process Sandboxing | VS Code blog](https://code.visualstudio.com/blogs/2022/11/28/vscode-sandbox) — (Nov 2022) the canonical migration write-up
- [Update to Electron 28 | microsoft/vscode#201935](https://github.com/microsoft/vscode/issues/201935) — (Jan 2024, closed) the version-bump-tracking pattern; ESM was the trigger
- [RFC: Plan for updating to Electron >= 21 | microsoft/vscode#177338](https://github.com/microsoft/vscode/issues/177338) — V8 memory cage migration, allocator shim
- [UtilityProcess | Electron API](https://www.electronjs.org/docs/latest/api/utility-process) — the primitive added for VS Code's extension host
- [Process Sandboxing | Electron docs](https://www.electronjs.org/docs/latest/tutorial/sandbox) — sandbox default since v20
- [V8 Memory Cage | Electron blog](https://www.electronjs.org/blog/v8-memory-cage) — Electron 21 V8 sandbox; what broke native modules
- [New Electron Release Cadence (8 weeks) | Electron blog](https://www.electronjs.org/blog/8-week-cadence) — (Sept 2021) the cadence VS Code follows
- [Things people get wrong about Electron | Felix Rieseberg](https://felixrieseberg.com/things-people-get-wrong-about-electron/) — myth-busting from a former maintainer; vanilla-not-fork is one of the myths
- [Speeding up Electron apps with V8 snapshots | RaisinTen](https://github.com/RaisinTen/electron-snapshot-experiment) — Atom-era 50% startup-reduction benchmark, reused by VS Code
- [Electron Releases](https://releases.electronjs.org/) — current stable cross-reference
