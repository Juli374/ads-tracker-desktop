# CLAUDE.md — Electron Desktop App Knowledge Base

> You are working inside `/Users/yuliiparfonov/electron-knowledge-base/` — a buildable knowledge base for designing and shipping Electron desktop apps with a remote backend (Railway). This file is the operating manual. Read it once at session start; consult it whenever you're unsure how to navigate.

## §1. What this directory is

A **buildable knowledge base** (panorama, not encyclopedia) for Electron desktop development. Targets ~30-50K total words across atlas + build-kit — substantially smaller than the agents-research base (446K words), because the model already knows JavaScript / Node / Chromium. The KB's job is to surface the *patterns, decisions, gotchas, and authoritative sources* that the model would otherwise hallucinate or get stale on.

Contract: given a request like *"I need to ship an Electron app with auto-update, code signing, and a Railway backend"*, you should be able to walk this base and produce a concrete plan (which packager, which signer, which IPC pattern, which auto-update server, which token-storage API) without leaving to Google.

What it is NOT:
- A JavaScript / Node tutorial — assume modern JS knowledge.
- A complete Electron API reference — link to `electronjs.org/docs`; don't paraphrase.
- A static document — Electron releases major versions every ~8 weeks; signing rules and CVEs move quarterly.

## §2. ⚠️ Cardinal navigation rule

**Always start at `atlas/00-INDEX.md`** for any unfamiliar query. It's the routing table.

The base is *small enough to read in full if you wanted*, but you'd waste context. Discipline:

1. For **Core pages** (~3-4K words each): full read is acceptable. They're not 21K-word monsters like agents-research.
2. For **Awareness pages** (~1-2K words): full read.
3. For **Case studies** (~2K words): full read.
4. For **Build-kit templates**: full read, especially before writing code that uses the same pattern.
5. For **the SOURCES.md**: Grep for the topic, follow the URL.

If a query has a clear topic, just open that file. If unclear, route via 00-INDEX.

## §3. Entry points by task type

Map of "user intent" → "first file to open":

| User intent | First open | Then drill into |
|---|---|---|
| "Should I use Electron at all?" / "Electron vs. Tauri" | `build-kit/decision-tree.md` | `atlas/awareness/01-tauri-vs-electron.md` |
| "Set up a new Electron project" | `build-kit/checklist.md` (preflight) | `atlas/core/01-fundamentals.md` + `atlas/core/08-frontend-stack.md` |
| "How does IPC actually work?" | `atlas/core/02-process-model-and-ipc.md` | `build-kit/templates/02-ipc-contract.md` |
| "Make my app secure" | `atlas/core/03-security.md` | `build-kit/templates/01-secure-preload.md` + `atlas/case-studies/04-1password.md` |
| "Connect to my Railway backend" ⭐ | `build-kit/templates/05-railway-backend-client.md` | `atlas/core/09-backend-connectivity.md` |
| "Sign / notarize / ship to MAS" | `atlas/core/05-packaging-and-signing.md` | `atlas/awareness/03-store-distribution.md` |
| "Add auto-update" | `atlas/core/07-auto-update.md` | `build-kit/templates/04-auto-update.md` |
| "Test my Electron app" | `atlas/awareness/05-testing.md` | — |
| "App is slow / huge" | `atlas/core/10-performance-and-observability.md` | `atlas/case-studies/01-vscode.md` (sandbox migration) + `atlas/case-studies/03-notion-figma.md` (WASM) |
| "Native module / Rust integration" | `atlas/core/04-native-integrations.md#native-modules` | `atlas/case-studies/04-1password.md` |
| "How does VS Code do X?" | `atlas/case-studies/01-vscode.md` | — |
| "ESM in Electron" | `atlas/core/08-frontend-stack.md#esm` | — |
| "Deep links / custom protocol" | `atlas/core/04-native-integrations.md#deep-links` | — |
| "Source for claim X" | `sources/SOURCES.md` (Grep by topic) | — |

## §4. Directory map

```
electron-knowledge-base/
├── CLAUDE.md                  ← this file
├── README.md                  ← project meta + status
├── RESEARCH-PLAN.md           ← v1 plan (Phase 1)
│
├── atlas/                     ← main artifact
│   ├── 00-INDEX.md            ← navigation map (READ FIRST when unsure)
│   ├── core/                  ← 10 deep pages (~3-4K words each)
│   ├── awareness/             ← 6 shallow pages (~1-2K words each)
│   └── case-studies/          ← 5 product teardowns (~2K words each)
│
├── build-kit/
│   ├── checklist.md           ← preflight before starting a new app
│   ├── decision-tree.md       ← Electron vs. Tauri vs. PWA vs. native
│   └── templates/             ← 5 starter scaffolds
│
├── sources/
│   └── SOURCES.md             ← authoritative URL list grouped by topic
│
└── notes/                     ← raw digests of sources (filled during Phase 3)
```

## §5. Working principles

When operating in this directory:

1. **Cite specific files with `path#anchor` or `path:line`.** Don't paraphrase Core pages — link.
2. **Bias: simplest viable choice first.** Electron > Tauri only if you need (a) deep Node/JS ecosystem reuse, (b) consistent rendering across OSes, or (c) team familiarity. Otherwise consider Tauri / PWA / native first. See `build-kit/decision-tree.md`.
3. **2026 defaults** (as of 2026-04, per Phase 1 research):
   - **Electron version**: 41.x (Chromium 146, V8 14.6, Node 24)
   - **Bundler / dev server**: Forge ships both a **Webpack template** (stable, first-party) and a **Vite template/plugin** (experimental as of v7.5+, still production-used). For new projects, Vite is the trajectory; **Webpack is the safe choice today**. Outside of Forge, **electron-vite** is a community-maintained, production-ready alternative.
   - **Packager**: electron-forge (officially recommended) OR electron-builder (more features, more downloads). Both fine.
   - **Auto-update**: `electron-updater` from electron-builder OR built-in `autoUpdater` with custom server (Hazel / Nuts).
   - **Token storage**: `safeStorage` (built-in, OS-keychain-backed). NOT `keytar` (unmaintained as of 2024).
   - **Frontend framework**: any modern (React / Vue / Svelte / Solid). KB is framework-agnostic.
4. **Security defaults are mandatory, not optional.** `contextIsolation: true` + `nodeIntegration: false` + `sandbox: true` + CSP + ASAR integrity fuse. See `atlas/core/03-security.md`.
5. **Use the codes.** C1-C10 for Core, A1-A6 for Awareness, CS1-CS5 for Case studies. Stable identifiers.
6. **Date-stamp version-sensitive claims.** `(as of YYYY-MM)`. Anything older than ~3 months on signing / CVEs / tool versions should be re-verified with WebSearch.
7. **Sources of truth, in priority order**: official Electron docs > Electron blog > Electron GitHub (issues, advisories, RFCs) > Apple/Microsoft developer docs > Chromium/V8 docs > MDN > engineering blogs of cited products (their own posts only) > training-data memory (lowest).

## §6. Update protocol

When new content arrives:

| New input | Lands in | Then integrate into |
|---|---|---|
| New Electron major release | Update `atlas/core/01-fundamentals.md` version-stamp + scan release notes for breaking changes affecting other Core pages | — |
| New CVE / security advisory | `atlas/core/03-security.md` (add to CVE table) | Cross-link from `atlas/awareness/06-telemetry.md` if relevant |
| Signing rule change (CA/B Forum, Apple notarization) | `atlas/core/05-packaging-and-signing.md` 🔁 | Bump date stamp |
| New library / tool worth covering | If broad: new Awareness page; if narrow: footnote in existing Core | Add row to `atlas/00-INDEX.md` |
| New product worth a teardown | New `atlas/case-studies/CSXX-name.md` | Add to INDEX case-studies table |
| New source URL | Add to `sources/SOURCES.md` under the right section | — |

When you EDIT an existing page: bump its `Last updated:` stamp at top.

## §7. Anti-patterns (don't do these)

- ❌ **Don't paraphrase the official Electron docs.** Link them. The KB's job is synthesis (decisions, tradeoffs), not duplication.
- ❌ **Don't recommend `keytar`** — unmaintained as of 2024. Use `safeStorage`.
- ❌ **Don't recommend a packager / signer / updater without checking the date stamp** of the source page; signing rules change quarterly.
- ❌ **Don't conflate Electron with "Chrome bundled with Node"** — the three-process model and preload boundary are central; treating it as "just Chrome" leads to insecure code.
- ❌ **Don't recommend disabling `contextIsolation`, `sandbox`, or enabling `nodeIntegration` in renderers** — those are 2017-era patterns; modern Electron is secure by default and breaking that defeats the security model.
- ❌ **Don't dump full Core pages into responses** — they're 3-4K words; quote 1-2 paragraphs + link.
- ❌ **Don't invent terms.** Use C/A/CS-IDs.
- ❌ **Don't treat the base as exhaustive.** It's a panorama; the official docs and the actual app are the ground truth.

## §8. Status & gaps

- **Phase 1 (Architect): ✅ complete (2026-04-30)** — plan + skeletons + SOURCES.md
- **Phase 2 (Validator): ✅ complete (2026-04-30)** — pass-with-notes; 9 required + 14 suggested fixes applied by Fixer agent same day
- **Phase 3 (parallel topic agents): ✅ complete (2026-04-30)** — 28 pages drafted; ~81K total words
- **Phase 4 (Final audit): ✅ complete (2026-04-30)** — PASS-WITH-NOTES; 4 required + 9 suggested fixes; required fixes applied
- **Phase 5 (living document mode): ⏳ ready** — quarterly refresh of 🔁 pages; see `RESEARCH-PLAN.md` §6
- **🔁 living files** (refresh quarterly): `atlas/core/03-security.md` (CVE list), `atlas/core/05-packaging-and-signing.md`, `atlas/core/07-auto-update.md`
- **`notes/`: empty** — directory reserved for ad-hoc source digests; not used during Phase 3 (drafts cite SOURCES.md inline)

If the user asks something the base doesn't cover, propose extending the base — don't auto-add.

## §9. WebSearch usage rules

- **Default**: answer from the base, with date-stamp warning ("KB last updated 2026-04 — verify if critical").
- **Trigger WebSearch only when**: (a) user explicitly asks for current state, (b) high-stakes production decision (signing, notarization), (c) topic is on a known fast-moving surface (Electron release notes, CVEs, signing rules, framework versions).
- **Don't WebSearch** for fundamentals, IPC patterns, security checklist (those are stable for years).

## §10. External invocation

When invoking this knowledge base from other projects (i.e. not working inside this directory), open `CLAUDE.md` first via absolute path. The KB has no per-user agent yet (unlike agents-research, which has `~/.claude/agents/agent-architect.md`). If usage warrants it, create one in Phase 5.

---

*End of operating manual. Last updated: 2026-04-30 (post Phase 4 audit).*
