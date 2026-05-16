# 03 — Brand Identity Gap Analysis
_Date: 2026-05-16_

## Executive summary

The two identities are roughly **70 % apart visually but 90 % aligned philosophically**. Both target "calm, dense pro tool for adults" (Stripe/Linear/Vercel-style restraint), both lean on zinc neutrals with `#09090b` as the deepest ink. The gap is concentrated in three places: **(1) brand mark** — marketing has "K + KDPBook" wordmark in Playfair Display, app has a placeholder black "A" square + plain "Ads Tracker"; **(2) accent color** — marketing standardises on emerald `#10b981` everywhere primary/active/CTA, app has no accent at all (just zinc-on-zinc with a stray cool violet `#6E56CF` buried in 4 chart files left over from `DESIGN.md`); **(3) display typography** — marketing relies on **Playfair Display** for editorial headlines and **JetBrains Mono** for numbers, app uses system sans for everything.

There's also a forgotten **third identity** in `/DESIGN.md` (Geist Sans + violet) that the codebase never fully adopted — it's dead weight and should be deleted, not migrated. The biggest single decision is **rename Ads Tracker → KDPBook**: it's about **40 file touches** (~20 in source, 5 in i18n EN, 0 in i18n RU, ~15 in docs/forge), low semantic risk because the i18n layer already abstracts the visible string. I recommend a **partial rename now** (window/app title, sidebar wordmark, OS metadata = "KDPBook") plus a positioning subtitle "Ads Tracker" kept where it adds informational value (header, About panel), so users searching their dock or settings still find it. Right scope for option B: **tokens + chrome + page-header typography + one accent reapplication pass**. Out of scope: Lenis, Framer-motion entrance animations, dark-mode redesign, mega-menu navigation, marketing-style hero illustrations.

---

## Logo / wordmark

**Current state (real app):**
- `src/renderer/components/MainLayout.tsx:315-321` — `<div className="w-6 h-6 rounded-md bg-zinc-900">A</div> Ads Tracker v0.1.0`. Plain bold "A" on black tile. Wordmark is system sans.
- `src/index.html:16` — `<title>Ads Tracker</title>`.
- `package.json:3` — `"productName": "Ads Tracker"`.
- `src/index.ts` — sets `app.setName('Ads Tracker')`, About panel `applicationName`, crash-dialog titles, hang-dialog title (5 occurrences).
- `forge.config.ts:84,102,118` — Squirrel installer name `AdsTracker`, custom-protocol display name `'Ads Tracker'`, comment text.
- `assets/icon.icns`, `assets/icon.png` — current dock icon (referenced from `forge.config.ts:96,120`). Not inspected; assumed to be the same "A" black tile.
- README.md, CLAUDE.md, RUFLO-USAGE.md, NEXT-SESSION-PROMPT*.md, DESIGN.md, plus 9 files in `docs/electron-migration/` mention "Ads Tracker" — total **~15 docs files**.

**Target state (marketing brand):**
- Logo mark = "K" glyph in **Playfair Display 700 emerald** (`#10b981`) on **black** (`#09090b`) `rounded-lg` tile (book-platform `components/landing/Navbar.tsx:79-88`, `components/dashboard/Sidebar.tsx:60-68`).
- Wordmark = `font-display text-lg font-bold tracking-tight` rendering "KDPBook" in Playfair Display.
- Tile size in marketing nav `h-8 w-8`; in dashboard sidebar `h-7 w-7`. App header is currently `w-6 h-6` — close enough, bump to `w-7 h-7` to match dashboard density.

**Quantified touch list (rename "Ads Tracker" → "KDPBook"):**

| Location | Count | Touch type |
|---|---|---|
| `src/` runtime strings (MainLayout header, html title, index.ts (5), api notes, ReportsPage export label, briefing notification, logger comment, local-db comment) | 11 | string change |
| `src/renderer/i18n/resources/en/*.json` (auth.appName, settings.appNameValue, settings.intro) | 3 | i18n string change |
| `src/renderer/i18n/resources/ru/*.json` | 0 | (none — "Ads Tracker" only in EN locale) |
| `package.json` (productName, description) | 2 | metadata |
| `forge.config.ts` (squirrel name, protocol name, comment) | 3 | build config |
| `assets/icon.*` (icns, ico, png — Win/Mac/installer) | 3 files | regenerate from "K" mark |
| Docs (README, CLAUDE.md, NEXT-SESSION-PROMPT*, RUFLO-USAGE.md, docs/electron-migration/* x9, DESIGN.md) | ~15 | descriptive prose |
| **Test snapshots / assertions** asserting on visible text | small (none found checking visible name in tests) | n/a |

**Recommendation: Hybrid.**

Rename the surface brand to **KDPBook** in:
- Sidebar logo (`MainLayout.tsx:315-321`) → "K" emerald on black + `font-display` "KDPBook".
- HTML title (`src/index.html:16`) → `KDPBook`.
- App metadata (`package.json` productName, `forge.config.ts` Squirrel name `KDPBook`, `appBundleId` left alone — bundle IDs are forever, changing them breaks auto-update + signed install upgrades, see [05-packaging-and-signing.md]).
- Native dialogs (`index.ts` x5) → "KDPBook".
- macOS About panel (`index.ts:73`) → "KDPBook".
- i18n: `auth.appName`, `settings.appNameValue` → "KDPBook".

Keep "Ads Tracker" as **a descriptive tagline** under the wordmark, opt-in. E.g. header reads `[K] KDPBook · Ads Tracker  v0.1.0`. This way:
- Users searching their dock by old name (or who knew the product as "Ads Tracker") still find a familiar word.
- The product position ("ads tracking module of KDPBook") is honest — KDPBook the platform has 5 modules (Ads / Analytics / Publishing / AI / Marketplace), and the desktop app is currently only the Ads module surface.

Do **not** rename `appBundleId` (`com.juli374.ads-tracker`) — breaks signed-app upgrades, preferences directory (`~/Library/Application Support/Ads Tracker`), and `electron-updater` channel. Don't rename the GitHub repo or `auto-updater` URL. Don't rename the URL scheme `ads-tracker-desktop://` (deep links rely on it; can add an alias `kdpbook://` later).

---

## Color palette mapping

Real app today reads as **black-and-white on zinc-50**. There is no consistent accent — semantic colors appear (emerald-500 for "online", red for "offline", emerald-50/red-50 for status pills) but **no single brand accent** runs through CTAs, focus rings, active nav, or charts. Charts use a dead violet `#6E56CF` in 4 files (`searchTerms/TrendModal.tsx:29`, `searchTerms/RankHistoryModal.tsx:187`, `reports/HourlyTab.tsx:138`, `reports/BudgetPacingTab.tsx:107`) that was specced in `DESIGN.md` but never propagated.

| Token | Current value | Current file refs | Target value | Notes |
|---|---|---|---|---|
| **brand-primary (deep ink)** | `rgb(9 9 11)` aka zinc-950 | `tailwind.config.js:30,31` (`foreground`, `ring`), MainLayout `bg-zinc-900` | `#09090b` | identical — no change |
| **brand-primary-light** | `rgb(24 24 27)` zinc-900 | dark-mode surfaces in `index.css` | `#18181b` | identical — no change |
| **brand-accent (emerald, primary CTA + active state)** | none; sidebar active = `bg-zinc-100`, no buttons use emerald | MainLayout `:431-433` (active item), CampaignsPage `:457` (Active pill only) | `#10b981` (`oklch(0.73 0.17 162)`) | **Net new.** Apply to: primary buttons, sidebar active-state (background tint OR left bar), focus ring (`--ring`), chart primary line, CTA links, status "Active". |
| **brand-accent-light (hover)** | n/a | n/a | `#34d399` | Hover state for accent buttons. |
| **brand-accent-subtle (background tint)** | n/a | n/a | `#10b98115` (alpha 8 %) | For sidebar active row background, "Live" badge background, primary-tinted card. |
| **background (canvas)** | `rgb(255 255 255)` (header/sidebar), zinc-50 (page body via MainLayout `:378`) | `tailwind.config.js:32`, MainLayout | `#fafafa` body / `#ffffff` surface | already very close (#fff vs #fff, zinc-50 = `#fafafa`). No semantic change. |
| **surface-elevated (card)** | `bg-white` everywhere | every card | `#ffffff` | identical |
| **border** | `rgb(228 228 231)` zinc-200 | `tailwind.config.js:29` | `#e4e4e7` (zinc-200) | identical |
| **foreground-muted** | zinc-500 / zinc-400 (mixed) | tailwind, MainLayout | `#71717a` (zinc-500) | identical — pick zinc-500 as canonical, retire ad-hoc zinc-400 captions. |
| **modules.ads** | emerald-500 used loosely as "good" | Kpi `tone:positive` | `#10b981` | Same hue as brand-accent — semantically perfect: Ads module = brand accent. |
| **modules.analytics** | none defined; charts use violet `#6E56CF` | TrendModal, RankHistory, HourlyTab, BudgetPacing | `#3b82f6` (blue) | Replace `#6E56CF` → `#3b82f6` in 4 chart files. Reads better against emerald + reuses existing `text-blue-*` semantics for "info" pills. |
| **modules.publishing** | n/a | n/a | `#8b5cf6` (purple) | only needed if publishing UI surfaces appear — currently none. Reserve token. |
| **modules.ai** | violet-100/700 used for "Pro" badge | MainLayout `:447`, LockedFeature.tsx, settings/AITab.tsx | `#f59e0b` (amber) | **Decision needed.** AI feature locks currently render as violet badges. Mockup uses amber for AI module. Recommend: **switch lock badges to amber** to match brand modules + free violet for retirement. Amber is also already used for warnings — coexists fine (different shapes: rounded-full pill for locks, rounded-md pill for warnings). |
| **modules.marketplace** | n/a | n/a | `#f43f5e` (rose) | unused in app, reserve token only. |
| **success** | emerald-600 / emerald-500 | Kpi.tsx, KpiDelta.tsx, ToastContext.tsx, MainLayout connection dot, status pills | `#10b981` | same family — no perceptual change needed, just unify on a single shade (`emerald-500` for dots, `emerald-600` for foreground text). |
| **warning** | amber-500 / amber-700 | various Settings tabs | `#f59e0b` (amber-500) | identical. |
| **error** | red-500 / red-600 | Kpi `tone:negative`, MainLayout offline dot, toast | `#ef4444` (red-500) | identical. |
| **ring (focus)** | zinc-900 | `tailwind.config.js:30` | emerald (`oklch(0.73 0.17 162)`) | Switch focus ring to emerald — biggest "feels new" change for almost zero diff. |

**Dead tokens to retire:**
- `#6E56CF` (cool violet from old `DESIGN.md`) → replace with `#10b981` (primary chart) and/or `#3b82f6` (secondary). 4 chart files.
- `violet-100/violet-700` lock badges (MainLayout, LockedFeature, AITab) → `amber-100/amber-700`. ~10 files.

---

## Typography mapping

**Current:** real app uses one font family — the system stack defined in `tailwind.config.js:8-16` (San Francisco on macOS, Segoe on Windows, etc.). No serif anywhere. `tabular-nums` only on Kpi (`Kpi.tsx:29`) — applied inconsistently elsewhere.

**Target (design-dna.json):**
- **Display:** Playfair Display 700–900, tracking `-0.02em`, serif. "Says we know books while colors say we mean business."
- **Heading:** Inter 600–700.
- **Body:** Inter 400–500.
- **Mono:** JetBrains Mono — metrics, data tables, code.

**Honest take on Playfair Display in a dense data dashboard:**

Playfair is editorial — designed for magazine spreads at 32px+. It works **gorgeously** at 48–96px (marketing hero `clamp(3rem, 8vw, 8rem)`), **decently** at 28–40px (`PageHeader` `clamp(1.75rem, 3.5vw, 2.5rem)` in dashboard mockup), and **awkwardly** below 24px. It has high stroke contrast — at 14px UI sizes it reads as fussy and the thin strokes lose contrast on most monitors. Putting it on table headers, button labels, modal titles, or sidebar items would **fight the "quiet pro tool" direction** of the rest of the system.

The marketing mockup itself uses Playfair only for **hero + section H1 + dashboard page header** — and uses **Inter** for everything inside the dashboard chrome. That's the correct boundary.

**Recommendation:**

| Use case | Current | Target | Files affected | Recommendation |
|---|---|---|---|---|
| Window/sidebar wordmark ("KDPBook") | system sans, font-semibold | **Playfair Display 700** | `MainLayout.tsx:318-320`, 1 line | Adopt — the only place it appears in the chrome. ~30 chars total, weight differential is the "moment of brand." |
| Page header H1 (per-page, ~28px) | `text-3xl font-semibold tracking-tight` system sans (`PageHeader.tsx:11`) | **Playfair Display 700** with tracking `-0.02em` | `src/renderer/components/ui/PageHeader.tsx` — single source — used by every page | Adopt. This is the second editorial moment. Each page now opens with a serif title that says "this is a Real Product." Inter remains for everything below. |
| Section H2 (within page, ~18-22px) | system, font-semibold | **Inter 600** | many files | Adopt Inter (already system-like), gain consistency cross-platform. No serif. |
| Body / UI labels | system sans | **Inter 400–500** | tailwind.config base | Swap font stack. Visual diff is mild (Inter looks like SF Pro). |
| Table headers / column labels | system, text-zinc-400 uppercase | **Inter 600 uppercase tracking-wider** | unchanged | Inter inherits — no per-component change. |
| **Numbers in metrics / table cells / KPIs / chart axes** | system sans `tabular-nums` | **JetBrains Mono `tabular-nums`** | `Kpi.tsx`, `KpiDelta.tsx`, all table cells with money/percent/counts, all Recharts `<XAxis>` / `<YAxis>` labels | **Adopt selectively.** Apply `font-mono` to: `Kpi` value, `KpiDelta`, money cells, chart tick labels. **Do not** apply to ordinary digits embedded in prose ("3 books selected") — that's overkill. |
| Inline code, key shortcuts (⌘K) | already font-mono via Tailwind default | **JetBrains Mono** | MainLayout `:338`, CommandPalette | already there — just change the loaded font family. |
| Button labels | system sans | **Inter 500–600** | many | Inter inherits, no per-button change. |

**Font loading:**

Marketing uses `next/font/google` (`app/layout.tsx:1-22`) — Inter, Playfair, JetBrains all loaded at build with `--font-*` CSS variables. The Electron app can't use `next/font` but the CSP already permits `https://fonts.googleapis.com` and `https://fonts.gstatic.com` (`src/index.html:14`). Two options:

1. **CDN (1-day)**: add `<link rel="preconnect"> + <link href="...family=Inter:...&family=Playfair+Display:...&family=JetBrains+Mono:...">` to `src/index.html` `<head>`. Online-only; needs cached or fallback for offline. CSP already allows it.
2. **Self-host via `@fontsource/inter`, `@fontsource/playfair-display`, `@fontsource/jetbrains-mono` (2-day)**: import in `src/renderer.tsx`, webpack bundles. Works offline. ~280 KB total at woff2/latin-only. Add to bundle budget.

Recommended: **self-host** (option 2). Electron app should not break offline; the desktop split bundle of ~280 KB for three font families is acceptable and one-time. Already aligned with `DESIGN.md` note about self-hosting.

---

## Motion / animation

Marketing site (`design-dna.json` motion block + `LenisProvider`, every component using framer-motion):
- **Lenis smooth scroll** on `<html>`.
- **Entrance:** `fade-up` 0.6s `ease-out` with `cubic-bezier(0.16, 1, 0.3, 1)` on every section / card.
- **Stagger:** 0.1s between children.
- **Magnetic buttons** that lean toward the cursor (`MagneticButton.tsx`).
- **MeshGradient + CursorGlow + animated topo SVG paths** in hero.

Real app: zero motion tokens. Sidebar `transition-colors duration-100`. NavItem hover `transition-opacity`. Loader2 spin from lucide-react. That's it.

**Honest take for Electron dashboard:**

Lenis, magnetic buttons, mesh gradients are **wrong** for this product. Users open the app dozens of times a day, scan tables, drill into campaigns. Lenis adds momentum lag that makes scrolling feel "stuck"; magnetic buttons read as distracting cleverness; framer-motion staggered entrances on every page transition will be **annoying** by the third reload of the day. The marketing site's motion sells a vibe to first-time visitors; the desktop app sells **fast access to data**.

**Keep:**
- `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo) as the **single shared easing token** — apply to `transition-colors`, modal slide-ins, dropdown open, page-fade-on-load. 200–300 ms duration max.
- Subtle **fade-in on first paint** for the page content (250 ms opacity 0→1) — softens the "harsh empty → harsh full" frame transition.
- Existing `transition-colors duration-100` on nav items — already aligned.

**Drop:**
- Lenis (`html.lenis-*` rules in marketing `globals.css:169-185`) — antithetical to power-user scrolling. Native scroll is the right answer.
- Framer-motion entrance animations on dashboard cards. Cards just appear; if you must, opacity-only at 150 ms.
- Magnetic buttons. Use a flat hover `bg-emerald-700` color shift, period.
- Mesh gradient backgrounds. Solid surfaces.
- Stagger animations. Lists are already paginated; stagger doubles the perceived load latency.

**Tokens to add (minimal):**
```
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
--duration-fast: 100ms;
--duration-base: 200ms;
--duration-modal: 300ms;
```
Use in `tailwind.config.js` `extend.transitionTimingFunction` + `transitionDuration`.

---

## Brand boundary decision

**Recommendation: Hybrid (renamed to "KDPBook" with descriptive "Ads Tracker" subtitle where useful).**

Reasoning:

1. **The marketing site is the source of truth for brand.** It's where users discover the product. If the desktop app loads with "Ads Tracker" in the dock, but they downloaded "KDPBook" from kdpbook.click, that's a trust gap on first launch.
2. **"Ads Tracker" is not a brand — it's a category.** Renaming costs 11 source files + 3 i18n strings + 5 build/config + ~15 doc references = ~34 file touches. Net ~half a day of work, mostly mechanical. The i18n abstraction already exists (`auth.appName`, `settings.appNameValue`) — those are *single-string* changes that propagate.
3. **The platform plan is bigger than ads.** `design-dna.json` lists 5 modules (Ads, Analytics, Publishing, AI, Marketplace). Today the desktop app surfaces Ads + Analytics + AI (Niche Explorer, Listing Studio, Weekly Briefing) + Royalties + P&L. It's already **most of KDPBook**, not just "an ads tracker." The current name **understates the product** and will become more wrong with every Phase L/M lane shipping AI/publishing surfaces.
4. **Don't change foundational identifiers**: `appBundleId = com.juli374.ads-tracker` stays (changes break signed-update + preferences); URL scheme `ads-tracker-desktop://` stays (deep links rely on it); GitHub repo `Juli374/ads-tracker-desktop` stays (release URL is hardcoded in `electron-updater`). All three are *invisible* to users — renaming them costs trust + auto-update breakage with **zero** UX gain.
5. **Where to keep "Ads Tracker" as a tagline**: under the wordmark in the header (`[K] KDPBook · Ads Tracker`), in the About panel description, in the README first paragraph. It positions the app correctly ("the Ads module of the KDPBook platform, on your desktop") without confusing returning users.

Don't pick "keep current" — the visual gap is wide enough that, after running option B's other work, the wordmark/title would be the only thing still saying "Ads Tracker" while everything else looks like KDPBook. That mismatch is worse than committing to either side.

Don't pick "full rename including bundle ID" — breaks auto-update, breaks user-data directory location, breaks signed-package upgrades. Out of scope for a 3–5 day pass.

---

## In-scope vs out-of-scope for Option B

| Area | In | Out | Why |
|---|---|---|---|
| Tailwind tokens | New `brand-primary`, `brand-accent`, `brand-accent-light`, `brand-accent-subtle`, `module-ads/analytics/ai`, easing tokens | Full migration to OKLCH | OKLCH is fine in theory; converting all existing zinc-* utility usages is a multi-week effort with no visible payoff. Add new tokens, leave zinc in place. |
| Color repaint | Sidebar active state (use `brand-accent-subtle` background + `brand-accent` left border or text), focus ring (emerald), primary CTA buttons, "Live"/"Active" badges, chart primary line | Repainting every single zinc-X to emerald-X | No need. The system is already neutral; we just need ONE accent reapplied at the right surfaces. |
| Replace dead violet `#6E56CF` | 4 chart files → `#10b981` (primary) and/or `#3b82f6` (secondary) | n/a | Trivial. |
| Lock-badge violet → amber | `MainLayout.tsx`, `LockedFeature.tsx`, `settings/AITab.tsx`, ~10 files | n/a | Aligns AI feature locks with `modules.ai = #f59e0b`. |
| Typography (chrome) | Wordmark + `PageHeader` H1 in Playfair Display 700 | Body / table / button repaint to Inter | Playfair only where editorial moment is wanted. Body sans is fine in the system stack until Phase 2. |
| Typography (data) | `JetBrains Mono` on Kpi values, KpiDelta, money/percent cells in tables, Recharts axis labels | Mono on prose digits | Targeted; reinforces "data is data." |
| Typography (body switch) | Self-host Inter via `@fontsource/inter`, swap font stack in `tailwind.config.js` | Self-host all weights of all families before measuring bundle | Inter at 400/500/600/700 = ~80 KB woff2. Acceptable. |
| Wordmark | "K" emerald-on-black tile, Playfair 700, "KDPBook" wordmark Playfair | New SVG/PNG icns / ico regenerated from "K" | Logo image refresh can ship as a follow-up; the in-app wordmark is enough for the first ship. |
| Rename | `productName`, `html title`, native dialogs, i18n appName, sidebar wordmark, README/CLAUDE.md/docs prose, Squirrel installer name | `appBundleId`, URL scheme, GitHub repo, `electron-updater` URL, user-data directory | First set is free + reversible. Second set permanently breaks auto-update / signed installs. |
| Motion | One shared `--ease-out-expo` token, optional 250 ms page-fade-in | Lenis, framer-motion, magnetic buttons, mesh gradients, cursor glow, animated topo | Wrong tier for a desktop power tool. |
| Dark mode | Leave the existing `index.css` zinc-inversion in place; verify the emerald accent has enough contrast in dark and tune `oklch(0.73 0.17 162)` if needed | Redesign dark surfaces with new tokens | Already shipped (Phase B); option B is a cosmetic pass, not a dark-mode rebuild. |
| Page chrome | Logo + wordmark swap, ConnectionIndicator emerald dot already correct, sync pill, header background | Mega-menu navigation, marketing-style footer, hero illustrations | This is a desktop app, not a marketing page. |
| Pricing / module landing pages | n/a | porting `components/marketing/TierCard`, `ModuleLanding` | Belongs in the public release lane (Phase 5/6 of master-plan), not B. |

---

## Concrete migration list (file-level)

**Token foundation (Day 1):**
- `tailwind.config.js` — add `colors.brand.primary/accent/accent-light/accent-subtle`, `colors.module.*`, `transitionTimingFunction.brand`, `transitionDuration.fast/base/modal`. Update `ring` → emerald oklch.
- `src/index.css` — load self-hosted fonts (`@fontsource/inter`, `@fontsource/playfair-display`, `@fontsource/jetbrains-mono` via `import` in `renderer.tsx`); add CSS vars `--font-display`, `--font-sans`, `--font-mono`.
- `tailwind.config.js` `fontFamily` — `sans: ['Inter', ...current system stack]`, add `display: ['Playfair Display', 'serif']`, add `mono: ['JetBrains Mono', 'ui-monospace', 'monospace']`.
- `package.json` — add deps `@fontsource/inter`, `@fontsource/playfair-display`, `@fontsource/jetbrains-mono`.

**Brand mark (Day 1):**
- `src/renderer/components/MainLayout.tsx:315-321` — swap "A" → "K", black tile remains, glyph in `font-display text-xs font-bold text-emerald-500`, wordmark `<span className="font-display text-sm font-bold tracking-tight">KDPBook</span><span className="text-[10px] text-zinc-400 ml-1">· Ads Tracker · v0.1.0</span>`.
- `src/index.html:16` — `<title>KDPBook</title>`.
- `src/index.ts` lines 23, 38, 66, 73, 175, 213 — replace "Ads Tracker" → "KDPBook".
- `package.json:3,5` — `"productName": "KDPBook"`, description.
- `forge.config.ts:84` — `name: 'KDPBook'`; `:102` protocol name `'KDPBook'`. (Leave `appBundleId`, scheme, repo alone.)
- `src/renderer/i18n/resources/en/auth.json` — `appName: "KDPBook"`.
- `src/renderer/i18n/resources/en/settings.json` — `appNameValue: "KDPBook"`, update intro string.
- `assets/icon.png` / `icon.icns` / `icon.ico` — regenerate from new "K" mark. (Can ship in a follow-up commit; old icon stays usable.)

**Page header typography (Day 2):**
- `src/renderer/components/ui/PageHeader.tsx` — `<h1 className="font-display text-[clamp(1.75rem,3.5vw,2.5rem)] font-bold tracking-tight">` (was `text-3xl font-semibold tracking-tight`). Single source — all 21 pages benefit.

**Accent reapplication (Day 2–3):**
- `src/renderer/components/MainLayout.tsx:431-433` — sidebar active state. Change `bg-zinc-100 text-zinc-900` → `bg-emerald-50 text-zinc-900` + left-border `border-l-2 border-emerald-500` (or color the icon emerald, leave background tinted).
- Active icon color `:439` — `text-emerald-600` when active.
- `tailwind.config.js` ring → emerald (focus ring everywhere).
- Replace `bg-zinc-900 text-white hover:bg-zinc-800` primary buttons with `bg-emerald-500 text-white hover:bg-emerald-600` where the button is primary CTA (Add Campaign, Save, Apply). Search: `bg-zinc-900` in `src/renderer/`.
- `src/renderer/pages/CampaignsPage.tsx:457` — already emerald (Active pill). Confirm contrast against `emerald-50` background.

**Mono numerals (Day 3):**
- `src/renderer/components/ui/Kpi.tsx:29` — add `font-mono` to value `div`.
- `src/renderer/components/ui/KpiDelta.tsx` — same.
- Recharts axis labels in `HeroChart.tsx`, `HourlyDynamicsChart.tsx`, `PnLChart.tsx`, `MarketplaceDistribution.tsx`, etc. — add `tick={{ fontFamily: 'JetBrains Mono' }}`.
- Money cells in tables — touch `BooksPage.tsx`, `CampaignsPage.tsx`, `KeywordsPage.tsx`, `SearchTermsPage.tsx`, `PnLPage.tsx`, `ReportsPage.tsx` cell renderers to add `font-mono tabular-nums`. Likely ~10–15 small edits.

**Retire dead violet (Day 3):**
- `src/renderer/components/searchTerms/TrendModal.tsx:29` — `#6E56CF` → `#10b981`.
- `src/renderer/components/searchTerms/RankHistoryModal.tsx:187` — `#6E56CF` → `#10b981`.
- `src/renderer/components/reports/HourlyTab.tsx:138` — heatmap interpolation white → `#10b981`.
- `src/renderer/components/reports/BudgetPacingTab.tsx:107` — `#6E56CF` → `#10b981`.
- Search `src/renderer/` for `violet-100|violet-700|bg-violet|text-violet` → replace with `amber-100|amber-700|bg-amber|text-amber` (lock badges).
- Update `index.css:53,67` violet bg/border dark-mode mapping accordingly.

**Motion (Day 4, optional):**
- `tailwind.config.js` — add `transitionTimingFunction.brand: cubic-bezier(0.16, 1, 0.3, 1)`.
- Page `<main>` mount in `MainLayout.tsx:378` — wrap content in a `<div className="animate-in fade-in duration-200 ease-out">` (or use `tw-animate-css` later).

**Docs prose (Day 4–5):**
- `README.md` first paragraph — "KDPBook desktop (the Ads module + ...) — Electron client for ...".
- `CLAUDE.md` — top section rename.
- `DESIGN.md` — **rewrite** to match new design-dna or **delete**. It currently specifies Geist Sans + violet, neither of which we're adopting. Either replace with a short pointer ("See `../book-platform/design-dna.json` for the brand source of truth") or rewrite the section to match this audit. Recommend delete + replace with a 30-line "Desktop adaptation of KDPBook DNA" doc.
- `docs/electron-migration/README.md`, `parity-plan.md`, `master-plan-2026-05-10.md` — replace "Ads Tracker" in prose where it appears as a brand name (not where it refers to the *backend project repo* `Juli374/ads-tracker`).

**Total estimated effort (one engineer):**
- Day 1 — tokens + brand mark + window/title rename (~3 h coding, ~1 h tests/i18n).
- Day 2 — page header serif + initial accent reapplication on sidebar/buttons (~5 h).
- Day 3 — mono numerals across Kpi/charts/tables + retire violet (~6 h).
- Day 4 — motion polish + docs (~3 h).
- Day 5 — slack for QA, icon regen, screenshot dogfood, fix-as-found.

Lands inside the 3–5 day budget. Outcome: app reads as "KDPBook (Ads module) on the desktop" — same family as the marketing site, same emerald accent, editorial serif on page titles, mono on numbers, restraint everywhere else.
