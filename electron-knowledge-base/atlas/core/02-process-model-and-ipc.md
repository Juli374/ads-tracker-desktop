# C2. Process model & IPC — main / renderer / preload, contextBridge, ipcMain/Renderer, MessagePorts

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

Electron runs **one main process** (Node.js, no DOM) plus **one renderer process per window** (Chromium, no Node by default), wired together by **preload scripts** that execute in an isolated world inside each renderer *before* page scripts run. The preload is the only place where you can use both Node-flavored APIs and the page's `window`, and it bridges the two with `contextBridge.exposeInMainWorld`. Everything else flows over IPC: prefer `ipcRenderer.invoke` ↔ `ipcMain.handle` (promise-based, error-propagating) for request/response; reach for `MessagePort`s when you need streaming, renderer-to-renderer, or worker-style channels. Heavy CPU work belongs in a `utilityProcess`. As of Electron 41 (April 2026), `BrowserView` is removed and you must use `WebContentsView`.

This page is the canonical home for the IPC and process-boundary patterns. C1 introduces the model in two paragraphs and links here; C3 covers the security implications in depth.

## When to apply

Reach for the patterns on this page when you are:

- Writing a preload script (you should be — `nodeIntegration: false` is mandatory).
- Designing the surface area of `window.api` exposed to renderer code.
- Picking between `invoke/handle` and `send/on` for a new IPC channel.
- Setting up multi-window apps where windows need to talk to each other (Slack-style workspace switcher, Discord-style settings popout).
- Moving a CPU-intensive job (parsing, hashing, image processing) off the main thread without blocking window event loops.
- Migrating from the deprecated `BrowserView` to `WebContentsView` (mandatory on Electron 30+).

## When NOT to apply

- **Don't** disable `contextIsolation` or enable `nodeIntegration` "to make IPC simpler." That breaks Electron's security model. Cite [Process Sandboxing | Electron docs](https://www.electronjs.org/docs/latest/tutorial/sandbox); see C3 for the full argument.
- **Don't** put business logic in the preload script. Preload is a thin bridge. Keep handlers in the main process; keep UI in the renderer; the preload exposes a typed surface and nothing else.
- **Don't** use the unmaintained `remote` module. It was removed in Electron 14 (Aug 2021). Patterns that rely on `electron-remote` belong in the trash.
- **Don't** reach for `MessagePort` if `invoke/handle` is enough. MessagePorts are the right tool for streaming or transfer-heavy workloads, not for one-shot RPC.
- **Don't** hand-roll a global `window.electron = require('electron')` shim. It defeats `contextIsolation` and is the textbook source of CVE write-ups against Electron apps.

## Anatomy

### The three processes

Electron's runtime has three logically distinct script environments. Treating them as separate concerns up front saves weeks of debugging later. ([Process Model | Electron docs](https://www.electronjs.org/docs/latest/tutorial/process-model))

#### Main process

Exactly **one** main process per Electron app. It is a Node.js runtime with full filesystem, network, and OS access. Its job is to:

- Manage application lifecycle (`app.whenReady`, `app.on('window-all-closed')`, `app.quit`).
- Create and own `BrowserWindow` and `WebContentsView` instances ([BrowserWindow | Electron API](https://www.electronjs.org/docs/latest/api/browser-window), [WebContentsView | Electron API](https://www.electronjs.org/docs/latest/api/web-contents-view)).
- Expose OS APIs that renderers cannot touch directly: `dialog`, `Menu`, `Tray`, `Notification`, `globalShortcut`, `powerMonitor`, `screen`, custom protocol registration. See C4 for the survey.
- Serve as the single trusted IPC endpoint — every `ipcMain.handle` lives here.
- Spawn `utilityProcess` children, manage code signing identity, and host the auto-updater. See C5 / C7.

The main process *renders nothing*. It does not have a `window` or `document` global. If you `require('fs')` from a Vite renderer build, you are doing it wrong (or you've turned off `contextIsolation` — also wrong).

#### Renderer processes

**One renderer per `BrowserWindow`** (and one per `<webview>` tag, plus one per `WebContentsView`). Each renderer is a Chromium tab-equivalent: full DOM, full Web APIs, full V8. By default since Electron 20 (Aug 2022), every renderer is **sandboxed**: it runs as a low-privilege OS process with no Node integration and no direct filesystem access. ([Process Sandboxing | Electron docs](https://www.electronjs.org/docs/latest/tutorial/sandbox), as of 2026-04 with Electron 41.)

What renderers cannot do without a bridge:
- `require()` Node modules.
- Touch the filesystem.
- Open native dialogs or menus.
- Register protocol handlers.

What renderers *can* do (just like a normal web page):
- Use `fetch`, WebSockets, IndexedDB, `localStorage`, Web Workers, Service Workers, WebRTC, WebGL, WASM, WebAssembly threads.
- Use the `MessageChannel` and `MessagePort` Web APIs (this matters — see below).

The renderer's job is the UI. Anything that needs the OS goes through the preload bridge.

#### Preload scripts

A preload script is JavaScript that runs in a renderer process **before any web page scripts**, in an **isolated world** with limited Node access (`require`, `process`, `Buffer`, plus a curated subset of Electron renderer APIs). It is the only place where you can reach both `window` and `require('electron')` simultaneously. ([Process Sandboxing | Electron docs — Preload scripts section](https://www.electronjs.org/docs/latest/tutorial/sandbox#preload-scripts))

Why it exists, in one sentence: **the preload is the trust boundary** that lets you build a small, audited API for the renderer instead of handing it the whole `electron` module.

Two non-obvious facts:

1. **Sandboxed preloads are restricted Node.** Since Electron 20, the default preload runs in a sandbox alongside the renderer it serves. You get `electron.contextBridge`, `electron.ipcRenderer`, and a few Node primitives — not `fs`, not `child_process`. If you need a true Node preload, you have to opt out of sandbox per-window (`webPreferences.sandbox: false`), and that's discouraged ([sandbox docs — preload scripts](https://www.electronjs.org/docs/latest/tutorial/sandbox#preload-scripts)).
2. **Isolated world ≠ separate context from main world.** It's the same V8 isolate, but two separate "contexts" (in V8 terms): preload globals, prototypes, and references are walled off from page scripts. The page cannot grab the preload's `ipcRenderer` even if it tries to walk `window.__proto__` chains. ([Context Isolation | Electron docs](https://www.electronjs.org/docs/latest/tutorial/context-isolation))

### `contextBridge.exposeInMainWorld`

This is the only sanctioned way to surface APIs from the preload to the page. ([contextBridge | Electron API](https://www.electronjs.org/docs/latest/api/context-bridge))

```js
// preload.cjs
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  ping: () => ipcRenderer.invoke('ping'),
  saveFile: (data) => ipcRenderer.invoke('files:save', data),
  onUpdateAvailable: (cb) => {
    const listener = (_event, info) => cb(info)
    ipcRenderer.on('update:available', listener)
    return () => ipcRenderer.off('update:available', listener)
  },
})
```

What `exposeInMainWorld` does:
- Copies primitives (numbers, strings, booleans) and proxies functions across the world boundary.
- Functions invoked from the page are called in the preload's context — closures, captured `ipcRenderer`, and Node-flavored variables stay on the preload side.
- Throws if you try to expose a non-cloneable, non-callable value (a class instance with prototype methods, a Symbol, a `Promise` that's not the return of a function call, etc.).

What is **safe** to expose:
- Pure functions that take serializable arguments, call `ipcRenderer.invoke`, and return promises.
- Subscribe/unsubscribe pairs for `ipcRenderer.on` events — return the unsubscribe so the page can clean up.
- Read-only constants (`appVersion: process.env.npm_package_version`).

What is **not** safe to expose:
- The raw `ipcRenderer` object. It has `sendSync` (blocking), `postMessage`, and lets you talk on any channel. Audited products like 1Password's `electron-secure-defaults` ban this outright ([electron-secure-defaults | GitHub](https://github.com/1password/electron-secure-defaults/)).
- Anything that takes a `channel: string` argument from the page. The page chooses the channel name → the page can call any handler. Always hard-code channel names in the preload.
- Functions that return Node objects (`fs.ReadStream`, `Buffer`). They won't survive the structured-clone semantics and the page can't safely use them anyway.
- `process` (especially `process.env`) — leaks env vars to the page.

The mental model: **the preload is your `lib/api.ts` for the renderer**. Everything inside is scrutinized; everything outside (= page scripts) is treated as adversarial — same as you'd treat any code from `node_modules` you don't fully control.

### `ipcRenderer` ↔ `ipcMain`

Two patterns, picked by use case. ([Inter-Process Communication | Electron docs](https://www.electronjs.org/docs/latest/tutorial/ipc))

#### `invoke` / `handle` — request/response (preferred)

Available since Electron 7 (Oct 2019). Promise-based; structured error propagation; one handler per channel. ([ipcMain.handle | Electron API](https://www.electronjs.org/docs/latest/api/ipc-main#ipcmainhandlechannel-listener), [ipcRenderer.invoke | Electron API](https://www.electronjs.org/docs/latest/api/ipc-renderer#ipcrendererinvokechannel-args)). This is the **default IPC pattern as of 2026-04** and the one templated in build-kit/02.

```js
// main.cjs
const { ipcMain, app } = require('electron')
const { promises: fs } = require('node:fs')
const path = require('node:path')

ipcMain.handle('files:save', async (_event, { name, data }) => {
  const userData = app.getPath('userData')
  const filePath = path.join(userData, name)
  await fs.writeFile(filePath, data)
  return { ok: true, path: filePath }
})
```

```js
// renderer (via preload-exposed window.api)
const result = await window.api.saveFile({ name: 'note.txt', data: 'hello' })
```

Properties of `invoke/handle`:
- **One handler per channel.** `ipcMain.handle('foo', ...)` registered twice throws.
- **Errors propagate.** Throw inside the handler → renderer's `await` rejects with the same `message`. Stack traces are *not* preserved across the IPC boundary; structure your errors with codes if the renderer needs to discriminate.
- **Arguments are structured-cloned.** No functions, no DOM nodes, no unserializable types. Use plain objects, `Date`, `ArrayBuffer`, typed arrays.
- **Sender object on the main side** (`event.sender`) tells you which `WebContents` invoked the call. Use it for ACL: "is this renderer allowed to call this channel?" — the IPC docs include a [security note](https://www.electronjs.org/docs/latest/tutorial/security#17-validate-the-senderframe-on-all-ipc-handlers) recommending `event.senderFrame.url` validation when you're hosting third-party content.

#### `send` / `on` — fire-and-forget

The original (Electron 1.x) IPC. One-way; no return value; multiple listeners allowed. Use for:

- Main → renderer push (e.g., `mainWindow.webContents.send('update:available', info)`).
- Renderer → main fire-and-forget logging or analytics where you don't need the answer.

Avoid for anything that has a "did it succeed?" question — write `invoke/handle` instead. The community gravitated to `invoke/handle` because untracked `send` calls become easy to misuse: the page sends, the main side has no handler, and you get silent failures. ([Inter-Process Communication | Electron docs](https://www.electronjs.org/docs/latest/tutorial/ipc#pattern-1-renderer-to-main-one-way))

```js
// renderer → main one-way
window.api.recordEvent({ kind: 'page-view', path: '/dashboard' })

// preload
contextBridge.exposeInMainWorld('api', {
  recordEvent: (event) => ipcRenderer.send('analytics:event', event),
})

// main
ipcMain.on('analytics:event', (_event, payload) => {
  analyticsQueue.push(payload)
})
```

#### `sendSync` — don't

`ipcRenderer.sendSync` blocks the renderer until main responds. It is **synchronous and slow**. Use it only when porting legacy code; new code should always use `invoke`. The Electron docs explicitly recommend against it. ([Inter-Process Communication | Electron docs](https://www.electronjs.org/docs/latest/tutorial/ipc))

### MessagePorts

When `invoke/handle` is not enough — typically because you need streaming, very high-throughput data, transfer of `ArrayBuffer` ownership without copy, or a renderer-to-renderer or renderer-to-utility-process channel — Electron exposes the Web standard `MessagePort` API across the IPC boundary. ([MessagePorts in Electron | Electron docs](https://www.electronjs.org/docs/latest/tutorial/message-ports))

The pattern: **main acts as a port broker**. It creates a `MessageChannelMain` (the main-process equivalent of the Web `MessageChannel`), then hands one port to each peer via `webContents.postMessage`. After that, the two peers talk directly without going through main on each message.

```js
// main.cjs — broker between two windows
const { app, BrowserWindow, MessageChannelMain } = require('electron')

app.whenReady().then(() => {
  const a = new BrowserWindow({ webPreferences: { preload: 'preload.cjs' } })
  const b = new BrowserWindow({ webPreferences: { preload: 'preload.cjs' } })

  const { port1, port2 } = new MessageChannelMain()
  a.webContents.postMessage('peer-port', null, [port1])
  b.webContents.postMessage('peer-port', null, [port2])
})
```

```js
// preload.cjs — surface the inbound port to the page
const { contextBridge, ipcRenderer } = require('electron')

ipcRenderer.on('peer-port', (event) => {
  const [port] = event.ports
  // expose to page, or use directly here
  window.postMessage('peer-port-ready', '*', [port])
})
```

When MessagePorts beat `invoke/handle`:
- **Streaming**: a long-running job in the main or utility process posts `progress` messages to the renderer at high frequency.
- **Transferable ownership**: send an `ArrayBuffer` once, transfer ownership, no copy. `invoke/handle` always structured-clones arguments and return values.
- **Renderer ↔ renderer**: two windows that need to gossip without main as a bottleneck (multi-window state sync, draggable UI elements between windows).
- **Renderer ↔ utility process**: see below.

Caveats (current as of 2026-04):
- A `MessagePort` once posted is **detached** in the sender. Don't try to reuse it.
- The renderer-side `MessagePort` is the Web Platform `MessagePort`, not an Electron-specific class — so you start it with `port.start()` (or by adding an `onmessage` handler) and post with `port.postMessage`.
- On the main side, the equivalent class is `MessagePortMain`. Slightly different surface (`.on('message', ...)` instead of `.onmessage`).

### Process counts in a typical app

A normal Electron app at runtime has more than the "main + N renderers" count people quote. Concretely, on a quiet macOS Activity Monitor:

| Process kind | Count | Origin |
|---|---|---|
| Main | 1 | Your `main.js`, started by Electron binary. |
| Renderer | N | One per `BrowserWindow` + one per `<webview>` + one per `WebContentsView` (with `webPreferences`). |
| GPU process | 1 | Chromium graphics; not user-controllable. |
| Network service | 1 | Chromium network stack out-of-process (default since modern Chromium). |
| Utility | 0..N | Chromium's own utility processes (audio, storage) plus any you spawn via `utilityProcess`. |
| Crashpad handler | 1 | Out-of-process crash collector ([crashReporter | Electron API](https://www.electronjs.org/docs/latest/api/crash-reporter)). |
| Pepper / GPU helper | 0..1 | macOS specific; helper bundles inside Electron's `Frameworks/`. |

The number worth knowing is **N renderers**. RAM budgets balloon fast: each renderer carries a V8 heap, a Blink instance, and (since v20) a separate OS process for sandboxing. A 6-window Slack workspace is genuinely 6+ Chromium tabs in memory.

### `utilityProcess` — for CPU-heavy work

Electron 22 (Dec 2022) added [utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process), a first-party way to spawn a Node-flavored child process with structured IPC, *without* spinning up a hidden `BrowserWindow` (the old hack). Use cases:

- Parsing very large JSON / XML / Protobuf in the background.
- Hashing, crypto, ML inference, image processing.
- Long-running native module work that would block the main process's event loop.
- Anything you'd reach for a Node `Worker` for, but where you need to load a different `package.json` / different runtime flags.

```js
// main.cjs
const { app, utilityProcess, MessageChannelMain } = require('electron')
const path = require('node:path')

app.whenReady().then(() => {
  const child = utilityProcess.fork(path.join(__dirname, 'workers/hash.js'), [], {
    serviceName: 'hasher',
    stdio: 'pipe',
  })

  const { port1, port2 } = new MessageChannelMain()
  child.postMessage({ kind: 'init' }, [port1])
  // hand port2 to a renderer that wants to talk to the worker directly
})
```

The utility process is a **Node.js process**, not a renderer — no DOM, no Chromium. It speaks `process.parentPort` to its parent (the main process) and can be wired up to renderers via `MessagePort`. ([utilityProcess | Electron API](https://www.electronjs.org/docs/latest/api/utility-process), as of Electron 41 in 2026-04.)

When to use which:
- **Node `Worker` thread**: pure compute, share `SharedArrayBuffer`, no Electron-specific reason.
- **`utilityProcess`**: needs Electron features (allowed loading from local files via `app://`, controllable by lifecycle), or needs an OS-level isolation boundary (a crash here doesn't take down main).
- **Hidden `BrowserWindow`**: deprecated as a workaround. Don't.

### `WebContentsView` vs. `BrowserView`

This matters for "wrap a web app" architectures (Slack, Discord, Notion shells). Until 2024, `BrowserView` was the way to embed a `WebContents` (effectively another renderer) inside a `BrowserWindow` without using a `<webview>` tag. As of Electron 30 (April 2024), `BrowserView` is **deprecated**, and as of Electron 41 (April 2026) it has been removed in favor of [`WebContentsView`](https://www.electronjs.org/docs/latest/api/web-contents-view). ([Migrating from BrowserView to WebContentsView | Electron blog (2025-09)](https://www.electronjs.org/blog/migrate-to-webcontentsview))

The migration is mostly mechanical:

```js
// Before (deprecated)
const { BrowserView, BrowserWindow } = require('electron')
const win = new BrowserWindow()
const view = new BrowserView({ webPreferences: { preload } })
win.setBrowserView(view)
view.setBounds({ x: 0, y: 80, width: 800, height: 520 })
view.webContents.loadURL('https://app.example.com')

// After
const { BaseWindow, WebContentsView } = require('electron')
const win = new BaseWindow()
const view = new WebContentsView({ webPreferences: { preload } })
win.contentView.addChildView(view)
view.setBounds({ x: 0, y: 80, width: 800, height: 520 })
view.webContents.loadURL('https://app.example.com')
```

`WebContentsView` is the lower-level primitive (it extends `View`, the new Chromium-style layout primitive); `BaseWindow` replaces `BrowserWindow`'s "frame + single view" model with a generic container. For most apps, the conversion is `BrowserView` → `WebContentsView` and `BrowserWindow` → `BaseWindow` (or keep `BrowserWindow` and use its `contentView`). Cited in [CS2 Slack & Discord](../case-studies/02-slack-discord.md) — both apps use this pattern for per-workspace isolation.

### Sandbox + node integration: quick recap

The combination that should be true for every renderer in a 2026 app:

```js
// main.cjs
new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,    // default since v12
    nodeIntegration: false,    // default since v5
    sandbox: true,             // default since v20
    webSecurity: true,         // default
  },
})
```

These are the modern defaults; you should not flip them. The full rationale lives in [C3 Security](03-security.md) — it walks the official 17-point checklist line by line. The relevant fact for *this* page is: **the preload-bridged `contextBridge` API is the only way these settings are usable in practice**. Without `contextBridge`, your renderer has no Node, no IPC, nothing — exactly the secure starting point you want, plus a small surface you choose to expose.

## Mini-example — typed IPC contract (excerpt)

The full pattern lives in [build-kit/templates/02-ipc-contract.md](../../build-kit/templates/02-ipc-contract.md). Compressed sketch:

```ts
// shared/ipc-contract.ts — the SINGLE source of truth
export type IpcContract = {
  'ping': { request: void; response: 'pong' }
  'files:save': { request: { name: string; data: string }; response: { ok: true; path: string } }
  'app:get-version': { request: void; response: string }
}

export type IpcChannel = keyof IpcContract
export type IpcRequest<C extends IpcChannel> = IpcContract[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response']
```

```ts
// preload.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse } from './shared/ipc-contract'

const invoke = <C extends IpcChannel>(channel: C, req: IpcRequest<C>): Promise<IpcResponse<C>> =>
  ipcRenderer.invoke(channel, req)

contextBridge.exposeInMainWorld('api', {
  ping: () => invoke('ping', undefined),
  saveFile: (req: IpcRequest<'files:save'>) => invoke('files:save', req),
  appVersion: () => invoke('app:get-version', undefined),
})
```

```ts
// main.ts
import { ipcMain } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse } from './shared/ipc-contract'

function handle<C extends IpcChannel>(
  channel: C,
  fn: (req: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>,
): void {
  ipcMain.handle(channel, (_event, req: IpcRequest<C>) => fn(req))
}

handle('ping', async () => 'pong')
handle('files:save', async ({ name, data }) => ({ ok: true, path: await save(name, data) }))
handle('app:get-version', async () => app.getVersion())
```

```ts
// renderer.ts
const pong = await window.api.ping()              // type: 'pong'
const saved = await window.api.saveFile({ ... })  // type: { ok: true, path: string }
```

The point: **a typo in any channel name fails at compile time**. The renderer cannot call a channel that the main side doesn't handle, and vice versa. Add a new channel? Update `IpcContract` once; both sides break loudly until you fix them. Build-kit Template 02 generalizes this with a `defineIpcChannel` helper, and pairs it with [Template 01 Secure preload](../../build-kit/templates/01-secure-preload.md) for the full pattern.

## Cross-links

- [C1 Fundamentals](01-fundamentals.md) — what an Electron app is at the highest level; the three-process model in two paragraphs.
- [C3 Security](03-security.md) — context isolation, sandbox, fuses, ASAR integrity, CVE catalog. The security argument for *why* the preload boundary exists.
- [C4 Native integrations](04-native-integrations.md) — which OS APIs live on the main side (file dialogs, deep links, tray, notifications); the natural counterpart of "what to expose via IPC."
- [C8 Frontend stack](08-frontend-stack.md) — Vite / Webpack / ESM in practice; how preload entry points are wired through Forge / electron-vite.
- [C9 Backend connectivity](09-backend-connectivity.md) — main-process `net` / `fetch` to remote APIs; why you usually call backends from main and proxy results to renderers via IPC.
- [Template 01 Secure preload](../../build-kit/templates/01-secure-preload.md) — minimal `preload.cjs` with capability-limited `contextBridge` surface.
- [Template 02 IPC contract](../../build-kit/templates/02-ipc-contract.md) — the full typed IPC pattern; a generalized `defineIpcChannel` helper and shared-types layout.
- [CS1 VS Code](../case-studies/01-vscode.md) — sandbox migration story; how a large app moved its renderers to fully sandboxed mode while keeping an extension host alive.
- [CS2 Slack & Discord](../case-studies/02-slack-discord.md) — per-workspace `WebContentsView` (formerly `BrowserView`) architecture.

## Sources

- [Process Model | Electron docs](https://www.electronjs.org/docs/latest/tutorial/process-model) — canonical description of main / renderer / preload (as of Electron 41, 2026-04)
- [Inter-Process Communication | Electron docs](https://www.electronjs.org/docs/latest/tutorial/ipc) — `invoke`/`handle` vs. `send`/`on` patterns; security note on validating `senderFrame`
- [contextBridge | Electron API](https://www.electronjs.org/docs/latest/api/context-bridge) — `exposeInMainWorld` reference; structured-clone semantics
- [Process Sandboxing | Electron docs](https://www.electronjs.org/docs/latest/tutorial/sandbox) — sandbox default since v20; preload-script restrictions
- [Context Isolation | Electron docs](https://www.electronjs.org/docs/latest/tutorial/context-isolation) — default since v12; isolated worlds explained
- [ipcMain | Electron API](https://www.electronjs.org/docs/latest/api/ipc-main) — `handle`, `on`, `removeHandler`
- [ipcRenderer | Electron API](https://www.electronjs.org/docs/latest/api/ipc-renderer) — `invoke`, `send`, `postMessage`, `sendSync` (avoid)
- [MessagePorts in Electron | Electron docs](https://www.electronjs.org/docs/latest/tutorial/message-ports) — `MessageChannelMain` broker pattern; transferable ownership
- [utilityProcess | Electron API](https://www.electronjs.org/docs/latest/api/utility-process) — added Electron 22 (Dec 2022); Node-flavored worker child
- [Migrating from BrowserView to WebContentsView | Electron blog](https://www.electronjs.org/blog/migrate-to-webcontentsview) — BrowserView deprecated in Electron 30 (April 2024), removed in 41 (as of 2026-04)
- [WebContentsView | Electron API](https://www.electronjs.org/docs/latest/api/web-contents-view) — replacement for BrowserView; pairs with `BaseWindow` / `BrowserWindow.contentView`
- [BrowserWindow | Electron API](https://www.electronjs.org/docs/latest/api/browser-window) — windowing primitive; `webPreferences` reference
- [crashReporter | Electron API](https://www.electronjs.org/docs/latest/api/crash-reporter) — Crashpad-backed crash collection; mention here for process-count completeness
- [electron-secure-defaults | 1Password GitHub](https://github.com/1password/electron-secure-defaults/) — opinionated security starter; bans raw `ipcRenderer` exposure
