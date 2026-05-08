# Template 5 — Railway backend client (auth, safeStorage, WebSocket, offline) ⭐

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

A reference scaffold for connecting an Electron app to a Railway-hosted backend. Four pillars, each its own module in `main/lib/`:

1. **HTTP client** — typed `api.get/post/put/delete` over `net.fetch`, with single-flight 401 → refresh → retry.
2. **Token storage** — `safeStorage.encryptString` (sync) writing to `app.getPath('userData')/auth.bin` via `fs/promises`. Never `keytar`.
3. **WebSocket** — `ws` from main with jittered exponential backoff and heartbeat ping.
4. **Local cache** — `better-sqlite3` (or `node:sqlite`) for offline-first reads + outbox table for queued mutations.

The renderer never holds tokens, never opens sockets, never sees the backend URL — it only awaits `window.api.*` calls exposed via `contextBridge`. Cross-cutting concerns (auth, retry, offline queue) live in main process. See [C9 Backend connectivity](../../atlas/core/09-backend-connectivity.md) for the depth on every choice.

## File layout

```
main/
├── main.ts                     ← app.whenReady() wiring
├── ipc.ts                      ← ipcMain.handle('api:call', …)
└── lib/
    ├── api.ts                  ← HTTP client (pillar 1)
    ├── tokens.ts               ← safeStorage I/O (pillar 2)
    ├── ws.ts                   ← WebSocket reconnect (pillar 3)
    └── cache.ts                ← SQLite + outbox (pillar 4)
preload.ts                      ← contextBridge.exposeInMainWorld('api', …)
shared/
└── types.ts                    ← types both main and renderer import
```

The `shared/` folder has no Electron imports; both ends compile against it. See [Template 2 IPC contract](02-ipc-contract.md) for the typed-IPC pattern this builds on.

---

## Pillar 1 — HTTP client with refresh-on-401

`net.fetch` is Electron's WHATWG-`fetch` over **Chromium's network stack**. It picks up system proxy (PAC, WPAD, manual), OS trust store (corporate CAs, MDM-deployed device certs), and supports basic / digest / NTLM / Kerberos / Negotiate proxy auth out of the box ([Electron `net` API](https://www.electronjs.org/docs/latest/api/net), as of 2026-04). Raw Node `fetch` (`undici`) does none of this — many corporate-laptop users behind Zscaler / Netskope / a VPN will silently fail with `undici` and Just Work with `net.fetch`. Use `net.fetch` for everything that talks to your backend.

```ts
// main/lib/api.ts
import { net } from 'electron';
import { getToken, setToken, clearToken } from './tokens';

const BASE_URL =
  process.env.RAILWAY_PUBLIC_URL ?? 'https://your-app.up.railway.app';

export class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`api ${status}`);
  }
}

let refreshInflight: Promise<void> | null = null;

async function refreshOnce(): Promise<void> {
  // Single-flight: 10 concurrent 401s share one refresh attempt.
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async () => {
    const token = await getToken();
    if (!token?.refresh) throw new ApiError(401, 'no refresh token');
    const res = await net.fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh: token.refresh }),
    });
    if (!res.ok) {
      await clearToken();
      throw new ApiError(res.status, await res.text());
    }
    await setToken((await res.json()) as { access: string; refresh: string });
  })().finally(() => {
    refreshInflight = null;
  });
  return refreshInflight;
}

async function apiFetch(
  method: string,
  path: string,
  body?: unknown,
  retried = false,
): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token.access}` } : {}),
  };
  const res = await net.fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !retried && token?.refresh) {
    try {
      await refreshOnce();
      return apiFetch(method, path, body, true); // retry exactly once
    } catch {
      throw new ApiError(401, 'auth expired');
    }
  }
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res;
}

async function asJson<T>(p: Promise<Response>): Promise<T> {
  const res = await p;
  return (await res.json()) as T;
}

export const api = {
  get:  <T>(path: string)               => asJson<T>(apiFetch('GET', path)),
  post: <T>(path: string, body: unknown) => asJson<T>(apiFetch('POST', path, body)),
  put:  <T>(path: string, body: unknown) => asJson<T>(apiFetch('PUT',  path, body)),
  del:  <T>(path: string)               => asJson<T>(apiFetch('DELETE', path)),
};
```

Notes:

- **Single-flight refresh** — without `refreshInflight`, N concurrent 401s fire N refresh requests; the rotated refresh token only succeeds for one and the rest log the user out. Promise-coalescing is the canonical fix.
- **Retry exactly once** — the `retried` flag prevents an infinite loop if `/auth/refresh` itself returns 401.
- **Corporate proxy auth** — for proxies that pop a basic-auth dialog, listen to `app.on('login', …)` in main; or rely on integrated Windows auth (default behavior with Negotiate).

---

## Pillar 2 — Token storage with `safeStorage`

`safeStorage` is Electron's first-party answer to "where do I keep secrets on disk." Each platform delegates to the OS keychain ([Electron `safeStorage` API](https://www.electronjs.org/docs/latest/api/safe-storage), as of 2026-04):

| Platform | Backend | Scope |
|---|---|---|
| macOS | Keychain | Per-app entry; other apps blocked from reading |
| Windows | DPAPI | Per-user; other apps in the same userspace can read |
| Linux | `gnome-libsecret` / `kwallet5` / `kwallet6` (auto-detected) | Per-user; depends on a running keyring |

API surface is **synchronous**: `isEncryptionAvailable() → boolean`, `encryptString(plain) → Buffer`, `decryptString(buffer) → string`, `setUsePlainTextEncryption(boolean)`, `getSelectedStorageBackend() → string`. There are no async variants — the encryption call is fast and synchronous. Your `setToken` / `getToken` / `clearToken` wrappers below stay async because the file I/O (via `fs/promises`) is async; the safeStorage encrypt/decrypt calls inside them are sync ([Electron `safeStorage` docs](https://www.electronjs.org/docs/latest/api/safe-storage), as of 2026-04).

```ts
// main/lib/tokens.ts
import { app, safeStorage } from 'electron';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const TOKEN_FILE = join(app.getPath('userData'), 'auth.bin');

export type Tokens = { access: string; refresh: string };

let cached: Tokens | null = null;

export async function setToken(t: Tokens): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'OS keychain not available — falling back to login required',
    );
  }
  const enc = safeStorage.encryptString(JSON.stringify(t));
  await writeFile(TOKEN_FILE, enc, { mode: 0o600 });
  cached = t;
}

export async function getToken(): Promise<Tokens | null> {
  if (cached) return cached;
  try {
    const buf = await readFile(TOKEN_FILE);
    if (!safeStorage.isEncryptionAvailable()) return null;
    cached = JSON.parse(safeStorage.decryptString(buf)) as Tokens;
    return cached;
  } catch {
    return null;
  }
}

export async function clearToken(): Promise<void> {
  cached = null;
  await unlink(TOKEN_FILE).catch(() => {});
}
```

Watch-outs:

- **Call after `app.whenReady()`** — both `safeStorage` and `app.getPath('userData')` throw before app ready.
- **Linux without a keyring** (headless, broken DBus) — `isEncryptionAvailable()` returns `false`. Fall back to "require re-login on every launch"; do **not** silently store plaintext.
- **`mode: 0o600`** — owner-only; harmless on Windows, defense-in-depth on macOS/Linux.
- **In-memory cache (`cached`)** — avoid hitting the OS keychain on every API call; invalidate on `clearToken`.
- **NEVER `keytar`** — `atom/node-keytar` was archived **December 2022**; VS Code, Joplin, 1Password's `electron-secure-defaults` all migrated away ([keytar issue #438](https://github.com/atom/node-keytar/issues/438), as of 2026-04).
- **NEVER log tokens** — redact `Authorization` headers in `electron-log`. See [C3 Security](../../atlas/core/03-security.md).

---

## Pillar 3 — WebSocket with reconnect + heartbeat

Live data (chat, presence, notifications) wants a long-lived connection. Open it from **main** so it survives the renderer being hidden, throttled, or swapped out, and so the token never crosses the IPC boundary into renderer scope. The [`ws`](https://github.com/websockets/ws) library is the standard choice; native WHATWG `WebSocket` is also available in modern Node but doesn't accept custom headers (see auth note below).

The two non-obvious parts are **reconnect strategy** and **heartbeat**:

- **Jittered exponential backoff** — `delay = min(cap, base * 2^attempt) * (0.5 + random()/2)`. Without jitter, when Railway redeploys at 3am, every client reconnects at the same instant and stampedes the server. Jitter spreads them out.
- **Heartbeat ping** — TCP keepalive isn't enough; corporate firewalls and load balancers idle-close silent connections after 30-90s. Send `{ type: 'ping' }` every 25s; if the server doesn't echo within 10s, terminate and let reconnect logic take over.

```ts
// main/lib/ws.ts
import WebSocket from 'ws';
import { getToken } from './tokens';

const WS_URL =
  process.env.RAILWAY_WS_URL ?? 'wss://your-app.up.railway.app/ws';
const BASE_DELAY = 1_000;
const MAX_DELAY = 30_000;
const HEARTBEAT_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;

let ws: WebSocket | null = null;
let attempt = 0;
let heartbeat: NodeJS.Timeout | null = null;
let pongTimer: NodeJS.Timeout | null = null;
let stopped = false;

function clearTimers() {
  if (heartbeat) clearInterval(heartbeat);
  if (pongTimer) clearTimeout(pongTimer);
  heartbeat = null;
  pongTimer = null;
}

export async function connect(onMessage: (msg: unknown) => void): Promise<void> {
  if (stopped) return;
  const token = await getToken();
  if (!token) return; // not logged in; caller will retry post-login

  // Auth in handshake header — header doesn't leak into proxy logs the way
  // ?token=… in the URL does. The browser WebSocket API can't set headers,
  // which is one reason we open from main, not renderer.
  ws = new WebSocket(WS_URL, {
    headers: { Authorization: `Bearer ${token.access}` },
  });

  ws.on('open', () => {
    attempt = 0;
    heartbeat = setInterval(() => {
      if (ws?.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'ping' }));
      pongTimer = setTimeout(() => ws?.terminate(), PONG_TIMEOUT_MS);
    }, HEARTBEAT_MS);
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'pong') {
      if (pongTimer) clearTimeout(pongTimer);
      pongTimer = null;
      return;
    }
    onMessage(msg);
  });

  ws.on('close', () => {
    clearTimers();
    if (stopped) return;
    const delay =
      Math.min(MAX_DELAY, BASE_DELAY * 2 ** attempt) * (0.5 + Math.random() / 2);
    attempt += 1;
    setTimeout(() => connect(onMessage), delay);
  });

  ws.on('error', () => ws?.terminate()); // close handler will reconnect
}

export function send(msg: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

export function disconnect(): void {
  stopped = true;
  clearTimers();
  ws?.close();
}
```

Auth on the WebSocket — in decreasing order of safety: (1) `Authorization` header in handshake (shown above; requires `ws` because browser `WebSocket` can't set headers), (2) first-message handshake `{ type: 'auth', token }`, (3) `?token=…` in URL — leaks into proxy logs and error reports; avoid.

Offline detection — pair `ws.readyState` with `navigator.onLine` (forwarded over IPC) to drive a "connected / offline / reconnecting" indicator. `navigator.onLine` lies on captive portals; the WebSocket state is the source of truth.

---

## Pillar 4 — SQLite offline cache + outbox

For offline-first reads and queued mutations, embed SQLite in main process and have the renderer ask main for data via IPC — never expose the DB connection to renderer.

**Library choice (as of 2026-04):**

- **`better-sqlite3`** — synchronous, native module, battle-tested. Used by VS Code, Notion's desktop app, many others. **Default for production Electron apps today.** Native module: ABI must match Electron's Node version, rebuild on `npm install` via `@electron/rebuild`. ASAR-unpack the `.node` binary in your packager config. NODE_MODULE_VERSION mismatches on new Electron versions are the most common gotcha; they're solved by re-running `electron-rebuild`. ([better-sqlite3 on npm](https://www.npmjs.com/package/better-sqlite3); [@electron/rebuild docs](https://github.com/electron/rebuild), as of 2026-04.)
- **`node:sqlite`** — synchronous, **built into Node 22+**. Promoted to **Stability 1.2 — Release Candidate** in Node v25.7.0 (released 2026-02-24); enabled without flags ([Node.js v25 SQLite docs](https://nodejs.org/api/sqlite.html), as of 2026-04). Once Electron ships on Node 25 and the API freezes, this removes the native-module-rebuild headache. **Worth tracking, not yet drop-in.** Until Electron's bundled Node hits 25 and the API graduates to Stable, stick with `better-sqlite3`.
- **PGLite** — Postgres-in-WASM (~3 MB gzipped). Pick if your Railway backend is Postgres and you want schema parity (run the same migrations client-side). Async API. ([electric-sql/pglite](https://github.com/electric-sql/pglite), as of 2026-04.)

The template uses `better-sqlite3` because it's the safe 2026 choice. The migration to `node:sqlite` is a one-import-line swap once it stabilizes.

```ts
// main/lib/cache.ts
import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';

const db = new Database(join(app.getPath('userData'), 'cache.db'));
db.pragma('journal_mode = WAL');     // concurrent reads with one writer
db.pragma('synchronous = NORMAL');   // fsync less aggressively (safe in WAL)
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS notes_updated ON notes(updated_at DESC);

  CREATE TABLE IF NOT EXISTS outbox (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    op          TEXT NOT NULL,           -- 'create' | 'update' | 'delete'
    entity      TEXT NOT NULL,           -- 'note', etc.
    payload     TEXT NOT NULL,           -- JSON
    created_at  TEXT NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0
  );
`);

export type Note = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

const upsertStmt = db.prepare(`
  INSERT INTO notes (id, title, body, updated_at)
  VALUES (@id, @title, @body, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    body = excluded.body,
    updated_at = excluded.updated_at
`);

const listStmt = db.prepare(
  `SELECT id, title, body, updated_at AS updatedAt FROM notes
   ORDER BY updated_at DESC LIMIT ?`,
);

const enqueueStmt = db.prepare(`
  INSERT INTO outbox (op, entity, payload, created_at)
  VALUES (?, ?, ?, ?)
`);

const drainStmt = db.prepare(`
  SELECT id, op, entity, payload FROM outbox ORDER BY id ASC LIMIT ?
`);

const deleteOutboxStmt = db.prepare(`DELETE FROM outbox WHERE id = ?`);

export const cache = {
  upsertNote(n: Note): void {
    upsertStmt.run(n);
  },
  listNotes(limit = 200): Note[] {
    return listStmt.all(limit) as Note[];
  },
  enqueue(op: 'create' | 'update' | 'delete', entity: string, payload: unknown): void {
    enqueueStmt.run(op, entity, JSON.stringify(payload), new Date().toISOString());
  },
  drain(limit = 50): Array<{ id: number; op: string; entity: string; payload: string }> {
    return drainStmt.all(limit) as Array<{
      id: number;
      op: string;
      entity: string;
      payload: string;
    }>;
  },
  ack(id: number): void {
    deleteOutboxStmt.run(id);
  },
};
```

The drain loop runs in main; it drains the outbox whenever the WebSocket reports `online`, retries with backoff, and on success calls `ack(id)`. On hard failure (4xx, validation error) it surfaces to the user — don't silently retry forever. See [C9 §6 "Offline-first patterns"](../../atlas/core/09-backend-connectivity.md) for the full sync-engine survey (ElectricSQL, RxDB, PowerSync) when DIY outboxes outgrow themselves.

---

## Wiring — `main.ts`, `ipc.ts`, `preload.ts`

```ts
// main/main.ts
import { app, BrowserWindow } from 'electron';
import { setupIpc } from './ipc';
import { connect, disconnect } from './lib/ws';
import { setupAutoUpdate } from './auto-update'; // Template 4

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(async () => {
  setupIpc();
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: `${__dirname}/preload.js`,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  await mainWindow.loadFile('index.html');

  // Push live messages from main → renderer.
  await connect((msg) => mainWindow?.webContents.send('sync:msg', msg));
  setupAutoUpdate(mainWindow);
});

app.on('window-all-closed', () => {
  disconnect();
  if (process.platform !== 'darwin') app.quit();
});
```

```ts
// main/ipc.ts
import { ipcMain } from 'electron';
import { api } from './lib/api';
import { cache } from './lib/cache';

export function setupIpc(): void {
  ipcMain.handle('api:get',  (_e, path: string)              => api.get(path));
  ipcMain.handle('api:post', (_e, path: string, body: unknown) => api.post(path, body));
  ipcMain.handle('api:put',  (_e, path: string, body: unknown) => api.put(path, body));
  ipcMain.handle('api:del',  (_e, path: string)              => api.del(path));

  ipcMain.handle('cache:listNotes', () => cache.listNotes());
}
```

```ts
// preload.ts
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('api', {
  get:  (path: string)               => ipcRenderer.invoke('api:get', path),
  post: (path: string, body: unknown) => ipcRenderer.invoke('api:post', path, body),
  put:  (path: string, body: unknown) => ipcRenderer.invoke('api:put', path, body),
  del:  (path: string)               => ipcRenderer.invoke('api:del', path),
  listNotes: () => ipcRenderer.invoke('cache:listNotes'),
  onSync: (cb: (msg: unknown) => void) => {
    const handler = (_e: IpcRendererEvent, msg: unknown) => cb(msg);
    ipcRenderer.on('sync:msg', handler);
    return () => ipcRenderer.off('sync:msg', handler);
  },
});
```

The renderer never imports `electron`, never sees a token, never sees `BASE_URL`. See [Template 1 secure preload](01-secure-preload.md) for the security framing and [Template 2 IPC contract](02-ipc-contract.md) for typing the channel surface.

---

## Patterns the template enables

- **Optimistic UI** — renderer calls `window.api.put('/notes/:id', body)`; main writes to local SQLite immediately, returns the cached row, then enqueues the mutation. Renderer paints from cache; no spinner.
- **Offline detection** — combine WebSocket state + `navigator.onLine` (forwarded over IPC). Show a banner; gray out actions that mutate; let the outbox drain on reconnect.
- **Token expiry handled silently** — the `refreshOnce()` single-flight makes 401s invisible to the renderer. The user never sees a re-login prompt unless the refresh token itself expires.
- **No CORS** — the main process is not a browser document. Your Railway backend can keep `Access-Control-Allow-Origin: https://yourwebapp.com` strict and the desktop app still works.
- **Corporate-proxy / MDM-cert friendly** — `net.fetch` picks up the OS proxy and trust store automatically. Users behind a corporate VPN with an injected root CA work without extra config.

## Watch-outs

- **`safeStorage` Linux failure mode** — headless / no-keyring boxes return `isEncryptionAvailable() === false`. Plan for "require login every launch" rather than crashing.
- **`better-sqlite3` ABI rebuild** — `npm install` must trigger `@electron/rebuild`. NODE_MODULE_VERSION mismatch is by far the #1 issue people hit. Configure `electron-builder` / Forge to ASAR-unpack the `.node` binary, otherwise the OS can't `dlopen` it from inside the archive.
- **Token refresh stampede** — without `refreshInflight` (single-flight), N concurrent 401s issue N refresh requests; the rotated refresh token only succeeds for one of them, and the rest log the user out.
- **Heartbeat absence** — without an app-level ping, idle WebSocket connections die at the load balancer and the client has no idea until the next user action. Send a ping every 25s.
- **WebSocket auth in URL** — `?token=…` leaks into proxy logs. Use the `Authorization` header (handshake) or a first-message handshake instead.
- **Token logging** — never log tokens or full request headers. Configure `electron-log` redaction; route all outbound auth headers through a shared serializer that strips `Authorization` before logging.

## Cross-links

- [C9 Backend connectivity](../../atlas/core/09-backend-connectivity.md) — depth on every choice on this page
- [C2 Process model & IPC](../../atlas/core/02-process-model-and-ipc.md) — the IPC primitives wrapped here
- [C3 Security](../../atlas/core/03-security.md) — CSP, token-redaction in logs, the broader checklist
- [C4 Native integrations](../../atlas/core/04-native-integrations.md) — deep links for OAuth callback; native-module ABI
- [Template 1 secure preload](01-secure-preload.md) — the contextBridge surface
- [Template 2 IPC contract](02-ipc-contract.md) — typing the channel surface
- [Template 4 auto-update](04-auto-update.md) — wired alongside this client in `main.ts`

## Sources

- [Electron `net` API — Chromium network stack, `net.fetch`, system proxy, NTLM/Kerberos](https://www.electronjs.org/docs/latest/api/net) — (as of 2026-04)
- [Electron `safeStorage` API — synchronous `encryptString` / `decryptString` / `isEncryptionAvailable`, OS-keychain backends](https://www.electronjs.org/docs/latest/api/safe-storage) — (as of 2026-04)
- [Electron `app` API — `app.getPath('userData')`, `app.on('login')` for proxy auth](https://www.electronjs.org/docs/latest/api/app) — (as of 2026-04)
- [Electron `contextBridge` API — `exposeInMainWorld`](https://www.electronjs.org/docs/latest/api/context-bridge) — (as of 2026-04)
- [`atom/node-keytar` — archived repo, maintainers point to `safeStorage` (issue #438)](https://github.com/atom/node-keytar/issues/438) — (as of 2026-04)
- [Replacing Keytar with safeStorage in Ray — Freek Van der Herten](https://freek.dev/2103-replacing-keytar-with-electrons-safestorage-in-ray) — (as of 2026-04)
- [`ws` — WebSocket library for Node](https://github.com/websockets/ws) — (as of 2026-04)
- [`better-sqlite3` on npm — synchronous SQLite for Node/Electron](https://www.npmjs.com/package/better-sqlite3) — (as of 2026-04)
- [`@electron/rebuild` — rebuilding native modules against Electron's Node ABI](https://github.com/electron/rebuild) — (as of 2026-04)
- [Node.js v25 docs — `node:sqlite` (Stability 1.2 — RC; promoted in v25.7.0, 2026-02-24)](https://nodejs.org/api/sqlite.html) — (as of 2026-04)
- [`electric-sql/pglite` — Postgres in WASM](https://github.com/electric-sql/pglite) — (as of 2026-04)
- [Build and Secure an Electron App — OpenID, OAuth — Auth0](https://auth0.com/blog/securing-electron-applications-with-openid-connect-and-oauth-2/) — (as of 2026-04)
- [RFC 7636 — PKCE for OAuth public clients](https://datatracker.ietf.org/doc/html/rfc7636) — (as of 2026-04)
- [RFC 8252 — OAuth 2.0 for Native Apps (loopback redirect URI)](https://datatracker.ietf.org/doc/html/rfc8252) — (as of 2026-04)
- [Railway docs — public networking, custom domains, healthchecks](https://docs.railway.com/) — (as of 2026-04)
