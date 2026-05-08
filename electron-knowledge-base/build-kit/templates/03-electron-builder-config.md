# Template 3 — `electron-builder.yml` for Win + Mac + Linux

> Status: 🟨 draft v1
> Last updated: 2026-04-30
> Verified against: electron-builder **v26.8.x** (latest stable, 2026-04 — [npm](https://www.npmjs.com/package/electron-builder?activeTab=versions))

## TL;DR

A copy-pasteable [`electron-builder.yml`](https://www.electron.build/configuration.html) that produces:

- **Windows** — NSIS installer (per-user) + portable `.exe`, signed via Azure Artifact Signing (`win.azureSignOptions`) **or** PFX-on-HSM (`win.signtoolOptions`).
- **macOS** — DMG + ZIP, **universal binary** (x64 + arm64) merged via `@electron/universal`, hardened-runtime + notarized via `mac.notarize: true` (using `@electron/notarize` under the hood, App Store Connect API key auth).
- **Linux** — AppImage + `.deb` + `.rpm`.
- **ASAR integrity** — `electronFuses` block enables `EnableEmbeddedAsarIntegrityValidation` + `OnlyLoadAppFromAsar` at package time.
- **Auto-update** — `publish` block targets GitHub Releases; the same `latest.yml`/`latest-mac.yml`/`latest-linux.yml` files are consumed by `electron-updater` (see [Template 4](04-auto-update.md)).

Pair this with [C5 Packaging & signing](../../atlas/core/05-packaging-and-signing.md) (decisions & background) and [C7 Auto-update](../../atlas/core/07-auto-update.md) (runtime side).

---

## When to use this template

- Starting a new Electron project and you've decided on **electron-builder** (vs. Forge — see [C5](../../atlas/core/05-packaging-and-signing.md#packaging-tools)).
- You need to produce signed installers for all three OSes from one config.
- You want the auto-update story wired up from day one.

## When NOT to use this template

- You picked **electron-forge** — use Forge's `forge.config.js` instead (see [C5 mini-example](../../atlas/core/05-packaging-and-signing.md#mini-example--minimal-forge-config-with-notarization--signing-hooks)).
- You only target Mac App Store / Microsoft Store — store distribution has different signing & sandboxing constraints; see [A3 Store distribution](../../atlas/awareness/03-store-distribution.md).
- You're not signing yet (still iterating in dev) — comment out the signing blocks and just produce unsigned builds for testing.

---

## The template — `electron-builder.yml`

Drop this at the repo root. It's the YAML form; the same config can also live under `"build": { ... }` in `package.json` (see [Common Configuration | electron-builder](https://www.electron.build/configuration.html)).

```yaml
# electron-builder.yml — verified against electron-builder v26.8.x (2026-04)
# Docs: https://www.electron.build/configuration.html

appId: com.example.myapp
productName: MyApp
copyright: Copyright © 2026 MyCompany Inc.

# ─── ASAR ────────────────────────────────────────────────
# Default true; spelled out for clarity. See:
# https://www.electron.build/configuration.html
asar: true
asarUnpack:
  # Native modules with .node binaries that can't load from inside ASAR.
  # Add yours here. Empty list is fine if you have no native deps.
  - "**/node_modules/{better-sqlite3,@some/native-module}/**/*"

# ─── Electron Fuses (ASAR integrity + node CLI lockdown) ─
# https://www.electron.build/tutorials/adding-electron-fuses.html
# Stable in Electron 39+; see C3 Security and atlas/core/05-packaging-and-signing.md.
electronFuses:
  runAsNode: false
  enableCookieEncryption: true
  enableNodeOptionsEnvironmentVariable: false
  enableNodeCliInspectArguments: false
  enableEmbeddedAsarIntegrityValidation: true
  onlyLoadAppFromAsar: true
  loadBrowserProcessSpecificV8Snapshot: false
  grantFileProtocolExtraPrivileges: false

# ─── Directory layout ────────────────────────────────────
directories:
  output: dist                  # where installers land
  buildResources: build         # icons, entitlements.mac.plist, etc.

# ─── Files included in app.asar ──────────────────────────
# Tweak for your bundler's output. This assumes the renderer build
# emits to "out/" and main/preload also live there post-bundle.
files:
  - "out/**/*"
  - "package.json"
  - "!**/node_modules/**/{*.md,*.test.*,*.spec.*,*.map,*.ts}"
  - "!**/node_modules/**/{tsconfig*,*.flow,*.tsbuildinfo}"
  - "!**/node_modules/**/.bin"

# ════════════════════════════════════════════════════════════
# macOS
# ════════════════════════════════════════════════════════════
# https://www.electron.build/electron-builder.Interface.MacConfiguration.html
mac:
  category: public.app-category.productivity
  # Universal binary — Builder invokes @electron/universal for you.
  # See https://www.electronjs.org/docs/latest/tutorial/mac-universal-binary
  target:
    - target: dmg
      arch: [x64, arm64]
    - target: zip                      # Squirrel.Mac auto-update needs ZIP
      arch: [x64, arm64]

  # Developer ID signing identity (CN of your Apple Developer ID Application cert)
  identity: "Developer ID Application: MyCompany Inc. (TEAMID12345)"

  # Hardened runtime — required by Apple for notarization
  hardenedRuntime: true
  gatekeeperAssess: false              # don't run spctl during build
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist

  # Notarization via @electron/notarize. Trigger by env vars (one of):
  #   APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER  (recommended)
  #   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID  (legacy)
  # Detection rule: https://www.electron.build/electron-builder.Interface.MacConfiguration.html
  notarize: true

  # Optional: prevent Builder from signing during cross-platform builds
  # signIgnore: []

dmg:
  sign: true                            # sign the DMG itself, not just the .app
  writeUpdateInfo: false                # ZIP carries the update metadata

# ════════════════════════════════════════════════════════════
# Windows
# ════════════════════════════════════════════════════════════
# https://www.electron.build/electron-builder.Interface.WindowsConfiguration.html
win:
  target:
    - target: nsis
      arch: [x64, arm64]
    - target: portable
      arch: [x64]
  publisherName: MyCompany Inc.

  # ── Pick ONE of the two signing blocks below ──
  #
  # OPTION A — Azure Artifact Signing (formerly Azure Trusted Signing)
  # https://www.electron.build/code-signing-win.html#azure-trusted-signing
  # https://learn.microsoft.com/en-us/azure/trusted-signing/
  # Auth via env: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
  # (or DefaultAzureCredential chain). Available in US/Canada/EU/UK orgs
  # with 3+ year history (as of 2026-04).
  azureSignOptions:
    publisherName: "MyCompany Inc."     # MUST match cert CN exactly
    endpoint: "https://eus.codesigning.azure.net/"
    certificateProfileName: "myapp-cert-profile"
    codeSigningAccountName: "mycompany-signing-account"
    # Extra args forwarded to Invoke-TrustedSigning:
    # TimestampRfc3161: "http://timestamp.acs.microsoft.com"
    # TimestampDigest: "SHA256"

  # OPTION B — local PFX / USB token via signtool
  # Comment out azureSignOptions above if using this.
  # signtoolOptions:
  #   publisherName: "MyCompany Inc."
  #   certificateFile: ${env.WINDOWS_CERT_FILE}
  #   certificatePassword: ${env.WINDOWS_CERT_PASSWORD}
  #   signingHashAlgorithms: [sha256]
  #   rfc3161TimeStampServer: http://timestamp.digicert.com
  #   sign: ./scripts/sign.js  # for HSM/cloud signing custom hooks

# NSIS = default Windows installer in electron-builder
# https://www.electron.build/configuration/nsis
nsis:
  oneClick: false                      # show installer UI, not silent
  perMachine: false                    # per-user (no admin required)
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: MyApp
  uninstallDisplayName: MyApp
  artifactName: ${productName}-Setup-${version}-${arch}.${ext}

# ════════════════════════════════════════════════════════════
# Linux
# ════════════════════════════════════════════════════════════
# https://www.electron.build/configuration/linux
linux:
  category: Office
  target:
    - target: AppImage
      arch: [x64, arm64]
    - target: deb
      arch: [x64, arm64]
    - target: rpm
      arch: [x64]
  maintainer: ops@example.com
  vendor: MyCompany Inc.
  synopsis: Short one-line description of MyApp
  description: |
    A longer description shown in package managers.
  desktop:
    StartupWMClass: MyApp                  # avoids second tray icon under Wayland
    MimeType: x-scheme-handler/myapp;      # for deep-link protocol handler

# ════════════════════════════════════════════════════════════
# Auto-update — GitHub Releases
# ════════════════════════════════════════════════════════════
# https://www.electron.build/configuration/publish#githuboptions
# In v27+ implicit publishing is disabled; specify --publish always or
# pass via CLI in CI. (https://www.electron.build/publish.html)
publish:
  - provider: github
    owner: my-github-org
    repo: my-repo
    releaseType: release                 # or 'draft' / 'prerelease'
    # vPrefixedTagName: true
```

---

## Companion file — `build/entitlements.mac.plist`

Minimum hardened-runtime entitlements for a typical Electron app (V8 JIT + helper signing). Source: [Apple — Hardened Runtime Entitlements](https://developer.apple.com/documentation/bundleresources/entitlements/com_apple_security_cs).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- V8 JITs JS; required for Electron renderers -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <!-- Allow loading the Electron Helper bundles signed under Developer ID -->
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <!-- Outbound network (talk to your Railway backend, fetch updates) -->
  <key>com.apple.security.network.client</key>
  <true/>
  <!-- If your app accepts inbound connections (rare for Electron) -->
  <!--
  <key>com.apple.security.network.server</key>
  <true/>
  -->
</dict>
</plist>
```

If you bundle native modules that ship dylibs from third parties, you may also need `com.apple.security.cs.allow-dyld-environment-variables`. Add only what you need; each loosened entitlement is a hardened-runtime regression. See [Apple Hardened Runtime](https://developer.apple.com/documentation/security/hardened_runtime).

---

## Companion file — `scripts/sign.js` (custom Windows signing hook)

Use this only if you're going through a cloud-HSM provider that needs a custom invocation (DigiCert KeyLocker, SSL.com eSigner, Sectigo Signing Service). For Azure Artifact Signing, prefer the `win.azureSignOptions` block above instead.

```js
// scripts/sign.js — custom signing hook for win.signtoolOptions.sign
// electron-builder will call this for every Windows binary it produces.
// https://www.electron.build/code-signing-win.html#using-with-aws-cloudhsm-or-google-cloud-hsm
exports.default = async function (configuration) {
  const { execFileSync } = require('node:child_process');
  // configuration.path = absolute path to the .exe to sign
  // Example: invoke DigiCert smctl, SSL.com CodeSignTool, or osslsigncode.
  execFileSync('smctl', [
    'sign',
    '--keypair-alias', process.env.SM_KEYPAIR_ALIAS,
    '--input', configuration.path,
  ], { stdio: 'inherit' });
};
```

`osslsigncode` is the preferred choice on Linux GitHub Actions runners signing Windows binaries via PKCS#11 against a remote HSM. See [`osslsigncode`](https://github.com/mtrojnar/osslsigncode) and [C5 § Cloud signing services](../../atlas/core/05-packaging-and-signing.md#cloud-signing-services--managed-hsm-alternatives).

---

## Required environment variables

Set these in CI secrets (GitHub Actions: repo / org secrets; never check in):

| Variable | Purpose | Used by |
|---|---|---|
| `APPLE_API_KEY` | Path to App Store Connect `.p8` API key file | macOS notarization |
| `APPLE_API_KEY_ID` | API key ID (Key ID column in App Store Connect) | macOS notarization |
| `APPLE_API_ISSUER` | Issuer ID (UUID at top of API Keys page) | macOS notarization |
| `CSC_LINK` | Path or HTTPS URL to macOS Developer ID `.p12` (or use keychain) | macOS signing |
| `CSC_KEY_PASSWORD` | Password for the macOS `.p12` | macOS signing |
| `WINDOWS_CERT_FILE` | Path to `.pfx` (only if using `signtoolOptions` Option B) | Windows signing |
| `WINDOWS_CERT_PASSWORD` | Password for the `.pfx` | Windows signing |
| `AZURE_TENANT_ID` | Azure tenant for Artifact Signing | Windows (Option A) |
| `AZURE_CLIENT_ID` | Service principal client ID | Windows (Option A) |
| `AZURE_CLIENT_SECRET` | Service principal secret (or use OIDC) | Windows (Option A) |
| `GH_TOKEN` | GitHub PAT with `repo` scope (or `GITHUB_TOKEN` in Actions) | publishing to GitHub Releases |

For the macOS pair, prefer **App Store Connect API key** (`APPLE_API_*`) over `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` — it survives 2FA, scopes per role, and is what Apple steers CI users toward in 2026 (see [@electron/notarize](https://github.com/electron/notarize)).

---

## CI snippet — GitHub Actions

A minimal matrix that builds + signs + publishes on tag push. Three runners (one per OS) so each platform signs natively. Adapt to your project structure.

```yaml
# .github/workflows/release.yml
name: release
on:
  push:
    tags: ['v*']
jobs:
  release:
    strategy:
      matrix:
        os: [macos-14, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build           # your bundler step (Vite / Webpack / etc.)

      # macOS-only: import Developer ID cert into a temp keychain
      - if: matrix.os == 'macos-14'
        uses: apple-actions/import-codesign-certs@v3
        with:
          p12-file-base64: ${{ secrets.CSC_LINK_BASE64 }}
          p12-password: ${{ secrets.CSC_KEY_PASSWORD }}

      - run: npx electron-builder --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # macOS notarize
          APPLE_API_KEY: ${{ secrets.APPLE_API_KEY }}
          APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
          APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
          # Windows Azure Artifact Signing
          AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
          AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
          AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
```

Notes:

- `--publish always` is the **explicit** form. Implicit publishing is **deprecated and removed in v27** — pass it explicitly or set the `publish` block (which we do above) ([Publish | electron-builder](https://www.electron.build/publish.html)) `(as of 2026-04)`.
- For Linux, GPG signing of `.deb`/`.rpm` is optional; most Electron shops skip it (see [C5 § Linux](../../atlas/core/05-packaging-and-signing.md#linux)).
- An off-the-shelf alternative: [`electron-builder-action`](https://github.com/marketplace/actions/electron-builder-action) wraps the above into one step.

---

## Notes & caveats

- **`notarize: true` is the modern syntax** (electron-builder ≥ v24 on macOS targets). Builder dispatches to [`@electron/notarize`](https://github.com/electron/notarize) under the hood and picks credentials from env vars listed above. Older blogs show `afterSign` hooks — those still work but are no longer required ([electron-builder MacConfiguration](https://www.electron.build/electron-builder.Interface.MacConfiguration.html)) `(as of 2026-04)`.
- **Universal binaries**: `arch: [x64, arm64]` on a single `target` triggers `@electron/universal` to merge x64 + arm64 slices ([Universal binaries | Electron docs](https://www.electronjs.org/docs/latest/tutorial/mac-universal-binary)). Builder caches both arch builds before merging — disk usage is ~2x during build.
- **Squirrel.Windows is *not* this template's default**. electron-builder uses **NSIS** by default for Windows ([NSIS | electron-builder](https://www.electron.build/configuration/nsis)). Squirrel.Windows is **deprecated *in electron-builder*** but still default in **Forge** (`maker-squirrel`); the upstream [Squirrel/Squirrel.Windows](https://github.com/Squirrel/Squirrel.Windows) project is unarchived. See [C5 § Squirrel.Windows nuance](../../atlas/core/05-packaging-and-signing.md#installer-choice--nsis-vs-msi-vs-msix-vs-squirrelwindows) `(as of 2026-04)`.
- **`electronFuses` block** is the Builder-native way to flip fuses at package time without an external script ([Configuring Electron Fuses | electron-builder](https://www.electron.build/tutorials/adding-electron-fuses.html)). Forge/Packager wire ASAR integrity automatically when `asar: true`; **electron-builder requires you to set the fuses explicitly** — easy to miss. Without these, ASAR integrity is *not* enforced and tampering goes undetected. `(as of 2026-04)`
- **Known limitation**: ASAR files in `extraResources` are not included in integrity calculations ([electron-builder #8660](https://github.com/electron-userland/electron-builder/issues/8660)). Keep your code inside `app.asar`, not extra-resources, if integrity matters.
- **`asarUnpack` cost**: every entry there is a file *outside* `app.asar` — it doesn't get integrity-checked. Add only native modules that genuinely can't run from inside ASAR. See [C3 Security § ASAR integrity](../../atlas/core/03-security.md).
- **Cert signing materials change rapidly**. The CA/B Forum **460-day max validity** rule landed **March 1, 2026** and the **EV instant-SmartScreen-trust** removal in March 2024 reshape Windows planning. Verify cert validity at issue time — see [C5 § Windows code signing 2024-2026 timeline](../../atlas/core/05-packaging-and-signing.md#windows-code-signing--2024-2026-timeline) `(as of 2026-04)`.
- **Two-package.json layout**: if you split `package.json` between root and `app/`, set `directories.app: "app"` and verify v26.4+ which fixed signing for that layout ([electron-builder releases](https://github.com/electron-userland/electron-builder/releases)) `(as of 2026-04)`.
- **Forge equivalent**: if you'd rather use Forge, the same config concepts map to `forge.config.js` (`packagerConfig.osxSign`, `osxNotarize`, `FusesPlugin`, `makers`, `publishers`). See [C5 mini-example](../../atlas/core/05-packaging-and-signing.md#mini-example--minimal-forge-config-with-notarization--signing-hooks).

---

## Cross-links

- [C5 — Packaging & code signing](../../atlas/core/05-packaging-and-signing.md) — the why behind every block here.
- [C7 — Auto-update](../../atlas/core/07-auto-update.md) — runtime side; this template's `publish` block produces the metadata `electron-updater` reads.
- [C3 — Security § Fuses & ASAR integrity](../../atlas/core/03-security.md) — what the `electronFuses` block defends against.
- [C6 — Cross-platform porting](../../atlas/core/06-cross-platform-porting.md) — installer-format-specific gotchas (Wayland in v38+, MAS App Sandbox, etc.).
- [Template 4 — Auto-update](04-auto-update.md) — the renderer/main-process integration that consumes `latest*.yml`.
- [A3 — Store distribution](../../atlas/awareness/03-store-distribution.md) — alternative path (MAS / MS Store) with different signing constraints.

---

## Sources

- [Common Configuration | electron-builder](https://www.electron.build/configuration.html) `(as of 2026-04 — v26.8.x)`
- [MacConfiguration interface | electron-builder](https://www.electron.build/electron-builder.Interface.MacConfiguration.html) `(as of 2026-04 — `notarize` field)`
- [WindowsConfiguration interface | electron-builder](https://www.electron.build/electron-builder.Interface.WindowsConfiguration.html) `(as of 2026-04)`
- [Linux configuration | electron-builder](https://www.electron.build/configuration/linux) `(as of 2026-04)`
- [NSIS configuration | electron-builder](https://www.electron.build/configuration/nsis) `(as of 2026-04)`
- [Configuring Electron Fuses | electron-builder](https://www.electron.build/tutorials/adding-electron-fuses.html) `(as of 2026-04)`
- [Code Signing on Windows | electron-builder](https://www.electron.build/code-signing-win.html) `(as of 2026-04)`
- [Publish | electron-builder](https://www.electron.build/publish.html) `(as of 2026-04 — implicit publishing removed in v27)`
- [Auto Update | electron-builder](https://www.electron.build/auto-update.html) `(as of 2026-04)`
- [@electron/notarize | GitHub](https://github.com/electron/notarize) `(as of 2026-04 — v3.1.1)`
- [@electron/universal | GitHub](https://github.com/electron/universal) `(as of 2026-04 — v3.0.4)`
- [Universal macOS binaries | Electron docs](https://www.electronjs.org/docs/latest/tutorial/mac-universal-binary) `(as of 2026-04)`
- [ASAR Integrity | Electron docs](https://www.electronjs.org/docs/latest/tutorial/asar-integrity) `(as of 2026-04 — stable in Electron 39+)`
- [Code Signing | Electron docs](https://www.electronjs.org/docs/latest/tutorial/code-signing) `(as of 2026-04)`
- [Hardened Runtime Entitlements | Apple Developer](https://developer.apple.com/documentation/bundleresources/entitlements/com_apple_security_cs) `(as of 2026-04)`
- [Notarizing macOS software before distribution | Apple Developer](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) `(as of 2026-04)`
- [Microsoft Trusted Signing / Azure Artifact Signing | Microsoft Learn](https://learn.microsoft.com/en-us/azure/trusted-signing/) `(as of 2026-04 — rebranded Oct 2025)`
- [CA/Browser Forum Code Signing Baseline Requirements](https://cabforum.org/working-groups/code-signing/requirements/) `(as of 2026-04 — 460-day rule effective 2026-03-01)`
- [Squirrel.Windows | upstream GitHub](https://github.com/Squirrel/Squirrel.Windows) `(as of 2026-04 — unarchived)`
- [osslsigncode | GitHub](https://github.com/mtrojnar/osslsigncode) `(as of 2026-04)`
- [electron-builder GitHub releases](https://github.com/electron-userland/electron-builder/releases) `(as of 2026-04 — v26.8.x)`
