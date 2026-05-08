# План миграции Ads Tracker → Electron Desktop App

**Дата создания:** 2026-04-30
**Последнее обновление:** 2026-05-07
**Текущий трек:** **Personal-use first** (см. ниже)

---

## Текущий трек: Personal-use first

Проект изначально планировался как продукт для широкого рынка KDP-авторов с подпиской. На 2026-05-07 принято решение **сначала сделать рабочую версию для собственного использования**, без публичного релиза. Это радикально упрощает работу:

| Фаза плана | Personal-use | Public release |
|---|---|---|
| 0. Решения | ✅ закрыта | ✅ закрыта |
| 1. Backend cleanup (API-key middleware, разделение PPC/royalty) | ⏸ отложено | обязательно |
| 2. Electron skeleton | ✅ в работе | обязательно |
| 3. Локальный royalty слой (SQLite + Node-парсер xlsx) | ⏸ отложено — TOS не нарушается, royalty остаётся в Railway | обязательно |
| 4. Фронт-интеграция (страница за страницей) | в работе | обязательно |
| 5. Packaging + signing + auto-update | ⏸ отложено | обязательно |
| 6. Pilot | ⏸ отложено | обязательно |

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
