# Electron Knowledge Base — Index

> Buildable knowledge base for shipping Electron desktop apps with a remote backend.
>
> **Plan version**: v1 (2026-04-30)
> **Last updated**: 2026-04-30
> **Status**: All 28 pages are 🟨 draft v1 (Phase 3 complete 2026-04-30). Phase 4 audit complete (PASS-WITH-NOTES, 4 required + 9 suggested fixes; required fixes applied 2026-04-30). Ready for Phase 5 living-document mode.

---

## How to use this atlas

1. **Starting a new Electron project?** → Begin at [build-kit/checklist.md](../build-kit/checklist.md), then jump to [core/01-fundamentals.md](core/01-fundamentals.md).
2. **Picking Electron vs. Tauri vs. PWA vs. native?** → [build-kit/decision-tree.md](../build-kit/decision-tree.md).
3. **Want to wire up a Railway backend?** → [build-kit/templates/05-railway-backend-client.md](../build-kit/templates/05-railway-backend-client.md) + [core/09-backend-connectivity.md](core/09-backend-connectivity.md).
4. **Need to sign / notarize / publish?** → [core/05-packaging-and-signing.md](core/05-packaging-and-signing.md).
5. **Looking up a security pattern?** → [core/03-security.md](core/03-security.md).

Each Core page follows: **TL;DR → When to apply → When NOT → Anatomy → Mini-example → Cross-links → Sources.**

---

## Status legend

| Marker | Meaning |
|---|---|
| 🟥 stub | Page does not exist yet (one-line + sources only) |
| 🟧 skeleton | Headings + bullets, no synthesis |
| 🟨 draft | First pass complete, needs review |
| 🟩 done | Reviewed, cross-linked, sources cited |
| 🔁 living | Periodically refreshed (security CVEs, signing rules, tool versions) |

---

## Core — deep, buildable

| ID | Title | Status | Path |
|---|---|---|---|
| C1 | Fundamentals — what Electron is, three-process model, when to use | 🟨 draft v1 | [core/01-fundamentals.md](core/01-fundamentals.md) |
| C2 | Process model & IPC — main / renderer / preload, contextBridge, ipcMain/Renderer, MessagePorts | 🟨 draft v1 | [core/02-process-model-and-ipc.md](core/02-process-model-and-ipc.md) |
| C3 | Security — official checklist, fuses, ASAR integrity, CVE catalog | 🟨 draft v1 🔁 | [core/03-security.md](core/03-security.md) |
| C4 | Native integrations — FS, deep links, tray, native modules, Rust via napi-rs | 🟨 draft v1 | [core/04-native-integrations.md](core/04-native-integrations.md) |
| C5 | Packaging & code signing — Forge vs. Builder, macOS notarization, Windows EV/HSM, Linux formats (budget: ~5.5K words) | 🟨 draft v1 🔁 | [core/05-packaging-and-signing.md](core/05-packaging-and-signing.md) |
| C6 | Cross-platform porting — per-OS gotchas, MAS sandbox, NSIS/MSIX/AppImage | 🟨 draft v1 | [core/06-cross-platform-porting.md](core/06-cross-platform-porting.md) |
| C7 | Auto-update — electron-updater, Squirrel, channels, staged rollouts | 🟨 draft v1 🔁 | [core/07-auto-update.md](core/07-auto-update.md) |
| C8 | Frontend stack — Vite + framework + Electron, ESM, HMR, dev/prod loading | 🟨 draft v1 | [core/08-frontend-stack.md](core/08-frontend-stack.md) |
| C9 | Backend connectivity (Railway) ⭐ — auth, safeStorage, WebSocket, offline | 🟨 draft v1 | [core/09-backend-connectivity.md](core/09-backend-connectivity.md) |
| C10 | Performance & observability — V8 snapshots, Sentry, electron-log, crashpad | 🟨 draft v1 | [core/10-performance-and-observability.md](core/10-performance-and-observability.md) |

---

## Awareness — shallow, "know it exists"

| ID | Title | Status | Path |
|---|---|---|---|
| A1 | Tauri 2.x vs. Electron tradeoff | 🟨 draft v1 | [awareness/01-tauri-vs-electron.md](awareness/01-tauri-vs-electron.md) |
| A2 | Other web-to-desktop frameworks — Wails, Neutralino, WebView2, PWA | 🟨 draft v1 | [awareness/02-other-frameworks.md](awareness/02-other-frameworks.md) |
| A3 | Store distribution — Mac App Store, Microsoft Store | 🟨 draft v1 | [awareness/03-store-distribution.md](awareness/03-store-distribution.md) |
| A4 | Accessibility & i18n | 🟨 draft v1 | [awareness/04-accessibility-i18n.md](awareness/04-accessibility-i18n.md) |
| A5 | Testing Electron apps — Playwright, mocking IPC, CI | 🟨 draft v1 | [awareness/05-testing.md](awareness/05-testing.md) |
| A6 | Telemetry & crash reporting in production | 🟨 draft v1 | [awareness/06-telemetry.md](awareness/06-telemetry.md) |

---

## Case studies — how real products are built

| ID | Product | Status | Path |
|---|---|---|---|
| CS1 | VS Code (Microsoft) — vanilla Electron + patches, sandbox migration | 🟨 draft v1 | [case-studies/01-vscode.md](case-studies/01-vscode.md) |
| CS2 | Slack & Discord — wrap-a-web-app archetype, BrowserView per workspace | 🟨 draft v1 | [case-studies/02-slack-discord.md](case-studies/02-slack-discord.md) |
| CS3 | Notion & Figma — web app shells, WASM SQLite, WebGL rendering | 🟨 draft v1 | [case-studies/03-notion-figma.md](case-studies/03-notion-figma.md) |
| CS4 | 1Password 8 — Rust core + Electron UI, electron-secure-defaults | 🟨 draft v1 | [case-studies/04-1password.md](case-studies/04-1password.md) |
| CS5 | Linear — modern Electron + macOS-native polish | 🟨 draft v1 | [case-studies/05-linear.md](case-studies/05-linear.md) |

---

## Build-kit — practical templates

| Item | Status | Path |
|---|---|---|
| Preflight checklist for a new Electron app | 🟨 draft v1 | [build-kit/checklist.md](../build-kit/checklist.md) |
| Decision tree (Electron vs. Tauri vs. PWA vs. native) | 🟨 draft v1 | [build-kit/decision-tree.md](../build-kit/decision-tree.md) |
| Template 1: Secure preload (contextBridge) | 🟨 draft v1 | [build-kit/templates/01-secure-preload.md](../build-kit/templates/01-secure-preload.md) |
| Template 2: Typed IPC contract | 🟨 draft v1 | [build-kit/templates/02-ipc-contract.md](../build-kit/templates/02-ipc-contract.md) |
| Template 3: electron-builder.yml for Win/Mac/Linux | 🟨 draft v1 | [build-kit/templates/03-electron-builder-config.md](../build-kit/templates/03-electron-builder-config.md) |
| Template 4: Auto-update with electron-updater + GitHub Releases | 🟨 draft v1 | [build-kit/templates/04-auto-update.md](../build-kit/templates/04-auto-update.md) |
| Template 5: Railway backend client ⭐ (auth, safeStorage, WebSocket, offline) | 🟨 draft v1 | [build-kit/templates/05-railway-backend-client.md](../build-kit/templates/05-railway-backend-client.md) |

---

## Cross-cutting concepts

These show up across multiple pages — when writing a page, link to the canonical home.

| Concept | Canonical page | Also referenced from |
|---|---|---|
| Three-process model (main / renderer / preload) | C1, C2 | C3, C4, all CS |
| `contextBridge` + `ipcRenderer` boundary | C2 | C3, C9, build-kit/01, build-kit/02 |
| Electron security checklist | C3 | C2, C8, all CS |
| Fuses + ASAR integrity | C3 | C5 (packaging-time flip) |
| Code signing certificates (Apple Developer ID, Windows EV/OV) | C5 | C7 (signing required for update on macOS) |
| `safeStorage` for tokens | C9 | build-kit/05 |
| `electron-updater` | C7 | build-kit/04 |
| Vite + ESM | C8 | — |
| Native module ABI mismatch | C4 | CS4 (1Password Rust integration) |

---

## Phase 1 progress

- [x] [00-INDEX.md](00-INDEX.md) — ✅ done
- [x] [README.md](../README.md) — ✅ done
- [x] [CLAUDE.md](../CLAUDE.md) — ✅ done
- [x] [RESEARCH-PLAN.md](../RESEARCH-PLAN.md) — ✅ done
- [x] [sources/SOURCES.md](../sources/SOURCES.md) — ✅ done
- [x] All 10 Core stubs — ✅ done
- [x] All 6 Awareness stubs — ✅ done
- [x] All 5 Case-study stubs — ✅ done
- [x] All 7 Build-kit stubs (2 docs + 5 templates) — ✅ done

**Total: 28 stub files + 5 anchor docs created on 2026-04-30.**

## Phases 2-5

2. ✅ Validator pass — pass-with-notes (2026-04-30); 9 required + 14 suggested fixes applied by Fixer agent same day
3. ✅ Parallel topic agents (2026-04-30) — 28 pages drafted
4. ✅ Final audit (2026-04-30) — PASS-WITH-NOTES; 4 required + 9 suggested fixes; required fixes applied
5. ⏳ Living document mode (quarterly refresh of 🔁 pages)
