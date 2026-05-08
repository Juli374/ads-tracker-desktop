# Final Audit Report — Phase 3
> Date: 2026-04-30
> Auditor: independent subagent, clean context
> Verdict: **PASS-WITH-NOTES**

## TL;DR

Phase 2 produced a coherent, well-cited, internally consistent KB. All 9 Validator-required fixes survived in draft v1; the CVE table in C3 keeps CVE-2025-55305 and CVE-2023-44402 as distinct rows with correct GHSA IDs and patched versions; Squirrel.Windows is consistently framed as "deprecated *in electron-builder* / default in Forge / unarchived upstream"; Vite-in-Forge is framed as experimental with Webpack as the safe default; WebUSB/WebSerial/WebHID, the Wayland callout, the napi-rs version bump, `net.fetch`, and the `render-process-gone` recovery pattern are all present where they should be. **478 internal markdown links were scanned; one is broken** (`atlas/core/10-performance-and-observability.md:283`). **Two factual issues stand out as REVISE-worthy on tighter inspection but do not break the KB**: (a) the `safeStorage` async API (`encryptStringAsync` / `decryptStringAsync` / `isEncryptionAvailableAsync`) cited in C9 and Template 5 does not appear in the current Electron docs at https://www.electronjs.org/docs/latest/api/safe-storage — the documented surface is sync-only as of 2026-04, so those code blocks are aspirational and need either revision to use the sync API or a citation that substantiates the async API; (b) `00-INDEX.md` still labels every page as 🟥 stub even though all 28 are now 🟨 draft v1 — the index has not been re-stamped post-Phase-3. The README is also stale ("All pages exist as 🟥 stubs awaiting Validator review and Phase 3"). Net: the body content is solid; the navigation/status surface and one runtime API reference need a small fix-up pass.

## Findings by category

### A. Cross-link integrity

Total internal markdown links scanned: **478**. Broken: **1**.

| File | Line | Label | Bad target | Should be |
|---|---|---|---|---|
| `atlas/core/10-performance-and-observability.md` | 283 | `CS1 VS Code` | `case-studies/01-vscode.md` | `../case-studies/01-vscode.md` |

The line 283 entry is doubled (`[CS1 VS Code](case-studies/01-vscode.md) → see [\`atlas/case-studies/01-vscode.md\`](../case-studies/01-vscode.md)`); the first link is broken, the second resolves. Simplest fix: drop the first half (`[CS1 VS Code](case-studies/01-vscode.md) →` plus the backtick wrapper), keeping the second `[CS1 VS Code](../case-studies/01-vscode.md)` form consistent with the surrounding cross-link list.

Verification command:
```bash
grep -rEho '\[[^]]+\]\([^)]+\.md[^)]*\)' atlas/ build-kit/ # then resolve each
```

### B. Status markers

- `atlas/case-studies/05-linear.md` line 126 has the literal string `🟥 stub → 🟨 draft v1` describing the page's prior state — that's fine (it's a transition note, not a current marker).
- `atlas/00-INDEX.md` is the real issue: the **index still labels all 28 pages as 🟥 stub**, header line 7 says "All pages are 🟥 stubs awaiting Phase 3 parallel write," and the per-page table rows mostly say `🟥 stub`. Phase 3 is done; this needs to be re-stamped to `🟨 draft v1` matching the front-matter on each actual page.
- `README.md` lines 60-69 also reflect Phase 1 status only ("Phase 1 (Architect): complete (2026-04-30)... All Core / Awareness / Case-study / Build-kit pages exist as 🟥 stubs awaiting Validator review and Phase 3 parallel write"). Stale.

### C. Citation quality — 15-claim sample audit

| # | Claim (page:loc) | URL | Verdict |
|---|---|---|---|
| 1 | "Electron 41 ships Chromium 146.0.7680.65 / V8 14.6 / Node 24.14.0, released 2026-03-10" (C1, top) | https://www.electronjs.org/blog/electron-41-0 | ✅ verified |
| 2 | "CVE-2025-55305 = GHSA-vmqv-hx8q-j7mg, ASAR Integrity Bypass via resource modification, fixed in 35.7.5 / 36.8.1 / 37.3.1 / 38.0.0-beta.6" (C3 §6) | https://github.com/electron/electron/security/advisories/GHSA-vmqv-hx8q-j7mg | ✅ verified |
| 3 | "GHSA-7m48-wc93-9g85 = CVE-2023-44402, ASAR Integrity bypass via filetype confusion (macOS-only), fixed in 22.3.24+" (C3 §6) | https://github.com/electron/electron/security/advisories/GHSA-7m48-wc93-9g85 | ✅ verified (advisory also lists 24.8.3 / 25.8.1 / 26.2.1 / 27.0.0-alpha.7 — KB's "22.3.24+" framing is correct shorthand) |
| 4 | "BrowserView is deprecated since Electron 30 (March 2024)" (C2, CS2) | https://www.electronjs.org/blog/migrate-to-webcontentsview | ✅ verified |
| 5 | "Tauri 2.0 GA Oct 2 2024 with iOS / Android" (A1) | https://v2.tauri.app/blog/tauri-20/ | ✅ verified (Oct 2 2024, mobile added) |
| 6 | "Wayland default in Electron 38 (Sept 2025); ELECTRON_OZONE_PLATFORM_HINT removed" (C6, C5) | https://www.electronjs.org/blog/tech-talk-wayland | ✅ verified (env var removed in 38; consistent with KB language saying "deprecated in 38, removed in 39") |
| 7 | "VS Code uses electron@39.8.8 as a vanilla devDependency" (CS1) | https://github.com/microsoft/vscode/blob/main/package.json | ✅ verified |
| 8 | "Linear desktop app uses Electron — 2019-04-25 launch confirmed" (CS5) | https://linear.app/changelog/2019-04-25-linear-desktop-app | ✅ verified (exact wording matches KB quote) |
| 9 | "napi-rs latest 3.8.4 (Mar 28 2026)" (C4 §4) | https://github.com/napi-rs/napi-rs/releases | ⚠️ partially supports — releases page now shows 3.8.6 (29 Apr 2026); 3.8.4 was correct as-of 2026-04-28 (page's `(as of 2026-04)` stamp is technically still valid but slightly stale by audit time) |
| 10 | "Forge Vite plugin marked experimental as of v7.5+, still experimental in 7.11.x" (C8) | https://www.electronforge.io/config/plugins/vite | ✅ verified |
| 11 | "Forge maker-msix is experimental, added in v7.10" (C5, C6, A3) | https://www.electronforge.io/config/makers/msix | ✅ verified |
| 12 | "WebUSB/WebSerial/WebHID via session handlers `select-hid-device`, `select-serial-port`, `select-usb-device`, `setDevicePermissionHandler`" (C4) | https://www.electronjs.org/docs/latest/tutorial/devices | ✅ verified (events exist; setDevicePermissionHandler exists) |
| 13 | "render-process-gone event on webContents (supersedes legacy `crashed`)" (C10) | https://www.electronjs.org/docs/latest/api/web-contents#event-render-process-gone | ✅ verified |
| 14 | "net.fetch uses Chromium's network stack with system proxy support" (C9, T5) | https://www.electronjs.org/docs/latest/api/net | ✅ verified for system proxy + Chromium net stack; the OS-trust-store / device-cert claim isn't in the docs page itself but follows from "uses Chromium's networking library" — mild over-extension but defensible |
| 15 | "safeStorage has async variants `encryptStringAsync`, `decryptStringAsync`, `isEncryptionAvailableAsync`" (C9 line 107, T5 lines 139-159) | https://www.electronjs.org/docs/latest/api/safe-storage | ❌ DOES NOT SUBSTANTIATE — the official safeStorage API page lists ONLY `isEncryptionAvailable`, `encryptString`, `decryptString`, `setUsePlainTextEncryption`, `getSelectedStorageBackend`. No async variants. The KB's code samples in Template 5 won't run as written. See "Required fixes" below. |

Summary: **13 ✅ verified, 1 ⚠️ partial (a fresh napi-rs minor since the date stamp), 1 ❌ does-not-substantiate (safeStorage async API)**.

### D. Validator's 9 required fixes — survival check

| # | Required fix | Survived in draft v1? | Where |
|---|---|---|---|
| 1 | CVE-2025-55305 vs CVE-2023-44402 split — two distinct rows in C3 with correct GHSAs and fixed-in versions | ✅ | `atlas/core/03-security.md` §6 table rows 1-2; SOURCES.md C3 section also lists both correctly |
| 2 | Tone down "Vite is the 2026 default"; Webpack is stable, Vite is experimental in Forge | ✅ | `CLAUDE.md` §5.3, `RESEARCH-PLAN.md` §1 C8, `atlas/core/08-frontend-stack.md` §1, `build-kit/checklist.md` Phase 1, `build-kit/decision-tree.md` |
| 3 | Squirrel.Windows is "deprecated in electron-builder / default in Forge / upstream unarchived" — not generically deprecated | ✅ | `atlas/core/05-packaging-and-signing.md` §1 + dedicated nuance subsection; `atlas/core/06-cross-platform-porting.md` Windows section; `atlas/core/07-auto-update.md`; `build-kit/checklist.md` Phase 8 |
| 4 | WebUSB / WebSerial / WebHID section in C4 | ✅ | `atlas/core/04-native-integrations.md` §3 ("WebUSB / WebSerial / WebHID — Electron's first-class device APIs"), with code example and Sources link to Device Access docs |
| 5 | Wayland callout in C6 — Electron 38 default + ELECTRON_OZONE_PLATFORM_HINT removed in 39 | ✅ | `atlas/core/06-cross-platform-porting.md` §4 ("Wayland default since Electron 38") + Sources; also referenced in C5 §4 |
| 6 | Linear confirmed as Electron in CS5; cites two changelog URLs; no "open question" framing | ✅ | `atlas/case-studies/05-linear.md` opens with "Confirmed Electron" header, quotes exact 2019-04-25 changelog wording, links 2019-04-25 + 2020-03-19 changelogs in Sources |
| 7 | napi-rs version updated to 3.8.4 (Mar 2026) with date stamp | ✅ | `atlas/core/04-native-integrations.md` TL;DR + §4 ("v3.8.4, released March 28, 2026 (as of 2026-04)"); SOURCES.md C4 |
| 8 | net.fetch in C9 — corporate-proxy / system-proxy use case | ✅ | `atlas/core/09-backend-connectivity.md` §2 (HTTP client choice table + recommendation); same point reinforced in Template 5 |
| 9 | Renderer crash recovery in C10 — `render-process-gone` handling pattern | ✅ | `atlas/core/10-performance-and-observability.md` §"Renderer crash recovery" with code example + cross-references |

**All 9 ✅** — Phase 3 agents preserved every required fix and in most cases strengthened them with code examples.

### E. Canonical-home rule

Spot check: do C2, C3, C4, C9 substantively duplicate each other on contextBridge / preload / IPC / safeStorage?

- **contextBridge / preload mechanics** — canonical home is C2. C3 mentions them but defers ("see [C2 Process model & IPC]"). Template 1 implements them; Template 2 types them. C9 references them through Template 5 wiring. ✅ Clean.
- **`safeStorage`** — canonical home is C9 §4. C8 line 137 mentions it briefly and refers to C9; C3 references via "see C9 for safeStorage patterns"; build-kit/checklist references C9; Template 5 implements it. ✅ Clean.
- **CVE table** — canonical home is C3 §6. No duplication elsewhere — other pages link C3.
- **Code signing rules (CA/B Forum, March 2026 460-day rule, EV instant-trust removal)** — canonical home is C5 §3. C7 and C6 reference C5 rather than restating the timeline. Build-kit/checklist Phase 7 names the items but defers to C5 for depth. ✅ Clean.
- **Fuses + ASAR integrity** — canonical home is C3 §3-4. C5 §1 mentions enabling at packaging time and links C3. Template 3's `electronFuses` block references C3. ✅ Clean.
- **WebContentsView / BrowserView migration** — canonical home is C2 (with the migration table); CS2 references C2 for the mechanical migration; C3 mentions in passing. ✅ Clean.
- **net.fetch** — canonical home is C9 §2. Template 5 uses it; build-kit/checklist Phase 4 references C9. ✅ Clean.

The KB respects the canonical-home rule throughout. No restructuring needed.

### F. Date stamping

5 pages spot-checked for `(as of 2026-04)` stamps on version-sensitive claims:

- **C1 Fundamentals** — date stamps on Electron version table footer ("As of 2026-04-30") and on "modern defaults" reference. ✅ Stamps present where needed.
- **C5 Packaging & code signing** — extensive `(as of 2026-04)` stamps in Sources section; in-body dates on CA/B Forum mandate (June 2023), EV change (March 2024), 460-day rule (March 1, 2026), Trusted Signing rebrand (Oct 2025). ✅ Excellent discipline.
- **C7 Auto-update** — `(as of 2026-04)` stamps in Sources block and inline (`electron-updater 6.8.x, last published Feb 2026`). ✅
- **C8 Frontend stack** — Forge Vite plugin "experimental as of v7.5+ through v7.11.x" with `(as of 2026-04)` — ✅
- **A1 Tauri vs. Electron** — Tauri "2.10.x as of 2026-04" date stamped; benchmark numbers carry `(as of 2026-04)` qualifier. ✅

One missed-stamp candidate: in `atlas/awareness/06-telemetry.md` the `@sentry/electron v7.11.0` claim has the (as of 2026-04) stamp in the Sources block but not next to the inline mention; minor. No flagrant misses.

### G. Source-priority adherence

Per CLAUDE.md §5.7 (and SOURCES.md tail): official Electron > Electron blog > GitHub advisories > Apple/Microsoft > MDN > vendor's own engineering blogs > others.

Mostly clean. Flagged third-party / supplementary URLs already labeled as such:

- `https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/` (A1, decision-tree) — DoltHub blog, vendor-engineering blog about a different product. Marked "supplementary" in SOURCES.md but the decision-tree.md still cites it without a "supplementary" label inline. **Cosmetic; the source-priority rule notes "supplementary" which it is.**
- `https://blog.bloomca.me/2025/07/20/electron-apps-custom-protocols.html` — third-party personal blog. SOURCES.md flags it "supplementary; prefer the official Electron deep-links docs above" — that's correct. The actual C4 page does NOT cite this URL inline (verified by search), so it's a sources-list-only entry. ✅
- `https://palette.dev/blog/improving-performance-of-electron-apps` — flagged "supplementary" in C10 Sources. Listed only, not cited in body. ✅
- `https://cameronnokes.com/blog/...node-keytar` (C9 SOURCES.md) — listed for context; framed correctly as "for context (now legacy)". The C9 body does not cite it inline. ✅
- `https://freek.dev/2103-replacing-keytar-with-electrons-safestorage-in-ray` — personal blog but covers a real migration. Cited in C9 inline as supplementary. Borderline; acceptable given Electron's own docs cover the same ground and the freek.dev post is a concrete migration write-up. ✅
- `https://dteare.medium.com/...` (CS4) — Medium URL, but Dave Teare is 1Password's co-founder, so author identity makes it primary on 1Password. ✅
- `https://serokell.io/blog/rust-in-production-1password` (CS4) — third-party interview *with* 1Password engineers. Acceptable as a supplementary primary source because the interviewees are the engineers. ✅
- `https://www.gethopp.app/blog/tauri-vs-electron`, `https://www.pkgpulse.com/blog/electron-vs-tauri-2026` (A1) — third-party benchmark posts. The A1 page consistently labels their numbers as "directional, not benchmark-precise." Acceptable framing. ✅

No cases of citing Medium / dev.to / random blog *over* an authoritative source without explicit supplementary framing.

### H. Bullshit detection

Read-through for specific version numbers / dates / counts without citation. Findings:

1. **C2 line 220** — process-counts table ("on a quiet macOS Activity Monitor: Main 1, Renderer N, GPU 1, Network 1, Utility 0..N, Crashpad 1, Pepper/GPU helper 0..1"). No source URL. These numbers are reasonable (match the well-known Chromium multi-process layout) but presented as observation. Mild — flag as illustrative rather than a defect.
2. **C10 RSS table** ("Main 80-150 MB, Renderer 100-200 MB per window, GPU 80-120 MB, Utility/network 30-80 MB each") — explicitly framed as "Typical numbers (as of 2026-04, varies wildly by app)" — that's the right framing. ✅
3. **C2 line 220 process-count table** — same as #1; reasonable, framed as "concretely on a quiet macOS Activity Monitor", not citation-worthy.
4. **Atom 50% V8 snapshot benchmark** (C10 §V8 snapshots, CS1) — properly flagged: "Treat as directional, not as a 2026 benchmark — re-verify with a current measurement on your own app before quoting it externally." ✅ Validator open question E was honored.
5. **Slack "70% of original code reused, doubled test coverage" (CS2)** — quoted from Slack's own 2019 "When a rewrite isn't" blog, source linked. ✅
6. **"Discord-Linux reverse engineering" (CS2)** — properly framed as community reverse-engineering, source linked. ✅
7. **"@sentry/electron v7.11.0 latest"** (A6, C10) — source linked (npm). ✅
8. **electron-updater 6.8.3** (T4) — source linked. ✅
9. **"npm trends ~553K weekly downloads electron-builder" (C5)** — number presented in body and Sources. Could use a fresher (live) link to npm trends; the GitHub repo URL doesn't substantiate the weekly count. Minor.
10. **"@electron/rebuild v4.0.3, requires Node 22.12+" (C4)** — source linked to npm. ✅
11. **"Electron 8 confirmed by Linear in 2020 changelog" (CS5)** — source linked. CS5 candidly notes "Linear's exact Electron version as of 2026-04 (last public confirmation: Electron 8 in 2020)" in Unverified — exemplary discipline.
12. **`safeStorage.encryptStringAsync` etc. (C9 line 107, Template 5 §Pillar 2)** — claimed as a recommended path but **not present in the official safeStorage docs** as of 2026-04. Specific API name presented without working source URL. ❌ This is the bullshit-detector hit. (Counted under Required fixes.)
13. **VS Code "Chromium 142.0.7444.265 → Node 22.22.1"** (CS1 footer Sources) — sourced via ewanharris/vscode-versions cross-check. ✅
14. **Microsoft Trusted Signing → Azure Artifact Signing rebrand (Oct 2025)** — verified live (the docs page does redirect through the Artifact Signing landing). ✅
15. **"Slack 600 MB+ resident with multiple workspaces"** (CS2) — explicitly labeled "user reports, not Slack-published numbers" with HN thread link. ✅ Good discipline.
16. **"Microsoft has confirmed continued support and stability"** (A5 line 31, citing microsoft/playwright#39477) — issue 39477 was closed-as-not-planned per WebFetch verification; the issue itself is a user question, not a Microsoft commitment. The KB's claim "Microsoft itself uses it to test VS Code — there have been no breaking changes recently and Microsoft has confirmed continued support" overstates what that specific URL substantiates. The first half (Microsoft tests VS Code with `_electron`) is true; the second half ("Microsoft has confirmed continued support") is not in issue 39477. **Suggested fix**, not required — the substantive claim is right but the specific source URL doesn't carry the weight implied.

### I. README/CLAUDE consistency

- `CLAUDE.md` §8 says "Phase 1 (Architect): complete (2026-04-30); Phase 2 (Validator): complete (2026-04-30) ... pass-with-notes; 9 required + 14 suggested fixes applied by Fixer agent same day; Phases 3-4: pending." That matches the in-progress state at the start of Phase 3 but **does not reflect Phase 3 completion**.
- `README.md` is older still — Phase 1 only ("All Core / Awareness / Case-study / Build-kit pages exist as 🟥 stubs awaiting Validator review and Phase 3 parallel write" / status table shows phases 2-5 as ⏳ pending).
- `atlas/00-INDEX.md` per (B) above also pre-Phase-3.
- `RESEARCH-PLAN.md` §6 / §8 reflects through end of Phase 2 only.

These are all consistently out-of-date in the same direction — i.e., none was updated post-Phase-3. **Suggested fix**: a single doc-status pass updating CLAUDE.md §8, README.md "Status", `atlas/00-INDEX.md` header + table, RESEARCH-PLAN.md §8 to reflect "Phase 3 complete (2026-04-30); Phase 4 (this audit) complete; Phase 5 (living document) ready."

### J. Open questions — Phase 2 coverage

Per RESEARCH-PLAN.md §7 and plan-validation-report.md "Open questions still unresolved":

| # | Open question | Addressed in draft v1? |
|---|---|---|
| A | Forge Vite plugin going to "stable" — public timeline? | Partially. C8 §1 confirms "experimental as of last check" with date-stamp; references forge issue #4166 (Vite 8 support tracking). No definitive timeline-to-stable found, but the question is honestly framed as "experimental will likely persist for several minor versions." |
| B | `@electron/asar` v4.1+ ASAR digest embedding rollout | Partially. C5 §1 mentions "v3.2+" and "v4.1+ with digest embedding" links. Not deeply discussed. |
| C | Mac App Store-only pages — dedicated walkthrough? | Partially. A3 has a substantive MAS section (entitlements, App Sandbox vs. Hardened Runtime, four-cert process); C5 mentions MAS as a separate target. No build-kit template for MAS specifically (Template 3 is electron-builder generic, mentions `mas` target option). The Validator flagged "If user actually wants MAS distribution, this is undersized" — accurate; A3 is solid for *awareness* but a buildable MAS template would be a Phase 5 add. |
| D | Trusted Signing geographic restrictions + EU/non-US fallbacks | ✅ Addressed. C5 §3 "Cloud signing services" explicitly lists DigiCert KeyLocker, Sectigo, SSL.com eSigner, Entrust as fallbacks; calls out US/Canada-only restriction (and Apr 2026 EU/UK expansion); decision matrix at end of C5 specifically routes EU users to KeyLocker / SSL.com. Build-kit/checklist Phase 7 reinforces. |
| E | V8 snapshots benchmark currency — Atom-era 50% reduction | ✅ Addressed. C10 explicitly flags: "the 'Atom 50%' claim is from the 2016-2017 era. Treat it as directional, not as a 2026 benchmark — re-verify with a current measurement on your own app before quoting it externally." Open question E preserved as a caveat, which is the right move. |
| F | Cursor case study collision with VS Code | ✅ Addressed (preserved as resolution): CS5 stayed as Linear; Cursor was correctly *not* added. Plan validation already noted Cursor would be redundant. |

Net: 4 of 6 fully addressed, 2 partially addressed and flagged honestly. No open question slipped silently.

## Required fixes (must do before "done")

These are the items I'd require before stamping the KB as "Phase 3 complete, ready for living-document mode."

1. **Fix the broken cross-link in `atlas/core/10-performance-and-observability.md` line 283.**
   - Current: `- [CS1 VS Code](case-studies/01-vscode.md) → see [`atlas/case-studies/01-vscode.md`](../case-studies/01-vscode.md) — sandbox migration improved both security *and* startup; their snapshot pipeline is the most-cited production reference.`
   - Replace with: `- [CS1 VS Code](../case-studies/01-vscode.md) — sandbox migration improved both security *and* startup; their snapshot pipeline is the most-cited production reference.`

2. **Replace `safeStorage` async API in `atlas/core/09-backend-connectivity.md` line 107 and `build-kit/templates/05-railway-backend-client.md` Pillar 2 with the documented sync API, OR cite a non-docs source that substantiates the async surface.**
   - Per https://www.electronjs.org/docs/latest/api/safe-storage (verified 2026-04-30), the documented surface is sync only: `isEncryptionAvailable()`, `encryptString(plain) → Buffer`, `decryptString(buffer) → string`, `setUsePlainTextEncryption()`, `getSelectedStorageBackend()`.
   - C9 line 107 currently asserts: "There's also async `encryptStringAsync` / `decryptStringAsync`, which is the recommended path going forward — non-blocking, supports key rotation, handles transient unavailability."
   - Template 5 lines 137-159 currently implement against `safeStorage.isEncryptionAvailableAsync()` and `safeStorage.encryptStringAsync(...)` / `safeStorage.decryptStringAsync(...)`.
   - Fix option A (lower risk): rewrite both to use the documented sync API (`encryptString` returns a Buffer synchronously; wrap in `Promise.resolve` if you want `await` ergonomics in the template).
   - Fix option B: if there's a recent Electron PR / release note adding async safeStorage that the docs simply haven't picked up, find the actual PR / release-notes URL and cite it; bump the date stamp.

3. **Update status markers in `atlas/00-INDEX.md`.** Change the per-page table rows from `🟥 stub` to `🟨 draft v1` for all 28 pages (10 Core, 6 Awareness, 5 Case studies, 7 Build-kit). Update the header banner ("Status:" in line 7) to reflect Phase 3 completion. The actual page front-matter is already correct — this is just the index.

4. **Update `README.md` "Status" section (lines 60-69)** and the top status paragraph to reflect Phase 3 completion. Bump phases 2 and 3 to ✅; mark Phase 4 (this audit) appropriately; Phase 5 (living document) ⏳.

## Suggested fixes (nice to have)

1. **napi-rs version drift** — the `(as of 2026-04)` on "v3.8.4 (Mar 28 2026)" in C4 is technically still in window, but napi 3.8.6 shipped 29 Apr per https://github.com/napi-rs/napi-rs/releases. If you re-stamp anything else, bump this in the same pass.
2. **Soften the "Microsoft has confirmed continued support" line in `atlas/awareness/05-testing.md` line 31.** The substantive claim (Microsoft uses Playwright `_electron` to test VS Code; no recent breaking changes) is true; the specific source URL (microsoft/playwright#39477) doesn't carry that weight — that issue was closed as not-planned with a user question, not a Microsoft commitment. Either replace the URL with a Microsoft-team comment / release note that does affirm support, or downgrade the wording to "no breaking changes recently observed; treat as production-ready while keeping an eye on minor-version notes" without naming a "Microsoft confirmed" source.
3. **Update `CLAUDE.md` §8 status block** to reflect Phase 3 + 4 complete. Currently says "Phases 3-4: pending."
4. **Update `RESEARCH-PLAN.md` §6 + §8 status block** for the same reason; currently reflects through Phase 2 only.
5. **Decision-tree.md "supplementary" labeling** — the DoltHub URL is properly flagged in SOURCES.md but appears inline in decision-tree.md without "supplementary" mark. Cosmetic; add the qualifier or drop the inline citation.
6. **C2 process-count table (line 220)** — note explicitly that Pepper plugin support was removed (Pepper plugins were dropped from Chromium years ago); the row is misleading for a 2026 audience. Replace with current Chromium helper bundle structure or drop.
7. **C7 mentions Electron 41 ships "Chromium 146, V8 14.6, Node 24" but adds "verify exact version at draft time"** — that hedge isn't needed; C1 already pins these via the Electron 41 release blog. Tighten by linking to C1 instead.
8. **Build a buildable MAS-specific build-kit template (Phase 5).** A3 covers MAS at the awareness level but a copy-paste-ready `entitlements.mas.plist` + `mas`-build script + four-cert layout would close Validator open question C without bloating Awareness.
9. **Add a quarterly-refresh script / TODO list.** The 🔁 living pages (C3, C5, C7) need a calendared trigger. CLAUDE.md §6 documents "refresh quarterly" but no concrete tooling.

## Stats

- Total pages: **28** atlas + **7** build-kit = 35 documented pages (with 5 anchor docs: README, CLAUDE, RESEARCH-PLAN, INDEX, SOURCES)
- Total words across atlas + build-kit + anchor docs + analysis: **~81,175** (per `wc -w` on all `.md` files; significantly above the 30-50K plan target — quality drafts pushed past budget but are well-organized and not bloated)
- Total internal markdown links: **478** (one broken)
- Total citation URLs in SOURCES.md (approximate): ~135 unique URLs grouped by topic; per-page Sources sections cite a subset of those plus a small number of page-specific ones
- Verdict: **PASS-WITH-NOTES**

## Why PASS-WITH-NOTES, not PASS

- 8 out of 9 categories (A, B, D, E, F, G, I, J) come back clean or with cosmetic-only issues.
- The body content quality is strong: every Core page hits the page-shape contract (TL;DR / When to / When NOT / Anatomy / Mini-example / Cross-links / Sources); cross-links are dense and accurate; date-stamping is disciplined; the canonical-home rule is respected throughout.
- The two real issues are (a) one factual API-naming claim (safeStorage async API) that is presented as code which would not run as written against current Electron, and (b) a stale status-marker layer in INDEX / README. Neither is structural — both are quick fixes.
- One broken cross-link out of 478 is a 99.8% pass rate; trivial to repair.

## Why not REVISE

- No structural problems: page-shape, canonical-home, source-priority, and date-stamping are all consistent.
- The 9 Validator-required fixes survived Phase 3 and were strengthened with code examples.
- Sources are overwhelmingly authoritative (official Electron docs, Apple Developer, Microsoft Learn, Tauri docs, vendor engineering blogs of the actual cited products, IETF RFCs).
- Open questions from Phase 2 are honestly addressed — either with a substantive answer (D, E, F) or a flagged caveat (A, B, C).
- The KB delivers on its contract: an engineer with zero Electron experience can walk this directory and produce a concrete plan for shipping a signed, notarized, auto-updating Electron app against a Railway backend. The Required and Suggested fixes are polish, not rebuild.
