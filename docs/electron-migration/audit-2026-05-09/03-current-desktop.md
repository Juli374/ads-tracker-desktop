# Current Desktop State — Inventory (2026-05-09)

> Snapshot of what is actually shipped in `ads-tracker-desktop/` as of working-tree
> 2026-05-09. Authoritative baseline: `docs/electron-migration/parity-plan.md`
> (фазы 0–9 + R + 10 ЗАКРЫТЫ; Books-extended/Templates/Publisher Rocket/Search-Term
> trends — отложены).
>
> Stack snapshot: Electron 41.3, React 18.3, TS 5.4, Tailwind 3.4, recharts 3.8,
> lucide-react 1.14. NO Cloudscape, NO socket.io, NO chat.

---

## Pages / Routes

Маршрутизация в `src/renderer/contexts/NavContext.tsx` (state-based, не react-router).
ViewId = 16 значений; switch в `MainLayout.renderContent()`.

| Page | File | Status | What works | Gaps vs original (Cloudscape) |
|---|---|---|---|---|
| Обзор | `pages/DashboardPage.tsx` | full | 4 KpiDelta (Profit/ACOS/Sales/Spend) с delta vs прошлый период; HeroChart (12 toggleable метрик, max 6, double Y-axis, target ACOS reference); TopPerformers (winners/losers per Книги/Кампании); AlertsWidget; FunnelChart (Impr→Clicks→Orders); MarketplaceDistribution (donut); таблица книг внизу | (см. ниже «Hard gaps vs screenshots») |
| Книги | `pages/BooksPage.tsx` | partial | Список книг с per-MP rows, expand/collapse группа book_id, sort (spend/sales/orders/acos), search, click→drill-down в Campaigns | BSR sparkline отсутствует, ratings widget отсутствует, KDP metrics inline (royalty/page, breakeven ACOS, max CPC) — нет, EditBookModal/DeleteBookModal/cover upload — нет (отложено в parity-plan §8.2) |
| Кампании | `pages/CampaignsPage.tsx` | full | Список campaigns с фильтрами (search, marketplace, type, activeOnly), sort, пагинация (50/стр), inline-edit бида через EditableNumber, кнопка «+ Кампания» (AddCampaignModal), row click → CampaignDetails | — |
| campaign_details | `pages/CampaignDetailsPage.tsx` | partial | Header с breadcrumb «Кампании / детали», title, subtitle (book·MP·type·targeting), KPI row (Spend/Sales/Orders/ACOS/CTR), 5 табов; AdGroups/Targets/Negatives — рабочие; «Search Terms» — placeholder с кнопкой «Открыть Search Terms →»; «История» — заглушка | НЕТ 1W/2W/4W/8W/12W timeline; НЕТ multi-period таблицы (60d/30d/weeks с метриками AD Sales/Spend/Orders/Impressions/Clicks/ACOS/CTR/CPC/CVR/ROAS); НЕТ Hourly Dynamics; НЕТ кнопок Pause/Budget; НЕТ AI Advisor |
| Ключи | `pages/KeywordsPage.tsx` | full | Master-list всех target'ов, фильтры (book/MP/match/status/search), sort, пагинация, inline-edit бида | Нет virtualization (parity-plan §4.1: «таблица должна тянуть 5000+ строк» — отложено) |
| Поисковые запросы | `pages/SearchTermsPage.tsx` | existing | Старый pre-фазовый код; принимает `localCampaignId`/`amazonCampaignId` через NavFilters | Нет Search Term trend modal (отложено фаза 10) |
| Минус-слова | `pages/NegativesPage.tsx` | full | 2 таба: «По кампаниям» (старый bulk add) + «Списки» (NegativeListsTab — CRUD списков с book scope) | — |
| Отчёты | `pages/ReportsPage.tsx` | full | 6 табов: Динамика (default — KPI Spend/Sales/ACOS/TACoS + line chart spend/sales + сводка daily/weekly + by-marketplace), Placement, Match type, Targeting, Bidding strategy, Campaign type — все 5 breakdown-табов через `BreakdownTab`; CSV export | Нет Hourly tab отдельного, нет Matrix tab, нет Organic vs Paid tab, нет Budget Pacing tab (parity-plan §7 закрыт частично) |
| Сравнение | `pages/ComparisonPage.tsx` | full | 2 select периода, 4 delta-KPI (Spend/Sales/Orders/ACOS) с inverse-логикой, top-50 книг с side-by-side delta-колонками | — |
| Центр действий | `pages/ActionCenterPage.tsx` | full (graceful) | Feed `/api/actions/recent` с группировкой по дням, фильтр по типу, before/after metrics A→B | Endpoint может отсутствовать на бэке — graceful 401/403/404 |
| Автоматизация | `pages/AutomationPage.tsx` | full (graceful) | KPI row (pending/applied/dismissed/snoozed), tabs по статусу, карточки с priority badge, apply/dismiss inline | Endpoint может отсутствовать |
| Мониторинг (Alerts) | `pages/AlertsPage.tsx` | full (graceful) | KPI row по severity, tabs all/critical/warning/info, drill-down к кампании/книге | — |
| Операции | `pages/OperationsCenterPage.tsx` | partial | Kanban 4 колонки (Todo/In progress/Blocked/Done), inline-status-select, форма создания | DnD НЕ реализован (использован select; parity-plan §9.1: «DnD отложен») |
| Royalty | `pages/RoyaltiesPage.tsx` | full | Selector месяца, 3 KPI (Units/Royalty/Revenue), таблица импортов, тumbler **Cloud / Local** (localStorage persist), demo-seed для local store, путь к local-db файлу |Local импорт парсит уже распарсенные строки от renderer'а — реальный xlsx parser НЕ портирован (TODO в `local-db/royalty.ts:111`) |
| Бухгалтерия | `pages/AccountingPage.tsx` | full (graceful) | KPI Счетов/Баланс/Транзакций, таблица счетов с цветным balance, таблица последних 100 транзакций | Read-only по дизайну |
| Настройки | `pages/SettingsPage.tsx` | partial | Cards: Учётная запись (email/role/full_name + sign-out), API-ключ (хранилище/превью/тип), Amazon Ads section, UpdateChecker (scaffold), Backend (base URL + override env), Приложение (версия/платформа/build mode/repo link) | НЕТ системы табов: «Книги \| Учётные данные \| Профили (35) \| Токен \| Полная синхр. \| Search Term \| Стрим \| Роялти \| AI (Claude)» — все 9 вкладок отсутствуют (см. Hard gaps) |

---

## Sidebar / Navigation

Sidebar собран в `MainLayout.tsx`, three sections + bottom:

**Аналитика** (`mainNav` 8 пунктов, hotkey `G <X>`):

| Hotkey | Label | ViewId | Icon | Status |
|---|---|---|---|---|
| G O | Обзор | dashboard | `LayoutDashboard` | реальный |
| G B | Книги | books | `BookOpen` | реальный |
| G C | Кампании | campaigns | `Target` | реальный |
| G K | Ключи | keywords | `Key` | реальный |
| G S | Поисковые запросы | search_terms | `Search` | реальный |
| G N | Минус-слова | negatives | `Ban` | реальный |
| G R | Отчёты | reports | `FileText` | реальный |
| G P | Сравнение | comparison | `GitCompare` | реальный |

**Действия** (`actionsNav` 4 пункта):

| G A | Центр действий | action_center | `History` | graceful |
| G U | Автоматизация | automation | `Zap` | graceful |
| G L | Мониторинг | alerts | `Activity` | graceful |
| G T | Операции | operations | `ClipboardList` | реальный |

**Финансы** (`financeNav` 2 пункта):

| G Y | Royalty | royalties | `Coins` | реальный (Cloud + Local toggle) |
| G F | Бухгалтерия | accounting | `Wallet` | graceful |

**Bottom** (`bottomNav`):

| — | Настройки | settings | `Settings` | реальный (без табов) |

**Connection indicator**: «Online» dot + «Подключено» label (статичный, не реагирует на состояние сети).

**Маппинг на скриншот** (sidebar иконки в скриншоте: dashboard, books, ads/campaigns, search/keywords, target, wallet, list/orders, history, send/launch, database, alerts, page, settings):

| Скриншот icon | Соответствие в desktop | Гэп |
|---|---|---|
| dashboard | ✅ Обзор (G O) | — |
| books | ✅ Книги (G B) | — |
| ads/campaigns | ✅ Кампании (G C) | — |
| search/keywords | ✅ Ключи (G K) + Поисковые запросы (G S) — 2 пункта на 1 иконку | возможно один из них (Cloudscape) объединял |
| target | ✅ partial — таргеты живут внутри CampaignDetails, отдельной страницы нет | нет глобального Targets pane |
| wallet | ✅ Бухгалтерия (G F) + Royalty (G Y) | — |
| list/orders | ❌ нет «Заказы» / «Orders» страницы | gap |
| history | ✅ Центр действий (G A) | — |
| send/launch | ❌ нет «Запуск» / launch-страницы (возможно, Sync trigger в Cloudscape) | gap |
| database | ❌ нет database/sync-status страницы | gap |
| alerts | ✅ Мониторинг (G L) | — |
| page | ❌ непонятно что это (возможно, Reports или Pages-CMS) | — |
| settings | ✅ Настройки | без табов |

Topbar (right side): GlobalFilters (book/marketplace/account chips) → CommandPalette trigger («Поиск ⌘K») → CalendarBell → NotificationsBell → UserMenu (3-segment Light/Dark/System theme).

---

## Settings tabs (vs скриншот «Книги \| Учётные данные \| Профили (35) \| Токен \| Полная синхр. \| Search Term \| Стрим \| Роялти \| AI (Claude)»)

Текущая SettingsPage НЕ имеет табов — это flat-список Cards.

| Tab из скриншота | Реализовано? | File | Notes |
|---|---|---|---|
| Книги | ❌ | — | в Cloudscape была book management settings (обложки, royalty/page) — нет |
| Учётные данные | ❌ | — | список Amazon Ads accounts существует через `AmazonAdsSection`, но НЕ отдельной вкладкой; KDP credentials/Royalty accounts полностью отсутствуют |
| Профили (35) | partial | `components/AmazonAdsSection.tsx` | список AmazonAdsProfile из `/api/amazon-ads/profiles` рендерится внутри Settings как card; нет управления (только просмотр + connect/disconnect через OAuth) |
| Токен | partial | inline в SettingsPage | Card «API-ключ» показывает: storage type, masked preview, type detection (at_live_*/JWT). Менять/вставлять — только через sign-out → LoginScreen |
| Полная синхр. | ❌ | — | trigger для backend full-sync не реализован (`parity-plan` явно: «Marketing Stream sync triggers — backend-only, не делаем») |
| Search Term | ❌ | — | settings панели для Search Term sync/parsing нет |
| Стрим | ❌ | — | Marketing Stream config UI нет (по дизайну не делаем) |
| Роялти | partial | в RoyaltiesPage есть Cloud/Local toggle | settings-вкладки в SettingsPage нет; импорт KDP отчётов → отдельная страница RoyaltiesPage; xlsx parser не порт |
| AI (Claude) | ❌ | — | AI Management полностью отсутствует (parity-plan: «AI Management page — слишком много инфры; PPC-агенты остаются на Railway») |

**Реально присутствующие в Settings (но не табы — карточки):**

1. Учётная запись (email/role/full_name + sign-out)
2. API-ключ (хранилище/превью/тип)
3. AmazonAdsSection (профили + OAuth connect)
4. UpdateChecker (auto-update scaffold, no-op)
5. Backend (base URL + ENV override)
6. Приложение (версия/платформа/build/repo link)

---

## API clients (renderer/api/*)

| File | LOC | Used by | Real or stub | Endpoints called |
|---|---|---|---|---|
| `client.ts` | 33 | все api/* | real (IPC wrapper) | — (через `window.api.request`) |
| `auth.ts` | 65 | `AuthContext`, `LoginScreen` | real | `GET /api/auth/verify`, `POST /api/auth/login`, `GET /api/tasks?limit=1` (для at_live ping) |
| `metrics.ts` | 454 | DashboardPage, BooksPage, CampaignsPage, CampaignDetailsPage, KeywordsPage, ReportsPage, ComparisonPage, AlertsPage, NegativesPage, dashboard/* | real | `GET /api/metrics/summary/{by-book,by-campaign,by-marketplace,daily,weekly,overview,top-performers,by-keyword}`, `GET /api/alerts`, generic `breakdown(endpoint, key, params)` для by-{placement,match-type,targeting-type,bidding-strategy,campaign-type} |
| `books.ts` | 38 | `BooksContext` | real | `GET /api/books`, `GET /api/books/:id` |
| `marketplaces.ts` | 14 | `MarketplacesContext` | real | `GET /api/marketplaces` |
| `profile.ts` | 22 | (см. ниже) | real, **NOT IMPORTED** | `GET /api/profile` — нигде не используется |
| `notifications.ts` | 49 | `NotificationsBell` | real | `GET /api/notifications`, `GET /api/notifications/unread-count`, `POST /api/notifications/mark-read`, `POST /api/notifications/mark-all-read` |
| `campaigns.ts` | 49 | `AddCampaignModal`, `EditCampaignModal` | real | `POST /api/asins/:asinId/campaigns`, `PUT /api/campaigns/:id` |
| `adGroups.ts` | 48 | CampaignDetailsPage, AddCampaignModal, AddAdGroupModal, AddTargetModal | real | `GET /api/campaigns/:id/ad-groups`, `GET /api/ad-groups/:id`, `POST /api/ad-groups`, `PUT /api/ad-groups/:id`, `DELETE /api/ad-groups/:id` |
| `targets.ts` | 84 | CampaignDetailsPage, KeywordsPage, AddCampaignModal, AddTargetModal | real | `GET /api/ad-groups/:id/targets`, `GET /api/campaigns/:id/targets`, `POST /api/targets`, `PUT /api/targets/:id`, `createKeywordsBulk()` хелпер |
| `negatives.ts` | 61 | NegativesPage, CampaignDetailsPage, AddCampaignModal | real | `GET /api/campaigns/:id/negatives`, `POST /api/campaigns/:id/negatives` (single + bulk), `POST /api/ad-groups/:id/negatives`, `DELETE /api/negatives/:id` |
| `negativeLists.ts` | 73 | `NegativeListsTab` | real (graceful) | `GET /api/negative-lists`, `GET /api/negative-lists/:id`, `POST /api/negative-lists`, `PUT/DELETE /api/negative-lists/:id`, `POST /api/negative-lists/:id/items`, `DELETE /api/negative-lists/items/:id` |
| `searchTerms.ts` | 144 | `SearchTermsPage` | real | `GET /api/search-terms`, `GET /api/search-terms/summary`, `POST /api/search-terms/add-negative-by-text` |
| `amazonAds.ts` | 72 | `AmazonAdsSection` | real (graceful) | `GET /api/amazon-ads/profiles`, `POST /api/amazon-ads/sync-profiles`, `GET /api/amazon-ads/token-info`, `POST /api/amazon-ads/refresh-token`, `POST /api/amazon-ads/oauth/start`, `POST /api/amazon-ads/oauth/complete` |
| `actionCenter.ts` | 89 | `ActionCenterPage` | real (graceful) | `GET /api/actions/recent` |
| `automation.ts` | 132 | `AutomationPage` | real (graceful) | `GET /api/automation/recommendations`, `POST /api/automation/recommendations/:id/{apply,dismiss,snooze}` |
| `tasks.ts` | 57 | `OperationsCenterPage` (+ used by auth.ts:51 для ping) | real | `GET /api/tasks`, `POST /api/tasks`, `PUT /api/tasks/:id/status`, `PUT /api/tasks/:id`, `DELETE /api/tasks/:id` |
| `calendar.ts` | 44 | `CalendarBell` | real (graceful) | `GET /api/calendar/upcoming-events`, `GET /api/calendar/by-month`, `POST /api/calendar/events`, `DELETE /api/calendar/events/:id` |
| `accounting.ts` | 62 | `AccountingPage` | real (graceful) | `GET /api/accounting/accounts`, `GET /api/accounting/categories`, `GET /api/accounting/transactions` |
| `royalties.ts` | 41 | `RoyaltiesPage` | real (graceful) | `GET /api/royalties/uploads`, `GET /api/royalties/accounts`, `GET /api/royalties/summary/:targetMonth` |
| `localRoyalty.ts` | 64 | `RoyaltiesPage` | real (IPC, не HTTP) | `window.api.localRoyalty.{listUploads,listRecords,getSummary,import,delete,filePath}` |

**Dead/orphan modules:**
- `profile.ts` — экспортирует `profileApi.get()` для `/api/profile`, но grep по renderer не находит ни одного импорта. Вероятно остаток pre-`AuthContext`-рефакторинга. `AuthContext.tsx` использует только `authApi.verify`/`authApi.login`.

**Total renderer api LOC:** 1695.

---

## IPC channels (shared/ipc.ts)

Все 14 каналов из `IpcChannel` зарегистрированы в `src/main/ipc-handlers.ts`:

| Channel | Direction | Handler | Use |
|---|---|---|---|
| `app:getVersion` | renderer→main invoke | `AppGetVersion` | `window.api.app.getInfo()` returns `{version,platform,isPackaged}` |
| `app:getApiBaseUrl` | renderer→main invoke | `AppGetApiBaseUrl` | возвращает ENV override или DEFAULT |
| `auth:getToken` | renderer→main invoke | `AuthGetToken` | читает токен (ENV → safeStorage → plain-file fallback → null) |
| `auth:setToken` | renderer→main invoke | `AuthSetToken` | пишет в safeStorage с auto-cleanup plain-файла |
| `auth:clearToken` | renderer→main invoke | `AuthClearToken` | удаляет оба файла токена |
| `api:request` | renderer→main invoke | `ApiRequest` | централизованный HTTP с path-validation + Bearer-injection |
| `app:deepLink` | main→renderer event | (publish only) | OAuth callback URL, единственный allowed host = `callback` |
| `shell:openExternal` | renderer→main invoke | `ShellOpenExternal` | whitelist'ом только `https://` (НЕ `ads-tracker-desktop://` из-за self-deeplink loop attack) |
| `local:royalty:listUploads` | renderer→main invoke | `LocalRoyaltyListUploads` | local JSON store |
| `local:royalty:listRecords` | renderer→main invoke | `LocalRoyaltyListRecords` | filter по upload_id |
| `local:royalty:getSummary` | renderer→main invoke | `LocalRoyaltyGetSummary` | aggregate по target_month (`YYYY-MM`) |
| `local:royalty:import` | renderer→main invoke | `LocalRoyaltyImport` | bulk-insert с sanitizeImport |
| `local:royalty:delete` | renderer→main invoke | `LocalRoyaltyDelete` | каскадное удаление uploads + records |
| `local:royalty:filePath` | renderer→main invoke | `LocalRoyaltyFilePath` | для отображения пути в UI |
| `update:getStatus` | renderer→main invoke | `UpdateGetStatus` | scaffold: `{state:'idle', enabled:false}` |
| `update:check` | renderer→main invoke | `UpdateCheck` | scaffold: same as getStatus (no-op) |

`window.api` exposed через `contextBridge.exposeInMainWorld('api', api)` в `src/preload.ts:50`.

---

## Main process api-client (`src/main/api-client.ts`)

**Функции:**
- `apiBaseUrl()` — `process.env.ADS_TRACKER_API_URL` || `https://ads-tracker-production.up.railway.app`
- `validatePath(path)` — защита от path-injection: запрещает `://`, `\`, `@`; требует префикс `/api/`
- `buildUrl(path, query)` — строит URL + post-host check (защита от smuggling через `path = '//evil.com/x'`); query поддерживает строки/числа/булы/массивы (как `key=v1&key=v2`)
- `performApiRequest<T>(payload)` — main entry-point: использует `electron.net.fetch` (proxy-aware), инжектит `Authorization: Bearer <token>` если токен есть, JSON body для не-GET, парсит ответ как JSON или string, возвращает `{status, ok, data, error}`

**Endpoints НЕ зашиты в main** — все вызывает renderer через `apiClient.{get,post,put,del}`. Main только проксирует.

---

## Storage / DB

### `safeStorage` (auth-store.ts)

Token resolution chain:
1. `process.env.ADS_TRACKER_API_TOKEN` (для CI/тестов)
2. `safeStorage.decryptString` чтение из `<userData>/auth-token.bin` (production / signed builds, OS keychain backed)
3. Plain-file fallback `<userData>/auth-token.txt` (mode 0o600) для unsigned dev builds где `safeStorage.isEncryptionAvailable() === false`
4. `null` → юзер видит LoginScreen

`writeToken` всегда сначала `unlink` plain-файл (security finding #3), потом encrypt+write если возможно, иначе пишет plain.

`clearToken` удаляет оба файла.

### local-db (`src/main/local-db/`)

Public-release scaffold для royalty (Amazon TOS — нельзя хранить чужие royalty в Railway).

- `index.ts` — `localStore` API: `read()`, `mutate(updateFn)`, `reset()`, `filePath()`
  - JSON-файл в `app.getPath('userData')/local-db.json`
  - Schema-versioned (`SCHEMA_VERSION = 1`)
  - Crash-safe atomic write: `open → writeSync → fsyncSync → close → rename` (security finding #7)
  - `EMPTY_STATE` fallback при corrupt-файле — НЕ падает
- `royalty.ts` — `localRoyalty` namespace: `listUploads`, `listRecords`, `getSummary`, `importUpload`, `deleteUpload`
  - `sanitizeImport()` — NaN/Infinity → 0, регэксп-валидация `target_month` (`YYYY-MM`) и `marketplace` (`/^[A-Z]{2,8}$/`)
  - Парсинг xlsx **НЕ реализован** — renderer передаёт уже распарсенные строки (TODO в `royalty.ts:111`)

### Updater (`src/main/updater.ts`)

No-op stub. `getUpdateStatus()` возвращает `{state:'idle', enabled:false, message:'scaffold'}`. Реальная имплементация — закомментированный шаблон под `electron-updater` (~30 строк с инструкцией в шапке файла).

---

## UI kit / shared components

### `components/ui/` (reusable primitives)

| File | Purpose |
|---|---|
| `Card.tsx` | стандартный Card-контейнер с `title`/`rightSlot`/`bodyClassName` |
| `Kpi.tsx` | базовый KPI-блок: label + value + loading/tone |
| `KpiDelta.tsx` | расширение Kpi: + `change?:number`, `inverseChange?` (ACOS/Spend), стрелка ▲/▼ + colour, subtitle «к пред. периоду» |
| `EditableNumber.tsx` | inline-edit number-cell: click → input → Enter save / Esc cancel; spinner при save; revert на error; supports `format`, `min`, `step`, `disabled`, `ariaLabel` |
| `RangePicker.tsx` | quick-period кнопки + custom; `autoRefresh` через `storageKey` (localStorage) + `onRefresh`/`refreshing` |
| `PageHeader.tsx` | title + subtitle + rightSlot |
| `States.tsx` | `ErrorBanner`, `LoadingRow`, `EmptyState` |
| `ChartTooltip.tsx` | recharts custom tooltip (label + rows[{label,value,color}]) |
| `Pagination.tsx` | базовая пагинация |
| `ActiveFiltersBar.tsx` | breadcrumb chips активных GlobalFilters |

Тесты: `EditableNumber.test.tsx` (5 тестов в `ui/__tests__/`).

### `components/` (feature components)

| File | Purpose |
|---|---|
| `MainLayout.tsx` | header + sidebar (3 секции) + main; lazy-load 12 страниц через `React.lazy`+`Suspense`; G-hotkey handler |
| `LoginScreen.tsx` | tabs «Email + пароль» (default) / «API-ключ»; `authApi.login` или `auth.setToken` directly |
| `CommandPalette.tsx` | Cmd/Ctrl+K dialog с навигационными командами |
| `GlobalFilters.tsx` | book/marketplace/account dropdowns в topbar |
| `NotificationsBell.tsx` | unread-count badge + dropdown |
| `CalendarBell.tsx` | next-7-days events dropdown с 5-мин polling, auto-hide на 401/403/404 |
| `UserMenu.tsx` | avatar + dropdown (theme toggle Light/Dark/System + sign-out) |
| `UpdateChecker.tsx` | auto-update scaffold UI (показывает что выключен) |
| `ErrorBoundary.tsx` | top-level boundary |
| `EditCampaignModal.tsx` | name/state/budget/bidding strategy/placement adjustments |
| `AddCampaignModal.tsx` | single-screen form: type SP/SB/SD, book→ASIN select, targeting, name+budget, bidding, ad group, keywords, negatives |
| `AddAdGroupModal.tsx` | name + default_bid |
| `AddTargetModal.tsx` | keyword/asin/category bulk + match type + bid override |
| `NegativeListsTab.tsx` | автономный таб для NegativesPage с CRUD списков |
| `AmazonAdsSection.tsx` | список профилей + OAuth start/complete с CSRF state validation |
| `dashboard/` | `HeroChart.tsx` (12 toggleable метрик, max 6, double Y-axis), `TopPerformers.tsx` (winners/losers tabs), `MarketplaceDistribution.tsx` (donut), `FunnelChart.tsx` (CSS-bars), `AlertsWidget.tsx` |
| `reports/BreakdownTab.tsx` | generic компонент для всех by-{placement,match,targeting,bidding,campaign-type} endpoint'ов |

**Tests in `components/__tests__/`:** `addCampaign.test.tsx`, `drillDown.test.tsx`, `hotkeys.test.tsx`, `loginScreen.test.tsx` (4 файла).

### Contexts (`renderer/contexts/`)

| File | Purpose |
|---|---|
| `AuthContext.tsx` | login/verify state machine (`loading`/`unauthenticated`/`authenticated`); `authApi.verify` через токен на mount |
| `BooksProvider` (`BooksContext.tsx`) | глобальный `Book[]` через `booksApi.list` |
| `MarketplacesProvider` (`MarketplacesContext.tsx`) | список MP-кодов |
| `GlobalFiltersContext.tsx` | book/marketplace/accounts фильтры + `useGlobalFilterChips` для ActiveFiltersBar |
| `NavContext.tsx` | state-based router: `ViewId` union из 16 значений + `NavFilters` (bookId, localCampaignId, amazonCampaignId, marketplace, campaignId, detailsTab) |
| `ThemeContext.tsx` | light/dark/system + persist в localStorage + media query listener |
| `ToastContext.tsx` | success/error/info toasts |

Tests: `contexts/__tests__/ThemeContext.test.tsx` (4 теста).

### Library (`renderer/lib/`)

| File | Purpose |
|---|---|
| `format.ts` + `.test.ts` | `fmtPct/fmtMoney/fmtNumber/fmtMoneyPrecise` — null-safe (NaN/Infinity/null/undefined → `'—'`) |
| `dateRange.ts` + `.test.ts` | `RangeId` (7d/30d/90d/...) + `dateRangeFor()` + `RANGES` константа |
| `csv.ts` + `.test.ts` | `toCsv(rows, columns)` + `downloadCsv(filename, content)` |
| `useDeepLink.ts` | подписка на `window.api.onDeepLink`; cleanup unsubscribe |

---

## Dependencies (package.json highlights)

**Runtime:**
- `electron-squirrel-startup` ^1.0.1 — Windows installer integration
- `lucide-react` ^1.14.0 — иконки
- `react`, `react-dom` ^18.3.1
- `recharts` ^3.8.1 — графики

**Dev:**
- `electron` 41.3.0
- `@electron-forge/*` ^7.11.1 (cli + maker-{deb,dmg,rpm,squirrel,zip} + plugin-{auto-unpack-natives,fuses,webpack})
- `@electron/fuses` ^1.8.0 — security baseline
- `tailwindcss` ^3.4.19 (darkMode: 'class')
- `typescript` ~5.4
- `vitest` ^1.6.1, `@testing-library/react` ^14.3.1, `jsdom` ^23.2.0
- `webpack` (через Forge plugin) с `ts-loader` + `style-loader` + `postcss-loader`

**Что НЕ установлено (важно):**
- `@tanstack/react-virtual` — не установлен (parity-plan §4.1: «таблица должна тянуть 5000+ строк» — отложено)
- `react-dnd` / `react-dnd-html5-backend` — не установлен (Operations Kanban DnD отложен)
- `electron-updater` — не установлен (auto-update scaffold)
- `better-sqlite3` — не установлен (local-db остаётся JSON-файл)

---

## Hard gaps vs screenshots

### Dashboard

**Что в desktop ЕСТЬ (close parity):** 4 KpiDelta, HeroChart (12 toggleable), TopPerformers (winners/losers/Книги/Кампании), AlertsWidget, FunnelChart, MarketplaceDistribution, таблица книг.

**Что отсутствует:**
- Быстрый segmented-period picker (Last 30 / This month / Last month) — есть только RangePicker (7d/30d/90d/custom)
- Organic vs Paid split (parity-plan §1: упомянут в зачем, но не имплементирован)
- BSR widget / ratings sparkline на dashboard

### CampaignDetailsPage (vs скриншот «02 - Mediterrane - 4»)

Серьёзный разрыв с дизайном Cloudscape:

- ❌ **1W/2W/4W/8W/12W timeline** — отсутствует. RangePicker даёт только 7d/30d/90d/custom
- ❌ **Multi-period таблица 60d/30d/weeks** с метриками AD Sales/Spend/Orders, Impressions, Clicks, ACOS, CTR, CPC, CVR, ROAS — **полностью отсутствует**. Текущая страница показывает 1 KPI row на текущий период (5 метрик: Spend/Sales/Orders/ACOS/CTR), без сравнения по нескольким временным окнам
- ❌ **Hourly Dynamics** график — отсутствует. `summary/hourly` endpoint не используется; нет ни импорта `hourly`/`Hourly` в renderer
- ❌ **Кнопки Pause/Budget** в header — нет (есть только «Редактировать», открывает EditCampaignModal)
- ❌ **AI Advisor** кнопка/панель — `AI Advisor`/`Advisor` строка отсутствует в репозитории (grep: 0 hits)
- ✅ Tabs «Ad Groups | Targets | Search Terms | Negatives | History» — есть (5 табов), но Search Terms и History — placeholder'ы

### Settings (vs скриншот 9 вкладок)

- ❌ Сама система табов — отсутствует. Текущая SettingsPage — flat-список Cards
- ❌ Книги, Учётные данные, Полная синхр., Search Term, Стрим, AI (Claude) — нет соответствующих UI
- partial: Профили (35) — внутри AmazonAdsSection card (не как таб)
- partial: Токен — Card «API-ключ» с превью и type detection
- partial: Роялти — отдельная страница RoyaltiesPage с Cloud/Local toggle, не как таб Settings

---

## Working tree noise (M / ?? files of interest)

**Modified (закрытые фазы 0–10):**
- `forge.config.ts` — appBundleId/protocols/(commented)osxSign — закрыта фаза 10.2
- `src/index.ts` — protocol handler + single-instance lock + setWindowOpenHandler/will-navigate + DevTools env-gate (фаза R)
- `src/index.css`, `tailwind.config.js` — dark theme overrides (фаза 10.1)
- `src/main/api-client.ts` — path validation (фаза R)
- `src/main/auth-store.ts` — удалён hardcoded token + plain-file fallback (фаза R, security #1, #3)
- `src/main/ipc-handlers.ts` — добавлены 8 каналов (local royalty + update + shell)
- `src/preload.ts`, `src/shared/ipc.ts` — расширены (фазы 6, 10.2)
- `src/renderer/App.tsx` — провайдеры обёртка (Theme, Marketplaces, Books, GlobalFilters)
- `src/renderer/api/{auth,campaigns,metrics,negatives,profile}.ts` — типы фаз 1–4
- `src/renderer/components/{CommandPalette,EditCampaignModal,MainLayout,UserMenu,ui/index,ui/ActiveFiltersBar}.tsx` — расширены
- `src/renderer/contexts/NavContext.tsx` — расширен ViewId с 4 до 16 значений
- `src/renderer/lib/format.{ts,test.ts}` — null-safe (фаза 0)
- `src/renderer/pages/{Campaigns,Dashboard,Negatives,Reports,Settings}Page.tsx` — переписаны/расширены
- `src/renderer/window.d.ts` — `window.api: DesktopApi` non-optional
- `src/test/{mockApi,setup}.ts` — расширены mock'и для 6+ endpoint'ов
- `vitest.config.ts` — testTimeout 15s (lazy-load в jsdom медленный)
- `webpack.renderer.config.ts` — explicit `mode: 'production'`

**Deleted:**
- `src/renderer/components/TokenPasteScreen.tsx` — заменён на `LoginScreen.tsx` (фаза 6.1)

**Untracked (новые файлы фаз 1–10 + R, но не закоммиченные!):**

13 новых страниц: ActionCenterPage, AlertsPage, AutomationPage, AccountingPage, CampaignDetailsPage, ComparisonPage, KeywordsPage, OperationsCenterPage, RoyaltiesPage + 6 файлов в `pages/__tests__/`.

11 новых API клиентов: accounting, actionCenter, adGroups, amazonAds, automation, calendar, localRoyalty, negativeLists, royalties, targets, tasks.

Новые компоненты: AddAdGroupModal, AddCampaignModal, AddTargetModal, AmazonAdsSection, CalendarBell, LoginScreen, NegativeListsTab, UpdateChecker; `components/dashboard/` (5 файлов); `components/reports/BreakdownTab.tsx`; `components/ui/{EditableNumber,KpiDelta}.tsx`; новый `__tests__/` подкаталог.

Новые контексты: ThemeContext + `contexts/__tests__/`.

Новые lib: `useDeepLink.ts`.

Main: `src/main/local-db/` (index.ts + royalty.ts), `src/main/updater.ts`.

Docs: `docs/electron-migration/parity-plan.md`, `NEXT-SESSION-PROMPT.md`, `NEXT-SESSION-PROMPT-v2.md`, `RUFLO-USAGE.md`.

Прочее: `.claude/`, `.mcp.json`, `assets/`, `index.js`.

**Резюме:** все фазовые changes сидят в working tree, ни одного коммита. `parity-plan.md` пишет 84/84 тестов зелёных, `tsc/lint/package` чистые — но всё это untracked. Перед любым merge/PR нужен squash в conventional-style коммит(ы) по фазам, иначе ревью 100+ файлов одним diff'ом.
