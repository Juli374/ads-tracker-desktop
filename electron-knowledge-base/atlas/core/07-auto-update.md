# C7. Auto-update — electron-updater, Squirrel, channels, staged rollouts

> Status: 🟨 draft v1 🔁 living
> Last updated: 2026-04-30

## TL;DR

Auto-update is **non-negotiable** for any Electron app shipped to end users. Electron itself releases major versions every ~8 weeks ([Electron release timeline](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)) and Chromium-derived CVEs land continuously — without an update path your fleet ages into vulnerability within months. Two ecosystems dominate (as of 2026-04): the built-in **`autoUpdater`** module (Squirrel.Mac on macOS, Squirrel.Windows on Windows; needs your own update server like Hazel or Nuts), and **`electron-updater`** from the electron-builder family (`v6.8.x`, last published Feb 2026 per [npm](https://www.npmjs.com/package/electron-updater)) which adds Linux support, GitHub Releases / S3 / generic HTTPS backends, differential updates on Windows/Linux, channels, and staged rollouts. For most teams the answer is *electron-updater + GitHub Releases + signed binaries*; build that first, keep the bigger toolbox in mind.

## When to apply

- Your app ships to user machines and you cannot rely on a store (Mac App Store / Microsoft Store) to push updates.
- You need fast security-patch turnaround (a Chromium CVE drops; you want the fleet patched within days, not next quarter).
- You want channels (stable / beta / alpha) so power users dogfood before the masses see breakage.
- You want to roll a build out to 5 % first, watch crash telemetry ([A6 Telemetry](../awareness/06-telemetry.md)), then ramp.

## When NOT to apply

- **Mac App Store** distribution — MAS handles updates; the in-process `autoUpdater` is forbidden in sandboxed MAS builds. See [A3 Store distribution](../awareness/03-store-distribution.md).
- **Microsoft Store / MSIX** — the store ships the update; do not bundle your own.
- **Linux distro repositories** (Snap Store, Flatpak's Flathub, your own apt/yum repo) — update plumbing is the package-manager's job; do not ship a second updater that fights it.
- **Enterprise managed deployment** (MDM, Group Policy MSI rollout) — ops teams want to control rollout themselves; an in-app updater they cannot disable is a deal-breaker. Provide an `autoUpdater.disable()` toggle or build a no-update flavour.

## Anatomy

### Why auto-update is non-negotiable

Electron 1.0 shipped in May 2016 with Chromium 49; Electron 41 (April 2026) ships Chromium 146, V8 14.6, Node 24 (see [C1 Fundamentals](01-fundamentals.md) for the canonical Electron 41 → Chromium / V8 / Node version pin). The release train is roughly **a major every 8 weeks**, and security backports cover only **the latest three majors** ([Electron Releases | Electron docs](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)). Combined with the steady stream of Chromium CVEs (the V8 sandbox alone has had multiple high-severity advisories in the past year — see [C3 Security](03-security.md)), an Electron app with no update mechanism is, after ~6 months, running an unsupported, vulnerable browser. There is no "I'll just freeze on a known-good version" — *known-good* expires.

A second pressure: your own bug fixes. Without auto-update, every bug report is conditional ("did the user reinstall the latest .dmg?"). You spend support cycles chasing tail. Even if you publish on GitHub Releases manually, asking users to download a new installer has a known drop-off — VS Code's team has noted that auto-updated users run a much narrower version distribution than manual-update populations (see [CS1 VS Code](../case-studies/01-vscode.md)).

### Three approaches

**1. `electron-updater`** (from the electron-builder ecosystem). Most popular in 2026. Cross-platform unified API: same `autoUpdater.checkForUpdatesAndNotify()` works on Win/Mac/Linux. Backends: GitHub Releases, Amazon S3, DigitalOcean Spaces, Keygen, generic HTTP(S) ([Auto Update | electron-builder](https://www.electron.build/auto-update.html), as of 2026-04). Differential updates on Windows (NSIS) and Linux (AppImage); macOS still does full ZIP downloads. Channels (`channel: 'beta'`) and staged rollouts (`stagingPercentage`) are first-class.

**2. Built-in `autoUpdater` module** ([Electron API docs](https://www.electronjs.org/docs/latest/api/auto-updater)). Wraps Squirrel.Mac on macOS and Squirrel.Windows on Windows. **No Linux support** — that's the headline gap. You bring your own update server: **Hazel** ([vercel/hazel](https://github.com/vercel/hazel), a "lightweight update server for Electron apps" that proxies GitHub Releases via Vercel Serverless Functions; receives commits, repo active as of 2026-04), **Nuts** ([GitbookIO/nuts](https://github.com/GitbookIO/nuts), Heroku-deployable, supports private GitHub repos, has open issues from late 2025 — still receiving attention as of 2026-04 but development is slow), [electron-release-server](https://github.com/ArekSredzki/electron-release-server), or roll your own. Use this path when you want **no electron-builder dependency** (e.g., you already use Forge with Squirrel.Windows / Squirrel.Mac makers and don't want a second packager) or when you need a self-hosted server for compliance reasons.

**3. Custom**: download a fresh build, replace the binary, restart. Rare in 2026 — the only common driver is enterprise environments where you must integrate with an internal release-management system. If you are tempted to write this from scratch, first read [iffy/electron-updater-example](https://github.com/iffy/electron-updater-example) end-to-end; the gotchas (atomic file replace on Windows, code-sign verification, relaunch ordering on macOS) are nontrivial and Squirrel solves most of them.

**Recommendation (as of 2026-04):** start with `electron-updater` + GitHub Releases. Switch only when you outgrow it — typically because you need a private update server (Nuts), CDN-backed delivery for many users (S3 / Cloudflare R2 + generic provider), or because your packaging story already centres on Forge + Squirrel.Windows and you want to keep the surface area small.

### Per-OS update mechanics

#### macOS — Squirrel.Mac

The built-in `autoUpdater` (and `electron-updater` underneath) talks to **Squirrel.Mac** ([electron/electron Squirrel.Mac fork](https://github.com/electron/electron/tree/main/spec/fixtures/auto-updater)). Format: a code-signed ZIP containing the `.app` bundle. The updater downloads the ZIP into a sandboxed cache, verifies the signature, and applies the swap **at app relaunch** — not while the app is running. UX implication: show "Update ready, restart now" rather than "updating in the background, please wait."

**Code signing is mandatory for Squirrel.Mac to apply the update.** An unsigned (or improperly signed) update fails Gatekeeper validation and is silently rejected. Notarisation is also required for distribution outside MAS post-Big-Sur ([Apple Developer — Notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)). See [C5 Packaging & signing](05-packaging-and-signing.md) for the cert-chain mechanics.

Squirrel.Mac does **not** support delta downloads at the binary level — every update is a full app ZIP. macOS users on bandwidth-constrained connections feel this; mitigate with smaller bundle sizes (asar, native-module trim) rather than expecting deltas.

#### Windows — Squirrel.Windows or NSIS

Two paths:

- **Squirrel.Windows** ([upstream repo](https://github.com/Squirrel/Squirrel.Windows)). Single-file `.nupkg` updates with delta support via `bsdiff`. *Status as of 2026-04*: the upstream repo is unarchived and receives commits (issues opened in March 2026, October/September/August/April 2025 etc.), but Linux Foundation Insights flags activity as "critically low" with one active contributor. **Deprecated in electron-builder** (NSIS is the default there), but **still the default Windows maker in Electron Forge**. If you use Forge out-of-the-box, this is what you get. Cross-link: [C5 Packaging & signing](05-packaging-and-signing.md).
- **NSIS-based updates** (electron-builder's default). The installer self-replaces; differential updates are computed against a `blockmap` file that ships next to each release. For multi-hundred-MB apps this is a major bandwidth saver — typically 10-30 % of full-download size for incremental releases ([electron-builder Auto Update](https://www.electron.build/auto-update.html)).

Both paths require the binary to be **code-signed** and to **chain to a CA trusted by Windows**. The CA/B Forum HSM mandate (June 2023) and the EV instant-SmartScreen-trust changes (March 2024) mean self-signed and software-only OV certs are no longer practical for distribution — see [C5](05-packaging-and-signing.md). An unsigned update will SmartScreen-block on user machines and the in-place update will fail.

Per-user vs. per-machine installs: NSIS supports both via `oneClick` and `perMachine` flags. Per-user installs do not need admin to update (modern default); per-machine installs trigger UAC every update. **Default to per-user** unless your IT customer demands per-machine.

#### Linux — AppImage, Snap, Flatpak, .deb/.rpm

- **AppImage**: `electron-updater` supports AppImage out of the box (`AppImageUpdater` under the hood, leveraging zsync delta downloads). The binary self-replaces in place. This is the only Linux format with a *first-party* in-app updater path.
- **Snap**: store-driven. The Snap daemon refreshes packages automatically; do not ship `electron-updater` in a Snap build. ([Snap | Electron docs](https://www.electronjs.org/docs/latest/tutorial/snap)).
- **Flatpak**: same — Flathub or your own remote handles updates.
- **.deb / .rpm**: typically no auto-update. If you publish to a maintained apt/yum repo, your users will get updates via `apt`/`dnf`. Otherwise, ship a notification ("a new version is available, please reinstall") and stop there. Don't try to self-replace a system-installed package; you will fight the package manager and lose.

### Update servers

- **GitHub Releases** ([Publish | electron-builder](https://www.electron.build/publish.html), as of 2026-04). Easiest path. `electron-updater` natively supports `provider: github`. Tag a release, upload the `.dmg` / `.exe` / `.AppImage` plus the `latest.yml` / `latest-mac.yml` / `latest-linux.yml` metadata files, and your installed apps poll the GitHub API for new versions. Works for public repos free; private repos require a token baked into the app — handle this carefully (use a fine-grained PAT scoped to release-read; never embed admin tokens). Rate limits are a real consideration at scale — at >5K active users, you will brush GitHub's anonymous rate limit and want to front it with a CDN.
- **Generic HTTPS** — host `latest.yml` and the binaries on S3, Cloudflare R2, or your own server. `electron-updater` polls the URL and parses `latest.yml` for `version`, `path`, `sha512`. The cheapest scaling path: build artefacts to S3, fronted by CloudFront / R2 — flat-file hosting, no application logic.
- **Hazel** ([vercel/hazel](https://github.com/vercel/hazel)). A thin Vercel Functions wrapper that proxies GitHub Releases (so the GitHub repo stays the source of truth, but your Hazel URL handles caching, private-token concealment, and a friendly download page). Status as of 2026-04: repo active, recent commits, used in production at multiple companies. Good middle ground if GitHub Releases works *but* you want a vanity URL and don't want to embed a GitHub token.
- **Nuts** ([GitbookIO/nuts](https://github.com/GitbookIO/nuts)). Heroku-deployable, supports private GitHub repos, caches assets to disk. Activity as of 2026-04: open issues from late 2025, slow but not dead. Pick over Hazel when you need disk-cached assets (large bundles, cold-Vercel-function latency is a problem) or when you want an admin UI.
- **Custom** — for compliance / air-gapped environments. Implement the `latest.yml` schema and serve over HTTPS; `electron-updater`'s `generic` provider is just an HTTP fetch.

### Signing requirements (recap)

- **macOS**: Developer ID-signed, hardened-runtime, **notarized**. The notarization stapling is what survives the Gatekeeper check on first launch — and a Squirrel.Mac in-place update *does* go through Gatekeeper. Updates without notarisation fail post-Big-Sur ([Apple Developer — Notarizing](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)).
- **Windows**: code-signed; the installer must verify against a CA trusted by Windows. After CA/B Forum's June 2023 HSM mandate, that means a hardware-token cert (Yubikey, eToken) or a cloud-signing service (Azure Trusted Signing, DigiCert KeyLocker, SSL.com eSigner). See [C5](05-packaging-and-signing.md). An unsigned update is rejected by Squirrel.Windows / NSIS.
- **Linux**: AppImage signing is optional but recommended (the user has no SmartScreen / Gatekeeper to fall back on; integrity is on you).

### Channels

`electron-updater` supports semver pre-release channels via the `channel` option ([electron-builder Auto Update](https://www.electron.build/auto-update.html)). Tag a build `1.4.0-beta.3` and add `generateUpdatesFilesForAllChannels: true` to your `electron-builder.yml` `build` block — this writes separate `beta.yml` / `alpha.yml` / `latest.yml` metadata files. In your renderer / preferences UI, let users opt into "Beta channel"; on app start, set `autoUpdater.channel = 'beta'` before calling `checkForUpdates()`. The updater then polls the `beta.yml` file and offers pre-release builds.

Two patterns:

- **Insiders / dogfood**: a small group of users on `beta` who see every build. VS Code does this with Stable / Insiders / Exploration channels (CS1).
- **Opt-in beta**: power users opt in via Settings, get pre-release versions a week before stable. Use this to surface bugs before stable rollout.

### Staged rollouts

Do not ship 100 % of users straight to a fresh build. Mistakes happen — one bad migration, one regressed perf path, and the support queue explodes. Stage:

- **Manual `stagingPercentage`** ([electron-builder issue #3499](https://github.com/electron-userland/electron-builder/issues/3499)). After publishing, edit the `latest.yml` to add `stagingPercentage: 10`. `electron-updater` hashes the user's UUID against this percentage and ships the update only to the matching subset. Bump to 50, then 100, watching crash telemetry ([A6](../awareness/06-telemetry.md)) between steps. Scriptable but not automated — you need to actually edit the YAML.
- **Custom server logic**. If you run Hazel / Nuts / your own server, gate `latest.yml` responses by user cohort: hash the user-agent or a stable client ID, return "no update" to 90 % and the real metadata to 10 %. This is more flexible than `stagingPercentage` (you can stage by region, OS, prior version) but you write the cohort logic.
- **Sentry / Bugsnag releases** — these track *which* release a crash came from, but they do not gate updates. Use them as the *signal* for whether to ramp; do not expect them to pause a rollout.

Cadence rule of thumb: 5 % → 25 % → 100 %, with a minimum 24-hour wait between steps and an automatic abort if crash-free-session rate drops by >0.5 % vs. the prior version.

### Rollback strategy

`electron-updater` does **not** downgrade by default — semver compares numerically and `2.0.4` is "newer" than `2.0.3`. To roll back:

1. Tag and ship a new build with a **higher** version number containing the previous code (e.g., revert the merge, bump from `2.0.4` to `2.0.5`).
2. Users who had auto-updated to the bad `2.0.4` get the rolled-back `2.0.5` on next check.
3. Users still on `2.0.3` skip `2.0.4` entirely.

Do not delete the bad `2.0.4` from GitHub Releases — that breaks anyone in the middle of downloading. Just publish forward.

If the bug is severe (data corruption, crash on launch), you may need an emergency `latest.yml` edit to point at the prior version's binary while you cut a fix; users on the bad version will then "update" to the older binary. This is fragile — use the forward-rollback unless you cannot launch the app at all.

### Differential / delta updates

- **Windows (NSIS)**: blockmap-based deltas, typically 10-30 % of full-installer size. Enabled by default in electron-builder. Configure `differentialPackage: true` on the NSIS target.
- **Linux (AppImage)**: zsync-based deltas. Enabled by default.
- **macOS**: full ZIP only. No Squirrel.Mac delta support as of 2026-04. The mitigation is small bundles, not deltas.

For a 200 MB app, a delta on Windows is often <30 MB; users on metered connections notice.

### Code signing on updates (the recurring trap)

Apple's notarisation is required for the **update** itself to apply on macOS — not just for the initial install. New Electron developers often sign + notarise the installer they shipped to TestFlight or beta testers, then publish unnotarised binaries to GitHub Releases for "easier iteration." The result: Squirrel.Mac downloads the update, validates against Gatekeeper, *fails*, and the app silently stays on the old version. You won't see this in your test environment if your dev build is already notarised; you will hear it from users who report "I never see updates" months later.

Always notarise. Always test the update path end-to-end on a fresh machine that has never seen your dev cert. See the [C5 signing checklist](05-packaging-and-signing.md) for the full chain.

## Mini-example

`electron-updater` + GitHub Releases, ~30 lines in main process:

```ts
// src/main/auto-update.ts
import { app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

export function initAutoUpdate() {
  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // Optional: opt into beta channel from user setting
  // autoUpdater.channel = userPrefs.get('updateChannel') ?? 'latest'

  autoUpdater.on('update-available', (info) => {
    log.info(`Update available: ${info.version}`)
  })

  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      message: `Version ${info.version} is ready.`,
      detail: 'Restart to apply the update.',
    })
    if (response === 0) autoUpdater.quitAndInstall()
  })

  autoUpdater.on('error', (err) => log.error('Update error:', err))

  app.whenReady().then(() => {
    autoUpdater.checkForUpdatesAndNotify()
    setInterval(() => autoUpdater.checkForUpdates(), 60 * 60 * 1000)
  })
}
```

Companion `electron-builder.yml` snippet:

```yaml
publish:
  provider: github
  owner: your-org
  repo: your-app
generateUpdatesFilesForAllChannels: true
nsis:
  differentialPackage: true
```

CI (GitHub Actions): on `git tag v*` push, run `electron-builder --publish always` with `GH_TOKEN` set; the action uploads installers + `latest.yml` to a draft Release. Promote draft → published when ready. Full template: [build-kit/templates/04-auto-update.md](../../build-kit/templates/04-auto-update.md).

## Cross-links

- [C5 Packaging & signing](05-packaging-and-signing.md) — code signing and notarization are prerequisites for updates to apply (macOS Gatekeeper, Windows SmartScreen).
- [C3 Security](03-security.md) — the *reason* auto-update is non-negotiable: Chromium CVE flow + 8-week major cadence.
- [C6 Cross-platform porting](06-cross-platform-porting.md) — Snap / Flatpak / NSIS / Squirrel.Windows mechanics overlap with C7 packaging-time decisions.
- [A3 Store distribution](../awareness/03-store-distribution.md) — when you do *not* ship your own updater (MAS, Microsoft Store).
- [A6 Telemetry](../awareness/06-telemetry.md) — Sentry / GlitchTip releases as the staged-rollout signal.
- [Build-kit Template 4: Auto-update](../../build-kit/templates/04-auto-update.md) — production-ready scaffold with CI workflow.
- [CS1 VS Code](../case-studies/01-vscode.md) — Stable / Insiders / Exploration channel architecture in practice.

## Sources

- [Updating Applications | Electron docs](https://www.electronjs.org/docs/latest/tutorial/updates) — official overview, when to use built-in vs. third-party (as of 2026-04)
- [autoUpdater | Electron API](https://www.electronjs.org/docs/latest/api/auto-updater) — built-in module, Squirrel-based, no Linux support (as of 2026-04)
- [Auto Update | electron-builder](https://www.electron.build/auto-update.html) — `electron-updater` reference, channels, `stagingPercentage`, differential packages (as of 2026-04)
- [electron-updater | npm](https://www.npmjs.com/package/electron-updater) — current version 6.8.x, last published Feb 2026 (as of 2026-04)
- [Publish | electron-builder](https://www.electron.build/publish.html) — provider list (GitHub, S3, generic, etc.) and CI integration (as of 2026-04)
- [Hazel | vercel/hazel](https://github.com/vercel/hazel) — Vercel-hosted update server, repo active (as of 2026-04)
- [Nuts | GitbookIO/nuts](https://github.com/GitbookIO/nuts) — Heroku update server with private-repo support, slow but not dead (as of 2026-04)
- [Squirrel.Windows | upstream repo](https://github.com/Squirrel/Squirrel.Windows) — unarchived, low activity, still Forge's default Windows maker (as of 2026-04)
- [iffy/electron-updater-example](https://github.com/iffy/electron-updater-example) — end-to-end working example (as of 2026-04)
- [Apple Developer — Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) — required for both initial install and Squirrel.Mac in-place updates (as of 2026-04)
- [electron-builder issue #3499 — How does Staged rollouts work](https://github.com/electron-userland/electron-builder/issues/3499) — `stagingPercentage` mechanics (as of 2026-04)
- [Auto Update | Electron Forge](https://www.electronforge.io/advanced/auto-update) — Forge-side guidance with `update.electronjs.org` (as of 2026-04)
- [Snap | Electron docs](https://www.electronjs.org/docs/latest/tutorial/snap) — store-driven update path on Linux (as of 2026-04)

---

*🔁 Living. Re-verify quarterly: electron-updater current version, Hazel/Nuts repo activity, Squirrel.Windows commit cadence, Apple notarisation requirements (Gatekeeper rules tighten regularly).*
