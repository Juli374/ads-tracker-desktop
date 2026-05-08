# Electron Desktop App Knowledge Base

A buildable knowledge base for shipping Electron desktop apps that talk to a remote (Railway) backend. Audience: an engineer who knows modern JavaScript / Node and has zero Electron experience but needs to ship for Windows, macOS, and Linux without learning the entire ecosystem from scratch.

## Genre

This is **not** a tutorial and **not** an API reference. It is a **buildable knowledge base** — a panorama of patterns, technologies, and decision points, with cited primary sources for every claim. Open the relevant page → choose a pattern → write the code.

Usefulness test: *"given a new Electron task — security review, packaging for a new platform, adding auto-update, switching from Webpack to Vite — can I open this folder and produce a concrete plan in under 60 minutes without leaving for Google?"*

## What's inside

| Layer | What | Why |
|---|---|---|
| **Core (deep, ~10 pages)** | Fundamentals · Process model & IPC · Security · Native integrations · Packaging · Cross-platform porting · Auto-update · Frontend stack (Vite) · Backend connectivity · Performance & observability | Buildable depth — patterns + mini-examples + when-to-use |
| **Awareness (shallow, ~6 pages)** | Tauri tradeoff · Other web-to-desktop frameworks · MAS / Microsoft Store · A11y & i18n · Testing · Telemetry | Know it exists; reach for it when relevant |
| **Case studies (~5)** | VS Code · Slack/Discord · Notion/Figma · 1Password (Rust + Electron) · Linear/contrast pick | Learn from architectural choices of real shipping products |
| **Build-kit** | Checklist · Decision tree · 5 working templates (preload, IPC contract, electron-builder config, auto-update, Railway backend client) | From theory straight to code |

## Folder structure

```
electron-knowledge-base/
├── README.md                  ← this file
├── CLAUDE.md                  ← operating manual for any LLM working in here
├── RESEARCH-PLAN.md           ← canonical Phase 1 plan
├── atlas/
│   ├── 00-INDEX.md            ← navigation map (READ FIRST when unsure)
│   ├── core/                  ← 10 Core pages (~3-4K words each)
│   ├── awareness/             ← 6 Awareness pages (~1-2K words each)
│   └── case-studies/          ← 5 Case studies (~2K words each)
├── build-kit/
│   ├── checklist.md           ← preflight checklist for new Electron app
│   ├── decision-tree.md       ← Electron vs. Tauri vs. PWA vs. native
│   └── templates/             ← 5 starter templates (preload, IPC, builder, updater, Railway client)
├── sources/
│   └── SOURCES.md             ← curated authoritative URLs grouped by topic
└── notes/                     ← raw digests of sources (added during Phase 3)
```

## Principle: ship first pass, then iterate

1. **First pass** — broad coverage of the topic map (Phase 1-4 in the plan).
2. **After** — living document. Each new project, framework version, or CVE → updates the relevant page.
3. **Quarterly** — refresh `atlas/core/05-packaging-and-signing.md` and `atlas/core/07-auto-update.md` because tooling and signing rules change fast.

## Quality principles

1. **Every claim has a source.** No source → mark `[hypothesis]` and replace before draft graduates.
2. **Buildable depth.** Every Core page ships a mini-example (preload script, IPC contract, builder.yml snippet, etc.) and a clear "when to apply" / "when NOT to" pair.
3. **Cookbook, not textbook.** No academic tone. Skip what the official docs already explain well; link them.
4. **Wiki-style cross-links.** Pages reference each other; readers don't need linear order.
5. **Don't restate the source.** If `electronjs.org/docs/latest/tutorial/security` says it well, link it; the KB synthesizes and contextualizes, doesn't transcribe.

## Date discipline

Every claim about versions, defaults, deprecations, or "current as of" carries a `(as of YYYY-MM)` stamp. As of plan creation: `(as of 2026-04)`. The base is right *for that date*; CVEs and tooling move.

## Status

**Phases 1-4 complete (2026-04-30)** — plan, skeletons, validation, 28 drafts, and the final audit have all landed. The KB is in `🟨 draft v1` across all 28 atlas pages and 7 build-kit pages; required Phase 4 fixes have been applied. Ready for Phase 5 (living-document mode).

| Phase | Status | Output |
|---|---|---|
| 1. Architect (plan + skeletons) | ✅ done (2026-04-30) | RESEARCH-PLAN.md, 28 stubs, SOURCES.md |
| 2. Validator | ✅ done (2026-04-30) | Pass-with-notes; 9 required + 14 suggested fixes applied |
| 3. Parallel topic agents | ✅ done (2026-04-30) | 28 pages drafted (~81K total words) |
| 4. Final audit | ✅ done (2026-04-30) | PASS-WITH-NOTES; 4 required + 9 suggested fixes; required fixes applied |
| 5. Living document | ⏳ ready | Quarterly refresh routine for 🔁 pages |

## How to use this base when ASKING THE LLM

If you're invoking this base from another project, point Claude at `/Users/yuliiparfonov/electron-knowledge-base/CLAUDE.md` first; it tells the model how to navigate without dumping everything into context.
