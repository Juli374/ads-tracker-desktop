# C1. Fundamentals — what Electron is, three-process model, when to use

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

Electron is one binary that bundles **Chromium (renders the UI), Node.js (gives you the filesystem, child processes, native modules), and V8 (the shared JS engine)** into a single executable per OS. Your app is split across **three process types**: a privileged **main** process that owns windows and OS APIs, one or more sandboxed **renderer** processes that show HTML, and a **preload** script that bridges the two via `contextBridge`. Electron 41 (Mar 2026, current stable as of this writing) ships **Chromium 146 / V8 14.6 / Node 24.14** ([Electron 41 blog](https://www.electronjs.org/blog/electron-41-0)). You reach for Electron when you need cross-platform desktop reach + deep OS integration + JS ecosystem reuse, and can pay ~150-200 MB of binary and 200-500 MB of idle RAM for it. Next pages: [C2 Process model & IPC](02-process-model-and-ipc.md) for the trust boundary in depth, [C3 Security](03-security.md) for the hardening checklist, [build-kit/decision-tree.md](../../build-kit/decision-tree.md) if you're still picking Electron vs. Tauri vs. PWA.

## When to read this page

- You've never shipped Electron and want the mental model in one place.
- You're explaining to a teammate "why is the preload script a thing".
- You're at the "should I even use Electron" gate and want a sober cost/benefit list before reading [A1 Tauri vs. Electron](../awareness/01-tauri-vs-electron.md).
- You need a current version table (Chromium / V8 / Node baked into Electron N).

## When NOT to read this page

- You've decided on Electron and want IPC patterns → jump to [C2 Process model & IPC](02-process-model-and-ipc.md).
- You want the security checklist line-by-line → [C3 Security](03-security.md).
- You're comparing frameworks → [build-kit/decision-tree.md](../../build-kit/decision-tree.md) and [A1 Tauri vs. Electron](../awareness/01-tauri-vs-electron.md).
- You need the official API reference — link [electronjs.org/docs](https://www.electronjs.org/docs/latest), don't read this page.

## Anatomy

### What an Electron app actually is

A packaged Electron app is a directory containing a platform-specific Electron binary plus your app code (typically inside an [ASAR archive](https://www.electronjs.org/docs/latest/tutorial/asar-archives)). The binary is **Chromium with Node.js stitched into the same process tree, sharing one V8 instance**. Electron pins three upstreams in lockstep — bumping Chromium forces matching V8 and Node bumps because they all share that V8 ([process model docs](https://www.electronjs.org/docs/latest/tutorial/process-model)).

| Electron | Released | Chromium | V8 | Node |
|---|---|---|---|---|
| 41 (current stable) | 2026-03-10 | 146.0.7680.65 | 14.6 | 24.14.0 |
| 40 | 2026-01 | 144.0.7559.60 | 14.4 | 24.11.1 |
| 38 | 2025-09 | 140 | 14.0 | 24.x |
| 28 (ESM landed) | 2023-12 | 120 | 12.0 | 18.x |

(Source: [Electron Releases](https://releases.electronjs.org/), [Electron 41 blog](https://www.electronjs.org/blog/electron-41-0), [Electron 40 blog](https://www.electronjs.org/blog/electron-40-0). As of 2026-04-30.)

Release cadence: a new Electron major every ~8 weeks, tracking [Chromium's stable channel](https://www.electronjs.org/docs/latest/tutorial/electron-timelines). Three latest majors are supported simultaneously ([versioning doc](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)). Stay within those three or you're on your own for security patches.

### The three-process model

This is the part everyone gets wrong on the way in. Electron is **not** "Chrome plus Node, both turned all the way up." It's a deliberately partitioned trust system:

```
┌────────────────────────────────────────────────────────┐
│ MAIN PROCESS (Node.js, full OS access)                 │
│ - Owns app lifecycle (app.whenReady, app.quit)         │
│ - Creates BrowserWindow / WebContentsView              │
│ - File system, dialogs, menus, tray, notifications     │
│ - Handles ipcMain.handle / ipcMain.on                  │
│ - Speaks to your backend without CORS                  │
└────────────────────────────────────────────────────────┘
                  ▲                   ▲
                  │ contextBridge     │ contextBridge
                  │  + ipcRenderer    │  + ipcRenderer
┌─────────────────┴──────┐  ┌─────────┴──────────────────┐
│ PRELOAD (per renderer) │  │ PRELOAD (per renderer)     │
│ - Runs in renderer     │  │                             │
│ - Has limited Node     │  │                             │
│ - Exposes typed API    │  │                             │
│   via contextBridge    │  │                             │
└─────────────────┬──────┘  └─────────┬──────────────────┘
                  │                   │
┌─────────────────┴──────┐  ┌─────────┴──────────────────┐
│ RENDERER (sandboxed)   │  │ RENDERER (sandboxed)       │
│ - Chromium tab         │  │                             │
│ - Your HTML/JS/CSS     │  │                             │
│ - No Node, no fs       │  │                             │
│ - window.api = {...}   │  │                             │
└────────────────────────┘  └─────────────────────────────┘
```

**Main** is one privileged Node.js process. It is the program. Lose it and the app exits. It's where you create windows, register protocols, manage updates, talk to the OS, and handle IPC requests.

**Renderers** are sandboxed Chromium tabs, one per `BrowserWindow` (or `WebContentsView`). Since Electron 20 (Sept 2022), `sandbox: true` is the **default** — renderers can't `require()` Node, can't read files, can't do anything a normal browser tab couldn't ([sandbox docs](https://www.electronjs.org/docs/latest/tutorial/sandbox), [Electron 20 release](https://www.electronjs.org/blog/electron-20-0)). Treat them as untrusted, even if you wrote the HTML.

**Preload** scripts run in each renderer *before* page JS, in a separate JavaScript world (`contextIsolation: true`, default since v12 — Mar 2021 — see [context isolation docs](https://www.electronjs.org/docs/latest/tutorial/context-isolation) and [Electron 12 release](https://www.electronjs.org/blog/electron-12-0)). They have access to a small Node surface (`ipcRenderer`, `contextBridge`, a few electron APIs) and exist for one job: **expose a narrow, typed RPC API to the page** via `contextBridge.exposeInMainWorld`. That API forwards calls to main over IPC. The preload is the trust boundary — see [C3 Security](03-security.md).

Rule: **the renderer never touches the filesystem, never imports Node, never speaks to your backend with secrets**. It calls `window.api.something()`. Preload validates and forwards. Main does the work. If you find yourself reaching for `nodeIntegration: true` in a renderer, stop — that's the 2017 pattern and it defeats every defense Chromium ships ([Felix Rieseberg — myth-busting](https://felixrieseberg.com/things-people-get-wrong-about-electron/), [security tutorial](https://www.electronjs.org/docs/latest/tutorial/security)).

#### Why three processes, not one or two?

- **Crash isolation.** A renderer OOM doesn't kill the app — Chromium's process-per-site model means one window crashing leaves the others alive.
- **Security partitioning.** Untrusted web content (the renderer) can't access OS APIs even if compromised, because it has no Node and no privileged IPC.
- **Performance.** Each renderer gets its own V8 isolate; long renders or heavy pages don't block main's event loop, which would freeze the whole app.

### The main-process event loop and BrowserWindow lifecycle

The main process is a vanilla Node event loop with Chromium's message pump merged in (`uv_run` runs alongside Chromium's `MessageLoop`). It dispatches `app` lifecycle events, IPC, native callbacks, and window events. **Don't block it.** A synchronous file read or a tight loop in main freezes every window.

The canonical lifecycle:

```
require('electron').app.whenReady()  →  ready
   │
   ▼
new BrowserWindow({ ... })            →  window created
   │
   ▼
win.loadURL('https://...') /
win.loadFile('index.html')            →  did-start-loading
   │                                  →  dom-ready
   ▼                                  →  did-finish-load
window visible
   │
   ▼
user closes window                    →  close → closed
   │
   ▼
last window closed                    →  window-all-closed
   │
   ▼ (default on Win/Linux)
app.quit()                            →  before-quit → will-quit → quit
```

On macOS, `window-all-closed` does **not** quit by convention — apps stay running in the dock. You handle that with `if (process.platform !== 'darwin') app.quit()`. macOS also fires `activate` when you click the dock icon with no window open; that's where you re-create the window. See [app events](https://www.electronjs.org/docs/latest/api/app#events).

### The entry point

`package.json` declares `"main": "main.js"` (or `electron/main.ts` after build). That script runs on the main process at launch. It typically:

1. Imports `app`, `BrowserWindow` from `'electron'`.
2. Awaits `app.whenReady()`.
3. Creates a `BrowserWindow` with `webPreferences.preload` pointing at the preload script.
4. Calls `win.loadFile('index.html')` (production) or `win.loadURL('http://localhost:5173')` (dev).
5. Wires `app.on('window-all-closed', ...)` and `app.on('activate', ...)`.
6. Registers `ipcMain.handle('channel', handler)` for any RPC the renderer needs.

How the renderer gets HTML: in dev you point at the Vite/Webpack dev server URL for HMR. In production you ship the bundled HTML inside the ASAR and load it via `file://` (or via a [custom protocol](https://www.electronjs.org/docs/latest/api/protocol) if you want CSP-friendly URLs without `file://`). See [C8 Frontend stack](08-frontend-stack.md) for the bundler choice.

### ESM in Electron

`.mjs` and `import`/`export` work in main, preload, and renderer **since Electron 28** (Dec 2023, [Electron 28 release blog](https://www.electronjs.org/blog/electron-28-0), [ESM tutorial](https://www.electronjs.org/docs/latest/tutorial/esm)). Caveats: top-level `await` is fine in main but blocks startup if you abuse it; some native modules are still CJS-only and need an interop hop; your bundler config has to be ESM-aware. Pre-28 codebases on CJS still work — the migration is opt-in. New projects in 2026: write ESM.

### IPC's role at the boundary

All cross-process talk goes through the preload bridge and Electron's IPC primitives:

- **`ipcRenderer.invoke('channel', payload)` ↔ `ipcMain.handle('channel', handler)`** — request/response with a Promise. Default for everything CRUD-ish.
- **`ipcRenderer.send` / `ipcMain.on`** — fire-and-forget, no response. Notifications, telemetry pings.
- **`webContents.send`** — main pushes to a specific renderer (e.g., "auth token rotated").
- **`MessagePort`** — high-throughput, structured-clone streaming when `invoke`'s overhead matters.
- **`UtilityProcess`** (Electron 22+) — spawn a separate Node-only worker for CPU-heavy work without blocking main. Communicates via MessagePort.

Depth + patterns + typed-channel template live in [C2 Process model & IPC](02-process-model-and-ipc.md) and [build-kit/templates/02-ipc-contract.md](../../build-kit/templates/02-ipc-contract.md).

### Why the preload script exists

Two-line answer: it lets you give the renderer a tiny, capability-limited API instead of a fire hose of Node. The renderer is hostile-by-default; `contextBridge.exposeInMainWorld('api', { ... })` is a one-way port through the wall. Without it you'd either expose `require('fs')` to a sandbox-bypassed XSS (game over) or do nothing useful from the UI. Modern defaults — `contextIsolation: true` + `sandbox: true` + `nodeIntegration: false` — make the preload the *only* legitimate channel. See [C3 Security](03-security.md) for why each default exists and what attacks they kill.

## When to use Electron at all

Be opinionated. The honest accounting:

### Reach for Electron when

- **You need consistent rendering across Win / macOS / Linux** and can't tolerate WebKitGTK quirks on Linux or WebView2 lag-behind on Windows. Bundling Chromium means one engine, one set of bugs, one CSS pixel.
- **You need deep Node ecosystem reuse** — `better-sqlite3`, `node-machine-id`, native modules, npm tooling for build/sign/notarize/update. Tauri's Rust-shaped equivalents are smaller.
- **You need OS-integration depth** — tray, notifications, deep links / custom protocols, system menus, file associations, auto-launch, Touch Bar, Jump Lists. All [first-class Electron APIs](https://www.electronjs.org/docs/latest/api/app).
- **Your team is JS/TS-shaped** and you're not staffing a Rust ramp-up just to ship a desktop wrapper.
- **You have an existing web app** to wrap (Slack, Discord, Notion, Figma — see [CS2](../case-studies/02-slack-discord.md), [CS3](../case-studies/03-notion-figma.md)). The shell is days of work; Tauri/Wails would still mean cross-WebView regression hunts.

### Pay attention to the costs

- **Binary size**: ~80-100 MB compressed installer, ~250-400 MB on disk after install. This is Chromium + V8 + Node + your app + native deps — not bloat to optimize away. Compare Tauri's ~3-10 MB ([A1 Tauri vs. Electron](../awareness/01-tauri-vs-electron.md)).
- **RAM at idle**: ~150-300 MB for a small app, more per renderer window. Each `BrowserWindow` is its own Chromium process tree.
- **Security surface**: bundling Chromium means inheriting Chromium's CVE stream. You **must** keep up with majors — being two majors behind means shipping known-exploitable code. See [C3 Security](03-security.md) and the CVE table there.
- **Update discipline**: ~8-week major cadence ([Electron Timelines](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)) plus your own auto-update infrastructure ([C7 Auto-update](07-auto-update.md)). This is non-negotiable, not "nice to have."
- **Code-signing and notarization** are mandatory for distribution outside stores; the rules change quarterly and the tooling is its own boss-fight ([C5 Packaging & code signing](05-packaging-and-signing.md)).

### When Electron is overkill

- The app is **mostly online and content-shaped** — a PWA with `beforeinstallprompt` and Push covers it for free.
- You need **tiny binary size or low RAM** and don't need Node — use Tauri 2 or Wails.
- **iOS / Android** matters — Electron has no mobile story; Tauri 2 does ([Tauri 2 release](https://v2.tauri.app/blog/tauri-20/)).
- **Single-OS** — write native (Swift/SwiftUI on macOS, WinUI 3 on Windows). Bundling Chromium for one platform is silly.

The full decision tree (with the Railway-backend branch) lives at [build-kit/decision-tree.md](../../build-kit/decision-tree.md). Tauri-specific tradeoffs are in [A1 Tauri vs. Electron](../awareness/01-tauri-vs-electron.md). This page intentionally doesn't compare bullet-for-bullet — go there.

### Brief history (one paragraph)

GitHub's Atom editor needed a desktop runtime, so in 2013 Cheng Zhao built **Atom Shell** — Chromium + Node in one process tree. Renamed **Electron** in 2015, hit **1.0 in May 2016**, was donated to the OpenJS Foundation in 2019. VS Code's adoption made it the default desktop runtime for "wrap a web app" products. The hostile early defaults (`nodeIntegration: true`, no `contextIsolation`, no sandbox) were progressively reversed: contextIsolation default in v12 (2021), sandbox default in v20 (2022), ESM in v28 (2023). By Electron 41 (Mar 2026) the framework is **secure-by-default** — but only if you don't manually disable the defaults. See [Felix Rieseberg's myth-buster](https://felixrieseberg.com/things-people-get-wrong-about-electron/) for what the framework is and isn't.

## Mini-example

Minimum viable Electron app — main + preload + renderer, modern (Electron 41) defaults, ~50 lines.

**`package.json`** (relevant fields):

```json
{
  "name": "hello-electron",
  "main": "main.js",
  "scripts": { "start": "electron ." },
  "devDependencies": { "electron": "^41.0.0" }
}
```

**`main.js`** — main process:

```js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Modern defaults — all on, but listed for clarity
      contextIsolation: true,    // default since v12
      sandbox: true,             // default since v20
      nodeIntegration: false     // default since v5
    }
  });
  win.loadFile('index.html');
}

// Main-side handler the renderer can call via window.api.ping()
ipcMain.handle('ping', async () => `pong from main, pid=${process.pid}`);

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

**`preload.js`** — runs in renderer, before page JS, in an isolated world:

```js
const { contextBridge, ipcRenderer } = require('electron');

// The ONLY surface the renderer sees. Add nothing else.
contextBridge.exposeInMainWorld('api', {
  ping: () => ipcRenderer.invoke('ping')
});
```

**`index.html`** — renderer; pure web, no Node:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self'" />
    <title>Hello Electron</title>
  </head>
  <body>
    <button id="ping">ping</button>
    <pre id="out"></pre>
    <script>
      document.getElementById('ping').onclick = async () => {
        const reply = await window.api.ping();
        document.getElementById('out').textContent = reply;
      };
    </script>
  </body>
</html>
```

`npm install && npm start` — you have a window with a button that round-trips through IPC to main and back, with the renderer fully sandboxed and zero Node exposed to your HTML. Everything else in the atlas — IPC depth, security hardening, packaging, signing, auto-update, backend wiring — extends from this skeleton.

## Cross-links

- [C2 Process model & IPC](02-process-model-and-ipc.md) — preload + `contextBridge` + `ipcMain.handle` patterns in depth, MessagePorts, UtilityProcess.
- [C3 Security](03-security.md) — the 17-point checklist, fuses, ASAR integrity, CVE table. Required reading.
- [C4 Native integrations](04-native-integrations.md) — file system, deep links, tray, notifications, native modules, WebHID/USB/Serial.
- [C5 Packaging & code signing](05-packaging-and-signing.md) — Forge vs. Builder, macOS notarization, Windows signing post-CA/B-Forum.
- [C7 Auto-update](07-auto-update.md) — `electron-updater`, channels, the ~8-week-major reality.
- [C8 Frontend stack](08-frontend-stack.md) — Vite vs. Webpack, ESM, dev/prod loading.
- [C9 Backend connectivity (Railway)](09-backend-connectivity.md) ⭐ — `safeStorage`, OAuth PKCE, WebSockets.
- [A1 Tauri 2.x vs. Electron](../awareness/01-tauri-vs-electron.md) — when to pick which.
- [build-kit/decision-tree.md](../../build-kit/decision-tree.md) — Electron vs. Tauri vs. PWA vs. native, Railway-aware.
- [build-kit/checklist.md](../../build-kit/checklist.md) — preflight before you `npm init`.

## Sources

- [Electron — homepage](https://www.electronjs.org/) — current stable banner.
- [Electron 41.0.0 release blog](https://www.electronjs.org/blog/electron-41-0) — Chromium 146.0.7680.65 / V8 14.6 / Node 24.14.0, released 2026-03-10. (as of 2026-04)
- [Electron 40.0.0 release blog](https://www.electronjs.org/blog/electron-40-0) — Chromium 144 / V8 14.4 / Node 24.11.1.
- [Electron 28.0.0 release blog](https://www.electronjs.org/blog/electron-28-0) — ESM landed Dec 2023.
- [Electron 20.0.0 release blog](https://www.electronjs.org/blog/electron-20-0) — sandbox default.
- [Electron 12.0.0 release blog](https://www.electronjs.org/blog/electron-12-0) — contextIsolation default.
- [Electron Releases](https://releases.electronjs.org/) — full history with Chromium / V8 / Node columns.
- [Electron Timelines](https://www.electronjs.org/docs/latest/tutorial/electron-timelines) — release cadence, support window.
- [Process Model | Electron docs](https://www.electronjs.org/docs/latest/tutorial/process-model) — main / renderer split, why each exists.
- [Context Isolation | Electron docs](https://www.electronjs.org/docs/latest/tutorial/context-isolation) — preload world separation.
- [Process Sandboxing | Electron docs](https://www.electronjs.org/docs/latest/tutorial/sandbox) — what `sandbox: true` does, default since v20.
- [Security | Electron docs](https://www.electronjs.org/docs/latest/tutorial/security) — the 17-point checklist (canonical home in C3).
- [ES Modules (ESM) in Electron | Electron docs](https://www.electronjs.org/docs/latest/tutorial/esm) — what works, what doesn't.
- [ASAR Archives | Electron docs](https://www.electronjs.org/docs/latest/tutorial/asar-archives) — packaged-app file format.
- [app | Electron API](https://www.electronjs.org/docs/latest/api/app) — lifecycle events.
- [Things people get wrong about Electron — Felix Rieseberg](https://felixrieseberg.com/things-people-get-wrong-about-electron/) — former maintainer, myth-busting (e.g., "Electron is just Chrome + Node").
