# A5. Testing Electron apps — Playwright, mocking IPC, CI

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

Use **[Playwright for Electron](https://playwright.dev/docs/api/class-electron)** for end-to-end and integration tests — it's Microsoft-supported, drives a real Electron app via `_electron.launch()`, and is the canonical replacement for Spectron (deprecated 2022). Use **Vitest or Jest in jsdom/happy-dom** for renderer-only unit tests of pure modules, with a fake `window.api` that mirrors your `contextBridge` surface. Run cross-platform CI on **GitHub Actions matrix runners** (`ubuntu-latest`, `macos-latest`, `windows-latest`) with `xvfb-run` on Linux. Cache npm, Electron prebuilt binaries, and Playwright browsers so you don't redownload ~200 MB per run. Always ship a **smoke test** that boots the packaged app on each platform — most "works on my machine" failures only surface after packaging, signing, and notarization.

## When to apply

- You're shipping anything beyond a side project — at minimum, you need a smoke test that boots the packaged app on each target OS.
- Your renderer has non-trivial logic that benefits from fast unit tests (Vitest in jsdom).
- You have a typed IPC contract and want to verify both ends (Playwright integration tests).
- You're publishing to a store or via auto-update — regressions in code signing, ASAR integrity, or the preload bridge are silent until launch.

## When NOT to apply

- **Don't reach for Spectron.** It was [officially deprecated by the Electron team in February 2022](https://www.electronjs.org/blog/spectron-deprecation-notice) when Electron 13 broke its renderer-process remote dependency. Existing Spectron projects should migrate to Playwright.
- **Don't bother stubbing the entire Electron API by hand.** For renderer unit tests, mock the *narrow* `window.api` surface your preload exposed via `contextBridge`. For main-process tests that touch many APIs, prefer a real Electron run via Playwright over building a deep fake.
- **Don't run E2E on every commit.** They're 10-100× slower than unit tests. Run them on PRs against `main` and pre-release.

## Anatomy

### History — Spectron is dead

Spectron was the original Electron testing library, built on top of WebDriverIO. The Electron team [deprecated it on 2022-02-01](https://www.electronjs.org/blog/spectron-deprecation-notice) because Electron 14 removed the `remote` module Spectron depended on, and the maintainer-time cost of keeping it alive outweighed the benefit. The official guidance since then is to use Playwright. (As of 2026-04, this guidance still stands; the Electron docs' [Automated Testing](https://www.electronjs.org/docs/latest/tutorial/automated-testing) page lists Playwright first.)

### Today (2026-04) — the layered toolkit

**Playwright for Electron — the E2E and integration workhorse.** Microsoft maintains [first-party Electron support in Playwright](https://playwright.dev/docs/api/class-electron) via the `_electron` namespace. The leading underscore signals *experimental*, but Microsoft itself uses Playwright `_electron` to test VS Code; the API has been stable across recent Playwright minor releases. Treat as production-ready while keeping an eye on Playwright release notes.

The core API is small:

- `_electron.launch({ args: ['./main.js'] })` boots a real Electron process with your real main script. No web stub, no remote, no fork.
- Returns an `ElectronApplication` you can use to grab windows, evaluate code in the main process (`app.evaluate(...)`), and shut down cleanly.
- Each window is a normal Playwright `Page` — `page.click()`, `page.locator()`, `page.screenshot()` all work as expected against the real renderer.

This is the right tool for: integration tests (main + preload + IPC contract end-to-end), E2E flows (full user journeys), and packaged-app smoke tests (boot the signed `.app`/`.exe`/`.AppImage` and verify it doesn't crash).

**Vitest or Jest with jsdom / happy-dom — for renderer unit tests.** Pure JS/TS modules in your renderer (formatters, reducers, validation, derived selectors) don't need an Electron process. Run them under [Vitest](https://vitest.dev/) or [Jest](https://jestjs.io/) with jsdom or happy-dom as the DOM environment. They start in <1 s and fit watch-mode loops cleanly. Coverage of pure logic via these unit tests should reach much further than your slower E2E suite ever will.

**Mocking IPC for renderer tests.** Modern preload scripts expose a typed API to the renderer via `contextBridge.exposeInMainWorld('api', {...})`. In a unit test, the renderer code reads `window.api.foo()` — and there's no real preload running, so you set up a fake. Pattern:

```ts
// test/setup/mock-window-api.ts
beforeEach(() => {
  (globalThis as any).window.api = {
    listProjects: vi.fn().mockResolvedValue([{ id: '1', name: 'Mock' }]),
    onAppEvent: vi.fn(),
    saveToken: vi.fn().mockResolvedValue(true),
  };
});
```

Mirror exactly the shape your real preload exposes — keep the contract in a shared `types/api.ts` file imported by both the preload and the test setup so type drift fails the build.

**Mocking IPC for main-process tests.** When you want to unit-test main-process handler logic without a renderer, options are:

- [`electron-mock-ipc`](https://github.com/h3poteto/electron-mock-ipc) — a thin shim that lets `ipcMain` and `ipcRenderer` talk to each other in a single Node process. **As of 2026-04, the repository has not seen significant updates since 2022** (per its npm page and GitHub commit history), so vet it against your Electron version before adopting. It still works for many setups, but for new projects consider rolling a tiny manual stub or using Playwright's `app.evaluate(() => ipcMain.emit(...))` against a real app run.
- **Roll your own.** A 30-line `EventEmitter`-based shim covers `ipcMain.handle` / `ipcRenderer.invoke` for most projects.
- **Or test the underlying logic, not the wire.** Extract handler bodies into pure functions (`handleSaveProject(data, db)`) and test those directly; reserve IPC-shaped tests for Playwright integration runs.

**Native module testing.** Native Node modules (better-sqlite3, keytar legacy, custom NAPI add-ons) are compiled against Electron's Node ABI, not the system Node ABI. Two strategies:

1. **Test in pure Node** when possible. Keep platform-agnostic logic in a pure-Node package; recompile and exercise it under Node directly with `node --test` or Vitest. Faster, simpler.
2. **Test via Electron** when the binding is Electron-specific. Use [`@electron/rebuild`](https://github.com/electron/rebuild) to recompile against the Electron ABI, then run tests through `electron` itself or a Playwright `_electron.launch` harness. See C4 for the ABI mismatch background.

### CI — running it on every PR

**GitHub Actions matrix.** The standard pattern uses [GitHub Actions](https://docs.github.com/en/actions) with a 3×N matrix:

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
    node: [20, 22]
```

The Linux runner is the cheap workhorse for unit + integration tests. The macOS and Windows runners exist to catch platform-specific regressions (path handling, native module ABI, signing).

**xvfb on Linux.** Electron renderers need a display server. Headless Linux runners (Ubuntu) don't have one by default. Wrap your test command with `xvfb-run` (or `xvfb-maybe` if you want it transparent on platforms that don't need it):

```yaml
- name: E2E (Linux)
  if: runner.os == 'Linux'
  run: xvfb-run --auto-servernum npm run test:e2e
```

This is *the* most common cause of "works locally, fails in CI" for Electron projects — see the long-standing [microsoft/playwright#12139](https://github.com/microsoft/playwright/issues/12139) thread for the full failure-mode catalog and Simon Willison's [worked GitHub Actions example](https://til.simonwillison.net/electron/testing-electron-playwright). On macOS and Windows runners, just run headed; the runners have a virtual desktop.

**macOS runners — code signing tests.** GitHub-hosted macOS runners can do unsigned builds, but real signing/notarization tests need a Developer ID certificate, app-specific password, and an unlocked keychain. Signing tests usually run as a separate workflow on a dedicated runner (or self-hosted Mac) so secrets aren't exposed to PR builds from forks. See C5 for the full code-signing pipeline.

**Windows runners — installer tests.** Boot the NSIS / MSIX / Squirrel installer, verify it installs cleanly, run a smoke test, uninstall. Catching installer regressions in CI prevents shipping broken updaters.

**Caching.** Three caches save 1-3 minutes per run:

- npm cache (`actions/setup-node@v4` with `cache: 'npm'`).
- Electron prebuilt binaries — `~/.cache/electron` (Linux/macOS), `%LOCALAPPDATA%\electron\Cache` (Windows). Around 80-100 MB per Electron version.
- Playwright browsers — only relevant if you also run web tests; Electron-only suites can skip with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.

### Testing strategy — what runs where

A good Electron project has four layered suites:

| Layer | Tool | What it covers | Speed | Run on |
|---|---|---|---|---|
| **Unit (renderer)** | Vitest + jsdom | Pure logic, formatters, selectors, components against fake `window.api` | <2 s suite | Every commit, watch mode |
| **Unit (main)** | Vitest in Node | Pure handler bodies extracted from IPC wiring | <2 s suite | Every commit |
| **Integration** | Playwright `_electron.launch` | Main + preload + IPC contract round-trip; one window | 10-30 s per test | Every PR |
| **E2E** | Playwright `_electron.launch` | Full user flows, multi-window, file dialogs (auto-accepted) | 1-5 min suite | PRs to main, pre-release |
| **Smoke (packaged)** | Playwright against `app.asar` build | Boot signed app, verify version, ping backend, no crash | 30 s per platform | Pre-release, post-build |

The smoke test is the under-appreciated one. Most "ship-breakers" — bad code-signing, missing notarization, ASAR integrity fuse misconfiguration, broken `Info.plist` entitlements, native modules forgotten in the build — only show up after packaging. A smoke test that calls into the *signed, packaged* app on each OS catches them before users do.

## Mini-example

A minimal Playwright `_electron.launch` test covering: boot the app, grab the first window, assert the title, click a button, verify an IPC-driven UI update, exit cleanly.

```ts
// e2e/smoke.spec.ts
import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';

test('app boots and round-trips through IPC', async () => {
  // Launch real Electron with our real main entry.
  const app = await electron.launch({
    args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, NODE_ENV: 'test', E2E: '1' },
  });

  // Sanity-check the main process — app.evaluate() runs in the main context.
  const isPackaged = await app.evaluate(({ app }) => app.isPackaged);
  expect(isPackaged).toBe(false);

  // Grab the first BrowserWindow as a Playwright Page.
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  expect(await window.title()).toMatch(/MyApp/);

  // Drive UI; this triggers ipcRenderer.invoke('projects:list').
  await window.getByRole('button', { name: 'Refresh' }).click();
  await expect(window.getByTestId('project-count')).toHaveText('3');

  await app.close();
});
```

Run on Linux CI with `xvfb-run npx playwright test`. See [`spaceagetv/electron-playwright-example`](https://github.com/spaceagetv/electron-playwright-example) for a more elaborate working repo.

## Cross-links

- [C2 Process model & IPC](../core/02-process-model-and-ipc.md) — the contract you're testing across the preload boundary.
- [C8 Frontend stack](../core/08-frontend-stack.md) — Vitest configuration alongside your Vite/Webpack renderer build.
- [A6 Telemetry & crash reporting](06-telemetry.md) — production crash data is the test suite you can't write; pair smoke tests with Crashpad/Sentry to catch what slipped through CI.

## Sources

- [Spectron Deprecation Notice | Electron blog (2022-02-01)](https://www.electronjs.org/blog/spectron-deprecation-notice) — official deprecation announcement.
- [Automated Testing | Electron docs](https://www.electronjs.org/docs/latest/tutorial/automated-testing) — current canonical guidance (as of 2026-04).
- [Electron | Playwright docs](https://playwright.dev/docs/api/class-electron) — `_electron` namespace and `launch()` API.
- [ElectronApplication | Playwright docs](https://playwright.dev/docs/api/class-electronapplication) — full surface (`firstWindow`, `evaluate`, `windows`, `close`).
- [State of Playwright Electron support | microsoft/playwright#39477](https://github.com/microsoft/playwright/issues/39477) — Microsoft confirming continued support and stability in 2025-2026.
- [electron-playwright-example | spaceagetv (GitHub)](https://github.com/spaceagetv/electron-playwright-example) — worked starter repo.
- [Testing Electron apps with Playwright and GitHub Actions | Simon Willison's TILs](https://til.simonwillison.net/electron/testing-electron-playwright) — concrete CI recipe with `xvfb-run`.
- [electron-mock-ipc | h3poteto (GitHub)](https://github.com/h3poteto/electron-mock-ipc) — IPC mock for unit tests; verify maintenance status before adopting (last significant updates 2022, as of 2026-04).
- [Electron not running in GitHub Actions Ubuntu | microsoft/playwright#12139](https://github.com/microsoft/playwright/issues/12139) — canonical xvfb troubleshooting thread.
- [GitHub Actions documentation](https://docs.github.com/en/actions) — runner matrix, secrets, caching primitives.
- [Vitest docs](https://vitest.dev/) — modern Vite-native test runner; default unit-test choice for Vite-based renderers.
- [@electron/rebuild | GitHub](https://github.com/electron/rebuild) — rebuild native modules against Electron's Node ABI for testing.

### Unverified

- The exact long-term roadmap for Playwright's `_electron` API leaving experimental status. Microsoft has stated continued support and no breaking changes are planned, but a stable-flag removal date has not been published as of 2026-04.
- `electron-mock-ipc` long-term maintenance — repository activity has been low since 2022; no successor library has emerged as the obvious replacement, so projects continue to use it on inertia rather than active recommendation.
