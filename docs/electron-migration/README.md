# План миграции Ads Tracker → Electron Desktop App

**Дата создания:** 2026-04-30
**Последнее обновление:** 2026-05-09
**Текущий трек:** **Personal-use first** (см. ниже)

---

## Текущий трек: Personal-use first

Проект изначально планировался как продукт для широкого рынка KDP-авторов с подпиской. На 2026-05-07 принято решение **сначала сделать рабочую версию для собственного использования**, без публичного релиза. Это радикально упрощает работу:

| Фаза плана | Personal-use | Public release |
|---|---|---|
| 0. Решения | ✅ закрыта | ✅ закрыта |
| 1. Backend cleanup (API-key middleware, разделение PPC/royalty) | ⏸ отложено | обязательно |
| 2. Electron skeleton | ✅ закрыта (security baseline, IPC, auth, API client) | обязательно |
| 3. Локальный royalty слой (SQLite + Node-парсер xlsx) | ⏸ отложено — TOS не нарушается, royalty остаётся в Railway | обязательно |
| 4. Фронт-интеграция (страница за страницей) | ✅ закрыта (Dashboard + Books + Campaigns + SearchTerms + Reports + Settings) | обязательно |
| 5. Packaging + signing + auto-update | ⏸ отложено | обязательно |
| 6. Pilot | ⏸ отложено | обязательно |

### Прогресс personal-use трека (2026-05-09)

**Закрыто.** Все 5 placeholder-страниц заменены на работающие. Стэк UI: Tailwind 3 + lucide-react + общие примитивы из `src/renderer/components/ui/` (Card, Kpi, RangePicker, PageHeader, ErrorBanner, LoadingRow, EmptyState). Форматтеры в `src/renderer/lib/format.ts`, диапазоны в `src/renderer/lib/dateRange.ts`.

| Страница | Backend endpoints | Что есть |
|---|---|---|
| Dashboard | `/api/metrics/summary/by-book` | KPI + таблица книг (без изменений с прошлой сессии) |
| Books | `/api/metrics/summary/by-book` | KPI + группировка по `book_id`, drill-down по маркетплейсам, поиск, сортировка |
| Campaigns | `/api/metrics/summary/by-campaign` | KPI + таблица, фильтры MP / тип / active-only, сортировка, поиск по названию/книге |
| SearchTerms | `/api/search-terms` | KPI + пагинация, фильтры keywords/asins, min-clicks, поиск, сортировка |
| Reports | `/api/metrics/summary/{daily,weekly,by-marketplace}` | KPI + переключатель day/week, разрез по MP, CSV-экспорт |
| Settings | `/api/auth/verify` (через AuthContext), `app.getInfo`, `app.getApiBaseUrl` | Профиль, превью токена, base URL, версия, sign-out |

### Сессия 2026-05-09 (вторая итерация, ~95%)

В одной серии коммитов закрыты следующие пункты усиления приложения:

| # | Что | Где |
|---|---|---|
| 1 | Удалён неиспользуемый `PagePlaceholder.tsx` | — |
| 2 | `DashboardPage` отрефакторен на общие примитивы из `components/ui/` и `lib/` | DashboardPage.tsx |
| 3 | Глобальный error handling: `ErrorBoundary` + `ToastProvider` (`useToast()`); все страницы кидают сетевые ошибки в toast | App.tsx, contexts/ToastContext.tsx, ErrorBoundary.tsx |
| 4 | `lib/csv.ts` (csvEscape по RFC 4180, toCsv, downloadCsv); ReportsPage экспорт переехал | lib/csv.ts, ReportsPage.tsx |
| 5 | `NavContext` + drill-down Books → Campaigns → SearchTerms; chip-фильтры с кнопкой сброса | contexts/NavContext.tsx, BooksPage.tsx, CampaignsPage.tsx, SearchTermsPage.tsx |
| 6 | Vitest 1.6 + RTL 14 + jsdom 23. **40 тестов** (lib units + page smoke + drill-down integration + hotkeys) | `npm test` |
| 7 | Recharts 3.8: LineChart spend/sales по дням, BarChart spend по MPs; кастомный `ChartTooltip` в стиле UI | components/ui/ChartTooltip.tsx, ReportsPage.tsx |
| 8 | Клиентская пагинация в CampaignsPage; общий `Pagination` примитив (используется и в SearchTerms) | components/ui/Pagination.tsx |
| 9 | `marketplacesApi` + `MarketplacesProvider` с in-memory кэшем, инвалидация на sign-out | api/marketplaces.ts, contexts/MarketplacesContext.tsx |
| 10 | Хоткеи навигации `g + o/b/s/c/r`; защита от input/textarea/contenteditable, blocked при modal-open | MainLayout.tsx + hotkeys.test.tsx |
| 11 | Cmd+K / Ctrl+K командная палитра (~210 строк руками, без cmdk): 6 переходов + reload + copy URL + sign-out | components/CommandPalette.tsx |
| 12 | Auto-refresh toggle в `RangePicker` (настраиваемый interval, persist в localStorage per-page) | components/ui/RangePicker.tsx |
| 13 | Глобальные фильтры в topbar (multi-select MPs); все страницы передают в API | contexts/GlobalFiltersContext.tsx, components/GlobalFilters.tsx |
| 14 | Edit campaign модал: status (paused/enabled), daily budget; PUT `/api/campaigns/:id` | components/EditCampaignModal.tsx, api/campaigns.ts |

**Что отложено** (не закрыто этой сессией):
- Глобальный book selector (есть только MP) и account фильтр
- Локальный SQLite слой для royalty (Phase 3 public-release трека)
- Порт парсера xlsx на Node, code signing/notarization/auto-update, Sentry
- Полные модули Negative Keywords / Targets / KeywordDiscovery / Alerts /
  Action Center / Notifications / Automation / AdminPage / OperationsCenter Kanban / AIManagement
- Login через email+password (сейчас только JWT/at_live токен через TokenPasteScreen)
- Multi-machine sync

### Сессия 2026-05-09 (третья итерация, ~98%)

Закрыты следующие пункты доводки до состояния «реально finished»:

| # | Что | Где |
|---|---|---|
| 1 | Book selector в GlobalFilters (single-select с inline-search). BooksContext с in-memory кэшем; drill-down BooksPage→Campaigns теперь ставит ГЛОБАЛЬНЫЙ bookId (а не локальный через NavContext) | contexts/BooksContext.tsx, components/GlobalFilters.tsx |
| 2 | Account selector в GlobalFilters (multi-select из Set books.account, dropdown скрыт если accounts ≤ 1) | components/GlobalFilters.tsx |
| 3 | Notifications API + Bell с polling unread-count (60 сек), dropdown со списком 20 последних, mark-read, mark-all-read. Disabled-fallback при 401/403/404. | api/notifications.ts, components/NotificationsBell.tsx |
| 4 | User-меню в topbar: avatar → dropdown с email + «Настройки» + «Выйти» | components/UserMenu.tsx |
| 5 | NegativesPage: select кампании, форма «Добавить минус-слово», таблица текущих с X-кнопкой удаления; sidebar G N | pages/NegativesPage.tsx, api/negatives.ts |
| 6 | Quick action в SearchTermsPage: Ban-icon на hover в строке → popover с Exact/Phrase → POST /api/search-terms/add-negative-by-text | api/searchTerms.ts (addNegativeByText), pages/SearchTermsPage.tsx |
| 7 | Sticky table headers через CSS `.table-sticky-head thead th { position:sticky; top:0; bg:white }` — добавлено во все 7 таблиц | src/index.css |
| 8 | ActiveFiltersBar: chip-breadcrumb активных global+local фильтров между PageHeader и KPI; useGlobalFilterChips() helper | components/ui/ActiveFiltersBar.tsx |
| 9 | Очищены act() warnings: getByText → findByText, suppress оставшихся async-после-теста через console.error patch в setup.ts | src/test/setup.ts |
| 10 | Финальный регресс: tsc clean, eslint clean (0 warnings), 40/40 тестов без шума, npm run package OK | — |

Топбар после этой итерации стал полноценным workspace: глобальные
фильтры (Book / Account / MPs), Cmd+K, уведомления с badge, аватар
с меню. Sidebar — 6 рабочих пунктов с G-хоткеями. Drill-down
пересекается с глобальными фильтрами и виден в ActiveFiltersBar.

**Что строим сейчас:** Electron-обёртка в новом визуальном стиле (Tailwind + lucide, без Cloudscape) над существующим Railway backend'ом. Auth — текущий JWT, royalty остаётся в Neon PostgreSQL как сейчас, никаких миграций данных. Срок до полной функциональности — ~1–2 недели.

**Что будет когда переключимся на public release:** возвращаются Phase 1 + Phase 3 (порт парсера на Node, локальный SQLite, API-key middleware, миграции таблиц `accounts`/`subscriptions`). Это аддитивная работа — то, что построено сейчас, не выбрасывается.

Полный план ниже сохранён как референс для публичного релиза.

---

## Зачем (полный план для public release)

Amazon TOS запрещает третьим лицам хранить и передавать KDP royalty данные. Текущая архитектура (Flask backend на Railway + общая Neon PostgreSQL) технически нарушает это ограничение, потому что royalty лежит в shared БД.

Решение: разделить продукт на два слоя.

- **Локальный слой (Electron app)** — royalty парсится и хранится только на машине пользователя.
- **Remote backend (Railway)** — только PPC данные (кампании, search terms, Marketing Stream), которые Amazon разрешает обрабатывать.

С точки зрения пользователя UI остаётся тот же React-интерфейс, но он работает в виде нативного desktop-приложения для macOS и Windows и сшивает данные из двух источников локально.

> На текущем personal-use треке это разделение **не выполняется** — royalty продолжает храниться в Railway, потому что для собственных данных TOS не нарушается. Возвращается перед публичным релизом.

---

## Бизнес-параметры

- **Целевая аудитория:** широкий рынок KDP-авторов, платная подписка
- **Платформы:** macOS (Apple Silicon + Intel) и Windows x64
- **Дистрибуция:** через «зонтик» — портал на Railway, где пользователь оплачивает, получает API-ключ и скачивает .dmg / .exe
- **Multi-machine:** на старте без синхронизации — royalty импортируется отдельно на каждой машине; одинаковые KDP-отчёты дают одинаковые цифры. E2E-зашифрованная синхронизация — премиум-фича на потом.
- **Несколько KDP-аккаунтов внутри одного пользователя:** поддерживается (модель данных уже это умеет)
- **Telegram-бот:** не трогаем, остаётся серверным

---

## Карта работ

| Слой | Файлов | Строк | Действие |
|---|---|---|---|
| Backend royalty endpoints (8) | 8 | 214 | удаляем после релиза Electron |
| Backend mixed endpoints (TACoS, profit) | 6 | 1 446 | разделяем: backend отдаёт чистый PPC |
| Backend models royalties_*.py | 5 | 2 097 | переписываем на TypeScript + better-sqlite3 |
| royalty_import_service.py | 1 | 527 | порт на Node.js + exceljs |
| Frontend компоненты с royalty | 5+ | ~3 000 | остаются, переключаем источник API → IPC |
| Расчёт TACoS / profit | — | ~50 | выносим в `frontend/src/utils/finance.ts` |

**Итого:** ~30 файлов, ~7 600 строк затронуто. Основная работа — порт парсера royalty с Python на Node.js и переключение пяти ключевых React-компонентов на гибридный fetcher (PPC из API + royalty из IPC).

---

## Архитектура

```
┌──────────────────────────────────────────────────────────┐
│                  Electron Desktop App                    │
│                                                          │
│  ┌────────────┐    IPC     ┌────────────────────────┐    │
│  │  Renderer  │◄──────────►│  Main process (Node)   │    │
│  │  (React)   │            │  • better-sqlite3      │    │
│  │            │            │  • exceljs (KDP xlsx)  │    │
│  │  hybrid    │            │  • file watcher        │    │
│  │  metrics:  │            │  • safeStorage(token)  │    │
│  │  PPC + 💰  │            └────────────────────────┘    │
│  │            │                                          │
│  │            │  net.fetch (HTTPS + Bearer API key)      │
│  └─────┬──────┘────────────────────────────┐             │
└────────┼─────────────────────────────────────┼───────────┘
         │                                     │
         │                                     ▼
         │                        ┌─────────────────────────┐
         │                        │ Railway Backend (Flask) │
         │                        │ урезан: только PPC      │
         │                        │ • кампании / search t.  │
         │                        │ • Marketing Stream      │
         │                        │ • Amazon Ads OAuth      │
         │                        │ • без royalty endpoints │
         │                        └────────────┬────────────┘
         │                                     │
         │                                     ▼
         │                              Neon PostgreSQL
         │                         (без paperback_royalties
         │                          и связанных таблиц)
         │
         ▼
   Локально:
   ~/Library/Application Support/AdsTracker/royalty.db (SQLite)
   ~/Library/Application Support/AdsTracker/uploads/*.xlsx
```

---

## Стек

| Слой | Выбор | Почему |
|---|---|---|
| Electron | 41.x | актуальный stable (Chromium 146, Node 24) |
| Bundler | Forge + Webpack template | в 2026 Forge-Vite plugin ещё experimental — для production брать Webpack |
| UI | React 18 + TypeScript | как сейчас, не трогаем |
| Локальная БД | better-sqlite3 | синхронный, быстрый, embed-friendly |
| Хранение API-ключа | safeStorage (OS Keychain / DPAPI) | стандарт; не keytar (он мёртв с 2024) |
| Парсинг xlsx | exceljs (Node) | streaming, читает все KDP-форматы |
| HTTP к backend | net.fetch | proxy-aware, корректно работает за корпоративными прокси |
| Packaging | electron-builder | DMG+ZIP для macOS, NSIS .exe для Windows |
| Code signing | Apple Developer ID + notarization (macOS); EV cert или Azure Trusted Signing (Windows) | подробнее в [certificates.md](certificates.md) |
| Auto-update | electron-updater + GitHub Releases (private repo) | бесплатно, проверенный паттерн |
| IPC pattern | typed contextBridge | по шаблону из electron-knowledge-base |
| Crash reporting | Sentry developer plan | ~$26/мес, нужно для широкого рынка |

**Что НЕ выбираем и почему**

- ❌ Tauri — пришлось бы дублировать парсер на Rust, не реиспользуется TS/Python
- ❌ Mac App Store — sandbox запрещает читать произвольные пользовательские .xlsx
- ❌ BrowserView с текущим веб-frontend — ломает изоляцию royalty, идея не работает

---

## Roadmap (фазы)

| Фаза | Что | Дни |
|---|---|---|
| 0 | Решения по открытым вопросам, см. [open-questions.md](open-questions.md) | 1 |
| 1 | Backend cleanup: API-key middleware, отделение PPC-only endpoints, royalty endpoints помечаем deprecated | 2–3 |
| 2 | Electron skeleton: scaffold, security baseline, импорт текущего React в renderer, IPC контракт скелетон | 3–4 |
| 3 | Локальный royalty слой: SQLite миграции, порт `royalty_import_service` на Node, расчёт TACoS на клиенте | 5–7 |
| 4 | Фронт-интеграция: hybrid-fetcher в RoyaltiesImport / BooksPage / MetricsPanel, экран первого запуска | 4–5 |
| 5 | Packaging + signing + auto-update: electron-builder config, notarization, code signing, beta-канал | 3–5 |
| 6 | Pilot на 3–5 клиентах, Sentry, удаление royalty endpoints с Railway, удаление таблиц с Neon | 7–14 |

**Итого:** 4–6 недель в одно лицо при 4–6 часах работы в день. Параллельно потребуется ~1 неделя на «зонтик» (лендинг + checkout + личный кабинет).

---

## Бюджет на инфраструктуру (год)

| Статья | Сумма |
|---|---|
| Apple Developer Program | $99 |
| Windows code signing (EV или Azure Trusted Signing) | $120–500 |
| Sentry (developer plan) | ~$300 |
| Текущая Railway-инфраструктура | без изменений |
| **Итого** | **~$520–900/год** |

Stripe / Paddle / LemonSqueezy комиссия — отдельно от выручки, ~3–5%.

---

## Источники

Все архитектурные решения опираются на материалы базы знаний `/Users/yuliiparfonov/electron-knowledge-base/`:

- [atlas/00-INDEX.md](../../electron-knowledge-base/atlas/00-INDEX.md) — главный индекс
- [atlas/core/03-security.md](../../electron-knowledge-base/atlas/core/03-security.md) — security checklist (17 пунктов)
- [atlas/core/05-packaging-and-signing.md](../../electron-knowledge-base/atlas/core/05-packaging-and-signing.md) — Forge vs builder, notarization, EV certs
- [atlas/core/07-auto-update.md](../../electron-knowledge-base/atlas/core/07-auto-update.md) — каналы, staged rollouts
- [atlas/core/08-frontend-stack.md](../../electron-knowledge-base/atlas/core/08-frontend-stack.md) — Vite vs Webpack
- [atlas/core/09-backend-connectivity.md](../../electron-knowledge-base/atlas/core/09-backend-connectivity.md) — auth, safeStorage, offline
- [build-kit/checklist.md](../../electron-knowledge-base/build-kit/checklist.md) — 88 пунктов в 13 фазах
- [build-kit/templates/02-ipc-contract.md](../../electron-knowledge-base/build-kit/templates/02-ipc-contract.md) — typed IPC
- [build-kit/templates/03-electron-builder-config.md](../../electron-knowledge-base/build-kit/templates/03-electron-builder-config.md) — builder.yml
- [build-kit/templates/05-railway-backend-client.md](../../electron-knowledge-base/build-kit/templates/05-railway-backend-client.md) — auth + offline для Railway
- [atlas/case-studies/04-1password.md](../../electron-knowledge-base/atlas/case-studies/04-1password.md) — паттерн «локальный core + remote backend», прямой аналог нашего

---

## Файлы плана

- [README.md](README.md) — этот файл, общий обзор
- [certificates.md](certificates.md) — детально про code signing для macOS и Windows
- [open-questions.md](open-questions.md) — что нужно решить до старта Фазы 1
