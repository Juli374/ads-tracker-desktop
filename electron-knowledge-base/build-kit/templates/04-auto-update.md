# Template 4 — Auto-update with `electron-updater` + GitHub Releases

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

- Use **`electron-updater`** (from the electron-builder ecosystem) — multi-platform, single API, far less ceremony than the built-in `autoUpdater` (which requires Squirrel.Mac on macOS and a separate Squirrel.Windows server on Windows). Current stable: **`electron-updater@6.8.3`** (npm, last published Feb 2026 — `(as of 2026-04)`).
- Publish to **GitHub Releases** — `electron-builder` uploads installers + the channel metadata files (`latest.yml` / `latest-mac.yml` / `latest-linux.yml`) automatically.
- App calls `checkForUpdatesAndNotify()` on launch and on a recurring interval (every ~4 h is typical).
- Notify the user, download in the background (default), restart on user accept (`autoUpdater.quitAndInstall()`).
- **Code signing is mandatory for the update to apply** on macOS (Developer ID + notarization) and Windows (cert that matches the installed publisher fingerprint). Linux AppImage works without signing. See [C5 Packaging & signing](../../atlas/core/05-packaging-and-signing.md).

## The template — main process integration

```ts
// main/auto-update.ts
import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

// Pipe updater logs into electron-log (rotating file logs).
// Critical for debugging silent update failures in production.
autoUpdater.logger = log;
log.transports.file.level = 'info';

export function setupAutoUpdate(mainWindow: BrowserWindow) {
  // Defaults; spelled out for clarity.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Optional: pre-release channel (see "Channels" below).
  if (process.env.ELECTRON_CHANNEL === 'beta') {
    autoUpdater.channel = 'beta';
  }

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available', info.version);
    // Tell the renderer so it can show a non-blocking banner.
    // Wire `update:available` through preload — see Template 1.
    mainWindow.webContents.send('update:available', { version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    log.info('No update available');
  });

  autoUpdater.on('download-progress', (p) => {
    mainWindow.webContents.send('update:progress', { percent: p.percent });
  });

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update ready',
        message: `Version ${info.version} is ready. Restart to apply?`,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on('error', (err) => {
    log.error('Updater error', err);
    // Don't crash the app — updater failure is non-fatal.
  });

  // First check after the window is ready, then poll every 4 h.
  autoUpdater.checkForUpdatesAndNotify().catch((err) => log.error(err));
  setInterval(
    () => autoUpdater.checkForUpdates().catch((err) => log.error(err)),
    4 * 60 * 60 * 1000,
  );
}

// In your main entry:
// app.whenReady().then(() => {
//   const win = new BrowserWindow({ /* ... */ });
//   if (app.isPackaged) setupAutoUpdate(win);  // skip in dev
// });
```

Notes:

- **Skip in dev.** `app.isPackaged` is the canonical guard; `electron-updater` will throw "dev app update config not found" otherwise.
- **`checkForUpdatesAndNotify` vs. `checkForUpdates`.** The former shows a native "Update available" notification *automatically*; the latter is silent and lets you drive UI yourself. Pick one — using both double-notifies.
- **`autoInstallOnAppQuit`** means even if the user dismisses the dialog, the update applies on next quit. Usually what you want.

## Renderer-side: showing update UI

```ts
// renderer/use-update.ts
window.api.onUpdateAvailable((version) => {
  // Non-blocking toast/banner: "v1.2.3 available — restart to apply"
});
window.api.onUpdateProgress(({ percent }) => {
  // Update a progress bar for users who want feedback.
});
```

The `window.api.onUpdateAvailable` channel is exposed via `contextBridge` in preload — see [Template 1: Secure preload](01-secure-preload.md). Don't use `ipcRenderer` directly in the renderer; the security model breaks.

## electron-builder publish config

In your `electron-builder.yml` (or the `build` block of `package.json` — see [Template 3](03-electron-builder-config.md)):

```yaml
publish:
  - provider: github
    owner: my-github-org
    repo: my-repo
    releaseType: release   # 'draft' | 'prerelease' | 'release'
    # Optional: 'private: true' if the repo is private (requires GH_TOKEN at runtime)
```

For private repos, the running app needs a token — the usual pattern is to embed a fine-grained, read-only token at build time, or to host updates on a private S3 / Hazel server instead. Public repos need no token at update-check time.

## Release flow

1. **Bump version** in `package.json`. Semver only — `electron-updater` parses `version` and the channel suffix (e.g. `1.2.3-beta.4`).
2. **Set `GH_TOKEN`** in CI (or `GITHUB_RELEASE_TOKEN` if you want a separate publish-only token; both `GH_TOKEN` and `GITHUB_TOKEN` are auto-detected). Use the read-only `GITHUB_TOKEN` for build-time API access and a write-scoped `GITHUB_RELEASE_TOKEN` for publishing — splitting reduces blast radius.
3. **Run** `electron-builder --publish always` (or `--publish onTag` if you only release on tag pushes; `--publish onTagOrDraft` is the third common option).
4. electron-builder uploads installers (`.dmg`, `.exe`, `.AppImage`, `.zip` for Mac auto-update, etc.) **plus** `latest.yml` / `latest-mac.yml` / `latest-linux.yml` channel files to the GitHub Release.
5. Existing users on older versions poll the `latest*.yml` for their platform on next check, see a higher version, and download.

A typical GitHub Actions workflow signs+publishes on tag push — see [electron-builder-action](https://github.com/marketplace/actions/electron-builder-action) for a working YAML.

## Channels

```yaml
# package.json
{
  "version": "1.3.0-beta.2",
  "build": {
    "generateUpdatesFilesForAllChannels": true
  }
}
```

- A version like `1.3.0-beta.2` writes a `beta.yml` channel file alongside `latest.yml`.
- Set `autoUpdater.channel = 'beta'` in code (or via env var as in the template above) to opt that build into the beta channel.
- Users on `latest` only see stable; users on `beta` see beta + stable; users on `alpha` see all three. The cascade is intentional.
- `generateUpdatesFilesForAllChannels: true` ensures every release writes all channel metadata, so a stable build doesn't strand beta users.

## Staged rollouts

Three approaches, in increasing order of control:

1. **Manual `stagingPercentage`** — after publishing, edit `latest.yml` on the GitHub Release and add `stagingPercentage: 10` (then 25, 50, 100 over a few days). `electron-updater` hashes the user's GUID and gates the update by percentile. Simple; no extra infra.
2. **Custom server** — [Hazel](https://github.com/vercel/hazel) (Vercel) or [Nuts](https://github.com/GitbookIO/nuts) (private repos) sit between GitHub Releases and your users; Nuts also handles auth for private update streams. Full control over rollout logic, A/B, kill-switch.
3. **Sentry release health gate** — observe error rate / crash-free sessions on the new version (CS5 Linear and CS1 VS Code both do variants of this); promote `stagingPercentage` only when the gate stays green. See [A6 Telemetry & crash reporting](../../atlas/awareness/06-telemetry.md).

## Signing requirements (the gotcha)

Auto-update will silently fail to *apply* if these aren't right — even if the download succeeds.

- **macOS**: app must be **signed with a Developer ID** AND **notarized**. The update artifact is a `.zip` (not `.dmg`) and must itself be signed; Squirrel.Mac validates the signature before swapping binaries. App Store builds (MAS) cannot self-update — the store handles updates.
- **Windows**: installer must be code-signed; the **publisher fingerprint must match** the installed app, or `autoUpdater` rejects the update. Cert changes mid-product-lifetime are painful (you may need to re-sign with the old cert until users migrate). See `C5` for current Windows signing rules (CA/B Forum HSM mandate, March 2026 validity drop to 15 months).
- **Linux AppImage**: **no signing required**. `electron-updater` uses embedded zsync to download only the changed blocks (delta updates).

`(All current as of 2026-04. Signing rules change quarterly — re-verify against the C5 page before shipping.)`

## Rollback

There is no "demote" in `electron-updater`. To roll back:

1. Identify the bad version (e.g. `1.2.4`).
2. Re-publish the *previous good code* as a *higher* version number (e.g. ship `1.2.5` with `1.2.3`'s code, plus whatever quick fix prompted the rollback).
3. Users on `1.2.4` pick up `1.2.5` on next check.

Don't try to delete the bad GitHub Release — users mid-download will hit 404s and the recovery path is messier than just shipping forward. Document the bad version in the changelog so support knows.

## When to reach for the built-in `autoUpdater` instead

`electron-updater` covers ~95% of cases. Use Electron's built-in `autoUpdater` only if:

- You're already running a Squirrel.Mac / Squirrel.Windows update server you can't move off.
- You need very tight control over the macOS update flow (Squirrel.Mac is what `electron-updater` wraps anyway, so this is rare).

For everything else — especially "I just want updates from GitHub Releases" — `electron-updater` is the answer.

## Cross-links

- [C5 Packaging & signing](../../atlas/core/05-packaging-and-signing.md) — Developer ID, notarization, Windows EV/HSM
- [C7 Auto-update](../../atlas/core/07-auto-update.md) — Core page with the full picture
- [Template 1: Secure preload](01-secure-preload.md) — for the `update:available` IPC bridge
- [Template 3: electron-builder config](03-electron-builder-config.md) — full builder YAML
- [A6 Telemetry & crash reporting](../../atlas/awareness/06-telemetry.md) — for release-health-gated rollouts

## Sources

- [Auto Update | electron-builder docs](https://www.electron.build/auto-update.html) `(as of 2026-04)`
- [Publish | electron-builder docs](https://www.electron.build/publish.html) — `--publish always | onTag | onTagOrDraft | never`, `GH_TOKEN` / `GITHUB_RELEASE_TOKEN` precedence `(as of 2026-04)`
- [Release Using Channels | electron-builder docs](https://www.electron.build/tutorials/release-using-channels.html) — `generateUpdatesFilesForAllChannels`, beta/alpha cascade `(as of 2026-04)`
- [electron-updater | npm](https://www.npmjs.com/package/electron-updater) — current stable `6.8.3` `(as of 2026-04)`
- [Updating Applications | Electron docs](https://www.electronjs.org/docs/latest/tutorial/updates) — built-in `autoUpdater` background, channel metadata format
- [How Staged Rollouts Work | electron-builder issue #3499](https://github.com/electron-userland/electron-builder/issues/3499) — `stagingPercentage` semantics
- [electron-builder-action | GitHub Marketplace](https://github.com/marketplace/actions/electron-builder-action) — reference CI workflow
- [Code Signing | Electron docs](https://www.electronjs.org/docs/latest/tutorial/code-signing) — signing-required-for-update gotcha
