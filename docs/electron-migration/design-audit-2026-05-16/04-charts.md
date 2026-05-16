# 04 — Data Visualization Audit
_Date: 2026-05-16_

## Executive summary

The viz layer is **technically solid but visually flat**. Every chart is built on Recharts with `ResponsiveContainer`, `isAnimationActive={false}`, consistent zinc axis styling, and (mostly) the shared `ChartTooltip` component — the engineering hygiene is good. What is missing is the *design layer*: **zero charts use `<linearGradient>` fills**, every area is a stroke-only line, the color palette is an ad-hoc grab-bag of Tailwind hex codes that does not map to the book-platform `design-dna.json` module palette, and the marketing mockup's "single soft-blue gradient area with a giant headline number inside" pattern is not implemented anywhere. The HeroChart in particular is a 12-line multi-metric line chart — useful but the polar opposite of the mockup. Two charts (BsrModal, TrendModal) bypass `ChartTooltip` entirely and use Recharts default tooltip — inconsistency. Net: ~10 hours of focused work to bring HeroChart + PnLChart + ReportsPage daily chart to mockup parity; the rest can follow a shared `<GradientArea>` primitive.

## Chart inventory

| Component | File | Type | Colors (literals) | Gradient | Axis | Tooltip | Loading | Empty |
|---|---|---|---|---|---|---|---|---|
| HeroChart | `src/renderer/components/dashboard/HeroChart.tsx:225` | Multi-line (up to 6 lines, dual Y) | 12 hex chips: `#ef4444`, `#10b981`, `#3b82f6`, `#8b5cf6`, `#f97316`, `#0ea5e9`, `#a855f7`, `#ec4899`, `#14b8a6`, `#71717a`, `#a1a1aa`, `#d4d4d8` (HeroChart.tsx:43-56) | No | `CartesianGrid stroke="#f4f4f5"` + dual YAxis (money/percent) `stroke="#a1a1aa"` (L226-256) | `ChartTooltip` via `HeroTooltip` (L170-187) | Inline text `t('hero.loading')` (L221) | Inline text `t('hero.noData')` (L221) |
| FunnelChart | `src/renderer/components/dashboard/FunnelChart.tsx:44` | CSS-only horizontal bars (not Recharts) | `bg-zinc-300`, `bg-zinc-500`, `bg-zinc-900` (L27-39) | n/a (CSS) | n/a | n/a (static value labels) | text-only (L47) | text-only (L49) |
| MarketplaceDistribution | `src/renderer/components/dashboard/MarketplaceDistribution.tsx:96` | Donut (PieChart, innerRadius 60%) | `PALETTE` = 8 zinc shades `#27272a → #f4f4f5` (L16-19) | No | n/a (pie) | `ChartTooltip` via `MpTooltip` (L53-66) | `<LoadingRow />` (L92) | `<EmptyState />` (L94) |
| OrganicPaidBlock | `src/renderer/components/dashboard/OrganicPaidBlock.tsx:85` | CSS stacked bar (not Recharts) + table | `bg-emerald-500`, `bg-blue-500`, accents `emerald-50/40`, `blue-50/40` (L59-95) | n/a | n/a | n/a | `<LoadingRow />` | text-only (L54) |
| AlertsWidget | `src/renderer/components/dashboard/AlertsWidget.tsx` | List + severity icons (not a chart) | `text-red-600`, `text-amber-500`, `text-sky-500` (L17-23) | n/a | n/a | n/a | `<LoadingRow />` | text-only |
| TopPerformers | `src/renderer/components/dashboard/TopPerformers.tsx` | List view (no chart) | `text-emerald-600`, `text-red-600` for profit signs | n/a | n/a | n/a | `<LoadingRow />` | `<EmptyState />` |
| HourlyDynamicsChart | `src/renderer/components/campaigns/HourlyDynamicsChart.tsx:161` | Composed (Bar + 2 Lines + Brush) | Bar `#a1a1aa`, click line `#3b82f6`, spend line `#10b981`; grid `#e4e4e7` (L208/218/229/165) | No | XAxis tick `#71717a`, dual YAxis (L166-181) | `ChartTooltip` inline (L182-203) | `<LoadingRow />` (L153) | text-only (L157) |
| CampaignWeeklyMetrics | `src/renderer/components/books/CampaignWeeklyMetrics.tsx:165` | Table-as-viz (transposed metric-by-week) | `text-red-600` for ACOS>100 / ROI<0; otherwise `text-zinc-900` (L158-162) | n/a | n/a | n/a | `<LoadingRow />` | `<EmptyState />` |
| PnLChart | `src/renderer/components/pnl/PnLChart.tsx:48` | Single line (profit) | Line `#3b82f6`, grid `#e4e4e7` (L83/50), tooltip color hardcoded `#3b82f6` (L73) | No | XAxis/YAxis tick `#71717a` (L53/57) | `ChartTooltip` inline (L60-78) | `…` placeholder (L41) | `<EmptyState />` (L45) |
| ReportsPage Daily | `src/renderer/pages/ReportsPage.tsx:430` | 2-line (spend + sales) | Spend `#3f3f46`, sales `#a1a1aa`, grid `#f4f4f5` (L456/464/434) | No | XAxis/YAxis `#a1a1aa`/`#e4e4e7` (L437/444) | `ChartTooltip` via `DailyTooltip` (L686) | `<LoadingRow />` (L424) | `<EmptyState />` (L426) |
| ReportsPage By-Marketplace | `src/renderer/pages/ReportsPage.tsx:588` | Horizontal bar | Bar `#3f3f46`, grid `#f4f4f5` (L618/599) | No | `#a1a1aa` ticks (L602-611) | `ChartTooltip` via `MarketplaceTooltip` (L696) | `<LoadingRow />` | `<EmptyState />` |
| BsrModal | `src/renderer/components/books/BsrModal.tsx:85` | Single line (reversed Y) | Line `#18181b` (near-black), grid `#f4f4f5`, ticks `#a1a1aa` (L113/86/89) | No | TickLine/axisLine hidden (L90-99) — already mockup-style | **Default Recharts** with inline `contentStyle` (L102-109) | `<LoadingRow />` | `<EmptyState />` |
| TrendModal | `src/renderer/components/searchTerms/TrendModal.tsx:158` | Single line, switchable metric | `COLORS` map: `#6E56CF` / `#ef4444` / `#10b981` / `#3b82f6` (L28-33); grid `#f4f4f5` | No | TickLine/axisLine hidden (L165-173) | **Default Recharts** `<Tooltip />` (L174) | `<LoadingRow />` | `<EmptyState />` |
| RankHistoryModal | `src/renderer/components/searchTerms/RankHistoryModal.tsx:155` | Single line (reversed Y) | Line `#6E56CF` (violet), grid `#f4f4f5` (L187/157) | No | TickLine/axisLine hidden (L158-176) | **Default Recharts** with `formatter` only (L178-183) | `<LoadingRow />` | `<EmptyState />` |

Total: **14 visualizations** (10 Recharts-based + 4 CSS/list). No chart has `responsive={false}` — all use `ResponsiveContainer`. No chart has a real mobile breakpoint — the desktop-only assumption holds because this is an Electron app.

## Color palette in charts

**Three palettes coexist**, none of them centralized.

1. **Zinc-grayscale palette** (mockup-aligned-ish): MarketplaceDistribution (8 zinc shades), ReportsPage daily/by-mp (`#3f3f46` + `#a1a1aa`), FunnelChart (zinc 300/500/900), BsrModal line (`#18181b`). This is the dominant "Stripe/Linear" feel.
2. **Semantic accents** (correctly applied): `#ef4444` for spend, `#10b981` for sales/profit/positive, `#3b82f6` for profit/paid/analytics, `#f97316` for ACOS, red/amber/sky for alert severities. HeroChart's 12 colors are *internally* semantic (spend=red, sales=green, profit=blue, royalty=violet, ACOS=orange, ROI=sky, CTR=purple) — that's actually fine.
3. **Random violet** (`#6E56CF`): TrendModal (clicks) and RankHistoryModal (rank). This violet is **only** here and is not in `design-dna.json` (publishing violet is `#8b5cf6`, AI amber is `#f59e0b`). Most likely copy-pasted from Radix and never reconciled.

**Semantic vs random verdict**:
- *Semantic*: HeroChart, OrganicPaidBlock, alert icons, profit badges. Good.
- *Random*: SearchTerms violet (`#6E56CF`), MarketplaceDistribution greyscale (no info conveyed by hue, only by order), HourlyDynamicsChart's `#3b82f6` for clicks (clicks aren't "analytics" — should be neutral).

## Gap analysis vs mockup

Mockup target style: **single sky-blue line + gradient area fill** (`#3b82f6` stroke, area fade from `rgba(59,130,246,0.2)` at top to transparent at bottom), no vertical gridlines (horizontal only or none), minimal axis (no tick lines, no axis lines, tick labels `#a1a1aa` 10px), big "$12,847" headline number positioned **inside the chart area** in `Playfair Display`, monospace tooltip values.

| Chart | Current style | Target style | Concrete delta | Effort |
|---|---|---|---|---|
| HeroChart | 12-metric multi-line, dotted grid, dual axis, hex-rainbow legend chips | Single-metric **area + gradient**, headline value inside, horizontal grid only | (a) Wrap in `<AreaChart>` with `<defs><linearGradient id="heroFill">` (sky-blue, opacity 0.2→0); (b) keep multi-metric mode but switch primary metric to gradient area; (c) inject overlay `<div>` with total value at top-left of chart container | M (4–6h: AreaChart conversion + first-metric-as-area logic + headline overlay) |
| PnLChart | Single `#3b82f6` line, dotted grid, no fill | Same line, **add gradient area below**, optionally hide vertical grid (already `vertical={false}`) | (a) Switch `<Line>` → `<Area>` with `fillOpacity` ramp; (b) move stroke color to a CSS variable; ~10-line diff | S (1h) |
| ReportsPage Daily | 2-line zinc (spend vs sales), Legend below | Same dual-line **OR** single primary line (spend) with sales as secondary gradient | If keeping dual: just polish — `vertical={false}`, slightly heavier stroke. If aligning to mockup: convert spend to area+gradient and drop sales line or make it dotted. | S (1h) |
| BsrModal | Already 80% mockup-styled (`axisLine={false}`, `tickLine={false}`), single `#18181b` line | Add gradient under line (sky-blue if we re-color), keep reversed Y | Add `<defs>` + switch to AreaChart; color reconcile (line is near-black, should be brand-blue or neutral) | S (1h) |
| TrendModal / RankHistoryModal | Already minimal axis style; line only; **default tooltip** | Same minimal axis + gradient under line + `<ChartTooltip>` adoption | (a) Replace `<Tooltip />` (default) with `content={<ChartTooltip …>}`; (b) line→area+gradient; (c) consolidate `#6E56CF` to design-dna analytics blue | S (1–2h) |
| HourlyDynamicsChart | Bar + 2 lines composed, dotted grid, custom tooltip | Keep composed (this chart genuinely needs bars+lines) but soften: hide vertical grid, lighter bar fill, lines as area-fill optional | (a) `vertical={false}` on grid; (b) reduce bar opacity / soften corners (already `radius={[2,2,0,0]}`) | XS (30m) |
| MarketplaceDistribution donut | Zinc-only palette | Module-coded palette (see mapping below), keep donut | Color swap only | XS (15m) |
| FunnelChart | Zinc bars | Module-coded ladder (ads emerald → ads emerald darker) or analytics blue | Color swap | XS (15m) |

Aggregate to mockup parity: **~10–12 hours** if a shared `GradientArea` primitive is extracted; **~16h** if each chart is touched individually.

## ChartTooltip consistency

`src/renderer/components/ui/ChartTooltip.tsx` is a clean 42-line primitive that takes `{ active, title, rows: [{ label, value, color }] }`. **It is used in 6 of 10 Recharts charts**:

| Uses `ChartTooltip` | Uses Recharts default |
|---|---|
| HeroChart (HeroChart.tsx:186) | BsrModal (BsrModal.tsx:102 — inline `contentStyle`) |
| MarketplaceDistribution (MarketplaceDistribution.tsx:65) | TrendModal (TrendModal.tsx:174 — bare `<Tooltip />`) |
| HourlyDynamicsChart (HourlyDynamicsChart.tsx:201) | RankHistoryModal (RankHistoryModal.tsx:178 — `formatter` only) |
| PnLChart (PnLChart.tsx:65) | |
| ReportsPage daily (`DailyTooltip` ReportsPage.tsx:686) | |
| ReportsPage by-marketplace (`MarketplaceTooltip` ReportsPage.tsx:696) | |

The three modals in the **searchTerms / books** area are the gap. Likely cause: they were built before `ChartTooltip` existed and never refactored. Net effect to the user: tooltip typography, padding, and color-chip styling differ between the dashboard and the modals — visible whenever a user opens a BSR/Trend/Rank modal from a dashboard view. Tooltip itself: clean look (white card, `border-zinc-200`, `shadow-soft`, monospace numbers via `tabular-nums`). Note it lacks an explicit monospace font face — relies on `tabular-nums` which only aligns digit widths; the mockup wants `JetBrains Mono` per design-dna.

## Module color mapping (proposed)

Reference: `book-platform/design-dna.json:22-28` → `ads: #10b981`, `analytics: #3b82f6`, `publishing: #8b5cf6`, `ai: #f59e0b`, `marketplace: #f43f5e`.

| Chart | Module | Color | Rationale |
|---|---|---|---|
| HeroChart (primary area when single metric) | analytics | `#3b82f6` | This *is* the analytics hero; matches mockup blue exactly |
| HeroChart spend line | ads | `#10b981` | Spend is the ads-cost dimension — collides with current `#ef4444`. Keep red only for ACOS-over-target reference; recolor spend to ads green |
| HeroChart sales line | marketplace | `#f43f5e` (or keep `#10b981`) | Sales = marketplace revenue. Today `#10b981` overlaps with ads green |
| HeroChart royalty line | publishing | `#8b5cf6` | Already `#8b5cf6` — keep |
| HeroChart ROI/profit | ai | `#f59e0b` | Profit/ROI = "insight" — currently `#3b82f6`/`#0ea5e9` |
| PnLChart | analytics | `#3b82f6` | Already correct — no change |
| MarketplaceDistribution donut | marketplace gradient | `#f43f5e` shaded down through `#fda4af` → zinc tail for 4th+ slice | Replace 8-stop zinc with semantic gradient |
| FunnelChart impressions/clicks/orders | analytics ramp | `#bfdbfe` → `#60a5fa` → `#3b82f6` | Funnel = analytics; the ramp telegraphs progression |
| ReportsPage daily spend | ads | `#10b981` | Spend = ads. Currently zinc `#3f3f46` — readable but not semantic |
| ReportsPage daily sales | marketplace | `#f43f5e` or neutral zinc | Today both lines are zinc — they're literally indistinguishable in screenshots |
| ReportsPage by-marketplace bar | marketplace | `#f43f5e` | Single-color bar, module-coded |
| BsrModal | publishing | `#8b5cf6` | BSR = publishing/catalog signal, not ads — `#18181b` near-black is generic |
| TrendModal (clicks/orders) | analytics | `#3b82f6` | Drop `#6E56CF` |
| TrendModal spend | ads | `#10b981` | Today `#ef4444` (red) — red should be reserved for "bad" |
| TrendModal sales | marketplace | `#f43f5e` | Today `#3b82f6` |
| RankHistoryModal | publishing | `#8b5cf6` | Drop `#6E56CF` |
| HourlyDynamicsChart bars (impressions) | neutral zinc | `#a1a1aa` | Keep — impressions are background context |
| HourlyDynamicsChart clicks line | analytics | `#3b82f6` | Keep |
| HourlyDynamicsChart spend line | ads | `#10b981` | Keep |

This mapping eliminates ~7 random hex values from the codebase and replaces them with 5 module tokens. Recommendation: add a `chartPalette` object in `src/renderer/lib/format.ts` or a new `src/renderer/lib/chart-palette.ts` and import from it instead of inlining hex.

## Other findings

**Performance flags** (file:line, no deep-dive):
- `HeroChart.tsx:150-168` — `chartData` memoized correctly with `data` dep; OK.
- `HeroChart.tsx:170-187` — `HeroTooltip` is defined inside the render function → new component identity on every render. Recharts works around this but it suppresses memoization. Move to module scope.
- `HourlyDynamicsChart.tsx:66-75` — `chartData` memoized; OK. `Brush` appears at `chartData.length > 24` (L235) — good gating.
- `ReportsPage.tsx:586-619` — `data` for `BarChart` is computed inline (`Object.entries(...).map().sort()`) on every render, no `useMemo`. With <10 marketplaces this is negligible but stylistically inconsistent.
- `MarketplaceDistribution.tsx:36-49` — slices memoized; OK.
- `TrendModal.tsx:82-95` — `chartData` memoized; OK. `RankHistoryModal.tsx:96-106` — **not memoized**, recomputed every render. Small data (<=90 points) so fine, but flag.
- `BsrModal.tsx:41-48` — not memoized, fine for modal scope.
- No `React.memo` wraps any chart component; on dashboard re-renders all charts re-render. Likely not a real bottleneck given current data sizes, but if HeroChart becomes the focal "area" with a headline overlay, memoize then.

**Accessibility flags**:
- `OrganicPaidBlock.tsx:88-95` — stacked bar has `aria-label="Organic 53.2%"` on each segment. Good.
- All Recharts charts: no `aria-label` on `ResponsiveContainer` wrapper or chart root. Screen readers see decorative SVGs with no semantic equivalent. Consider adding a fallback `<table className="sr-only">` with the data for each chart.
- Color-only encoding: HeroChart legend chips use `bg-zinc-900` (active) vs `bg-white` (inactive) plus the color dot — non-color signal exists, OK. But two adjacent active metrics with similar hues (e.g., `#3b82f6` profit + `#0ea5e9` ROI, or `#10b981` sales + `#14b8a6` ROAS) are confusable. Recommend adding dash pattern or marker shape variation when ≥4 lines are active.
- `text-red-600` in CampaignWeeklyMetrics (CampaignWeeklyMetrics.tsx:159, 161) signals bad ACOS/ROI by *color only*. Add an arrow icon or "(bad)" suffix for color-blind users.
- TrendModal/RankHistoryModal use bare `<Tooltip />` — default Recharts tooltip has low contrast (light gray on white). Visible WCAG miss.

**Empty/loading state inconsistencies**:
- HeroChart loading/empty: inline text inside the chart container, no `<LoadingRow />`. All other Recharts charts use the shared `<LoadingRow />` and `<EmptyState />` primitives. Standardize.
- PnLChart loading: a single `…` ellipsis (PnLChart.tsx:42). Sloppy — use `<LoadingRow />`.
- HeroChart empty state shows "no data" but legend pills remain interactive — confusing because clicking them does nothing. Either disable pills when `chartData.length === 0` or hide the legend entirely.
- TrendModal/RankHistoryModal have three states: loading / unsupported / empty. Good — but the labels for "unsupported" vs "empty" are differentiated only by translation, not by icon. A `<BellOff>`-style icon (already used in AlertsWidget) would help.

## Recommendations (ordered by impact)

1. **Build a `<GradientArea>` primitive** in `src/renderer/components/ui/charts/GradientArea.tsx` wrapping Recharts `<AreaChart>` with a `<defs><linearGradient>` (sky-blue, 0.2→0 fade), no vertical grid, horizontal grid as `#f4f4f5`, ticks `#a1a1aa` 10px, `tickLine={false}`, `axisLine={false}`. **This single component unblocks 5 charts** (HeroChart hero mode, PnLChart, BsrModal, TrendModal, RankHistoryModal).
2. **Add `chart-palette.ts`** exporting module tokens (`ads`, `analytics`, `publishing`, `ai`, `marketplace`) mapped to design-dna hex. Replace 25+ inline hex literals across 8 files. One PR, mostly mechanical.
3. **HeroChart: single-metric "hero" mode**. When `active.length === 1`, render `<GradientArea>` plus an absolutely-positioned headline value (`$XX,XXX` in `Playfair Display`, 32px) inside the top-left of the chart container. When `active.length > 1`, keep current multi-line layout. This delivers the marketing mockup look without breaking the existing power-user view.
4. **Unify tooltips**: convert BsrModal / TrendModal / RankHistoryModal to `<ChartTooltip>`. Add a `mono` flag to `ChartTooltip` that swaps `tabular-nums` for `font-mono` (JetBrains Mono) on the value column.
5. **Eliminate `#6E56CF`** — replace with `#3b82f6` (TrendModal clicks) and `#8b5cf6` (RankHistoryModal, publishing). One find-replace.
6. **Move `HeroTooltip` out of `HeroChart` render body** (HeroChart.tsx:170) to module scope to stop new-component identity on every render.
7. **Standardize loading/empty states**: PnLChart `…` → `<LoadingRow />`; HeroChart inline text → `<LoadingRow />` / `<EmptyState />` so every chart speaks the same skeleton language.
8. **A11y pass**: add `role="img"` and `aria-label` to each `ResponsiveContainer` wrapper, and an `sr-only` summary table for HeroChart and PnLChart (high-traffic charts).
9. **MarketplaceDistribution recolor**: drop 8-stop zinc, use `#f43f5e` with shade ramp. Less monochrome, more visually anchored to the "marketplace" module.
10. **Reports daily chart**: differentiate spend vs sales by hue, not just shade. Today the two lines are visually indistinguishable when printed/screenshotted.
