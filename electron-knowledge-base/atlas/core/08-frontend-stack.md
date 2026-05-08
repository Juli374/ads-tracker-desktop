# C8. Frontend stack — Vite + framework + Electron, ESM, HMR, dev/prod loading

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

Modern Electron renderers are bundled like any web app: a frontend framework (React / Vue / Svelte / Solid), a dev server with HMR, and a production bundler that emits an `index.html` plus chunks. As of 2026-04, Electron Forge ships **two** first-party templates — a stable [Webpack template](https://www.electronforge.io/templates/webpack-template) and a [Vite template](https://www.electronforge.io/templates/vite) that has been [marked experimental since Forge v7.5](https://www.electronforge.io/config/plugins/vite) and remains experimental through 7.11.x ([as of 2026-04](https://github.com/electron/forge/issues/4166)). Outside Forge, [`electron-vite`](https://electron-vite.org/) is a community-maintained, production-ready Vite toolchain (5.0.0 stable, v6 in beta as of 2026-04) used by many shipping apps. The KB stays framework-agnostic: pick what your team already runs. ESM is stable in main, preload, and renderer [since Electron 28 (Dec 2023)](https://www.electronjs.org/blog/electron-28-0); use `import.meta.url` + `fileURLToPath` instead of `__dirname`, and keep CommonJS-only deps loadable via dynamic `import()`. Dev loads `http://localhost:5173`, production loads the built `index.html` via `mainWindow.loadFile(...)` — and the only Electron-specific gotcha is wiring asset paths so they survive the `file://` switch.

## When to apply

- You are starting a new Electron app and need to pick a renderer toolchain (bundler + framework + ESM strategy).
- You want HMR for the renderer and hot-restart for the main process during development.
- You are sharing TypeScript types between main and renderer (typed IPC — see [C2 Process model & IPC](02-process-model-and-ipc.md)).
- You already have a Vite-based web app and want to "wrap it" into Electron.
- You are upgrading from a CommonJS-based scaffold to ESM and need to know what breaks.

## When NOT to apply

- You are still deciding between Electron and Tauri / PWA — return to [build-kit/decision-tree.md](../../build-kit/decision-tree.md) first.
- You have a vanilla `<script>`-tag UI (no build step) and the renderer is one HTML file. Don't introduce a bundler just to satisfy convention; load the file with `BrowserWindow.loadFile(...)` and move on.
- You are evaluating "should I use Webpack from scratch" in 2026 — **don't**. Either use Forge's stable Webpack template (which generates the config for you) or jump to Vite via `electron-vite`. Hand-rolled Webpack configs are a maintenance tax with no upside today.
- The page won't help you choose between React and Vue. Pick whichever your team uses; the Electron-specific layer is identical.

## Anatomy

### 1. Bundler / dev-server choice (as of 2026-04)

Three real-world setups dominate. None is wrong; the trade-off is "official endorsement" vs "Vite-native ergonomics."

| Setup | Status (2026-04) | Strengths | Caveats |
|---|---|---|---|
| **Forge Webpack template** | Stable, first-party | Officially supported, no experimental flag, mature config injection, ships Squirrel.Windows maker out of the box | Webpack is slower at HMR than Vite; config is generated but still Webpack underneath |
| **Forge Vite plugin / template** | Experimental since [v7.5](https://www.electronforge.io/config/plugins/vite); still experimental in 7.11.x | First-party path to Vite; fast HMR; Forge handles packaging | API may break across minor versions; Vite version tracking lags upstream (Forge currently on Vite 7 while Vite 8 shipped Mar 2026 per [forge issue #4166](https://github.com/electron/forge/issues/4166)) |
| **electron-vite (standalone)** | Stable, production-used | Purpose-built for Electron; HMR + main hot-restart; widely deployed; 5.0.0 stable, v6 beta available | Not a packager — you pair it with electron-builder or `@electron/packager` for installers; no first-party Electron endorsement |

**The trajectory** is Vite — Forge's Vite plugin will eventually go stable, and the wider JS ecosystem standardised on Vite for new tooling. **The safe choice today** inside Forge is Webpack (per Forge's own labelling); the safe choice today outside Forge is `electron-vite`. Many production apps run `electron-vite` paired with `electron-builder` for packaging — see [electron-vite homepage](https://electron-vite.org/) for the canonical setup and [vite-electron-builder](https://github.com/cawa-93/vite-electron-builder) for an alternative starter.

The "experimental" tag on Forge's Vite plugin is not a warning that it's broken — production apps ship with it. It is a notice that Forge maintainers may break the plugin's API across minor releases as they catch up to upstream Vite. If you can't tolerate that churn, use Webpack inside Forge or `electron-vite` outside Forge.

### 2. Frontend framework integration

The KB is framework-agnostic. From the renderer's perspective, Electron is a Chromium tab, so anything Vite scaffolds with `npm create vite@latest` works — React, Vue, Svelte, Solid, Preact, plain TS — just point your Electron `BrowserWindow` at the dev URL or the built `index.html`. There is no Electron-specific renderer framework.

What changes per framework is purely web-side: how routes, state, and components are structured. The Electron-specific surface (preload, IPC, storage) lives behind `window.electronAPI` regardless of framework. See [C2 Process model & IPC](02-process-model-and-ipc.md) for that surface, and [Template 1 secure preload](../../build-kit/templates/01-secure-preload.md) for the boilerplate.

`electron-vite` ships templates for [Vue, React, Svelte, and Solid](https://electron-vite.org/guide/) — useful primarily as a reference for the shared `electron.vite.config.ts`; the framework-specific code is identical to a normal Vite app.

### 3. ESM in Electron (stable since v28, Dec 2023)

Per the [Electron 28 release blog](https://www.electronjs.org/blog/electron-28-0): "Added ESM support (a highly requested feature)." Per the [ESM tutorial](https://www.electronjs.org/docs/latest/tutorial/esm), ESM works in main, preload, and renderer.

Key implications:

- **`import` / `export` work natively** in main (`main.mjs` or `"type": "module"` package.json), preload, and renderer — no bundler required to convert them. (Renderer's bundler still does its own work for code-splitting, asset hashing, etc.)
- **`__dirname` and `__filename` are not defined in ESM modules.** Replace with:

  ```ts
  import { fileURLToPath } from 'node:url';
  import { dirname } from 'node:path';
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  ```

- **`require()` is not available in ESM modules** by default. If a dependency is CommonJS-only and has no ESM build, use a dynamic `import()` (which can load CJS modules and returns the default export). Some heavy native-binding modules (`better-sqlite3`, native node-addons) historically lagged on ESM; check `package.json` `exports` before assuming.
- **CJS↔ESM interop edge cases**: a CJS package's default export sometimes lands at `pkg.default` instead of `pkg` when imported as ESM. Vite, esbuild, and TypeScript with `esModuleInterop: true` paper over this for renderer code; in main-process code that runs through Node directly, you may need to write `import pkg from 'cjs-pkg'` and access `pkg.default`. The [Node.js ESM docs](https://nodejs.org/api/esm.html) cover the full table; in practice, write the import, run it, fix it.
- **Sandboxed renderers** (default since Electron 20) **cannot use ESM in preload scripts** when `sandbox: true` is set — sandboxed preloads run in a CommonJS-style isolated worker. Set `sandbox: false` only if you understand the security cost (you almost never should — see [C3 Security](03-security.md)). The renderer itself can still use ESM normally.

For new projects, write everything as ESM unless a dependency forces your hand. The bundlers (Vite, Webpack via Forge, `electron-vite`) all default to ESM source.

### 4. TypeScript

Most teams ship TypeScript across main + preload + renderer because the IPC contract is the highest-leverage place to have type safety: a typo in a channel name fails silently at runtime in plain JS. Both `electron-vite` and the Forge Vite-with-TypeScript and Webpack-with-TypeScript templates support TS out of the box (see [Forge's Vite + TypeScript template](https://www.electronforge.io/templates/vite-+-typescript)).

Pattern: define IPC channel signatures in a `shared/ipc-types.ts` file, import them from both main and preload. The renderer imports the `window.electronAPI` shape (also from a shared types file) so calling code is checked. See [Template 2 IPC contract](../../build-kit/templates/02-ipc-contract.md) for the canonical layout.

TypeScript-specific gotchas:

- The `electron` package types include both main and renderer APIs. `import { app } from 'electron'` works in main code; renderer code should not import from `electron` directly (no Node access there) — instead, type `window.electronAPI` from your shared types.
- `tsconfig.json` `module` setting matters: use `"NodeNext"` or `"ESNext"` for ESM main; renderer code (bundled by Vite) can use `"ESNext"` with `"moduleResolution": "Bundler"`. Multiple `tsconfig`s — one per process — keeps configs sane.

### 5. Dev workflow

- **HMR for the renderer** — Vite handles this natively. A code change in a React/Vue/Svelte component swaps modules in place without losing state. `electron-vite` and the Forge Vite plugin both wire this through to the Electron BrowserWindow automatically.
- **Hot-restart for the main process** — main process changes require restarting Electron itself (a running window can't hot-swap a new `app.on('ready')` handler). `electron-vite` watches main + preload sources and triggers an Electron restart when they change; Forge does similar with its Vite plugin. Webpack-based setups need `nodemon` or similar wiring.
- **Preload script changes** — Preload runs once per BrowserWindow creation. A preload edit normally requires reloading the window (Cmd-R). Some setups script this; many don't.
- **DevTools** — open via `mainWindow.webContents.openDevTools()` during development, or via the standard keyboard shortcut (Cmd-Opt-I on macOS, Ctrl-Shift-I elsewhere) once Chromium's DevTools menu item is exposed. Most templates auto-open DevTools when `process.env.NODE_ENV !== 'production'`.
- **Source maps** — enable in `vite.config.ts` (`build.sourcemap: true`) so renderer source maps land in `dist/`; DevTools picks them up automatically. For main-process source maps, generate them in your TS build and Node will use them automatically with `--enable-source-maps` (default in modern Node).
- **Logging** — `console.log` from main lands in the terminal that launched Electron; from renderer it lands in the BrowserWindow's DevTools console. For production logging that captures both, see `electron-log` referenced in [C10 Performance & observability](10-performance-and-observability.md).

### 6. Production build

The renderer, main, and preload each go through their own bundler step.

- **Renderer** → bundled to `dist/renderer/index.html` plus hashed `assets/*.js` and `assets/*.css`. Loaded via `mainWindow.loadFile('dist/renderer/index.html')` in production. The `loadFile` path uses the `file://` protocol — straightforward, but read the static-assets section below for path gotchas.
- **Main** → bundled to `dist/main/index.js` (or similar). Run by Electron via the `main` field in `package.json`. With ESM, set `"type": "module"` in `package.json` and use a `.js` extension, or use `.mjs`. Most teams bundle main with esbuild (Vite uses esbuild under the hood for non-renderer builds) to collapse imports into a single file and avoid `node_modules` resolution surprises at runtime.
- **Preload** → bundled to `dist/preload/index.js`. Loaded via `webPreferences.preload: path.join(__dirname, 'preload/index.js')`. **Preload must be CommonJS when `sandbox: true`** (it runs in a sandboxed worker). Most bundlers detect this and emit CJS for preload; double-check in your `electron-vite.config.ts` or Forge config.

Some teams serve the renderer from a **local HTTP server** in production instead of `loadFile` — useful when SPA routing breaks under `file://` (relative paths and the History API have edge cases). For most apps, `loadFile` plus **hash routing** (`/#/path` instead of `/path`) works without any local server. The localhost-server approach is a known pattern, not a requirement; pick `loadFile` unless your router fights it.

### 7. Why not Webpack-from-scratch in 2026

Hand-rolling a Webpack config for an Electron renderer takes hundreds of lines: separate configs for main and renderer, loaders for TS / CSS / images, HMR plumbing, source-map config, electron-aware externals. Forge's Webpack template hides all of that. Vite hides all of that and is faster. There is no remaining reason to write a Webpack config from scratch — either use Forge's template (which is the safe stable choice in Forge today) or use Vite via `electron-vite`. The hand-rolled path is pure debt.

### 8. CSS

CSS modules, Tailwind, plain CSS, styled-components, vanilla-extract — all just frontend choices, work as in any web app. Vite's CSS handling (PostCSS, `*.module.css`, hot-reload) applies unchanged. No Electron-specific layer.

One mild gotcha: CSP (Content Security Policy — see [C3 Security](03-security.md)) interacts with inline styles. If you set a strict CSP and use a runtime CSS-in-JS library that injects inline `<style>` tags, you may need a `style-src 'unsafe-inline'` exception or a nonce. Build-time CSS extraction (Tailwind, CSS modules, vanilla-extract) avoids this — recommended for Electron apps.

### 9. Static assets

Image and font paths differ between dev and production:

- **Dev** (Vite dev server): `http://localhost:5173/some-image.png` — Vite serves from `public/` and resolves relative imports.
- **Prod** (file://): `file:///Applications/MyApp.app/Contents/Resources/app.asar/dist/renderer/assets/some-image-abc123.png` — bundled and hashed.

The fix is **always import assets via the bundler**, never hard-code path strings:

```ts
import logoUrl from './assets/logo.png';
// logoUrl is the dev URL during dev, the hashed file:// URL in prod.
```

This works for `<img src={logoUrl}>`, CSS `background-image`, etc. Vite rewrites the URL at build time. Files that must keep their literal name (favicons, manifest assets) go in `public/` and are referenced by literal path — Vite copies `public/` verbatim to `dist/`.

### 10. State management

The renderer can use whatever state library you'd use in a web app — Zustand, Pinia, Redux, Recoil, Jotai, Svelte stores, plain React context. There is no Electron-specific state library.

State that must persist **across sessions** (settings, auth tokens, cached data) crosses the IPC boundary into main-process storage. The renderer should not reach for `localStorage` for sensitive data — it lives inside the Chromium profile, unencrypted, and survives uninstall in some cases. The pattern:

- Renderer state library holds the in-memory shape.
- On change, IPC-`invoke` to main; main writes to `safeStorage` (OS keychain) for secrets, `electron-store` / SQLite / a JSON file for non-secret persistence.
- On boot, renderer requests current state from main via IPC and hydrates the store.

`safeStorage`, SQLite via `better-sqlite3`, and the WebSocket / offline-cache patterns live in [C9 Backend connectivity](09-backend-connectivity.md). The IPC boundary itself is [C2](02-process-model-and-ipc.md).

## Mini-example

A minimal `electron-vite` project layout — same shape works in Forge templates with renamed config files.

```
my-electron-app/
├── package.json              # "type": "module", scripts: dev / build / package
├── electron.vite.config.ts   # main + preload + renderer build configs
├── tsconfig.json             # references per-process tsconfigs
├── tsconfig.node.json        # main + preload (NodeNext, target ES2022)
├── tsconfig.web.json         # renderer (Bundler resolution, target ESNext)
├── src/
│   ├── main/
│   │   ├── index.ts          # app.whenReady, BrowserWindow creation
│   │   └── ipc-handlers.ts   # ipcMain.handle(...) for typed channels
│   ├── preload/
│   │   └── index.ts          # contextBridge.exposeInMainWorld('electronAPI', ...)
│   ├── renderer/
│   │   ├── index.html        # entry; loads /src/main.tsx
│   │   └── src/
│   │       ├── main.tsx      # React/Vue/Svelte mount
│   │       └── App.tsx
│   └── shared/
│       └── ipc-types.ts      # types shared between main + preload + renderer
└── dist/                     # build output (renderer/, main/, preload/)
```

`electron.vite.config.ts` (skeleton):

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { sourcemap: true, rollupOptions: { input: resolve('src/main/index.ts') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { sourcemap: 'inline', rollupOptions: { input: resolve('src/preload/index.ts') } },
  },
  renderer: {
    root: resolve('src/renderer'),
    build: { sourcemap: true, rollupOptions: { input: resolve('src/renderer/index.html') } },
    plugins: [react()],
  },
});
```

`package.json` scripts (skeleton):

```json
{
  "type": "module",
  "main": "./dist/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "package": "electron-vite build && electron-builder",
    "package:mac": "electron-vite build && electron-builder --mac",
    "package:win": "electron-vite build && electron-builder --win"
  }
}
```

`src/main/index.ts` (skeleton):

```ts
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    // dev — electron-vite sets this to http://localhost:5173
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);
```

That is the full Electron-specific surface for a Vite-based renderer. Everything else is regular React / Vue / Svelte.

## Cross-links

- [C1 Fundamentals](01-fundamentals.md) — three-process model, Electron version + Chromium / Node versions.
- [C2 Process model & IPC](02-process-model-and-ipc.md) — typed IPC contract; what the renderer talks to.
- [C3 Security](03-security.md) — `contextIsolation`, `sandbox`, CSP — all defaults you should not relax.
- [C9 Backend connectivity](09-backend-connectivity.md) — `safeStorage`, SQLite, persistence patterns.
- [C10 Performance & observability](10-performance-and-observability.md) — source maps in production, `electron-log`.
- [Template 1 secure preload](../../build-kit/templates/01-secure-preload.md) — the preload boilerplate referenced above.
- [Template 2 IPC contract](../../build-kit/templates/02-ipc-contract.md) — typed channel pattern with shared types.

## Sources

- [ES Modules (ESM) in Electron | Electron docs](https://www.electronjs.org/docs/latest/tutorial/esm) — official ESM guide; `__dirname` replacement, sandboxed-preload caveat, CJS interop. (as of 2026-04)
- [Electron 28.0.0 release blog](https://www.electronjs.org/blog/electron-28-0) — "Added ESM support (a highly requested feature)" — Dec 2023. (as of 2026-04)
- [Forge Vite plugin (config)](https://www.electronforge.io/config/plugins/vite) — first-party Vite plugin; experimental flag and rationale. (as of 2026-04)
- [Forge Vite template](https://www.electronforge.io/templates/vite) — scaffolding `npm init electron-app -- --template=vite`. (as of 2026-04)
- [Forge Vite + TypeScript template](https://www.electronforge.io/templates/vite-+-typescript) — TS variant. (as of 2026-04)
- [Forge Webpack template](https://www.electronforge.io/templates/webpack-template) — stable, first-party alternative. (as of 2026-04)
- [Support Vite 8 in @electron-forge/plugin-vite | electron/forge#4166](https://github.com/electron/forge/issues/4166) — confirms Forge tracks Vite 7 while Vite 8 shipped Mar 2026; experimental status persists. (as of 2026-04)
- [electron-vite | homepage](https://electron-vite.org/) — community Vite tooling; stable 5.0.0, v6 beta. (as of 2026-04)
- [Getting Started | electron-vite](https://electron-vite.org/guide/) — templates for Vue / React / Svelte / Solid. (as of 2026-04)
- [vite-electron-builder | GitHub](https://github.com/cawa-93/vite-electron-builder) — alternative starter for Vite + electron-builder. (as of 2026-04)
- [Vite 6.0 release blog](https://vite.dev/blog/announcing-vite6) — Environment API context for upstream Vite trajectory. (as of 2026-04)
- [Releases | Vite](https://vite.dev/releases) — Vite 8.0 shipped Mar 2026 with Rolldown bundler. (as of 2026-04)
