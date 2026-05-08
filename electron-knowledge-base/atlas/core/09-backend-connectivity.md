# C9. Backend connectivity (Railway use case) ⭐ — auth, safeStorage, WebSocket, offline

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

When your Electron app talks to a remote backend on Railway (or anywhere), the **main process owns the network**. The renderer never holds tokens, never opens raw sockets, and never sees backend URLs — it goes through `contextBridge` IPC into the main process, which calls the backend over HTTPS using **`net.fetch`** (Chromium's network stack — picks up system proxy and OS trust store, important for corporate-proxy users) ([Electron `net` API](https://www.electronjs.org/docs/latest/api/net), as of 2026-04). Tokens (access + refresh) live in **`safeStorage`**, OS-keychain-backed (macOS Keychain, Windows DPAPI, Linux libsecret/kwallet) ([Electron `safeStorage` API](https://www.electronjs.org/docs/latest/api/safe-storage), as of 2026-04). **Do not use `keytar`** — `atom/node-keytar` was archived December 2022 and the maintainers point to `safeStorage` ([atom/node-keytar issue #438](https://github.com/atom/node-keytar/issues/438), as of 2026-04). For real-time data use a WebSocket with reconnect-with-jittered-backoff or SSE for one-way streams. For offline-first, cache to local SQLite (`better-sqlite3` for synchronous main-process access, or the experimental `node:sqlite` in Node 22+) and queue mutations.

## When to apply

- Your Electron app needs to call a remote API (Railway, Vercel, Render, Fly.io, custom).
- You need to authenticate the user and persist their session across app restarts.
- You need real-time updates from the backend (chat, notifications, presence, live data).
- You need the app to keep working when the network is flaky or offline.
- The backend is on a public domain (`*.up.railway.app` or your own custom domain) over HTTPS.

## When NOT to apply

- The app is fully offline / standalone (no remote backend) — skip auth, just use local storage.
- The backend lives on the same machine (a local sidecar or `localhost` API) — same patterns apply but CORS/offline don't matter.
- You're embedding a third-party SaaS web app verbatim (Slack/Discord-style "wrap a web app" — see CS2). In that case, the web app handles auth and tokens itself; you just provide the window.
- You're doing pure peer-to-peer (libp2p, WebRTC) without a server — different topology.

## Anatomy

### 1. Architecture: main process owns the network

```
┌─────────────┐  ipcRenderer.invoke('api:call')  ┌─────────────┐  net.fetch  ┌──────────────┐
│  Renderer   │  ────────────────────────────►  │    Main     │  ────────► │   Railway    │
│  (UI only)  │  ◄────────────────────────────  │  (network)  │  ◄──────── │   backend    │
└─────────────┘       contextBridge / IPC        └─────────────┘    HTTPS   └──────────────┘
                                                       │
                                                       ├── safeStorage (tokens)
                                                       ├── better-sqlite3 (cache)
                                                       └── WebSocket (live data)
```

Why this shape:

- **No CORS pain**. The main process is Node + Chromium-net, not a browser document. `net.fetch` from main is not subject to the same-origin policy ([Electron `net` API](https://www.electronjs.org/docs/latest/api/net), as of 2026-04). Your backend can keep strict `Access-Control-Allow-Origin` rules and your desktop app still works — a feature, not a bug.
- **Renderer never holds tokens.** A compromised renderer (XSS in a server-rendered template, a malicious npm dep) cannot read the access token if the token only ever lives in main process memory + `safeStorage`. The only thing the renderer can do is call `window.api.callBackend(...)` and the main process decides whether to attach auth.
- **One place for retry, refresh, telemetry, offline queue.** Cross-cutting concerns live in main; the renderer just awaits a Promise.

The boundary is a `contextBridge.exposeInMainWorld` API in preload — see [C2 Process model & IPC](02-process-model-and-ipc.md) for the typed pattern, and the dedicated scaffold in [Template 5 Railway backend client](../../build-kit/templates/05-railway-backend-client.md).

### 2. HTTP client choice

Three options for "make an HTTPS call from main":

| Client | What it is | When to use |
|---|---|---|
| **`net.fetch`** | Electron's WHATWG-`fetch` over **Chromium's network stack** | **Default for talking to your backend.** Picks up system proxy (PAC, WPAD, manual), OS trust store (corporate root CAs, MDM-deployed device certificates), `proxy` events, NTLM/Kerberos/Negotiate proxy auth. Available in main and utility processes. ([Electron `net` API](https://www.electronjs.org/docs/latest/api/net), as of 2026-04) |
| **Node `fetch`** (built-in since Node 18, `undici` under the hood) | Plain Node fetch, no Chromium plumbing | When you explicitly want raw Node behavior (e.g. talking to a sidecar, custom CA bundle via `NODE_EXTRA_CA_CERTS`, no system proxy). |
| **Third-party** (axios, ky, ofetch) | Ergonomics on top of one of the above | Fine if you want interceptors, timeouts, retries out of the box. Wrap `net.fetch` underneath if you need corporate-proxy compatibility. |

**Recommendation: use `net.fetch` in main for backend calls.** The corporate-proxy and device-certificate story is the differentiator — many users behind a Zscaler / Netskope / corporate VPN will fail with raw Node `fetch` because it doesn't see the OS proxy or the MDM-deployed root CA. `net.fetch` was added in Electron 25 and uses the same network code as the rest of Chromium ([Electron 25 release announcement, Chromium net stack](https://github.com/electron/electron/blob/main/docs/api/net.md), as of 2026-04).

```js
// main/api.js
import { net } from 'electron'

const res = await net.fetch('https://your-railway-app.up.railway.app/users/me', {
  headers: { Authorization: `Bearer ${accessToken}` },
})
const json = await res.json()
```

For corporate proxies that require auth, listen for the `app.on('login', ...)` event and provide credentials, or rely on integrated Windows auth via the default behavior. See `app.on('login')` in the official docs.

### 3. Authentication patterns

Three flows cover ~95% of desktop apps. Pick by what your backend supports:

#### a. Email + password to your own backend (Railway-typical)

User enters credentials in a renderer form → renderer calls `window.api.login(email, password)` over IPC → main `POST /auth/login` to Railway → backend returns `{ accessToken, refreshToken }` → main encrypts both with `safeStorage.encryptString(...)` and writes them to a file in `app.getPath('userData')` → main attaches `Authorization: Bearer ...` to subsequent requests and refreshes on 401.

This is the simplest flow, you control both ends, and it composes cleanly with token rotation. Use HTTPS (Railway gives you `*.up.railway.app` with HTTPS by default).

#### b. OAuth 2.0 with PKCE for third-party identity (Google, GitHub, etc.)

Desktop apps are **public clients** — there's no secret you can keep on the user's machine. Use **PKCE** (Proof Key for Code Exchange, [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636), as of 2026-04) so the authorization code can't be intercepted and replayed.

Two redirect-URI strategies:

1. **Custom protocol handler** — `app.setAsDefaultProtocolClient('myapp')` registers `myapp://oauth-callback`. The OAuth provider redirects there, the OS opens your app, you parse the code from the URL. Works great on macOS, has Windows/Linux gotchas (packaged-only on macOS, requires `argv` parsing on Windows, varies by desktop environment on Linux). See [C4 Native integrations — deep links](04-native-integrations.md).
2. **Loopback redirect URI** — main process spins up `http.createServer` on `127.0.0.1:0` (random port), uses `http://127.0.0.1:PORT/callback` as the OAuth `redirect_uri`, captures the code, closes the server. **More compatible** because every OAuth provider supports loopback; no protocol-handler registration needed. This is the [RFC 8252 OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252) recommendation.

Auth0's Electron OIDC tutorial covers both strategies with code ([Auth0 — Build and Secure an Electron App](https://auth0.com/blog/securing-electron-applications-with-openid-connect-and-oauth-2/), as of 2026-04).

#### c. Magic link (email-based passwordless)

User submits email → backend mails a link `https://your-railway-app.up.railway.app/auth/magic?token=...` → user clicks → if you registered a custom protocol with a fallback, the link opens your desktop app with the token. Easy to bolt onto an existing magic-link web flow; requires you to wire up `myapp://auth?token=...` deep links and handle the `second-instance` event so a click while the app is already running still routes to the right window.

### 4. Token storage — `safeStorage`, not `keytar`

**`safeStorage`** is Electron's first-party answer to "where do I keep secrets on disk." Each platform delegates to the OS keychain ([Electron `safeStorage` API](https://www.electronjs.org/docs/latest/api/safe-storage), as of 2026-04):

| Platform | Backend |
|---|---|
| macOS | Keychain (per-app entry, prevents other apps reading) |
| Windows | DPAPI (Data Protection API, scoped to the user) |
| Linux | `gnome-libsecret` / `kwallet` / `kwallet5` / `kwallet6` (auto-detected) |

API surface (synchronous): `safeStorage.isEncryptionAvailable() → boolean`, `safeStorage.encryptString(plain) → Buffer`, `safeStorage.decryptString(buffer) → string`, `safeStorage.setUsePlainTextEncryption(boolean)`, `safeStorage.getSelectedStorageBackend() → string`. The methods are fast; in practice you wrap them in `Promise.resolve` if you need a uniformly-async surface in your token-storage module — file I/O against `app.getPath('userData')` (via `fs/promises`) stays async, the encryption call itself is sync ([Electron `safeStorage` docs](https://www.electronjs.org/docs/latest/api/safe-storage), as of 2026-04).

You don't get free file storage — `safeStorage` only handles encrypt/decrypt. Persist the resulting Buffer yourself, typically as a file in `app.getPath('userData')`:

```js
import { app, safeStorage } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

const TOKEN_FILE = path.join(app.getPath('userData'), 'session.bin')

export async function saveTokens(tokens) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS keychain not available')
  }
  const ciphertext = safeStorage.encryptString(JSON.stringify(tokens))
  await fs.writeFile(TOKEN_FILE, ciphertext)
}

export async function loadTokens() {
  try {
    const ciphertext = await fs.readFile(TOKEN_FILE)
    return JSON.parse(safeStorage.decryptString(ciphertext))
  } catch {
    return null  // first launch, or user nuked it
  }
}
```

**Why not `keytar`?** `atom/node-keytar` was archived **December 2022** and is unmaintained. VS Code, Joplin, Element, and 1Password's `electron-secure-defaults` all moved away. The library still works on some platforms but breaks on others (libsecret link errors on newer Ubuntu/Fedora, native-module ABI rebuild churn). Use `safeStorage`. ([atom/node-keytar — archived repo](https://github.com/atom/node-keytar/issues/438), as of 2026-04; [Replacing Keytar with safeStorage in Ray — Freek Van der Herten](https://freek.dev/2103-replacing-keytar-with-electrons-safestorage-in-ray), as of 2026-04.)

**`safeStorage` gotcha**: it must be called *after* `app.whenReady()`. Calling it before app ready throws. On Linux it returns `false` from `isEncryptionAvailable()` if no keyring is configured (headless server, broken DBus) — fall back gracefully (require re-login, don't crash).

### 5. WebSocket / SSE for real-time

If your Railway backend pushes data (chat, notifications, presence, live dashboards), pick one:

#### WebSocket

Bidirectional, lower-level, broad library support. From main process use the [`ws`](https://github.com/websockets/ws) npm package or native WHATWG `WebSocket` (available in Node 22+). From renderer the browser `WebSocket` works directly, but you usually want it in main so the connection persists when the window is hidden.

**Reconnect with jittered exponential backoff** — most production faults are transient (Railway redeploy, ISP blip, laptop sleep). Naive reconnect-immediately storms the server when many clients reconnect at once. Use jittered exponential backoff: `delay = min(cap, base * 2^attempt) * (0.5 + random()/2)`.

```js
import WebSocket from 'ws'

function connect(url, token, onMsg) {
  let attempt = 0
  let ws

  const open = () => {
    ws = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } })
    ws.on('open', () => { attempt = 0 })
    ws.on('message', onMsg)
    ws.on('close', () => {
      const base = 1000  // 1s
      const cap  = 30_000 // 30s
      const delay = Math.min(cap, base * 2 ** attempt) * (0.5 + Math.random() / 2)
      attempt += 1
      setTimeout(open, delay)
    })
    ws.on('error', () => ws.close())  // close triggers reconnect
  }
  open()
  return { send: (m) => ws?.send(m), close: () => ws?.close() }
}
```

**Auth on WebSocket**: send the token in the `Authorization` header during handshake (works in `ws`, doesn't work in browser `WebSocket` because the browser API doesn't accept custom headers). Alternative: `?token=...` in the URL — works everywhere but **leaks into server access logs and proxy logs**, so prefer header. Third option: open the socket unauthenticated, then send a `{ type: 'auth', token }` first message.

#### Server-Sent Events (SSE)

One-way (server → client), simpler protocol, plain HTTP, plays nicely with proxies. Use [`eventsource`](https://www.npmjs.com/package/eventsource) npm package in main, or native `EventSource` in renderer. Auth via `Authorization` header in the npm package; via cookie or query param in renderer (browser `EventSource` doesn't support headers either).

If your backend only needs to push (notifications, status updates, "you have a new message"), SSE is half the complexity of WebSocket and survives intermediate proxies better.

### 6. Offline-first patterns

Users open laptops on planes, in elevators, on flaky hotel wifi. The desktop affordance is "the app keeps working." Two pieces:

#### Local cache: SQLite

| Library | Sync/async | When to pick |
|---|---|---|
| **`better-sqlite3`** | Synchronous, native module | **Default for Electron main.** Fast (no JS↔C++ async overhead), simple API, battle-tested. Used by VS Code, Notion's desktop app, many others. Native module → ABI must match Electron's Node version, rebuild on install (`@electron/rebuild`). See [C4 Native integrations — native modules](04-native-integrations.md). |
| **`node:sqlite`** | Synchronous, built-in | Built into Node 22+. As of 2026-04 still **Stability 1.1 — Active development** (post-experimental but pre-stable). Can be enabled in Node 22 LTS without flags in recent releases; still iterating. Not yet a drop-in replacement for `better-sqlite3` for production Electron apps, but worth tracking. ([Node.js v22 docs — `node:sqlite`](https://nodejs.org/api/sqlite.html), as of 2026-04.) |
| **PGLite** | Async, WASM | If your Railway backend is **Postgres** and you want **schema parity** between local and remote. PGLite is Postgres-in-WASM (~3 MB gzipped), supports many extensions including `pgvector`, runs in Node/main or renderer. Lets you copy-paste server SQL/migrations to the client. ([electric-sql/pglite on GitHub](https://github.com/electric-sql/pglite), [pglite.dev](https://pglite.dev/), as of 2026-04.) |
| `IndexedDB` (renderer-only) | Async, browser API | Fine for renderer-side caches that don't need to be visible to main. Limited query power; many teams regret it once data grows. |

For a Railway-Postgres backend where you want offline-first: PGLite is the natural fit; for a generic JSON API where you just need a local cache, `better-sqlite3` is simpler.

#### Sync layer

DIY: write your own reconciliation. For each mutation, write to local SQLite immediately (optimistic UI), enqueue an outbound mutation in an `outbox` table, drain the outbox when online, reconcile conflicts on response. This is the lowest-magic approach and fine for simple apps.

Off-the-shelf:

- **ElectricSQL** — Postgres → local SQLite/PGLite sync engine. "Shape" subscriptions declare what subset of server data the client needs; bidirectional sync; works against an existing Postgres backend with minimal changes. As of 2026-04, used in production for apps that prioritize Postgres parity. ([Electric — sync engine](https://electric-sql.com/sync), as of 2026-04.)
- **RxDB** — JS-first reactive database with pluggable replication; Supabase plugin gives you Postgres sync via PostgREST + Realtime. Good fit if you're on Supabase already. ([RxDB replication docs](https://rxdb.info/replication.html), as of 2026-04.)
- **PowerSync**, **Zero** (Rocicorp) — alternatives in the same space; evaluate by the protocol they speak to your backend.

The ecosystem is still early in 2026; if you can avoid a sync engine and ship a simple outbox + cache, do that first.

#### Optimistic UI + queue-on-failure

The user-visible pattern: clicks "Save" → UI updates immediately → main writes to local SQLite → main attempts the backend POST → on success, mark synced; on failure (network down, 5xx), keep the row in `outbox` and retry on `online` event or next launch. Show a small "syncing 3 changes" indicator in the chrome.

### 7. CORS — actively a non-issue from main

CORS is a browser policy: the browser refuses to expose responses to JS unless `Access-Control-Allow-Origin` permits the origin. The main process is **not a browser document**; `net.fetch` from main is not subject to CORS. Your Railway backend can keep `Access-Control-Allow-Origin: https://yourwebapp.com` strict and your desktop app still works — because the desktop app routes through main, not through a browser document with an origin.

Where CORS *does* bite: if you do `fetch()` directly from the renderer to the backend. Don't do that. Route through IPC → main. (Also from the renderer you'd need to whitelist `connect-src` in CSP — see next.)

### 8. CSP — strict `connect-src` in the renderer

Even though renderer doesn't talk to the backend directly, it does load resources (fonts, images, possibly websockets if you compromise on the architecture). Set a strict CSP on the renderer; allow only what's needed:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://your-cdn.example.com;
  connect-src 'self' https://your-railway-app.up.railway.app wss://your-railway-app.up.railway.app;
  font-src 'self';
">
```

If you stick to "renderer never talks to backend," you can drop `connect-src` for the backend domain entirely (`connect-src 'self'` is enough). See [C3 Security](03-security.md) for the full CSP guidance and the rest of the security checklist.

### 9. Railway-specific notes

- **HTTPS by default.** Railway gives every service a `*.up.railway.app` subdomain with a managed cert. Hardcode `https://...` in production; use a `RAILWAY_PUBLIC_URL` env at build time so the desktop binary points at the right host per environment.
- **Custom domains.** When you wire up `api.yourapp.com` → Railway, the cert is managed by Railway. No app-side change beyond updating the URL.
- **Healthcheck endpoint.** Add a `/healthz` route to your backend; have main process ping it before showing the main window (or before unblocking the offline-mode banner). Railway redeploys cause a 30-90s gap; the healthcheck makes the desktop app's behavior during that gap visible.
- **TCP proxy.** If you need raw TCP (not HTTPS) — e.g. you're hosting a custom protocol server — Railway supports it; but for almost every desktop-app use case, HTTPS + WebSocket covers the ground.
- **Region pinning.** Railway lets you choose a region; for global desktop users, pick the region closest to most users or front it with a CDN/edge function for static assets.

### 10. Error handling & user experience

Categorize errors at the IPC boundary so the UI can react sensibly:

| Category | What it means | UI response |
|---|---|---|
| `network/offline` | `net.fetch` rejected with `ERR_NAME_NOT_RESOLVED` / `ERR_INTERNET_DISCONNECTED` | Show "offline" banner; queue the mutation in outbox |
| `auth/expired` | Backend returned 401 | Try refresh-token rotation once; if that 401s too, clear `safeStorage` and show login |
| `server/5xx` | Transient backend issue | Retry with backoff (3 tries, jittered) before surfacing to user |
| `client/4xx` (not 401) | Validation, permission denied | Surface backend's error message; don't retry |
| `payload/parse` | JSON didn't parse, schema mismatch | Log to crash reporter; treat as 5xx for retry |

**Refresh-token rotation on 401** — the canonical pattern. On any 401, attempt `POST /auth/refresh` with the refresh token; if it succeeds, retry the original request once with the new access token; if it fails, the user is fully logged out. Keep this single-flight (multiple in-flight 401s should share one refresh attempt, not stampede).

**Online/offline indicator.** Wire `mainWindow.webContents.on('did-start-loading' ...)` and your own healthcheck poll into a renderer-side state variable. The browser `navigator.onLine` is mostly correct but lies on some Linux WMs and on captive portals.

## Mini-example

A typed `callApi` wrapper in main process — handles auth attach, refresh-on-401 (single-flight), and exposes via `contextBridge` for the renderer.

```js
// main/api.js  ─ talks to your Railway backend
import { net, app, safeStorage } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

const API_BASE = process.env.RAILWAY_PUBLIC_URL ?? 'https://your-app.up.railway.app'
const TOKEN_FILE = path.join(app.getPath('userData'), 'session.bin')

let tokens = null            // { accessToken, refreshToken }
let refreshInflight = null   // single-flight refresh promise

async function loadTokens() {
  if (tokens) return tokens
  try {
    const buf = await fs.readFile(TOKEN_FILE)
    tokens = JSON.parse(safeStorage.decryptString(buf))
  } catch { tokens = null }
  return tokens
}

async function saveTokens(t) {
  tokens = t
  await fs.writeFile(TOKEN_FILE, safeStorage.encryptString(JSON.stringify(t)))
}

async function clearTokens() {
  tokens = null
  await fs.rm(TOKEN_FILE, { force: true })
}

async function refreshOnce() {
  if (refreshInflight) return refreshInflight
  refreshInflight = (async () => {
    const res = await net.fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    })
    if (!res.ok) { await clearTokens(); throw new Error('refresh-failed') }
    await saveTokens(await res.json())
  })().finally(() => { refreshInflight = null })
  return refreshInflight
}

export async function callApi(method, path, body) {
  await loadTokens()
  const doFetch = () => net.fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  let res = await doFetch()
  if (res.status === 401 && tokens?.refreshToken) {
    try { await refreshOnce(); res = await doFetch() } catch { /* falls through */ }
  }
  if (!res.ok) {
    const err = new Error(`api ${method} ${path} → ${res.status}`)
    err.status = res.status
    err.body = await res.text().catch(() => '')
    throw err
  }
  return res.headers.get('content-type')?.includes('json') ? res.json() : res.text()
}

// main/index.js  ─ wire to IPC
import { ipcMain } from 'electron'
import { callApi } from './api.js'

ipcMain.handle('api:call', async (_e, method, path, body) =>
  callApi(method, path, body)
)

// preload.js  ─ exposed to renderer
import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('api', {
  call: (method, path, body) => ipcRenderer.invoke('api:call', method, path, body),
})

// renderer  ─ usage
const me = await window.api.call('GET', '/users/me')
```

The pattern: renderer never sees `API_BASE`, never sees a token, never knows about retry. Main owns all of that. Refresh-on-401 is single-flight (`refreshInflight` promise) so 10 concurrent 401s share one refresh call, not 10. Errors carry `status` and `body` so the renderer can branch on auth-expired vs validation-failed vs server-down.

For the full scaffold (with WebSocket reconnect, outbox queue, healthcheck-on-startup), see [Template 5 Railway backend client](../../build-kit/templates/05-railway-backend-client.md).

## Cross-links

- [C2 Process model & IPC](02-process-model-and-ipc.md) — the `contextBridge` + `ipcMain.handle` pattern this page builds on; renderer→main API surface
- [C3 Security](03-security.md) — CSP `connect-src` rules, contextIsolation, the broader checklist
- [C4 Native integrations](04-native-integrations.md) — deep-link / custom-protocol handlers for OAuth callback; native-module ABI rebuild for `better-sqlite3`
- [C8 Frontend stack](08-frontend-stack.md) — env vars in Vite vs Webpack for `RAILWAY_PUBLIC_URL`; main/renderer boundary in dev vs production
- [Template 5 Railway backend client](../../build-kit/templates/05-railway-backend-client.md) — full scaffold: auth flow, safeStorage, WebSocket reconnect, offline cache

## Sources

- [Electron `net` API — Chromium network stack, `net.fetch`, system proxy](https://www.electronjs.org/docs/latest/api/net) — (as of 2026-04)
- [Electron `safeStorage` API — encryption-at-rest backed by OS keychain](https://www.electronjs.org/docs/latest/api/safe-storage) — (as of 2026-04)
- [`atom/node-keytar` — archived repo issue #438; maintainers point to safeStorage](https://github.com/atom/node-keytar/issues/438) — (as of 2026-04)
- [Replacing Keytar with safeStorage in Ray — Freek Van der Herten](https://freek.dev/2103-replacing-keytar-with-electrons-safestorage-in-ray) — (as of 2026-04)
- [Build and Secure an Electron App — OpenID, OAuth — Auth0](https://auth0.com/blog/securing-electron-applications-with-openid-connect-and-oauth-2/) — (as of 2026-04)
- [RFC 7636 — PKCE for OAuth public clients](https://datatracker.ietf.org/doc/html/rfc7636) — (as of 2026-04)
- [RFC 8252 — OAuth 2.0 for Native Apps (loopback redirect URI)](https://datatracker.ietf.org/doc/html/rfc8252) — (as of 2026-04)
- [`better-sqlite3` on GitHub — synchronous SQLite](https://github.com/WiseLibs/better-sqlite3) — (as of 2026-04)
- [Node.js v22 docs — `node:sqlite` (Stability 1.1 — Active development)](https://nodejs.org/api/sqlite.html) — (as of 2026-04)
- [`electric-sql/pglite` — Postgres in WASM](https://github.com/electric-sql/pglite) — (as of 2026-04)
- [PGlite — official site](https://pglite.dev/) — (as of 2026-04)
- [Electric — sync engine for Postgres → local SQLite/PGLite](https://electric-sql.com/sync) — (as of 2026-04)
- [RxDB replication — Supabase / Postgres plugin](https://rxdb.info/replication.html) — (as of 2026-04)
- [`ws` — WebSocket library for Node](https://github.com/websockets/ws) — (as of 2026-04)
- [`eventsource` npm — SSE client for Node](https://www.npmjs.com/package/eventsource) — (as of 2026-04)
- [Railway docs — public networking & TCP proxy](https://docs.railway.com/) — (as of 2026-04)
