# C5. Packaging & code signing — Forge vs. Builder, macOS notarization, Windows EV/HSM, Linux formats

> Status: 🟨 draft v1 🔁 living
> Last updated: 2026-04-30

## TL;DR

Packaging is the step where your `app.asar` plus the Electron binary become a signed, notarized installer your users can actually run. As of 2026-04, you pick between two packagers — **electron-forge** (officially endorsed by the Electron team, opinionated, Squirrel.Windows-by-default) and **electron-builder** (community-maintained, ~553K weekly downloads on npm v26.4.x as of 2026-01, more targets, NSIS-by-default) — and both are fine. macOS shipping is gated by **Apple Developer ID + hardened runtime + notarization via `notarytool`**. Windows shipping is in the middle of three overlapping disruptions: **CA/B Forum HSM mandate (June 2023)**, **EV instant-SmartScreen-trust removal (March 2024)**, and **460-day max validity** that begins enforcement **March 1, 2026** ([CA/B Forum vote, Oct 14, 2025](https://www.globalsign.com/en/company/news-events/news/businesses-must-prepare-two-significant-certificate-lifecycle-reductions-march-2026)). Linux is still the easy one — pick AppImage/deb/rpm/Snap/Flatpak; signing is generally not required outside of store distribution. Wayland is the new default in Electron 38+, with the `ELECTRON_OZONE_PLATFORM_HINT` shim removed in v39.

## When to apply this page

- You have an Electron app that runs in dev and you need to produce installers for macOS, Windows, or Linux.
- You hit the "App is damaged" / SmartScreen / "unrecognized developer" warning and need to understand why.
- A signing cert is up for renewal and you need to plan the next 12-15 months around new CA/B rules.
- You're choosing between Forge and Builder for a new project.
- You need to ship a universal macOS binary (Apple Silicon + Intel).
- Your CI pipeline currently signs locally and you need to migrate to cloud signing (Azure Artifact Signing, DigiCert KeyLocker, etc.).

## When NOT to apply

- You're still iterating on dev — packaging slows the feedback loop. Get the app working first; package once features stabilize.
- You're shipping a PWA or browser extension wrapped as Electron — re-evaluate; you may not need Electron at all (see [A2 — Other web-to-desktop frameworks](../awareness/02-other-frameworks.md)).
- You're targeting Mac App Store or Microsoft Store exclusively — store distribution has its own constraints; see [A3 — Store distribution](../awareness/03-store-distribution.md).

---

## Anatomy

### 1. Packaging tools

#### electron-forge — official, opinionated, batteries-included

Forge is the **Electron team's officially recommended packager** as of 2026-04 ([Distributing Apps With Electron Forge | Electron docs](https://www.electronjs.org/docs/latest/tutorial/forge-overview)). It's a modular framework: a CLI plus a plugin system, with `makers` (per-format installer producers) and `publishers` (uploaders to GitHub Releases / S3 / etc.).

Forge ships two project templates:

- **Webpack template** — stable, first-party, the safe default in 2026. Uses `@electron-forge/plugin-webpack` for main + preload + renderer bundling. ([Forge Webpack template](https://www.electronforge.io/templates/webpack)).
- **Vite template/plugin** — `@electron-forge/plugin-vite` was added in v7.5+ and is **still flagged experimental as of v7.11.x (2026-04)**, but it is widely used in production. The `experimental` label has persisted across multiple minor versions; trajectory is "Vite will become default" but Webpack remains the safe pick today ([Forge Vite template](https://www.electronforge.io/templates/vite)).

Common Forge makers (current as of v7.11, 2026-04):

| Maker | Output | Platform | Notes |
|---|---|---|---|
| `@electron-forge/maker-squirrel` | `.exe` (Squirrel.Windows installer + nupkg) | Windows | **Default Windows maker in Forge.** Squirrel.Windows is *deprecated in electron-builder*, but the upstream [Squirrel/Squirrel.Windows](https://github.com/Squirrel/Squirrel.Windows) project is **unarchived and still receives commits** (ARM64 support, .NET 4.8 dep updates). Per-user install. |
| `@electron-forge/maker-dmg` | `.dmg` | macOS | Uses [`electron-installer-dmg`](https://github.com/electron-userland/electron-installer-dmg). |
| `@electron-forge/maker-zip` | `.zip` | macOS / any | Required by macOS auto-update (Squirrel.Mac wants ZIPs). |
| `@electron-forge/maker-deb` | `.deb` | Linux (Debian/Ubuntu) | |
| `@electron-forge/maker-rpm` | `.rpm` | Linux (Fedora/RHEL) | |
| `@electron-forge/maker-flatpak` | `.flatpak` | Linux | |
| `@electron-forge/maker-msix` | `.msix` | Windows | **Experimental** (added in Forge v7.10, 2025) ([Forge release notes](https://github.com/electron/forge/releases)). |
| `publisher-github` | upload to GitHub Releases | — | Pairs cleanly with `electron-updater`. |
| `publisher-s3` | upload to S3 / S3-compatible | — | |

Cite: [`https://www.electronforge.io/`](https://www.electronforge.io/) and [`https://www.electronjs.org/docs/latest/tutorial/forge-overview`](https://www.electronjs.org/docs/latest/tutorial/forge-overview).

#### electron-builder — community, feature-rich, downloads winner

[electron-builder](https://www.electron.build/) is the third-party packager that has dominated production Electron deployments for years. As of 2026-01, it's at **v26.4.x with ~553,836 weekly downloads on npm** ([electron-builder GitHub](https://github.com/electron-userland/electron-builder)). It's not officially endorsed, but it's actively maintained and has more output formats and configuration knobs than Forge.

Strengths:

- **NSIS as default Windows installer** — supports per-user and per-machine installs, custom installer pages, multi-language. ([NSIS | electron-builder docs](https://www.electron.build/configuration/nsis)).
- **`electron-updater` integration** — pairs natively with auto-update via GitHub Releases / S3 / generic / Bitbucket. See [C7 — Auto-update](07-auto-update.md).
- **Differential updates** — block-map-based delta downloads; saves bandwidth for large apps.
- **Many target formats** — `nsis`, `nsis-web`, `portable`, `appx`, `msi`, `squirrel` (deprecated), `dmg`, `pkg`, `mas`, `mas-dev`, `appimage`, `snap`, `deb`, `rpm`, `flatpak`, `pacman`, etc.
- **Built-in code signing config** for both Windows (`win.certificateFile`, `win.signtoolOptions`, `win.azureSignOptions`) and macOS (handles `@electron/osx-sign` + `@electron/notarize` invocation under the hood).

Cite: [`https://www.electron.build/`](https://www.electron.build/).

#### electron-packager — the layer below

[`@electron/packager`](https://github.com/electron/packager) (formerly `electron-packager`) is the *primitive*: it takes your source tree and produces a directory containing the Electron binary plus your packaged app. **Forge uses it under the hood**, and you rarely use it directly today unless you have a custom pipeline. If you find yourself reaching for `electron-packager` in 2026, ask whether Forge's lower-level config can do the same job — usually yes.

#### Forge vs. Builder — small comparison table

| Concern | electron-forge | electron-builder |
|---|---|---|
| Officially recommended | ✅ Yes ([electron docs](https://www.electronjs.org/docs/latest/tutorial/forge-overview)) | ❌ No (community) |
| Weekly npm downloads (2026-04) | Lower (Forge has fewer downloads but is officially endorsed) | ~553K ([electron-builder GitHub](https://github.com/electron-userland/electron-builder)) |
| Default Windows installer | Squirrel.Windows | NSIS |
| MSIX support | Experimental (v7.10+) | Yes (`appx` target) |
| Auto-update story | publisher-github + custom | Native via `electron-updater` |
| Differential downloads | No | Yes |
| Configuration style | `forge.config.js` + plugins/makers | `electron-builder.yml` or `package.json#build` |
| Universal macOS binary | Via `@electron/universal` (manual or maker) | Via `mac.target: 'universal'` |
| First-party templates | Webpack (stable), Vite (experimental) | None — bring your own bundler |

**Pick on context, not religion.** New project? Forge gives you the default-correct path. Need NSIS, differential updates, or aggressive multi-target builds? Builder. Both ship signed apps; both work in CI; both are actively developed.

#### ASAR archive

ASAR (`app.asar`) is Electron's tar-like archive format used to bundle your app's source files into a single read-only file. ([electron/asar](https://github.com/electron/asar)).

When to enable: **almost always**. Default in Forge and Builder. Reasons:

- Better disk-IO performance during app load (one file, not thousands).
- Hides source layout from casual users (not security — see below).
- Required for **ASAR integrity validation** (the `OnlyLoadAppFromAsar` + `EnableEmbeddedAsarIntegrityValidation` fuse pair stable in Electron 39+; embedded digest in v41+) — see [C3 Security § ASAR integrity](03-security.md).

When to disable: native modules with platform-specific binaries that can't be `require()`'d from inside an ASAR (rare with modern Node — most native modules just work, but legacy `.node` files sometimes need `asarUnpack` to be extracted alongside).

ASAR is **not encryption**. Anyone with your installer can extract `app.asar` with `npx @electron/asar extract`. ASAR integrity validation (the fuse) is what gives you tamper-detection at runtime, not the ASAR archive itself.

### 2. macOS code signing & notarization

macOS distribution outside the Mac App Store requires the **Apple Developer ID** signing + **hardened runtime** + **Apple notarization** trifecta. Without all three, modern macOS (Catalina+) refuses to launch the app or shows the "App is damaged and can't be opened" alert. ([Distributing software outside of the Mac App Store | Apple Developer](https://developer.apple.com/documentation/security/distributing-software-outside-of-the-mac-app-store-1)).

#### Hardened runtime

Required for notarization. The hardened runtime applies stricter runtime protections (library validation, no JIT unless explicitly entitled, restricted DYLD env vars, no debugging unless explicitly entitled) ([Hardened Runtime | Apple Developer](https://developer.apple.com/documentation/security/hardened_runtime)).

You enable it via `--options runtime` to `codesign`, plus an **entitlements `.plist` file** that lists which protections to relax. For a typical Electron app:

```xml
<!-- entitlements.mac.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- Electron uses V8 which JITs JavaScript -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <!-- Allow loading developer-signed Electron Helper binaries -->
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <!-- Optional: keep strict DYLD env behavior -->
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
</dict>
</plist>
```

The `com.apple.security.cs.*` entitlements are documented at [Apple's hardened runtime entitlements page](https://developer.apple.com/documentation/bundleresources/entitlements/com_apple_security_cs).

#### App Sandbox vs. hardened runtime — different things

Hardened runtime is for **Developer ID distribution** and is required for notarization. **App Sandbox** is a separate profile that confines the app to a sandbox container (limited file access, no arbitrary `exec`, must declare entitlements for network/files/etc.). App Sandbox is **required for Mac App Store** but optional for Developer ID — most non-MAS Electron apps do NOT use App Sandbox because it breaks common patterns (writing arbitrary files, running native helpers, deep-linking outside the sandbox). ([Mac App Store Submission Guide | Electron docs](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)). For MAS specifics, see [A3 — Store distribution](../awareness/03-store-distribution.md).

#### Signing — `@electron/osx-sign`

The signing step itself is handled by [`@electron/osx-sign`](https://github.com/electron/osx-sign) under the hood (Forge and Builder both use it). It walks the app bundle, finds every Mach-O binary including helpers and frameworks, and signs each with `codesign`. Signing a Mach-O bundle is recursive — every framework, every helper executable, every embedded `.dylib` must be signed before the outer bundle is signed.

#### Notarization — `notarytool`, NOT `altool`

Apple **deprecated `altool` for notarization on November 1, 2023**. The current tool is `notarytool` (built into Xcode 13+). The Electron-team-maintained wrapper [`@electron/notarize`](https://github.com/electron/notarize) (latest **v3.1.1** as of 2026-01, [npm](https://www.npmjs.com/package/@electron/notarize)) calls `notarytool` and handles polling.

Auth options:

- **App-specific password** — works, but not recommended. You generate an app-specific password at appleid.apple.com and pass `appleId` + `appleIdPassword` + `teamId`. Tied to a single Apple ID.
- **App Store Connect API key** ⭐ recommended — you generate a `.p8` file at App Store Connect, then pass `appleApiKey` (path), `appleApiKeyId`, `appleApiIssuer`. CI-friendly, no 2FA dance, scoped per role. This is the path Apple steers you toward in 2026.

```js
// notarize.js — invoked from forge.config.js or electron-builder afterSign hook
const { notarize } = require('@electron/notarize');

exports.default = async (context) => {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = context.packager.appInfo.productFilename;
  await notarize({
    appPath: `${context.appOutDir}/${appName}.app`,
    appleApiKey: process.env.APPLE_API_KEY_PATH,         // path to AuthKey_XXXXX.p8
    appleApiKeyId: process.env.APPLE_API_KEY_ID,         // Key ID
    appleApiIssuer: process.env.APPLE_API_ISSUER,        // Issuer ID
  });
};
```

Cite: [`https://github.com/electron/notarize`](https://github.com/electron/notarize) and [Notarizing macOS software before distribution | Apple Developer](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

#### Stapling — embed the ticket

After Apple notarizes, the **ticket** lives on Apple's servers. Without it, first launch on a fresh machine requires an internet round-trip to Apple. **Stapling** embeds the ticket into the app bundle / DMG / PKG so launch is offline-friendly:

```bash
xcrun stapler staple "MyApp-1.0.0.dmg"
xcrun stapler validate "MyApp-1.0.0.dmg"
```

`@electron/notarize` does not staple — both Forge and Builder handle it via separate steps. In Builder it's automatic; in Forge you may need a custom `afterPackage` hook depending on your maker.

#### Universal binaries — Apple Silicon + Intel

Apple Silicon Macs run Intel binaries via Rosetta 2, but a **universal binary** (single bundle containing both x64 and arm64 slices) is faster and avoids Rosetta install prompts. Use [`@electron/universal`](https://github.com/electron/universal) (latest **v3.0.4** as of 2026-04, [npm](https://www.npmjs.com/package/@electron/universal)):

```js
const { makeUniversalApp } = require('@electron/universal');
await makeUniversalApp({
  x64AppPath: 'out/MyApp-darwin-x64/MyApp.app',
  arm64AppPath: 'out/MyApp-darwin-arm64/MyApp.app',
  outAppPath: 'out/MyApp-darwin-universal/MyApp.app',
  // mergeASARs reduces bundle size by deduplicating identical asar contents
  mergeASARs: true,
});
```

In electron-builder, set `mac.target: 'universal'` and Builder runs `@electron/universal` for you. ([Apple Silicon Support | Electron blog](https://www.electronjs.org/blog/apple-silicon)).

#### Distribution containers — DMG vs. PKG vs. ZIP

| Container | Use when | Notes |
|---|---|---|
| **DMG** | Default for direct download. Drag-to-Applications metaphor. | Most common for Electron. Forge's `maker-dmg`, Builder's `dmg` target. |
| **PKG** | Need an installer that runs scripts (postinstall, pre-uninstall) or installs to a non-`/Applications` location. | Required for Mac App Store. Optional for Developer ID. |
| **ZIP** | Auto-update via Squirrel.Mac — requires a `.zip` containing the `.app`. | Always also produce ZIP if you ship auto-update on macOS. See [C7](07-auto-update.md). |

You typically ship DMG + ZIP for Developer ID distribution: DMG for the user-visible download, ZIP for `electron-updater` / Squirrel.Mac to consume.

### 3. Windows code signing — 2024-2026 timeline

This is the most volatile area in the entire KB. Three major changes in 36 months, with the third one (460-day max validity) **landing March 1, 2026 — five weeks before the date this page was written**. Read carefully and re-verify before making purchase decisions.

#### CA/B Forum HSM mandate — June 1, 2023

The **Certificate Authority / Browser Forum** voted (2022) and effective **June 1, 2023**, all newly issued OV (Organization Validation) and EV (Extended Validation) code signing certificates must have private keys stored on **FIPS 140-2 Level 2+ hardware** — i.e., a USB token, an HSM appliance, or an approved cloud HSM service. ([CA/Browser Forum Code Signing Baseline Requirements](https://cabforum.org/working-groups/code-signing/requirements/)).

Practical effect: **no more soft certs**. You can no longer email yourself a `.pfx` file and sign on any laptop. You either ship the USB token (most CAs ship YubiKeys / Safenet eToken 5110 / similar) and physically move it between developers, or you use a **cloud signing service** (next section).

#### EV instant SmartScreen trust removed — March 2024

Historically, EV code signing was sold on the promise that signed binaries would **bypass SmartScreen reputation gating** instantly — no "Windows protected your PC" warning, no waiting for download volume. **Microsoft removed this distinction in March 2024.** ([SmartScreen reputation for Windows app developers | Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)).

Now SmartScreen reputation accrues per signing identity over downloads regardless of OV vs. EV. EV still has value (annual revalidation, more rigorous identity check, sometimes preferred by enterprise), but it no longer gives you instant trust. **If you're choosing between OV and EV in 2026, the calculus is different than in 2023.**

#### 460-day max validity — March 1, 2026

**Effective March 1, 2026,** the maximum validity period for newly issued public code signing certificates drops from up to 39 months (3+ years) to **460 days (~15 months)**. ([CA/B Forum vote, October 14, 2025; effective March 1, 2026](https://www.globalsign.com/en/company/news-events/news/businesses-must-prepare-two-significant-certificate-lifecycle-reductions-march-2026), [DigiCert blog](https://www.digicert.com/blog/understanding-the-new-code-signing-certificate-validity-change), [SignMyCode 460-day analysis](https://signmycode.com/blog/code-signing-certificate-validity-changes-a-new-era-of-trust-and-automation)).

Existing certs issued before March 1, 2026 continue to work until their natural expiration. New certs issued from that date forward cannot exceed 459 days validity. Some CAs stopped selling 2-year and 3-year certs in late 2025 (GlobalSign cut off issuance December 26, 2025) ([SignMyCode](https://signmycode.com/blog/code-signing-certificate-validity-changes-a-new-era-of-trust-and-automation)).

**Practical implications for your 2026-2027 planning:**

- Order certs **before** any planned product launches, not the day of.
- Plan for an **annual renewal cadence** (effectively — certs lapse at month 15, you want overlap, so renew at ~month 12-13).
- Automate signing in CI — manual signing every 12 months for every developer becomes painful.
- Cloud signing services (next section) become more attractive vs. physical tokens because key rotation overhead is amortized.

#### Cloud signing services — managed HSM alternatives

If you don't want to ship USB tokens between developers (or run an HSM appliance), use a cloud signing service:

| Service | Provider | Notes |
|---|---|---|
| **Azure Artifact Signing** (formerly **Azure Trusted Signing**) | Microsoft | Rebranded ~Oct 2025. As of 2026-04, expanded to **US, Canada, EU, UK** for organizations; individual developers still **US/Canada only**. Org accounts require **3+ years verifiable history**. ([Azure Artifact Signing | Microsoft Azure](https://azure.microsoft.com/en-us/products/artifact-signing), [Microsoft Learn quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)). |
| **DigiCert KeyLocker** | DigiCert | Cloud HSM (FIPS 140-2 Level 3). 1,000 signatures per cert validity period; expandable. Now sold as 1-year-only as a result of the Feb 2026 validity change. ([DigiCert KeyLocker docs](https://docs.digicert.com/en/digicert-keylocker.html)). |
| **Sectigo Signing Service** | Sectigo | Cloud-based remote signing alternative. |
| **SSL.com eSigner** | SSL.com | Cloud HSM with web UI + CLI signing. |
| **Entrust Code Signing** | Entrust | Cloud HSM-based remote signing. |

If you're outside US/Canada and your org doesn't yet qualify for Azure Artifact Signing, **DigiCert KeyLocker** or **SSL.com eSigner** are the most common Electron-shop fallbacks. Cite [Microsoft Trusted Signing | Microsoft Learn](https://learn.microsoft.com/en-us/azure/trusted-signing/) (the URL still resolves — same docs, new name).

#### Signing tools

| Tool | Where it runs | Use case |
|---|---|---|
| `signtool.exe` | Windows only (ships with Windows SDK) | Legacy; what every doc still shows. Works with USB token or local PFX (deprecated post-CA/B mandate). |
| [`osslsigncode`](https://github.com/mtrojnar/osslsigncode) | Linux / macOS | Cross-build signing on non-Windows CI. Supports HSM via `pkcs11`. Now very common for Linux GitHub Actions runners signing Windows binaries. |
| [`@electron/windows-sign`](https://github.com/electron/windows-sign) | Node.js (cross-platform) | The Electron-team-maintained wrapper. Plays well with Forge. |
| `electron-builder`'s `win.sign` config | Node.js | Built into Builder; supports `signtoolOptions`, `azureSignOptions`, custom hooks. |

For Azure Artifact Signing in CI, the [`Azure/artifact-signing-action`](https://github.com/Azure/artifact-signing-action) (formerly `Azure/trusted-signing-action`) GitHub Action is the most ergonomic path.

#### Installer choice — NSIS vs. MSI vs. MSIX vs. Squirrel.Windows

| Installer | Default in | Per-user vs. machine | Strengths | Weaknesses |
|---|---|---|---|---|
| **NSIS** | electron-builder | Both supported | Mature, scriptable, multi-language, customizable UI | Manual install/uninstall scripts can drift |
| **MSI** | Neither (opt-in via Builder `msi`) | Machine-wide (typically) | Enterprise-friendly, GPO-deployable | Less flexible for per-user; build complexity |
| **MSIX** | Neither (Forge `maker-msix` experimental v7.10+; Builder `appx`) | Per-user | Modern, sandboxed, auto-update via Microsoft Store, no signing cert needed if Store-distributed | Limited filesystem access, MS-Store-or-self-host trade |
| **Squirrel.Windows** | electron-forge (`maker-squirrel`) | **Per-user only** | Auto-update built in via [Squirrel](https://github.com/Squirrel/Squirrel.Windows); minimal UI; what Slack/Discord ship | Per-user only (no machine-wide); UAC quirks; no localized installer; **deprecated *in electron-builder*** but **upstream is unarchived** and receives commits (latest activity 2024-2025: ARM64, .NET 4.8 dep) |

**Important nuance about Squirrel.Windows.** It is often described as "deprecated" online. The accurate framing as of 2026-04:

- **Deprecated in electron-builder** — Builder's docs steer users to NSIS for new projects.
- **Default Windows maker in electron-forge** — `maker-squirrel` ships out of the box.
- **Upstream is unarchived** — [Squirrel/Squirrel.Windows](https://github.com/Squirrel/Squirrel.Windows) on GitHub receives commits; the maintainers' note describes the project as "looking for help" but not abandoned. Recent commits cover ARM64 support and .NET 4.8 updates.

So if you choose Forge, you're shipping Squirrel.Windows by default and that's fine — it works, it auto-updates, it's what Slack and Discord use. If you choose Builder, you're shipping NSIS by default. Either is a valid 2026 choice; don't let "Squirrel is deprecated" half-truths push you toward unnecessary migration.

**Per-user vs. machine-wide** is the key UX decision. Per-user installs (Squirrel, MSIX) don't require admin rights on install or update — huge for consumer apps and locked-down corporate machines. Machine-wide installs (NSIS default config, MSI) require admin once and are visible to all users — preferred for shared workstations and enterprise IT.

### 4. Linux

Linux is the easy platform. No mandatory signing for binary distribution; users either trust the source or they don't.

#### Formats

| Format | Distros | Strengths | Weaknesses |
|---|---|---|---|
| **AppImage** | Universal (any glibc-compatible distro) | Single executable, no install, portable. Most popular for Electron. | No central updater; users update manually unless app handles it (electron-updater does AppImage). |
| **.deb** | Debian, Ubuntu, derivatives | Native package manager integration. | Distro-specific. |
| **.rpm** | Fedora, RHEL, openSUSE | Native package manager integration. | Distro-specific. |
| **Snap** | Ubuntu (and any distro with snapd) | Auto-update, sandboxed (AppArmor), Snap Store discoverability. | Confinement breaks some Electron patterns; slow first-launch on cold cache; controversial in non-Ubuntu communities. |
| **Flatpak** | Flathub (cross-distro) | Sandboxed (Bubblewrap), Flathub discoverability, runtime-versioned. | More complex packaging; runtime mismatches are a footgun. |

For a typical Electron app, ship **AppImage + .deb + .rpm** (covers ~95% of users) and add Flatpak if you want Flathub presence. Skip Snap unless your audience is Ubuntu-centric.

Cite: [Snap | Electron docs](https://www.electronjs.org/docs/latest/tutorial/snap), [Linux configuration | electron-builder docs](https://www.electron.build/configuration/linux).

#### Signing on Linux

- **AppImage / .deb / .rpm** — no signing required for self-distribution. Users trust the source URL or your apt/yum repo's GPG key.
- **Snap** — the Snap Store does its own signing during publish; you don't ship a separate cert.
- **Flatpak** — Flathub signs the repo with its own GPG key; you don't sign individual builds.
- **GPG signing of `.deb` / `.rpm`** — standard Linux practice if you host your own apt/yum repo. Out of scope for most Electron shops; if you go this route, follow your distro's repo-signing guide.

#### Wayland callout

**Electron 38 (Sept 2025)** made **Wayland the default ozone backend** when launched in a Wayland session. ([Tech Talk — How Electron went Wayland-native | Electron blog](https://www.electronjs.org/blog/tech-talk-wayland)).

The transitional escape hatch `ELECTRON_OZONE_PLATFORM_HINT` (used to force `auto` / `wayland` / `x11`) was deprecated in v38 and **removed in Electron 39**. If your app or your CI references this env var, drop it before bumping to v39+.

Practical packaging note: nothing changes about how you produce the AppImage / .deb / .rpm. The behavior change is purely runtime. But test your app under Wayland (e.g., GNOME 45+, KDE Plasma 6+) before shipping a v38+ build — input methods, screen capture, and tray icons have known edge cases that surface on Wayland that didn't on X11.

---

## Decision matrix

### Picking a packager

| If… | Pick |
|---|---|
| New project, no strong preference, want the official path | **Forge** + Webpack template |
| Need NSIS, differential updates, tight `electron-updater` integration | **Builder** |
| Going to ship to MSIX / Microsoft Store eventually | Either; Builder's `appx` is more mature, Forge's `maker-msix` is experimental |
| Heavy multi-target build matrix (10+ outputs) | **Builder** |
| Want first-party Electron-team support | **Forge** |
| Already have an `electron-builder.yml` working | Stay with **Builder** |

### Picking a Windows installer

| If… | Pick |
|---|---|
| Consumer app, per-user install, want auto-update simplicity | **Squirrel.Windows** (Forge default) |
| Enterprise app, GPO deployment, machine-wide | **MSI** |
| Microsoft Store distribution | **MSIX** |
| Self-distributed, want flexibility, per-user OR machine-wide | **NSIS** (Builder default) |

### Picking a macOS distribution container

| If… | Pick |
|---|---|
| Direct download from your website | **DMG** (+ **ZIP** for auto-update) |
| Need install scripts or non-`/Applications` install path | **PKG** |
| Mac App Store | **PKG** (mandatory) |

### Picking a Linux format mix

| Audience | Pick |
|---|---|
| Default cross-distro coverage | **AppImage + .deb + .rpm** |
| Ubuntu-centric audience | Add **Snap** |
| Want Flathub discoverability | Add **Flatpak** |

### Picking Windows code-signing infrastructure (2026)

| If… | Pick |
|---|---|
| US/Canada org with 3+ year history | **Azure Artifact Signing** (cheapest, most integrated with GitHub Actions / Azure DevOps) |
| EU/UK org (as of 2026-04) | **Azure Artifact Signing** (now available) OR **DigiCert KeyLocker** |
| Anywhere else, or individual developer outside US/Canada | **DigiCert KeyLocker**, **SSL.com eSigner**, or **Sectigo Signing Service** |
| Have a USB token already, small team | Keep using the token + `signtool.exe` until next renewal |

---

## Mini-example — minimal Forge config with notarization + signing hooks

```js
// forge.config.js
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    osxSign: {
      identity: 'Developer ID Application: Your Co (TEAM123ID)',
      optionsForFile: () => ({
        entitlements: 'build/entitlements.mac.plist',
        hardenedRuntime: true,
      }),
    },
    osxNotarize: {
      tool: 'notarytool',
      appleApiKey: process.env.APPLE_API_KEY_PATH,
      appleApiKeyId: process.env.APPLE_API_KEY_ID,
      appleApiIssuer: process.env.APPLE_API_ISSUER,
    },
  },
  rebuildConfig: {},
  makers: [
    { name: '@electron-forge/maker-squirrel', config: {
        certificateFile: process.env.WIN_CERT_FILE, // or use windows-sign config
        certificatePassword: process.env.WIN_CERT_PASSWORD,
    } },
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },     // for macOS auto-update
    { name: '@electron-forge/maker-dmg', config: {} },
    { name: '@electron-forge/maker-deb', config: {} },
    { name: '@electron-forge/maker-rpm', config: {} },
  ],
  plugins: [
    // Lock down ASAR integrity + node CLI fuses at package time
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  publishers: [
    { name: '@electron-forge/publisher-github', config: {
        repository: { owner: 'your-org', name: 'your-app' },
        prerelease: false,
    } },
  ],
};
```

The fuses block is what makes ASAR integrity a real defense; see [C3 — Security § ASAR integrity](03-security.md). The publishers block is what `electron-updater` reads later; see [C7 — Auto-update](07-auto-update.md).

---

## Cross-links

- [C3 — Security](03-security.md) — ASAR integrity validation; fuses must be enabled at packaging time, OS-enforced via the same code signature this page describes.
- [C7 — Auto-update](07-auto-update.md) — macOS auto-update **requires** the app to be code-signed (Squirrel.Mac validates the signature on every update); Windows auto-update via Squirrel.Windows / `electron-updater` likewise depends on signing identity continuity.
- [C6 — Cross-platform porting](06-cross-platform-porting.md) — installer-format-specific cross-platform gotchas; complementary to this page's "what tool produces installers" angle.
- [A3 — Store distribution](../awareness/03-store-distribution.md) — Mac App Store + Microsoft Store specifics (App Sandbox, MSIX-via-Store, review process).
- [Build-kit Template 03 — electron-builder.yml for Win/Mac/Linux](../../build-kit/templates/03-electron-builder-config.md) — concrete Builder config you can copy.
- [Build-kit Template 04 — Auto-update](../../build-kit/templates/04-auto-update.md) — `electron-updater` integration paired with this page's signing setup.

---

## Sources

### Packaging tools

- [Distributing Apps With Electron Forge | Electron docs](https://www.electronjs.org/docs/latest/tutorial/forge-overview) `(as of 2026-04)`
- [Why Electron Forge? | Forge docs](https://www.electronforge.io/core-concepts/why-electron-forge) `(as of 2026-04)`
- [Forge homepage](https://www.electronforge.io/) `(as of 2026-04)`
- [Forge Vite template](https://www.electronforge.io/templates/vite) `(as of 2026-04 — flagged experimental in v7.5+ through v7.11.x)`
- [Forge Webpack template](https://www.electronforge.io/templates/webpack) `(as of 2026-04)`
- [electron-builder docs](https://www.electron.build/) `(as of 2026-04 — v26.4.x, ~553K weekly downloads as of 2026-01)`
- [electron-builder GitHub](https://github.com/electron-userland/electron-builder) `(as of 2026-04)`
- [NSIS target | electron-builder docs](https://www.electron.build/configuration/nsis) `(as of 2026-04)`
- [@electron/asar | GitHub](https://github.com/electron/asar) `(as of 2026-04)`

### macOS signing & notarization

- [Hardened Runtime | Apple Developer](https://developer.apple.com/documentation/security/hardened_runtime) `(as of 2026-04)`
- [Notarizing macOS software before distribution | Apple Developer](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) `(as of 2026-04 — `notarytool`; altool deprecated 2023-11-01)`
- [Distributing software outside of the Mac App Store | Apple Developer](https://developer.apple.com/documentation/security/distributing-software-outside-of-the-mac-app-store-1) `(as of 2026-04)`
- [Mac App Store Submission Guide | Electron docs](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide) `(as of 2026-04)`
- [@electron/notarize | GitHub](https://github.com/electron/notarize) `(as of 2026-04 — v3.1.1, [npm](https://www.npmjs.com/package/@electron/notarize))`
- [@electron/osx-sign | GitHub](https://github.com/electron/osx-sign) `(as of 2026-04)`
- [@electron/universal | GitHub](https://github.com/electron/universal) `(as of 2026-04 — v3.0.4, [npm](https://www.npmjs.com/package/@electron/universal))`
- [Apple Silicon Support | Electron blog](https://www.electronjs.org/blog/apple-silicon)
- [Code Signing | Electron docs](https://www.electronjs.org/docs/latest/tutorial/code-signing) `(as of 2026-04)`

### Windows signing — 2024-2026 timeline

- [Code Signing Baseline Requirements | CA/Browser Forum](https://cabforum.org/working-groups/code-signing/requirements/) `(as of 2026-04 — primary source for HSM mandate June 2023 + 460-day rule effective March 1, 2026)`
- [Following New CA/B Forum Vote, Businesses Must Prepare for Two Significant Certificate Lifecycle Reductions in March 2026 | GlobalSign](https://www.globalsign.com/en/company/news-events/news/businesses-must-prepare-two-significant-certificate-lifecycle-reductions-march-2026) `(as of 2026-04 — 460-day rule effective 2026-03-01)`
- [Understanding the New Code-Signing Certificate Validity Change | DigiCert](https://www.digicert.com/blog/understanding-the-new-code-signing-certificate-validity-change) `(as of 2026-04)`
- [460 Day Code Signing Certificate Validity | SignMyCode](https://signmycode.com/blog/code-signing-certificate-validity-changes-a-new-era-of-trust-and-automation) `(as of 2026-04)`
- [SmartScreen reputation for Windows app developers | Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation) `(as of 2026-04 — substantiates EV-instant-trust removal March 2024)`
- [Code signing options for Windows app developers | Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options) `(as of 2026-04)`
- [Microsoft Trusted Signing | Microsoft Learn](https://learn.microsoft.com/en-us/azure/trusted-signing/) `(as of 2026-04 — rebranded "Azure Artifact Signing" Oct 2025)`
- [Azure Artifact Signing | Microsoft Azure](https://azure.microsoft.com/en-us/products/artifact-signing) `(as of 2026-04 — US/Canada/EU/UK orgs; individuals US/Canada only)`
- [Quickstart: Set up Artifact Signing | Microsoft Learn](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart) `(as of 2026-04)`
- [Artifact Signing FAQ | Microsoft Learn](https://learn.microsoft.com/en-us/azure/artifact-signing/faq) `(as of 2026-04)`
- [DigiCert KeyLocker docs](https://docs.digicert.com/en/digicert-keylocker.html) `(as of 2026-04)`
- [Squirrel.Windows | upstream GitHub repo](https://github.com/Squirrel/Squirrel.Windows) `(as of 2026-04 — unarchived, receives commits; deprecated in electron-builder, default in Forge)`
- [@electron/windows-sign | GitHub](https://github.com/electron/windows-sign) `(as of 2026-04)`
- [osslsigncode | GitHub](https://github.com/mtrojnar/osslsigncode) `(as of 2026-04)`
- [Azure/artifact-signing-action | GitHub](https://github.com/Azure/artifact-signing-action) `(as of 2026-04 — formerly trusted-signing-action)`

### Linux

- [Snap | Electron docs](https://www.electronjs.org/docs/latest/tutorial/snap) `(as of 2026-04)`
- [Linux configuration | electron-builder docs](https://www.electron.build/configuration/linux) `(as of 2026-04)`
- [Tech Talk — How Electron went Wayland-native | Electron blog](https://www.electronjs.org/blog/tech-talk-wayland) `(as of 2026-04 — Electron 38 default; ELECTRON_OZONE_PLATFORM_HINT removed in v39)`
- [Electron 38.0.0 release | Electron blog](https://www.electronjs.org/blog/electron-38-0) `(as of 2026-04)`

### Cross-references

- [Configuring Electron Fuses | electron-builder docs](https://www.electron.build/tutorials/adding-electron-fuses.html) `(as of 2026-04)`
- [Universal macOS binaries | Electron docs](https://www.electronjs.org/docs/latest/tutorial/mac-universal-binary) `(as of 2026-04)`
