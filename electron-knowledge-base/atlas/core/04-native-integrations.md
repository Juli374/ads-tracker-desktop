# C4. Native integrations — FS, deep links, tray, native modules, Rust via napi-rs

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

Electron exposes the OS surface — file system dialogs, notifications, tray icons, menus, deep links via custom protocols, screen / power / display events — through a stable set of main-process APIs that are well-documented upstream; this page is a *map of what exists and the patterns that bite*, not a re-paraphrase. It also covers the **device APIs (WebUSB / WebSerial / WebHID)** that Electron exposes via session permission handlers, and the **native-module + Rust integration** path: `@electron/rebuild` for ABI-mismatched binaries, `napi-rs` (currently v3.8.6, released Apr 29 2026) ([napi-rs releases](https://github.com/napi-rs/napi-rs/releases) — as of 2026-04) when JavaScript can't go fast or low enough, and 1Password's Electron-plus-Rust split as the production reference architecture.

## When to apply

- You need **OS-level UX** that the renderer can't reach: tray icon, native menu bar, system notifications, file open/save dialogs, drag-out files, recent-document lists.
- You need **deep links / single-instance behavior** — `myapp://oauth-callback` style URLs to receive OAuth redirects, share-target URLs, or "open with" handlers.
- You need **device access** — barcode scanner, label printer, hardware token, USB serial gadget. WebHID / WebSerial / WebUSB cover most cases; native modules cover the rest.
- You need to wrap a **native library** (C / C++ / Rust / Swift / Objective-C) — typical reasons: cryptography (1Password's Rust core), platform-specific APIs (e.g. macOS Keychain beyond `safeStorage`), high-throughput data crunching, codecs / DSP, embedded SQLite that must run synchronously on the main thread.
- You need a **fast SQLite** in the main process — `better-sqlite3` is the canonical example of a native module almost every non-trivial Electron app needs (see [C9 Backend connectivity](09-backend-connectivity.md)).

## When NOT to apply

- **Don't reach for native modules** if a pure-JS package will do. Native modules turn into prebuild headaches across (Electron version × Node ABI × OS × CPU arch). Every prebuild is a release-engineering tax.
- **Don't reinvent dialogs.** `dialog.showOpenDialog` is one line; building your own modal "file picker" inside the renderer is wrong.
- **Don't roll your own deep-link parser** by reading `process.argv` blindly on Windows — there's a documented `second-instance` event flow ([Launch app from URL | Electron docs](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app)). Skip it and you ship a security hole.
- **Don't expose native-module functions directly to the renderer.** Wrap them behind `contextBridge` + `ipcMain.handle` so the trust boundary stays intact. See [C2 Process model & IPC](02-process-model-and-ipc.md) and [C3 Security](03-security.md).
- **Don't ship a native module without `@electron/rebuild`** in your packaging step. System-Node-built binaries won't load against Electron's ABI and you'll get cryptic `NODE_MODULE_VERSION` errors at runtime.

## Anatomy

### 1. Built-in OS integrations — a map, not a manual

The Electron docs already enumerate these APIs exhaustively. The table below is for *picking the right name* without leaving this page; click through for signatures and platform notes.

| Need | API | Notes |
|---|---|---|
| Open / save file dialog | [`dialog.showOpenDialog` / `showSaveDialog`](https://www.electronjs.org/docs/latest/api/dialog) | Main-process only. Returns a Promise. Modal vs. modeless via the `browserWindow` arg. |
| Drag a file *into* the renderer | HTML5 drag-and-drop — works automatically; `event.dataTransfer.files` carries `File` objects | The renderer is just Chromium. |
| Drag a file *out* of the renderer | [`webContents.startDrag`](https://www.electronjs.org/docs/latest/api/web-contents#contentsstartdragitem) (main process, triggered via IPC from `mousedown`) | Required for "drag this email to Finder" patterns. |
| Recent documents (Win/macOS) | [`app.addRecentDocument`](https://www.electronjs.org/docs/latest/api/app#appaddrecentdocumentpath-macos-windows) + Info.plist / file association | macOS adds a Recents submenu under the app menu; Windows adds to Jump List. |
| Notifications (renderer) | Web standard `new Notification(title, opts)` | Just works in renderer. macOS requires the app be **notarized** for notifications to fire from packaged builds ([Notifications | Electron docs](https://www.electronjs.org/docs/latest/tutorial/notifications)). |
| Notifications (main) | [`Notification` class](https://www.electronjs.org/docs/latest/api/notification) | Same constraint; useful when the notification is triggered by a background event with no renderer. |
| Tray icon | [`Tray`](https://www.electronjs.org/docs/latest/api/tray) | Per-platform icon sizes (macOS: 22×22 template image; Windows: 16×16; Linux: 22×22). Click vs. right-click semantics differ — on macOS, left-click and right-click both open the context menu by default; on Windows, left-click is `'click'`, right-click opens the context menu. |
| App menu / context menu | [`Menu`, `MenuItem`](https://www.electronjs.org/docs/latest/api/menu) | macOS *requires* a properly structured app menu (App, File, Edit, View, Window, Help) — the OS substitutes a near-empty default if you don't supply one. Windows / Linux: the menu is per-window. |
| Shell (open URL / show in folder) | [`shell.openExternal`, `shell.showItemInFolder`, `shell.beep`](https://www.electronjs.org/docs/latest/api/shell) | Main process. `openExternal` is the "open in default browser" call. |
| Clipboard | [`clipboard`](https://www.electronjs.org/docs/latest/api/clipboard) | Available in both main and renderer. |
| Power monitor | [`powerMonitor`](https://www.electronjs.org/docs/latest/api/power-monitor) | Events: `suspend`, `resume`, `lock-screen`, `unlock-screen`, `on-battery`, `on-ac`, idle-time queries. |
| Screen / displays | [`screen`](https://www.electronjs.org/docs/latest/api/screen) | Multi-monitor layout, DPI scale factors, `display-added` / `display-removed`. |
| App activation | [`app.on('activate')`](https://www.electronjs.org/docs/latest/api/app#event-activate-macos), `app.on('open-url')`, `app.on('open-file')` | macOS Dock-click, drag-onto-Dock-icon, etc. |

The KB's job is the synthesis above; for actual signatures, **link out and don't paraphrase** ([CLAUDE.md §7](../../CLAUDE.md)).

### 2. Deep links / custom protocols

This is the most-misunderstood corner of native integration because the three OSes implement it differently.

**The shape** ([Launch app from URL | Electron docs](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app)):

```js
// main.js — early, before app.whenReady()
if (process.defaultApp) {
  // dev mode: include argv so Electron knows which JS file to launch
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('myapp', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('myapp');
}
```

**Per-OS gotchas**:

- **macOS**: deep links arrive via the [`open-url`](https://www.electronjs.org/docs/latest/api/app#event-open-url-macos) event on the `app` object. The protocol claim in Info.plist (`CFBundleURLTypes`) is what makes the OS route `myapp://...` to your bundle. **`setAsDefaultProtocolClient` is a no-op on macOS for packaged apps** — registration happens via the plist that electron-forge / electron-builder emit. Per the official docs, `app.setAsDefaultProtocolClient(...)` only works when not packaged on macOS.
- **Windows**: deep links arrive as **command-line args** to a *fresh process*. To route them into your already-running app, claim single-instance via [`app.requestSingleInstanceLock()`](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelock) and listen for [`'second-instance'`](https://www.electronjs.org/docs/latest/api/app#event-second-instance). Without single-instance, every deep-link click spawns a second copy of your app.
- **Linux**: register a `.desktop` file with the right `MimeType=x-scheme-handler/myapp;` line. electron-builder generates this for AppImage / deb / rpm targets when `protocols` is set in config; for Snap / Flatpak, the manifest formats differ.

**Single-instance is mandatory for any deep-link app.** The handler boilerplate ([app.requestSingleInstanceLock | Electron docs](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelock)):

```js
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv /*, workingDir*/) => {
    // argv on Windows contains the URL; on Linux it does too; on macOS handle via 'open-url' instead
    const url = argv.find(a => a.startsWith('myapp://'));
    if (url) routeDeepLink(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on('open-url', (event, url) => {       // macOS path
  event.preventDefault();
  routeDeepLink(url);
});
```

This pattern is the canonical OAuth-callback receiver — see [build-kit/templates/05-railway-backend-client.md](../../build-kit/templates/05-railway-backend-client.md) for the full PKCE flow.

### 3. WebUSB / WebSerial / WebHID — Electron's first-class device APIs

If you need to talk to a barcode scanner, USB-HID dongle, serial-port instrument, or a Yubikey-style token, **start here before reaching for a native module**. Electron implements the Chromium device APIs and adds main-process *permission gates* via session handlers ([Device Access | Electron docs](https://www.electronjs.org/docs/latest/tutorial/devices)).

The shape: the renderer calls `navigator.hid.requestDevice(...)` / `navigator.serial.requestPort(...)` / `navigator.usb.requestDevice(...)`, the main process *intercepts the picker* and chooses (or asks the user to choose) which device to expose.

```js
// main.js — gate device access at the session level
session.defaultSession.on('select-hid-device', (event, details, callback) => {
  event.preventDefault();
  const allowed = details.deviceList.find(d => d.vendorId === 0x1234 && d.productId === 0x5678);
  callback(allowed?.deviceId);  // null / undefined => user cancelled
});

session.defaultSession.setDevicePermissionHandler((details) => {
  // Persistent grant after first selection — return true/false
  return details.deviceType === 'hid' && trustedVendors.has(details.device.vendorId);
});
```

The same pattern applies to `select-serial-port` and `select-usb-device` events. Without these handlers Electron rejects device access by default — a sensible secure-default that catches a lot of "why doesn't `requestDevice` work in production" questions ([Device Access | Electron docs](https://www.electronjs.org/docs/latest/tutorial/devices)).

**When to use these vs. a native module**:

- WebHID / WebSerial / WebUSB: device speaks USB-HID, serial-over-USB, or raw USB bulk/interrupt; protocol is documented; you can do framing in JS. ✅ Stay in the web standard.
- Native module: you need kernel-level access (raw sockets, IOCTL, virtual COM driver), the device requires a vendor SDK that ships as a native lib, or the data rates require bypassing the JS event loop. ❌ Web APIs won't reach.

### 4. Native modules — when JS can't do it

Three reasons to drop into a native module:

1. **Wrap a vendor C/C++ library** — e.g. `better-sqlite3` wrapping SQLite, `node-canvas` wrapping Cairo, vendor SDKs that ship `.dll`/`.dylib`/`.so`.
2. **Extract performance** — synchronous SQLite, native crypto, codec work, image processing.
3. **Use a Rust crate** — increasingly common; the rest of this section covers it.

#### N-API / `node-addon-api`

The stable, ABI-versioned C API for Node native modules. Modules built against N-API survive across Node major versions *and* (because Electron exposes a compatible N-API) across Electron versions, as long as the engine ABI is satisfied at load time. The `node-addon-api` C++ wrapper sits on top with a saner ergonomic surface ([Native Code and Electron | Electron docs](https://www.electronjs.org/docs/latest/tutorial/native-code-and-electron)).

This is the modern path for new C/C++ addons. Avoid raw V8 / NAN unless you're maintaining legacy code — those bind to a specific V8 version and break on every Electron / Node bump.

#### `napi-rs` — Rust → N-API

`napi-rs` lets you write Node native modules in Rust ([napi.rs](https://napi.rs/), [napi-rs/napi-rs on GitHub](https://github.com/napi-rs/napi-rs)). It's the de-facto choice when the team already has Rust expertise or wants to share crates with non-Node consumers. Current version: **3.8.6**, released **April 29, 2026** ([napi-rs releases](https://github.com/napi-rs/napi-rs/releases) — as of 2026-04).

Reasons to pick it:

- **Single source of native logic** that can also feed a Tauri / WASM / native-CLI consumer.
- **Memory safety** — the Rust compiler catches the `Buffer`-out-of-bounds class of bugs that bit `node-canvas` and other C++ addons over the years.
- **Cross-compilation** is well-trodden; the napi-rs CLI ships matrix-build helpers and the project publishes `@napi-rs/cli` for scaffolding (`napi new`, `napi build`, `napi prepublish`).
- **Production-proven** on the high end (1Password 8's core; see [CS4 1Password](../case-studies/04-1password.md)) and the everyday end (`@napi-rs/canvas`, the Cairo-free 2D canvas, downloads in the millions per week per [npm](https://www.npmjs.com/package/@napi-rs/canvas)).

What you write looks like:

```rust
// lib.rs
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
fn fibonacci(n: u32) -> u64 {
    let (mut a, mut b) = (0u64, 1u64);
    for _ in 0..n { let t = b; b = a + b; a = t; }
    a
}
```

…and you `npm install` the resulting package like any other native addon.

#### `node-gyp` and building from source

When prebuilds aren't available for your (Electron version × OS × arch) tuple — or you've forked the addon — `node-gyp` compiles from C/C++ sources. Common pain points:

- **Windows**: needs Visual Studio Build Tools (the "Desktop development with C++" workload) and Python 3 on PATH. The `windows-build-tools` npm package is unmaintained — install VS Build Tools manually.
- **macOS**: needs Xcode Command Line Tools (`xcode-select --install`).
- **Linux**: needs `build-essential`, `python3`, and per-package native deps (e.g. `libsqlite3-dev`).

For Rust addons via `napi-rs`, the toolchain is `cargo` + the right Rust target — the napi-rs CLI handles invocation; `node-gyp` is not in the loop.

#### ABI mismatch — the Electron ABI ≠ Node ABI gotcha

This is the most common native-module bug. **Electron ships its own embedded Node, with its own V8, with its own ABI version.** A native module built against system Node (e.g. Node 20 or 22 on your dev box) will fail to load inside Electron with `Module did not self-register` or `NODE_MODULE_VERSION mismatch` ([Native Node Modules | Electron docs](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)).

**The fix**: rebuild against Electron's headers. The tool is **`@electron/rebuild`** (formerly `electron-rebuild`); current version **4.0.3**, requires Node 22.12+ ([@electron/rebuild | npm](https://www.npmjs.com/package/@electron/rebuild) — as of 2026-04). Source: [electron/rebuild on GitHub](https://github.com/electron/rebuild).

```bash
# After installing native deps:
npx electron-rebuild
# or as an npm script post-install:
"scripts": { "postinstall": "electron-rebuild" }
```

Electron Forge runs `@electron/rebuild` automatically during `package` ([Native Node Modules | Electron docs](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)); electron-builder runs it at install / pack time. If you ship a custom build pipeline, wire it explicitly — forgetting this is the #1 reason "native module works in dev, breaks in prod build."

For modules with prebuilt binaries (most major addons publish them via `prebuild-install` or `node-pre-gyp`), the prebuild matrix usually covers Electron — `@napi-rs/*` and `better-sqlite3` are reliable here. Custom or niche addons usually require the rebuild step on the build machine.

#### Native modules + V8 memory cage (Electron 21+)

Electron 21 enabled **V8's memory cage / sandboxed pointers** ([Electron and the V8 Memory Cage | Electron blog](https://www.electronjs.org/blog/v8-memory-cage)). The cage forbids `ArrayBuffer` from pointing at memory outside V8's heap. Native modules that wrap external buffers (mmap'd files, GPU buffers, DSP rings) and expose them as `ArrayBuffer` **break** under the cage — they have to copy into a V8-allocated buffer or use an external store the cage knows about.

For modules that can't be ported, Electron exposes a fuse to disable the cage (`RuntimeEnabledFeatures::DisableV8MemoryCage`). **Don't flip this fuse unless you know exactly what you're losing** — it's the same V8 sandbox the Chrome team relies on for renderer escape mitigations. See [C3 Security](03-security.md) for the fuse story.

This is the single nontrivial native-module issue introduced by post-Electron-21 versions; if you're upgrading an old codebase, it's the first thing to check.

## Mini-example

A minimal `main.js` registering a custom protocol, claiming single-instance, and creating a tray icon — the three most-used native integrations together.

```js
// main.js
const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');

let mainWindow;
let tray;

// 1. Single-instance + deep-link routing
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', (_e, argv) => {
    const url = argv.find(a => a.startsWith('myapp://'));
    if (url) routeDeepLink(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// 2. Custom protocol registration (effective only when packaged on macOS)
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient('myapp', process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient('myapp');
}

// macOS path
app.on('open-url', (event, url) => {
  event.preventDefault();
  routeDeepLink(url);
});

function routeDeepLink(url) {
  // Parse and dispatch to renderer via IPC, e.g. for OAuth callback
  mainWindow?.webContents.send('deep-link', url);
}

app.whenReady().then(() => {
  // 3. Main window
  mainWindow = new BrowserWindow({
    width: 1024, height: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.loadFile('index.html');

  // 4. Tray icon (use a 22x22 template image on macOS for proper dark-mode behavior)
  const icon = nativeImage.createFromPath(path.join(__dirname, 'tray-icon.png'));
  tray = new Tray(icon);
  tray.setToolTip('My App');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
  tray.on('click', () => mainWindow.show());  // Windows / Linux convention
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

About 60 lines including comments. Three integration patterns (single-instance, custom protocol, tray) are visible together. For the OAuth-callback elaboration, the SQLite cache, and the WebSocket reconnect that complete the Railway-backend story, see [build-kit/templates/05-railway-backend-client.md](../../build-kit/templates/05-railway-backend-client.md).

## Cross-links

- [C2 Process model & IPC](02-process-model-and-ipc.md) — the trust boundary native modules and protocol handlers must respect.
- [C3 Security](03-security.md) — `contextBridge` exposure rules; V8 memory cage; ASAR integrity (matters for native modules shipped inside ASAR).
- [C5 Packaging & code signing](05-packaging-and-signing.md) — how protocol claims (Info.plist on macOS, registry keys on Windows, `.desktop` files on Linux) are emitted by Forge / electron-builder; how native modules are bundled and signed.
- [C9 Backend connectivity](09-backend-connectivity.md) — uses `better-sqlite3` (a native module) as the canonical local cache; uses the deep-link pattern from this page for OAuth callbacks.
- [CS4 1Password](../case-studies/04-1password.md) — production reference for Electron + Rust core (via `napi-rs`), plus 1Password's hardening libraries (`electron-secure-defaults`, `electron-hardener`).
- [build-kit/templates/01-secure-preload.md](../../build-kit/templates/01-secure-preload.md) — the preload pattern that exposes native-module-backed IPC handlers safely.
- [build-kit/templates/05-railway-backend-client.md](../../build-kit/templates/05-railway-backend-client.md) — full deep-link OAuth + safeStorage + offline cache walk-through.

## Sources

- [Deep Links / Launch from URL | Electron docs](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app) — single-instance + `open-url` pattern (as of 2026-04)
- [protocol | Electron API](https://www.electronjs.org/docs/latest/api/protocol) — for in-app protocol *handlers* (distinct from OS-level deep-link claim)
- [Notifications | Electron docs](https://www.electronjs.org/docs/latest/tutorial/notifications) — macOS notarization requirement
- [Tray | Electron API](https://www.electronjs.org/docs/latest/api/tray) — per-platform icon and click semantics
- [Menu | Electron API](https://www.electronjs.org/docs/latest/api/menu) — macOS app-menu obligation
- [dialog | Electron API](https://www.electronjs.org/docs/latest/api/dialog)
- [shell | Electron API](https://www.electronjs.org/docs/latest/api/shell)
- [powerMonitor | Electron API](https://www.electronjs.org/docs/latest/api/power-monitor)
- [screen | Electron API](https://www.electronjs.org/docs/latest/api/screen)
- [app | Electron API](https://www.electronjs.org/docs/latest/api/app) — `requestSingleInstanceLock`, `second-instance`, `open-url`, `open-file`, `addRecentDocument`
- [Device Access (WebHID, WebUSB, WebSerial) | Electron docs](https://www.electronjs.org/docs/latest/tutorial/devices) — `select-hid-device`, `select-serial-port`, `select-usb-device`, `setDevicePermissionHandler` (as of 2026-04)
- [Native Code and Electron | Electron docs](https://www.electronjs.org/docs/latest/tutorial/native-code-and-electron) — N-API recommendation
- [Native Node Modules | Electron docs](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules) — the ABI-rebuild story; Forge/Builder integration
- [@electron/rebuild on GitHub](https://github.com/electron/rebuild) — formerly `electron-rebuild`; **v4.0.3** as of 2026-04 ([npm](https://www.npmjs.com/package/@electron/rebuild)), requires Node 22.12+
- [napi.rs](https://napi.rs/) — Rust → N-API framework
- [napi-rs on GitHub](https://github.com/napi-rs/napi-rs) — current release **v3.8.6 (2026-04-29)** ([releases](https://github.com/napi-rs/napi-rs/releases) — as of 2026-04)
- [napi-rs changelog](https://napi.rs/changelog/napi)
- [Electron and the V8 Memory Cage | Electron blog](https://www.electronjs.org/blog/v8-memory-cage) — why some native modules break post-Electron-21
- [@napi-rs/canvas | npm](https://www.npmjs.com/package/@napi-rs/canvas) — production-proven napi-rs example
- [better-sqlite3 | GitHub](https://github.com/WiseLibs/better-sqlite3) — the canonical Electron native module (synchronous SQLite)

Unverified at draft time / flagged for refresh:

- macOS notification behavior for *unsigned* dev builds varies by Gatekeeper version; the docs note "may not appear" — re-test on current macOS at packaging time.
- Forge's automatic `@electron/rebuild` invocation and `Native Code and Electron` docs are stable as of 2026-04, but worth re-verifying after each Electron major (the page is in the 🔁 refresh set indirectly via the embedded napi-rs version).
