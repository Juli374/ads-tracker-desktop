# 02 — Page-by-Page Visual Audit
_Date: 2026-05-16_
_Scope: all 21 pages in `src/renderer/pages/`. Read-only._

## Executive summary

The app is functional and disciplined — almost every page uses `PageHeader`, `Card`, `Kpi/KpiDelta`, `EmptyState`, `LoadingRow` from `components/ui/*`, follows the same `space-y-6` outer rhythm, and shares one accent (zinc-900 / emerald-600 / red-600). That consistency is the bones of the design pass — we don't have visual chaos, we have visual monotony.

The problem is everything between the page header and the cards. Tables (12 of 21 pages render one) standardise on `text-xs` body cells with `text-[10–11px]` meta rows and `text-[11px] uppercase` headers — a full step below the marketing mockup's `text-sm`/`text-base` rhythm. KPI strips lean on `grid-cols-4` (10 pages) and `grid-cols-3` (4 pages), so on a 1280px viewport individual KPIs collapse to ~220–280px wide, killing the "big number" effect the mockup sells. Color is almost entirely neutral: emerald and red appear only as semantic tone (`>100%` ACOS, negative balance), violet shows up exclusively on Pro upgrade gates, and the mockup's gradient-fills/active pills are missing everywhere except `Dashboard`. There are 12+ inline `<select>` and `<button>` constructs that bypass the `Button`/`Input` primitives entirely, which means the design pass has to either standardise those primitives or accept that each fix touches ~12 files.

Worst offenders are the dense data tables — `Reports`, `Keywords`, `SearchTerms`, `Campaigns` — and the kitchen-sink list views (`Books`, with an 11-column table and a side `ExpandableRows` machine). Best in class is `Dashboard`, which already approximates the mockup with delta KPIs, a hero chart, a funnel, briefing card, and a marketplace distribution; it's the right reference for everything else.

## Scoring table (all 21 pages, sorted worst → best)

Axes: Type = Typography hierarchy, Spacing, Density, Color, Consistency (uses ui/* primitives), Visual interest. Each 0–10. Composite is a weighted average — Visual interest × 1.3, Density × 1.2, Type × 1.1, others × 1.0; rounded to 1 decimal. Lower composite = needs more design love.

| Rank | Page | Type | Spacing | Density | Color | Consistency | Visual | **Composite** | Biggest issue |
|---|---|---|---|---|---|---|---|---|---|
| 1 | ReportsPage | 4 | 4 | 2 | 3 | 6 | 2 | **3.3** | 14 inline tabs in a horizontal scroller, no entry-point clarity, KPI strip looks identical to Dashboard but has no chart hero |
| 2 | KeywordsPage | 4 | 4 | 2 | 3 | 6 | 3 | **3.6** | Noise filter chrome + virtualized `text-xs` table — every row is 40px of dense numbers, zero visual breathing |
| 3 | NegativesPage | 4 | 4 | 3 | 4 | 6 | 3 | **3.9** | Campaign-picker `<select>` rendered as a full-width row inside a Card; tab+card stack looks like a debug form |
| 4 | AccountingPage | 4 | 5 | 4 | 4 | 8 | 3 | **4.4** | Two raw tables stacked with no transaction-level filter or chart; pure ledger dump |
| 5 | SearchTermsPage | 5 | 4 | 3 | 4 | 7 | 3 | **4.4** | 6 inline tabs + right-pane toggle + sticky bulk-select bar; right-pane uses `grid-cols-[1fr_320px]` which is too narrow for what it carries |
| 6 | CampaignsPage | 5 | 5 | 3 | 4 | 8 | 4 | **4.8** | Header right slot crams 5 controls (MP select / type select / activeOnly chip / sort / search); table cells are `max-w-[280px]` truncated `text-xs` |
| 7 | ComparisonPage | 5 | 5 | 3 | 5 | 7 | 4 | **4.9** | 9-column "A vs B" table with no chart — the highest-value feature in the app rendered as a spreadsheet |
| 8 | NegativeLists/RoyaltiesPage | 5 | 6 | 4 | 4 | 8 | 3 | **5.0** | Page wrapper around `RoyaltiesTab`; title + export, nothing else — feels like a placeholder route |
| 9 | ActionCenterPage | 5 | 6 | 5 | 5 | 8 | 4 | **5.4** | Day-grouped log list — has structure but is monochrome, and `bg-zinc-50/60` sticky day headers compete with the card header |
| 10 | AlertsPage | 6 | 6 | 5 | 6 | 8 | 5 | **5.9** | Severity-grouped cards work, but the tab bar duplicates the KPI tiles (both show count-per-severity); rows are tight |
| 11 | OperationsCenterPage | 6 | 6 | 6 | 5 | 7 | 5 | **5.9** | DnD kanban — `grid-cols-4` columns on 1280px = ~270px each, too narrow for task titles + meta |
| 12 | CampaignDetailsPage | 6 | 6 | 5 | 5 | 8 | 5 | **5.9** | Breadcrumb + PageHeader + 5 tabs + EditableNumber + WeeksSegment — many controls, no single focal point |
| 13 | AutomationPage | 6 | 6 | 5 | 6 | 8 | 6 | **6.1** | Sub-tab switcher under PageHeader looks like a third nav layer; locked state is the most polished part of the page |
| 14 | BooksPage | 6 | 5 | 4 | 5 | 8 | 6 | **5.9** | 11-column table with expand carets, cover thumbnails, and book-level meta rows — visually noisy even when collapsed |
| 15 | NegativesPage_lists / NegativeListsTab | 6 | 6 | 5 | 5 | 8 | 5 | **5.9** | Same monochrome card+table pattern as Negatives main |
| 16 | SettingsPage | 7 | 7 | 6 | 5 | 9 | 5 | **6.3** | Just a header + tab bar + body — the structure is fine, the 11 tabs need a 2-column layout (sidebar of categories) for a Pro feel |
| 17 | ResearchPage | 6 | 6 | 6 | 6 | 8 | 7 | **6.4** | Wizard-style top bar (keyword/asin tabs + marketplace) followed by 3-card stack — better than most but `Compass` icon + violet only on locked variant |
| 18 | PnLPage | 7 | 7 | 6 | 7 | 9 | 6 | **6.7** | Has chart + matrix + KPI row — close to right, but `AttributionToggle + SourceToggle + RangePicker + export` in header is 4 controls in a 2-line cluster |
| 19 | BriefingPage | 7 | 7 | 7 | 6 | 9 | 7 | **7.0** | Renderer for markdown + history sidebar — `grid-cols-4` with 1:3 split is clean; would score higher with a hero illustration |
| 20 | ProfilePage | 7 | 8 | 7 | 6 | 9 | 6 | **7.0** | Avatar + form, neat — but no visual hero, feels like a Settings sub-tab not a top-level route |
| 21 | ListingStudioPage | 7 | 7 | 7 | 7 | 9 | 7 | **7.2** | Side-by-side current vs proposed is the strongest layout pattern in the app |
| (best) | DashboardPage | 8 | 8 | 7 | 7 | 9 | 8 | **7.7** | Closest to the mockup — KPIDelta row, HeroChart, Funnel, MarketplaceDistribution, BriefingCard, books table; only fails on 8 KPIs in a 4-col grid (becomes 2×4) |

> Ranks 14 and 15 are tied composite ~5.9 — manual ordering reflects which page surfaces the issue earlier in the user journey. Page-count: 21 (Negatives is listed once; the dual-rank line for NegativeListsTab is shown to make the cross-page table pattern visible).

## Top-5 worst pages (deep-dive)

### 1. ReportsPage — composite 3.3/10
File: `src/renderer/pages/ReportsPage.tsx`

- **14 tabs in a horizontal scroller**, `overflow-x-auto`, no grouping (`ReportsPage.tsx:319–342`). On a 1280px viewport ~6–7 fit; the user has no idea what `targeting_type` / `bidding_strategy` / `campaign_type` / `match_type` / `placement` mean as siblings of `overview` / `matrix` / `hourly` / `budget_pacing`.
- **KPI strip duplicates Dashboard's** (`ReportsPage.tsx:402–412`): same 4-KPI grid (`spend`, `sales`, `acos`, `tacos`), same `Kpi` primitive — but unlike Dashboard there's no `KpiDelta` (no % change), no chart hero above it, no context for what "totals" means against a 14-tab pivot.
- **No visual hero**: Reports is the analytics destination of the app, but the page is essentially a tab bar + a 2-line KPI strip + (depending on tab) a table or another tab's body component. Compare to `DashboardPage.tsx:262–292` which has `HeroChart` as the first thing after KPIs.
- **`ReportsPage.tsx:344–397`** is a 4-way conditional render (`BreakdownTab` | `MatrixTab` | `HourlyTab` | `BudgetPacingTab`) where each child component owns its own visual style independently — meaning a user clicking between tabs experiences four visually different report pages.
- **Granularity toggle isn't here** — `daily`/`weekly` lives only in the overview tab's body (`ReportsPage.tsx:206–214`), not surfaced in the page header where filters belong.

### 2. KeywordsPage — composite 3.6/10
File: `src/renderer/pages/KeywordsPage.tsx`

- **Virtualizer + `ROW_HEIGHT = 40` + `text-xs` cells** (`KeywordsPage.tsx:51–52`): each visible row is ~40px tall but the content inside is `text-[11px]`/`text-xs` (effectively 11–12px). The body looks like a debugger pane, not a product surface.
- **Noise filter** (`noise.minTargets` / `noise.maxCpc` / `noise.hideLowVolume`, `KeywordsPage.tsx:59–85`) is chrome that the user has to manage but has no visual home — there is no `<Card title="Filters">` for it, it's just inline form controls.
- **No KPI strip** that I can find in the first 220 lines — the Kpi import exists but the page jumps from `PageHeader` → tabs → search → table.
- **List/Reverse-ASIN sub-tab** (`KeywordsPage.tsx:98`) sits as a second nav layer below `PageHeader`, the same pattern Reports and Automation use; three pages × three different tab styles.
- **No chart, no Top-N keywords visual** — for a "keywords" page the highest-information moment is "which keywords moved most this week?" — completely absent.

### 3. NegativesPage — composite 3.9/10
File: `src/renderer/pages/NegativesPage.tsx`

- **Campaign picker is a `<select>` inside a Card body** (`NegativesPage.tsx:188–217`): the Card title is "Pick a campaign", the body is a single-line select. That's a 60+ pixel card for one dropdown — wastes the entire above-the-fold below the tab bar.
- **No KPI strip at all** — page has zero numerical context. A user landing here from sidebar sees: title → 2 tabs → "pick campaign" card → empty table. By contrast every other list page leads with 3–4 KPIs.
- **Inline select styling repeats the same 7-line className soup** as ActionCenter / Comparison / Settings sub-components (`NegativesPage.tsx:201–207`). 12+ places in the codebase ship this same CSS — primitive opportunity.
- **No visual indication this is an action page** — the title is "Negatives" but there's no "Add" CTA in the header right-slot (form sits inside a second card), no badge for "x lists active", no banner explaining what negatives do.
- **Tab styling** (`NegativesPage.tsx:162–182`) is the third unique tab implementation in the codebase (vs Alerts at `AlertsPage.tsx:158–186` and Reports at `ReportsPage.tsx:319–342`).

### 4. AccountingPage — composite 4.4/10
File: `src/renderer/pages/AccountingPage.tsx`

- **Two raw tables stacked** (`AccountingPage.tsx:104–193`): Accounts + Transactions. No charts, no breakdown by category, no monthly summary, no balance trend. Tables are `text-sm` headers `text-xs`/`text-[11px]` body — the most cramped pattern in the codebase.
- **Transaction descriptions truncate** with `max-w-md` (`AccountingPage.tsx:171`) without a tooltip or expand affordance — important context disappears.
- **Date format is raw ISO slice** `(tr.date ?? '').slice(0, 10)` (`AccountingPage.tsx:163`) — no localized formatting, no "today/yesterday" affordance.
- **3-KPI grid** (`AccountingPage.tsx:85–101`) shows `accounts count` / `total balance` / `tx count` — two of three are meta-data, only one is a number that matters.
- **No filtering UI** for the 100-row tx table (`limit: 100` hardcoded `AccountingPage.tsx:37`) — pagination, date range, account filter all absent.

### 5. SearchTermsPage — composite 4.4/10
File: `src/renderer/pages/SearchTermsPage.tsx`

- **6 tabs + right-pane toggle + export menu + range picker** in the header right slot (`SearchTermsPage.tsx:307–373`). The header is 4 controls clustered together; first impression is "control panel", not "data view".
- **`grid-cols-[1fr_320px]`** right pane (`SearchTermsPage.tsx:415`) is too narrow for the rank/trend modals it embeds — the toggle exists because the layout is broken in either state.
- **Sticky bulk-select bar** uses `bg-zinc-900 text-white` (`SearchTermsPage.tsx:468–475`) — high-contrast bar floating at top conflicts with the dark sidebar at left and the bell/menu at top-right; three high-contrast surfaces fighting for attention.
- **Tab count badges** (`SearchTermsPage.tsx:443–457`) are tiny circles with `min-w-[18px] h-[18px]` and `text-[10px]` — visually they read as decoration, not as data. Compare to mockup's prominent count display.
- **`text-xs`/`text-[10px]` on tab labels** combined with circle counters means the entire tab bar is sub-13px text — fails readability standards even for a desktop power-user tool.

## Top-3 best pages (what works)

### DashboardPage (composite 7.7) — `src/renderer/pages/DashboardPage.tsx`
- **8 `KpiDelta` tiles** with icon + change % + tone (`DashboardPage.tsx:187–253`) is the canonical "big number with context" treatment we want everywhere. The icons (lucide `DollarSign`, `TrendingDown`, etc., 14px) give visual variety without color noise.
- **Component composition**: `HeroChart` → `TopPerformers` (col-span-2) + `AlertsWidget`/`FunnelChart` (col-span-1) → `BriefingCard` → `OrganicPaidBlock` → `MarketplaceDistribution` → books table. Six distinct visual rhythms in one page (`DashboardPage.tsx:255–349`).
- **Real charts, not just tables**: `HeroChart`, `FunnelChart`, `MarketplaceDistribution` exist as standalone components — meaning the design pass for "chart styling" applies in one place and reaches everywhere via re-use.
- **`Promise.allSettled`** load pattern (`DashboardPage.tsx:109–139`) means partial failure renders gracefully; no full-page error states.
- *Only soft criticism*: 8 KPIs in a 4-column grid still wraps to 2×4 on narrow screens — could be 6 primary + 2 secondary in a different size tier.

### ListingStudioPage (composite 7.2) — `src/renderer/pages/ListingStudioPage.tsx`
- **Side-by-side comparison** (`ListingSideBySide` component referenced `ListingStudioPage.tsx:31`) is the strongest content layout in the codebase — current vs proposed side-by-side is what `ComparisonPage` should look like.
- **Locked-state design** (`ListingStudioPage.tsx:73–103`): centered violet `Sparkles` icon + heading + 2-line description + CTA — this is the cleanest "empty/locked" pattern in the app. Worth promoting as the canonical `LockedFeature` layout.
- **Task tabs** (`ListingTaskTabs`) live as a dedicated component, not inline button soup — exemplary primitive extraction.
- **Single-purpose page** — no kitchen-sink, one job (rewrite copy) and the whole layout serves it.

### BriefingPage (composite 7.0) — `src/renderer/pages/BriefingPage.tsx`
- **`grid-cols-4` with `col-span-1` sidebar + `col-span-3` content** (`BriefingPage.tsx:211–213`) — proper master/detail layout, the only place this pattern lives at page level.
- **Markdown renderer** (`renderBriefingMarkdown` `BriefingPage.tsx:28–80`) outputs `text-sm leading-relaxed` paragraphs — the only page that uses body-copy sizing instead of `text-xs`. The result is the most readable surface in the app.
- **Run-now CTA** in header right slot uses violet (`bg-violet-600 hover:bg-violet-700`, `BriefingPage.tsx:196–197`) — accent color used with intent. Most other pages use violet only for the locked variant.
- **Soft criticism**: history sidebar is just a list — could use date grouping or "this week / older" sections.

## Cross-page patterns

These are mechanical patterns that, if fixed once, lift many pages at once. Counts are observed across the 21 pages read.

1. **`text-xs` / `text-[11px]` / `text-[10px]` table cells** — used in `BooksPage:411–421`, `CampaignsPage:317–329`, `Dashboard:325–333`, `KeywordsPage` (virtualised), `AccountingPage:111–117`, `SearchTermsPage`, `NegativesPage`, `ReportsPage`, `ComparisonPage:393–409`, `AlertsPage` rows, `ActionCenterPage` rows. **12+ tables on `text-xs`** vs mockup's `text-sm`. One CSS variable / utility (`.cell-text`) replaces dozens of inline classes.
2. **`grid grid-cols-4 gap-3`** KPI strips — `Dashboard:187`, `BooksPage:380`, `OperationsCenter:160`, `SearchTermsPage:390`, `ComparisonPage:348`, `Reports:402`, `PnLPage` (via PnLKpiRow), `Alerts:139` (cols-3), `Accounting:85` (cols-3), `Automation` (within page). **9 pages** with grid-cols-4 KPI rows; on 1280px screen each tile is ~265px wide — too narrow for the mockup-style big number + label + delta.
3. **Inline `<select>` with the same 7-line className** — `ActionCenterPage:114–118`, `NegativesPage:201–207`, `ComparisonPage:493–497`, `ComparisonPage:520–525`, `Settings*` subtabs. Same `h-7 pl-2 pr-7 text-xs rounded-md ... border-zinc-200 bg-white ...` pattern in ~12 places. No `Select` primitive exists in `components/ui/`. **Highest-leverage primitive to add.**
4. **Tab bars are reinvented three ways**:
   - Border-bottom underline style: `AlertsPage:158–186`, `ReportsPage:319–342`, `NegativesPage:162–182`, `CampaignDetailsPage` (uses same), `Automation:185–198`, `Keywords` (different).
   - "Pill on bottom" style: `SearchTermsPage:419–465` (uses absolute-positioned underline span).
   - Inline `border-b-2 -mb-px transition-colors`: shared by 5+ pages with subtle copy-paste drift.
   No `Tabs` primitive. **5 pages affected.**
5. **Custom header CTA buttons** — `BooksPage:311–320` (cover QA), `OperationsCenter:147–155` (add task), `BriefingPage:189–208` (run now), `PnLPage:173–188` (export), `Profile:181–188` (save), `Automation:147–154` (upgrade), `Negatives:` (add inside card body), `Royalties` (uses `ExportMenu`). 7+ places with inline `inline-flex items-center gap-1.5 h-7/8/9 px-3 ... rounded-md ... bg-zinc-900 text-white` etc — `Button` primitive exists (`components/ui/Button.tsx`) but is only used by `ListingStudio` and `Research`. **Migration opportunity, not bug.**
6. **Subtitle text is information-dense, not contextual** — `CampaignsPage:188–193` ("date_from – date_to · filtered / total"), `BooksPage:301–306`, `Reports:298–303`. Every subtitle is a stats string. Mockup-style subtitles are human-readable single sentences. 10+ pages affected.
7. **Locked-state design diverges** — `Automation:130–164` uses a centered violet circle with `Sparkles`, `ListingStudio:73–103` uses the same, `Research:96–113` uses `Compass` (still violet), `Briefing:144–177` uses `Sparkles` again, `KeywordsPage` Reverse-ASIN locked uses different. **All 5 lock-screens are 80% identical** — one `<LockedFeatureCard>` primitive would unify them. (Note: `LockedFeature` exists for wrapping CTAs, but no shared layout for the surrounding heading+icon+description.)
8. **Range picker in header right-slot** — `Dashboard`, `Books`, `Alerts`, `PnL`, `Reports`, `Keywords`, `Campaigns`, `SearchTerms`, `Comparison`. **9 pages** — but on `Comparison` it's two side-by-side `PeriodSelect` instances rather than `RangePicker`; on `Reports` granularity is missing; on `Dashboard` `QuickPeriodSegment` sits next to `RangePicker`. Three flavors of "pick a date window".
9. **Section grouping in sidebar doesn't match page weight** — Actions section in nav contains `ActionCenter` (log), `Automation` (recommendations), `Alerts` (signals), `Operations` (kanban), `ListingStudio` (AI rewrite), `Briefing` (AI summary). Five very different surfaces — most are read-only or background-task style, while `Operations` is the only true "doing work" page. `ListingStudio` & `Briefing` are AI-generation, not actions. Could move to a new "AI" group.
10. **`ActiveFiltersBar` usage is inconsistent** — present on `Dashboard`, `Books`, `Campaigns`, `PnL`, `Reports`, `Comparison`, `SearchTerms` (7 pages). Absent on `Keywords`, `Alerts`, `Negatives`, `Accounting`, `ActionCenter`, `Operations`, `Automation`, `Profile`, `Briefing`, `Research`, `ListingStudio`, `Royalties`, `Settings`, `CampaignDetails` (14 pages). Global filters apply on most of those; missing chip bars hide the active filter state. **Bug + design issue.**

## Section mapping & misplacement

Current nav grouping (`MainLayout.tsx:120–158`):

| Section | Pages | Notes |
|---|---|---|
| **main** | Dashboard, Books, Campaigns, Keywords, SearchTerms, Negatives, Reports, Comparison, Research | Research feels like it belongs with ListingStudio/Briefing (all AI-driven) |
| **actions** | ActionCenter, Automation, Alerts, Operations, ListingStudio, Briefing | Mixed bag: 3 are signals/logs (read-only), 1 is task mgmt, 2 are AI generation. ListingStudio + Briefing + Research could be their own **AI** group. |
| **finance** | Royalties, PnL, Accounting | Coherent group |
| **bottom** | Settings | Has 11 tabs inside (a mini-app of its own) |
| **(unrouted in nav)** | Profile, CampaignDetails | Profile is reachable from UserMenu only; CampaignDetails from drill-down |

**Misplaced:** ListingStudio, Briefing, Research → propose new "AI" section. ActionCenter and Alerts are arguably the same kind of thing (event streams) — could merge or share a tab structure.

**Hidden:** Profile route has a top-level page but no sidebar item — currently a dead end from the UserMenu only. Either promote (Settings → Profile sub-tab) or expose.

## Recommendations

Ordered by leverage (how many pages a single fix improves):

1. **Add `Select`, `Tabs`, and `Button` primitives to `components/ui/`** — `Button.tsx` exists but is barely used; promote it. `Select` and `Tabs` would consolidate ~25 inline implementations across 12+ pages. Without this, every visual fix is a 12-file diff.
2. **Promote table body to `text-sm`** (from `text-xs`) and headers to `text-xs uppercase` (from `text-[11px]`). Single Tailwind utility class swap, but lifts the readability of every list page. Affects ~12 tables.
3. **KPI strip: switch `grid-cols-4` to a responsive `grid-cols-2 md:grid-cols-3 xl:grid-cols-4` with `gap-4`**, and bump `Kpi` value from `text-2xl` to `text-3xl` to match the mockup. Promotes the "big number" effect on 9 pages.
4. **Build `LockedFeatureCard` primitive** — same icon + heading + description + CTA. Replaces 5 hand-rolled lock screens; ensures Pro upsell consistency.
5. **Reports page redesign is mandatory** — 14 tabs is not navigation, it's a sitemap. Group into "Time series" (overview, hourly, budget_pacing) / "Breakdown" (by-marketplace, by-account, by-book, by-campaign, by-keyword) / "Cross-cut" (matrix, placement, match_type, targeting_type, bidding_strategy, campaign_type) with a section header instead of a flat tab strip.
6. **Standardize `PageHeader` right-slot to max 2 controls** — most pages overflow to 3–5. Move secondary controls (export menu, filter chips) into a sub-row under the header.
7. **Add a chart hero to data list pages** that don't have one — Keywords (top movers), Campaigns (spend trend), SearchTerms (impressions trend), Comparison (delta bar chart), Reports (already absent on breakdown tabs). Use the existing `HeroChart` shape from `Dashboard`.
8. **Color: introduce one warm/decorative accent beyond emerald/red semantic.** Current palette is zinc-900/zinc-500/emerald-600/red-600/violet-600 (locked only). Mockup has gradient charts, soft mint backgrounds, and KDP-emerald accent applied as decoration (not semantic). One additional accent gives the design pass somewhere to put visual weight.
9. **Reduce density on `BooksPage`** — 11-column table with expand carets is the densest surface in the app. Move the bottom 6 columns (royalty, beAcos, maxCpc, TACoS, ratings, etc.) into an expandable details panel or behind a "show advanced" toggle.
10. **Move `Profile` either into Settings tabs (Settings → Profile) or expose it in the sidebar.** Currently it's an orphan route reachable only from UserMenu.
11. **`ActiveFiltersBar` everywhere global filters apply** — 14 of 21 pages are missing it but inherit the global filters. Users have no way to tell what's filtered.
12. **Add a subtle illustration / icon-block to single-purpose pages** (Profile, Briefing, Listing Studio, Research) — they read as form-driven config screens because they have no visual identity. A 64px lucide icon in a tinted circle next to the title would differentiate them from list pages.
