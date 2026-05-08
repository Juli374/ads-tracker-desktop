# C6. Cross-platform porting — per-OS gotchas, MAS sandbox, NSIS/MSIX/AppImage

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

Electron renders a Chromium window — but the OS *around* that window is wildly different. macOS expects an Apple-style menu bar, dock, and "reopen with no windows" pattern; Windows expects an `AppUserModelID`, jump lists, registry-driven file associations, and a per-user-vs-machine install decision; Linux ships through AppImage / .deb / .rpm / Snap / Flatpak, and **as of Electron 38 (Sept 2025) defaults to native Wayland** when launched in a Wayland session. Architecture-wise: macOS ships universal `x64+arm64` binaries via `@electron/universal`, Windows builds separate `arm64` artifacts (`set npm_config_arch=arm64` before `npm install`), and Linux `arm64` is increasingly common on Pi-class and ARM-laptop hardware. The same JS code runs everywhere; the per-OS work is in main-process glue, installer config, and OS integration. Packaging tooling and signing live in [C5](05-packaging-and-signing.md); this page is about *what changes in your app code* per OS.

## When to apply

- Shipping the **same** Electron codebase to macOS *and* Windows *and* Linux (the common case).
- Adding a new OS target to an existing app that started on one platform.
- Hitting a bug that reproduces on one OS only — the universal patterns table below is the first stop.
- Migrating from `BrowserView` (deprecated 30+) or other older APIs that had per-OS quirks.

## When NOT to apply

- Single-OS app (e.g., internal Mac-only tool). Ignore the cross-platform glue and treat the others as YAGNI.
- App is a thin wrapper for a remote site with no native integration — most of this page is overkill; you only need menus + window controls. Lean on [CS3 Notion & Figma](../case-studies/03-notion-figma.md).
- You're choosing the framework and Tauri's per-OS-WebView tax is a problem — see [A1 Tauri vs. Electron](../awareness/01-tauri-vs-electron.md). C6 assumes Electron is already chosen.

---

## Anatomy

### 1. Architecture targets — x64 vs. arm64

| OS | x64 | arm64 | Universal |
|---|---|---|---|
| **macOS** | yes | yes (Apple Silicon, since M1 in 2020) | **`x64+arm64` "universal"** via `@electron/universal` ([Electron docs](https://www.electronjs.org/docs/latest/tutorial/mac-universal-binary)) |
| **Windows** | yes | yes (Windows 11 on ARM, since 2021; reborn with Snapdragon X PCs in 2024) | no — ship **separate `arm64` artifact** alongside `x64` |
| **Linux** | yes | yes (Pi-class boards, ARM laptops, cloud) | no — ship separate artifact per arch |

**macOS — universal binaries.** The `@electron/universal` tool fuses two single-arch app bundles (an `x64` build and an `arm64` build) into one `.app` whose Mach-O binaries contain both slices. Bundle size roughly doubles, but a single distribution covers both Intel-Mac holdouts and the Apple-Silicon majority. The fusing happens *after* both arches are built and *before* signing — see [C5 § macOS](05-packaging-and-signing.md). For background on the `@electron/universal` workflow, see the [Electron docs](https://www.electronjs.org/docs/latest/tutorial/mac-universal-binary) `(as of 2026-04)`.

**Windows — separate ARM64 builds.** Electron has supported Windows on ARM since version 6.0.8 ([Electron docs — Windows on ARM](https://www.electronjs.org/docs/latest/tutorial/windows-arm)). Production setup boils down to setting `npm_config_arch=arm64` before `npm install` so Electron's postinstall pulls the ARM-flavored binary, then packaging as usual:

```sh
# Windows (PowerShell)
$env:npm_config_arch = "arm64"
npm install
npm run package -- --arch=arm64
```

Two gotchas worth flagging at draft time:

- Code that branches on `process.arch` *at install time* will see the host's arch, not the target's — check `npm_config_arch` instead ([Electron docs](https://www.electronjs.org/docs/latest/tutorial/windows-arm)).
- Native modules need ARM64-flavored binaries (or an MSVC v142+ toolchain to rebuild). Generic JS modules just work.

The 2024–2026 Snapdragon X push has made native ARM64 builds worth shipping for any app with Windows users — by 2026 the majority of app categories run natively rather than through emulation. Don't ship an x64-only Electron app to a market where Snapdragon X laptops are a meaningful slice.

**Linux — arm64 increasingly common.** Raspberry Pi 5 (2023+), ARM laptops (Pinebook, Asahi Linux on Apple Silicon, ARM Chromebooks running Linux), and ARM cloud VMs all need arm64 Linux Electron builds. `electron-builder` and Forge both accept `--arch=arm64`; `npm_config_arch=arm64` works the same way as Windows.

### 2. macOS specifics

**Menu bar conventions.** macOS apps live and die by the menu bar — the global menu at the top of the screen, not a per-window menu. Electron uses `Menu.setApplicationMenu` to set it. Conventions:

- **Apple menu** (about / preferences / quit) — `role: 'appMenu'` gives you the platform-default version that *just works* with localized labels and conventional shortcuts.
- **App-specific menu** (File / Edit / View / Window / Help) — convention is *that exact order*.
- **Edit menu** — use `role` properties (`undo`, `redo`, `cut`, `copy`, `paste`, `selectAll`) so macOS wires up the system clipboard / undo stack correctly. Don't reinvent these as custom IPC handlers.
- **Window menu** — `role: 'windowMenu'` for Minimize / Zoom / Bring All To Front.
- **Keyboard shortcuts** — `Cmd` (⌘), not `Ctrl`. Electron's `Accelerator` strings accept `CmdOrCtrl` to abstract the difference.

**Dock integration.** macOS apps integrate with the dock via:

- `app.dock.setBadge('3')` — badge counts (notifications, queued work). Don't abuse for non-counter UI.
- `app.dock.setMenu(menu)` — right-click dock menu. Common: "New Window", "Recent files".
- Recent items / "Open Recent" menu — populate via `app.addRecentDocument(path)`; macOS surfaces this in the dock and the File menu.

**Touch Bar API.** Electron exposes `TouchBar` and `TouchBarButton` etc. for the 2016–2024 MacBook Pro Touch Bar. The hardware was discontinued with the 2024 MacBook Pro refresh, but the API is still present. Treat as legacy — implement only if you have a niche audience.

**Hardened runtime + notarization.** Required for distribution outside the Mac App Store; Apple has tightened Gatekeeper enforcement in Ventura (13) and again in Sequoia (15). Full pipeline lives in [C5 § macOS signing & notarization](05-packaging-and-signing.md) — link, don't duplicate.

**App Sandbox.** *Only* required for Mac App Store builds, where you must ship the `mas`-flavored Electron build, write an `entitlements.mas.plist`, and pass Apple's review. Outside MAS, your app runs unsandboxed (still hardened, still notarized). MAS specifics live in [A3 Store distribution](../awareness/03-store-distribution.md) and [C5 § Mac App Store](05-packaging-and-signing.md).

**Open-with-file from Finder.** When the user double-clicks a file whose UTI is owned by your app, macOS launches the app and emits an `open-file` event on the `app` object. Subscribe *before* `app.whenReady()` because it can fire during launch:

```js
app.on('open-file', (event, path) => {
  event.preventDefault()
  // queue path; flush after window is ready
})
```

This is one of the few APIs where macOS materially differs from Windows (which passes the file path on `argv` at startup) and Linux (`.desktop`-driven, also via `argv`). Electron's deep-links docs cover the full pattern ([Launch app from URL in another app](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app)).

**Auto-launch on login.** `app.setLoginItemSettings({ openAtLogin: true })`. Honored on macOS via the LaunchServices DB. Same API works on Windows. On Linux it's a no-op; you have to write a `.desktop` autostart entry yourself.

**"Reopen with no windows."** Distinctly macOS pattern: clicking the dock icon when all windows are closed should restore one. Electron exposes this as the `activate` event:

```js
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
```

Without this handler, your app will look broken to Mac users who close their last window and click the dock icon expecting it to come back.

### 3. Windows specifics

**Per-user vs. machine-wide install.** Two install models, one decision:

| | Per-user | Machine-wide |
|---|---|---|
| Admin needed? | no | yes |
| Install path | `%LOCALAPPDATA%\Programs\YourApp` | `Program Files\YourApp` |
| Updater can run silently? | yes | needs UAC each time (or signed updater service) |
| Multi-user laptop? | each user reinstalls | shared |
| Best for | consumer apps, dev tools, BYOD | enterprise IT-managed fleets |

NSIS (the default for `electron-builder`) defaults to per-user; toggle `oneClick: false` + `perMachine: true` for the other mode ([electron-builder NSIS](https://www.electron.build/configuration/nsis)). Most Electron apps targeting prosumer / dev audiences pick per-user — Discord, Slack, VS Code-Insider all default this way. Enterprise-IT-distributed apps go machine-wide so an admin can deploy once.

**Jump lists.** Right-clicking your app's taskbar icon shows a "Jump List." Electron exposes this via `app.setJumpList([categories])` — pin recent docs, common actions, custom tasks. Niche-but-nice for productivity apps.

**Taskbar progress + thumbnail toolbars.** `BrowserWindow.setProgressBar(0.5)` shows a progress fill on the taskbar icon — useful for downloads / long renders. `setThumbarButtons` adds buttons to the window's taskbar thumbnail (play/pause for media apps).

**Notifications + AppUserModelID.** Critical Windows footgun: native notifications won't show in Action Center / Notifications Settings unless you set `app.setAppUserModelId('com.yourcompany.yourapp')`. Without it, Windows treats every notification as ephemeral and groups your app under "electron.exe" instead of your branded name. Set it once during `app.whenReady()`. The string should match what your installer registers in the Start Menu shortcut.

**File associations + protocol handlers.** Windows is **registry-driven**. To own `.myext` or `myapp://` URLs, the *installer* writes registry keys at install time (HKCU for per-user, HKLM for machine-wide) — *not* the app at runtime. Both NSIS (electron-builder) and Squirrel.Windows (Forge default) handle this via config. Runtime APIs like `app.setAsDefaultProtocolClient('myapp')` *do* exist, but they only work in development; in production the registry must already contain the entry, which means the *installer* must do it. For deep-link plumbing details (single-instance lock, second-instance event, packaged-only on macOS) see [C4 Native integrations](04-native-integrations.md#deep-links).

**Squirrel.Windows.** Status (as of 2026-04): deprecated *in electron-builder*, but **still the default Windows maker in Electron Forge**, and the upstream `Squirrel/Squirrel.Windows` repo is unarchived and receiving commits. Forge uses it; Builder uses NSIS. Don't conflate "deprecated in Builder" with "dead" — full discussion is in [C5 § Forge vs. Builder Windows makers](05-packaging-and-signing.md).

**Windows Defender SmartScreen reputation.** New / unsigned binaries trigger the "Windows protected your PC" dialog until enough installs build reputation. EV signing previously bypassed this immediately; that *instant-trust* shortcut was removed in March 2024 and EV now just builds reputation faster than OV. Full signing strategy lives in [C5 § Windows code signing](05-packaging-and-signing.md).

**MSIX / Microsoft Store.** MSIX is the modern packaging format — sandboxed, auto-updating via the Store, no signing certificate needed when distributed through the Store. As of 2026-04: **Forge has experimental MSIX maker support** (`@electron-forge/maker-msix`, added in Forge 7.10, [docs](https://www.electronforge.io/config/makers/msix)); **electron-builder ships AppX** (the MSIX precursor; long-standing [issue #5021](https://github.com/electron-userland/electron-builder/issues/5021) tracks the MSIX upgrade); Microsoft also publishes [first-party guidance for packaging Electron as MSIX](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/guides/electron-packaging) and the `electron-windows-msix` community package fills gaps. If you want Microsoft Store distribution, MSIX is the path — see [A3 Store distribution](../awareness/03-store-distribution.md).

### 4. Linux specifics

**Wayland default since Electron 38.** This is the single biggest 2025 cross-platform change. **Electron 38 (released 2025-09-09) made Wayland the default when launched in a Wayland session on Linux** — the underlying `--ozone-platform-hint` flag now defaults to `auto`, picking Wayland in a Wayland session and X11 in an Xorg session ([Electron 38.0.0 release blog](https://www.electronjs.org/blog/electron-38-0); see also [Tech Talk — How Electron went Wayland-native](https://www.electronjs.org/blog/tech-talk-wayland), 2026-03-17). The `ELECTRON_OZONE_PLATFORM_HINT` env var was removed in Electron 38 (it's a no-op there) and is fully gone in **Electron 39** ([electron/electron#48001](https://github.com/electron/electron/issues/48001)). Backward compatibility: Electron ≤ 37 still respects the variable.

What this means for you in practice (`as of 2026-04`):

- New apps on Electron 38+ get native Wayland rendering on GNOME, KDE, Sway, Hyprland, etc. with no opt-in. Better HiDPI, fractional scaling, gesture support — all the things X11 didn't do well.
- If you need to *force* X11 (regression, native module incompatibility, screen-share APIs that haven't migrated yet): launch with `--ozone-platform=x11` ([Electron 38.0.0](https://www.electronjs.org/blog/electron-38-0)). Users can also export `XDG_SESSION_TYPE=wayland` to push the auto-detection toward Wayland.
- Old docs / Stack Overflow answers recommending `ELECTRON_OZONE_PLATFORM_HINT=wayland` — strip them. The variable does nothing in 38, doesn't exist in 39.
- Screen capture (`desktopCapturer`) on Wayland goes through xdg-desktop-portal; expect a permission prompt where X11 had none. Verify your screen-share / screenshot UI on Wayland before declaring it done.

**Desktop entry (`.desktop` file).** The Linux equivalent of an installer manifest. Lives in `/usr/share/applications/myapp.desktop` (system-wide) or `~/.local/share/applications/myapp.desktop` (per-user). Minimum fields:

```ini
[Desktop Entry]
Name=My App
Exec=/opt/MyApp/myapp %U
Icon=myapp
Type=Application
Categories=Utility;
MimeType=application/x-myapp;x-scheme-handler/myapp;
StartupWMClass=MyApp
```

`MimeType` lines drive file associations and protocol handlers; `StartupWMClass` matches the X11/Wayland window class so the launcher and the running window get grouped. `electron-builder` generates this for `.deb` / `.rpm` / `AppImage` automatically — but the *defaults aren't always right*. Set `linux.desktop` in your config when the app needs custom MIME types or categories.

**Icon hicolor theme.** Linux icons go in `/usr/share/icons/hicolor/<size>/apps/myapp.png` for sizes 16, 32, 48, 64, 128, 256, 512. `electron-builder` handles this if you point `linux.icon` at a directory of correctly-sized PNGs. Skipping the hicolor structure means GNOME / KDE fall back to a generic icon — looks unprofessional.

**Distribution formats.** Linux is the format zoo. Trade-offs (full packaging-tool comparison lives in [C5 § Linux formats](05-packaging-and-signing.md)):

| Format | Sandbox | Update model | Distribution friction |
|---|---|---|---|
| **AppImage** | none | self-update or external (no central repo) | one file, runs anywhere with a recent glibc — easiest |
| **`.deb` / `.rpm`** | none | apt/dnf; you must host or push to a repo | medium; system integration is best |
| **Snap** | yes (strict by default) | Snapcraft store, auto-update | easy distribution but mandatory sandboxing breaks some patterns; Ubuntu-led |
| **Flatpak** | yes (portals for permissions) | Flathub, auto-update | growing on non-Ubuntu distros; sandbox profile work needed |

**Native dependencies.** Most modern Electron apps just work — Chromium / V8 / Node are statically bundled. The native libs you might pull in: `libnotify` (notifications), `libgtk` (file dialogs, system theme), `libnss` (cert store). On `.deb` / `.rpm` / Snap, mark them as dependencies and let the package manager resolve. On AppImage, you either bundle them into the AppImage or hope the host system has them — modern AppImages bundle most of Chromium's prerequisites.

**Tray icons on GNOME.** GNOME Shell removed legacy tray icons in 2017 and as of 2026 still does not show `Tray` icons out of the box — users need an extension. Most Linux distros built on GNOME Shell ship one bundled (Ubuntu includes the [AppIndicator extension](https://extensions.gnome.org/extension/615/appindicator-support/) by default), but vanilla GNOME on Fedora/Arch needs the user to install it. Fall back to a graceful "no tray" mode if `Tray` creation throws or the icon is invisible. The official [Status Icons extension](https://www.omgubuntu.co.uk/2024/08/gnome-official-status-icons-extension) (since GNOME 47, 2024) is now an official-but-not-default option `(as of 2026-04)`. KDE, XFCE, Cinnamon — tray icons just work.

**X11 fallback when Wayland not available.** Headless CI, older distros, restricted environments. Electron's `--ozone-platform=auto` (Electron 38+ default) picks X11 automatically when no Wayland display is present, so you generally don't need to do anything — but tests running under `Xvfb` may need an explicit `--ozone-platform=x11` to skip the autodetect.

### 5. Universal patterns — `process.platform`, paths, dialogs, window controls

The `process.platform` switch is the bread and butter of cross-platform Electron. Three values matter: `'darwin'` (macOS), `'win32'` (Windows — yes, even on 64-bit), `'linux'`. Use it sparingly — most APIs abstract the difference for you.

**Where to put files.** Always go through `app.getPath()`:

| Purpose | `app.getPath('...')` | Resolves to (typical) |
|---|---|---|
| User app data | `'userData'` | `~/Library/Application Support/<App>` (mac), `%APPDATA%\<App>` (win), `~/.config/<App>` (linux) |
| Temp files | `'temp'` | OS temp dir |
| Logs | `'logs'` | inside `userData/logs` (mac/linux), `%APPDATA%\<App>\logs` (win) |
| Downloads | `'downloads'` | OS Downloads folder |
| Home | `'home'` | `~` |

Hardcoding paths breaks on the next OS. Hardcoding even *relative* paths from `process.cwd()` breaks because cwd is "wherever the user launched from," which is rarely your install dir.

**Window controls.** On macOS the window has the traffic-light buttons (close / minimize / zoom) on the *left*, drawn by the OS. On Windows and Linux, controls are on the *right*, drawn by the OS or by your app if you go frameless. Patterns:

- Default (`frame: true`) — OS draws controls; on macOS they're left, on Windows/Linux right. Easiest path.
- `titleBarStyle: 'hiddenInset'` (macOS only) — keeps traffic lights but hides the title bar text, lets you draw a custom title bar with traffic-light gap.
- `frame: false` + custom title bar — full control, you must implement minimize / maximize / close yourself, including the close-on-macOS-vs-quit semantics. VS Code, Slack, 1Password all do this.
- `titleBarOverlay` — newer (Electron 24+) overlay API that lets you keep OS controls and just *paint into* the rest of the title bar. Simpler than fully frameless.

**Native dialogs.** `dialog.showOpenDialog`, `dialog.showSaveDialog`, `dialog.showMessageBox` all delegate to the OS — file pickers look like Finder on mac, Explorer on Windows, GTK file picker on Linux/Wayland. *Do not roll your own.* The native pickers integrate with the OS sandbox and accessibility tooling in ways an HTML modal can't.

**Shortcuts.** `CmdOrCtrl` accelerator keyword maps to `Cmd` on mac, `Ctrl` elsewhere. Don't hardcode `'Ctrl+S'` if you mean "save."

### 6. Testing across platforms

Cross-platform Electron is *the* place where "works on my machine" goes wrong. Strategy:

- **CI matrix** — GitHub Actions has macOS (`macos-14` for Apple Silicon, `macos-13` for Intel), Windows (`windows-2022`), and Linux (`ubuntu-22.04` / `ubuntu-24.04`) runners. Run your build + smoke tests on all three on every PR.
- **VMs locally** — Parallels / UTM / VirtualBox cover the gaps. ARM Windows VMs on Apple Silicon are now usable.
- **Wayland in CI** — Linux runners default to no display. Use `xvfb-run` for X11 or run a headless Wayland compositor (e.g., `cage`, `weston --backend=headless-backend`) for Wayland-specific paths. Most CI smoke tests are fine on Xvfb; only do Wayland-in-CI if you've found a Wayland-specific bug.
- Full testing patterns — Playwright `_electron`, mocking IPC, headless on Linux — live in [A5 Testing](../awareness/05-testing.md).

---

## Mini-example

Cross-platform main-process glue: per-OS menu, AUMID for Windows notifications, Wayland-aware logging, and the macOS reopen pattern.

```js
// main.js
const { app, BrowserWindow, Menu } = require('electron')

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'

// Windows: AUMID must be set before any notification fires.
if (isWin) {
  app.setAppUserModelId('com.yourcompany.yourapp')
}

let mainWindow

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    // macOS: keep traffic lights, hide title bar text, draw our own header.
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  })
  mainWindow.loadFile('index.html')
}

function buildMenu () {
  const template = []

  if (isMac) {
    // Apple menu (about / preferences / quit) with platform defaults.
    template.push({ role: 'appMenu' })
  }

  template.push(
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },     // Cut / Copy / Paste / Select All wired to the OS.
    { role: 'viewMenu' },
    { role: 'windowMenu' }    // macOS Window menu; harmless on Win/Linux.
  )

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  createWindow()
  buildMenu()

  // macOS-only: re-open a window when the dock icon is clicked with no windows.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// macOS quits via Cmd-Q; everywhere else closing the last window quits.
app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

// macOS: handle "Open With > YourApp" from Finder.
app.on('open-file', (event, path) => {
  event.preventDefault()
  // Queue path; flush after window is ready.
})

// Linux: log Wayland vs. X11 detection for support tickets.
// As of Electron 38, the platform is auto-detected.
if (process.platform === 'linux') {
  console.log('Session type:', process.env.XDG_SESSION_TYPE || 'unknown')
}
```

About 50 lines covering the four most common cross-platform footguns: menu bar conventions, AUMID, the "reopen" pattern, and `open-file`. Add jump lists, dock badges, and tray as your app needs them.

---

## Cross-links

- [C1 Fundamentals](01-fundamentals.md) — three-process model, lifecycle events used here (`activate`, `open-file`, `window-all-closed`).
- [C4 Native integrations](04-native-integrations.md) — deep links, `setAsDefaultProtocolClient`, file-association plumbing.
- [C5 Packaging & signing](05-packaging-and-signing.md) — installers (NSIS / Squirrel / DMG / AppImage / Snap / Flatpak), notarization, Windows EV/HSM, universal-binary fusing.
- [C7 Auto-update](07-auto-update.md) — per-OS update mechanics (Squirrel.Mac vs. Squirrel.Windows vs. AppImage updater).
- [A3 Store distribution](../awareness/03-store-distribution.md) — Mac App Store sandbox / entitlements; Microsoft Store / MSIX flow.
- [A5 Testing](../awareness/05-testing.md) — CI matrix runners, Playwright `_electron`, headless Linux.
- [CS1 VS Code](../case-studies/01-vscode.md) — frameless title-bar pattern, multi-platform release engineering.

---

## Sources

- [Electron 38.0.0 release blog](https://www.electronjs.org/blog/electron-38-0) — Wayland default; `--ozone-platform-hint=auto`; `ELECTRON_OZONE_PLATFORM_HINT` removed; macOS 11 dropped (2025-09-09)
- [Tech Talk — How Electron went Wayland-native | Electron blog](https://www.electronjs.org/blog/tech-talk-wayland) — context for the Wayland-native switch (2026-03-17)
- [Deprecate & remove ELECTRON_OZONE_PLATFORM_HINT env var | electron/electron#48001](https://github.com/electron/electron/issues/48001) — full deprecation timeline; removal in Electron 39
- [Universal macOS binaries | Electron docs](https://www.electronjs.org/docs/latest/tutorial/mac-universal-binary) — `@electron/universal` workflow `(as of 2026-04)`
- [Windows on ARM | Electron docs](https://www.electronjs.org/docs/latest/tutorial/windows-arm) — `npm_config_arch=arm64`, native module rebuild guidance
- [Mac App Store Submission Guide | Electron docs](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide) — `mas` Electron build, App Sandbox entitlements
- [Snap | Electron docs](https://www.electronjs.org/docs/latest/tutorial/snap) — Snap packaging guidance
- [NSIS targets | electron-builder](https://www.electron.build/configuration/nsis) — per-user vs. per-machine, file associations, protocol handlers
- [Linux distribution targets | electron-builder](https://www.electron.build/configuration/linux) — `.deb` / `.rpm` / AppImage / Snap config; `linux.desktop` and `linux.icon` keys
- [MSIX maker | Electron Forge docs](https://www.electronforge.io/config/makers/msix) — Forge's MSIX maker (experimental, added in Forge 7.10) `(as of 2026-04)`
- [Packaging Electron apps as MSIX | Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/guides/electron-packaging) — Microsoft's first-party Electron→MSIX guide (last updated 2026-03-05)
- [Move appx packaging support up to msix | electron-builder#5021](https://github.com/electron-userland/electron-builder/issues/5021) — long-standing tracking issue for builder's MSIX upgrade
- [AppIndicator and KStatusNotifierItem Support | GNOME Shell Extensions](https://extensions.gnome.org/extension/615/appindicator-support/) — the extension Ubuntu ships by default to make tray icons visible on GNOME
- [GNOME Now Has an Official Extension for Legacy Tray Icons | OMG! Ubuntu (2024-08)](https://www.omgubuntu.co.uk/2024/08/gnome-official-status-icons-extension) — official-but-not-default Status Icons extension (GNOME 47+)
- [Launch app from URL in another app | Electron docs](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app) — `open-file` event, `setAsDefaultProtocolClient`, single-instance lock
