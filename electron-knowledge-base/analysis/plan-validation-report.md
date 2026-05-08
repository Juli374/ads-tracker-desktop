# Plan Validation Report — Phase 1
> Date: 2026-04-30
> Validator: independent subagent, clean context
> Verdict: **PASS-WITH-NOTES**

## TL;DR

The plan is structurally sound and ready for Phase 2 with parallel fixes — the topic map is well-scoped for a "panorama, not encyclopedia" KB, the source list is overwhelmingly authoritative (official Electron / Apple / Microsoft / vendor-blog dominant), and the Railway-backend angle is correctly elevated as a first-class concern. Verified: Electron 41 is the current stable (released 2026-03-10, Chromium 146.0.7680.65, V8 14.6, Node 24.14.0), Tauri 2.0 GA Oct 2024 with mobile, keytar archived, March 2026 cert validity drop is 460 days (≈15 months), Linear is Electron, VS Code uses vanilla Electron, 1Password's macOS-native → Electron+Rust direction is correct. Five real problems need fixing before Phase 2 starts: (1) the plan conflates two distinct ASAR CVEs as one ID (CVE-2025-55305 = GHSA-vmqv-hx8q-j7mg, NOT GHSA-7m48-wc93-9g85 / CVE-2023-44402); (2) the claim "Vite is the 2026 default; production-used widely" is too strong — Forge's Vite plugin is explicitly *experimental* as of v7.5.0–v7.11.x; (3) Squirrel.Windows is NOT generically "deprecated" — it is deprecated *in electron-builder only*, while Forge still ships it as the default Windows maker; (4) topic gaps: WebUSB/WebSerial/WebHID, Wayland-default behavior (Electron 38+), and BrowserView→WebContentsView migration are missing despite being live 2026 concerns; (5) one source URL (the Cameron Nokes keytar post in C9) implicitly endorses keytar — should be reframed as legacy. Otherwise the methodology mirrors the user's documented two-phase research approach faithfully and stubs are real stubs (not pre-filled drafts).

---

## Findings by category

### A. Currency

- **A.1 Electron stable version (Plan claims 41.x, Chromium 146, V8 14.6, Node 24)** — VERIFIED. Electron 41 released 2026-03-10; bundles Chromium 146.0.7680.65, V8 14.6, Node v24.14.0; 41.0.2 is recommended due to high-priority follow-up patches. Plan's CLAUDE.md `(as of 2026-04)` stamp is accurate. Source: <https://www.electronjs.org/blog/electron-41-0>
- **A.2 electron-forge vs electron-builder** — Plan's "Forge officially recommended; Builder community-maintained, more downloads" is CORRECT. electron-builder ~1.6M weekly downloads vs electron-forge significantly less; both actively developed. Sources: <https://www.electronforge.io/core-concepts/why-electron-forge>, <https://npmtrends.com/electron-builder-vs-electron-forge>, <https://www.electronjs.org/docs/latest/tutorial/forge-overview>
- **A.3 Tauri 2 status** — VERIFIED. Tauri 2.0 stable Oct 2 2024; iOS + Android mobile support; production-ready. Sources: <https://v2.tauri.app/blog/tauri-20/>, <https://en.wikipedia.org/wiki/Tauri_(software_framework)>
- **A.4 ESM in Electron** — Plan claims ESM stable since v28 (Dec 2023). VERIFIED. Electron 28.0.0 (Dec 2023) added ESM support; bundles Chromium 120, Node 18.18, V8 12. Source: <https://www.electronjs.org/blog/electron-28-0>, <https://releases.electronjs.org/release/v28.0.0>
- **A.5 contextIsolation, sandbox, nodeIntegration defaults** — VERIFIED. contextIsolation default since v12; renderer sandbox default since v20 (preload scripts sandboxed by default in v20+, no Node access in preload unless `sandbox: false`). nodeIntegration: false is the default. Sources: <https://www.electronjs.org/docs/latest/tutorial/context-isolation>, <https://www.electronjs.org/docs/latest/tutorial/sandbox>, <https://www.electronjs.org/blog/electron-20-0>
- **A.6 Apple notarization & hardened runtime** — Plan implicitly assumes notarytool, which is correct. altool was decommissioned 2023-11-01; @electron/notarize uses notarytool exclusively. Hardened runtime is required for notarization. Note: Xcode 26+ adds Individual API Key support but with caveats. Sources: <https://github.com/electron/notarize/issues/189>, <https://developer.apple.com/documentation/security/customizing-the-notarization-workflow>, <https://developer.apple.com/documentation/security/hardened_runtime>
- **A.7 Windows code signing — CA/B Forum dates and validity drop** — Plan claims "March 2026: max validity 39 → 15 months." VERIFIED with NUANCE: actual change is 460 days (~15 months), effective on or after **February 23 / March 1, 2026** depending on source. EV instant-SmartScreen-trust removal in March 2024 is also CORRECT. CA/B Forum HSM mandate (June 2023) for OV+EV requires private keys on FIPS 140-2 Level 2+ HSMs — VERIFIED. Sources: <https://www.globalsign.com/en/company/news-events/news/businesses-must-prepare-two-significant-certificate-lifecycle-reductions-march-2026>, <https://www.appviewx.com/blogs/460-day-code-signing-certificate-2026/>, <https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation>
- **A.8 Squirrel.Windows status** — Plan says "Squirrel.Windows (deprecated path)." NUANCED: it's **deprecated in electron-builder only**; the upstream Squirrel.Windows project itself is "not deprecated, archived or dead" (commits as recent as 2025); Electron Forge still ships @electron-forge/maker-squirrel as the **default Windows maker** (NSIS is not Forge's default — Forge defaults to Squirrel.Windows; NSIS is electron-builder's default). Plan should not blanket-call it "deprecated." Source: <https://www.electronforge.io/config/makers/squirrel.windows>, <https://github.com/electron/forge/issues/3069>
- **A.9 keytar status** — VERIFIED. atom/node-keytar archived (Dec 2022). VS Code, Joplin, Element, etc. have all moved away. safeStorage is the recommended replacement. Sources: <https://github.com/atom/node-keytar/issues/438>, <https://github.com/microsoft/vscode/issues/185677>
- **A.10 V8 sandbox / memory cage in Electron** — Plan says "V8 memory cage / sandboxed pointers (Electron 21+)." VERIFIED — V8 Memory Cage default-on since Electron 21. Native modules wrapping external memory with ArrayBuffer break under the cage; this is a known migration footgun for native add-ons. Source: <https://www.electronjs.org/blog/v8-memory-cage>
- **A.11 ASAR integrity / fuses, CVE-2025-55305** — **PROBLEM.** Plan equates CVE-2025-55305 with GHSA-7m48-wc93-9g85, but those are TWO DIFFERENT ADVISORIES:
  - CVE-2025-55305 = GHSA-**vmqv-hx8q-j7mg** = ASAR Integrity Bypass via *resource modification* (V8 snapshot, fixed in 35.7.5/36.8.1/37.3.1/38.0.0-beta.6) — Source: <https://github.com/electron/electron/security/advisories/GHSA-vmqv-hx8q-j7mg>, <https://nvd.nist.gov/vuln/detail/CVE-2025-55305>
  - GHSA-**7m48-wc93-9g85** = CVE-**2023-44402** = ASAR Integrity bypass via *filetype confusion* (macOS-only, fixed in 22.3.24/23.3.14/etc.) — Source: <https://github.com/electron/electron/security/advisories/GHSA-7m48-wc93-9g85>
  These need to be split into two table rows in C3.
- **A.12 Linear desktop app** — VERIFIED Electron. Linear's own changelog (2019-04-25) and "How we redesigned the Linear UI" blog confirm Electron wrapping their JS/React app. CS5 can stay with Linear; the open question can be marked resolved. Sources: <https://linear.app/changelog/2019-04-25-linear-desktop-app>, <https://linear.app/changelog/2020-03-19-desktop-app-improvements-multi-window-support>
- **A.13 VS Code & Electron — vanilla, not fork** — VERIFIED. Microsoft uses vanilla `electron` as an npm dep with patches. Plan's framing is correct. Source: <https://news.ycombinator.com/item?id=30162010>, <https://github.com/microsoft/vscode> (package.json shows `electron` as a regular dep, not a fork)
- **A.14 1Password's migration** — Plan says "native macOS → Electron + Rust core." VERIFIED. 1Password 8 (2021) replaced the SwiftUI macOS native effort with Electron UI on top of a shared Rust core that holds all crypto, data, and server logic. They authored both `electron-hardener` (Rust) and `electron-secure-defaults`. Sources: <https://1password.com/blog/1password-8-the-story-so-far>, <https://github.com/1Password/electron-hardener>

#### Additional currency findings (not in the original A-list but worth flagging)

- **Electron 38 made Wayland default** on Linux when launched in a Wayland session (Sept 2025; ELECTRON_OZONE_PLATFORM_HINT being deprecated; removed in Electron 39). The plan does not mention this — but it should, because user is targeting Linux distribution and X11/Wayland is a meaningful packaging concern. Source: <https://www.electronjs.org/blog/tech-talk-wayland>, <https://www.electronjs.org/blog/electron-38-0>
- **BrowserView deprecated since Electron 30 in favor of WebContentsView**. Plan's CS2 mentions "BrowserView/WebContentsView per workspace" but does not flag the migration. The migration is an active 2025 concern. Source: <https://www.electronjs.org/blog/migrate-to-webcontentsview>
- **napi-rs** — plan says "latest 3.4.0, Oct 2025." Actually 3.8.4 as of 2026-03-28. Bump the version. Source: <https://docs.rs/crate/napi/latest>, <https://github.com/napi-rs/napi-rs/releases>
- **MSIX in Electron Forge** is experimental as of v7.10. Plan's casual mention of "MSIX (modern)" is fine but the experimental flag should appear in C5 or C6 when written. Source: <https://www.electronforge.io/config/makers/msix>
- **Azure Trusted Signing has been rebranded "Azure Artifact Signing"** in Oct 2025, still US/Canada-only with 3+ year business history requirement. Plan should track this naming. Source: <https://azure.microsoft.com/en-us/products/artifact-signing>

### B. Topic coverage

#### Gaps (worth adding)

1. **WebUSB / WebSerial / WebHID** — Electron has first-class device APIs via session handlers (`select-hid-device`, `select-serial-port`, `select-usb-device`, `setDevicePermissionHandler`). For an audience that may want to integrate hardware, this is a real surface. Suggest a section in C4 (Native integrations) ~300-500 words. Source: <https://www.electronjs.org/docs/latest/tutorial/devices>
2. **BrowserView → WebContentsView migration** — Either as a paragraph in C4 or as a flagged note in CS2 (Slack/Discord per-workspace BrowserView). This is a *current* migration that affects existing apps. Source: <https://www.electronjs.org/blog/migrate-to-webcontentsview>
3. **Wayland default behavior on Linux** — A 2-3-paragraph callout in C6 (Cross-platform porting), since Electron 38+ defaults to Wayland and ELECTRON_OZONE_PLATFORM_HINT goes away in 39. Materially affects packaging/launching for Linux end-users. Source: <https://www.electronjs.org/blog/tech-talk-wayland>
4. **Renderer crash recovery / GPU process recovery** — Plan mentions `crashReporter` in C10 but not the *recovery pattern* (`render-process-gone`, `webContents.reload()`, `forcefullyCrashRenderer()`, `webContents.refresh()` for GPU white-screen). For a shipping app this is a real engineering concern. Suggest a paragraph in C10. Source: <https://github.com/electron/electron/pull/34428>
5. **Per-user vs machine-wide install on Windows; NSIS vs MSI vs MSIX vs Squirrel** — Plan touches all of these in C5 but not the *decision* between them. Worth a small table in C5 or build-kit checklist. Sources: <https://www.electron.build/nsis.html>, <https://www.electron.build/msi.html>
6. **DMG vs PKG vs ZIP on macOS** — Plan covers signing/notarization but not delivery container format choice. A 1-paragraph callout would help. Source: <https://www.electron.build/configuration/mac>
7. **Linux desktop integration: .desktop file MIME types, icon hicolor theme** — Plan mentions `.desktop files, MIME types` in C6 one-liner; it's enough for a stub but Phase 3 agents should know to expand this rather than skip it. No source change needed.
8. **Mac App Sandbox profile vs Hardened Runtime** — These are distinct: hardened runtime is mandatory for Developer ID notarization (general distribution); App Sandbox profile is mandatory for Mac App Store. Plan correctly mentions both but doesn't make the distinction explicit; suggest a 1-sentence framing addition in C5/A3. Sources: <https://developer.apple.com/documentation/security/hardened_runtime>, <https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide>
9. **net.fetch vs Node fetch in main process** — Plan mentions "Node `fetch` / `undici`" in C9. But Electron also offers `net.fetch` (Chromium network stack, supports system proxy / device certificates). For a Railway-backed app behind corporate proxies this matters. Source: <https://www.electronjs.org/docs/latest/api/net>
10. **`electron-log` IPC bridging behavior** — Plan mentions `electron-log` in C10 as "rotating file logs; ipc-bridged main↔renderer." Phase 3 agent should know that the bridging is automatic when you import from `electron-log/renderer` (no manual IPC plumbing). No source change.

#### Redundancies / things that could be merged

- None obvious. The Core/Awareness/Case-study/Build-kit split is clean.

#### Splits worth considering

- **C5 Packaging & code signing** is at risk of becoming the longest Core page given how many sub-topics it covers (Forge vs Builder, macOS notarization, Windows signing changes, Linux formats, universal binaries, Trusted Signing). The plan budgets ~3.5K words; realistic estimate is closer to 4.5-5K. Either accept the bloat (because it's the highest-value page for a shipping engineer) or split into "C5a Packaging tools" + "C5b Code signing" — recommend keeping merged but allowing 5K rather than 3.5K.
- **C9 Backend connectivity (Railway)** is similarly dense (auth, OAuth PKCE, safeStorage, WebSocket, offline, SQLite). 3.5K probably fits because the build-kit Template 5 absorbs the implementation detail.

#### Word budget

Plan budgets ~62K total. That feels right for a panorama. The bigger risk is *underdelivery* on stubs that are too narrow (e.g., A4 accessibility/i18n at ~1.5K is fine; A6 telemetry at ~1.5K is fine). No page is obviously over- or under-budgeted.

### C. Source quality

#### Spot-checked URLs (15)

Of 15 URLs spot-checked across SOURCES.md, **14/15 are authoritative and stable** (official Electron docs, Apple Developer, Microsoft Learn, Electron blog, Electron GitHub advisories, Tauri docs, Notion/Figma/1Password engineering blogs, RFC 7636, npm package pages). Only one is borderline:

- ✅ <https://www.electronjs.org/docs/latest/tutorial/security> — official, primary
- ✅ <https://www.electronjs.org/blog/electron-41-0> — official release note
- ✅ <https://www.electronjs.org/docs/latest/tutorial/asar-integrity> — official
- ✅ <https://github.com/electron/electron/security/advisories/GHSA-7m48-wc93-9g85> — official advisory
- ✅ <https://github.com/electron/electron/security/advisories/GHSA-vmqv-hx8q-j7mg> — official advisory (NOTE: this is the right URL for CVE-2025-55305, *not* the GHSA-7m48 URL the plan lists)
- ✅ <https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution> — official Apple
- ✅ <https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options> — official Microsoft
- ✅ <https://learn.microsoft.com/en-us/azure/trusted-signing/> — official Microsoft (note: rebrand to Azure Artifact Signing as of late 2025)
- ✅ <https://v2.tauri.app/blog/tauri-20/> — official Tauri
- ✅ <https://github.com/1password/electron-secure-defaults/> — official 1Password
- ✅ <https://github.com/1Password/electron-hardener> — official 1Password
- ✅ <https://datatracker.ietf.org/doc/html/rfc7636> — IETF RFC
- ✅ <https://www.electronjs.org/blog/v8-memory-cage> — official Electron blog
- ⚠️ <https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/> — DoltHub blog post; recent (2025-11) and substantive but it's a vendor-engineering blog *about a different product than DoltHub* (i.e., not "their own posts only" per CLAUDE.md §5.7). Acceptable as one of multiple sources for A1 (Tauri tradeoff) but should not be the *primary* source. Suggest demoting to "supplementary" and adding the official Tauri performance comparison page if it exists.
- ⚠️ <https://cameronnokes.com/blog/how-to-securely-store-sensitive-information-in-electron-with-node-keytar/> — personal blog teaching keytar (now legacy). Plan keeps it "for context (now legacy)" which is correct framing — flag clearly in C9 that this is *not* recommended practice.
- ⚠️ <https://blog.bloomca.me/2025/07/20/electron-apps-custom-protocols.html> — personal blog. Recent, technical, but the plan's source-priority rule says "engineering blogs of cited products *only their own posts*" (CLAUDE.md §5.7). This is a third-party teaching post. Suggest replacing/supplementing with the official Electron deep-links docs (already in the same SOURCES section, so this is a soft demotion).
- ⚠️ <https://palette.dev/blog/improving-performance-of-electron-apps> — third-party content marketing blog about Slack/Notion/VSCode. Useful for survey but each claim should still be backed by the *original* engineering blog post. The Electron-team's own performance docs and the original Slack/Notion/VSCode posts should be primary; Palette is supplementary.
- ⚠️ <https://dteare.medium.com/behind-the-scenes-of-1password-for-linux-d59b19143a23> — Medium post by Dave Teare (1Password CEO). Author identity makes this acceptable as a primary 1Password source despite the medium.com domain.
- ⚠️ <https://serokell.io/blog/rust-in-production-1password> — Serokell interviewing 1Password engineers. Acceptable as a supplementary source; not the strongest primary.

#### Authoritative sources missing

1. **Electron's own "Best Practices / Building Effective Apps" tutorial** is reachable via `electronjs.org/docs/latest/tutorial/performance` — already in SOURCES under C10. ✓
2. **Apple — "Distributing software outside of the Mac App Store"** (covers DMG, ZIP, notarization workflow) — should be added to C5. URL: <https://developer.apple.com/documentation/security/distributing-software-outside-of-the-mac-app-store-1>
3. **Microsoft Learn — "SmartScreen reputation for Windows app developers"** — directly addresses the EV-instant-trust change. Add to C5. URL: <https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation>
4. **CA/Browser Forum — Code Signing Baseline Requirements** — primary source for the 460-day rule. Add to C5. URL: <https://cabforum.org/working-groups/code-signing/requirements/>
5. **Electron `Device Access` tutorial** (WebHID/WebUSB/WebSerial) — needed if topic gap #1 is added. URL: <https://www.electronjs.org/docs/latest/tutorial/devices>
6. **Electron blog "Migrating from BrowserView to WebContentsView"** — needed if topic gap #2 is added. URL: <https://www.electronjs.org/blog/migrate-to-webcontentsview>
7. **Electron blog "Tech Talk: How Electron went Wayland-native"** + Electron 38 release notes — needed if topic gap #3 is added. URL: <https://www.electronjs.org/blog/tech-talk-wayland>, <https://www.electronjs.org/blog/electron-38-0>
8. **Tauri's `Migrate from Electron` documentation** — exists as `v2.tauri.app/start/migrate/` (per Tauri docs). Should be in A1 sources for completeness. URL: <https://v2.tauri.app/start/migrate/>
9. **Squirrel.Windows official repo** — currently absent; should be in C5/C7 sources. URL: <https://github.com/Squirrel/Squirrel.Windows>
10. **Linear's own engineering posts** — for CS5, the changelog posts confirming Electron should be cited explicitly: <https://linear.app/changelog/2019-04-25-linear-desktop-app>, <https://linear.app/changelog/2020-03-19-desktop-app-improvements-multi-window-support>

### D. Methodology

| Criterion | Pass/Fail | Notes |
|---|---|---|
| Two-phase research (Architect → independent Validator) | ✅ PASS | This validation pass is exactly the methodology. RESEARCH-PLAN.md §6 documents it. |
| Citation discipline ("every claim has a source") | ✅ PASS | README §"Quality principles" and CLAUDE.md §5.7 enforce it; SOURCES.md groups URLs by topic. |
| Date-stamping convention `(as of YYYY-MM)` | ✅ PASS | CLAUDE.md §5.6 + README "Date discipline" + RESEARCH-PLAN §5 all instruct it. Page-shape template in §4 of RESEARCH-PLAN includes `(as of YYYY-MM)` line. Phase 3 agents will see this clearly. |
| Stubs are stubs, not pre-filled outlines | ✅ PASS | All 28 stubs verified: each is ~1K characters, contains a one-line description + source list, no pre-written body. Phase 3 agents have full creative latitude. |
| Source-priority order documented | ✅ PASS | CLAUDE.md §5.7 + SOURCES.md "Source-priority rules" both document the same priority. |
| Living-document mode after Phase 4 | ✅ PASS | README "Status," CLAUDE.md §6 "Update protocol," and RESEARCH-PLAN §6 all document it consistently. |
| Open questions surfaced for the Validator | ✅ PASS | RESEARCH-PLAN §7 lists 7 explicit open questions, several of which this report resolves. |

One minor methodology nit: the plan uses "Phase 2 — Validator" and "Phase 3 — Parallel topic agents" in some places, and "Phase 2 (Validator)" / "Phase 3 (parallel topic agents)" in others. Internally consistent enough; not a blocker.

### E. Reality checks

#### Stub-too-broad (split before Phase 2 agent assignment?)

- **C5 Packaging & code signing** is the most at-risk: Forge vs Builder + macOS notarization (2 distinct toolchains) + hardened runtime + Windows signing 2024-2026 timeline + HSM mandate + Trusted/Artifact Signing + Linux formats (AppImage/Snap/Flatpak/.deb/.rpm) + universal binaries. A single agent in one pass can plausibly draft this at 5K words but quality may dip. **Suggest**: budget 5-6K for this page rather than 3.5K, OR split into C5a "Packaging tools (Forge / Builder / format choice)" and C5b "Code signing (Apple notarization + Windows signing changes)". I lean toward keeping merged but raising the budget; splitting risks fragmenting the cross-references.
- **C9 Backend connectivity (Railway)** could be tight at 3.5K given OAuth PKCE + safeStorage + net.fetch vs Node fetch + WebSocket reconnect + SSE + offline-first SQLite. Build-kit Template 5 absorbs implementation detail, so 3.5K is workable.
- All other Core pages look right-sized.

#### Decision-tree branch coverage for "I have a Railway HTTP API backend"

`build-kit/decision-tree.md` stub explicitly mentions "with a dedicated branch 'I have a Railway backend' that recommends Electron for fastest path." ✅ The branch is planned. The Phase 3 agent must ensure this branch *actually* exists in the drafted decision tree and isn't a one-line bullet.

#### Other red flags

- **CS5 Linear** open-question can be marked RESOLVED in Phase 2 (Linear is confirmed Electron — see A.12). The backup picks (Obsidian / Cursor / Raycast) can be archived as alternates.
- **Open Question #5 (Webpack template)**: per current research, Forge's Webpack template is *actively maintained* (latest @electron-forge/template-webpack 7.8.3 published recently). Forge's Vite plugin is *experimental* (v7.5+, including current 7.11.x). So the plan's framing should be inverted: "Webpack is the *stable* default in Forge today; Vite is recommended-with-an-experimental-flag." The user's CLAUDE.md says "Bundler / dev server: Vite (electron-vite or Forge Vite template)" without that caveat — this is misleading. Source: <https://www.electronforge.io/templates/vite>, <https://www.electronforge.io/templates/webpack-template>
- **Open Question #6 (Database / local storage Core page)**: my recommendation is **NO new page**. Cover SQLite/IndexedDB/PGLite inside C9 backend connectivity, as currently planned. Adding a separate page risks bloating beyond the 30-50K target without much gain — the model already knows SQLite well.
- **Open Question #7 (V8 sandbox section depth)**: keep in C3 but as a one-paragraph mention with link to the official blog. Not a major build-kit concern; users rarely flip the fuse.

---

## Required fixes (must do before Phase 2)

1. **`atlas/core/03-security.md` and `RESEARCH-PLAN.md` §1 C3** — Split the conflated CVE references. CVE-2025-55305 = GHSA-vmqv-hx8q-j7mg (resource modification, V8 snapshot integrity, fixed in 35.7.5/36.8.1/37.3.1/38.0.0-beta.6). GHSA-7m48-wc93-9g85 = CVE-2023-44402 (filetype confusion, macOS-only, fixed in 22.3.24+). Two separate rows in the CVE table.
2. **`sources/SOURCES.md` — C3 section** — Currently lists CVE-2025-55305 and GHSA-7m48-wc93-9g85 as separate entries (good) but the C3 stub one-liner conflates them. Fix the stub one-liner to reference each correctly.
3. **`CLAUDE.md` §5.3 (2026 defaults) and `RESEARCH-PLAN.md` §1 C8** — Tone down the "Vite is the 2026 default" claim. Forge's Vite plugin is explicitly experimental as of 7.5+. Recommended language: "Forge ships both a Webpack template (stable, first-party) and a Vite template/plugin (experimental as of v7.11.x but production-used). For new projects, Vite is the trajectory; Webpack is the safe choice today. Outside of Forge, electron-vite is a community-maintained, production-ready alternative."
4. **`RESEARCH-PLAN.md` §1 C5 + `CLAUDE.md` anti-patterns + Forge-related sentences** — Stop calling Squirrel.Windows generically "deprecated." Specify: "Deprecated in electron-builder; still the default Windows maker in Electron Forge. The upstream Squirrel.Windows project is unarchived and receives commits."
5. **`atlas/core/04-native-integrations.md` and `RESEARCH-PLAN.md` §1 C4** — Add a section/bullet for **WebUSB / WebSerial / WebHID**, citing `electronjs.org/docs/latest/tutorial/devices`. This is a real audience surface and the omission is conspicuous.
6. **`atlas/core/06-cross-platform-porting.md` and `RESEARCH-PLAN.md` §1 C6** — Add a Wayland callout (Electron 38 default; ELECTRON_OZONE_PLATFORM_HINT being removed in 39).
7. **`atlas/case-studies/05-linear.md` + `RESEARCH-PLAN.md` §1 CS5 open question** — Mark Linear-is-Electron as confirmed. Cite the two Linear changelog posts. Remove the "Open question" framing in the stub.
8. **`atlas/core/04-native-integrations.md` napi-rs version** — Update "latest 3.4.0, Oct 2025" to "latest 3.8.4, Mar 2026" or add `(as of YYYY-MM)` and instruct Phase 3 agent to re-verify.
9. **`sources/SOURCES.md`** — Correct the URL pairing for CVE-2025-55305: it should point to <https://github.com/electron/electron/security/advisories/GHSA-vmqv-hx8q-j7mg>, not GHSA-7m48-wc93-9g85.

## Suggested fixes (nice to have, not blocking)

1. Add `electronjs.org/docs/latest/tutorial/devices` to SOURCES.md under a new C4 sub-section for WebHID/WebUSB/WebSerial.
2. Add `electronjs.org/blog/migrate-to-webcontentsview` to SOURCES.md under C2 or CS2 (Slack/Discord BrowserView story).
3. Add `electronjs.org/blog/tech-talk-wayland` and `electronjs.org/blog/electron-38-0` to SOURCES.md under C6.
4. Add `learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation` to SOURCES.md under C5 (directly substantiates the EV-instant-trust change).
5. Add `cabforum.org/working-groups/code-signing/requirements/` to SOURCES.md under C5 as the primary CA/B Forum source.
6. Add `developer.apple.com/documentation/security/distributing-software-outside-of-the-mac-app-store-1` to SOURCES.md under C5.
7. Add `v2.tauri.app/start/migrate/` to SOURCES.md under A1 (Tauri's official migrate-from-Electron guidance, even if rough).
8. Add Linear's two changelog posts (2019-04-25, 2020-03-19) to SOURCES.md under CS5.
9. Add `github.com/Squirrel/Squirrel.Windows` to SOURCES.md under C7 to substantiate the "still maintained upstream" claim.
10. Track the "Azure Trusted Signing → Azure Artifact Signing" rebrand throughout C5 and update the SOURCES.md URL if the canonical path moves.
11. Consider raising C5's word budget to 5-6K rather than 3.5K, given how much it has to cover.
12. Mention `net.fetch` (Chromium network stack with system proxy / device cert support) in C9 alongside Node `fetch`/undici, to cover the corporate-proxy case.
13. In CS2 (Slack/Discord), add a forward-pointing note that BrowserView is now WebContentsView (Electron 30+), so the Phase 3 agent doesn't write a 2026-stamped stub that uses the deprecated API name.
14. Demote palette.dev and bloomca.me as primary sources — keep as supplementary, prefer official/first-party sources for the same claims.

## Open questions still unresolved

1. **Forge Vite plugin going to "stable"** — Is there a public timeline for removing the experimental flag from `@electron-forge/plugin-vite`? Current behavior of marking 7.5+ as experimental could persist for several minor versions; CLAUDE.md should note "experimental as of last check (date-stamp)" rather than asserting "Vite is the 2026 default."
2. **`@electron/asar` v4.1+ ASAR digest embedding rollout** — Plan mentions in passing for C5; concrete adoption story (e.g., does any first-party Electron template or builder default to enabling it?) is still unclear. Phase 3 agent should investigate during C3/C5 drafting.
3. **Mac App Store-only pages** — Should A3 (Store distribution) get a dedicated `mas`-build configuration walkthrough, or is that a build-kit template? Currently it's planned in Awareness only. If user actually wants MAS distribution, this is undersized.
4. **Trusted Signing geographic restrictions** — As of Oct 2025, Trusted/Artifact Signing is US/Canada-only with 3+ year business history. For users in EU / elsewhere, the plan needs to recommend a fallback (DigiCert KeyLocker, Sectigo Signing Service, SSL.com eSigner). Phase 3 agent should add this nuance to C5.
5. **Performance — V8 snapshots** — Plan claims "Atom team got 50% reduction." This is a real claim from a 2017-era post; should be re-cited and date-stamped, or replaced with a more recent benchmark from VS Code / Slack. <https://github.com/RaisinTen/electron-snapshot-experiment> (in SOURCES) is a personal experiment, not a benchmark study.
6. **Cursor case study collision with VS Code** — Plan's CS1 (VS Code) and the Cursor mention overlap heavily (Cursor is a VS Code fork). If any case study slot opens up because Linear is confirmed and CS5 doesn't need a backup, Cursor would not be the right replacement (too redundant). Better backups: Obsidian (confirmed Electron, plugin ecosystem) or Slack-after-multi-window (but that's already CS2). Discord has interesting voice/audio engineering. Notion's WASM SQLite is already CS3.
