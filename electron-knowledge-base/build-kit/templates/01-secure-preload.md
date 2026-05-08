# Template 1 — Secure preload (contextBridge)

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

A secure preload script:

- Uses `contextBridge.exposeInMainWorld` only — never assigns to `window.*` or `global.*` directly. With `contextIsolation: true` (default since v12) those assignments wouldn't even cross worlds; with isolation off they'd be a security catastrophe.
- Exposes a **small, typed surface** — think 5-15 functions, not "all of `ipcRenderer`." The renderer should be able to call only what your app actually needs.
- Validates inputs at the bridge before forwarding to main, then validates again in the main handler. Defense in depth.
- Returns Promises via `ipcRenderer.invoke` (paired with `ipcMain.handle`) for request/response. Reserve `send`/`on` for genuine fire-and-forget events.

## What this template gives you

A copy-pasteable `preload.ts` plus matching `renderer.d.ts` declaration that demonstrates the four canonical patterns:

1. **Promise round-trip** (`invoke` / `handle`) — the default for renderer→main calls.
2. **Validated input** at the bridge — example shape-check before forwarding.
3. **Event subscription** (`on` with cleanup) — for one-way main→renderer streams (progress, updates, push).
4. **Static getter** — exposing a constant (e.g. `process.platform`) as a value, not a function.

Plus the matching `ipcMain.handle` snippet on the main side and the `BrowserWindow` `webPreferences` block that wires it all together.

## The template

```ts
// preload/preload.ts
//
// Runs in the preload world: has Node access *and* a handle to the renderer's
// main world via contextBridge. Anything we expose here is the renderer's
// entire view of "the app's privileged surface" — keep it small and audited.

import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

// ────────────────────────────────────────────────────────────────────────────
// 1. Validation helpers — never trust the renderer.
//    Cheap checks at the bridge stop obvious abuse before it hits IPC; the
//    main process must still validate (defense in depth).
// ────────────────────────────────────────────────────────────────────────────

function isNonEmptyString(x: unknown, max = 10_000): x is string {
  return typeof x === 'string' && x.length > 0 && x.length <= max;
}

// ────────────────────────────────────────────────────────────────────────────
// 2. The exposed API. Keep it small. Each function is a *capability*: the
//    renderer can only do what's explicitly listed here.
// ────────────────────────────────────────────────────────────────────────────

const api = {
  // -- Pattern A: Promise round-trip (preferred for renderer→main calls) ----
  // ipcRenderer.invoke pairs with ipcMain.handle. One round-trip, structured
  // response, exceptions in the handler propagate as rejected promises.
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping'),

  // -- Pattern B: validated input before forwarding -------------------------
  // Reject malformed inputs at the bridge. The main handler still re-validates.
  saveNote: (
    text: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!isNonEmptyString(text)) {
      return Promise.resolve({ ok: false, error: 'invalid input' });
    }
    return ipcRenderer.invoke('notes:save', text);
  },

  // -- Pattern C: event subscription (main → renderer one-way) --------------
  // Wrap the listener so the renderer never sees the IpcRendererEvent (which
  // contains a reference to the sender). Return a disposer for cleanup.
  onUpdateAvailable: (
    listener: (version: string) => void,
  ): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, version: string): void => {
      listener(version);
    };
    ipcRenderer.on('update:available', wrapped);
    return () => {
      ipcRenderer.removeListener('update:available', wrapped);
    };
  },

  // -- Pattern D: static getter (only for trivial constants) ----------------
  // Values are structured-cloned across the bridge. Don't try to expose
  // stateful objects — they won't behave the way you expect.
  platform: process.platform,
} as const;

// ────────────────────────────────────────────────────────────────────────────
// 3. Expose. With contextIsolation: true (default since v12) this is the
//    ONLY way to put something on window in the renderer's main world.
//    contextBridge copies/proxies values into the renderer; the renderer
//    cannot reach back into the preload's scope.
// ────────────────────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('api', api);

// Type-only export so the renderer's tsconfig can pick up the shape.
export type Api = typeof api;
```

```ts
// renderer/renderer.d.ts
// Include this file in the renderer's tsconfig "include" so TS knows
// what window.api looks like.

import type { Api } from '../preload/preload';

declare global {
  interface Window {
    api: Api;
  }
}

export {};
```

```ts
// renderer/example-usage.ts
// In the renderer, you only ever touch window.api — never electron, never ipcRenderer.

const reply = await window.api.ping();              // → "pong"
const result = await window.api.saveNote('hello');  // typed result
const dispose = window.api.onUpdateAvailable((v) => {
  console.log(`update available: ${v}`);
});
// later: dispose()
console.log(window.api.platform); // "darwin" | "win32" | "linux"
```

## Anti-patterns (don't do these)

```ts
// ❌ Exposing raw ipcRenderer — renderer can now call ANY channel registered
//    in the main process, defeating the whole point of an explicit surface.
contextBridge.exposeInMainWorld('ipc', ipcRenderer);

// ❌ Assigning to window without contextBridge. Only works when
//    contextIsolation is OFF, which is the 2017-era insecure pattern.
//    With isolation ON (default) this silently does nothing useful.
(window as any).api = api;

// ❌ Forwarding renderer-supplied paths to a "do anything" channel.
//    The renderer becomes the security boundary, which it must never be.
saveFile: (path: string) => ipcRenderer.invoke('fs:write-anywhere', path),

// ❌ Exposing functions that take callbacks holding references to renderer
//    objects. contextBridge clones across the bridge; closures don't survive
//    intact. Use the disposer pattern shown above instead.
```

## Why each pattern is safe

- **`contextBridge.exposeInMainWorld(key, api)`** runs while the preload still has Node, and writes a frozen copy/proxy of `api` into the renderer's main world. The renderer cannot reach back into preload scope; functions are called across worlds with structured-clone-ish semantics. See [contextBridge docs](https://www.electronjs.org/docs/latest/api/context-bridge).
- **Functions only across the bridge** — values you pass are cloned. Don't expose live `EventEmitter`s, class instances with prototypes you care about, or objects holding non-serializable references; they won't behave correctly. Functions wrap to proxies that round-trip arguments.
- **`ipcRenderer.invoke` + `ipcMain.handle`** is one request/response round-trip with a Promise on the renderer side and a return value (or thrown error → rejected Promise) on the main side. Smaller surface than `send` + `on` channel pairs and easier to reason about. See [IPC patterns](https://www.electronjs.org/docs/latest/tutorial/ipc).
- **Validation at the bridge** is *defense in depth*, not the primary trust boundary. The main process must always re-validate, because anything in the renderer (including the preload) is reachable from a successful renderer compromise (XSS, malicious extension, etc.). See [Security checklist](https://www.electronjs.org/docs/latest/tutorial/security).

## Companion main-side handler

The main side must register `handle` for every `invoke` channel listed in the preload — keep them in lockstep, ideally via a shared types file (see [Template 2 — Typed IPC contract](02-ipc-contract.md) for the full pattern).

```ts
// main/main.ts — match the preload contract
import { ipcMain } from 'electron';

ipcMain.handle('app:ping', () => 'pong');

ipcMain.handle('notes:save', (_event, text: string) => {
  // Re-validate. The preload check is not enough; treat all renderer input as hostile.
  if (typeof text !== 'string' || text.length === 0 || text.length > 10_000) {
    throw new Error('invalid input');
  }
  // ... persist to disk, DB, etc.
  return { ok: true } as const;
});

// Pushing an event one-way from main → renderer (matches onUpdateAvailable above):
// someWindow.webContents.send('update:available', '1.4.0');
```

## How to wire it

The preload only does its job when the `BrowserWindow` is configured with the modern security defaults. All four flags below are defaults in current Electron (`(as of 2026-04, Electron 41.x)`), but spelling them out in code is a useful defense against accidental regressions during refactors.

```ts
// main/main.ts — BrowserWindow setup
import { app, BrowserWindow } from 'electron';
import path from 'node:path';

app.whenReady().then(() => {
  new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true, // default since v12
      nodeIntegration: false, // default
      sandbox: true,          // default since v20
      // webSecurity: true is also the default — leave it on.
    },
  });
});
```

The 1Password `electron-secure-defaults` repo packages these flags plus a CSP and several other hardening defaults as a single drop-in; see the [preload example there](https://github.com/1password/electron-secure-defaults/blob/master/src/preload.ts) for a production-tested reference.

## Cross-links

- [C2 Process model & IPC](../../atlas/core/02-process-model-and-ipc.md) — the why behind preload + contextBridge.
- [C3 Security](../../atlas/core/03-security.md) — the full 17-point checklist this template implements one corner of.
- [Template 2 — Typed IPC contract](02-ipc-contract.md) — shared types between main and renderer so the channels can't drift.
- [CS4 — 1Password](../../atlas/case-studies/04-1password.md) — production usage of `electron-secure-defaults`.

## Sources

- [contextBridge | Electron API](https://www.electronjs.org/docs/latest/api/context-bridge) — `(as of 2026-04)`
- [contextBridge.exposeInMainWorld(apiKey, api)](https://www.electronjs.org/docs/latest/api/context-bridge#contextbridgeexposeinmainworldapikey-api) — anchor for the exposed-API contract
- [Inter-Process Communication | Electron docs](https://www.electronjs.org/docs/latest/tutorial/ipc) — Pattern 2 (renderer→main two-way) maps to `invoke`/`handle`
- [ipcRenderer | Electron API](https://www.electronjs.org/docs/latest/api/ipc-renderer) — `invoke`, `on`, `removeListener` semantics
- [ipcMain | Electron API](https://www.electronjs.org/docs/latest/api/ipc-main) — `handle` semantics
- [Security | Electron docs](https://www.electronjs.org/docs/latest/tutorial/security#3-enable-context-isolation) — context isolation rationale
- [Context Isolation | Electron docs](https://www.electronjs.org/docs/latest/tutorial/context-isolation) — default since v12
- [Process Sandboxing | Electron docs](https://www.electronjs.org/docs/latest/tutorial/sandbox) — default since v20
- [electron-secure-defaults — preload example | 1Password](https://github.com/1password/electron-secure-defaults/blob/master/src/preload.ts) — production reference
