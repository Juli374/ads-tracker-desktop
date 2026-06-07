I have everything needed. The `sections.ai` key is referenced with a `defaultValue` fallback in MainLayout (so "AI" renders even though it's absent from nav.json). Here is the complete map.

---

# KDPBook Desktop — Navigation / Shell Map

All paths absolute. The shell is a **flat, context-driven, switch-based navigator** — no react-router. A single `ViewId` union is the source of truth; `NavContext` holds the active page; `MainLayout` declares sidebar config arrays + renders the active page via a `switch`. There is **no persisted, user-controlled show/hide layer today** — only an entitlement-driven *badge* (never hides, never blocks).

---

## (1) Every navigable view

ViewId union: `/Users/yulii/KDP-business/ads-tracker-desktop/src/renderer/contexts/NavContext.tsx:9-33`. Labels: `/Users/yulii/KDP-business/ads-tracker-desktop/src/renderer/i18n/resources/en/nav.json:7-28` (key `items.<id>`). Page imports: `MainLayout.tsx:28-99`. Sidebar group + icon + feature: `MainLayout.tsx:123-165`.

| ViewId | Label (`items.*`) | Page component file | Icon | Sidebar group | In sidebar? | Entitlement gate (badge only) |
|---|---|---|---|---|---|---|
| `dashboard` | Overview | `src/renderer/pages/DashboardPage.tsx` (eager) | `LayoutDashboard` | `mainNav` → "Analytics" | yes | — |
| `books` | Books | `src/renderer/pages/BooksPage.tsx` (eager) | `BookOpen` | `mainNav` → Analytics | yes | — |
| `campaigns` | Campaigns | `src/renderer/pages/CampaignsPage.tsx` (eager) | `Target` | `mainNav` → Analytics | yes | — |
| `keywords` | Keywords | `src/renderer/pages/KeywordsPage.tsx` (lazy) | `Key` | `mainNav` → Analytics | yes | — |
| `search_terms` | Search terms | `src/renderer/pages/SearchTermsPage.tsx` (lazy) | `Search` | `mainNav` → Analytics | yes | — |
| `negatives` | Negatives | `src/renderer/pages/NegativesPage.tsx` (lazy) | `Ban` | `mainNav` → Analytics | yes | — |
| `reports` | Reports | `src/renderer/pages/ReportsPage.tsx` (lazy) | `FileText` | `mainNav` → Analytics | yes | — |
| `comparison` | Comparison | `src/renderer/pages/ComparisonPage.tsx` (lazy) | `GitCompare` | `mainNav` → Analytics | yes | — |
| `research` | Research | `src/renderer/pages/ResearchPage.tsx` (lazy) | `Compass` | `mainNav` → Analytics | yes | **`ai.niche_explorer`** (Pro) |
| `action_center` | Action center | `src/renderer/pages/ActionCenterPage.tsx` (lazy) | `History` | `actionsNav` → "Actions" | yes | — |
| `automation` | Automation | `src/renderer/pages/AutomationPage.tsx` (lazy) | `Zap` | `actionsNav` → Actions | yes | **`automation.rules`** (Business) |
| `alerts` | Monitoring | `src/renderer/pages/AlertsPage.tsx` (lazy) | `Activity` | `actionsNav` → Actions | yes | — |
| `operations` | Operations | `src/renderer/pages/OperationsCenterPage.tsx` (lazy) | `ClipboardList` | `actionsNav` → Actions | yes | **`automation.rules`** (Business) |
| `listing_studio` | Listing Studio | `src/renderer/pages/ListingStudioPage.tsx` (lazy) | `Sparkles` | `aiNav` → "AI" | yes | **`ai.title_generator`** (Pro) |
| `briefing` | Briefing | `src/renderer/pages/BriefingPage.tsx` (lazy) | `Mail` | `aiNav` → AI | yes | **`ai.weekly_briefing`** (Pro) |
| `royalties` | Royalty | `src/renderer/pages/RoyaltiesPage.tsx` (lazy) | `Coins` | `financeNav` → "Finance" | yes | — |
| `pnl` | P&L | `src/renderer/pages/PnLPage.tsx` (lazy) | `PiggyBank` | `financeNav` → Finance | yes | — |
| `accounting` | Accounting | `src/renderer/pages/AccountingPage.tsx` (lazy) | `Wallet` | `financeNav` → Finance | yes | — |
| `settings` | Settings | `src/renderer/pages/SettingsPage.tsx` (eager) | `Settings` | `bottomNav` (footer) | yes | — |
| `profile` | Profile | `src/renderer/pages/ProfilePage.tsx` (lazy) | `User` (palette only) | **none** | **no** — reachable via UserMenu (`UserMenu.tsx:33`), palette, hotkey `G I` | — |
| `campaign_details` | (no `items` key) | `src/renderer/pages/CampaignDetailsPage.tsx` (lazy) | — | **none** | **no** — drill-down target only (`navigate('campaign_details', {...})`) | — |

Two views are **routable but not in any sidebar array**: `profile` (entered via UserMenu/palette/hotkey) and `campaign_details` (drill-down only). Both still have `case`s in the render switch.

**Important nuance on "gated":** the `feature` field never hides or disables a nav item. It only flips a Pro/Business *badge*. Navigation always succeeds; the destination page renders its own `LockedFeatureCard`/`LockedFeature` upsell. See `MainLayout.tsx:114-119` (the `NavItem.feature` JSDoc) and `441-472` (the `NavItemRow` wrapper).

---

## (2) How sidebar items are declared and rendered

**Declared** as five plain arrays of `{ id, icon, shortcut?, feature? }` — `MainLayout.tsx:110-165`:

```ts
// MainLayout.tsx:110-120
interface NavItem {
  id: ViewId;
  icon: React.ElementType;
  shortcut?: string;
  feature?: FeatureKey;   // Phase K: only flips a Pro/Business badge; click NOT blocked
}

// MainLayout.tsx:123-165
const mainNav: NavItem[] = [
  { id: 'dashboard', icon: LayoutDashboard, shortcut: 'G O' },
  { id: 'books', icon: BookOpen, shortcut: 'G B' },
  { id: 'campaigns', icon: Target, shortcut: 'G C' },
  { id: 'keywords', icon: Key, shortcut: 'G K' },
  { id: 'search_terms', icon: Search, shortcut: 'G S' },
  { id: 'negatives', icon: Ban, shortcut: 'G N' },
  { id: 'reports', icon: FileText, shortcut: 'G R' },
  { id: 'comparison', icon: GitCompare, shortcut: 'G P' },
  { id: 'research', icon: Compass, shortcut: 'G H', feature: 'ai.niche_explorer' },
];
const actionsNav: NavItem[] = [
  { id: 'action_center', icon: History, shortcut: 'G A' },
  { id: 'automation', icon: Zap, shortcut: 'G U', feature: 'automation.rules' },
  { id: 'alerts', icon: Activity, shortcut: 'G L' },
  { id: 'operations', icon: ClipboardList, shortcut: 'G T', feature: 'automation.rules' },
];
const aiNav: NavItem[] = [
  { id: 'listing_studio', icon: Sparkles, shortcut: 'G W', feature: 'ai.title_generator' },
  { id: 'briefing', icon: Mail, shortcut: 'G J', feature: 'ai.weekly_briefing' },
];
const financeNav: NavItem[] = [
  { id: 'royalties', icon: Coins, shortcut: 'G Y' },
  { id: 'pnl', icon: PiggyBank, shortcut: 'G E' },
  { id: 'accounting', icon: Wallet, shortcut: 'G F' },
];
const bottomNav: NavItem[] = [
  { id: 'settings', icon: Settings },
];
```

**Rendered** by hardcoded section headers, each followed by `<array>.map(renderNavItem)` — `MainLayout.tsx:364-389`:

```tsx
// MainLayout.tsx:364-389
<aside className="w-56 ...">
  <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
    <div className="...">{t('sections.analytics')}</div>
    {mainNav.map(renderNavItem)}
    <div className="...">{t('sections.actions')}</div>
    {actionsNav.map(renderNavItem)}
    <div className="...">{t('sections.ai', { defaultValue: 'AI' })}</div>
    {aiNav.map(renderNavItem)}
    <div className="...">{t('sections.finance')}</div>
    {financeNav.map(renderNavItem)}
  </nav>
  <div className="p-2 border-t ...">
    {bottomNav.map(renderNavItem)}
  </div>
  <ConnectionIndicator />
</aside>
```

`renderNavItem` (`MainLayout.tsx:308-315`) → `NavItemRow` (`MainLayout.tsx:441-472`), which calls `useEntitlement(item.feature ?? 'ai.title_generator')` **unconditionally** (stable hook order — note the `??` fallback for items without a `feature`), computes `isLocked = item.feature ? !ent.on : false`, and forwards a `lockedTier` badge to the `UINavItem` primitive (`src/renderer/components/ui/NavItem.tsx:50-160`). The primitive renders a button; the badge (`NavItem.tsx:102-109`) and shortcut hint (`110-118`) are mutually exclusive. `NavItem` **always renders** — no "hidden" branch exists anywhere in it.

---

## (3) How the active page is selected and rendered

State lives in `NavContext` — `NavContext.tsx:68-91`: `const [page, setPage] = useState<ViewId>(initial)`, `initial="dashboard"` set where `MainLayout` mounts `<NavProvider initial="dashboard">` (`MainLayout.tsx:167-171`). `navigate(next, filters)` (`NavContext.tsx:76-83`) sets the page, sets filters, and resets `booksDrill` when leaving `books`.

The page is selected by a `switch` on `page`, `MainLayout.tsx:261-306`:

```tsx
// MainLayout.tsx:261-306 (abridged)
const renderContent = () => {
  switch (page) {
    case 'dashboard':        return <DashboardPage />;
    case 'books':            return <BooksPage />;
    case 'search_terms':     return <SearchTermsPage />;
    case 'campaigns':        return <CampaignsPage />;
    case 'campaign_details': return <CampaignDetailsPage />;
    case 'keywords':         return <KeywordsPage />;
    case 'action_center':    return <ActionCenterPage />;
    case 'automation':       return <AutomationPage />;
    case 'alerts':           return <AlertsPage />;
    case 'comparison':       return <ComparisonPage />;
    case 'royalties':        return <RoyaltiesPage />;
    case 'pnl':              return <PnLPage />;
    case 'operations':       return <OperationsCenterPage />;
    case 'accounting':       return <AccountingPage />;
    case 'reports':          return <ReportsPage />;
    case 'negatives':        return <NegativesPage />;
    case 'profile':          return <ProfilePage />;
    case 'listing_studio':   return <ListingStudioPage />;
    case 'research':         return <ResearchPage />;
    case 'briefing':         return <BriefingPage />;
    case 'settings':         return <SettingsPage />;
  }
};
```

Rendered inside `<Suspense fallback={<PageFallback />}>{renderContent()}</Suspense>` (`MainLayout.tsx:393-397`) — lazy chunks (`MainLayout.tsx:40-99`) gated by Suspense. The switch is **exhaustive over `ViewId`** but has no `default`. Three independent navigation entry points all funnel through `navigate()`: sidebar clicks (`MainLayout.tsx:313`), `G`-prefixed hotkeys (`HOTKEY_MAP` `MainLayout.tsx:176-202`, handler `231-259`), and the CommandPalette.

---

## (4) CommandPalette: action list and how it's built

File: `src/renderer/components/CommandPalette.tsx`. Items are a single `useMemo<PaletteItem[]>` array (`CommandPalette.tsx:93-207`) — **a second, fully hand-maintained list, parallel to and independent of `MainLayout`'s arrays** (no shared config). Filtered by substring on `label` (`209-213`). Each `PaletteItem` is `{ id, label, hint?, icon, onRun }` (`40-46`).

Navigation entries (19) — each `onRun: goto(viewId)` (`goto` at `80-86`), label from `goLabel` → `t('palette.goTo', {target})`:

`go-dashboard, go-books, go-search, go-campaigns, go-keywords, go-reports, go-comparison, go-negatives, go-action-center, go-automation, go-alerts, go-operations, go-royalties, go-pnl, go-accounting, go-profile, go-listing-studio, go-research, go-briefing, go-settings` (`CommandPalette.tsx:95-136`). Note `go-profile` (`110`) is the palette-only path to a non-sidebar view.

Command/utility entries (9): `run-briefing-now` (`117-135`), `reload` (`137-144`), `copy-api-url` (`145-159`), `toggle-theme` (`162-172`), `reset-filters` (`173-184`), `open-full-sync` (`185-195`), `sign-out` (`196-204`). Plus an **Ask-AI fallback** surfaced when query starts with `?`/`ask ` or yields zero matches (`showAskAi` `227-234`; rendered `390-462`), with 3 quick AI verbs (`aiVerbs` `238-259`).

**Palette does NOT consult entitlements for nav visibility.** Every `go-*` entry is always present and clickable regardless of tier; only the inline Ask-AI verbs check `aiEnt.on` (`CommandPalette.tsx:69, 264-269`). So the palette is a second surface that would also need filtering for any show/hide module layer.

---

## (5) Existing notion of core-vs-optional / conditional hiding

**There is none for nav items.** Findings:

- **No persisted module-visibility store exists.** Greps for `hiddenModules`, `moduleVisibility`, `visibleModules`, `navPrefs` → zero hits. The only persisted UI prefs are theme (`ThemeContext.tsx:29` key `theme:mode`, via `localStorage`) and the Settings last-tab (`SettingsPage.tsx:52` key `settings:lastTab`, via `useSessionState`).
- **The only conditional treatment of a nav item is the entitlement *badge*** — `NavItemRow` (`MainLayout.tsx:441-472`) + `NavItem` `lockedTier` (`ui/NavItem.tsx:90-109`). It changes appearance only; it never removes the item or blocks `onClick`. Same for the page-body gates (`LockedFeature.tsx`, `ui/LockedFeatureCard.tsx`) which dim/upsell content but never hide nav.
- **Settings has a tabbed structure** (`SettingsPage.tsx:21-96`, tabs incl. `application`, `privacy`, etc.) — the natural home for a "Modules" management UI, but no such tab exists yet.
- Forced-tier override exists for QA only (`ADS_TRACKER_FORCE_TIER`, `entitlements.ts:205-225`) — not a user-facing toggle.

---

## The EXACT seam for a user-controlled show/hide MODULE layer

A nav item's visibility is decided in exactly **two places**, both of which currently render unconditionally. To gate visibility you must intercept both:

1. **PRIMARY seam — the sidebar render loop, `MainLayout.tsx:369/374/379/384`** (`{<array>.map(renderNavItem)}`) and the per-item wrapper `NavItemRow` at `MainLayout.tsx:441-472` / `renderNavItem` at `308-315`. This is where a `NavItem` becomes a visible row. The cleanest insertion is a `.filter(isVisible)` *before* each `.map(renderNavItem)`, or pushing the predicate into `renderNavItem`. The config arrays (`MainLayout.tsx:123-165`) are the place to add per-item metadata such as a `core: true` flag or a default-visible hint (e.g. `dashboard`/`settings` should be non-hideable).

2. **SECONDARY seam — the CommandPalette items memo, `CommandPalette.tsx:93-207`** (specifically the `go-*` entries `95-136`). This list is independent and must apply the same predicate, else hidden modules remain reachable via ⌘K.

Two reachability paths must be considered when defining "hidden": the **hotkey map** (`MainLayout.tsx:176-202` / handler `247-249`) and the **render `switch`** (`MainLayout.tsx:261-306`). For a true hide you'd likely keep the `switch` case (so a deep-link/drill-down still renders) but gate the hotkey + both visible lists. `profile` and `campaign_details` are already "hidden from sidebar but routable" — they are the existing precedent for the decoupling between *routability* (the switch) and *sidebar presence* (the config arrays).

**Recommended architecture given the existing patterns:** a new `ModuleVisibilityContext` mirroring `ThemeContext` (`localStorage`-backed via the existing `useSessionState` at `src/renderer/lib/useSessionState.ts`), seeded with all sidebar `ViewId`s visible, with `core` ids forced-on. Provide it in `App.tsx:63-85` (alongside the other providers), consume it in the `MainLayout` render loop (seam 1) and the palette memo (seam 2), and add a management UI as a new tab in `SettingsPage.tsx:21-96`. This keeps entitlement gating (badge, server-driven) and module gating (visibility, user-driven, local) as orthogonal concerns — entitlements stay in `NavItemRow`'s `useEntitlement`, visibility wraps the `.map`.