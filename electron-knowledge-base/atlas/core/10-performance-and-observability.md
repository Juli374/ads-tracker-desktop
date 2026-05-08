# C10. Performance & observability — V8 snapshots, Sentry, electron-log, crashpad

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

Electron apps inherit Chromium's multi-process cost (one renderer ≈ 100-200 MB RAM, baseline app ≈ 200-500 MB) and a JavaScript-heavy startup path. Three levers move the needle: **defer work** (`ready-to-show`, lazy `require`, code-split the renderer), **precompute work** (V8 snapshots bake module graphs into the binary), and **trim work** (smaller bundles, ASAR, fewer chrome flags). On the observability side, **Crashpad ships in every Electron build** — you only need to call [`crashReporter.start()`](https://www.electronjs.org/docs/latest/api/crash-reporter) to start collecting native minidumps; [`@sentry/electron`](https://github.com/getsentry/sentry-electron) (v7.11.x as of 2026-04) layers JS error capture and routes the same minidumps to Sentry. [`electron-log`](https://www.npmjs.com/package/electron-log) (v5.4.x as of 2026-04) handles the rotating-file logging story across main + renderer with a single import. Crash recovery — handling `render-process-gone` and reloading the renderer instead of leaving the user staring at a white screen — is small code that prevents support tickets.

## When to apply

- You're noticing cold-start over ~3 s on a mid-spec laptop and want to understand which phase to attack.
- Your app's RSS in Activity Monitor / Task Manager is creeping past 1 GB and you don't know where it's going.
- You're shipping to real users and need to know about renderer crashes, JS exceptions, and native segfaults *before* a user files a ticket.
- A renderer occasionally goes white-screen (GPU bug, OOM, native module fault) and you want to recover automatically.
- You need a paper trail of `info` / `warn` / `error` logs that survive across sessions for support diagnostics.

## When NOT to apply

- You're still pre-MVP — premature optimization. Ship first, profile second. The Electron docs make this point explicitly: profile before micro-optimizing ([Performance | Electron docs](https://www.electronjs.org/docs/latest/tutorial/performance)).
- You're adding telemetry without a privacy review or consent UX. Crash reports and logs can include PII, file paths, query strings, and tokens — see [C3 Security](03-security.md) and [A6 Telemetry](../awareness/06-telemetry.md).
- Your "perf problem" is actually a backend latency problem. A Network panel screenshot rules that out in 30 seconds.
- You're rebuilding what `electron-log` and `@sentry/electron` already do. Both are mature and extensible; reach for a custom logger only if a specific compliance requirement makes them unviable.

## Anatomy

### Where startup time goes

A cold Electron launch on macOS / Windows / Linux roughly breaks into:

1. **OS process launch + binary load** (~100-300 ms, mostly out of your control).
2. **Electron / Chromium init** — V8, Blink, GPU process, network service (~200-500 ms).
3. **`app.whenReady()` to first `BrowserWindow`** — your main-process JS: requires, DB connection, IPC handlers (~varies wildly).
4. **Renderer page load** — HTML, JS bundles, framework hydration, first paint (~varies wildly).
5. **`ready-to-show` → user sees content**.

Phases 3 and 4 are where almost all your wins live. The Electron Performance guide breaks the same surface into "loading and parsing modules", "executing JavaScript", and "loading the UI" ([Performance | Electron docs](https://www.electronjs.org/docs/latest/tutorial/performance), as of 2026-04).

### The `ready-to-show` pattern (no white flash)

The default behaviour shows a `BrowserWindow` immediately on creation, which gives users a white rectangle until the page paints. Show the window only after the renderer signals it's ready:

```javascript
const win = new BrowserWindow({ show: false, /* ... */ })
win.once('ready-to-show', () => win.show())
win.loadURL(devOrProdUrl)
```

The Window Customization tutorial calls this out as the canonical fix ([Window Customization | Electron docs](https://www.electronjs.org/docs/latest/tutorial/window-customization), as of 2026-04). Pair it with a brief splash if you have any pre-render work, but in most apps `ready-to-show` plus a properly compressed bundle is enough.

### Lazy-load heavy modules in main

`require()` in Node is synchronous and runs on the event loop. A 200 ms native module load on the critical path of `app.whenReady()` is 200 ms the user waits before any window appears. Defer non-critical work:

```javascript
// BAD — loads better-sqlite3 on every cold start
const Database = require('better-sqlite3')
app.whenReady().then(createWindow)

// BETTER — defer until you actually open the DB
let _db
function getDb() {
  if (!_db) {
    const Database = require('better-sqlite3')
    _db = new Database(dbPath)
  }
  return _db
}
```

The Electron Performance guide elevates "loading and parsing modules" to the first listed cost; `process.getHeapStatistics()` and Chrome DevTools Performance panel for the main process help quantify the gain.

### V8 snapshots — precompute the require graph

A V8 snapshot is a serialized V8 heap. You execute some JS at build time, snapshot the resulting heap, and ship the snapshot alongside Electron; on launch, V8 deserializes that heap instead of re-parsing JS. Atom famously reported ~50 % faster cold starts using snapshots; the technique is also used by VS Code (since 2017) and various other production Electron apps ([Speeding up Electron apps by using V8 snapshots in the main process | RaisinTen](https://github.com/RaisinTen/electron-snapshot-experiment), [Custom startup snapshots | V8 blog](https://v8.dev/blog/custom-startup-snapshots), as of 2026-04). Independent reports of ~36 % gains on a real app appear in the snapshot-experiment repo's references.

Caveats:
- Not every module is "snapshot-safe" — modules that touch the filesystem, environment, or current time at top-level break determinism. Tooling (`electron-link`) rewrites them at build time.
- Snapshots add build complexity; only worth it once startup is *the* user complaint.
- Inkdrop's [electron-v8snapshots-example](https://github.com/inkdropapp/electron-v8snapshots-example) is the most beginner-friendly walkthrough; Slack and VS Code have written about their internal use, but the canonical "blog post" you'd cite is the V8 team's own [Custom startup snapshots](https://v8.dev/blog/custom-startup-snapshots).

> Open question (per RESEARCH-PLAN §7-E): the "Atom 50 %" claim is from the 2016-2017 era. Treat it as directional, not as a 2026 benchmark — re-verify with a current measurement on your own app before quoting it externally.

### Renderer-side wins

- **Code split** — Vite and Webpack both produce per-route chunks for free; let the framework router lazy-load. Avoid one giant bundle.
- **Strip dev deps** — never ship `electron`, `vite`, or types in the asar. `electron-builder` and Forge handle this if you keep `dependencies` vs. `devDependencies` clean.
- **ASAR** — collapses thousands of small `node_modules` files into one archive. macOS code signing in particular is *much* faster against a single `.asar`. Disable only if you absolutely need filesystem access to the bundled files (rare).
- **Compress** — gzip / brotli is irrelevant for `file://` loads; concentrate on parse-and-execute, not transfer.

### Memory and CPU instrumentation

Two layers — **OS-level** (the process tree you'd see in Activity Monitor) and **V8-level** (heap inside a single process).

In main, two APIs together cover the OS layer:

```javascript
// Per-process snapshot of the whole app — name, pid, type, cpu, memory, sandbox bool.
const metrics = app.getAppMetrics()

// Just the current process (main, in this scope).
const cpu = process.getCPUUsage()           // { percentCPUUsage, idleWakeupsPerSecond }
const mem = process.getProcessMemoryInfo()  // { residentSet, private, shared } (async)
```

`app.getAppMetrics()` is the right tool for telemetry: enumerate every Electron child process (each renderer, the GPU, utility processes, network service) and report aggregates. The data shape is documented at [app | Electron docs](https://www.electronjs.org/docs/latest/api/app#appgetappmetrics) and [process | Electron docs](https://www.electronjs.org/docs/latest/api/process). For V8-level heap, use Chrome DevTools' Memory profiler in the renderer (heap snapshots, allocation timeline) and `process.getHeapStatistics()` in main.

Typical numbers (as of 2026-04, varies wildly by app):

| Process | RSS at idle (rough) |
|---|---|
| Main | 80-150 MB |
| Renderer (per window) | 100-200 MB |
| GPU | 80-120 MB |
| Utility / network | 30-80 MB each |

Native modules can leak across the FFI boundary; `better-sqlite3`, `node-canvas`, and similar are common culprits. Profile with Chrome DevTools' "Detached DOM nodes" and "Comparison" views before blaming the framework.

### GPU and hardware acceleration

Electron uses a dedicated GPU process for compositing. On some Windows laptops with old Intel/Nvidia driver combinations or on Linux with WebKitGTK fallbacks, hardware acceleration causes a white screen or flickering. The escape hatch:

```javascript
// Before app.whenReady()
app.disableHardwareAcceleration()
```

This drops compositing back to software, costing a few frames per second but eliminating the GPU-driver class of bugs. Wire it behind a flag (`--no-gpu`) so users can self-rescue ([app.disableHardwareAcceleration | Electron docs](https://www.electronjs.org/docs/latest/api/app#appdisablehardwareacceleration)).

### Crashpad and the crashReporter API

Every Electron build ships [Crashpad](https://chromium.googlesource.com/crashpad/crashpad/+/main/doc/overview_design.md), Chromium's native crash handler. Crashpad runs as an out-of-process handler that catches segfaults / uncaught native exceptions in main, renderer, GPU, and utility processes, writes a `.dmp` minidump, and either uploads it to a configured URL or holds it locally.

The Electron API to start it is one call:

```javascript
const { crashReporter, app } = require('electron')

crashReporter.start({
  productName: 'MyApp',
  companyName: 'Acme',
  submitURL: 'https://crash.acme.com/post',
  uploadToServer: true,           // false = collect locally only
  ignoreSystemCrashHandler: false
})

// Local dumps live here if upload is off (or if upload fails)
console.log(app.getPath('crashDumps'))
```

`uploadToServer: true` is required to actually POST minidumps; set to `false` for development or for users who haven't consented. Local dumps go under `app.getPath('crashDumps')` — historically a `Crashpad/` subdirectory of the user-data dir ([crashReporter | Electron docs](https://www.electronjs.org/docs/latest/api/crash-reporter), as of 2026-04).

You almost never want a custom `submitURL`. In practice the Sentry SDK takes over the routing (next section).

### Renderer crash recovery

⭐ A renderer that dies leaves a black or white rectangle. Handle it:

```javascript
mainWindow.webContents.on('render-process-gone', (event, details) => {
  // details.reason: 'crashed' | 'killed' | 'oom' | 'launch-failed' | 'integrity-failure' | ...
  log.error('Renderer gone', details)

  if (details.reason === 'crashed' || details.reason === 'oom') {
    // Reload — Electron spawns a fresh renderer process
    mainWindow.webContents.reload()
  } else {
    // Show a recovery UI, offer a Quit button, ask the user to send logs
    showRecoveryWindow()
  }
})
```

This event was added in Electron 9 and supersedes the older `crashed` event ([webContents — `render-process-gone` | Electron docs](https://www.electronjs.org/docs/latest/api/web-contents#event-render-process-gone), as of 2026-04). Related APIs:

- `webContents.reload()` — graceful reload of the page in the existing process. Will fail if the process is *gone*; in that case Electron spawns a fresh one.
- `webContents.forcefullyCrashRenderer()` — kills the renderer immediately. Useful in tests to verify your recovery path actually works ([webContents | Electron docs](https://www.electronjs.org/docs/latest/api/web-contents)).
- `app.relaunch()` + `app.exit()` — for a full app restart when the renderer is unrecoverable.
- For GPU-process white-screens specifically, `app.on('child-process-gone', ...)` catches GPU and utility crashes; recovery is usually `mainWindow.reload()` after a short backoff, or fall back to `app.disableHardwareAcceleration()` and prompt the user to relaunch.

Test the recovery path before shipping: call `webContents.forcefullyCrashRenderer()` from a hidden menu item and confirm the UI comes back.

### Sentry — JS errors + native crashes in one place

[`@sentry/electron`](https://github.com/getsentry/sentry-electron) (v7.11.x as of 2026-04) is the Electron-aware wrapper around Sentry's JavaScript SDK. It does three things you'd otherwise wire by hand:

1. **JS error capture** — uncaught exceptions and unhandled promise rejections in *both* main and renderer, automatically.
2. **Native crash routing** — initializes `crashReporter` for you and points minidumps at Sentry's ingestion endpoint, so a segfault in `better-sqlite3` lands in the same dashboard as your `TypeError: undefined is not a function`.
3. **Performance / breadcrumbs** — optional transaction tracing and IPC-bridged breadcrumbs across processes.

Init in main (only once); the renderer SDK auto-discovers the main-side hub via IPC ([Electron | Sentry docs](https://docs.sentry.io/platforms/javascript/guides/electron/), as of 2026-04). See the mini-example below.

Caveat: the Sentry SDK installs `crashReporter` itself — don't double-init it. Read [Native Crash Reporting | Sentry Electron](https://docs.sentry.io/platforms/javascript/guides/electron/features/native-crash-reporting/) for opt-out flags if you need a hybrid setup.

### electron-log — the file-logger that Just Works

[`electron-log`](https://github.com/megahertz/electron-log) (v5.4.x as of 2026-04) is the de-facto file logger for Electron. Why it's the default choice:

- **Single import in main and renderer**, with IPC bridging — `import log from 'electron-log/main'` in main; `import log from 'electron-log/renderer'` in the renderer entry point. Renderer log calls round-trip to main and land in the same file.
- **Rotating files** with size caps (`log.transports.file.maxSize = 5 * 1024 * 1024`) and per-level paths.
- **Configurable transports** — file, console, IPC, remote HTTP if you want a poor-man's telemetry without Sentry.
- **No dependencies**, small surface, OS-correct paths via `app.getPath('logs')`.

Pair it with Sentry: Sentry catches the panic; `electron-log` keeps the breadcrumb trail of `log.info` / `log.warn` calls so you can read the last 500 lines before the crash from the user's machine.

### Production logging discipline

A production logger is a footgun if you don't constrain it:

- **Never log secrets** — tokens, API keys, OAuth codes, password fields. Cross-link [C3 Security § Token storage](03-security.md). A single rotated log uploaded to support pwns the user.
- **Cap file size** — `electron-log` does this when configured. Untouched, log files can grow to gigabytes.
- **Redact PII** — emails, names, file paths in the user's home directory. Build a redactor at the transport level, not at every call site.
- **Respect log levels in prod** — ship at `info` or `warn`; let users set `debug` via an env var or a hidden settings flag. `debug` everywhere is both noise and a privacy risk.
- **DevTools** — disabled by default in packaged builds. Conditionally re-enable via env var or build flag for diagnostic builds you ship to specific users (`if (process.env.ENABLE_DEVTOOLS) win.webContents.openDevTools()`).

Telemetry must be opt-in (see [A4 Accessibility & i18n](../awareness/04-accessibility-i18n.md) for consent UX patterns and [A6 Telemetry & crash reporting](../awareness/06-telemetry.md) for the GDPR / privacy-policy story).

## Mini-example

A complete observability bootstrap — Sentry + `electron-log` + crash reporter + render-process-gone recovery — in ~30 lines.

```javascript
// main.js (or wherever you create your BrowserWindow)
const { app, BrowserWindow, crashReporter } = require('electron')
const log = require('electron-log/main')
const Sentry = require('@sentry/electron/main')

// 1. electron-log: file + console transports, 5 MB rotating cap
log.initialize()                // makes renderer-side electron-log/renderer work via IPC
log.transports.file.maxSize = 5 * 1024 * 1024
log.transports.file.level = 'info'
Object.assign(console, log.functions) // route stray console.log into the file too

// 2. Sentry: captures JS errors in main + renderer + native crashes via crashReporter
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: app.getVersion(),
  environment: app.isPackaged ? 'production' : 'development',
  tracesSampleRate: 0.1
})

// 3. (optional) Local-only minidumps if Sentry is disabled (e.g., user opted out)
if (!process.env.SENTRY_DSN) {
  crashReporter.start({ submitURL: '', uploadToServer: false, productName: 'MyApp' })
}

// 4. Renderer crash recovery
let mainWindow
app.whenReady().then(() => {
  mainWindow = new BrowserWindow({ show: false, /* ... */ })
  mainWindow.once('ready-to-show', () => mainWindow.show())  // no white flash

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log.error('Renderer gone:', details)
    if (details.reason === 'crashed' || details.reason === 'oom') {
      mainWindow.webContents.reload()
    }
  })

  mainWindow.loadURL(/* ... */)
})
```

```javascript
// renderer-entry.js — at the very top of your Vite/Webpack entry
import log from 'electron-log/renderer'
import * as Sentry from '@sentry/electron/renderer'

Sentry.init({})  // discovers main-side config via IPC
window.addEventListener('error', e => log.error('window.error', e.error))
```

That's the whole baseline. Add `app.getAppMetrics()` polling and `process.getProcessMemoryInfo()` if you want to ship custom telemetry on top.

## Cross-links

- [C1 Fundamentals](01-fundamentals.md) — the three-process model whose costs you're now profiling.
- [C2 Process model & IPC](02-process-model-and-ipc.md) — `electron-log` and `@sentry/electron` both bridge main↔renderer over IPC.
- [C3 Security](03-security.md) — never log tokens; respect the token-storage boundary; CSP affects what error reporters can do in renderer.
- [C8 Frontend stack](08-frontend-stack.md) — Vite code splitting and ESM affect startup; see also for `app.disableHardwareAcceleration()` rationale on dev machines.
- [A6 Telemetry & crash reporting](../awareness/06-telemetry.md) — privacy policy, consent UX, alternatives to Sentry (GlitchTip, DataDog).
- [A4 Accessibility & i18n](../awareness/04-accessibility-i18n.md) — consent dialog wording.
- [CS1 VS Code](../case-studies/01-vscode.md) — sandbox migration improved both security *and* startup; their snapshot pipeline is the most-cited production reference.
- [CS3 Notion & Figma](../case-studies/03-notion-figma.md) — WASM SQLite (Notion) and WebGL+WASM (Figma) demonstrate when the bottleneck moves from JS to native code.

## Sources

- [Performance | Electron docs](https://www.electronjs.org/docs/latest/tutorial/performance) — official "loading modules / executing JS / loading UI" framework (as of 2026-04).
- [Window Customization | Electron docs](https://www.electronjs.org/docs/latest/tutorial/window-customization) — `ready-to-show` pattern (as of 2026-04).
- [crashReporter | Electron API](https://www.electronjs.org/docs/latest/api/crash-reporter) — `start({ submitURL, uploadToServer })`, `app.getPath('crashDumps')` (as of 2026-04).
- [webContents — `render-process-gone` | Electron API](https://www.electronjs.org/docs/latest/api/web-contents#event-render-process-gone) — supersedes legacy `crashed` event (as of 2026-04).
- [webContents | Electron API](https://www.electronjs.org/docs/latest/api/web-contents) — `reload()`, `forcefullyCrashRenderer()` (as of 2026-04).
- [app | Electron API](https://www.electronjs.org/docs/latest/api/app) — `getAppMetrics()`, `disableHardwareAcceleration()`, `getPath('crashDumps' | 'logs')` (as of 2026-04).
- [process | Electron API](https://www.electronjs.org/docs/latest/api/process) — `getCPUUsage()`, `getProcessMemoryInfo()`, `getHeapStatistics()` (as of 2026-04).
- [Speeding up Electron apps by using V8 snapshots in the main process | RaisinTen](https://github.com/RaisinTen/electron-snapshot-experiment) — concrete experiment, ~36 % gain reported.
- [Custom startup snapshots | V8 blog](https://v8.dev/blog/custom-startup-snapshots) — V8 team's own explanation of the underlying mechanism.
- [electron-v8snapshots-example | Inkdrop](https://github.com/inkdropapp/electron-v8snapshots-example) — practical scaffold for adding snapshots to an Electron app.
- [How to make your Electron app launch 1,000ms faster | Takuya Matsuyama](https://www.devas.life/how-to-make-your-electron-app-launch-1000ms-faster/) — community write-up; supplementary, prefer the official Performance guide.
- [Crashpad overview | Chromium](https://chromium.googlesource.com/crashpad/crashpad/+/main/doc/overview_design.md) — what minidumps actually contain.
- [Sentry for Electron | Sentry docs](https://docs.sentry.io/platforms/javascript/guides/electron/) — official integration guide (`@sentry/electron` v7.11.x as of 2026-04).
- [Native Crash Reporting | Sentry Electron](https://docs.sentry.io/platforms/javascript/guides/electron/features/native-crash-reporting/) — how Sentry routes Crashpad minidumps.
- [sentry-electron | GitHub](https://github.com/getsentry/sentry-electron) — source, changelog, version history.
- [@sentry/electron | npm](https://www.npmjs.com/package/@sentry/electron) — package, current version (as of 2026-04: 7.11.x).
- [electron-log | GitHub](https://github.com/megahertz/electron-log) — source, configuration reference.
- [electron-log | npm](https://www.npmjs.com/package/electron-log) — package, current version (as of 2026-04: 5.4.x).
- [6 Ways Slack, Notion, and VSCode Improved Electron App Performance | Palette](https://palette.dev/blog/improving-performance-of-electron-apps) — *supplementary*; cross-references the original engineering posts but is itself a recap.
