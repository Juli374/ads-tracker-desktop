# Template 2 — Typed IPC contract

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

Define a single TypeScript module — call it `shared/ipc-contract.ts` — that maps each IPC channel name to its argument and return types. Both sides import it: the **main** process uses it to type-check `ipcMain.handle` callbacks, the **preload** wraps `ipcRenderer.invoke` in a generic helper that derives types from the channel name, and the **renderer** sees a fully-typed `window.api` surface. A typo in a channel name or a wrong-shape payload becomes a TypeScript error, not a 2 a.m. production bug.

This template gives you the contract type, a `handle` wrapper for the main process, an `invoke` wrapper for the preload, and a one-liner global type-augmentation for the renderer. Pair it with [Template 1 — Secure preload](01-secure-preload.md); the `contextBridge` boundary stays the same, you're just adding compile-time types over it.

## Why bother

The Electron IPC API is stringly-typed by design — `ipcMain.handle('some:channel', fn)` and `ipcRenderer.invoke('some:channel', args)` are connected only by a string literal. Without discipline that produces three failure modes:

- **Channel-name drift.** The main process registers `'notes:save'`, the renderer calls `'note:save'`, the call hangs forever (no handler ever resolves the promise). You ship the bug.
- **Argument-shape drift.** Renderer sends `{ noteId, body }`, handler reads `args.id` and `args.text`, you get `undefined` reaching the database layer.
- **Refactor fear.** Renaming a channel means grepping the codebase and praying you caught every call site.

A shared TS contract collapses all three into compile-time errors. Refactoring becomes safe: rename the key in the contract, TypeScript flags every caller, you fix them. See [C2 Process model & IPC](../../atlas/core/02-process-model-and-ipc.md) for the underlying `invoke`/`handle` mechanics this template wraps.

## The template

### 1. The shared contract — single source of truth

```ts
// shared/ipc-contract.ts
// Imported by main, preload, AND the renderer (types only — no runtime code).

export type IpcContract = {
  'notes:list': {
    args: { limit?: number };
    return: Array<{ id: string; title: string; updatedAt: string }>;
  };
  'notes:save': {
    args: { id?: string; text: string };
    return: { ok: true; id: string } | { ok: false; error: string };
  };
  'auth:login': {
    args: { email: string; password: string };
    return: { ok: true } | { ok: false; error: string };
  };
  'app:get-version': {
    args: void;
    return: string;
  };
};

export type IpcChannel = keyof IpcContract;
export type IpcArgs<C extends IpcChannel> = IpcContract[C]['args'];
export type IpcReturn<C extends IpcChannel> = IpcContract[C]['return'];
```

Two conventions matter here. First, **namespace channel names with `domain:action`** (`notes:save`, `auth:login`) — it scales past ~10 channels without collisions and reads better in DevTools. Second, **discriminated-union returns** (`{ ok: true; id } | { ok: false; error }`) force the caller to handle errors at the type level instead of throwing across the IPC boundary, where stack traces get mangled.

### 2. Main — typed `handle` wrapper

```ts
// main/ipc-handlers.ts
import { ipcMain } from 'electron';
import type { IpcChannel, IpcArgs, IpcReturn } from '../shared/ipc-contract';

type Handler<C extends IpcChannel> = (
  args: IpcArgs<C>,
) => IpcReturn<C> | Promise<IpcReturn<C>>;

export function handle<C extends IpcChannel>(channel: C, fn: Handler<C>) {
  ipcMain.handle(channel, async (_event, args: IpcArgs<C>) => fn(args));
}

// Usage:
handle('notes:list', async ({ limit = 50 }) => {
  // ...query database
  return [{ id: '1', title: 'Hello', updatedAt: new Date().toISOString() }];
});

handle('notes:save', async ({ id, text }) => {
  // ...persist
  return { ok: true, id: id ?? crypto.randomUUID() };
});

handle('app:get-version', () => '1.0.0');
```

The generic `handle<C>` ties the channel literal to `IpcArgs<C>` and `IpcReturn<C>`, so a wrong-shape return is a compile error inside the handler body. `ipcMain.handle` itself is the canonical request/response API ([Electron docs — `ipcMain.handle`](https://www.electronjs.org/docs/latest/api/ipc-main#ipcmainhandlechannel-listener)); the wrapper only adds types, not runtime behavior.

### 3. Preload — typed `invoke` wrapper exposed via `contextBridge`

```ts
// preload/api.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcChannel, IpcArgs, IpcReturn } from '../shared/ipc-contract';

function invoke<C extends IpcChannel>(
  channel: C,
  args: IpcArgs<C>,
): Promise<IpcReturn<C>> {
  return ipcRenderer.invoke(channel, args);
}

const api = { invoke };
contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
```

`contextBridge.exposeInMainWorld` is the only correct way to expose APIs to a sandboxed renderer ([Electron docs — `contextBridge`](https://www.electronjs.org/docs/latest/api/context-bridge)). The renderer never sees `ipcRenderer` directly; it sees `window.api.invoke`, which the contract narrows down per call site.

### 4. Renderer — type augmentation + usage

```ts
// renderer/types.d.ts
import type { Api } from '../preload/api';

declare global {
  interface Window {
    api: Api;
  }
}

export {};
```

```ts
// renderer/use-notes.ts
async function loadNotes() {
  const notes = await window.api.invoke('notes:list', { limit: 20 });
  // notes is typed as Array<{ id: string; title: string; updatedAt: string }>
  return notes;
}

async function saveNote(text: string) {
  const result = await window.api.invoke('notes:save', { text });
  if (!result.ok) throw new Error(result.error);
  return result.id;
}
```

That's the whole flow. `window.api.invoke('notes:list', ...)` autocompletes the channel list, the args object is type-checked against the contract, and the return type narrows automatically. Renaming `notes:list` → `notes:listAll` in the contract immediately surfaces every call site.

## Validation at the boundary

The TS contract is **compile-time only**. The renderer process is the part of your app most exposed to attack — a compromised renderer (XSS, malicious page loaded into a `webview`, a dependency that goes rogue) can call `window.api.invoke` with any payload it wants, and TypeScript at the call site is irrelevant once the code is shipped. Treat IPC handlers like an HTTP endpoint: validate input at runtime, every time. ([Electron security guide — context isolation + preload boundary](https://www.electronjs.org/docs/latest/tutorial/security); see [C3 Security](../../atlas/core/03-security.md) for the threat model.)

A small Zod (or [Valibot](https://valibot.dev/), [io-ts](https://github.com/gcanti/io-ts), or hand-written) check is enough — pick whatever is already in your bundle:

```ts
import { z } from 'zod';

const NotesSaveArgs = z.object({
  id: z.string().uuid().optional(),
  text: z.string().min(1).max(10_000),
});

handle('notes:save', async (args) => {
  const parsed = NotesSaveArgs.safeParse(args);
  if (!parsed.success) return { ok: false, error: 'invalid input' };
  // ...persist
  return { ok: true, id: parsed.data.id ?? crypto.randomUUID() };
});
```

Zod isn't required — the point is that runtime validation must exist. Hand-written guards (`if (typeof args.text !== 'string') return ...`) are fine for small surfaces; switch to a schema library when you have more than ~5 channels with non-trivial shapes.

## Events (main → renderer push)

`invoke`/`handle` is request/response. For one-way pushes from main to renderer (update available, sync-state changed, file-system event), keep a separate event contract:

```ts
// shared/ipc-events.ts
export type IpcEvents = {
  'update:available': { version: string };
  'sync:status': { state: 'idle' | 'syncing' | 'error'; lastSyncAt?: string };
};

export type IpcEvent = keyof IpcEvents;
export type IpcEventPayload<E extends IpcEvent> = IpcEvents[E];
```

Wrap with a typed `emit` (main side, via `webContents.send`) and a typed `on` (preload side, exposing a subscriber that routes through `ipcRenderer.on`); the same generic pattern applies. Keeping events separate from `IpcContract` prevents a stray `webContents.send('notes:save', ...)` from compiling — the channel namespaces don't overlap.

For high-throughput streaming (large blob transfer, audio/video frames), reach for [`MessagePort`s](https://www.electronjs.org/docs/latest/tutorial/message-ports) instead of `send`/`on`. They have lower per-message overhead and support transferable objects. Same typing approach, different transport.

## Refactoring patterns

The contract is what makes Electron IPC refactor-safe. A few common moves:

- **Rename a channel.** Change the key in `IpcContract`. TypeScript errors at every caller and at the handler registration. Fix all of them; commit.
- **Add a field to `args`.** Add it as optional, default it in the handler. Ship. Once all callers pass it, mark it required. (Two-step migration; never break the contract in one PR if the renderer can race ahead of the main bundle in an auto-update scenario.)
- **Remove a channel.** Delete the key from the contract. TS errors point at every call and the handler. Delete them.
- **Split a channel.** Add the new channels alongside, migrate callers one at a time, delete the old channel. The contract turns this into a mechanical refactor.

The cost of all four moves drops to "find the compile errors, fix them" — far below what you pay with stringly-typed IPC.

## Cross-links

- [Template 1 — Secure preload](01-secure-preload.md) — the `contextBridge` boundary this template types over
- [Template 5 — Railway backend client](05-railway-backend-client.md) — pairs typed IPC with `safeStorage` + WebSocket reconnect
- [C2 Process model & IPC](../../atlas/core/02-process-model-and-ipc.md) — `invoke`/`handle` vs. `send`/`on`, MessagePorts, UtilityProcess
- [C3 Security](../../atlas/core/03-security.md) — why runtime validation at handlers is non-negotiable
- [C8 Frontend stack](../../atlas/core/08-frontend-stack.md) — sharing types between main and renderer in a Vite/Webpack setup

## Sources

- [Inter-Process Communication | Electron docs](https://www.electronjs.org/docs/latest/tutorial/ipc) — canonical patterns for `invoke`/`handle`, `send`/`on`, MessagePorts
- [`ipcMain.handle` | Electron API](https://www.electronjs.org/docs/latest/api/ipc-main#ipcmainhandlechannel-listener)
- [`ipcRenderer.invoke` | Electron API](https://www.electronjs.org/docs/latest/api/ipc-renderer#ipcrendererinvokechannel-args)
- [`contextBridge` | Electron API](https://www.electronjs.org/docs/latest/api/context-bridge) — boundary the typed wrapper sits behind
- [Security — Electron docs](https://www.electronjs.org/docs/latest/tutorial/security) — checklist item: validate IPC sender / payload `(as of 2026-04)`
- [Zod](https://zod.dev/), [Valibot](https://valibot.dev/), [io-ts](https://github.com/gcanti/io-ts) — runtime-validation libraries; use whichever is already in your bundle
