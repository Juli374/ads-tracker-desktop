# Implementation Plan — EN-first Parity (2026-05-09 → 2026-05-23)

> Master execution plan for closing the gap between the current Electron desktop client (RU, partial parity) and the Cloudscape original (EN target, full core-scope parity).
> Source-of-truth synthesis from:
> - `01-original-frontend.md` — what the original has
> - `02-original-backend-api.md` — endpoints
> - `03-current-desktop.md` — what the desktop has now
> - `04-i18n-inventory.md` — i18n strategy
> - `parity-plan.md` — phases 0-10 history
>
> **This plan continues the numbering from `parity-plan.md`** (phases 0–10 + R closed).
> New phases = **A → H**. Estimated total: **15–22 working days** (single engineer).

---

## 0. Prerequisites — pre-flight (BLOCKER, ~0.5 day)

> Without this, every later phase mixes "feature work" with "bookkeeping". Do this **first**, before Phase A.

### 0.1 Commit current working tree in chunks

State now (per `git status`): 36 modified, ~70 untracked, **zero commits** for phases 1–10 + R. `parity-plan.md` says everything is closed but nothing is in git.

Order of commits (one PR-shaped commit each):

1. `chore: gitignore / mcp / docs scaffolding` — `.gitignore`, `.mcp.json`, `.claude/`, `NEXT-SESSION-PROMPT*.md`, `RUFLO-USAGE.md`, `assets/`, `docs/electron-migration/audit-2026-05-09/*`, `docs/electron-migration/parity-plan.md`.
2. `phase-0: null-safe formatters` — `src/renderer/lib/format.{ts,test.ts}`.
3. `phase-1: dashboard parity (HeroChart, TopPerformers, Funnel, MP, Alerts)` — `src/renderer/api/metrics.ts`, `src/renderer/components/ui/KpiDelta.tsx`, `src/renderer/components/dashboard/*`, `src/renderer/pages/DashboardPage.tsx`, `src/test/mockApi.ts` (relevant chunk), `src/renderer/pages/__tests__/dashboard.smoke.test.tsx`.
4. `phase-2: campaigns full CRUD` — `src/renderer/api/{campaigns,adGroups,targets,negatives}.ts`, `src/renderer/components/{AddCampaignModal,EditCampaignModal,AddAdGroupModal,AddTargetModal}.tsx`, `src/renderer/pages/{CampaignsPage,NegativesPage}.tsx`, addCampaign tests.
5. `phase-3: campaign details drill-down` — `src/renderer/contexts/NavContext.tsx`, `src/renderer/components/{MainLayout,ui/EditableNumber}.tsx`, `src/renderer/pages/CampaignDetailsPage.tsx`, EditableNumber + campaignDetails tests.
6. `phase-4: keywords + negative lists v2` — `src/renderer/pages/KeywordsPage.tsx`, `src/renderer/components/NegativeListsTab.tsx`, `src/renderer/api/negativeLists.ts`, command palette + sidebar updates, keywords smoke test.
7. `phase-5: action center / automation / alerts` — `src/renderer/pages/{ActionCenterPage,AutomationPage,AlertsPage}.tsx`, `src/renderer/api/{actionCenter,automation}.ts`, NavContext expansion, financePages smoke test.
8. `phase-6: email login + OAuth deeplink + Amazon Ads section` — `src/renderer/components/{LoginScreen,AmazonAdsSection}.tsx`, `src/renderer/api/{auth,amazonAds}.ts`, `src/renderer/lib/useDeepLink.ts`, `src/index.ts` + `src/preload.ts` + `src/main/ipc-handlers.ts` + `src/shared/ipc.ts` deeplink chunk, `forge.config.ts` protocols.
9. `phase-7: reports breakdown tabs + comparison page` — `src/renderer/components/reports/BreakdownTab.tsx`, `src/renderer/pages/{ReportsPage,ComparisonPage}.tsx`.
10. `phase-8: royalties read-only` — `src/renderer/pages/RoyaltiesPage.tsx`, `src/renderer/api/{royalties,localRoyalty}.ts`, `src/main/local-db/{index,royalty}.ts`.
11. `phase-9: operations / calendar bell / accounting` — `src/renderer/pages/{OperationsCenterPage,AccountingPage}.tsx`, `src/renderer/components/CalendarBell.tsx`, `src/renderer/api/{tasks,calendar,accounting}.ts`.
12. `phase-10: dark theme + auto-update + signing scaffolds` — `src/renderer/contexts/ThemeContext.tsx`, `src/index.css`, `tailwind.config.js`, `src/renderer/components/{UpdateChecker,UserMenu}.tsx`, `src/main/updater.ts`.
13. `phase-R: security/perf hardening` — `src/main/{api-client,auth-store}.ts`, `src/index.ts` (windowOpenHandler/will-navigate/devtools-gate), `src/renderer/components/MainLayout.tsx` (React.lazy), `webpack.renderer.config.ts` (mode: production).
14. `chore: forge config + index.js + window typings` — `forge.config.ts` final, `index.js`, `src/renderer/window.d.ts`, `src/test/setup.ts` updates.

Each commit must:
- have `npm test` green and `npx tsc --noEmit` clean **at HEAD**
- not break `npm run package` (build smoke)
- be re-buildable in isolation (no half-merges)

**DoD:** working tree clean, `git log` shows 14 commits, each phase referenced by name.

### 0.2 Token rotation

Before any commit lands publicly: rotate `at_live_29099c08…` on Railway (still valid even though removed from source — the value was in git history before phase R fix). Memory item `project_security_rotate_token.md` already flags this. **Do not commit anything to a public remote until rotation is confirmed.**

### 0.3 Lint rule against new Cyrillic

Add ESLint custom rule (or `eslint-plugin-no-unsanitized` style regex) that fails CI when JSX text or string literal contains `[Ѐ-ӿ]` in `src/renderer/**/*.{ts,tsx}` **except** for:
- `src/renderer/i18n/resources/ru/**/*.json` (when RU returns)
- comments (`// …` and `/* … */`)
- `src/test/**`
- `src/renderer/**/__tests__/**` (until phase A.4 finishes test migration)

This is the safety net that keeps Phase A from regressing as later phases add UI.

**DoD:** `npm run lint` fails on a Cyrillic JSX literal in any non-allowed file.

---

## 1. Gap Matrix (features × status)

> Status legend: ✅ done, ◐ partial, ❌ missing. Priority: P0 must, P1 should, P2 nice. Effort: S<4h, M=4–12h, L=12–32h, XL>32h.

### 1.1 Dashboard

| Sub-feature | Original | Desktop now | Gap | Prio | Effort |
|---|---|---|---|---|---|
| 4 KPI delta cards | `analytics/overview/KpiCards.tsx` | `pages/DashboardPage.tsx` (4 KpiDelta) | none | — | — |
| Hero line chart, 12 toggleable metrics, max 6, dual Y | `overview/HeroChart.tsx` | `dashboard/HeroChart.tsx` | ✅ | — | — |
| Top Performers winners/losers per Books/Campaigns | `overview/TopPerformers.tsx` | `dashboard/TopPerformers.tsx` | ✅ | — | — |
| Marketplace donut | `charts/MarketplaceDistribution.tsx` | `dashboard/MarketplaceDistribution.tsx` | ✅ | — | — |
| Funnel Impr→Clicks→Orders | `charts/FunnelChart.tsx` | `dashboard/FunnelChart.tsx` | ✅ | — | — |
| Alerts widget (5 latest) | `analytics/Alerts.tsx` | `dashboard/AlertsWidget.tsx` | ✅ | — | — |
| **Quick segmented period (Last 30 / This month / Last month)** | `useSessionState('quickPeriod')` + SegmentedControl | only `RangePicker` (7d/30d/90d/custom) | add segmented presets row above RangePicker | P1 | S |
| **Organic vs Paid split block** | `analytics/OrganicPaidAnalytics.tsx` | ❌ | new component, endpoint `summary/organic-total` + `books/<id>/marketplace/<m>/organic` | P1 | M |
| BSR / ratings sparkline on dashboard | (in BooksPage in original) | ❌ | not on dashboard in original either — skip | P3 | — |

### 1.2 Books

| Sub-feature | Original | Desktop now | Gap | Prio | Effort |
|---|---|---|---|---|---|
| Book table with multi-MP rows | `pages/BooksPage.tsx` | `pages/BooksPage.tsx` | ✅ | — | — |
| Drill-down books → marketplaces → campaigns | original BooksPage handles all 3 levels | desktop drills only books → campaigns (via global filter) | new `MarketplacesPanel` mid-step + URL/Nav state for level | P1 | L |
| BSR sparkline chip + modal (last 168h) | `ratingsApi.getBsrHistory` → modal LineChart | ❌ | new `BsrSparklineCell` + modal | P1 | M |
| Ratings widget (5-star + count) | `allRatings` from `ratingsApi.getAllBooksRatings` | ❌ | new column + cell | P2 | S |
| Inline KDP metrics (royalty/page, BE-ACOS, max CPC) | inline cells in BooksPage table | ❌ | endpoint `POST /api/books/:id/kdp-metrics` per row | P2 | M |
| Weekly metrics transposed table per ASIN (1W/2W/4W/8W/12W) | `WeeklyMetricsTable.tsx` | ❌ | new component, `summary/by-book/trends` + `book-asins/<id>/weekly` | P1 | L |
| EditBookModal | `modals/EditBookModal/` | ❌ | title, author, account, BE-ACOS, max-CPC, royalty %, organic baseline | P2 | M |
| DeleteBookModal | `modals/DeleteBookModal.tsx` | ❌ | confirm + archive vs delete | P2 | S |
| AddAsinModal | `modals/AddAsinModal.tsx` | ❌ | marketplace + asin | P2 | S |
| UploadCoverModal (multipart) | `modals/UploadCoverModal.tsx` | ❌ | needs main-process file dialog + multipart `net.fetch`; new IPC `media:upload` | P2 | M |
| AddChangeModal (content history log) | `modals/AddChangeModal.tsx` | ❌ | endpoint `POST /api/books/:id/content-changes` | P3 | S |
| BookContentHistory timeline | `views/BookContentHistory.tsx` | ❌ | `/content-changes/grouped` | P3 | M |
| BookChecklist | `views/BookChecklist.tsx` | ❌ | requires `templates` API — out of personal-use core | P3 | M |

### 1.3 Campaigns + CampaignDetails

> The biggest visible gap per the user screenshots.

| Sub-feature | Original | Desktop now | Gap | Prio | Effort |
|---|---|---|---|---|---|
| CampaignsPage list + filters + pagination + inline-edit bid + add modal | `pages/CampaignsPage.tsx` | `pages/CampaignsPage.tsx` | ✅ | — | — |
| Header: name, type/status badges, breadcrumb | `views/CampaignDetails/index.tsx` | `pages/CampaignDetailsPage.tsx` | ✅ | — | — |
| **Header buttons: Pause/Resume, Budget edit inline** | `CampaignSettings.tsx` + amazon-ads PUT | only `Edit` button (full modal) | add Pause/Resume toggle + inline Budget edit | P0 | M |
| **1W/2W/4W/8W/12W timeline (sticky weeks-segmented control)** | `WeeksFilterContext` + `CampaignWeeklyMetrics.tsx` | ❌ | new `WeeksSegment` component bound to new context; `summary/by-book/trends` + `campaigns/<amzn>/weekly` | P0 | L |
| **Multi-period table (60d / 30d / weeks-N) of AD Sales / Spend / Orders / Impressions / Clicks / ACOS / CTR / CPC / CVR / ROAS** | `CollapsibleWeeklyTable.tsx` + `InlineWeeklyTable.tsx` | KPI row only (5 metrics, current period) | new `MultiPeriodMetricsTable` component, parallel fetch 60d/30d/Wn | P0 | L |
| **Hourly Dynamics chart** | `HourlyDynamicsChart.tsx` (Recharts ComposedChart + Brush + metric switch) | ❌ | new component, endpoint `metrics/campaigns/<amzn>/hourly` | P0 | L |
| AdGroups tab with inline-edit default bid | `KeywordsTable.tsx` ad-group sections | ✅ inline-edit via EditableNumber | — | — | — |
| Targets tab with inline-edit bid + status toggle | `KeywordsTable.tsx` rows | ✅ for bid; status toggle missing | add status toggle column | P1 | S |
| Bulk update bar (mass bid/state) | `KeywordsTable.tsx` selection bar | ❌ | add checkbox column + bulk bar | P1 | M |
| Negatives tab | `NegativesSection.tsx` | ✅ | — | — | — |
| Search Terms tab embed (mini) | `SearchTermsSection.tsx` | placeholder + jump link | embed scoped query reusing SearchTermsPage core | P1 | M |
| WeeklyHistory (audit trail) tab | `WeeklyHistory.tsx` + `WeekChanges.tsx` | placeholder | endpoint `campaigns/<id>/all-changes` | P1 | M |
| Placement modifiers (TOS / ROS / PP) editor | `CampaignPlacements.tsx` (907 lines incl. weekly breakdown) | partial — Edit modal has 3 number inputs | full inline editor + per-week placement breakdown | P2 | L |
| Campaign Settings panel (bidding strategy, daily budget, start date) | `CampaignSettings.tsx` | partial — in EditCampaignModal | inline editor in Header | P1 | M |
| **AI Advisor right-slide panel** | `AIAdvisorPanel.tsx` (482 lines) + SSE streaming | ❌ | requires `/api/ai-advisor/message` SSE handling — see "Risks" §4. Stub button + "coming soon" first | P2 | XL |

### 1.4 Reports + Comparisons

| Sub-feature | Original | Desktop now | Gap | Prio | Effort |
|---|---|---|---|---|---|
| Daily / Weekly tables + chart | `DailyAnalytics.tsx`, `WeeklyAnalytics.tsx` | partial — combined into "Динамика" tab | split into 2 tabs OR keep combined; add granularity toggle | P1 | S |
| Hourly tab | `HourlyAnalytics.tsx` | ❌ | add tab using `summary/hourly` | P2 | M |
| Marketplace tab | `MarketplaceAnalytics.tsx` (with drill-down) | inside "Динамика" sub-section | add drill-down to book list | P2 | M |
| Account tab | `AccountAnalytics.tsx` | ❌ | endpoint `summary/by-account` + table | P2 | M |
| Book tab | `BookAnalyticsCloudscape.tsx` (drill→campaign) | ❌ | endpoint `summary/by-book` + drill | P2 | M |
| Campaign tab | `CampaignAnalyticsCloudscape.tsx` | ❌ | endpoint `summary/by-campaign` | P2 | M |
| Keyword tab | `KeywordAnalyticsCloudscape.tsx` | partial — separate `KeywordsPage` | add as Reports tab too (read-only analytic, vs editable Keywords) | P2 | M |
| Placement / MatchType / Bidding / CampaignType / Targeting tabs | 5 tabs via `BreakdownTab` | ✅ all 5 present | — | — | — |
| Matrix tab | `MatrixReportCloudscape.tsx` | ❌ | books × marketplaces matrix table | P2 | M |
| Excel / PDF export | `analytics/export/index.tsx` (xlsx + jspdf) | only CSV | install `xlsx` + `jspdf`, port `convertToExcelData` + `createPDFReport` | P2 | L |
| Filters (accounts × marketplaces × books) | `ReportsFilters.tsx` | partial — global filters in topbar | add per-page Multiselect for accounts | P2 | S |
| Comparison page (2 PeriodPickers, dimensions, grouped layout) | `layout/ComparisonPage.tsx` (1261 LOC) | `pages/ComparisonPage.tsx` (top-50 books, 2 selects, 4 KPIs) | add dimension switcher (book/campaign/keyword/placement/match-type), Excel/PDF export | P2 | L |

### 1.5 Search Terms

| Sub-feature | Original | Desktop now | Gap | Prio | Effort |
|---|---|---|---|---|---|
| Tabs Inbox/Snoozed/Done/Paused/Archive/All | `SearchTerms/index.tsx` | ❌ — flat page | tabs + counters from `inbox-counts` endpoint | P1 | M |
| Filters (account, book, target, classification, term-type, strategic) | `SearchTermsFilters.tsx` | partial — basic filters | full filter panel | P1 | M |
| Bulk actions (analyze/snooze/done/pause/archive/restore) | `useSearchTermsActions.ts` + modals | ❌ | new bulk action toolbar + modals (Snooze/Pause/Negative/UnifiedList) | P1 | L |
| Trend modal (line chart per-day) | `SearchTermTrendModal.tsx` (`/api/search-terms/trend`) | ❌ | new modal | P2 | M |
| Add-negative-by-text quick action | `addNegativeByText` | ✅ | — | — | — |

### 1.6 Settings (9 tabs from screenshot)

> Critical: today's SettingsPage is flat cards. Without tabs the user cannot configure books / profiles / credentials / AI key.

| Tab (screenshot) | Original | Desktop now | Gap | Prio | Effort |
|---|---|---|---|---|---|
| **Books** | `settings/BookManagement/` (1015+178 LOC) | ❌ | full split-grid: BookListPanel + BookDetailsPanel; reuses Phase 1.2 Book modals | P1 | XL |
| **Credentials** (admin) | `CredentialsForm.tsx` (400 LOC, OAuth + manual) | partial — only Amazon OAuth start in `AmazonAdsSection` | full form with manual refresh-token paste, region selector | P1 | M |
| **Profiles (35)** | `ProfilesList.tsx` | partial — list embedded in Settings card | move to its own tab + sync button + counter badge in tab title | P1 | S |
| **Token** (admin) | `TokenInfo.tsx` (350 LOC) | partial — Card with masked key + storage type | full TokenInfo: refresh access_token button, expiry, copy-to-clipboard | P1 | M |
| **Full Sync** | `FullSync/` (390+228+CountrySelector+SyncOptionsGrid+SyncQueue 609 LOC) | ❌ | full implementation: account/country selectors, options grid, sync queue with polling | P0 | XL |
| **Search Term** | `ReportAPI/` (917+319 LOC) + embedded NegativeLists | ❌ | manual + scheduled report exports; coverage grid; AI analysis stats; embedded NegativeLists | P1 | XL |
| **Stream** | `MarketingStream/` (368 LOC) | ❌ | exec history + audit + countdown + run buttons | P2 | L |
| **Royalties** | `RoyaltiesImport.tsx` (570 LOC) | partial — separate page with Cloud/Local toggle | move into Settings tab + add real xlsx parser (currently TODO in `local-db/royalty.ts:111`) | P1 | L |
| **AI (Claude)** | `AISettings.tsx` (603 LOC) | ❌ | api-key form, 4 model slots, refresh model list | P1 | L |
| (extras) Director / STT / Ratings & BSR / Rank Tracking / Wiki / Users / Audit / Integrations | various | ❌ | out of personal-use scope (see §7) | P3 | — |

### 1.7 Cross-cutting

| Sub-feature | Original | Desktop now | Gap | Prio | Effort |
|---|---|---|---|---|---|
| WeeksFilter context (1/2/4/8/12) | `WeeksFilterContext` + `WeeksFilter.tsx` | ❌ | new context + segmented control in topbar | P0 | S |
| PeriodPicker with month grid + Wed-cycle preset | `common/PeriodPicker/` (Calendar + ComparisonPicker) | only `RangePicker` quick-presets + custom | add `Calendar` component for date-grid + presets (week/month/wed_cycle) | P1 | M |
| Excel/PDF export library | `xlsx` + `jspdf` | only CSV | install + port export helpers | P2 | M |
| Virtualized tables (>1k rows) | (uses native pagination) | ❌ | install `@tanstack/react-virtual` for KeywordsPage + future SearchTerms full-list | P2 | M |
| Multipart upload IPC (covers, royalty xlsx, avatar) | renderer multipart via axios | ❌ — `api-client.ts` only supports JSON | new `media:upload` IPC + main-side multipart `net.fetch` | P1 | M |
| SSE handling (AI Advisor, full-sync stream) | EventSource w/ short-lived token via `/sse-token` | ❌ | new `sseClient.ts` + main IPC channel for token issuance | P2 | L |

---

## 2. Phased Roadmap

> Phase numbering continues from `parity-plan.md` (0–10 + R closed). New phases: A → H.
> Each "h" = focused engineering hour; "d" = 1 working day = 6h. Estimates assume one engineer with the codebase loaded.

### Phase A — i18n foundation **[ЗАКРЫТА 2026-05-10]**

> Финал: 17 EN namespaces, RU skeletons, ICU plurals, ESLint Cyrillic rule на `error`, Settings language toggle (locked EN), полный регресс зелёный (84/84 tests, tsc clean, lint clean, package OK). Cyrillic warnings 615→0. 19 коммитов в `origin/main`.
> Подробная история — `parity-plan.md` секция Phase A.

### Phase A — i18n foundation (исходный спек) **[P0, ~5 days, blocker for all later phases]**

> Goal: drop all RU UI strings, add `react-i18next` + ICU plurals, lock `lng: 'en'`. After this, every new line added by phases B–H ships in EN immediately.

**Dependencies:** §0 (commits) done.

#### A.1 Setup (4–6h)

- `npm i i18next react-i18next i18next-icu` (and `@types/...` if needed).
- Create `src/renderer/i18n/index.ts` — calls `i18next.use(initReactI18next).use(ICU).init({ lng: 'en', fallbackLng: 'en', resources, interpolation: { escapeValue: false } })`. Resources are inlined (no async backend) for personal-use simplicity.
- Wire `<I18nextProvider i18n={i18n}>` at the top of `src/renderer/App.tsx` (above `ThemeProvider`).
- Create `src/renderer/i18n/types.d.ts` — `declare module 'i18next' { interface CustomTypeOptions { defaultNS: 'common'; resources: { common: typeof import('./resources/en/common.json'); ... } } }` for typed `t()` keys.
- Create `src/renderer/i18n/resources/en/common.json` with 30–50 base entries (CTAs, generic errors, time labels).
- Mock in `src/test/setup.ts` — `vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }) }))`. **Tests will assert keys, not translated text.**
- Add ESLint rule (§0.3) to block raw Cyrillic in `src/renderer/**/*.tsx`.

**DoD:** `npm test` green with mock; `i18n.changeLanguage('en')` no-op smoke runs in dev; `npm run package` builds.

#### A.2 Page-by-page string migration (16–24h)

Order = user-frequency (most-visited first):

1. `MainLayout.tsx` + `NavContext.tsx` + `CommandPalette.tsx` → `nav.json` (~30 strings, dedupe across 3 files).
2. `pages/DashboardPage.tsx` + `components/dashboard/*` → `dashboard.json` (~50 strings).
3. `pages/CampaignsPage.tsx` + `pages/CampaignDetailsPage.tsx` + `EditCampaignModal.tsx` + `AddCampaignModal.tsx` + `AddAdGroupModal.tsx` + `AddTargetModal.tsx` → `campaigns.json` (~120 strings — biggest chunk).
4. `pages/BooksPage.tsx` → `books.json` (~30 strings).
5. `pages/SearchTermsPage.tsx` → `searchTerms.json` (~25 strings).
6. `pages/KeywordsPage.tsx` → `keywords.json` (~17 strings).
7. `pages/NegativesPage.tsx` + `NegativeListsTab.tsx` → `negatives.json` (~62 strings).
8. `pages/ReportsPage.tsx` + `components/reports/BreakdownTab.tsx` → `reports.json` (~21 strings).
9. `pages/ComparisonPage.tsx` → `comparison.json` (~14 strings).
10. `pages/AlertsPage.tsx` + `dashboard/AlertsWidget.tsx` + `NotificationsBell.tsx` → `alerts.json` (~41 strings).
11. `pages/AutomationPage.tsx` + `pages/ActionCenterPage.tsx` → `automation.json` + `operations.json` (~35).
12. `pages/AccountingPage.tsx` → `accounting.json` (~19 strings).
13. `pages/RoyaltiesPage.tsx` → `royalties.json` (~28 strings).
14. `pages/SettingsPage.tsx` + `components/UpdateChecker.tsx` + `components/UserMenu.tsx` + `components/AmazonAdsSection.tsx` → `settings.json` (~63 strings).
15. `LoginScreen.tsx` → `auth.json` (~13 strings).
16. `lib/dateRange.ts` → ICU plural keys in `common.json` (`{count, plural, one {# day} other {# days}}`).
17. `components/ui/Pagination.tsx` (`'Стр.'`, `'из'`) → `common.json`.
18. `ErrorBoundary.tsx` → `common.json`.
19. `CalendarBell.tsx` → `nav.json` extension or `dashboard.json`.
20. `AmazonAdsSection.tsx` → `settings.json`.

#### A.3 Plurals + interpolations (2–3h)

- `lib/dateRange.ts` — ICU `t('common.daysCount', { count: n })`.
- `ReportsPage.tsx` "X of Y" → `t('common.xOfY', { x, y })`.
- `Pagination.tsx` "Стр. X из Y" → `t('common.pagination', { current, total })`.
- Any "найдено N" / "выбрано N" patterns → ICU plural.

#### A.4 Tests migration (4–6h)

- Replace literal RU `getByText('Обзор')` with either `getByText('nav.dashboard')` (since mock returns key) or `getByTestId('nav-dashboard')`. **Recommend `data-testid`** — decouples tests from copy.
- Add `data-testid` attribute pattern: `data-testid="<feature>-<element>-<role>"` (e.g. `dashboard-kpi-profit`, `campaigns-row-{id}`, `negatives-tab-lists`).
- Update ~10 test files in `src/renderer/**/__tests__/`.

#### A.5 Settings language toggle (1h)

- Add `<select>` in SettingsPage "Application" card with options `English`, `Русский (coming soon, disabled)`. Currently locked to EN — stub for later RU revival.

#### A.6 Manual smoke + commit (3–4h)

- `npm start`, click through every page, fix awkward translations (e.g. "Не удалось" wraps don't match EN tone — prefer "Failed to load X" not "Could not get X").
- `npm test` + `npx tsc --noEmit` + `npm run package` green.
- Commit: `phase-A: full RU→EN i18n migration with react-i18next + ICU`.

**DoD Phase A:** zero Cyrillic in `src/renderer/**/*.tsx` (lint rule passes). All 84+ tests green. App fully EN. RU resource folder skeleton exists but empty.

---

### Phase B — Settings tabs **[P0, ~6 days]**

> Goal: implement the 9-tab settings system. Without this, the user has no UI to configure books, profiles, credentials, AI key. **Highest user-blocking value after i18n.**

**Dependencies:** Phase A (so all new strings are EN).

#### B.0 Tabs skeleton (0.5d)

- New file `src/renderer/components/settings/SettingsTabs.tsx` — horizontal scroll-aware tab strip with aria-tablist, role=tab, hash-route persistence (`#settings/books`, `#settings/profiles`).
- Refactor `SettingsPage.tsx` — render `SettingsTabs` + tab content by enum `SettingsTabId = 'books' | 'credentials' | 'profiles' | 'token' | 'fullSync' | 'searchTerm' | 'stream' | 'royalties' | 'ai' | 'app'` (10 tabs incl. "Application" with version/sign-out).
- Tabs default to "Application" if hash empty.
- Persist last-active tab in `localStorage['settings:lastTab']`.

#### B.1 Books tab (1.5d, P1)

- New folder `src/renderer/components/settings/books/`.
  - `BookListPanel.tsx` — list + search + active/archived toggle. Reuses `BooksContext` + `bookApi.getArchived`.
  - `BookDetailsPanel.tsx` — title, author, account, BE-ACOS, max-CPC, royalty %, organic baseline. ASIN list (per-row Amazon link, edit, delete). Cover preview.
  - 4 modals (under `components/modals/`): `EditBookModal`, `DeleteBookModal`, `AddAsinModal`, `UploadCoverModal` (uses new `media:upload` IPC — see Phase B.6 → multipart support).
- Endpoints (in `src/renderer/api/books.ts` — extend existing): `bookApi.update(id, data)`, `archive`, `unarchive`, `deleteAsin`, `updateAsin`, `uploadCover (multipart)`.

#### B.2 Credentials tab (0.5d, P1)

- `src/renderer/components/settings/CredentialsTab.tsx` — OAuth-first form (current `AmazonAdsSection` extracted+expanded) + Manual mode (paste refresh_token + region).
- Endpoints already wired in `amazonAds.ts`; add `saveSettings(client_id, client_secret, refresh_token, region)`, `testConnection`.
- After save → switch to Profiles tab.

#### B.3 Profiles tab (0.5d, P1)

- `src/renderer/components/settings/ProfilesTab.tsx` — table from `amazonAds.getProfiles`, sync button. Tab title shows count: `t('settings.profilesWithCount', { count })`.

#### B.4 Token tab (0.5d, P1)

- `src/renderer/components/settings/TokenTab.tsx` — `getTokenInfo`, masked display, refresh-access-token button, copy-to-clipboard via `navigator.clipboard`.

#### B.5 Full Sync tab (1d, P0)

- `src/renderer/components/settings/fullSync/`:
  - `index.tsx` — root layout.
  - `AccountSelector.tsx` — group profiles by `account_name`.
  - `CountrySelector.tsx` — multi-chip country picker.
  - `SyncOptionsGrid.tsx` — checkboxes (campaigns/ad_groups/keywords/product_targets/negatives/SB).
  - `SyncQueue.tsx` — live queue table.
  - `usePersistentSyncQueue` — persist in `localStorage` with poll loop (`getSyncStatus(jobId)` every 3s).
- Endpoints: `POST /api/amazon-ads/sync/start`, `GET /api/amazon-ads/sync/status/<id>`, `GET /api/amazon-ads/sync/active`, `POST /api/amazon-ads/sync/cancel/<id>`.
- New IPC: none — uses generic `api:request`.

#### B.6 Multipart upload IPC (0.5d, supports B.1 cover upload + B.8 royalties xlsx + future avatar)

- New IPC channel `MediaUpload` in `src/shared/ipc.ts`: `{ path: '/api/...', files: [{ field: string, name: string, base64: string, contentType: string }], formFields?: Record<string,string> }`.
- Renderer: read file via `<input type=file>` + `FileReader.readAsDataURL` → base64 → IPC.
- Main handler in `src/main/ipc-handlers.ts`: decode base64 → Buffer → build `FormData` (use `formdata-node` if needed, or hand-roll multipart) → `electron.net.fetch` with the resulting body. Path validation reused from `api-client.ts`.
- Helper `src/renderer/api/upload.ts` — `uploadFile(path, file: File, fields?)`.

#### B.7 Search Term Reports tab (1d, P1)

- `src/renderer/components/settings/searchTerm/`:
  - `index.tsx` — manual + scheduled reports.
  - `CoverageGrid.tsx` — heatmap day × profile.
  - `ReportQueue.tsx` — status table with poll.
  - `ScheduleProfilesPanel.tsx` — checkboxes per profile.
  - `AnalysisStatsPanel.tsx` — total terms, unanalyzed, on-demand run.
- Embed `<NegativeLists />` reusing existing `NegativeListsTab.tsx` (P0 already shipped).

#### B.8 Royalties tab (0.5d, P1)

- Move `RoyaltiesPage.tsx` body into `src/renderer/components/settings/RoyaltiesTab.tsx`. Keep the standalone sidebar item too (dual-mount) but mark sidebar as informational.
- Add real `xlsx` parser (currently TODO at `src/main/local-db/royalty.ts:111`). Install `xlsx` library. Parse in main (avoid renderer crash on big files), return parsed rows.
- Cloud / Local toggle preserved.

#### B.9 AI (Claude) tab (1d, P1)

- `src/renderer/components/settings/AITab.tsx`:
  - Anthropic key form (POST `/api/settings/anthropic`, mask after save).
  - 4 model slots (main / advisor / search-terms / director) — dropdown of `GET /api/settings/models`.
  - "Refresh model list" → POST `/api/settings/models/refresh`.
  - Test key button → `POST /api/settings/anthropic/test`.
- Endpoints in new `src/renderer/api/aiSettings.ts`.

#### B.10 Stream tab (0.5d, P2)

- Read-only viewer: stats summary, countdown, exec history table, audit panel.
- Endpoints: `GET /api/marketing-stream/sync/status`, `/stats`, `/history`, `/audit`.

**DoD Phase B:** All 10 tabs render and switch via hash; Books CRUD works end-to-end; Profiles count in tab title is live; Full Sync can fire and poll; tests for tab navigation + 1 happy-path per tab. Total ~30 new tests.

---

### Phase C — CampaignDetails parity **[P0, ~4 days]**

> Goal: close the visible gap from the user screenshot — multi-period table, weeks timeline, hourly dynamics, AI Advisor stub.

**Dependencies:** Phase A.

#### C.1 WeeksFilter context + segmented control (0.5d)

- New `src/renderer/contexts/WeeksFilterContext.tsx` — `weeksCount: 1|2|4|8|12`, default 4.
- New `src/renderer/components/ui/WeeksSegment.tsx` — 5-button segmented bar.
- Mount `<WeeksFilterProvider>` in `App.tsx` above `NavContext`. Mount `<WeeksSegment>` in `CampaignDetailsPage` header (sticky).

#### C.2 MultiPeriodMetricsTable (1d)

- New `src/renderer/components/campaigns/MultiPeriodMetricsTable.tsx`. Columns: 60d, 30d, W1, W2, ... Wn (according to `weeksCount`). Rows: AD Sales, Spend, Orders, Impressions, Clicks, ACOS, CTR, CPC, CVR, ROAS.
- Parallel fetch via `Promise.all`:
  - 60d: `GET /api/campaigns/<id>/metrics?from=-60d&to=today`
  - 30d: same with `-30d`
  - Per week: ISO Mon→Sun, `getFullWeeksDateRange(weeksCount)` ported from original `utils/index.ts`.
- Sticky first column; horizontal scroll for many weeks.
- Color cells: ACOS via `getAcosColor` (port from `utils/index.ts`).

#### C.3 HourlyDynamicsChart (1d)

- New `src/renderer/components/campaigns/HourlyDynamicsChart.tsx`. Recharts `ComposedChart` with Bar (Impressions, scaled to right Y) + 2 Lines (Clicks, Spend on left Y). `Brush` for zoom.
- Date range picker (small) + metric switcher (segmented: All / Imps / Clicks / Spend).
- Endpoint: `GET /api/metrics/campaigns/<amazon_campaign_id>/hourly?from&to&attribution`.
- Empty state if no data ("No hourly data for this period").

#### C.4 Header inline edits (0.5d)

- Pause / Resume button — `PUT /api/amazon-ads/campaigns/<id>/state`. Optimistic update with revert on error.
- Budget editable cell next to badge — reuses `EditableNumber` calling `PUT /api/amazon-ads/campaigns/<id>/budget`.
- Bidding strategy inline select — `PUT /api/amazon-ads/campaigns/<id>/bidding-strategy`.

#### C.5 Targets tab status toggle + bulk bar (0.5d)

- Add status toggle column (paused/enabled) — `PUT /api/amazon-ads/targets/<id>/state`.
- Add `<input type=checkbox>` column + sticky bulk bar with: change-bid (×%), pause selected, enable selected. Calls `POST /api/amazon-ads/targets/bulk-update`.

#### C.6 Search Terms tab embed (0.5d)

- Replace placeholder with mini `SearchTermsList` reading `GET /api/campaigns/<id>/search-terms?from&to`. Reuses bulk-action pattern from Phase E.

#### C.7 History tab (0.25d)

- Replace placeholder with timeline of `GET /api/campaigns/<id>/all-changes`. Render per-week groups with author + timestamp.

#### C.8 AI Advisor stub (0.25d, P2)

- Add right-edge button with sparkle icon + "AI Advisor (preview)" label.
- Click opens slide-in panel showing: campaign summary + "Full chat coming in next release" + link to backend status. **Do NOT implement SSE chat now** — see "Risks" §4.

**DoD Phase C:** clicking any campaign → Details page shows 1W/2W/4W/8W/12W toggle, multi-period table, hourly chart, working pause/budget header. Bulk targets bar works. Smoke tests for each new component (~6 tests).

---

### Phase D — Dashboard parity **[P1, ~1 day]**

> Goal: close minor dashboard gaps from screenshot.

**Dependencies:** Phase A.

#### D.1 Quick segmented period (0.25d)

- `src/renderer/components/dashboard/QuickPeriodSegment.tsx` — buttons "Last 30", "This month", "Last month", "Custom".
- Wire to `RangePicker` in `DashboardPage`. `useSessionState<QuickPeriod>('dashboard:quickPeriod', 'thisMonth')` (port hook).

#### D.2 Organic vs Paid block (0.5d)

- New `src/renderer/components/dashboard/OrganicPaidBlock.tsx`. Two-row block: organic vs paid orders (count + %), per-marketplace breakdown.
- Endpoint: `GET /api/metrics/summary/organic-total?from&to&attribution`.
- Graceful 401/403/404 → hide block.

#### D.3 KPI tile minor fixes (0.25d)

- Add Royalty + Profit tiles as 5th–6th row (2 lines × 4 KPIs total = 8). Per original `KpiCards.tsx`.

**DoD Phase D:** dashboard layout matches screenshot — 8 KPIs, hero, top-performers, organic-paid, alerts, funnel, marketplace, books table.

---

### Phase E — Reports MVP expansion **[P1, ~3 days]**

> Goal: add Daily/Weekly/Hourly/Marketplace/Account/Book/Campaign/Keyword/Matrix tabs (the 9 missing). Drop Excel/PDF export to Phase H polish.

**Dependencies:** Phase A.

#### E.1 Generic dimension tab pattern (0.5d)

- Refactor `BreakdownTab.tsx` to support: optional drill-down callback (clicking a row → switch to next tab + add filter).
- Move `Daily/Weekly` "Динамика" tab into a dedicated `TimeSeriesTab.tsx` (with date axis chart on top).

#### E.2 Tabs (each 0.5d, total 4d but parallelizable to 3d if grouped):

- Daily / Weekly / Hourly — `TimeSeriesTab` with granularity prop (`daily`/`weekly`/`hourly`). Endpoints: `summary/{daily,weekly,hourly}`.
- Marketplace — drill-down → Book.
- Account — `summary/by-account`.
- Book — drill-down → Campaign.
- Campaign — `summary/by-campaign`.
- Keyword — `summary/by-keyword` (analytic view only — vs editable KeywordsPage).
- Matrix — books × marketplaces table cells with mini-bars.

#### E.3 Filters panel (0.5d)

- New `src/renderer/components/reports/ReportsFiltersPanel.tsx` — accounts × marketplaces × books multiselect. Persist in `useSessionState`.
- Wire to all tab fetchers.

**DoD Phase E:** Reports has 11 tabs (Time series + Marketplace + Account + Book + Campaign + Keyword + Matrix + 5 existing breakdowns). Drill-down works marketplace → book → campaign.

---

### Phase F — Comparisons enhancement **[P2, ~2 days]**

> Goal: dimension switch + grouped layout matching original.

**Dependencies:** Phase E.

#### F.1 Dimension switcher (0.5d)

- Add `reportType` selector with 7 dimensions: marketplace / account / book / campaign / keyword / placement / match-type. Bind to existing 2-period fetch.

#### F.2 Grouped table layout (1d)

- For dimension `book`/`campaign`/`keyword` — items as rows, periods × metrics as columns (current).
- For dimension `marketplace`/`account`/`placement`/`match-type` — flip orientation (metrics as rows, items as columns).
- Color delta cells: positive=green, negative=red; for ACOS/CPC/Cost: inverted.

#### F.3 Click → CampaignDetails (0.25d)

- For dimensions `campaign` + `keyword` — clicking item opens CampaignDetails (reuses NavContext).

#### F.4 Excel/PDF export (0.25d, P3 — defer to Phase H if time-constrained)

- Reuse Phase H §H.4 once shipped.

**DoD Phase F:** Comparison page supports 7 dimensions; orientation flips correctly; deltas color-coded.

---

### Phase G — Books deep parity **[P1, ~3 days]**

> Goal: drill-down books → marketplaces → campaigns; BSR sparkline; book modals.

**Dependencies:** Phase A, Phase B.6 (multipart upload IPC).

#### G.1 3-level drill (1d)

- Extend `NavContext.tsx` with `BooksDrillLevel = 'list' | 'marketplaces' | 'campaigns'` + `selectedBookId`, `selectedMarketplace`.
- New components:
  - `BooksMarketplacesPanel.tsx` — pills per MP, click drills to campaigns; per-pill spend/sales/ACOS.
  - `BooksCampaignsPanel.tsx` — campaigns for `(book, marketplace)` with weekly metrics.
- Pill breadcrumbs at top: "Books / {Title} / {MP} / Campaigns" — click any segment to jump back.
- URL state: `#books?level=marketplaces&book=42&mp=USA` for browser back-button (uses `window.location.hash`).

#### G.2 BSR sparkline + modal (0.5d)

- Add `📈 #1234` chip cell in books table.
- Click → `<Modal>` with `recharts/LineChart` over last 168h.
- Endpoint: `GET /api/book/<id>/bsr-history?marketplace=&hours=168`.

#### G.3 Ratings widget (0.25d)

- Add 5-star + count column to books table.
- Endpoint: `GET /api/ratings/all-books`.

#### G.4 Book modals (1d)

- `EditBookModal`, `DeleteBookModal`, `AddAsinModal`, `UploadCoverModal`, `AddChangeModal`. (Already enumerated in Phase B.1 — share components between BooksPage and Settings.Books tab.)

#### G.5 KDP metrics inline (0.25d)

- New columns per row: royalty/page, BE-ACOS, max CPC.
- Endpoint: `POST /api/books/<id>/kdp-metrics` with `{ list_price_usd, marketplace }`.

**DoD Phase G:** clicking a book opens marketplaces panel; clicking MP opens campaigns; BSR chip → modal renders; ratings + KDP visible.

---

### Phase H — Polish + tests **[P2, ~2 days]**

> Goal: visual polish, missing tests, accessibility, error handling consistency.

**Dependencies:** all earlier phases.

#### H.1 Loading skeletons (0.5d)

- Replace 30+ `LoadingRow` usages with skeleton blocks matching final layout (table rows, KPI cards, charts).

#### H.2 Empty states (0.25d)

- Audit every list/table for `<EmptyState>` with action ("No campaigns yet — Create your first" → opens AddCampaignModal).

#### H.3 Sticky table headers (0.25d)

- CSS class `sticky top-0` on every `<th>` row in tables (Books, Campaigns, Keywords, MultiPeriodMetricsTable, Reports tabs).

#### H.4 Excel + PDF export (0.5d, P2)

- Install `xlsx` and `jspdf`. Port `convertToExcelData` + `createPDFReport` from `analytics/export/`. Add to Reports + Comparison toolbars.

#### H.5 Accessibility pass (0.25d)

- aria-labels on icon buttons, role="tablist" on all tab strips (already done in Phase 7), focus trap in modals.

#### H.6 Error consistency + retry (0.25d)

- Single `useApiQuery<T>` hook (replaces 13× duplicate `useEffect+fetch+catch+toast` pattern, mentioned in `parity-plan.md` Phase R notes). Returns `{ data, error, loading, refetch }`. Drop into all pages.

#### H.7 Final smoke + commit

- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run package`. Visual click-through every page.

**DoD Phase H:** test count > 130, all lint+tsc clean, no UI regressions, every page has loading + empty + error states.

---

## 3. API Contract — endpoints by phase

> All paths relative to `https://ads-tracker-production.up.railway.app`. Auth = Bearer JWT (24h, no refresh — see §4 risks).

### Phase A (i18n) — no new endpoints

### Phase B (Settings tabs)

| Endpoint | Method | Phase tab | Desktop landing |
|---|---|---|---|
| `/api/books/<id>` | GET | Books | extend `api/books.ts` |
| `/api/books/<id>` | PUT | Books | new `bookApi.update` |
| `/api/books/<id>/archive` | POST | Books | `bookApi.archive` |
| `/api/books/<id>/unarchive` | POST | Books | `bookApi.unarchive` |
| `/api/books/<id>/cover` | POST multipart | Books | new `MediaUpload` IPC + `uploadFile` helper |
| `/api/books/<id>/asins` (POST/PUT/DELETE) | various | Books | new `asinApi` in `api/books.ts` |
| `/api/books/<id>/kdp-metrics` | POST | Books | new `bookApi.kdpMetrics` |
| `/api/amazon-ads/settings` | GET/POST | Credentials | `api/amazonAds.ts` extend |
| `/api/amazon-ads/test-connection` | POST | Credentials | `amazonAds.testConnection` |
| `/api/amazon-ads/profiles` | GET | Profiles | already wired |
| `/api/amazon-ads/sync/profiles` | POST | Profiles | already wired |
| `/api/amazon-ads/token-info` | GET | Token | already wired |
| `/api/amazon-ads/refresh-token` | POST | Token | already wired |
| `/api/amazon-ads/sync/start` | POST | Full Sync | new `syncApi.start` |
| `/api/amazon-ads/sync/status/<id>` | GET | Full Sync | `syncApi.status` |
| `/api/amazon-ads/sync/active` | GET | Full Sync | `syncApi.active` |
| `/api/amazon-ads/sync/cancel/<id>` | POST | Full Sync | `syncApi.cancel` |
| `/api/amazon-ads/reports/queue/...` (~6 endpoints) | various | Search Term | new `reportsApi` |
| `/api/amazon-ads/reports/coverage` | GET | Search Term | `reportsApi.coverage` |
| `/api/amazon-ads/reports/schedule/{status,history,profiles}` | GET | Search Term | `reportsApi.schedule*` |
| `/api/marketing-stream/sync/{status,stats,history,audit}` | GET | Stream | new `marketingStreamApi` |
| `/api/royalties/{upload,uploads,summary,matrix,...}` | various | Royalties | already wired in `api/royalties.ts` + extend |
| `/api/settings/anthropic` (GET/POST/DELETE) | various | AI | new `aiSettingsApi` |
| `/api/settings/anthropic/test` | POST | AI | `aiSettingsApi.test` |
| `/api/settings/models` | GET | AI | `aiSettingsApi.models` |
| `/api/settings/models/refresh` | POST | AI | `aiSettingsApi.refreshModels` |
| `/api/settings/ai-models` (GET/POST) | various | AI | `aiSettingsApi.getSelected/save` |

### Phase C (CampaignDetails)

| Endpoint | Method | Use |
|---|---|---|
| `/api/metrics/campaigns/<amzn>/hourly` | GET | HourlyDynamicsChart |
| `/api/metrics/campaigns/<amzn>/weekly` | GET | MultiPeriodMetricsTable per-week |
| `/api/campaigns/<id>/metrics?from&to&attribution` | GET | MultiPeriodMetricsTable 60d/30d |
| `/api/amazon-ads/campaigns/<id>/state` | PUT | Pause/Resume button |
| `/api/amazon-ads/campaigns/<id>/budget` | PUT | inline Budget edit |
| `/api/amazon-ads/campaigns/<id>/bidding-strategy` | PUT | inline strategy select |
| `/api/amazon-ads/campaigns/<id>/placement-modifiers` | PUT | placement editor (deferred to P2) |
| `/api/amazon-ads/targets/<id>/state` | PUT | status toggle |
| `/api/amazon-ads/targets/bulk-update` | POST | bulk bar |
| `/api/campaigns/<id>/search-terms` | GET | Search Terms tab embed |
| `/api/campaigns/<id>/all-changes` | GET | History tab |

### Phase D (Dashboard)

| Endpoint | Method | Use |
|---|---|---|
| `/api/metrics/summary/organic-total` | GET | OrganicPaidBlock |

### Phase E (Reports)

| Endpoint | Method | Tab |
|---|---|---|
| `/api/metrics/summary/daily` | GET | TimeSeries (daily) — already wired |
| `/api/metrics/summary/weekly` | GET | TimeSeries (weekly) — already wired |
| `/api/metrics/summary/hourly` | GET | TimeSeries (hourly) |
| `/api/metrics/summary/by-marketplace` | GET | Marketplace — already wired |
| `/api/metrics/summary/by-account` | GET | Account |
| `/api/metrics/summary/by-book` | GET | Book — already wired |
| `/api/metrics/summary/by-campaign` | GET | Campaign |
| `/api/metrics/summary/by-keyword` | GET | Keyword — already wired |

### Phase F (Comparison) — same endpoints as Reports, called twice

### Phase G (Books deep)

| Endpoint | Method | Use |
|---|---|---|
| `/api/book/<id>/bsr-history?marketplace=&hours=168` | GET | BSR modal |
| `/api/ratings/all-books` | GET | ratings column |
| `/api/metrics/summary/by-book/trends` | GET | per-week mini-cells |

### Phase H — no new endpoints

### Auth notes for every endpoint

- All require `Authorization: Bearer <token>`. Token from `safeStorage` via main.
- 401 from any endpoint → `AuthContext` flips to `unauthenticated` → LoginScreen. **Known limitation**: no refresh — user must re-paste/re-login.
- 403 (permission) → toast "You don't have permission for this action" + revert local optimistic state.

### What is NOT wired (out of phases A–H)

- SSE: `/api/ai-advisor/message` (streaming), `/api/amazon-ads/reports/stream`, `/api/search-terms/analyze-stream`. Requires `/sse-token` round-trip + EventSource handling. **Deferred** — see §4.
- Multipart endpoints other than book cover + royalty xlsx (e.g. profile avatar) — out of personal-use scope.

---

## 4. Risks & known limitations

| Risk | Impact | Mitigation |
|---|---|---|
| **No refresh token** (JWT 24h, no `/api/auth/refresh`) | After 24h user is logged out mid-session — UX papercut | (a) `AuthContext.verify` polling every 6h to detect expiry early + show banner "Your session expires in {n} hours — re-login soon"; (b) on 401, persist last route via NavContext, after re-login auto-resume. **Document as known limitation in README.** |
| **SSE requires short-lived token via `/api/amazon-ads/sse-token`** | Blocks AI Advisor chat, real-time sync progress, search-terms analyze stream | (a) **Phase C ships AI Advisor as stub only** ("preview, full chat soon"); (b) Full Sync polls `/sync/status/<id>` every 3s instead of SSE — works fine; (c) Add SSE later in a dedicated phase post-public-release. |
| **Multipart endpoints via `net.fetch`** (covers, royalty xlsx) | `electron.net.fetch` supports `Body: FormData` since Electron 30+; we're on 41.3 — works. But base64 round-trip via IPC is memory-hungry for large royalty xlsx (10–50 MB) | Stream large files via temp-file path: renderer passes `filePath` → main reads from disk (not base64) → builds multipart. New IPC variant `media:uploadPath`. Implement in Phase B.6 if files >5MB observed. |
| **Working tree dirty (~36M + ~70??)** | Cannot ship anything until §0 commits land | **§0 is a hard prerequisite**. Allocate 0.5d before Phase A. |
| **1007 RU lines, easy to regress** | New phases B–H will accidentally add RU strings | ESLint rule §0.3 + `npm run lint` in CI gate. |
| **AI Advisor SSE in Phase C is XL effort** | If we stub-only, the screenshot's right-edge button looks "fake" | OK for personal-use track; mark as "preview" in tooltip. Full impl post-public-release. |
| **Public release deferred** | No auto-update / signing / staged rollouts | Phase 10 scaffolding already in place — no action now. Don't waste hours on EV cert / notarization until public-release decision. |
| **Backend changes need cross-repo coordination** | Any new endpoint blocks until merged in `Juli374/ads-tracker` | All phases A–H use existing endpoints (verified against `02-original-backend-api.md`). Zero backend changes required. |
| **`xlsx` parsing in renderer can crash on 50k-row files** | Royalty import freeze | Always parse in main process via `xlsx` lib (Phase B.8). |
| **OAuth callback URL** (`ads-tracker-desktop://callback`) | macOS auto-registers via `app.setAsDefaultProtocolClient` in dev; Windows needs installer step | Test on Windows VM before public release; for personal-use macOS-only is fine. |
| **Tests query by RU strings** | Phase A.4 must migrate to `data-testid` BEFORE per-page string change in A.2 | Order: (1) add `data-testid` to JSX, (2) update test to query by testid, (3) replace RU literal with `t()` key. Per file. |

---

## 5. Effort summary

| Phase | Days | Hours | Blockers |
|---|---:|---:|---|
| §0 Pre-flight (commits + token + lint) | 0.5 | 3 | none |
| Phase A — i18n migration | 5 | 30 | §0 |
| Phase B — Settings 9 tabs | 6 | 36 | A |
| Phase C — CampaignDetails parity | 4 | 24 | A (B.6 for AI tab parallel OK) |
| Phase D — Dashboard polish | 1 | 6 | A |
| Phase E — Reports MVP | 3 | 18 | A |
| Phase F — Comparisons | 2 | 12 | E |
| Phase G — Books deep | 3 | 18 | A, B.6 |
| Phase H — Polish + tests | 2 | 12 | all |
| **Total** | **26.5** | **159** | |

> Realistic with breaks / context-switching: **3–5 calendar weeks** for one engineer. Aggressive: **~3 weeks** if focus is uninterrupted.

If forced to ship a "minimum viable parity" subset:
- §0 + A + B.0/B.1/B.2/B.3/B.4/B.5/B.9 + C.1/C.2/C.4 + D.1 = **~14 days** = covers user's screenshots' visible parity (i18n + Settings tabs + multi-period table + weeks segment + pause/budget header + organic block).

---

## 6. Quick wins (1–3h each, ship visible value fast)

> Pick from this list when momentum is needed. None block phases.

1. **Sticky `<thead>` on every table** (~1h) — pure CSS class `sticky top-0 bg-white z-10 dark:bg-zinc-900`. Already done partially (commit `7b10be0`). Audit and finish Books / Reports / Keywords / Targets.

2. **Profile (35) badge in Settings tab** (~0.5h) — once Phase B.0 ships tab strip, `t('settings.profilesWithCount', { count: profiles.length })`. Already-fetched data.

3. **Pause/Resume button in CampaignsPage row** (~2h) — toggle column with optimistic update. Reuses `PUT /api/amazon-ads/campaigns/<id>/state`. Doesn't require Phase C — works on the list view.

4. **Toast on copy-to-clipboard** (~0.5h) — Settings token tab, profile id, etc. `navigator.clipboard.writeText(value).then(() => toast.success(t('common.copied')))`.

5. **AI Advisor button placeholder** (~1h) — small "✨ AI" button in CampaignDetails header that opens a 400px slide-in `<aside>` with "Coming soon" + Anthropic-key check link. Bridges screenshot perception even before SSE.

6. **Connection indicator real status** (~1h) — replace static "Online / Подключено" with a 30s heartbeat ping to `/api/auth/verify` (HEAD or simple GET). Red dot on consecutive failure.

7. **Currency-flag emoji in MP cells** (~1h) — port `MARKETPLACE_FLAGS` from original `constants/marketplaces.ts`. Adds visual polish to Books/Campaigns lists.

---

## 7. Out of scope (explicit)

> These exist in the original frontend but are **not** part of phases A–H. Document them so we don't get pulled in.

| Module | Original location | Why out |
|---|---|---|
| Chat | `components/chat/ChatBubble`, `VoiceVideoBar` | Single-user app |
| Calendar (full) | `components/calendar/` (CalendarBell already in Phase 9 minimally) | Out of personal-use core |
| Scraper | `components/scraper/ScannerPage` | Standalone tool, not parity |
| Publisher Rocket | `components/publisherRocket/PublisherRocketPage` | Separate workflow, deferred |
| Accounting (full editor) | `components/accounting/AccountingDashboard` | Read-only viewer already in Phase 9 |
| Automation rules engine | `components/pages/AutomationPage` (full) + `RulesPage.tsx` | Worker-side; UI viewer in Phase 9 |
| Action Center (full) | `components/pages/ActionCenterPage` (full) | Read-only viewer already in Phase 9 |
| Alerts page (full worker monitoring) | `components/pages/AlertsPage` (full) | Read-only viewer already in Phase 9 |
| Admin | `components/pages/AdminPage` | Single-user = single-admin |
| AI Management | `components/pages/AIManagementPage` | Worker-side |
| Keywords discovery | `components/pages/KeywordsPage` discovery panels | Workflow-heavy, defer |
| Operations Kanban with DnD | `components/pages/OperationsCenterPage` (DnD) | DnD deferred per parity-plan §9.1 |
| Changelog page | `components/pages/ChangelogPage` | Out of scope |
| Profile editing (avatar upload, password change) | `components/pages/ProfilePage` | Single-user; not blocking |
| Director / STT / Wiki / Users / Audit / Integrations Settings tabs | various | Admin-only |
| Marketing Stream worker UI | beyond stats viewer | Worker-side |
| Telegram reports | `routes/telegram_reports.py` | Notification channel |
| Auto-update / code signing / notarization | parity Phase 10.2 scaffold | Public-release track |
| SSE for AI Advisor | `services/api/aiAdvisor.ts` | Phase post-public-release |

---

## 8. Execution order recommendation

```
§0 → A → B → C → (D ‖ E ‖ G in parallel if multi-engineer; sequential if solo: D → E → F → G) → H
```

**Why this order:**
- §0 unblocks everything (clean tree).
- A first: every later phase touches UI strings; if A is later we re-translate twice.
- B before C: Settings unblocks user from configuring Books/Profiles/AI key, which is the prerequisite for using campaign details meaningfully.
- C right after B: closes the most visible gap in user screenshots (multi-period table, weeks timeline).
- D quick (1d): cheap dashboard polish, easy morale boost between large phases.
- E before F: Comparison reuses Reports endpoints/components.
- G last among feature phases: drill-down is self-contained, can ship after polish.
- H final: covers remaining tests, error consistency, exports.

---

## 9. Definition of "done" for the whole plan

- All 9 Settings tabs render and function (Books CRUD, Credentials OAuth+manual, Profiles list+sync, Token info, Full Sync queue, Search Term reports, Stream stats, Royalties, AI Claude config, Application).
- CampaignDetails matches screenshot: 1W/2W/4W/8W/12W toggle, multi-period table, hourly chart, header with Pause/Budget/strategy.
- Dashboard has 8 KPI tiles + organic-paid block.
- Reports has 11 tabs (incl. Time series, Marketplace, Account, Book, Campaign, Keyword, Matrix, 5 breakdowns).
- Comparison supports 7 dimensions.
- BooksPage drills books → marketplaces → campaigns.
- Zero RU strings in `src/renderer/**/*.tsx`. Zero new RU strings allowed by lint rule.
- `npm test` > 130 tests green.
- `npm run lint`, `npx tsc --noEmit`, `npm run package` clean on macOS arm64.
- Working tree clean, every phase a separate commit.
