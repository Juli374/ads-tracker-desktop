# 05 — Navigation & IA Audit
_Date: 2026-05-16 · Scope: option B (cosmetic + design-system, NOT IA rebuild)_

## Executive summary

The sidebar is **functionally fine but visually noisy**: 18 visible items across 3 unlabeled-by-default sections (Analytics 9 / Actions 6 / Finance 3) plus Settings, all sharing one flat scrolling list. The mental model is mostly coherent (Analytics = "look", Actions = "do", Finance = "money"), but Listing Studio and Briefing — both AI surfaces — currently live under **Actions** despite being content/AI tools, and Operations + Action Center are easy to confuse. The two biggest concrete problems are *not* sidebar density, they are **discoverability**: (1) the attribution window is hardcoded to `'14d'` on 4 pages — Dashboard, Reports, Comparison, Books drill — and **has zero global UI control**; the only `AttributionToggle` lives on PnL (`PnLPage.tsx:163`). (2) Sync UX moved from "buried button somewhere" to a topbar pill in this branch (`SyncStatusPill.tsx` is the new unstaged file), which is a genuine improvement, but it ships *alongside* the old `Settings → Full Sync` configurator with no cross-link until the user opens the popover.

**Recommended option-B direction:** keep the 3-section sidebar, but (a) add a global Attribution selector to the topbar cluster, (b) collapse low-traffic items behind a "More" submenu, (c) regroup Listing Studio + Briefing + Research under a new "AI" subhead (no rename, just a divider), (d) audit the two `G E` hotkey collisions.

## Current IA map

### Sidebar — three sections, 19 items total
Source: `MainLayout.tsx:120-159`.

| Section | Items (id · icon · hotkey · feature gate) |
|---|---|
| **Analytics** (9) | `dashboard` LayoutDashboard `G O` · `books` BookOpen `G B` · `campaigns` Target `G C` · `keywords` Key `G K` · `search_terms` Search `G S` · `negatives` Ban `G N` · `reports` FileText `G R` · `comparison` GitCompare `G P` · `research` Compass `G H` (Pro: `ai.niche_explorer`) |
| **Actions** (6) | `action_center` History `G A` · `automation` Zap `G U` (Pro: `automation.rules`) · `alerts` Activity `G L` · `operations` ClipboardList `G T` (Pro: `automation.rules`) · `listing_studio` Sparkles `G E` (Pro: `ai.title_generator`) · `briefing` Mail `G J` (Pro: `ai.weekly_briefing`) |
| **Finance** (3) | `royalties` Coins `G Y` · `pnl` PiggyBank `G E` · `accounting` Wallet `G F` |
| **(bottom)** | `settings` Settings (no hotkey) |
| **(footer)** | `ConnectionIndicator` (online/offline ping every 30s, `MainLayout.tsx:466-530`) |

Two pages exist as views but are **not** in the sidebar: `campaign_details` (drill-only) and `profile` (reached via UserMenu → "Profile" or `G I`).

### Topbar — 8 elements (`MainLayout.tsx:313-351`)
1. App logo + name "Ads Tracker" (left)
2. Version chip `v0.1.0` (left)
3. `<GlobalFilters />` — BookFilter + AccountFilter (conditional, only if `accounts.length > 1`) + MarketplaceFilter + "Reset all" chip when active
4. `⌘K` command palette trigger (`text-xs` button with kbd hint)
5. `<SyncStatusPill />` — NEW unstaged component, popover with progress + Sync-now + per-job cancel
6. `<CalendarBell />` — re-exports `CalendarDropdown` (mini-month grid + AddEvent)
7. `<NotificationsBell />` — unread dot + dropdown list
8. `<UserMenu />` — avatar initial + theme segmented control + Profile/Settings/Sign-out

That's effectively **3 logo-ish + 5 interactive controls** on the right cluster, and one row of filter pills in the middle/right.

## Sidebar density problem

At 19 visible items the sidebar **scrolls inside its 56-unit-wide column** — the mockup is icon-only with ~5 entries, so the visual gap is large. Within option-B (no module rebuild):

| Option | Description | Effort | Impact | Risk |
|---|---|---|---|---|
| **A. Collapsible sections** | Actions + Finance collapsed by default with a chevron; remembers state in `localStorage`. | M (toggle state, animation, persisted key) | High — visually drops to ~10 rows | Low; hides Pro upsells from idle view, which may hurt conversion |
| **B. Icon-only "compact" mode toggle** | A button at the sidebar foot collapses to 40px-wide icons w/ tooltips; full mode = current. | M-L (tooltip wiring + `<aside w-12 vs w-56>` and per-row truncation) | Medium — power users gain space, novices stay on full | Medium; tooltips on icons across 19 items get verbose, and the active-state styling needs rework |
| **C. Pinning favorites** | Star icon on each row → pinned items rise to a "Pinned" subhead above Analytics. | M-L (per-user setting, drag-handle nice-to-have) | Medium — solves it for repeat users, not first-run | Medium; adds an empty-state to design and a "manage pins" surface |
| **D. Recent pages** | Auto-tracked stack of last 3-5 visited views above Analytics. | S-M (1 listener in `NavContext`, ring buffer) | Low-Medium — useful but redundant with hotkeys/⌘K | Low |
| **E. Hide low-traffic behind "More"** | `operations`, `comparison`, `research`, `accounting`, `briefing` go under a `More…` expander. | S | Medium — sidebar drops to 14 rows | Medium; "More" is where features go to die; Pro items hidden = bad for upgrade signal |
| **F. Subhead inside Actions** | Add a thin "AI" subhead between `alerts` and `listing_studio` so AI surfaces visually cluster. No collapse, just typography. | XS | Medium — improves grouping clarity, no functional change | Very low |
| **G. Sidebar collapse on narrow window** | Below 1024px width, collapse to icon-only; below 768px hide entirely behind a hamburger. | M | Low (Electron window almost never that narrow) | Low |

**Recommended combo for option B:** **F + A** (Actions/Finance collapsed by default, AI subhead inside Actions). Keep Analytics expanded — that's the section users actually navigate.

## Top-tab option — quick critique (not for option B, for the record)

The mockup's 4 top-tabs (Ads / Analytics / Publishing / AI Tools) map to `design-dna.json:22-28` modules (ads / analytics / publishing / ai / marketplace). The current sidebar **conflates "Analytics" with "Ads workspace"** — books, campaigns, keywords, search terms, negatives are all advertising surfaces, not analytics in the dashboard sense. In the mockup IA, "Ads" would absorb 5-6 current Analytics items, "Analytics" shrinks to Dashboard/Reports/Comparison/Alerts, "Publishing" absorbs Books + Listing Studio + Royalties + PnL, and "AI Tools" absorbs Research + Listing Studio + Briefing. **For option B we don't rebuild this**, but the mismatch explains why the sidebar feels mixed: Books is currently a publishing surface filed under Analytics, and Listing Studio is an AI tool filed under Actions.

## Discoverability findings (sync, attribution)

| Item | Where it lives now | File:line | Buried? | Proposal |
|---|---|---|---|---|
| **Attribution window (1d / 7d / 14d / 30d)** | `<AttributionToggle>` rendered **only on PnL** | `PnLPage.tsx:163`, `PnLPage.tsx:242` (`ATTRIBUTIONS` array) | **YES, severely.** Hardcoded `attribution="14d"` on Dashboard (`DashboardPage.tsx:282, 300`), Reports (`ReportsPage.tsx:355, 368, 381`), Comparison (`ComparisonPage.tsx:274`), Books drill (`CampaignWeeklyMetrics.tsx`), and the default in `metrics.ts:417` (`DEFAULT_ATTRIBUTION`). User cannot change attribution outside PnL. | Lift `AttributionToggle` into the topbar GlobalFilters cluster, persist to `localStorage`, default `14d`. Or, if module-by-module: render it next to each page's `RangePicker`. |
| **Sync (run now, see progress, cancel)** | `<SyncStatusPill>` topbar pill (NEW, unstaged) | `SyncStatusPill.tsx:152-188` (pill), `:222-265` (active jobs list) | **No longer buried** — pill is visible at all times and the popover's bottom strip says *"Open Settings → Full Sync"* for granular control (`SyncStatusPill.tsx:267-270`). The old discoverability hole is fixed by this branch. | Confirm pill ships; cross-link from Settings → Full Sync back to the pill so the relationship is two-way. |
| **Full Sync configurator** | `Settings → Full Sync` tab | `SettingsTabs.tsx:41`, `settings/fullSync/index.tsx` | Still requires opening Settings; that's correct for granular control. | No change. The pill's text-link is enough. |
| **Profile** | `UserMenu` → "Profile", or `G I` hotkey (not in sidebar) | `UserMenu.tsx:32-35`, `MainLayout.tsx:186` (`i: 'profile'`) | Mildly buried (not in sidebar, in CommandPalette as `G I`). Reasonable. | Leave as-is. |
| **Theme switch** | `UserMenu` dropdown segmented control | `UserMenu.tsx:80-116` | Reasonable. | Leave as-is. |
| **Connection status** | Sidebar footer pill | `MainLayout.tsx:521-528` | Reasonable but slightly redundant with `SyncStatusPill` error state. | Consider folding into SyncStatusPill so the topbar pill turns amber on offline, sidebar footer goes away — saves vertical space. |

## Hotkey conflicts

All hotkeys are `G + <letter>`, registered in `MainLayout.tsx:170-196` (`HOTKEY_MAP`) and mirrored in `CommandPalette.tsx:88-130`.

| Combo | Page | Source | Notes |
|---|---|---|---|
| `G O` | dashboard | sidebar | "O" = "Overview" |
| `G B` | books | sidebar | |
| `G C` | campaigns | sidebar | |
| `G K` | keywords | sidebar | |
| `G S` | search_terms | sidebar | |
| `G N` | negatives | sidebar | |
| `G R` | reports | sidebar | |
| `G P` | comparison | sidebar | "P" = comParison |
| `G H` | research | sidebar | "H" = hypothesis (comment notes G R was taken) |
| `G A` | action_center | sidebar | |
| `G U` | automation | sidebar | |
| `G L` | alerts | sidebar | "L" = aLert |
| `G T` | operations | sidebar | "T" = Tasks |
| **`G E`** | **listing_studio** (sidebar metadata, line 144) **AND** **pnl** (sidebar metadata, line 153) | **CONFLICT** | Both items declare `shortcut: 'G E'` in their NavItem entries. The actual key-handler in `HOTKEY_MAP` line 184 maps `e → pnl`, and line 189 maps `w → listing_studio` (the comment line 187-188 explicitly says "`E` is taken by P&L (Earnings)"). **So the runtime hotkey for Listing Studio is `G W`, but the sidebar still displays `G E`.** Stale label. CommandPalette also displays `G E` for listing-studio (line 106). This matches the memory note about "G E reassigned." |
| `G J` | briefing | sidebar | "J" = Journal |
| `G Y` | royalties | sidebar | "Y" = roYalty |
| `G F` | accounting | sidebar | "F" = Finance |
| `G I` | profile | command palette only | Not displayed in sidebar (profile isn't in sidebar) |

**Conflict to fix:** update `listing_studio` sidebar `shortcut` from `'G E'` → `'G W'` in `MainLayout.tsx:144`, and the CommandPalette `hint` from `'G E'` → `'G W'` in `CommandPalette.tsx:106`. Pure-cosmetic, no behavior change.

## Command palette coverage

`CommandPalette.tsx:88-163` enumerates 21 entries.

| Pages NOT in palette | Status |
|---|---|
| `campaign_details` | Correct — drill-only, no static label |
| `settings` | Present (`go-settings`, line 130) |

**Pages covered:** all 19 sidebar items + profile + settings = 21. **Coverage is complete.**

Actions beyond navigation in the palette: `reload`, `copy-api-url`, `sign-out`, `run-briefing-now` (Phase M.5), plus Phase L.5 "Ask AI" panel + 3 AI verbs (rewrite-blurb / explain-spike / suggest-negatives). **Missing actions worth adding for option B:**
- `Sync now` (currently only in `SyncStatusPill`)
- `Open Settings → Full Sync` (deep-link)
- `Toggle theme` (currently only in UserMenu)
- `Reset global filters` (currently only via `<X />` chip when active)

These are 5-line additions; each saves a click.

## Topbar audit

Right cluster from left to right: GlobalFilters (3-4 chips) · `⌘K` button · SyncStatusPill · CalendarBell · NotificationsBell · UserMenu. That's **3-4 filter buttons + 5 controls = 8-9 interactive targets in one row**.

Visual balance: the cluster is currently *full* but not crowded — every control is `h-7` and uses the same zinc palette. The risk is that **GlobalFilters chips can grow** (long book titles truncate at 140px; marketplace shows a count > 1 as "3 markets"), pushing the right-side icons toward the center. Two visual issues:
1. The `⌘K` button has both an icon and a "Search" label and a kbd badge — heaviest control in the row. The mockup's quick-action button (e.g. "Sync now" or "+ New") would go in this slot if introduced.
2. SyncStatusPill carries text (`Syncing 47%` or `Synced 3m ago`) — width varies up to ~140px during sync. Consider truncating the relative time on narrow widths.

**Where a mockup-style "Quick action" button would go:** to the immediate **left** of `⌘K`, styled as a filled accent button (the only color-pop in an otherwise zinc row). It would be the visual anchor the user's eye lands on. For option B, the natural quick-action is **"Sync now"** — which is already inside `SyncStatusPill`, so the cheap version is to make the pill itself the primary action and only show the chevron/popover on hover. Larger redesign would add an explicit `+ New campaign` button.

## Window resize / collapse

The aside is hardcoded to `w-56` (`MainLayout.tsx:354`). No media-query collapse. Electron windows can be resized to ~800px; at that width the sidebar (224px) consumes 28% of horizontal space, which is fine. Below 600px the layout would be cramped, but Electron `BrowserWindow.minWidth` is typically set high enough. **No action needed for option B.**

## Within-option-B recommendations (ordered)

1. **Fix `G E` collision label** (sidebar + palette) → `G W` for Listing Studio. *Effort: XS · Impact: trust*
2. **Add Attribution selector to topbar** (next to GlobalFilters or as its own pill) and remove the hardcoded `attribution="14d"` on Dashboard, Reports, Comparison, Books drill. Persist to `localStorage`. *Effort: M · Impact: closes Phase P bug · Touches 4 pages + 1 new control*
3. **Add "AI" subhead inside the Actions section** (typography divider only; no code restructure beyond a `<div>`). *Effort: XS · Impact: clarity*
4. **Collapse Actions + Finance by default**, remember collapse state in `localStorage`. *Effort: M · Impact: visual quiet*
5. **Add 4 missing actions to ⌘K**: Sync now, Open Settings → Full Sync, Toggle theme, Reset global filters. *Effort: S · Impact: keyboard parity*
6. **Fold sidebar-footer ConnectionIndicator into SyncStatusPill error state** (the pill already turns amber on error) and remove the footer pill, freeing the sidebar bottom. *Effort: S · Impact: clutter*
7. **Cross-link Settings → Full Sync back to the topbar pill** with a one-line hint. *Effort: XS · Impact: discoverability*

## Out-of-scope for option B (note for future C / full redesign)

- Top-tab IA (Ads / Analytics / Publishing / AI Tools) per mockup and `design-dna.json` modules.
- Reclassifying Books from Analytics → Publishing.
- Reclassifying Listing Studio + Briefing from Actions → AI Tools.
- Icon-only sidebar mode (option B from density table — keep for full redesign).
- Pinning / Recent / "More" submenus (options C/D/E from density table).
- Mobile / narrow-window responsive collapse.
- Replacing the 3-section sidebar with a 2-level navigation (workspace + sub-nav).
- Quick-action filled accent button next to `⌘K`.
- Unifying SettingsTabs (11 tabs) into the main nav.
