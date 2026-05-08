# C3. Security — official checklist, fuses, ASAR integrity, CVE catalog

> Status: 🟨 draft v1 🔁 living
> Last updated: 2026-04-30

## TL;DR

Electron's security model is the three-process boundary plus a **17-point checklist** ([electronjs.org](https://www.electronjs.org/docs/latest/tutorial/security)) — context isolation on, node integration off, sandbox on, CSP set, navigation gated, permissions handled. Modern defaults (v12+ context isolation, v20+ sandbox, V8 memory cage in v21+) make a *fresh* Electron app secure; vulnerabilities almost always come from regressions a developer added on purpose. Layer on **Fuses** (compile-time toggles enforced by the binary) and **ASAR integrity** (signed manifest of file hashes in v39+) to defend against post-install tampering. Keep an eye on the GHSA feed — the ASAR integrity story alone has produced four advisories since 2024 (CVE-2023-44402, CVE-2024-46992, CVE-2025-55305, plus follow-ups). Don't disable the defaults; if you must, document why.

## When to apply

- New Electron project — apply the full checklist on day one. Defaults already do most of the work; your job is mostly *not regressing them*.
- Any time you add a `BrowserWindow`, `WebContentsView`, or `<webview>` tag — re-check `webPreferences`.
- Loading any third-party content (embedded docs, OAuth provider UIs, marketing iframes) — strict CSP + navigation handlers.
- Quarterly review (this page is 🔁 living): check the [Electron Security Advisories feed](https://github.com/electron/electron/security/advisories) and bump if your minimum supported version is now vulnerable.

## When NOT to apply / common false-economies

- "Just disable contextIsolation for this one window so my legacy code works" — no. Move the legacy code to a preload-exposed API. See [C2 Process model & IPC](02-process-model-and-ipc.md).
- "I'll set `webSecurity: false` for development convenience" — production builds will leak that. Use a real dev-mode flag tied to `app.isPackaged` or NODE_ENV, never a per-window toggle that ships.
- "We don't need ASAR integrity, the OS code-signing handles tampering" — only on macOS where Apple's hardened runtime + notarization enforce the signed bundle. On Windows, code signing covers the executable but not the unpacked app resources; ASAR integrity is the missing piece.
- "Our renderer never loads remote content, so CSP doesn't matter" — XSS in your own bundle (a markdown renderer, a chart library that `eval`s user input, a transitive dep) is the real threat.

## Anatomy

### 1. Threat model — what an attacker actually targets

An Electron app is "Chromium plus Node.js plus your code in one signed binary." The attack surface inherits from all three layers ([Electron security tutorial](https://www.electronjs.org/docs/latest/tutorial/security)):

| Surface | Concrete attack | Mitigation |
|---|---|---|
| **Arbitrary JS in renderer** | XSS in your own bundle, prompt-injection from rendered LLM content, malicious markdown | Context isolation + sandbox + CSP. XSS becomes "JS that can't reach Node." |
| **Untrusted page navigation** | User clicks a link in an email rendered in your app, lands on attacker.com inside your `BrowserWindow` | `will-navigate` handler, `setWindowOpenHandler` returning `{ action: 'deny' }`, route external links to `shell.openExternal` after URL allowlist check |
| **Preload-script trust boundary** | Renderer convinces preload to call privileged Node APIs by passing crafted arguments | Validate every IPC payload in main, type-check at the boundary, never expose `ipcRenderer` whole — wrap every channel |
| **Native APIs from main** | RCE via `shell.openExternal(userInput)`, command injection in `child_process.exec` | Allowlist URL schemes (only `https:` and `mailto:`), use `execFile` with array args, never string-concat user input |
| **Supply chain (npm)** | Typo-squatted dep, compromised maintainer, malicious post-install script | Lockfile, `npm audit`, dependency review on PRs, `npm ci --ignore-scripts` for production builds where possible |
| **Post-install tampering** | Attacker with filesystem access modifies `app.asar` to inject code | ASAR integrity fuse + code signing (see §4–5 below) |
| **Privilege escalation via deep links** | `myapp://` URL crafted to invoke unsafe code path | Validate the URL in `second-instance`/`open-url` handlers; treat as untrusted input |
| **Native modules** | A `.node` binary loads code outside the V8 sandbox | V8 memory cage forces native modules to use sandboxed allocators (Electron 21+) |

Source: [Security | Electron docs](https://www.electronjs.org/docs/latest/tutorial/security); attack catalog from [Penetration Testing of Electron-based Applications | Deepstrike](https://deepstrike.io/blog/penetration-testing-of-electron-based-applications).

### 2. The official checklist — what every BrowserWindow needs `(as of 2026-04)`

Electron's [17-point security checklist](https://www.electronjs.org/docs/latest/tutorial/security) is the canonical structure. The defaults in modern Electron already cover most points — the work is *not regressing*. Items in **bold** are mandatory; the rest are situational.

1. **Only load secure content** — `https:` everywhere except `file:` for your bundled app. No `http:` for production. Enforced via CSP `connect-src` and navigation handlers.
2. **Do not enable Node.js integration for remote content** — `nodeIntegration: false` is the default; never override for a window that can navigate to remote.
3. **Enable context isolation** — `contextIsolation: true`, default since Electron 12 (Mar 2021). [Context Isolation docs](https://www.electronjs.org/docs/latest/tutorial/context-isolation).
4. **Enable process sandboxing** — `sandbox: true`, default for renderers since v20 (Aug 2022). Preloads also sandboxed by default *unless* you explicitly set `sandbox: false`. See [Process Sandboxing | Electron docs](https://www.electronjs.org/docs/latest/tutorial/sandbox).
5. **Set a Content Security Policy** — strict CSP on every HTML document. Minimum: `default-src 'self'; script-src 'self'; connect-src 'self' https://your-api.example.com; style-src 'self' 'unsafe-inline'`. Avoid `'unsafe-eval'` and inline scripts. Set via meta tag *and* `session.webRequest.onHeadersReceived` so a compromised page can't strip the meta.
6. **Do not set `allowRunningInsecureContent`** — leave at `false` (default).
7. **Do not enable experimental features** — `experimentalFeatures: false` (default).
8. **Do not use `enableBlinkFeatures`** unless you know exactly what you're enabling.
9. **`<webview>`: do not allow `allowpopups`** — the tag is a security tarpit. Prefer [`WebContentsView`](https://www.electronjs.org/blog/migrate-to-webcontentsview) (BrowserView is deprecated since Electron 30).
10. **Verify all WebView options before creation** — listen for `will-attach-webview` and override settings.
11. **Disable or limit navigation** — handle `will-navigate` on every webContents; deny everything except your own origin.
12. **Disable or limit creation of new windows** — `webContents.setWindowOpenHandler` returning `{ action: 'deny' }` for unknown URLs, or routing them to `shell.openExternal` after validation.
13. **Do not use `openExternal` with untrusted content** — allowlist URL schemes; sanitize/parse the URL with `new URL()` before passing.
14. **Use a current version of Electron** — supported lines as of 2026-04 are typically the latest 3 majors plus the previous LTS-equivalent; check [Electron release schedule](https://releases.electronjs.org/schedule).
15. **Validate the sender of all IPC messages** — in `ipcMain.handle`, check `event.senderFrame` against expected origins. Per [breach-to-barrier](https://www.electronjs.org/blog/breach-to-barrier), don't trust that "renderer" means "your renderer."
16. **Avoid usage of the `file://` protocol for remote content** — covered by #1; mentioned separately because devs sometimes do it for "dev mode."
17. **Check which fuses are enabled** — see §3 below.

The default `BrowserWindow` constructor in Electron 41 (Apr 2026) is secure-by-default for points 2–4. Your `webPreferences` block should rarely need to *enable* anything; it should mostly enable the preload script and otherwise be empty.

```js
// Secure defaults you should NOT change
new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    // contextIsolation: true,    // default
    // nodeIntegration: false,    // default
    // sandbox: true,             // default
    // webSecurity: true,         // default
  },
});
```

### 3. Fuses — compile-time toggles enforced by the binary

[Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses) are flags baked into the Electron binary at packaging time. Once flipped and the app is signed, the OS-level signature protects the fuse state — a tampering attacker who flips a fuse breaks the signature and the app refuses to launch (on platforms that enforce signing).

Set them via `@electron/fuses` in your packaging script. Electron 41 ships these as the relevant set `(as of 2026-04)`:

| Fuse | Default | Recommendation | What it does |
|---|---|---|---|
| `RunAsNode` | enabled | **disable for production** | Lets the Electron binary run as plain Node when invoked with `ELECTRON_RUN_AS_NODE=1`. Useful for tooling, dangerous for shipped apps — an attacker can use your signed binary as a generic Node interpreter. |
| `EnableCookieEncryption` | disabled | **enable** | Encrypts the cookie store at rest using OS keychain. |
| `EnableNodeOptions` | enabled | **disable for production** | Honors the `NODE_OPTIONS` env var. Disable so an attacker can't inject `--inspect` or `--require ./malicious.js` via env. |
| `EnableNodeCliInspectArguments` | enabled | **disable for production** | Honors `--inspect`/`--inspect-brk` CLI flags. Same reason as above. |
| `EnableEmbeddedAsarIntegrityValidation` | disabled (opt-in until v41 default story stabilizes) | **enable** | The integrity fuse — verifies app.asar against an embedded hash manifest at every load. See §4. |
| `OnlyLoadAppFromAsar` | disabled | **enable** | Refuses to load the app code from anywhere except `app.asar`, which closes the bypass of "delete app.asar, point at unpacked source." |
| `LoadBrowserProcessSpecificV8Snapshot` | disabled | enable if you ship custom snapshots | Required for separate browser-process / renderer V8 snapshots. Performance-related; security-relevant because the snapshot is signed. |
| `GrantFileProtocolExtraPrivileges` | enabled (legacy) | **disable** | Legacy Chromium behavior that gives `file://` URLs more powers than `https://`. New apps should disable. |

Each fuse is a single bit in a magic block inside the Electron binary; flipping is fast, signing the result is the slow part. Build pipelines wire `@electron/fuses` into the `afterPack` hook of electron-builder or the `packageAfterCopy` hook of Forge ([electron-builder fuse docs](https://www.electron.build/tutorials/adding-electron-fuses.html)).

### 4. ASAR integrity — signed manifest of file hashes

[ASAR Integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity) is the answer to *"my app is signed, but what stops an attacker from modifying app.asar after install?"* The mechanism:

1. `@electron/asar` v3.2+ (and v4.1+ with [digest embedding](https://github.com/electron/asar)) generates a hash manifest while building the archive.
2. `@electron/packager` / `electron-builder` / Forge inserts the root hash into the binary's resource section (Mach-O `__TEXT,__electron_asar` on macOS, PE resource on Windows).
3. At app launch, when the `EnableEmbeddedAsarIntegrityValidation` fuse is on, Electron verifies every file read out of app.asar against the manifest, and the manifest against the embedded root hash.
4. The embedded hash is part of the signed binary, so OS code-signing protects it.

Required for the protection to actually work:

- **macOS**: app must be Developer-ID-signed with hardened runtime — otherwise the embedded hash isn't trusted as the apple signature didn't validate the binary integrity. The fuse only signs the chain back to Apple's gatekeeper enforcing it.
- **Windows**: app must be code-signed (OV or EV); see [C5 Packaging & signing](05-packaging-and-signing.md) for the 2024-2026 signing rules.
- **Linux**: no equivalent OS-level signature — ASAR integrity provides defense-in-depth but a local attacker with write access to the install directory can also rewrite the binary itself.

Combine `EnableEmbeddedAsarIntegrityValidation` with `OnlyLoadAppFromAsar` to close the obvious bypass ("delete app.asar, drop unpacked code beside it"). This is the canonical hardening combo.

The story has had several CVEs on the fuse side — see the table in §6. Each was a clever bypass (filetype confusion, V8 snapshot path, etc.), all patched.

### 5. V8 Memory Cage — sandboxed pointers

Default since Electron 21 ([V8 Memory Cage | Electron blog](https://www.electronjs.org/blog/v8-memory-cage)). Briefly: V8 now treats all heap pointers as offsets into a fixed virtual-address region ("the cage"), so a memory-corruption bug that lets an attacker write a wild pointer can no longer reach arbitrary process memory. The relevant compatibility consequence is that **native Node modules holding raw pointers outside the cage break** — they have to be ported to use sandbox-aware allocators (e.g., `external pointer table`). If you ship native modules, audit them; if you don't, this is one paragraph and you can move on.

### 6. CVE catalog — recent and notable advisories

These are the security advisories worth knowing as of 2026-04. The Electron team publishes via [GitHub Security Advisories](https://github.com/electron/electron/security/advisories) and assigns CVEs through GHSA. **Two of these are ASAR-integrity-related but separate vulnerabilities — do NOT conflate them.**

| CVE | GHSA | Title | Affected | Fixed in | Source |
|---|---|---|---|---|---|
| **CVE-2025-55305** | **GHSA-vmqv-hx8q-j7mg** | ASAR Integrity Bypass via *resource modification* (V8 snapshot integrity not covered by the integrity fuse) | All releases prior to fixes; only apps with `EnableEmbeddedAsarIntegrityValidation` + `OnlyLoadAppFromAsar` fuses on are protectable | **35.7.5 / 36.8.1 / 37.3.1 / 38.0.0-beta.6** | [GHSA-vmqv-hx8q-j7mg](https://github.com/electron/electron/security/advisories/GHSA-vmqv-hx8q-j7mg) |
| **CVE-2023-44402** | **GHSA-7m48-wc93-9g85** | ASAR Integrity bypass via *filetype confusion* (macOS-only) | Electron < 22.3.24 (and equivalent points in 23/24/25/26 lines) | **22.3.24 and later supported lines** | [GHSA-7m48-wc93-9g85](https://github.com/electron/electron/security/advisories/GHSA-7m48-wc93-9g85) |
| CVE-2024-46992 | GHSA-xw5q-g62x-2qjc | ASAR Integrity bypass via content modification (Windows-only attack path) | Electron >= 30.0.0-alpha.1 < 30.0.5; >= 31.0.0-alpha.1 < 31.0.0-beta.1 | 30.0.5 / 31.0.0-beta.1 | [GHSA-xw5q-g62x-2qjc](https://github.com/electron/electron/security/advisories/GHSA-xw5q-g62x-2qjc) |
| CVE-2024-46993 | GHSA-6r2x-8pq8-9489 | Heap Buffer Overflow in `NativeImage::CreateFromPath` | See advisory for affected ranges | Per advisory | [GHSA-6r2x-8pq8-9489](https://github.com/electron/electron/security/advisories/GHSA-6r2x-8pq8-9489) |
| **CVE-2026-34776** | **GHSA-3c8v-cfp5-9885** | Out-of-bounds read in second-instance IPC on macOS and Linux (when `app.requestSingleInstanceLock()` is used) | < 38.8.6; 39.x < 39.8.1; 40.x < 40.8.1; 41.0.0-alpha.x | **38.8.6 / 39.8.1 / 40.8.1 / 41.0.0** | [GitLab GLAD CVE-2026-34776](https://advisories.gitlab.com/pkg/npm/electron/CVE-2026-34776/) |
| **CVE-2026-34778** | **GHSA-xj5x-m3f3-5x3h** | Service worker can spoof `executeJavaScript` IPC replies (apps using SW + relying on `webContents.executeJavaScript()` results for security decisions) | < 38.8.6; 39.x < 39.8.1; 40.x < 40.8.1; 41.0.0-alpha.x | **38.8.6 / 39.8.1 / 40.8.1 / 41.0.0** | [GitLab GLAD CVE-2026-34778](https://advisories.gitlab.com/pkg/npm/electron/CVE-2026-34778/) |
| (historical, illustrative) | GHSA-p7v2-p9m8-qqg7 | Context isolation bypass via nested unserializable return value | older lines | patched | [GHSA-p7v2-p9m8-qqg7](https://github.com/electron/electron/security/advisories/GHSA-p7v2-p9m8-qqg7) |
| (historical) | GHSA-mq8j-3h7h-p8g7 | Compromised child renderer could obtain IPC access without `nodeIntegrationInSubFrames` | older lines | patched | [GHSA-mq8j-3h7h-p8g7](https://github.com/electron/electron/security/advisories/GHSA-mq8j-3h7h-p8g7) |

Reading the advisory feed: each advisory tells you the *exact* affected version ranges and the patched releases — pin your dep accordingly. The Electron security team backports fixes to the latest 3 supported majors plus the LTS-equivalent, so on a current line you usually get a patch release within days.

### 7. Common app-level vulnerabilities (your code, not Electron's)

Almost every real-world Electron RCE comes from one of these patterns:

- **XSS-to-RCE via `nodeIntegration: true`** — the original Electron security horror story. Fixed in modern apps because the default is off, but legacy code that flipped it for "convenience" still ships with this hole. Audit `webPreferences` blocks for `nodeIntegration: true` and remove.
- **Open redirects via `shell.openExternal(userInput)`** — passing a user-controlled URL launches the system browser; on macOS, custom URL handlers for installed apps can produce RCE chains. Always parse with `new URL()`, allowlist `protocol === 'https:' || protocol === 'mailto:'`, and reject otherwise. ([Penetration Testing of Electron-based Applications | Deepstrike](https://deepstrike.io/blog/penetration-testing-of-electron-based-applications))
- **`webContents.executeJavaScript()` with renderer-controlled strings** — the renderer crafts a string, main runs it in another window with full main-world access. If you must inject script, use `executeJavaScriptInIsolatedWorld()` and template-literal safe values, never user input.
- **Loading untrusted origin in a `BrowserWindow` without a strict `will-navigate` handler** — a single bad redirect lands attacker.com in your app's chrome, with whatever powers the renderer has.
- **`<webview>` tag with `allowpopups`, or worse, `disablewebsecurity`** — combine and you have a remote-controlled iframe with no CSP enforcement. Migrate to `WebContentsView` and audit attached webPreferences.
- **Logging tokens to `electron-log` files** — `electron-log` writes to disk in the app's user-data directory; tokens that hit logs are now sitting in a backup-able file. Never log auth headers, JWTs, or refresh tokens. See [C9 Backend connectivity](09-backend-connectivity.md) for `safeStorage` patterns.
- **Trusting `event.sender` without validation** — main-process IPC handlers should validate `event.senderFrame.url` matches an expected origin before doing privileged work. Per [Electron breach-to-barrier post](https://www.electronjs.org/blog/breach-to-barrier).
- **Hardcoded API keys in renderer bundles** — `webpack` / `vite` bundles ship verbatim. Anything in `process.env.MY_KEY` accessed from renderer code ends up in the final asar. Move secrets to main, expose only the *operations* via IPC.

### 8. Anti-patterns — what to never do

- ❌ `contextIsolation: false` — defeats the entire trust boundary.
- ❌ `nodeIntegration: true` for any window that can navigate. Your "internal" tool will eventually load a help link.
- ❌ `sandbox: false` for production renderers. Sometimes preloads need `sandbox: false` to use Node APIs in the preload itself, but never the renderer.
- ❌ `webSecurity: false` — disables same-origin policy, CORS, mixed-content blocking.
- ❌ Hardcoding secrets in source — bundlers will inline them.
- ❌ Raw `shell.openExternal(userInput)` with no scheme/host validation.
- ❌ `webContents.executeJavaScript(rendererSuppliedString)` for non-test code.
- ❌ Leaving `RunAsNode` / `EnableNodeOptions` / `EnableNodeCliInspectArguments` fuses enabled in production builds.
- ❌ Skipping ASAR integrity because "we trust our users." Defense in depth.

### 9. Tools

- **[`@electron/fuses`](https://github.com/electron/fuses)** — official package for flipping fuses post-build.
- **[`electron-secure-defaults`](https://github.com/1password/electron-secure-defaults/)** (1Password) — opinionated starter that sets every checklist item correctly out of the box; reading it is a useful sanity check on your own config. See also [CS4 1Password](../case-studies/04-1password.md).
- **[`electron-hardener`](https://github.com/1Password/electron-hardener)** (1Password) — Rust-side hardening helpers for Electron apps that ship a Rust core.
- **[`electronegativity`](https://github.com/doyensec/electronegativity)** (Doyensec) — CLI scanner that statically detects insecure patterns (nodeIntegration, webview misconfig, missing CSP, etc.). Run in CI on every PR.
- **CSP evaluator** — Google's web tool, plus electronegativity's CSP rules, catch most loose CSPs.
- **[Electron Security Advisories feed](https://github.com/electron/electron/security/advisories)** — RSS-able; subscribe and update on every advisory affecting your line.

## Quick checklist (one screen, copy-paste-ready)

```
[ ] BrowserWindow webPreferences has only `preload`; everything else is default.
[ ] preload uses contextBridge.exposeInMainWorld with named functions, not `ipcRenderer` whole.
[ ] No window has nodeIntegration: true, contextIsolation: false, or sandbox: false (renderer).
[ ] Strict CSP on every HTML document, set both via meta tag AND response header.
[ ] will-navigate handler on every webContents; setWindowOpenHandler returning deny.
[ ] shell.openExternal calls validate URL scheme (https:/mailto:) and host (allowlist).
[ ] ipcMain.handle handlers validate event.senderFrame.url.
[ ] Fuses set: RunAsNode=off, EnableNodeOptions=off, EnableNodeCliInspectArguments=off,
    EnableEmbeddedAsarIntegrityValidation=on, OnlyLoadAppFromAsar=on,
    GrantFileProtocolExtraPrivileges=off.
[ ] App is code-signed (Developer ID + hardened runtime + notarization on macOS;
    OV/EV on Windows). See C5.
[ ] Tokens stored via safeStorage, never plaintext or logged. See C9.
[ ] No hardcoded API keys in renderer bundle (grep `webpack`/`vite` output).
[ ] electronegativity runs in CI on every PR.
[ ] Subscribed to electron/electron security advisories; on a supported version line.
[ ] Latest Electron patch release (CVE-2026-34776, CVE-2026-34778 fixed in 38.8.6 /
    39.8.1 / 40.8.1 / 41.0.0).
```

## Cross-links

- [C2 Process model & IPC](02-process-model-and-ipc.md) — preload boundary, `contextBridge` mechanics, IPC validation patterns
- [C5 Packaging & signing](05-packaging-and-signing.md) — code signing is what makes ASAR integrity actually enforceable
- [C9 Backend connectivity](09-backend-connectivity.md) — `safeStorage` for tokens, OAuth PKCE flow
- [CS4 1Password](../case-studies/04-1password.md) — production Electron + Rust security story; origin of `electron-secure-defaults` and `electron-hardener`
- [Template 1: Secure preload](../../build-kit/templates/01-secure-preload.md) — copy-paste-ready preload that implements the `contextBridge` checklist correctly
- [Build-kit checklist](../../build-kit/checklist.md) — preflight including security gates

## Sources

- [Security | Electron docs](https://www.electronjs.org/docs/latest/tutorial/security) — the canonical 17-point checklist `(as of 2026-04)`
- [Context Isolation | Electron docs](https://www.electronjs.org/docs/latest/tutorial/context-isolation) — default since Electron 12
- [Process Sandboxing | Electron docs](https://www.electronjs.org/docs/latest/tutorial/sandbox) — default for renderers since Electron 20
- [Electron Fuses | Electron docs](https://www.electronjs.org/docs/latest/tutorial/fuses) — fuse list and packaging integration
- [ASAR Integrity | Electron docs](https://www.electronjs.org/docs/latest/tutorial/asar-integrity) — manifest of hashes verified at load
- [Electron and the V8 Memory Cage | Electron blog](https://www.electronjs.org/blog/v8-memory-cage) — V8 sandboxed pointers, native module impact
- [Breach to Barrier — Strengthening Apps with the Sandbox | Electron blog](https://www.electronjs.org/blog/breach-to-barrier) — IPC sender validation rationale
- [Migrating from BrowserView to WebContentsView | Electron blog](https://www.electronjs.org/blog/migrate-to-webcontentsview) — BrowserView deprecated since Electron 30
- [GHSA-vmqv-hx8q-j7mg / CVE-2025-55305 — ASAR Integrity Bypass via resource modification (V8 snapshot)](https://github.com/electron/electron/security/advisories/GHSA-vmqv-hx8q-j7mg) — fixed in 35.7.5 / 36.8.1 / 37.3.1 / 38.0.0-beta.6
- [GHSA-7m48-wc93-9g85 / CVE-2023-44402 — ASAR Integrity bypass via filetype confusion (macOS-only)](https://github.com/electron/electron/security/advisories/GHSA-7m48-wc93-9g85) — fixed in 22.3.24+
- [GHSA-xw5q-g62x-2qjc / CVE-2024-46992 — ASAR Integrity bypass by modifying content (Windows-only)](https://github.com/electron/electron/security/advisories/GHSA-xw5q-g62x-2qjc)
- [GHSA-6r2x-8pq8-9489 / CVE-2024-46993 — Heap Buffer Overflow in `NativeImage::CreateFromPath`](https://github.com/electron/electron/security/advisories/GHSA-6r2x-8pq8-9489)
- [GitLab GLAD — CVE-2026-34776 / GHSA-3c8v-cfp5-9885 — Out-of-bounds read in second-instance IPC](https://advisories.gitlab.com/pkg/npm/electron/CVE-2026-34776/) — fixed in 38.8.6 / 39.8.1 / 40.8.1 / 41.0.0
- [GitLab GLAD — CVE-2026-34778 / GHSA-xj5x-m3f3-5x3h — Service worker can spoof executeJavaScript IPC replies](https://advisories.gitlab.com/pkg/npm/electron/CVE-2026-34778/) — fixed in 38.8.6 / 39.8.1 / 40.8.1 / 41.0.0
- [Electron Security Advisories index](https://github.com/electron/electron/security/advisories) — RSS this
- [Electron Security Policy](https://github.com/electron/electron/security/policy) — supported lines, disclosure process
- [GitLab GLAD — CVE-2025-55305 cross-reference](https://advisories.gitlab.com/pkg/npm/electron/CVE-2025-55305/) — secondary index
- [`electron-secure-defaults` | 1Password](https://github.com/1password/electron-secure-defaults/) — opinionated starter
- [`electron-hardener` | 1Password](https://github.com/1Password/electron-hardener) — Rust-side hardening
- [`electronegativity` | Doyensec](https://github.com/doyensec/electronegativity) — static security scanner for Electron
- [Penetration Testing of Electron-based Applications | Deepstrike](https://deepstrike.io/blog/penetration-testing-of-electron-based-applications) — concrete attack patterns
- [The App Sandbox | Slack engineering](https://slack.engineering/the-app-sandbox/) — production sandbox migration story

---

*Date-stamp: page asserts behavior `(as of 2026-04)`. Run a quarterly refresh of the CVE table from [github.com/electron/electron/security/advisories](https://github.com/electron/electron/security/advisories).*
