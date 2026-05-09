# Original Frontend Audit (Cloudscape) — Core Scope

> Audit date: 2026-05-09. Source: `/Users/yuliiparfonov/ads-tracker/frontend/src/`.
> Goal: catalog every core feature so it can be re-implemented in Electron desktop with Tailwind + lucide. We do not comment on Cloudscape styling — only structure, data, and UX.

All paths in this document are absolute, rooted at the original repo `/Users/yuliiparfonov/ads-tracker/frontend/src/`.

---

## 0. Top-level entry & shell

### Entry & routing
- `App.tsx` — providers stack: `ThemeProvider → AuthProvider → AppProvider → SocketProvider → WebRTCProvider → ToastProvider → WeeksFilterProvider → FollowSyncProvider`. Public URL routing handled in plain JS via `window.location.pathname` (no React Router): `/privacy`, `/terms`, `/callback` → public pages; everything else → `CloudscapeLayout`.
- `index.tsx` — React 18 `createRoot` mount.
- `index.css` — Cloudscape global tweaks (clickable rows, sticky header overrides). Mostly trash for the port.
- `components/auth/LoginPage.tsx` — email + password login.
- `components/auth/OAuthCallback.tsx` — Amazon Ads OAuth code exchange page (handled in main shell now).

### Main shell (single layout for everything)
- `components/layout/CloudscapeLayout.tsx` (1570 lines) — the entire authenticated shell:
  - Header (56px) with `kdp ads` logo, `CalendarWidget` + `CalendarDropdown` dropdown, notification bell with system status + alerts count, user menu (Профиль / Выйти).
  - Hover-expanding sidebar (60→240px) with 15 main nav items + Settings at bottom. Items: dashboard, books, ai-management, search_terms, keywords, campaigns, accounting, operations, changelog, rules, asin-scraper, alerts, reports, comparison, keyword-research. Dynamic count badges (alerts, automation, search_terms inbox), system status pill (red/green) for alerts, presence avatars (others on same page).
  - Main content area is a giant `switch (currentView)` that renders one of: `OverviewTab` / `BooksPage` / `SearchTermsAnalytics` / `CampaignsPage` / `KeywordsPage` / `ReportsPage` / `ComparisonPage` / `AccountingDashboard` / `SettingsPage` / `OperationsCenterPage` / `ActionCenterPage` / `AutomationPage` / `ScannerPage` / `AlertsPage` / `AIManagementPage` / `PublisherRocketPage` / `ProfilePage` / `CampaignDetails`.
  - Floating overlays: `PPCCheatSheet`, `ChatBubble`, `VoiceVideoBar`, `CampaignNotes`, `ProjectNotes`, `AdminNotes`, `LiveCursors`.
  - Massive socket logic: leader/follower follow-state broadcast (currentView, selectedBook, selectedMarketplace, selectedCampaign, expandedWeek, weeksCount, dateRange), follow scroll (lerp + snap on big jumps), presence:page emission. **All of this is out of scope for desktop port** but it's why this file is huge.
  - Modal mounts (rendered globally because they read state from `AppContext`): see `App.tsx` — `EditBookModal`, `DeleteBookModal`, `AddCampaignModal`, `EditCampaignModal`, `AddAdGroupModal`, `AddChangeModal`, `AddAsinModal`, `UploadCoverModal`, `AddTargetModal`, `AddNegativeModal`, `WeeklyMetricsModal`.

### Navigation behavior we must replicate (desktop)
- Single-page state-machine navigation through `currentView` + `setCurrentView`.
- Drill-down state is global on `DataContext`: `selectedBook`, `selectedMarketplace`, `selectedCampaign`, `showingCampaignDetails`, `expandedWeek`. Some pages (Books) ALSO use URL params for browser back-button support.
- Cross-page filter `weeksCount` (1 / 2 / 4 / 8 / 12) lives in `WeeksFilterContext` and drives the date range used by Books, Campaigns, CampaignDetails.

---

## 1. Dashboard ("Обзор эффективности")

### Files
- `components/analytics/overview/index.tsx` — `OverviewTab` (root). 287 lines.
- `components/analytics/overview/HeroChart.tsx` — main multi-metric daily line chart. 13 togglable metrics, max 6 active. Uses `DailySummaryMetric` series.
- `components/analytics/overview/TopPerformers.tsx` — leaderboard ("Лидеры по ROI") of top books by ROI for the period, top 5.
- `components/analytics/overview/KpiCards.tsx` — KPI tiles (current period vs prev: impressions, clicks, spend, sales, orders, ACOS, ROI, CTR, royalty, profit). Used inside dashboard cards.
- `components/analytics/overview/TrendCharts.tsx` — secondary trend charts.
- `components/analytics/overview/CloudscapeDashboard.tsx` — older alt-dashboard variant. Re-exported but unused in the live shell.
- `components/analytics/Alerts.tsx` — `AlertsWidget` shown in the right column ("Оповещения").
- `components/analytics/charts/MarketplaceDistribution.tsx` — full-width pie/bar of marketplaces. Calls `metricsApi.getSummaryByMarketplace`.
- `components/analytics/charts/FunnelChart.tsx` — конверсионная воронка (Impr → Clicks → Orders/Sales).
- `components/analytics/OrganicPaidAnalytics.tsx` — "Органика vs Реклама" full-width section (organic vs ad orders).

### Hooks/Services/Contexts
- `hooks/useSessionState.ts` — persists `quickPeriod` selection.
- `services/api/metrics.ts` — calls used here:
  - `getOverview(from, to, attribution)` → current_period + previous_period + changes.
  - `getSummaryDaily(from, to, attribution)` → `DailySummaryMetric[]` for HeroChart.
  - `getTopPerformers(from, to, attribution, limit=5)`.
  - `getSummaryByMarketplace`, `getOrganicMetrics` (via OrganicPaidAnalytics).
- `components/common/PeriodPicker` — period control (custom range + presets), used everywhere.

### UX flows
1. Open Dashboard → defaults to "Этот месяц" (`quickPeriod = thisMonth`), parallel fetch of overview + daily + top performers.
2. SegmentedControl to flip between `Last 30 days / Этот месяц / Прошлый месяц`. Selecting custom range via `PeriodPicker` flips quickPeriod to `custom`.
3. Click metrics in HeroChart legend to toggle on/off (max 6 simultaneously) — single-page state.
4. Funnel + alerts + marketplace distribution + organic-paid render below.

### Data displayed
- **Hero**: per-day metric series for selected metrics, target ACOS reference line at 25%.
- **Top Performers**: leaderboard rows with cover, title, ROI%, spend, sales.
- **AlertsWidget**: list of system warnings (high ACOS books, books with no ads, etc.) for current period.
- **Funnel**: 4-step funnel impressions/clicks/orders/sales conversion %.
- **MarketplaceDistribution**: per-marketplace spend/sales/ROAS donut + table.
- **OrganicPaid**: per-period split of organic vs paid orders + ratios.

---

## 2. Books

### Files
- `components/pages/BooksPage.tsx` (1652 lines) — **the main books experience**, drill-down state-machine: `books → marketplaces → campaigns → campaign-details`. Uses `useFollowState` for sync, URL params for browser back. Includes its own breadcrumbs (pill style), book-list table, marketplaces panel, campaigns table, BSR mini-sparkline → Modal with LineChart (1-week BSR history).
- `components/views/BookList.tsx` — older standalone book grid (currently NOT mounted from layout — `BooksPage.tsx` replaced it). Useful as reference for marketplace/account filtering pattern.
- `components/views/MarketplacePanel.tsx` (525 lines) — older marketplace panel (also not mounted from CloudscapeLayout — replaced inline in `BooksPage.tsx`). Has ASIN management, profile sync, cover upload trigger.
- `components/views/BookChecklist.tsx` (243 lines) — per-book launch checklist grouped by category (`launch`, etc.).
- `components/views/BookContentHistory.tsx` (145 lines) — per-week timeline of content changes (cover, A+ content, description, reviews, editorial, backend keywords, categories).
- `components/views/WeeklyMetricsTable.tsx` (392 lines) — transposed table per ASIN (metrics as rows, weeks as columns) — embedded inside Books → Marketplaces drill level.

### Modals (mounted globally from `App.tsx`, controlled via `ModalContext`)
- `components/modals/EditBookModal/` — title, author, account, BE-ACOS, max-CPC, royalty %, organic baseline.
- `components/modals/DeleteBookModal.tsx` — archive/delete with confirmation.
- `components/modals/AddAsinModal.tsx` — add ASIN/marketplace pair.
- `components/modals/AddChangeModal.tsx` — log content change (cover, A+, description, etc.).
- `components/modals/UploadCoverModal.tsx` — cover image upload.
- `components/modals/WeeklyMetricsModal.tsx` — fullscreen weekly drilldown for a book.

### Hooks/Services/Contexts
- `contexts/DataContext.tsx` — `selectedBook`, `selectedMarketplace`, `fetchBookDetails`, `fetchBooks`, `fetchCampaigns(asinId)`, `setSelectedBook` etc.
- `contexts/WeeksFilterContext.tsx` — `weeksCount`.
- `hooks/useFollowState.ts` — multi-user sync (out of scope for desktop).
- `hooks/useWeeklyCheckmarks.ts` — `hasWeeklyChange(campaignId)` → green tick for items with weekly history.
- `services/api/books.ts` — `bookApi.getAll`, `getArchived`, `getById`, `deleteAsin`, `updateAsin`, `getRatings`, `getAllBooksRatings`, `getBsrSummary`, `getBsrHistory(bookId, marketplace, hours)`.
- `services/api/metrics.ts` — `getSummaryByBook`, `getBookTrends` (4 separate weeks + 8w + 12w cumulative), `getBookMarketplaceMetrics(bookId, from, to, attr)`, `getBatchCampaignMetrics(campaignIds, from, to, attr)`.
- `services/api/index.ts` (`ratingsApi`) — `getAllBooksRatings`, `getBsrSummary`, `getBsrHistory`.
- `constants/marketplaces.ts` — `MARKETPLACE_FLAGS`, `getCurrencySymbol`, `getCurrencyCode`, `getAmazonProductUrl(marketplace, asin)`.
- `utils/index.ts` — color helpers (`getAcosColor`, `getSpendColor`, `getSalesColor`, `getProfitColor`, `getCtrColor`), `formatCurrency`, `formatPercent`, `formatNumber`, `getFullWeeksDateRange(weeksCount)` (Mon–Sun ISO weeks).

### UX flows
1. **Books table** (default): sorted (default by paperback_orders desc), click row → drill into book.
2. **Marketplaces level**: book header (cover + title + account) + marketplace pills. Each pill is a 3-zone control:
   - left zone — Amazon link icon (opens product on Amazon).
   - middle zone — flag + market code + spend + ACOS (click to "view" — selects for `WeeklyMetricsTable` below).
   - right arrow — drill down into Campaigns for that marketplace.
   Below: `WeeklyMetricsTable` for the selected ASIN, with `WeeksFilter`.
3. **Campaigns level**: list of campaigns for `(book, marketplace)` with toggle (active/paused), per-campaign current-week metrics (Impr, Clicks, CTR, Spend, Sales, Orders, ACOS, CVR, BE-ACOS). Click → CampaignDetails. Header has `WeeksFilter` + "Новая кампания" button.
4. **Campaign-details level**: renders `<CampaignDetails />` (see §3). Pill breadcrumbs always at the top. If user came from "AI Management audit" navigation, an extra "Вернуться к рекомендациям AI" button appears (uses `localStorage.auditNavigationContext`).
5. **BSR sparkline**: tiny `📈 #1234` chip in books table → opens Modal with `LineChart` over last 168 hours (`ratingsApi.getBsrHistory`).
6. Sortable columns: book, impressions, clicks, cost, sales, orders, org_cpa (computed), acos, be_acos, total_royalty, profit (computed: royalty − cost).
7. Trend cells (Spend / ACOS / Royalty) display 4 numbers when `weeksCount ∈ {1,2,4}` (w1/w2/w3/w4 with bold for current weeksCount), or single cumulative value for 8W/12W.

### Data displayed
- Books table aggregated across marketplaces; multi-marketplace books show USD, single-marketplace shows local currency. Star rating (5-star, halfstar) + review count from `allRatings`.
- Marketplaces level: per-mp spend/sales/orders/acos. Currency from `getCurrencySymbol(marketplace)`.
- Campaigns level: per-campaign metrics for `weeksCount` ISO weeks. Toggle uses `amazonAdsApi.updateCampaignState` (out of scope for personal-use minimal port? — keep it).

---

## 3. Campaigns

Two entry points: standalone page (top-level "Кампании" sidebar item) and drill-down inside Books.

### Top-level page
- `components/pages/CampaignsPage.tsx` (531 lines) — flat list of all campaigns across all books/marketplaces. Filters: marketplace dropdown, status (Active/Paused/All), book (dropdown of all books), date range (`PeriodPicker`). Row click → loads `CampaignDetails` inline (sets `showingCampaignDetails` on `DataContext`). Toggle column updates campaign state via Amazon API. Sortable columns: campaign_name, book_title, marketplace, impressions, clicks, cost, sales, orders, ctr, acos. Default sort: cost desc.

### Campaign Details (used both from BooksPage and CampaignsPage)
- `components/views/CampaignDetails/index.tsx` (825 lines) — main composite view.
- `components/views/CampaignDetails/CampaignSettings.tsx` — strategy block (bidding strategy, daily budget, start date) with editable fields. `bidding_strategy` change opens confirm-modal "Применить на Amazon?" before sync.
- `components/views/CampaignDetails/CampaignPlacements.tsx` (907 lines) — placement modifiers (TOS / ROS / Product Pages) with editable %, per-week placement breakdown table, modal for batch placement modifier sync to Amazon.
- `components/views/CampaignDetails/HourlyDynamicsChart.tsx` (414 lines) — Recharts `ComposedChart` of impressions/clicks/cost over time, with `DateRange` picker + segmented metric switch + Brush for zoom.
- `components/views/CampaignDetails/KeywordsTable.tsx` (1062 lines) — `KeywordsTableWithExpanded`. Per-target row with editable bid, status toggle, match type, suggested bid, current metrics. Bulk operations bar. Renders inside each Ad Group ExpandableSection. Also rendered for "ungrouped targets".
- `components/views/CampaignDetails/NegativesSection.tsx` (204 lines) — list of negative keywords / negative product targets with delete (calls `negativesApi.delete` which can archive on Amazon).
- `components/views/CampaignDetails/SearchTermsSection.tsx` (388 lines) — search terms scoped to this campaign, with the same inbox/snooze/done/negative workflow as the global Search Terms page (mini version).
- `components/views/CampaignDetails/TargetSearchTermsBadge.tsx` + `TargetSearchTermsPanel.tsx` (762 lines) — per-target search-terms drawer with detailed breakdown.
- `components/views/CampaignDetails/WeeklyHistory.tsx` (65 lines) — list of "weeks" with manual change-log entries (`WeekChanges`).
- `components/views/CampaignDetails/AIAdvisorPanel.tsx` (482 lines) + `AIAdvisorMessage.tsx` — slide-in right panel (~400px) with Claude chat for this campaign, supports tool calls (query_search_terms, query_campaign_metrics, query_all_campaigns, query_targets, query_negatives), audio recording for voice prompts.
- `components/views/CampaignWeeklyMetrics.tsx` (525 lines) — top weekly metrics table (transposed: metrics × weeks). Ad-only metrics (no royalty/profit).
- `components/views/CollapsibleWeeklyTable.tsx` (642 lines) — generic transposed weekly table (used for ad group level too).
- `components/views/InlineWeeklyTable.tsx` (629 lines) — alt inline variant.
- `components/views/WeekChanges.tsx` (120 lines) — per-week list of field changes (with author avatar, timestamp).

### Editable cell components
- `components/editable/EditableNumber.tsx` — inline editable number cell.
- `components/editable/EditableSelect.tsx` — inline editable select.
- `components/editable/EditableAdGroupBid.tsx` — Default Bid editor for ad groups (with Amazon sync).
- `components/editable/TargetRow.tsx` — full editable row for keyword target.

### Modals (campaign-related, mounted in `App.tsx`)
- `components/modals/AddCampaignModal/` — multi-step form with sections:
  - `CampaignFormFields.tsx` — name, type (SP/SB), targeting (Auto/Manual), budget, bidding strategy, placement modifiers, dates.
  - `AdGroupSection.tsx` — ad groups inside the new campaign.
  - `KeywordsSection.tsx` + `SuggestedKeywordsPanel.tsx` — manual keywords + suggested-keyword picker (from `keywordListsApi.getSuggestedKeywords`).
  - `ProductTargetsSection.tsx` — ASIN/category targets.
  - `AutoTargetBidsSection.tsx` — bids for `close-match`, `loose-match`, `substitutes`, `complements` (auto only).
  - `NegativeKeywordsSection.tsx`, `NegativeProductTargetsSection.tsx`.
  - `hooks.ts`, `types.ts`, `index.tsx`.
- `components/modals/EditCampaignModal/` — `EditFormFields.tsx` + `hooks.ts` (rename, budget, dates, modifiers).
- `components/modals/AddAdGroupModal.tsx` — name + default bid.
- `components/modals/AddTargetModal.tsx` — keyword/ASIN target with match type + bid.
- `components/modals/AddNegativeModal.tsx` — negative keyword / negative ASIN, scope (campaign / ad-group / global list).
- `components/modals/CampaignTemplateSelector.tsx` — templates (Auto, Broad, Phrase, Exact, ASIN, Category).

### Hooks/Services/Contexts
- `contexts/DataContext.tsx` — `campaigns`, `selectedCampaign`, `fetchCampaignDetails`, `navigateToCampaign(campaignId, bookId?, marketplace?)`, `updateCampaignLocally`, `updateAdGroupLocally`, `updateTargetLocally`.
- `contexts/WeeksFilterContext.tsx` — `weeksCount`, `setWeeksCount`.
- `contexts/ToastContext.tsx` — `toast.success(title, msg)`, `toast.error(...)`, `toast.warning(...)`.
- `views/CampaignDetails/hooks.ts` — `useHierarchyMetrics(amazonCampaignId, dateRange)` (campaign → ad group → target metrics tree), `useExpandedGroups`, `useAmazonMessage`, `getAdGroupMetrics`, `getTargetMetrics`.
- `views/CampaignDetails/useWeeklyData.ts` — shared weekly data fetcher (used by `CampaignWeeklyMetrics` and `CampaignPlacements`).
- `views/CampaignDetails/useHourlyData.ts` — for HourlyDynamicsChart.
- `services/api/campaigns.ts` — `campaignApi.getByCASIN(asinId)`, `getById(id)`, `updateWithHistory(id, data + changes_data)`, `adGroupApi.updateWithHistory(id, data)`.
- `services/api/targets.ts` — `targetApi.updateWithHistory(id, data + changes_data)`.
- `services/api/amazon.ts` — `amazonAdsApi`: `updateCampaignState`, `updateCampaignBudget`, `updateCampaignBiddingStrategy`, `updateCampaignPlacementModifiers`, `updateAdGroupBid`, `updateTargetBid`, `updateTargetState`, `bulkUpdateTargets`, `createFullCampaign`.
- `services/api/negatives.ts` — `negativesApi.getByCampaign`, `delete` (archives on Amazon if synced).
- `services/api/aiAdvisor.ts` — Claude chat backend, streaming.
- `services/api/metrics.ts` — `getCampaignMetrics`, `getCampaignTargetsMetrics`, `getDailyMetrics`, `getHierarchyMetrics`, `getPlacementMetrics`, `getCampaignHourly`.

### UX flows
1. CampaignsPage: filter by mp/book/status/date → sortable table → click row OR navigate from Books → loads CampaignDetails.
2. CampaignDetails header: campaign name + type/status badges + actions (Edit, Budget, Pause/Enable, AI Advisor toggle).
3. **Editable inline edits**: budget (prompt → `updateCampaignBudget`), bidding strategy (confirm modal → `updateCampaignBiddingStrategy`), placement modifiers (modal → `updateCampaignPlacementModifiers`), per-target bid (`updateTargetBid` + Amazon sync), default bid per ad group (`updateAdGroupBid`).
4. Each ad group is `ExpandableSection` showing: header row (status, name, key count, default-bid editor, summary metrics) + body (ad-group `CollapsibleWeeklyTable` + `KeywordsTableWithExpanded`).
5. AI Advisor panel: toggle → fixed right slide-in (~400px, pushes content margin-right). Audio record button supports voice → STT → message.
6. Bulk update bar in `KeywordsTable` allows selecting many targets and submitting `bulkUpdateTargets` (mass bid/state changes).
7. NegativesSection: list + add (modal) + delete (archives on Amazon if `synced`).
8. WeeklyHistory: collapse/expand each week to see manual change log + audit trail.

### Data displayed
- Campaign: name, type (SP/SB), targeting type (Auto/Manual), status, daily budget, bidding strategy, placement modifiers, start/end date, amazon_campaign_id sync flag.
- Ad groups: name, status, default_bid, target count, summary metrics.
- Targets: keyword/ASIN, match type, status, bid, suggested bid, impressions, clicks, cost, sales, orders, ACOS, CTR, CR.
- Weekly: per-week aggregate (impressions, clicks, cost, sales, orders, ACOS, ROAS, ROI, CTR, CVR, CPC, royalty, profit).

---

## 4. Reports

### Files
- `components/layout/ReportsPage.tsx` (449 lines) — root, tabbed layout with 14 report tabs, period picker, filters, Excel/PDF export buttons (`ButtonDropdown`).
- `components/analytics/ReportsFilters.tsx` — `ReportFilters` shape (`accounts`, `marketplaces`, `bookIds`) with `Multiselect`s (loads options from `metricsApi`).
- Per-tab report components (all in `components/analytics/`):
  - `MarketplaceAnalytics.tsx` ("По маркетам") — supports drill-down → book tab.
  - `AccountAnalytics.tsx` ("По аккаунтам") — drill-down → book tab.
  - `DailyAnalytics.tsx` ("По дням").
  - `WeeklyAnalytics.tsx` ("По неделям").
  - `HourlyAnalytics.tsx` ("По часам").
  - `BookAnalyticsCloudscape.tsx` ("По книгам") — drill-down → campaign tab.
  - `CampaignAnalyticsCloudscape.tsx` ("По кампаниям").
  - `KeywordAnalyticsCloudscape.tsx` ("По ключевикам").
  - `PlacementAnalyticsCloudscape.tsx` ("По плейсментам").
  - `MatchTypeAnalyticsCloudscape.tsx` ("По матч-типу").
  - `BiddingStrategyAnalytics.tsx` ("По биддингу").
  - `CampaignTypeAnalytics.tsx` ("По типу кампании").
  - `TargetingTypeAnalytics.tsx` ("По таргетингу").
  - `MatrixReportCloudscape.tsx` ("Матрица").
- Older legacy variants kept side-by-side: `BookAnalytics.tsx`, `CampaignAnalytics.tsx`, `AnalyticsPage.tsx` (out-of-shell, not currently mounted).
- Export library: `components/analytics/export/`
  - `index.tsx` — `exportDailyToExcel`, `exportBooksToExcel`, `exportCampaignsToExcel`, `exportKeywordsToExcel`, `convertToExcelData`, `downloadExcel`, `exportDailyToPDF`, `exportBooksToPDF`, `exportCampaignsToPDF`, `exportKeywordsToPDF`, `createPDFReport`. Uses `xlsx` and `jspdf` libraries.
  - `ExportButton.tsx` — single-tab convenience export button.
- Sparkline helper: `components/analytics/TrendSparkline.tsx`.
- Search-term trend modal: `components/analytics/SearchTermTrendModal.tsx` — global trend popup (also reused inside `SearchTerms`).

### Hooks/Services/Contexts
- `hooks/useFollowState.ts` — persists `reportType`, `dateRange`, `filters` per-session.
- `services/api/metrics.ts`:
  - `getSummaryByMarketplace`, `getSummaryByAccount`, `getSummaryDaily`, `getSummaryWeekly`, `getSummaryHourly`.
  - `getSummaryByBook`, `getSummaryByCampaign`, `getSummaryByKeyword`.
  - `getSummaryByPlacement`, `getSummaryByMatchType`, `getSummaryByBiddingStrategy`, `getSummaryByCampaignType`, `getSummaryByTargetingType`.
  - `getCampaignHourly`.

### UX flows
1. Pick period (defaults to start-of-month → today), pick filters (accounts × marketplaces × books).
2. Switch tab → fetch + render table.
3. Drill-down: clicking a marketplace/account/book inside a tab pushes filter onto `filters` and switches to next tab (marketplace → book → campaign).
4. Export to Excel or PDF (per tab; not all tabs export — see `handleExportExcel`/`handleExportPDF`).
5. All tables sortable, color-coded ACOS, currency normalisation.

### Data displayed
Each tab shows a single dimension grouped table with columns: Impressions, Clicks, Spend, Sales, Orders, ACOS, TACOS, ROAS (+ optionally CTR, CPC, CR, Profit). Daily/weekly/hourly variants add a time x-axis chart on top.

---

## 5. Comparisons (Сравнение периодов)

### Files
- `components/layout/ComparisonPage.tsx` (1261 lines) — full standalone page (not nested inside Reports).

### Hooks/Services/Contexts
- `hooks/useFollowState` — persists periodA, periodB, reportType, filters.
- `services/api/metrics.ts` — same `getSummaryBy*` endpoints as Reports, called twice (period A, period B), then deltas computed client-side.

### UX flows
1. Two independent `PeriodPicker` controls (Period A vs Period B).
2. Quick presets: `week_vs_week`, `wed_cycle` (Wed-aligned), `month_vs_month`, `day_vs_day`, `custom`.
3. Report-type select (one of: marketplace / account / book / campaign / keyword / placement / match_type) — same dimensions as Reports tabs but a smaller subset.
4. Same `ReportsFilters` (accounts, marketplaces, bookIds).
5. Output: grouped table where every metric has 3 rows (A, B, Δ%); items are columns. Color coding: positive delta — green; negative — red. For ACOS/CPC/COST/TACOS — inverted (lower is better).
6. Per item link: click opens `CampaignDetails` (when reportType=campaign/keyword).
7. Excel/PDF export of comparison table (`downloadExcel`, `createPDFReport`).
8. Many-items types (`keyword`, `campaign`, `book`) flip orientation (items as rows, periods as columns).

### Data displayed
Per-item: impressions, clicks, ctr, cost, sales, orders, acos, cpc, cr, plus profit/roas/tacos for non-ad-only types. Each cell shows raw value + Δ% from period A.

---

## 6. Settings

### 6.0 Top-level
- `components/settings/SettingsPage.tsx` (279 lines) — `Tabs` host. Tab list (admin sees the +3 last, regular user sees the rest):
  - Книги | Учётные данные(admin) | Профили (N) | Токен(admin) | Полная синхр. | Search Term | Стрим | Роялти | AI (Claude) | Director | Speech-to-Text | Рейтинги & BSR | Позиции | Wiki | Пользователи(admin) | Журнал(admin) | Интеграции(admin)
- Loads settings + profiles on mount via `amazonAdsApi.getSettings` + `amazonAdsApi.getProfiles`. Holds shared `testResult` Alert at top.

### 6.1 Books tab (Книги) — `BookManagement/`
- `BookManagement/index.tsx` — Grid 4|8 split. Left `BookListPanel`, right `BookDetailsPanel`. Toggle "Активные / Архив" with archived count badge.
- `BookManagement/BookListPanel.tsx` (178 lines) — book list with search, click → `fetchBookDetails`.
- `BookManagement/BookDetailsPanel.tsx` (1015 lines) — selected book full editor: title, author, account, BE-ACOS, max-CPC, royalties %, organic baseline, ASIN+marketplace pairs (each with Amazon link, sync, edit, delete), cover upload, content history (`BookContentHistory`), checklist (`BookChecklist`), audit notes.
- Modals: `EditBookModal`, `DeleteBookModal`, `AddAsinModal`, `UploadCoverModal`, `AddChangeModal`.
- Services: `bookApi.getAll`, `getArchived`, `getById`, `deleteAsin`, `updateAsin`. `amazonAdsApi.syncCampaigns(asin, profileId)`.

### 6.2 Credentials (Учётные данные) — `CredentialsForm.tsx` (admin only)
- 400 lines. Two modes (`Tabs`): `oauth` (recommended) and `manual` (paste refresh token).
- OAuth flow: enter `client_id`, `client_secret`, `redirect_uri` (default `https://kdpbook.click/callback`), pick region (`NA`/`EU`/`FE`), hit "Авторизоваться через Amazon" → opens Amazon OAuth in new tab → user pastes back the `code` → `exchangeCode` → `refresh_token` displayed and copy-to-clipboard.
- Manual mode: paste pre-existing refresh token + region → save.
- Calls: `amazonAdsApi.startOAuth`, `amazonAdsApi.exchangeCode`, `amazonAdsApi.saveSettings`, `amazonAdsApi.testConnection`.
- After save: auto-switches to Profiles tab.

### 6.3 Profiles — `ProfilesList.tsx`
- 228 lines. Lists synced Amazon Ads profiles (account_name, country_code, profile_id, fetched_from_region, currency). Button "Синхронизировать профили" calls `amazonAdsApi.syncProfiles` (checks NA/EU/FE regions). Tab counter shows total count `(35)`.

### 6.4 Token (Токен) — `TokenInfo.tsx` (admin only)
- 350 lines. Shows refresh token / access token info, expiry, issued region. Button to refresh access token. Reveals a masked token; copy-to-clipboard on click.
- Calls: `amazonAdsApi.getTokenInfo`.

### 6.5 Полная синхр. (Full Sync) — `FullSync/`
- `FullSync/index.tsx` (390 lines) — root; Container with sync-options grid, country selector, account selector + start/cancel. Persistent queue of sync jobs (resumes after page reload via `localStorage`).
- `FullSync/AccountSelector.tsx` — picks account (groups profiles by `account_name`).
- `FullSync/CountrySelector.tsx` — multi-country chips.
- `FullSync/SyncOptionsGrid.tsx` — checkboxes for Sponsored Products options (campaigns, ad_groups, keywords, product_targets, negatives) and Sponsored Brands options.
- `FullSync/SyncQueue.tsx` (609 lines) — live queue table with status (queued/running/done/failed/cancelled), progress %, ETA, cancel button per row, clear-all.
- `FullSync/hooks.ts` — `useAccountGroups`, `useCountrySelection`, `useSyncOptions`, `usePersistentSyncQueue`. Polls `amazonAdsApi.getActiveSyncs` + `getSyncStatus(jobId)`.
- Calls: `amazonAdsApi.startBackgroundSync`, `getSyncStatus`, `getActiveSyncs`.

### 6.6 Search Term reports — `ReportAPI/`
- `ReportAPI/index.tsx` (917 lines) — combo manual + scheduled search term report exports.
- `ReportAPI/CoverageGrid.tsx` (319 lines) — heatmap-grid of "data coverage" days × profiles (which days have STR uploaded). Uses `amazonAdsApi.getDataCoverage(60)`.
- Form: account → countries (multi) → ad_product (`SPONSORED_PRODUCTS` / `SPONSORED_BRANDS` / `BOTH`) → date range → "Создать отчёт" — pushes onto a queue.
- Queue table: report status (queued / pending / completed / failed), poll attempts, completed_at, row_count, error.
- Schedule section: select which profiles are included in nightly auto-fetch (`amazonAdsApi.getScheduleProfiles`, `updateScheduleProfiles`), shows worker status + last 24h success/fail counts.
- AI Analysis stats panel: total search terms, unanalyzed count, cost estimate, run on-demand. Worker statuses: `pr_enrichment`, `ai_analysis` cron workers.
- **Embeds `<NegativeLists />`** (from `NegativeLists/index.tsx`) inline — Amazon negative keyword lists management.
- Calls: `amazonAdsApi.getQueueStatus`, `createReport`, `createAndDownloadReport`, `getReportData`, `getReportTypes`, `getReports`, `getScheduleStatus`, `getScheduleHistory`, `getDataCoverage`, `getScheduleProfiles`, `updateScheduleProfiles`, `getFinalizationStats`. Plus `searchTermsApi.getAnalysisStats`.

### 6.7 Стрим (Marketing Stream) — `MarketingStream/`
- `MarketingStream/index.tsx` (368 lines).
- `MarketingStream/hooks.ts` — `useMarketingStreamData` (stats, history, audit, run-sync/run-audit), `useCountdownTimer` (hh:mm:ss until next scheduled stream).
- `MarketingStream/formatters.ts` — `formatCountdown`, `formatNumber`, `formatBytes`.
- Header: stats summary (total_files, total_records, total_size formatted), countdown panel "Следующая синхр.", "Запустить аудит" + "Запустить синхронизацию" buttons.
- Tabs:
  - Execution history table — recent executions with success/error.
  - Audit result panel — count of records vs expected, gaps detection.

### 6.8 Роялти (Royalties) — `RoyaltiesImport.tsx` (570 lines)
- Drag-and-drop XLSX/CSV upload of KDP royalty reports (per month).
- Matrix view: months × accounts grid showing which months are uploaded (`uploaded`, `records`, `new_books`, `uploaded_at`, `filename`).
- Fill-percentage progress bar.
- Books-needing-setup list (newly created from royalty import — link to BookManagement to fill in details).
- Recent uploads table with re-upload (replaces prior upload by file_hash).
- Calls: `${API_URL}/personal/royalties/upload`, `personalApi.getRoyalties...` etc.

### 6.9 AI (Claude) — `AISettings.tsx` (603 lines)
- API key input (Anthropic key). Masked once saved; "Замените ключ" toggles input.
- `appSettingsApi.getAISettings`, `saveAISettings`, `testAIKey`.
- Model selection panel with 4 model slots:
  - main / advisor / search-terms / director — each has its own dropdown of available Claude models (`appSettingsApi.getAvailableModels()`).
- Refresh model list ("Обновить список моделей").
- (Deprecated, hidden) separate Advisor key section — state retained.
- Save → `appSettingsApi.saveAIModelSettings` + `updateDirectorConfig` for director model.

### 6.10 Director — `DirectorSettings.tsx` (493 lines)
- Configures the "Director" auto-orchestration agent (used for cron audits).
- Settings: enabled flag, schedule cron, model, timeout, default audit prompt.
- API: `services/api/director.ts` (`getDirectorConfig`, `updateDirectorConfig`).
- Outside core scope but is a settings tab — list it for completeness.

### 6.11 Speech-to-Text — `STTSettings.tsx` (352 lines)
- OpenAI key for Whisper, model selection (gpt-4o-mini-transcribe / whisper-1), language preference.
- Used by `AudioRecordButton` in AI Advisor and other places.
- API: `services/api/sttSettings.ts`.

### 6.12 Рейтинги & BSR — `RatingsSettings.tsx` (331 lines)
- Configures BSR/ratings scraper (sources: which marketplaces, schedule).
- Calls: `services/api/index.ts → ratingsApi`, scraper schedule endpoints.

### 6.13 Позиции (Rank Tracking) — `RankTrackingSettings.tsx` (364 lines)
- Configure DataForSEO / SerpAPI rank tracking. Add/remove tracked keywords per book/marketplace.
- API: `services/api/rankTracker.ts`.

### 6.14 Wiki — `Wiki/`
- Internal docs / cheatsheet. Out of scope for desktop port (treat as static).

### 6.15 Пользователи (admin) — `UsersManagement.tsx` (359 lines)
- User list, granular permission toggles (can_manage_bids, can_manage_campaigns, can_create_campaigns, can_manage_negatives, can_sync_data, can_view_reports), role admin/user, invite flow.
- API: `services/api/admin.ts`.

### 6.16 Журнал (admin) — `AuditLog.tsx` (159 lines)
- Audit trail of user actions across the system. Filterable by user/date.

### 6.17 Интеграции (admin) — `IntegrationsSettings.tsx` (773 lines)
- API Keys (create / revoke) for external integrations.
- Webhooks: configure URL + secret + event types (`task.created`, `task.updated`); test deliveries; recent deliveries log.
- API: `services/api/integrations.ts`.

### 6.18 Negative Lists (used as sub-section of Search Term, but stand-alone module) — `NegativeLists/`
- `index.tsx` — manage global / per-book negative keyword lists.
- `NegativeListCard.tsx` — list card with keyword count, last update, edit/delete.
- `NegativeListItemsTable.tsx` — items inside list.
- `NegativeListModal.tsx` — create/edit list (name, scope: global vs per-book).
- `AddKeywordsModal.tsx` — bulk-add keywords (paste textarea, match types).
- API: `services/api/negativeLists.ts` — `getLists`, `getList`, `createList`, `updateList`, `deleteList`, `getBookKeywords`, `getOrCreateBookList`, plus add/remove items.

### 6.19 Keyword Lists — `KeywordLists/`
- `index.tsx` — per-book keyword lists.
- `KeywordListCard.tsx`, `KeywordListItemsTable.tsx`, `KeywordListModal.tsx`, `AddKeywordsModal.tsx`.
- `DiscoveryPanel.tsx` (354 lines) — keyword discovery/AI relevance pipeline. Status polling (`getDiscoveryStatus`, `getEnrichmentStatus`, `getRelevanceStatus`).
- API: `services/api/keywordLists.ts` — `getLists(bookId)`, `getList`, `createList`, `updateList`, `deleteList`, `getSuggestedKeywords(bookId, marketplace)`, `getDiscoveryStatus`, `getDiscoveredKeywords`, `getEnrichmentStatus`, `getRelevanceStatus`.
- **Note:** This is mounted inside Search Terms / Keywords features, not directly in SettingsPage — included here because it's settings-shaped UI.

### 6.20 AmazonAdsSettings.tsx (legacy)
- Older monolithic settings page (402 lines). Replaced by the per-tab structure above. **Do not port.**

---

## Search Terms feature (used as sidebar item AND inside CampaignDetails)

Strictly part of the cross-cutting flow but worth recording since it touches Settings/ReportAPI and Comparisons.

### Files
- `components/analytics/SearchTermsAnalytics.tsx` — re-exports from `SearchTerms/index.tsx`.
- `components/analytics/SearchTerms/index.tsx` — root container (~500 lines). Tabs: Входящие / Отложено / Обработано / На паузе / Архив / Все.
- `components/analytics/SearchTerms/components/`
  - `SearchTermsHeader.tsx` — search input + bulk action toolbar.
  - `SearchTermsFilters.tsx` — account / book / target / classification / term-type / strategic filters.
  - `SearchTermsTable.tsx` — sortable table.
  - `SearchTermsPagination.tsx` — page-size + pagination.
- `components/analytics/SearchTerms/hooks/`
  - `useSearchTermsData.ts` — pagination, filters, items, inbox counts, term-type counts, classification counts.
  - `useSearchTermsActions.ts` — bulk actions: analyze relevance, return-to-inbox, snooze (7/14d), done, pause (60/90d), archive-final, restore + remove-negative.
- `components/analytics/SearchTerms/modals/`
  - `SnoozeModal.tsx`, `PauseModal.tsx`, `NegativeModal.tsx`, `UnifiedListModal.tsx` (add to negative or keyword list), `TrackingSettingsModal.tsx`, `RankHistoryModal.tsx`, `MoveKeywordModal.tsx`.
- `components/analytics/SearchTermTrendModal.tsx` — global popup shown from anywhere.
- API: `services/api/searchTerms.ts` — `getList`, `getSummary`, `getByCampaign`, `getCampaignSummary`, `getCampaignByTarget`, `getTargetSearchTerms`, `getInboxCounts`, `updateStatusBulk`, `getHistory`, `getRelatedCount`, `getTrendData`, `getAnalysisStats`, `searchTargets`, plus `addNegativeByText`.

---

## Extended modules (out of scope, listed for awareness)

These exist in the original frontend but are explicitly NOT part of the desktop personal-use scope. One-line each:

- **chat** (`components/chat/`) — `ChatBubble`, `VoiceVideoBar`, team chat with WebRTC voice/video. Out of scope.
- **calendar** (`components/calendar/`) — `CalendarWidget`, `CalendarDropdown`, `AddEventModal`, calendar events + tasks. Out of scope.
- **scraper** (`components/scraper/`) — `ScannerPage`, ASIN scraper UI. Out of scope.
- **publisherRocket** (`components/publisherRocket/`) — `PublisherRocketPage`, keyword research (Publisher Rocket integration). Out of scope.
- **accounting** (`components/accounting/`) — `AccountingDashboard`, ledger / personal finance. Out of scope.
- **automation/rules** (`components/pages/AutomationPage/`, `RulesPage.tsx`) — automation engine UI. Out of scope.
- **action_center / changelog** (`components/pages/ActionCenterPage.tsx`) — action center / changelog timeline. Out of scope.
- **alerts** (`components/pages/AlertsPage.tsx`) — system alerts page (worker monitoring). Out of scope (we already poll `/worker-monitoring/status` minimally in shell).
- **admin** (`components/pages/AdminPage.tsx`) — admin tools. Out of scope.
- **AI management** (`components/pages/AIManagementPage/`) — Claude audits + recommendations across books. Out of scope.
- **keywords** (`components/pages/KeywordsPage.tsx`) — global keywords + discovery. Out of scope; keyword-list pieces ported only as needed for SearchTerms.
- **operations** (`components/pages/OperationsCenterPage/`) — task tracking. Out of scope.
- **changelog page** (`components/pages/ChangelogPage.tsx`) — release notes. Out of scope.
- **profile** (`components/pages/ProfilePage.tsx`) — user profile. Out of scope (desktop is single-user).
- **legal** (`components/legal/`) — privacy/terms public pages. Out of scope.
- **director / STT / wiki / users / audit / integrations** — settings tabs out of scope; mention only.
- **marketing_stream worker UI** — Stream tab in Settings is included; the worker logs page is out of scope.

---

## Key cross-cutting infra

### API client structure
- `services/api/config.ts` — `axios` instance with `withCredentials: true` (cookie auth) and base URL `process.env.REACT_APP_API_URL || http://localhost:5001/api`.
- `services/api/index.ts` — barrel re-exports of every domain module: `bookApi`, `metricsApi`, `campaignApi`, `adGroupApi`, `targetApi`, `weekApi`, `bookContentChangesApi`, `checklistApi`, `templatesApi`, `negativesApi`, `aiAdvisorApi`, `ratingsApi`, `calendarApi`, `amazonAdsApi`, `accountingApi`, `personalApi`, `searchTermsApi`, `appSettingsApi`, `sttSettingsApi`, `automationApi`, `negativeListsApi`, `keywordListsApi`, `chatApi`, `campaignNotesApi`, `projectNotesApi`, `adminApi`, `adminNotesApi`, `adminMeetingsApi`, `profileApi`, `agentTraceApi`, `aiAuditsApi`, `actionCenterApi`, `tasksApi`, `directorApi`, `rankTrackerApi`, `publisherRocketApi`, `scraperApi`, `integrationsApi`.
- For desktop port: only port `bookApi`, `metricsApi`, `campaignApi`, `adGroupApi`, `targetApi`, `negativesApi`, `negativeListsApi`, `keywordListsApi`, `searchTermsApi`, `amazonAdsApi`, `appSettingsApi`, `ratingsApi`, `rankTrackerApi`, `personalApi`. Skip the rest.

### Auth flow
- `contexts/AuthContext.tsx` — cookie-based JWT verify on mount via `/auth/verify`. Login: POST `/auth/login` (email + password). On success, server sets HttpOnly cookie. Logout: POST `/auth/logout`. **Desktop replacement**: paste-token screen → store via `safeStorage`, send `Authorization: Bearer ...` instead of cookie. Already implemented in `src/main/auth-store.ts` + `src/main/api-client.ts`.

### Theming
- `contexts/ThemeContext.tsx` — light/dark theme + named color palette. Cloudscape mostly handles its own colors; this file is used by non-Cloudscape components (older views like `MarketplacePanel`, `BookList`, `WeekChanges`). For desktop we replace with Tailwind's dark mode.

### Routing
- No React Router. Two layers:
  1. Public/private split via `usePublicPage()` reading `window.location.pathname`.
  2. Inside private shell — single `currentView` enum on `DataContext`. Some pages (Books) layer URL `?level=&book=&marketplace=&campaign=` for browser back-button.

### Cross-cutting filters
- `WeeksFilterContext` — global `weeksCount` (1/2/4/8/12 ISO weeks). Drives Books, Campaigns, CampaignDetails, AdGroup tables.
- `PeriodPicker` (`components/common/PeriodPicker/`) — custom date-range picker:
  - `Calendar.tsx` — month grid.
  - `ComparisonPicker.tsx` — variant for Comparison page (snap modes: week/month/wed-cycle).
  - `index.tsx` — popover wrapper, presets.
  - `types.ts`, `utils.ts`.
  Reused on Dashboard, Books, Campaigns, Reports, Comparison, SearchTerms, ReportAPI, Royalties, HourlyDynamics.

### Common components reused everywhere
- `components/common/Button.tsx`, `Input.tsx`, `Badge.tsx`, `Modal.tsx`, `Spinner.tsx`, `Toast.tsx` — non-Cloudscape primitives (used by older views).
- `components/common/PeriodPicker/` (above).
- `components/common/WeeksFilter.tsx` — segmented control 1W/2W/4W/8W/12W bound to `WeeksFilterContext`.
- `components/common/Toast.tsx` + `contexts/ToastContext.tsx` — global toast (success/error/warning).
- `components/common/UpdateNotification.tsx` — shows "new version available" banner.

### Constants
- `constants/marketplaces.ts` — `MARKETPLACES`, `MARKETPLACE_FLAGS` (emoji), `getCurrencySymbol(marketplace)`, `getCurrencyCode`, `getFlagClass`, `getAmazonProductUrl(marketplace, asin)`, `convertToUSD(amount, marketplace)`.
- `constants/api.ts` — `API_URL` (currently same as `services/api/config.ts`; one of them is legacy).

### Utils
- `utils/index.ts` — color helpers (`getAcosColor`, `getAcosBadgeColor`, `getSpendColor`, `getSalesColor`, `getProfitColor`, `getCtrColor`, `getCvrColor`, `getRoiColor` — return Cloudscape `text-status-*` strings — for desktop port we map to Tailwind classes), `formatCurrency`, `formatPercent`, `formatNumber`, `getFullWeeksDateRange(weeksCount)` (ISO Mon–Sun), date helpers.
- `utils/metrics.ts` — possibly metric calculation helpers (verify when porting).

### Types
- `types/index.ts` — `Book`, `Campaign`, `AdGroup`, `Target`, `Marketplace`, `BookChecklistItem`, `ViewMode` (the enum the router switches on).
- `types/searchTerms.ts` — search-terms specific.
- `types/tasks.ts` — operations center (out of scope but referenced).

---

## Porting recommendation (high-level)

1. **Phase A — shell + core data**: replicate `CloudscapeLayout` shell in Tailwind without socket/follow/chat/calendar — sidebar (only in-scope nav items: Dashboard, Books, Campaigns, Reports, Comparison, Search Terms, Settings) + header with PeriodPicker + WeeksFilter + user menu. Use the existing Electron `MainLayout` as starting point; merge the hover-expand sidebar pattern. Implement `AppContext`/`DataContext` minus collaboration features.
2. **Phase B — Dashboard** (1 component family). Single page, no drill-down. ~1 day.
3. **Phase C — Books drill-down** with breadcrumbs, marketplaces panel, weekly metrics. Reuse BSR modal. ~3 days.
4. **Phase D — Campaigns + CampaignDetails** with editable fields, ad groups, keywords table, weekly metrics, placement modifiers, hourly chart. ~5 days. AI Advisor optional later.
5. **Phase E — Reports** (14 tabs) and **Comparisons** (one page). Reuse `ReportsFilters`. ~3 days.
6. **Phase F — Settings** (in-scope tabs only: Книги, Учётные данные, Профили, Токен, Полная синхр., Search Term, Стрим, Роялти, AI, Рейтинги & BSR, Позиции). ~3 days. NegativeLists + KeywordLists embedded as sub-features.
7. **Phase G — Search Terms** (full inbox/snooze/done/pause/negative workflow). ~2 days.

Total: ~17 days of focused work for a 1-person port.

Out-of-scope features (chat, calendar, scraper, publisherRocket, accounting, automation, action center, alerts, admin, AI management, keywords/discovery, rules, marketing stream worker UI) deliberately excluded per `parity-plan.md`.
