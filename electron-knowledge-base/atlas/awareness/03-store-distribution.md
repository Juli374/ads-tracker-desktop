# A3. Store distribution — Mac App Store, Microsoft Store

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

OS app stores (Mac App Store, Microsoft Store, Snapcraft, Flathub) buy you discoverability, payment plumbing, and install-trust at the cost of a revenue cut, review delays, sandbox restrictions, and slower ship cadence. For most Electron apps the modern playbook is **dual-track**: ship a Developer ID + notarized DMG outside the Mac App Store and a separate `mas` build into MAS, plus an MSIX bundle to the Microsoft Store alongside an NSIS installer outside it. Auto-updates run on the outside builds; the stores update the in-store builds for you. C5 owns signing/notarization depth — this page covers when/whether stores are worth it at all `(as of 2026-04)`.

## When to ship to a store

- **Discoverability matters.** Consumer apps benefit from store search, editorial features, and category browsing. B2B tools usually don't — engineers find them via Google.
- **You want the OS to handle payment processing.** Apple/Microsoft handle tax, refunds, currency, and chargebacks. For paid apps and subscriptions this is real value if you don't already have Stripe/Paddle wired up.
- **Trust signal.** "Available in the Mac App Store" reduces the friction of an unsigned-binary warning for end users; on Windows, Store apps install per-user without admin and skip SmartScreen prompts entirely.
- **Stores ship updates for you.** No `electron-updater` to wire up; users get updates through the store auto-update channel.
- **Enterprise / managed devices.** Some IT departments only allow Store-signed apps; being absent from the store is a hard gate.

## When NOT to ship to a store

- **Revenue cut hurts more than discoverability helps.** Apple takes 30% (15% under the Small Business Program for revenue under $1M/year — see Apple's program page below). Microsoft Store takes 15% on non-gaming apps when using its commerce platform, or 0% if you bring your own commerce ([Microsoft Learn — Why distribute through Store](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/why-distribute-through-store), as of 2026-04). For high-margin SaaS the cut may be tolerable; for transactional businesses (gambling, low-margin commerce) it's often not worth it.
- **Review delays break ship cadence.** Apple App Review can take 24-72 hours for routine updates and longer for first submissions. Microsoft Store review is usually faster but still introduces friction. If you ship multiple times per week, the store will lag.
- **Restricted entitlements.** MAS apps must run under App Sandbox, which disables many Electron capabilities (see below). MSIX apps run under the Windows AppContainer and are similarly constrained.
- **Can't push instant fixes.** A critical bug fix may sit in review for a day. With your own auto-update, it ships in minutes.
- **No telemetry / consent surface control.** Store policies dictate what you can collect and how you must disclose it.

## Mac App Store (MAS)

### Build target

You need a separate **`mas` build** of Electron — not the same binary you ship outside the store. Both `electron-builder` (`mas` target) and `electron-forge` can produce it. The `mas` build links against a different set of Apple frameworks compatible with App Sandbox; running a regular Electron build through MAS submission will fail validation. See the [Mac App Store Submission Guide | Electron docs](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide).

### App Sandbox vs. Hardened Runtime

These are **two different things** and both matter. Hardened Runtime is required for notarization of apps shipped outside MAS (see [C5 Packaging & signing](../core/05-packaging-and-signing.md)). App Sandbox is a stricter, additional layer required for *MAS-distributed* apps — it confines the app to a tight set of OS resources declared via entitlements. A MAS build typically needs Hardened Runtime + App Sandbox; a Developer ID build only needs Hardened Runtime.

### Required entitlements

At minimum your `entitlements.mas.plist` must declare:

- `com.apple.security.app-sandbox` — turns sandboxing on
- `com.apple.security.network.client` — outbound HTTPS (almost always needed for a remote-backend app)
- `com.apple.security.files.user-selected.read-write` — open/save dialogs
- `com.apple.security.application-groups` (optional) — shared container with helper processes

The full list and a worked example are in the [Electron MAS Submission Guide](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide).

### Restrictions you'll hit

- `app.setAsDefaultProtocolClient` is limited under sandbox; deep-link registration works only via the `LSHandlerRank` mechanism in `Info.plist`, not at runtime.
- The Electron `autoUpdater` is unavailable on MAS builds — the App Store handles updates. Don't ship `electron-updater` code in the MAS bundle; gate it behind a build-time flag.
- File system access outside user-selected paths requires explicit entitlements and may need security-scoped bookmarks.
- Some Node-native modules don't survive the sandbox; test the MAS build end-to-end before submission.

### Certificates and provisioning

MAS distribution uses different certificates than Developer ID:

- **Apple Distribution** certificate (rebranded from "3rd Party Mac Developer Application" / "Mac App Distribution") — signs the app bundle ([Apple Developer — Certificates](https://developer.apple.com/support/certificates)).
- A separate certificate for signing the embedded Mac App Store installer.
- A **Mac App Store provisioning profile** tied to your App ID and distribution certificate.
- Apple Developer Program membership ($99/year).

The Electron submission guide walks through the four-certificate combination and `productbuild` steps.

### Pricing cut

- **30%** standard rate.
- **15%** under the [App Store Small Business Program](https://developer.apple.com/app-store/small-business-program/) for developers earning under $1M USD/year in proceeds — must apply, threshold reset annually `(as of 2026-04)`.
- **No fee** for free apps that don't sell digital content.

## Microsoft Store

### Format: MSIX

MSIX is Microsoft's modern app packaging format and the only path into the Microsoft Store for Electron apps. It supersedes the older AppX format (which is still supported by `electron-builder` but deprecated for new submissions). See [Packaging Electron apps as MSIX | Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/guides/electron-packaging).

Tooling status `(as of 2026-04)`:

- **Electron Forge** ships `@electron-forge/maker-msix` — added in v7.10, still marked **experimental** ([Forge MSIX maker](https://www.electronforge.io/config/makers/msix)). Requires a Windows 10 SDK on a Windows build machine.
- **electron-builder** supports `appx` (the older format) natively; MSIX support exists but practical adoption favours Forge's maker or the Microsoft `winapp-cli` tool.
- For Store submission, **you do not need to sign the MSIX yourself** — Microsoft re-signs the package during the certification process. Outside-store MSIX distribution requires your own code-signing certificate.

### MSIX vs. side-loaded NSIS

The Microsoft Store *requires* MSIX. Outside the store, NSIS (the electron-builder default) and Squirrel.Windows (the Forge default) both still work and remain the dominant choice for Electron apps. Some teams ship MSIX *outside* the store as well, because MSIX gives clean per-user installs, automatic background updates via Windows Update, and clean uninstalls. The trade-off is more complex packaging and Windows-10-or-newer requirement.

### Auto-update

The Microsoft Store handles updates for in-store MSIX builds — your in-app `electron-updater` should be **disabled** for Store builds (use a build-time flag, same pattern as MAS). Outside-store MSIX builds can use the App Installer auto-update mechanism (declared in `AppInstaller.xml`) instead of `electron-updater`.

### Restrictions

- Restricted capabilities in `Package.appxmanifest` (e.g., `runFullTrust`, `broadFileSystemAccess`) require Microsoft approval — common cause of rejected Electron submissions because Electron's built-in capabilities trip the restricted list ([Microsoft Q&A — Unable to certify Electron MSIX](https://learn.microsoft.com/en-us/answers/questions/5786417/unable-to-get-electron-msix-bundle-certified-for-s)).
- WebView2 dependency: most Electron apps don't need WebView2 (they bundle Chromium), but if you do use Microsoft's WebView2 control, the Store handles the runtime dependency declaration.

### Pricing cut

- **0%** for non-gaming apps if you use your own commerce platform (Stripe, Paddle, etc.) — Microsoft does not take a cut.
- **15%** for non-gaming apps using Microsoft's commerce platform `(as of 2026-04)`.
- **12%** for games using Microsoft's commerce platform.

This is meaningfully cheaper than Apple. Microsoft has been the most developer-friendly major store on revenue split since 2018. See [Benefits of distributing your apps via Microsoft Store | Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/why-distribute-through-store).

## Shipping to BOTH (store + outside)

This is the most common modern pattern for paid Electron apps:

| Channel | macOS | Windows |
|---|---|---|
| Outside store | Developer ID + Hardened Runtime + Notarized DMG/ZIP | NSIS or Squirrel + EV/OV signing cert |
| Store | `mas` build + Apple Distribution + App Sandbox | MSIX, Microsoft re-signs |
| Auto-update | `electron-updater` against your server | `electron-updater` against your server |
| In-store update | n/a (App Store handles it) | n/a (Store handles it) |

Same source tree, two artifacts per OS. The build system (electron-builder or Forge) handles the divergence via separate target configurations. Auto-update lives only on the outside builds — never in MAS or Store builds, since the stores handle it themselves and shipping a second updater violates store policies.

The dev-experience cost is real: every release ships across four artifacts (DMG, MAS pkg, NSIS exe, MSIX) plus signing/notarization for each. Budget CI time accordingly. See [C5 Packaging & signing](../core/05-packaging-and-signing.md) for the signing pipeline and [C7 Auto-update](../core/07-auto-update.md) for how to gate updater code by build channel.

## Snapcraft and Flathub (Linux)

Linux store distribution is more fragmented but worth a brief mention:

- **Snapcraft (Snap Store)** — Canonical's commercial store. The [Electron Snapcraft Guide](https://www.electronjs.org/docs/latest/tutorial/snapcraft) covers the build path. Snaps auto-update by default (snapd polls four times per day) and bundle Electron with all dependencies. Centralised: only Canonical's store distributes snaps. `electron-builder` has a `snap` target.
- **Flathub** — community Flatpak repository, the de facto standard. Flatpak runs apps in a sandboxed runtime with permissions declared in the manifest (similar conceptually to MSIX). Decentralised: anyone can host a Flatpak repo, Flathub is just the most-visited one. Forge has a `@electron-forge/maker-flatpak` ([Flatpak | Forge](https://www.electronforge.io/config/makers/flatpak)).
- **AppImage** — not a store. A single-file portable binary. No centralised distribution, no auto-update unless you wire up `electron-updater`. Lowest-friction for users who just want to download and run.

For most Electron apps targeting Linux, shipping to Snap + Flathub gives broad coverage with auto-update handled. Skip if Linux is <5% of your audience — the maintenance cost rarely pays back.

## Cross-links

- [C5 Packaging & signing](../core/05-packaging-and-signing.md) — owns Hardened Runtime, notarization, Windows EV/OV, certificate procurement
- [C6 Cross-platform porting](../core/06-cross-platform-porting.md) — MAS sandbox feature gating, NSIS/MSIX/AppImage trade-offs
- [C7 Auto-update](../core/07-auto-update.md) — gating `electron-updater` by build channel
- [A1 Tauri vs. Electron](01-tauri-vs-electron.md) — Tauri also targets MAS/MSIX with similar trade-offs

## Sources

- [Mac App Store Submission Guide | Electron docs](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide) — entitlements, certificates, productbuild walkthrough `(as of 2026-04)`
- [App Store Small Business Program | Apple Developer](https://developer.apple.com/app-store/small-business-program/) — 15% commission threshold and rules `(as of 2026-04)`
- [Apple Developer — Certificates support](https://developer.apple.com/support/certificates) — Apple Distribution certificate naming
- [Why distribute through Microsoft Store | Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/why-distribute-through-store) — current revenue cut policy `(as of 2026-04)`
- [Packaging Electron apps as MSIX | Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/guides/electron-packaging)
- [MSIX maker | Electron Forge](https://www.electronforge.io/config/makers/msix) — experimental as of Forge v7.10/7.11.x `(as of 2026-04)`
- [AppX target | electron-builder](https://www.electron.build/appx.html) — older format still supported
- [Microsoft Store policies for desktop apps | Microsoft Learn](https://learn.microsoft.com/en-us/windows/uwp/publish/store-policies)
- [Snapcraft Guide for Electron | Electron docs](https://www.electronjs.org/docs/latest/tutorial/snapcraft)
- [Flatpak maker | Electron Forge](https://www.electronforge.io/config/makers/flatpak)
- [Submit an Electron App to the Mac App Store | DoltHub blog (2024-10)](https://www.dolthub.com/blog/2024-10-02-how-to-submit-an-electron-app-to-mac-app-store/) — supplementary; concrete walkthrough
