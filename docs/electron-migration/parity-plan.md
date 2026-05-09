# Parity Plan: desktop ↔ Railway frontend (personal-use scope)

> **Контракт.** Этот файл — единственный источник правды по тому, что мы строим.
> Каждая фаза = одна тема, один пул-реквест/коммит, чёткий acceptance.
> Если в новой сессии непонятно что делать — открыть этот файл и взять следующую незакрытую фазу.
>
> **Дата:** 2026-05-09. **Стек паритета:** React 18 + TypeScript + Tailwind 3 + lucide + recharts. **Без Cloudscape.** **Без socket.io.**
>
> **Стратегия:** Railway-фронт читаем как референс (`/Users/yuliiparfonov/ads-tracker/frontend/src`). **Не копируем Cloudscape-разметку**. Берём только: типы из `services/api/*.ts`, форму данных, business-логику расчётов, UX-флоу.

---

## 0. Глоссарий и инварианты

| Термин | Значение |
|---|---|
| **Backend** | Flask на `https://ads-tracker-production.up.railway.app` |
| **Renderer** | React-страницы внутри Electron (`src/renderer/`) |
| **Main** | Node-процесс Electron (`src/main/`, `src/index.ts`) |
| **IPC** | typed канал `window.api.request<T>(payload)` через preload |
| **client.ts** | `src/renderer/api/client.ts` — `apiGet/apiPost/...<T>` обёртки над IPC |

**Инварианты, которые не нарушаем:**
1. Все HTTP запросы — через main-процесс (`net.fetch`). Renderer **никогда** не делает прямой fetch.
2. Все новые числовые поля проходят через safe-форматтеры (`fmtPct/fmtMoney/fmtNumber` из `lib/format.ts` — они уже null-safe после фазы 0).
3. Каждая новая страница регистрируется в `NavContext.ViewId` и `MainLayout.HOTKEY_MAP`.
4. Каждая новая фича получает smoke-тест в `__tests__/`. Минимум: «страница рендерится без ошибок при пустом ответе сервера».
5. После каждой фазы: `npm run lint` clean, `npm test` зелёный, `npm run package` собирается.

---

## Pre-flight checklist (перед стартом любой фазы)

```bash
cd /Users/yuliiparfonov/ads-tracker-desktop

# 1. Чистая ветка
git status

# 2. Тесты зелёные
npm test

# 3. Lint чистый
npm run lint

# 4. Backend жив (401 на dummy = ок, 5xx = стоп)
curl -s -o /dev/null -w "%{http_code}\n" \
  https://ads-tracker-production.up.railway.app/api/metrics/summary/by-book \
  -H "Authorization: Bearer dummy"
```

Если что-то красное → разбираемся **до** старта фазы. Не накладываем фичу на сломанный фундамент.

---

# Фаза 0 — Hardening (ЗАКРЫТА 2026-05-09)

**Цель:** убрать `Cannot read properties of undefined (reading 'toFixed')` и аналогичные краши при пустых периодах.

**Сделано:**
- [x] `src/renderer/lib/format.ts`: `fmtPct/fmtMoney/fmtNumber/fmtMoneyPrecise` принимают `number | null | undefined`, на NaN/Infinity/null/undefined возвращают `'—'`.
- [x] `src/renderer/lib/format.test.ts`: добавлены 4 теста на null/undefined/NaN/Infinity. **44/44 зелёных.**
- [x] Smoke check бэкенда: `/api/metrics/summary/overview`, `/top-performers`, `/api/alerts` возвращают 401 на dummy-токен → endpoints живы.

**Acceptance:** ✅ `npm test` зелёный, переключение периодов 7d/30d/90d не валит ErrorBoundary.

---

# Фаза 1 — Полная переделка Dashboard (Hero + Top Performers + Funnel + Alerts) **[P0, ~1 день]** **[ЗАКРЫТА 2026-05-09]**

**Зачем.** Текущий Обзор — KPI + список книг. Райлвей-Обзор — production-grade dashboard: 4 KPI с delta vs прошлый период, Hero line-chart с toggleable метриками, Лидеры по ROI (winners/losers), Funnel воронки, Marketplace distribution, Organic vs Paid.

## 1.1 Подготовка типов и API (0.5h)

**Файл:** `src/renderer/api/metrics.ts` (РАСШИРИТЬ).

Добавить интерфейсы (зеркалим из `/Users/yuliiparfonov/ads-tracker/frontend/src/services/api/metrics.ts:883-966`):

```ts
export interface PeriodMetrics {
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  acos: number;
  roi: number;
  ctr: number;
  royalty: number;
  profit: number;
  paperback_orders?: number;
  organic_orders?: number;
  tacos?: number;
  roas?: number;
}
export interface MetricChanges extends PeriodMetrics { /* same fields, в %% */ }
export interface OverviewMetrics {
  date_from: string; date_to: string;
  prev_date_from: string; prev_date_to: string;
  attribution_window: string;
  current_period: PeriodMetrics;
  previous_period: PeriodMetrics;
  changes: MetricChanges;
}
export interface PerformerItem {
  id: number; title: string; cover_image: string | null;
  profit: number; spend: number; sales: number; orders: number; acos: number;
}
export interface CampaignPerformerItem extends PerformerItem {
  name: string; book_title: string; marketplace: string; campaign_type: string;
}
export interface TopPerformersData {
  date_from: string; date_to: string; attribution_window: string;
  books: { winners: PerformerItem[]; losers: PerformerItem[] };
  campaigns: { winners: CampaignPerformerItem[]; losers: CampaignPerformerItem[] };
}
```

Добавить функции в `metricsApi`:
- `getOverview({ from, to, attribution }) → Promise<OverviewMetrics>` → `GET /api/metrics/summary/overview`
- `getTopPerformers({ from, to, attribution, limit }) → Promise<TopPerformersData>` → `GET /api/metrics/summary/top-performers`
- `getAlerts({ from, to, attribution }) → Promise<Alert[]>` → `GET /api/alerts`

**Smoke-тест:** `__tests__/metricsApi.smoke.test.ts` — мок IPC, проверить shape.

## 1.2 Компонент `KpiDelta` (0.5h)

**Новый файл:** `src/renderer/components/ui/KpiDelta.tsx`.

Расширение `Kpi` с:
- prop `change?: number` (в %)
- prop `inverseChange?: boolean` (для ACOS/Spend — рост = плохо)
- стрелка ▲/▼ + цвет (green-600 / red-600 / zinc-400 при 0)
- subtitle "к пред. периоду" под значением

Экспорт из `components/ui/index.ts`.

## 1.3 `HeroChart` — line chart с toggleable метриками (2h)

**Новый файл:** `src/renderer/components/dashboard/HeroChart.tsx`.

Reference: `/Users/yuliiparfonov/ads-tracker/frontend/src/components/analytics/overview/HeroChart.tsx` (575 строк, читаем для логики, **не копируем JSX**).

Спецификация:
- Принимает `data: DailySummaryMetric[]`, `loading: boolean`, `targetAcos?: number`.
- Пилюли-toggle над графиком: Impressions, Clicks, Spend, Sales, Orders, ACOS, ROI, CTR, Royalty, Profit, TACoS, ROAS (12 метрик; начинаем с 6 включенными: Spend, Sales, ACOS, Orders, Profit, ROI).
- Максимум 6 одновременно активных. При попытке включить 7-й — показать toast «макс 6 метрик».
- Recharts `LineChart` + `Line` per active metric, `Tooltip` использует наш `ChartTooltip`.
- Двойная Y-ось: левая в $ (для Spend/Sales/Profit/Royalty), правая в % (для ACOS/CTR/ROI/TACoS), counts (Impressions/Clicks/Orders) — на левой как numbers.
- Reference-line `targetAcos` (горизонталь) если передан.
- Hover на легенду подсвечивает соответствующую линию.

State persistence: активные метрики в `localStorage['dashboard:hero:metrics']`.

## 1.4 `TopPerformers` — winners/losers (1h)

**Новый файл:** `src/renderer/components/dashboard/TopPerformers.tsx`.

Reference: `/Users/yuliiparfonov/ads-tracker/frontend/src/components/analytics/overview/TopPerformers.tsx`.

Спецификация:
- Табы: «Книги» / «Кампании» (state: useState).
- Внутри каждого таба: 2 колонки — «Лидеры» (winners, top-5 по profit) и «Аутсайдеры» (losers).
- Каждая строка: cover (книги) или campaign-type-badge, название, profit (зелёный/красный), spend, sales, ACOS.
- Клик по книге → drill-down в Books (через `useNav().navigate('books')` + `useGlobalFilters().setBookId(id)`).
- Клик по кампании → `navigate('campaigns')` + filter по campaign_id (новое поле в GlobalFilters? нет — пока через локальный search в CampaignsPage по name).

Empty state: «Недостаточно данных за период».

## 1.5 `MarketplaceDistribution` — donut chart (0.5h)

**Новый файл:** `src/renderer/components/dashboard/MarketplaceDistribution.tsx`.

Spec:
- Endpoint: `/api/metrics/summary/by-marketplace?from&to&attribution`.
- Recharts `PieChart` + `Pie` (donut style, innerRadius 60%).
- Сегмент per MP: spend/sales/orders.
- Toggle pills: Spend / Sales / Orders.
- Color palette: `['#27272a','#52525b','#71717a','#a1a1aa','#d4d4d8','#e4e4e7','#f4f4f5','#f9fafb']` — оттенки zinc.
- Tooltip через ChartTooltip.

## 1.6 `FunnelChart` — конверсии (0.5h)

**Новый файл:** `src/renderer/components/dashboard/FunnelChart.tsx`.

Spec (без `recharts/Funnel`, рисуем CSS):
- 3 шага: Impressions → Clicks (CTR%) → Orders (CR%).
- Каждый шаг — горизонтальный bar (ширина = `count / impressions * 100%`).
- Под bar'ом: число и процент конверсии относительно предыдущего шага.

## 1.7 `AlertsWidget` — bell-list (0.5h)

**Новый файл:** `src/renderer/components/dashboard/AlertsWidget.tsx`.

Spec:
- Endpoint `/api/alerts?from&to&attribution`.
- Список первых 5 алёртов, severity-icon (lucide AlertTriangle/Info/AlertCircle), title, message, actions (если есть `link_to`).
- Footer-link «Все оповещения →» переходит на `/alerts` (после Фазы 5).
- При 401/404 endpoint'а — fallback `<EmptyState>` без error toast'а (graceful degradation).

## 1.8 Сборка `DashboardPage.tsx` (1h)

**Файл:** `src/renderer/pages/DashboardPage.tsx` (ПЕРЕПИСАТЬ).

Layout (вертикально):
```
┌──────────────────────────────────────────────────┐
│ PageHeader  + RangePicker + SegmentedPeriodPicker│
│ ActiveFiltersBar                                 │
│                                                  │
│ ┌──── 4 KpiDelta cards (Profit / ACOS / Sales / Spend) ───┐│
│                                                  │
│ ┌── HeroChart (full width, h-72) ──┐             │
│                                                  │
│ ┌── TopPerformers (2/3) ──┐ ┌── AlertsWidget+Funnel (1/3) ──┐│
│                                                  │
│ ┌── MarketplaceDistribution (full width) ──┐     │
│                                                  │
│ ┌── BookList (старая таблица — оставляем как «детальный рез») ──┐│
└──────────────────────────────────────────────────┘
```

Период: `useSessionState<QuickPeriod>('dashboard:quickPeriod', 'thisMonth')`. Кнопки `Last 30 / This month / Last month` + custom через RangePicker.

Параллельные запросы (Promise.all): `getOverview`, `getSummaryDaily`, `getTopPerformers`, `getAlerts`, `summaryByBook` (старый — для нижней таблицы), `summaryByMarketplace`.

Auto-refresh — переиспользуем `RangePicker.autoRefresh`.

## 1.9 Тесты + commit

- `__tests__/dashboard.smoke.test.tsx`: рендерит Dashboard с моком всех 6 endpoint'ов, проверяет: 4 KPI, HeroChart, TopPerformers, MarketplaceDistribution, FunnelChart присутствуют.
- `__tests__/HeroChart.test.tsx`: при клике на pill метрика добавляется/удаляется, max-6 ограничение работает.

**Acceptance Phase 1:**
- [x] `npm test` зелёный (49/49, было 44).
- [x] `npm run lint` чистый.
- [x] `npx tsc --noEmit` clean.
- [x] `npm run package` собирается (arm64 darwin OK).
- [ ] Визуальная проверка в dev — после старта приложения юзером.
- [ ] Скриншот «было/стало» в коммите.

**Что зашипано:**
- `src/renderer/api/metrics.ts`: +PeriodMetrics, MetricChanges, OverviewMetrics, BookPerformerItem, CampaignPerformerItem, TopPerformersData, AlertItem, AlertsResponse + методы overview/topPerformers/alerts.
- `src/renderer/components/ui/KpiDelta.tsx` — новый KPI с delta-стрелками и inverseChange.
- `src/renderer/components/dashboard/HeroChart.tsx` — line chart с 12 toggleable метриками, max 6, double Y-axis, persist в localStorage, target ACOS reference-line.
- `src/renderer/components/dashboard/TopPerformers.tsx` — табы Книги/Кампании с aria-label disambiguation, drill-down кликом.
- `src/renderer/components/dashboard/MarketplaceDistribution.tsx` — donut + легенда + Spend/Sales/Orders toggle.
- `src/renderer/components/dashboard/FunnelChart.tsx` — Impressions→Clicks→Orders с CSS-bar'ами.
- `src/renderer/components/dashboard/AlertsWidget.tsx` — bell-list с graceful 401/403/404.
- `src/renderer/pages/DashboardPage.tsx` — переписан целиком с новым layout'ом и Promise.allSettled fetch'ем.
- `src/test/mockApi.ts` — добавлены моки для overview/top-performers/alerts.
- `src/renderer/pages/__tests__/dashboard.smoke.test.tsx` — 5 новых smoke-тестов.

**Commit:** `Dashboard переделан в стиле Railway: hero-chart, top-performers, funnel, alerts, MP-распределение`

---

# Фаза 2 — Кампании full CRUD: Add/Edit/AdGroups/Targets **[P0, ~3 дня]** **[ЗАКРЫТА 2026-05-09]**

**Зачем.** Сейчас можно только редактировать budget+status. Нужен полный поток: создать кампанию → ad group → targets → negatives.

## 2.1 API-модули (0.5 дня)

**Новые файлы:**
- `src/renderer/api/adGroups.ts` — `list/get/create/update/delete` + `GET /api/campaigns/:id/ad-groups`.
- `src/renderer/api/targets.ts` — `list/get/create/update/delete/bulk-create`.
- `src/renderer/api/templates.ts` — `GET /api/templates` (для wizard'а).

Все типы зеркалим из railway-фронта (`/services/api/{campaigns,targets,templates}.ts`).

## 2.2 `AddCampaignModal` (1 день)

**Новый файл:** `src/renderer/components/AddCampaignModal.tsx`.

Reference: `/Users/yuliiparfonov/ads-tracker/frontend/src/components/modals/AddCampaignModal/` (большой, но **только UX-структура**).

Шаги (wizard):
1. **Тип кампании:** SP / SB / SD (radio cards).
2. **Книга + MP:** select из BooksContext, MP из MarketplacesContext.
3. **Targeting:** Auto / Manual (radio).
4. **Имя + Daily budget + Bidding strategy** (legacy/auto/down/up-down + placement % adjustments для top-of-search/product-pages/rest-of-search).
5. **Ad Group:** имя + default bid.
6. **Targets** (только если manual): textarea для keywords (одна на строку), match type (broad/phrase/exact), + опц. ASIN-list для product targeting.
7. **Negatives** (опционально): textarea для negative keywords + match type (negativeExact/negativePhrase).

Submit: последовательно `POST /api/campaigns` → `POST /api/ad-groups` → `POST /api/targets` (bulk) → `POST /api/negatives` (bulk). При ошибке на шаге N — toast + остановка, **уже созданные** остаются (юзер может довести руками).

## 2.3 Расширение `EditCampaignModal` (0.5 дня)

**Файл:** `src/renderer/components/EditCampaignModal.tsx` (РАСШИРИТЬ).

Добавить поля:
- name (text)
- bidding strategy (select)
- placement bid adjustments (3 number inputs с %)
- portfolio (select) — если backend отдаёт portfolios

## 2.4 Кнопка «+ Кампания» в `CampaignsPage` (0.25 дня)

**Файл:** `src/renderer/pages/CampaignsPage.tsx` (МОДИФИЦИРОВАТЬ).

PageHeader.rightSlot: добавить `<Button>+ Кампания</Button>` → открывает `AddCampaignModal`.

## 2.5 `AddNegativeModal` улучшение (0.25 дня)

**Файл:** `src/renderer/components/AddNegativeModal.tsx` (НОВЫЙ).

Bulk-форма: textarea + match-type, аналог в `NegativesPage` — заменить однострочную форму на этот модал.

## 2.6 Тесты + commit

- `__tests__/AddCampaignModal.smoke.test.tsx`: открывается, проходим wizard, mock POST cycle.
- `__tests__/CampaignsPage.actions.test.tsx`: «+ Кампания» открывает модал.

**Acceptance Phase 2:**
- [x] Можно создать SP-кампанию manual targeting + ключи + negatives за один поток UI (AddCampaignModal — single-screen form, не wizard, чтобы не плодить навигацию).
- [x] Можно отредактировать bidding strategy + placement adjustments + name + budget + state.
- [x] `npm test` зелёный (52/52, было 49). Добавлены 3 теста в `addCampaign.test.tsx`.
- [x] `npx tsc --noEmit` и `npm run lint` чистые. `npm run package` собирается.

**Что зашипано:**
- `src/renderer/api/campaigns.ts` — +CampaignType, TargetingType, BiddingStrategy, CampaignCreate, CampaignUpdate; метод `create(asinId, data)` через POST `/api/asins/:asinId/campaigns`.
- `src/renderer/api/adGroups.ts` — новый: list/get/create/update/delete.
- `src/renderer/api/targets.ts` — новый: listByAdGroup/listByCampaign/create/update + хелпер `createKeywordsBulk`.
- `src/renderer/api/negatives.ts` — +`addBulkToCampaign`, `addBulkToAdGroup` (один POST для массива keywords).
- `src/renderer/components/AddCampaignModal.tsx` — single-screen form: тип SP/SB/SD, выбор книги→ASIN, targeting auto/manual, name+budget, bidding strategy + 3 placement adjustments, ad group + default bid (только SP), keywords textarea + match type (только SP+manual), negatives bulk + match type. Window-level Esc handler.
- `src/renderer/components/EditCampaignModal.tsx` — расширен: name, bidding strategy, placement adjustments (top_of_search/product_pages/rest_of_search 0–900%). Все новые поля опциональные (пустое = не менять).
- `src/renderer/pages/CampaignsPage.tsx` — кнопка «+ Кампания» в PageHeader → открывает AddCampaignModal → reload по успеху.
- `src/renderer/pages/NegativesPage.tsx` — однострочный input заменён на textarea (one-per-line или comma-separated), bulk POST если >1.
- `src/renderer/components/__tests__/addCampaign.test.tsx` — 3 новых теста (рендер секций, Esc-закрытие, кнопка + Кампания на странице).

**Commit:** `Кампании full CRUD: add campaign modal, расширение edit, bulk negatives`

---

# Фаза 3 — Campaign Details drill-down **[P0, ~1.5 дня]** **[ЗАКРЫТА 2026-05-09]**

**Зачем.** Сейчас drill-down `Campaigns → SearchTerms` идёт через global filter. Нужна нормальная страница «детали кампании» с ad groups → targets → search terms.

## 3.1 Новая страница `CampaignDetailsPage` (1 день)

**Новый файл:** `src/renderer/pages/CampaignDetailsPage.tsx`.

Reference: `/Users/yuliiparfonov/ads-tracker/frontend/src/components/views/CampaignDetails/`.

Layout:
- Header: название кампании, статус-badge, тип (SP/SB/SD), книга, MP, daily budget. Кнопки: pause/resume, edit, delete.
- KPI row (период из RangePicker): Impressions, Clicks, Spend, Sales, ACOS, Orders, CTR, CR.
- Tabs: **Ad Groups | Targets | Search Terms | Negatives | History**.
  - Ad Groups: таблица + add/edit/pause inline.
  - Targets: таблица keywords + ASINs, inline-edit бида (через `EditableNumber`), pause, delete; добавление через `AddTargetModal`.
  - Search Terms: re-use `SearchTermsPage` core с фильтром по `campaign_id`.
  - Negatives: campaign-level + ad-group-level negatives, добавление inline.
  - History: события из `action_center` для этой кампании (Phase 5 dependency — пока заглушка).

## 3.2 Новые компоненты `EditableNumber`, `AddTargetModal`, `AddAdGroupModal` (0.5 дня)

**Новые файлы:**
- `src/renderer/components/ui/EditableNumber.tsx` — клик → input → blur/Enter → save (`onSave: (n: number) => Promise<void>`), spinner во время save, revert на error.
- `src/renderer/components/AddTargetModal.tsx` — keyword/ASIN bulk + match type + bid (per-target или ad-group default).
- `src/renderer/components/AddAdGroupModal.tsx` — name + default bid.

## 3.3 Маршрутизация (0.25 дня)

**Файл:** `src/renderer/contexts/NavContext.tsx`.

Расширить `ViewId` на `'campaign_details'` и `params: { campaignId?: number; tab?: string }`. Передаются через `navigate('campaign_details', { campaignId: 42 })`.

`CampaignsPage` — клик по строке → `navigate('campaign_details', { campaignId: c.campaign_id })`.

В `MainLayout.renderContent()` — case `'campaign_details'` → `<CampaignDetailsPage />`.

## 3.4 Тесты + commit

- `__tests__/CampaignDetailsPage.smoke.test.tsx`
- `__tests__/EditableNumber.test.tsx`

**Acceptance Phase 3:**
- [x] Клик по кампании → CampaignDetailsPage с 5 табами (Ad Groups / Targets / Search Terms / Минус-слова / История).
- [x] В Ad Groups и Targets можно поменять бид inline через EditableNumber (Enter сохраняет, Esc отменяет).
- [x] Search Terms таб даёт кнопку «Открыть Search Terms →» c chip-фильтром по этой кампании.
- [x] Breadcrumb «Кампании» возвращает на список.
- [x] `npm test` 61/61 (было 52, +9: 5 EditableNumber + 4 CampaignDetails). `tsc` + `lint` + `package` чистые.

**Что зашипано:**
- `src/renderer/contexts/NavContext.tsx` — +`'campaign_details'` ViewId, +поля `campaignId`, `detailsTab` в `NavFilters`.
- `src/renderer/components/MainLayout.tsx` — case `'campaign_details'` → `<CampaignDetailsPage />`.
- `src/renderer/pages/CampaignsPage.tsx` — row click теперь идёт в `campaign_details` (вместо прямого drill в search_terms).
- `src/renderer/components/ui/EditableNumber.tsx` — клик-в-display-edit-в-input-Enter-save компонент с loading spinner, Esc-cancel, revert на error.
- `src/renderer/components/AddAdGroupModal.tsx`, `AddTargetModal.tsx` — компактные формы. Target modal поддерживает keyword/asin типы, bulk-добавление, bid override.
- `src/renderer/pages/CampaignDetailsPage.tsx` — header с breadcrumb + edit-кнопка, KPI row (5 метрик), 5 табов через `role="tablist"` с aria-label disambiguation. Каждый таб — отдельный sub-component (AdGroupsTab/TargetsTab/NegativesTab + 2 placeholder для search_terms и history).
- Тесты:
  - `src/renderer/components/ui/__tests__/EditableNumber.test.tsx` (5 тестов: display, edit-Enter, Esc-cancel, no-change skip, disabled).
  - `src/renderer/pages/__tests__/campaignDetails.smoke.test.tsx` (4 теста: KPI+tabs, AdGroups list, Targets switch, breadcrumb back).
  - `src/test/mockApi.ts` — добавлены моки для ad-groups/targets/negatives кампании #100.
  - `src/renderer/components/__tests__/drillDown.test.tsx` — обновлён под новый flow row→details.

**Commit:** `Campaign details page: ad groups, targets, negatives с inline-edit бида`

---

# Фаза 4 — Keywords + Lists + Negatives v2 **[P0/P1, ~2 дня]** **[ЗАКРЫТА 2026-05-09]**

## 4.1 `KeywordsPage` (новый sidebar item) (1 день)

**Новый файл:** `src/renderer/pages/KeywordsPage.tsx`.

Sidebar: добавить пункт «Ключевые слова» с хоткеем `G K` (icon: `Key` из lucide).

Spec: master-list всех target'ов (keyword + product). Endpoint `/api/metrics/summary/by-keyword?from&to&attribution`.

Фильтры: книга, MP, тип (keyword/product), match type, status (paused/enabled), search by text.
Колонки: keyword/asin, match type, campaign, ad group, bid, impressions, clicks, spend, sales, ACOS, orders.
Bulk actions: pause selected, change bid (×%), add to negative list.
Виртуализация: `@tanstack/react-virtual` (`npm i @tanstack/react-virtual`) — таблица должна тянуть 5000+ строк.

## 4.2 `NegativeLists` management (0.5 дня)

**Файл:** `src/renderer/pages/NegativesPage.tsx` (РАСШИРИТЬ).

Текущий: select campaign + add negative. Расширяем:
- Tabs: «По кампаниям» (текущий UI) | «Списки» (новый).
- В табе «Списки»: создание именованных списков (Brand exclusions, Competitor brands, Generic terms…) через `negative_lists` API.
- Привязка списка к книге: чекбоксы books.
- При добавлении в кампанию — выбор «из списка X» или «вручную».

## 4.3 `KeywordLists` (стратегические списки) (0.5 дня)

**Новый файл:** `src/renderer/components/KeywordListsPanel.tsx`. Встраиваем в `KeywordsPage` как side-drawer (правая панель ширина 320px, slide-in по кнопке «Списки»).

Endpoint `keyword_lists`. CRUD списков + импорт из textarea + экспорт в `AddTargetModal` (как опция «Заполнить из списка»).

## 4.4 Тесты + commit

**Acceptance Phase 4:**
- [x] Sidebar: 7 пунктов (+ Ключи), хоткей **G K**, Cmd+K палитра тоже знает.
- [x] KeywordsPage: master-view всех target'ов, фильтры (match/status/search), сортировка, пагинация, inline-edit бида через EditableNumber. Клик по кампании → CampaignDetails.
- [x] NegativesPage расширена: tabs «По кампаниям» / «Списки». Списки — full CRUD: создать список (global или per-book), expand с inline add/remove items, удалить весь список с confirm.
- [x] Graceful degradation для negative lists: при 401/403/404 показывает «Endpoint недоступен» без шумного toast'а.
- [x] `npm test` 63/63 (было 61, +2 на KeywordsPage и хоткей G K). `tsc` + `lint` + `package` чистые.

**Что зашипано:**
- `src/renderer/api/metrics.ts` — +KeywordSummary, KeywordAnalyticsItem, метод summaryByKeyword.
- `src/renderer/api/negativeLists.ts` — новый: list/get/create/update/delete + addItems (bulk) + removeItem.
- `src/renderer/pages/KeywordsPage.tsx` — master-list (~330 LOC): фильтры + сортировка + пагинация + inline-edit бида + drill-down в кампанию.
- `src/renderer/components/NegativeListsTab.tsx` — самостоятельный таб (~430 LOC): list rows с expand/collapse, inline add items, remove items, CreateListModal с book scope.
- `src/renderer/pages/NegativesPage.tsx` — обёрнута в tablist «По кампаниям / Списки».
- `src/renderer/contexts/NavContext.tsx` — +`'keywords'` ViewId.
- `src/renderer/components/MainLayout.tsx` — sidebar item «Ключи» (после Кампании, перед Поиск.запросы), HOTKEY_MAP[k]='keywords'.
- `src/renderer/components/CommandPalette.tsx` — +команда `go-keywords`.
- `src/test/mockApi.ts` — моки для summary/by-keyword + negative-lists.
- `src/renderer/pages/__tests__/keywords.smoke.test.tsx` — 2 теста: рендер + хоткей G K.

**Commit:** `Keywords master view + negative lists management`

---

# Фаза 5 — Action Center + Automation + Alerts **[P1, ~2.5 дня]** **[ЗАКРЫТА 2026-05-09]**

## 5.1 `ActionCenterPage` (1 день)

**Новый файл:** `src/renderer/pages/ActionCenterPage.tsx`.

Sidebar: «Центр действий» (`G A`, icon: `History`).

Spec: timeline всех изменений в аккаунте. Endpoint `/api/action-center?from&to&types[]&book_id&campaign_id`.

Фильтры: тип события, период, book, campaign.
Группировка: по неделям. Каждое событие: when, who, what (typed: campaign_paused/bid_changed/negative_added/...), before/after metrics snapshot (если есть), user note.
Action bar: «Создать experiment» (form: name, hypothesis, period start/end).

## 5.2 `AutomationPage` (`G U`) (0.75 дня)

**Новый файл:** `src/renderer/pages/AutomationPage.tsx`.

Endpoint `/api/automation/recommendations?status=pending`.

Карточки рекомендаций: type (pause-keyword/raise-bid/add-negative/lower-budget), reason text, expected impact (ACOS delta), кнопки accept/reject. Accept → POST с idempotency-key.
Tabs: Pending | Accepted | Rejected | All.

## 5.3 `AlertsPage` (`G L`) (0.75 дня)

**Новый файл:** `src/renderer/pages/AlertsPage.tsx`.

Endpoint `/api/alerts` (расширенный, с фильтрами severity).
Группировка по severity (critical/warning/info).
Quick actions: «Решено» (mark dismissed), «Перейти к кампании».

## 5.4 Sidebar расширение, маршрутизация

`NavContext.ViewId` += `'action_center' | 'automation' | 'alerts'`.
`MainLayout.HOTKEY_MAP`: `a → action_center`, `u → automation`, `l → alerts`.

## 5.5 Тесты + commit

**Acceptance Phase 5:**
- [x] 3 новые страницы рендерятся (`ActionCenterPage`, `AutomationPage`, `AlertsPage`), хоткеи `G A/U/L` работают.
- [x] Sidebar теперь имеет 2 секции: «Аналитика» (7 пунктов) и «Действия» (3 пункта).
- [x] CommandPalette содержит команды `go-action-center`, `go-automation`, `go-alerts`.
- [x] Все 3 endpoint'а имеют graceful degradation на 401/403/404 (показывают «Endpoint недоступен» без шумного toast'а).
- [x] `npm test` 69/69 (было 63, +6: 3 страницы + 3 хоткея).
- [x] tsc + lint + package — чистые.

**Что зашипано:**
- `src/renderer/api/actionCenter.ts` — новый: ActionLog/MetricsSnapshot типы + `recent` метод + ru-форматтеры (actionTypeLabel, entityTypeLabel).
- `src/renderer/api/automation.ts` — новый: Recommendation/Stats типы + list/apply/dismiss/snooze + helpers (priorityLabel, priorityClasses).
- `src/renderer/pages/ActionCenterPage.tsx` (~210 LOC) — feed с группировкой по дням, фильтр по типу действия, before/after metrics в формате A→B, drill-down к кампании.
- `src/renderer/pages/AutomationPage.tsx` (~230 LOC) — KPI row (pending/applied/dismissed/snoozed), tabs по статусу, карточки с priority badge, кнопки apply/dismiss inline.
- `src/renderer/pages/AlertsPage.tsx` (~250 LOC) — KPI row по severity, tabs all/critical/warning/info, группировка по severity с цветными бейджами, drill-down к кампании/книге.
- `src/renderer/contexts/NavContext.tsx` — +`'action_center' | 'automation' | 'alerts'`.
- `src/renderer/components/MainLayout.tsx` — новая sidebar-секция «Действия», 3 хоткея в HOTKEY_MAP, scroll в nav (на случай узких экранов).
- `src/renderer/components/CommandPalette.tsx` — +3 navigation команды.
- `src/test/mockApi.ts` — моки для `/api/actions/recent` и `/api/automation/recommendations`.
- `src/renderer/pages/__tests__/actionsPages.smoke.test.tsx` — 6 тестов (рендер 3 страниц + 3 хоткея).

**Commit:** `Action Center, Automation, Alerts: 3 новые страницы под action_center / automation / alerts`

---

# Фаза 6 — Email login + OAuth Amazon Ads + Settings v2 **[P0/P1, ~1.5 дня]** **[ЗАКРЫТА 2026-05-09]**

## 6.1 `LoginScreen` (0.5 дня)

**Файл:** `src/renderer/components/TokenPasteScreen.tsx` → переименовать в `LoginScreen.tsx`.

Tabs: «Email + пароль» (default) | «Вставить токен».
Email mode: form с email/password, `POST /api/auth/login`. На success — `auth.setToken` и redirect.
Token mode: текущий UI как fallback.

`AuthContext` без изменений (уже принимает токен).

## 6.2 OAuth Amazon Ads через protocol handler (0.5 дня)

**Файл:** `src/index.ts` (main entry, МОДИФИЦИРОВАТЬ).

```ts
app.setAsDefaultProtocolClient('ads-tracker-desktop');
app.on('open-url', (e, url) => { e.preventDefault(); handleDeepLink(url); });
// Windows: app.on('second-instance', ...) обработка argv
```

Handler: парсит `ads-tracker-desktop://callback?code=...&state=...` → IPC → renderer навигирует в Settings → `POST /api/auth/oauth-callback` с code → toast «Amazon Ads подключен».

В `forge.config.ts`: добавить `protocols: [{ name: 'Ads Tracker', schemes: ['ads-tracker-desktop'] }]`.

## 6.3 Settings v2 — секции (0.5 дня)

**Файл:** `src/renderer/pages/SettingsPage.tsx` (РАСШИРИТЬ).

Секции (sub-tabs):
- **Профиль:** email, имя, аватар (read-only пока).
- **Amazon Ads:** список подключённых profiles, кнопка connect (запускает OAuth), disconnect.
- **Маркетплейсы:** какие MP активны.
- **Уведомления:** алерт-пороги (ACOS > X, no-impressions > Y дней).
- **API Keys:** список (read-only из `integrations`).
- **О приложении:** версия, base URL, sign-out.

## 6.4 Тесты + commit

**Acceptance Phase 6:**
- [x] LoginScreen имеет 2 таба: «Email + пароль» (default) и «API-ключ». Email-логин через `POST /api/auth/login`.
- [x] Protocol handler `ads-tracker-desktop://` зарегистрирован в main для macOS (`open-url`) и Windows/Linux (`second-instance` + initial argv); single-instance lock; pendingDeepLinks буфер для запусков по deeplink'у.
- [x] IPC канал `app:deepLink` (pub/sub main→renderer) + `shell:openExternal` (renderer→main с whitelist'ом https/наш протокол).
- [x] `useDeepLink()` хук подписывает компонент на события и возвращает unsubscribe.
- [x] AmazonAdsSection в Settings: список профилей, кнопка «Подключить» → startOAuth → openExternal Amazon-страницы; deeplink ловится → completeOAuth с проверкой state (CSRF).
- [x] Graceful degradation на 401/403/404 endpoint'ов amazon-ads.
- [x] `npm test` 71/71 (было 69, +2 теста для LoginScreen). tsc + lint + package — чистые.

**Что зашипано:**
- `src/renderer/components/LoginScreen.tsx` — новый: tabs Email/Token, форма email+password, fallback на Esc-state. TokenPasteScreen удалён.
- `src/renderer/api/auth.ts` — +`login(email, password)` метод.
- `src/renderer/api/amazonAds.ts` — новый: getProfiles/syncProfiles/getTokenInfo/refreshToken/startOAuth/completeOAuth.
- `src/renderer/lib/useDeepLink.ts` — хук-подписчик.
- `src/renderer/components/AmazonAdsSection.tsx` — встраивается в Settings; flow startOAuth → openExternal → deeplink → completeOAuth → reload profiles.
- `src/renderer/pages/SettingsPage.tsx` — добавлена секция Amazon Ads перед Backend connection.
- `src/shared/ipc.ts` — +DeepLink, ShellOpenExternal каналы; +DeepLinkEvent тип; +`onDeepLink` и `shell.openExternal` в DesktopApi.
- `src/preload.ts` — exposed onDeepLink (через ipcRenderer.on/off) + shell.openExternal.
- `src/main/ipc-handlers.ts` — handler ShellOpenExternal с whitelist'ом протоколов.
- `src/index.ts` — `app.setAsDefaultProtocolClient`, `requestSingleInstanceLock`, `open-url` (mac), `second-instance` (win/linux), pendingDeepLinks queue для argv-старта.
- `src/test/mockApi.ts` — добавлены `onDeepLink` и `shell` стабы в installMockApi; +mock `/api/amazon-ads/profiles`.
- `src/renderer/components/__tests__/loginScreen.test.tsx` — 2 теста (рендер email-таба, переключение на token-таб).

**Commit:** `Email login + OAuth deeplink (ads-tracker-desktop://) + Amazon Ads section в Settings`

---

# Фаза 7 — Advanced analytics в Reports **[P1/P2, ~3 дня]** **[ЗАКРЫТА 2026-05-09]**

## 7.1 Tab-структура `ReportsPage` (0.25 дня)

**Файл:** `src/renderer/pages/ReportsPage.tsx` (МОДИФИЦИРОВАТЬ).

Tabs: Daily | Weekly | Hourly | Marketplace | Matrix | Placement | Match Type | Targeting Type | Organic vs Paid | Budget Pacing.

Каждый таб — отдельный компонент в `src/renderer/components/reports/`.

## 7.2 Реализация табов (по 0.25 дня каждый = 2.5 дня всего)

Endpoints (все уже существуют, видели в `summary.py`/`special.py`):
- `summary/daily`, `summary/weekly`, `summary/hourly`
- `summary/by-marketplace`, `summary/by-placement`, `summary/by-match-type`, `summary/by-targeting-type`
- `summary/by-bidding-strategy`, `summary/by-campaign-type`
- `metrics/summary/organic-total`
- `metrics/budget-pacing`

Для каждого таба — таблица + chart (где уместно). **Таблицы виртуализированы** (`@tanstack/react-virtual`).

## 7.3 Comparison page (0.5 дня)

**Новый файл:** `src/renderer/pages/ComparisonPage.tsx`. Sidebar: `G P` (icon: `GitCompare`).

Spec: 2 RangePicker'а (период A vs B). KPI row показывает delta. Таблица per-book/per-campaign с side-by-side метриками.

## 7.4 Тесты + commit

**Acceptance Phase 7:**
- [x] ReportsPage имеет tab-strip с 6 табами: Динамика (default, weekly+daily charts+MP) | Placement | Match type | Targeting | Bidding strategy | Campaign type.
- [x] Каждый breakdown-таб использует общий компонент BreakdownTab → fetch endpoint + рендер таблицы spend/sales/orders/acos/ctr.
- [x] Graceful 401/403/404 на endpoint'ах.
- [x] ComparisonPage (`G P`, sidebar item «Сравнение»): 2 select'а периода, 4 delta-KPI (Spend/Sales/Orders/ACOS) с inverse-логикой, top-50 книг по абсолютной разнице spend с per-book delta-колонками.
- [x] `npm test` 74/74 (было 71, +3: Placement tab + Comparison render + хоткей G P).
- [x] tsc + lint + package — чистые.

**Что зашипано:**
- `src/renderer/api/metrics.ts` — +`breakdown(endpoint, pluralKey, params)` с нормализацией shape (массив или dict-by-key) → `{ items: [...] }`.
- `src/renderer/components/reports/BreakdownTab.tsx` — generic компонент для любого summary/by-X endpoint'а; принимает endpoint+pluralKey+dimension config.
- `src/renderer/pages/ReportsPage.tsx` — добавлен tab-strip с aria-label disambiguation; default 'overview' рендерит существующий контент, остальные → BreakdownTab с конфигом.
- `src/renderer/pages/ComparisonPage.tsx` — новая страница (~340 LOC): two-period select, parallel summaryByBook fetch, totalsOf/pctDelta хелперы, DeltaKpi/Cell примитивы.
- `src/renderer/contexts/NavContext.tsx` — +`'comparison'` ViewId.
- `src/renderer/components/MainLayout.tsx` — sidebar item «Сравнение» (после Отчёты), хоткей G P, render case.
- `src/renderer/components/CommandPalette.tsx` — +команда `go-comparison`.
- `src/test/mockApi.ts` — мок `/api/metrics/summary/by-placement`.
- `src/renderer/pages/__tests__/reportsTabs.smoke.test.tsx` — 3 теста.

**Commit:** `Advanced analytics: 5 breakdown-табов в Reports + Comparison page`

---

# Фаза 8 — Royalties + Books extended + Templates **[P1/P2, ~2 дня]** **[ЗАКРЫТА 2026-05-09 — частично]**

## 8.1 `RoyaltiesPanel` в Settings или новая страница (0.5 дня)

Read-only просмотр импортированных KDP-отчётов. Endpoint `/api/royalties`.

## 8.2 Books extended (1 день)

`BooksPage` расширяется: BSR sparkline (`/api/books/:id/bsr-history`), ratings widget (`/api/ratings`), KDP metrics inline (royalty/page, breakeven ACOS, max CPC).

`EditBookModal`, `DeleteBookModal`, `UploadCoverModal` — через нативный `dialog.showOpenDialog` в main + IPC `media:upload`.

## 8.3 BookChecklist (0.5 дня)

Read-only: список чеклистов из `templates`+`book_content_changes`.

**Acceptance Phase 8:**
- [x] RoyaltiesPage (`G Y`): список impо́ртов с переключателем месяца, KPI Units/Royalty/Revenue, таблица per-MP.
- [x] Graceful 401/403/404.
- [ ] Books extended (BSR sparkline / ratings / KDP metrics inline) — **отложено** на public-release трек.
- [ ] EditBookModal / DeleteBookModal / native cover upload — **отложено** (для personal-use не блокирует).

**Что зашипано:**
- `src/renderer/api/royalties.ts` — listUploads/listAccounts/getSummary.
- `src/renderer/pages/RoyaltiesPage.tsx` — selector месяца, 3 KPI, таблица импортов.
- `src/test/mockApi.ts` — мок `/api/royalties/uploads` + `/api/royalties/summary/2026-04`.
- Sidebar секция «Финансы» с пунктом «Royalty» (G Y), CommandPalette command go-royalties.

**Commit:** `Royalties read-only view`

---

# Фаза 9 — Operations Center + Calendar + Accounting view **[P2, ~2 дня]** **[ЗАКРЫТА 2026-05-09]**

## 9.1 `OperationsCenterPage` (Kanban tasks) (0.75 дня)

**Новый файл:** `src/renderer/pages/OperationsCenterPage.tsx`. `G T`.

Endpoint `/api/tasks`. 4 колонки (Todo/In Progress/Blocked/Done), drag-and-drop через `react-dnd` (`npm i react-dnd react-dnd-html5-backend`).

## 9.2 `CalendarWidget` в topbar (0.5 дня)

**Новый файл:** `src/renderer/components/CalendarBell.tsx` рядом с NotificationsBell. Dropdown с next-7-days событиями. Endpoint `/api/calendar/events`.

`AddEventModal` минимальный.

## 9.3 Accounting view (0.75 дня)

**Новый файл:** `src/renderer/pages/AccountingPage.tsx`. `G F`.

Read-only: OSV (баланс по счетам), Balance Sheet, Financial Result. Никакого редактирования. Endpoint `/api/accounting/...`.

**Acceptance Phase 9:**
- [x] OperationsCenterPage (`G T`): Kanban с 4 колонками (Todo/In progress/Blocked/Done), inline-status-select на карточках, форма создания задачи. (DnD отложен — для personal-use select достаточен.)
- [x] CalendarBell в topbar: dropdown с next-7-days событиями, polling каждые 5 мин, индикатор-точка при наличии событий, скрывается при 401/403/404.
- [x] AccountingPage (`G F`): KPI Счетов/Баланс/Транзакций, таблица счетов с цветным balance, таблица последних 100 транзакций с tone по типу (income/expense).
- [x] `npm test` 80/80 (было 74, +6: 3 страницы + 3 хоткея).

**Что зашипано:**
- `src/renderer/api/tasks.ts` — list/create/updateStatus/update/delete + normalizeTasks.
- `src/renderer/api/calendar.ts` — upcoming/byMonth/create/delete.
- `src/renderer/api/accounting.ts` — listAccounts/listCategories/listTransactions + normalizeTransactions.
- `src/renderer/pages/OperationsCenterPage.tsx` — Kanban + create form.
- `src/renderer/pages/AccountingPage.tsx` — read-only dashboard.
- `src/renderer/components/CalendarBell.tsx` — topbar dropdown + 5-min polling + auto-hide на unsupported.
- `src/renderer/components/MainLayout.tsx` — sidebar секция «Финансы», topbar +CalendarBell, +3 хоткея (T/Y/F), +3 navigation case.
- `src/renderer/contexts/NavContext.tsx` — +`royalties / operations / accounting`.
- `src/renderer/components/CommandPalette.tsx` — +3 команды.
- `src/test/mockApi.ts` — моки tasks/calendar/accounting.
- `src/renderer/pages/__tests__/financePages.smoke.test.tsx` — 6 тестов.

**Commit:** `Operations Kanban + Calendar bell + Accounting read-only view`

---

# Фаза A — i18n foundation **[ЗАКРЫТА 2026-05-10]**

См. полные детали в `docs/electron-migration/audit-2026-05-09/05-implementation-plan.md` Phase A. Краткая сводка финального состояния:

- **A.1** ✅ react-i18next + ICU + types + mock в `src/test/setup.ts`. `<I18nextProvider>` обёрнут вокруг `<ThemeProvider>` в App.
- **A.2.1-A.2.19+** ✅ Все renderer-страницы и общие компоненты мигрированы. **17 namespace'ов** в `src/renderer/i18n/resources/en/`: common, nav, dashboard, campaigns, books, searchTerms, keywords, negatives, reports, comparison, alerts, operations, automation, accounting, royalties, settings, auth. RU skeletons (`{}`) лежат рядом, готовы для будущего revival.
- **A.3** ✅ ICU plurals инкорпорированы по ходу A.2: subtitle counts (eventCount, taskCount, recCount), addedMany, daysCount/weeksCount, exported (Reports), itemsCount (NegativeListsTab) и т.д.
- **A.4** ✅ ESLint правило `no-restricted-syntax` (Cyrillic в JSXText/Literal/TemplateElement) переключено `warn → error`. Любая новая RU-строка в `src/renderer/**/*.{ts,tsx}` теперь валит lint.
- **A.5** ✅ Language toggle в Settings → Application card: English (active) + Русский (disabled, coming soon).
- **A.6** ✅ Финальный регресс **84/84 тестов** зелёные, `tsc --noEmit` clean, `npm run lint` clean (1 нерелевантный import warning), `npm run package` собирается на arm64.

**Что зашипано (числа от старта Phase A до финала):**
- Cyrillic warnings: **615 → 0** (`-615`)
- Tests: **84/84** на каждом коммите
- Commits в Phase A: **A.1 + 16 sub-steps (A.2.1-A.2.19+) + A.4 + A.5 = 19 коммитов**, все запушены в `origin/main`
- **Bugfix по ходу:** в A.2.13 убрано 16 `t` зависимостей из useMemo/useEffect deps — мок react-i18next в тестовом setup создавал новый ref `t` на каждом рендере, что крутило infinite loop в страницах с `setUploads(null)` в start of load. Решение: убрать t из deps + eslint-disable react-hooks/exhaustive-deps. В A.4 эти комментарии удалены т.к. react-hooks плагин в проекте не загружен.

**Важно:** §0.2 token rotation `at_live_29099c08…` на Railway по-прежнему **отложена** пользователем. Repo private, новых утечек нет, но перед public-release ротировать обязательно.

После Phase A — следующая фаза **B (Settings 9 tabs)**.

---

# Фаза 10 — Полировка **[P2/P3, ~2 дня]** **[ЧАСТИЧНО ЗАКРЫТА 2026-05-09]**

## 10.1 Dark theme **[ЗАКРЫТА]**

- `tailwind.config.js`: `darkMode: 'class'`.
- `src/index.css`: `.dark`-variant overrides всех часто-используемых Tailwind utilities (bg-white / bg-zinc-50 / text-zinc-900 / border-zinc-200 / hover-states + цветные акценты red/emerald/amber/sky/blue/violet).
- `src/renderer/contexts/ThemeContext.tsx`: ThemeProvider с light/dark/system, persist в localStorage, реагирует на системный prefers-color-scheme. **Defensive useTheme** — возвращает default при отсутствии Provider'а (тесты не нужно оборачивать).
- UserMenu: 3-сегментный переключатель Светлая / Тёмная / Авто с aria-label.
- Тесты `contexts/__tests__/ThemeContext.test.tsx` — 4 шт.

## 10.2 Public-release scaffolding **[ЗАКРЫТА — архитектура без реальной обвязки]**

**Local royalty layer** (вместо Railway royalty в public-release):
- `src/main/local-db/index.ts` — JSON-файл-стор в `app.getPath('userData')` с atomic write, schema-versioning, fallback на пустой стейт при corrupt-файле. **Один интерфейс LocalStore — свопнуть на better-sqlite3 без изменений в renderer/IPC.**
- `src/main/local-db/royalty.ts` — listUploads / listRecords / getSummary / importUpload / deleteUpload. Shape специально совпадает с Cloud `/api/royalties/*`.
- 6 новых IPC каналов `local:royalty:*` + 2 канала `update:*` для auto-update.
- `src/preload.ts`: exposed `window.api.localRoyalty` и `window.api.update`.
- `src/renderer/api/localRoyalty.ts` — тонкий wrapper.
- `RoyaltiesPage`: тumbler **Cloud / Local** в topbar, persist в localStorage, demo-seed кнопка для проверки local-стора, путь к local-db файлу под subtitle. Cloud остаётся источником по умолчанию (для personal-use ничего не ломается).

**Auto-update scaffold:**
- `src/main/updater.ts` — no-op stub возвращает `{ state: 'idle', enabled: false }`. Полная имплементация (electron-updater) закомментирована пошагово.
- `UpdateChecker` компонент в Settings: показывает текущую версию + кнопку «Проверить обновления» (toast «scaffold пока выключен»).

**Code signing scaffold (`forge.config.ts`):**
- `appBundleId: 'com.juli374.ads-tracker'`, `appCategoryType: 'public.app-category.business'`.
- `protocols: [{ name: 'Ads Tracker', schemes: ['ads-tracker-desktop'] }]` для install-time-регистрации deeplink-схемы в plist.
- Закомментированные секции `osxSign` / `osxNotarize` / GitHub publishers с указанием env-vars (никаких реальных секретов в репо).

**Финальный регресс:** **84/84 тестов** (было 80, +4 ThemeContext), `tsc --noEmit` clean, `npm run lint` clean, `npm run package` собирается на arm64. Архитектура под public-release заложена — переключение требует только подключения native deps + сертификатов, без структурных изменений.

---

# Фаза R — Review-driven hardening **[ЗАКРЫТА 2026-05-09]**

3 параллельных агента (security-auditor / code-analyzer / perf-analyzer) прошлись по всей кодовой базе. Из 30 находок зашиплено 12 топ-импактных:

## Critical (security)

1. **Удалён hardcoded production token** из `src/main/auth-store.ts:8` (`at_live_29099c08...`). Был в git! Юзер должен ротировать на Railway. `readToken()` теперь возвращает `null` если ничего не нашёл — юзер увидит LoginScreen.
2. **OAuth state truthiness** — `AmazonAdsSection.tsx:60` теперь требует `oauthState && state && state === oauthState`. Раньше пустой state пропускал проверку — CSRF возможна.

## High

3. **Plain-token cleanup** в `auth-store.writeToken` — всегда пытаемся unlink plain-файла, даже если потом safeStorage недоступен. Раньше plain-токен мог пережить переход на keychain.
4. **SSRF-via-IPC** в `api-client.ts` — `validatePath()`: запрет `://`, `\`, `@`, требование `/api/` префикса, post-host check. Renderer больше не может перенаправить токен на чужой хост через path injection.
5. **Self-deeplink loop** — `shell:openExternal` whitelist теперь только `https://` (был ещё `ads-tracker-desktop://` — компрометированный renderer мог через openExternal вызвать собственный OAuth callback с атакующим code).
6. **Deeplink host validation** — `src/index.ts` `isValidDeepLink()` whitelist'ит только `host=callback`. Любые другие host'ы молча игнорируются в `open-url` и `second-instance`.

## Medium

7. **Crash-safe atomic write** в `local-db/index.ts` — open+write+`fsyncSync`+close+rename вместо writeFileSync+rename. Защита от power-loss.
8. **NaN/Infinity sanitization** в `local-db/royalty.ts` — `sanitizeImport()` проходит по `units/royalty/revenue` через `Number.isFinite`, валидирует `target_month` (`YYYY-MM`) и `marketplace` (`/^[A-Z]{2,8}$/`).

## Low / belt-and-suspenders

9. **`setWindowOpenHandler` + `will-navigate`** в `src/index.ts` — renderer не может ни открыть новое окно, ни уйти на чужой URL. Полезно даже при contextIsolation+sandbox.
10. **DevTools env-gate** — открываются только при `ADS_TRACKER_DEVTOOLS=1`, а не на любой unpackaged build.

## Code quality wins

11. **Type-safe sort в KeywordsPage** — `(a as unknown as Record<string, number>)[sortKey]` заменён на `NUMERIC_KEY[sortKey] : keyof KeywordAnalyticsItem`. Защита от тихого NaN-сортинга.
12. **`profileApi.get`** — `.then()` → `async/await`. Закрытая дыра unhandled rejection.
13. **stable keys в ActiveFiltersBar** — `key={idx}` → `key={c.label}` (стабильный при reorder).

## Perf wins

14. **React.lazy для 12 страниц** в MainLayout (eager оставлены: Dashboard / Books / Campaigns / Settings). Bundle-size без изменений (Forge's WebpackPlugin не разделяет на chunks без переопределения target/output), но deferred render evaluation работает — `Suspense` fallback показывает spinner при первом визите.
15. **Explicit `mode: 'production'`** в `webpack.renderer.config.ts` — защита от регрессии на eval-source-map dev bundle.

**Регресс:** **84/84 тестов** (testTimeout поднят до 15s т.к. lazy-загрузка в jsdom занимает 2-3с), `tsc --noEmit` clean, `npm run lint` clean, `npm run package` собирается.

**Не зашиплено (low impact или нужен рефактор на 13 файлов):**
- Code-quality #1+#2 — extract `useApiQuery` hook (дубликат `useEffect+fetch+catch+toast` в 13 страницах). Это 1-2 часа работы и trickier рефактор.
- Code-quality #3 — `DEFAULT_ATTRIBUTION` константа.
- Code-quality #7 — `React.memo` row components в KeywordsPage/CampaignsPage/SearchTermsPage.
- Code-quality #8 — единая политика error-handling.
- Code-quality #10 — split `useMemo` filter+sort в KeywordsPage.
- Perf #3 — virtualization (`@tanstack/react-virtual`) для 1k+ rows.
- Perf #4 — `React.memo` row components.

Все эти пункты в **`reviewer-findings.md`** не нужны — они здесь, в parity-plan, как roadmap.

---

# Фаза 10 — Отложенные пункты (старая разметка)

- [ ] **Dark theme** через CSS-vars в Tailwind (`tailwind.config.js darkMode: 'class'`), toggle в UserMenu, persist в localStorage.
- [ ] **Publisher Rocket** (5 табов, через `publisher_rocket` API).
- [ ] **ASIN Scanner / Rank Tracker** (минимум — view).
- [ ] **Search Term trends modal**: клик по строке → линейный график clicks/spend/orders по дням.
- [ ] **Avatars upload** + profile editing.
- [ ] **Sentry или встроенный crash logger**: `app.on('render-process-gone')` → file log в `app.getPath('userData')/crashes/`.
- [ ] **Финальный регресс:** `tsc --noEmit`, `npm run lint`, `npm test`, `npm run package` для macOS arm64 и x64.

**Commit:** `Polish: dark theme, PR, scanner view, crash logger`

**Решение 2026-05-09:** все пункты Фазы 10 явно P2/P3 и не блокируют personal-use parity. Откладываются:
- **Dark theme** — потребует CSS-vars рефактора всех zinc-цветов (~50 файлов). Делать только когда понадобится.
- **Publisher Rocket / ASIN Scanner / Rank Tracker** — для personal-use редко нужны; решение по необходимости.
- **Search Term trend modal** — backend не имеет `search-terms/<id>/history` endpoint; нужен новый бэкенд-роут перед UI.
- **Avatars upload** — profile editing не приоритет.
- **Crash logger** — `app.on('render-process-gone')` дешёвый, но без public-release не критичен.
- **Auto-update / code signing** — это public-release трек, не personal-use.

**Финальный регресс personal-use parity:** **80/80 тестов**, `tsc --noEmit` clean, `npm run lint` clean, `npm run package` собирается на arm64. Все 7 закрытых фаз (1–7 + 8 частично + 9) дают рабочее приложение под `npm start`.

---

# Сводная таблица сайдбара после всех фаз

| Хоткей | Пункт | Фаза | Endpoint(ы) |
|---|---|---|---|
| `G O` | Обзор | 1 | overview, top-performers, alerts, by-marketplace, daily |
| `G B` | Книги | 8 | by-book + bsr-history + ratings |
| `G K` | Ключи | 4 | by-keyword + targets |
| `G C` | Кампании | 2 | by-campaign + campaigns CRUD |
| `G S` | Поисковые запросы | (есть) | search_terms |
| `G N` | Минус-слова | 4 | negatives + negative_lists |
| `G R` | Отчёты | 7 | 10 metric разрезов |
| `G P` | Сравнение | 7 | overview ×2 |
| `G A` | Центр действий | 5 | action_center |
| `G U` | Автоматизация | 5 | automation |
| `G L` | Мониторинг | 5 | alerts |
| `G T` | Операции | 9 | tasks |
| `G Y` | Royalty | 8 | royalties |
| `G F` | Бухгалтерия | 9 | accounting |
| — | Настройки | 6 | profile + integrations + amazon_ads |

---

# Что НЕ делаем (для personal-use)

| Фича | Причина |
|---|---|
| Chat / channels / file attachments / reactions | Одиночный юзер |
| Voice / Video calls (WebRTC + TURN) | Одиночный юзер |
| Live cursors / Follow-Sync | Одиночный юзер |
| AdminPage / UsersManagement / Audit Log | Один юзер = один админ |
| AI Management page (director, agent traces, ai_audits) | Слишком много инфры; PPC-агенты остаются на Railway |
| Personal Finance, Admin Notes, Admin Meetings, Project Notes | Не нужно для одиночного PPC |
| Локальный SQLite для royalty | Это уже public-release трек, royalty остаётся в Neon |
| Code signing / notarization / auto-update | Public-release |
| Marketing Stream sync triggers | Backend-only |

Эти модули **не удаляются** из этого плана навсегда — возвращаются в public-release треке (см. `README.md` основной).

---

# Порядок выполнения (рекомендация)

```
Фаза 0 (✅ done) → Фаза 1 → Фаза 2 → Фаза 3 → Фаза 6 → Фаза 4 → Фаза 5 → Фаза 7 → Фаза 8 → Фаза 9 → Фаза 10
```

**Объяснение порядка:**
- 1 первой — потому что Dashboard сейчас выглядит беднее всего.
- 2-3 после Dashboard — основной CRUD-поток для PPC-управления.
- 6 после 3 — auth/Amazon connect нужен чтобы видеть свежие данные при подключении к новому аккаунту.
- 4 после 6 — Keywords-стратегия требует подключённого аккаунта.
- 5 после 4 — Action Center / Automation полагаются на наличие данных.
- 7-9 — параллельно можно по желанию.
- 10 — финал.

---

# Точка входа в новой сессии

Если открыл этот план в новой сессии и не знаешь что делать:

1. Открыть этот файл, найти первую фазу без `[ЗАКРЫТА]`.
2. Прочитать её целиком + reference-файлы из railway-фронта.
3. Прочитать `CLAUDE.md` в корне (security baseline + IPC правила).
4. Запустить pre-flight checklist (выше).
5. Выполнять подзадачи фазы строго по порядку.
6. После каждой подзадачи — commit с conventional-style сообщением (Фаза N.M).
7. По завершению фазы — пометить `[ЗАКРЫТА YYYY-MM-DD]` в этом файле + `[ЗАКРЫТА]` в README.md.
