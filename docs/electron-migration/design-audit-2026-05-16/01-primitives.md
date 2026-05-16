# 01 — Design System Primitives Audit
_Date: 2026-05-16 · Reviewer: claude-code/code-analyzer_

## Executive summary

The repo currently runs **two unfinished design systems in parallel**, and only one of them actually works. The older "v1" zinc system (`Card`, `Kpi`, `KpiDelta`, `RangePicker`, `States`, `Skeleton`, `ChartTooltip`, `EditableNumber`, `ExportMenu`, `Pagination`, `ActiveFiltersBar`, `WeeksSegment`) is widely adopted (~250 imports), visually consistent, and hardcoded to zinc/emerald/red Tailwind colors. The newer "v2" semantic-token system (`Badge`, `Button`, `Input`, `NavItem`, `Num`, `DataTable`) was authored to a DESIGN.md spec — but **none of its tokens are defined in `tailwind.config.js` or `src/index.css`**, so classes like `bg-accent-soft`, `text-fg-muted`, `border-border`, `bg-surface-2`, `bg-success-soft`, `text-fg-subtle` resolve to nothing. These primitives ship invisible / unstyled and have effectively zero adoption (Badge=0, Button=1, Input=0, DataTable=0, NavItem=0 page-level imports).

The leverage points for the redesign are clear: **(1)** define the v2 tokens in tailwind config (the primitives are already written and waiting), **(2)** convert the `Card` primitive (33 imports, 64 JSX usages — by far the highest leverage) to the new tokens, and **(3)** add ~5 missing primitives (`SegmentedControl`, `Modal`, `Tabs`, `StatusBadge`, `MetricNumber`) that pages currently inline 20+ times. The good news: there is **zero use of `text-muted-foreground`** and the codebase is fully on Tailwind utilities — no CSS-in-JS, no styled-components, no Cloudscape residue. A token-level refactor is mechanical, not architectural.

Target brand (`book-platform/design-dna.json`) wants emerald accent (`#10b981`), Playfair Display display font, JetBrains Mono for metrics, gradient charts, and module colors — but `DESIGN.md` in this repo specs violet (`#6E56CF`) + Geist. **The two reference docs disagree** — the redesign will need a decision before implementation. This audit assumes the design-dna.json target (per task brief).

## Existing primitives

| Primitive | File | Usages | Props summary | Quality (1-10) | Notes |
|---|---|---|---|---|---|
| Card | `ui/Card.tsx` | **33 imports / 64 JSX** | `title?, rightSlot?, className?, bodyClassName?, children` | 8 | Highest-leverage primitive. Clean API. Hardcoded `bg-white border-zinc-200 rounded-lg shadow-soft`. Single biggest token-migration target. |
| EmptyState | `ui/States.tsx` | **25 / 38** | `title?, hint?` | 7 | Widely adopted. i18n-aware. Plain text only — no illustration slot. |
| ErrorBanner | `ui/States.tsx` | — / 18 | `message` | 7 | Used everywhere alongside EmptyState. Red-50/red-100/red-700 hardcoded. |
| LoadingRow | `ui/States.tsx` | — / 41 | `message?` | 7 | Spinner + optional caption. |
| Kpi | `ui/Kpi.tsx` | 1 / 20 | `label, value, hint?, loading?, tone` | 7 | Solid, used on Dashboard/PnL/Books. tone variants emerald-600/red-600. Hardcoded. |
| KpiDelta | `ui/KpiDelta.tsx` | 0 / 0 in pages, used internally | `label, value, change?, inverseChange?, ...` | 8 | Best-built primitive — `±%` arrow, inverse semantics, i18n. **Underused** (0 import in pages). |
| KpiSkeleton | `ui/Skeleton.tsx` | 0 | none | 6 | Visually matches KpiDelta. Unused. |
| Skeleton | `ui/Skeleton.tsx` | 0 page imports, internal | `width?, height?, className?, rounded` | 7 | Cleanly composable. `rounded` is enum-style — fine. |
| TableRowSkeleton | `ui/Skeleton.tsx` | 1 | `columns?, firstColWide?` | 6 | Used 3 places. |
| TableSkeletonBody | `ui/Skeleton.tsx` | 3 | `rows?, columns?` | 7 | Pre-shaped tbody. Nicely abstracted. |
| ChartTooltip | `ui/ChartTooltip.tsx` | 4 / 11 | `active?, title?, rows?` | 8 | Recharts adapter — props are clean. `shadow-soft` + min-w 140px. |
| PageHeader | `ui/PageHeader.tsx` | 6 / 12 | `title, subtitle?, rightSlot?` | 6 | Too thin — just an h1+p+slot. Doesn't enforce font-display or vertical rhythm. Many pages skip it. |
| RangePicker | `ui/RangePicker.tsx` | 0 page imports, used in App | full feature: range buttons + refresh + auto-refresh | 8 | Self-contained, complex, well-tested. Hardcoded zinc + emerald accent. |
| WeeksSegment | `ui/WeeksSegment.tsx` | 0 page imports | reads context | 6 | Same shape as RangePicker buttons — **duplication candidate** for `SegmentedControl`. |
| ActiveFiltersBar | `ui/ActiveFiltersBar.tsx` | 0 / 7 | `chips: {label, onRemove}[]` | 7 | Clean. Used by Campaigns / Reports / SearchTerms. |
| ExportMenu | `ui/ExportMenu.tsx` | 1 / 0 ? | `items, disabled?, testId?, buttonLabel?` | 8 | Polymorphic (single button vs dropdown). Outside-click handling. |
| Pagination | `ui/Pagination.tsx` | 0 / 0 ? grep undercount | `page, pages, total, perPage, onChange` | 7 | Compact prev/next + range label. Returns null when pages≤1 — good. |
| EditableNumber | `ui/EditableNumber.tsx` | 1 / 0 | `value, onSave, format?, min?, max?, step?, ...` | 9 | Best UX of the set — Enter/blur/Esc + sentinel, optimistic rollback on error. |
| Num | `ui/Num.tsx` | 0 | wraps span with `font-mono tabular-nums tracking-tight` | 5 | **Tokens broken-adjacent: uses `font-mono` but config has no `mono` family — falls back to browser default.** Zero adoption. |
| Badge | `ui/Badge.tsx` | 0 | `variant: success/warning/error/info/neutral, dot?` | 3 | **Broken classes** — `bg-success-soft`, `text-success`, `bg-error-soft`, `text-fg-muted` are undefined. Renders unstyled. |
| Button | `ui/Button.tsx` | 1 / 0 | `variant, size, leftIcon?` | 3 | **Broken classes** — `bg-accent` resolves to `rgb(244 244 245)` (Tailwind extend), but `bg-accent-hover`, `text-accent-fg`, `border-border-strong`, `ring-accent-soft` are undefined. |
| Input | `ui/Input.tsx` | 0 | base input | 2 | **Broken classes** — `bg-surface`, `text-fg`, `border-border`, `focus:border-accent`, `ring-accent-soft`, `placeholder:text-fg-subtle` all undefined. |
| NavItem | `ui/NavItem.tsx` | 0 | `icon?, label, active?, count?, onClick, ...` | 3 | **Broken classes** — `bg-accent-soft`, `text-accent`, `text-fg-muted`, `text-fg-subtle`, `hover:bg-surface-2`. **MainLayout doesn't even import it** — uses its own inline `NavItemRow` (line 408). |
| Table/Thead/Tbody/Tr/Th/Td/DataTable | `ui/DataTable.tsx` | 0 page imports | minimal wrappers | 2 | **Broken classes** — `text-fg`, `bg-bg`, `text-fg-subtle`, `border-border`, `hover:bg-surface-2`. Pages render raw `<table>` instead. |

## Inline-styled duplicates (anti-patterns)

The exact pattern `bg-white border border-zinc-200 rounded-md p-0.5` (a segmented-control container) is inlined in **10 different files**, identical every time — `WeeksSegment` already exists for one specific use, but a generic `SegmentedControl` is missing:

- `pages/BooksPage.tsx:529` — `<div className="inline-flex items-center bg-white border border-zinc-200 rounded-md p-0.5">` (status filter)
- `pages/CampaignsPage.tsx:589` — same shape (`rounded-md h-7 px-1.5 gap-1.5`) for state filter
- `pages/KeywordsPage.tsx:591` — `inline-flex bg-white border border-zinc-200 rounded-md p-0.5` (sort selector)
- `pages/ReportsPage.tsx:735` — same shape (period toggle)
- `pages/SearchTermsPage.tsx` (2 places) — same shape
- `pages/PnLPage.tsx`, `pages/NegativesPage.tsx`, `pages/ResearchPage.tsx`, `components/AddCampaignModal.tsx:305,444`, `components/EditCampaignModal.tsx`, `components/AddTargetModal.tsx`, `components/NegativeListsTab.tsx` — same shape

Other duplications:

- **Modal frame** — `bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden` repeated verbatim in 6 places: `AddCampaignModal.tsx:216`, `EditCampaignModal.tsx`, `AddAdGroupModal.tsx`, `AddTargetModal.tsx`, `CommandPalette.tsx`, `LoginScreen.tsx` (twice). No `Modal` / `Dialog` primitive exists.
- **Popover** — `absolute right-0 ... bg-white border border-zinc-200 rounded-(md|lg) shadow-card overflow-hidden` repeated in `NotificationsBell.tsx`, `SearchTermsPage.tsx:298ish`, `ExportMenu.tsx` (the only one that abstracted it). No `Popover` primitive.
- **NavItem inlined** — `MainLayout.tsx:408-462` builds a full sidebar nav button by hand (`group flex items-center gap-2.5 w-full h-9 px-3 rounded-md text-sm ... bg-zinc-100 text-zinc-900 font-medium ...`) instead of using `ui/NavItem.tsx`. Reason: locked-feature Pro badge + shortcut hint — features `NavItem` doesn't support.
- **Card lite** — `pages/KeywordsPage.tsx:863` — `<div className="bg-white border border-zinc-200 rounded-lg">` (without shadow). Should be `<Card>`.

The Card primitive itself is well adopted (33 page-level imports), so the inline-Card cases are minor leakage. The segmented-control and modal cases are the loud ones.

## Tailwind config gaps

| Token | Current | Target (design-dna) | Action | Effort |
|---|---|---|---|---|
| Accent color | `accent.DEFAULT: rgb(244 244 245)` (= zinc-100, a *neutral*, not an accent) | `#10b981` (emerald-500) | Replace `accent` extend with emerald scale + `accent-soft`, `accent-hover`, `accent-fg` | S |
| Module colors | none | `ads:#10b981, analytics:#3b82f6, publishing:#8b5cf6, ai:#f59e0b, marketplace:#f43f5e` | Add to extend.colors.module.{ads,...} | S |
| Display font | system stack only | `Playfair Display` 700-900 | Load via Google Fonts in `index.html` + add `fontFamily.display` extend | S |
| Mono font | none — `font-mono` falls back to OS mono | `JetBrains Mono` | Same: load + add `fontFamily.mono` | S |
| Background | `background: rgb(255 255 255)` (white) | `#fafafa` (= zinc-50, *but* `bg-#fafafa` ≠ current page-bg) | MainLayout `<main>` uses `bg-zinc-50` (`#fafafa` ✓) — but `body` defaults to `bg-background` = `#ffffff`. Switch app-wide bg token to `#fafafa`. | S |
| Surface tokens | none | `surface:#ffffff, surface-2:#f4f4f5, surface-elevated:#27272a (dark)` | Add `surface`, `surface-2` to extend.colors | S |
| Foreground muted | `muted.foreground: rgb(113 113 122)` defined but **never used** (0 occurrences of `text-muted-foreground`) | `fg-muted:#71717a, fg-subtle:#a1a1aa` | Add `fg-muted`, `fg-subtle`. Convert primitives to consume them. | M (touches ~250 `text-zinc-500` and 239 `text-zinc-400` calls) |
| Border tokens | `border: rgb(228 228 231)` (= zinc-200) ✓ but not used (`border-zinc-200` x288 dominates over `border-border` x7) | `border:#e4e4e7, border-strong:#d4d4d8` | Add `border-strong`. Convert. | M |
| Status soft fills | none (used inline as `bg-emerald-50`, `bg-amber-50`, etc.) | `success-soft, warning-soft, error-soft, info-soft` | Add four semantic + soft variants | S |
| Shadow elevations | `soft`, `card` (2 tokens) | need `card` (1px ring), `popover` (md), `modal` (xl), `dropdown` (lg) | Add `shadow.popover, shadow.modal` | S |
| Border radii | mixed — `rounded-md` (298), `rounded-lg` (35), `rounded-sm` (26), `rounded-xl` (24), `rounded` bare (61) — **no system** | DESIGN.md says `6px buttons` / `8px cards` / `12px modals` | Encode in `borderRadius`: `btn:6px, card:8px, modal:12px, pill:9999px` | S |
| Animation curve | none | `cubic-bezier(0.16, 1, 0.3, 1)` (motion.curve) | Add `transitionTimingFunction.smooth` | XS |
| Animation durations | inline `duration-100`/`150`/`200` mixed | DESIGN.md: fast 100ms / base 150ms / slow 220ms | Optional: add semantic `duration.fast/base/slow` | XS |
| `bg-#fafafa` vs zinc-50 | n/a | **Confirmed identical** (`zinc-50 = #fafafa`) — no change needed for the value itself, just for the *default* page background | — | — |

## Spacing & color inconsistencies

Quantified evidence across `src/renderer/pages/` + `src/renderer/components/`:

- **Foreground mute** — `text-zinc-500` (253 occurrences), `text-zinc-400` (239), `text-zinc-600` (94). DESIGN.md spec `text-fg-muted` used 3×, `text-fg-subtle` 5×, `text-muted-foreground` (Tailwind extend) **0×**. The system has 3 muted-grays in active use with no semantic mapping.
- **Borders** — `border-zinc-200` (288), `border-zinc-100` (120), `border-border` (7). Inconsistent — `border-zinc-100` is used for "lighter rule lines" (Card body separators, table row borders) but never abstracted.
- **Page wrappers** — every page begins with `<div className="space-y-6" data-testid="...-page">`. Consistent. ✓
- **Inner padding** — wildly inconsistent across pages. Sampled: DashboardPage uses `gap-{2,2.5,3,4}` and `px-{3,5}`; BooksPage `gap-{1.5,2,2.5,3}` `px-{2,3,5}`; CampaignsPage `gap-{1,1.5,2,3}` `px-{1,2,3,5}`; KeywordsPage `gap-{1,2,3,4}` `px-{2,3,4}` and `py-10`; ReportsPage `gap-{1,1.5,2,3}` `px-{2,3,5}`. **No page restricts itself to a single gap scale.** Five different values for "small gap" is six values too many.
- **Border radius** — 298 `rounded-md` (~70%), 61 bare `rounded` (default), 35 `rounded-lg`, 26 `rounded-sm`, 24 `rounded-xl`. No semantic mapping — usage is by gut feel.
- **Shadow** — `shadow-card` (30), `shadow-soft` (6), `shadow-xl` (5), `shadow-lg` (2), `shadow-md/2xl` (1 each). `shadow-card` dominates and is well-defined. Modals leak to `shadow-xl` (raw Tailwind, not the project's `shadow.modal` token because there is none).
- **Emerald usage** — already 48 occurrences of `emerald-500/600/700` (success, KPI delta-positive, RangePicker auto-refresh, MainLayout connection dot). Migrating *neutral* accent to emerald will land in muscle memory.
- **Violet usage** — 55 occurrences (locked-feature "Pro" badge color in MainLayout:447, AlertsWidget severity, etc.). If emerald becomes the brand accent, violet should be reserved for "Pro tier" callouts only, per the current pattern.

## Missing primitives (proposed)

| Name | Purpose | Effort | Impact |
|---|---|---|---|
| `SegmentedControl` | Replace 10+ identical `inline-flex bg-white border rounded-md p-0.5` blocks (range/sort/state filters). RangePicker + WeeksSegment are special cases of this. | S | **High** — deletes ~50 lines of duplicated markup, locks visual consistency. |
| `Modal` / `Dialog` | Replace 6 identical modal frames (`AddCampaignModal`, `EditCampaignModal`, `AddAdGroupModal`, `AddTargetModal`, `CommandPalette`, `LoginScreen`). Should encapsulate scrim + Esc + focus trap. | M | **High** — unifies modal feel, fixes accessibility (focus trap currently DIY per modal). |
| `Tabs` | Mockup shows top-tabs (Ads / Analytics / Publishing / AI / Marketplace). Currently none — page-level nav is sidebar-only. | M | **Medium** — required if module-color UI is introduced. |
| `StatusBadge` | Sync state pill, ACOS health, alert severity. Variants: `active/paused/warning/error/info` mapped to module color or semantic. Existing `Badge` is broken; this can replace it. | S | **Medium** — also surfaces in tables a lot. |
| `MetricNumber` | Large display number in `font-mono tabular-nums` — Kpi value, weekly briefing headline, P&L headline. Currently inlined as `text-2xl font-semibold tabular-nums` in KpiDelta and ~10 other places. | XS | **Medium** — once `JetBrains Mono` is loaded, this becomes the right way to render big numbers. |
| `DisplayHeading` | Optional `font-display` (Playfair) variant of PageHeader for marketing-feel pages (Dashboard hero, weekly briefing). Per DESIGN.md, restrict to display-role contexts. | XS | **Low** — nice-to-have, only matters for ≤5 pages. |
| `GradientChart` (wrapper) | Recharts `<AreaChart>` + `<linearGradient>` fill preset matching the mockup's soft-fade emerald/violet area shape. | M | **Medium** — Dashboard, HourlyDynamicsChart, BookSeries get visually distinctive. |
| `Popover` | Generic anchored panel for filters / notifications / export menus. ExportMenu has an ad-hoc implementation; NotificationsBell rolls its own. | S | **Medium** — eliminates click-outside / Esc duplication. |

## Top-10 recommendations (ordered by impact / effort)

1. **Define the v2 design tokens in `tailwind.config.js`** (`accent` → emerald, plus `surface`, `surface-2`, `fg-muted`, `fg-subtle`, `border-strong`, `accent-soft`, `success`, `warning`, `error`, `info` and their `*-soft` variants). The primitives that consume them already exist — they just render unstyled today. _Effort: S, Impact: foundational._
2. **Pick a single source of truth between `DESIGN.md` (violet + Geist) and `design-dna.json` (emerald + Playfair + JetBrains Mono).** They disagree on accent, display font, and mono font. This must be resolved before any token work.
3. **Convert `Card` to the new tokens** (`bg-surface border-border shadow-card`). 33 imports + 64 inlined usages means one diff propagates everywhere. _Effort: S, Impact: highest visual leverage of any primitive._
4. **Add `SegmentedControl` primitive** and migrate the 10+ inline `bg-white border-zinc-200 rounded-md p-0.5` blocks. Refactor `WeeksSegment` and the period buttons in `RangePicker` to compose it. _Effort: S, Impact: deletes duplication + makes a future module-color theme trivial._
5. **Add `Modal` primitive** with scrim + Esc + focus trap. Refactor the 6 inlined modal frames. _Effort: M, Impact: a11y win + visual consistency._
6. **Load Playfair Display + JetBrains Mono** in `src/index.html` (Google Fonts link) and add to `fontFamily.display` / `fontFamily.mono`. Without this, `<Num>` and `MetricNumber` cannot show their intended look. _Effort: XS._
7. **Replace `text-zinc-500` / `text-zinc-400` with semantic `text-fg-muted` / `text-fg-subtle`** via codemod. 492 occurrences in scope. Set lint rule to forbid raw `text-zinc-*` in pages/ going forward. _Effort: M, Impact: future redesigns become global, not per-file._
8. **Adopt the radii system** (`rounded-btn`, `rounded-card`, `rounded-modal`, `rounded-pill`). 444 raw `rounded-*` occurrences — codemod by context (rounded-md → rounded-btn when on `<button>`, rounded-lg → rounded-card when on Card-like, rounded-xl → rounded-modal). _Effort: M._
9. **Fix `MainLayout`'s inlined nav** — either extend `NavItem` to support Pro badge + shortcut hint, or delete `NavItem` and accept that the sidebar nav lives in MainLayout. Right now `NavItem` is dead code masquerading as a primitive. _Effort: S._
10. **Build `StatusBadge` + `MetricNumber`** as the two new visible-everywhere primitives. They unlock the mockup's "data dashboard with character" feel without touching layout. _Effort: S + XS._

---

**Summary of broken primitives that need fixing first (before any redesign work):** `Badge`, `Button`, `Input`, `NavItem`, `Num`, `DataTable` (Table/Thead/Tbody/Tr/Th/Td). All ship classes that resolve to nothing. The fix is to define the tokens — the code is already written correctly to spec.
