# CLAUDE.md — KDPBook Desktop (Ads Tracker)

> **Что это:** Electron desktop-клиент **KDPBook** (модуль Ads Tracker). **Только клиент.** Бэкенд (Flask + Railway PostgreSQL) живёт в `Juli374/ads-tracker` и сюда не входит.
>
> **Brand:** surface = "KDPBook · Ads Tracker" (hybrid wordmark per Phase Q). HTML title / dock / native dialogs = "KDPBook". `appBundleId`, URL scheme `ads-tracker-desktop://`, GitHub repo `Juli374/ads-tracker-desktop` — НЕ менять, ломает auto-update + signed installs.

---

## 🗺️ Карта репозитория

```
ads-tracker-desktop/
├── src/                       # Electron app (main + renderer + preload)
├── docs/electron-migration/   # план + certificates + open-questions
├── electron-knowledge-base/   # KB по Electron 2026 (атлас, build-kit, шаблоны)
├── forge.config.ts            # Electron Forge конфиг
├── webpack.*.config.ts        # webpack для main/renderer/plugins/rules
├── tailwind.config.js         # Tailwind 3
├── package.json               # name: ads-tracker-desktop, Electron 41, React 18
└── Запустить Ads Tracker (dev).command   # dev launcher для macOS
```

### `src/` — Electron app

| Подпапка | Что |
|---|---|
| `src/index.ts` | main entry, создаёт BrowserWindow с `contextIsolation: true`, `sandbox: true` |
| `src/preload.ts` | contextBridge bootstrap |
| `src/renderer.tsx` | renderer entry |
| `src/main/api-client.ts` | `net.fetch` к `https://ads-tracker-production.up.railway.app`, Bearer-токен |
| `src/main/auth-store.ts` | `safeStorage` (OS Keychain / DPAPI) для токена |
| `src/main/ipc-handlers.ts` | регистрация IPC-обработчиков |
| `src/shared/ipc.ts` | типы IPC-контракта (renderer ↔ main) |
| `src/renderer/App.tsx` | корень React |
| `src/renderer/components/` | `MainLayout`, `TokenPasteScreen`, `PagePlaceholder` |
| `src/renderer/contexts/AuthContext.tsx` | auth context |
| `src/renderer/api/` | клиентские обёртки: `client.ts`, `auth.ts`, `metrics.ts` |
| `src/renderer/pages/` | `Dashboard`, `Books`, `Campaigns`, `SearchTerms`, `Reports`, `Settings` |

---

## 🎯 Текущий трек: personal-use first

Решение от 2026-05-07. Сначала рабочая версия для собственного использования, без публичного релиза. Royalty продолжает храниться в Railway (для своих данных Amazon TOS не нарушается). Public release — отложен, фазы 1, 3, 5, 6 возвращаются перед запуском.

Что делаем сейчас:
- Electron-обёртка в **новом визуальном стиле** (Tailwind + lucide-react, **без Cloudscape**)
- Использует существующий Railway backend (`/Juli374/ads-tracker`)
- Auth через JWT-токен, который юзер вставляет в `TokenPasteScreen` при первом запуске
- Срок до полной функциональности — ~1–2 недели

См. полный план: [docs/electron-migration/README.md](docs/electron-migration/README.md).

---

## 🔌 Связь с backend

**Только HTTPS.** Никакого shared-кода с `ads-tracker`.

| Что | Где |
|---|---|
| Base URL | `https://ads-tracker-production.up.railway.app` (хардкод в `src/main/api-client.ts:5`, override через `ADS_TRACKER_API_URL`) |
| Auth | `Authorization: Bearer <token>` — токен лежит в `safeStorage`, читается в `auth-store.ts` |
| HTTP клиент | `net.fetch` (proxy-aware, не node-fetch) |
| API-контракт | Должен совпадать с `Juli374/ads-tracker/backend/routes/*` |

Если backend меняет endpoint — изменения нужны в обоих репо. Координатор изменений — пользователь, не Claude.

---

## 📚 База знаний по Electron

`electron-knowledge-base/` — **рядом, не в node_modules**. 2026-актуальная KB, на которую опирается весь план миграции.

Главные точки входа:
- [`atlas/00-INDEX.md`](electron-knowledge-base/atlas/00-INDEX.md) — главный индекс
- [`atlas/core/03-security.md`](electron-knowledge-base/atlas/core/03-security.md) — security checklist (17 пунктов, обязательный baseline)
- [`atlas/core/05-packaging-and-signing.md`](electron-knowledge-base/atlas/core/05-packaging-and-signing.md) — Forge vs builder, notarization, EV certs
- [`atlas/core/07-auto-update.md`](electron-knowledge-base/atlas/core/07-auto-update.md) — каналы, staged rollouts
- [`atlas/core/09-backend-connectivity.md`](electron-knowledge-base/atlas/core/09-backend-connectivity.md) — auth, safeStorage, offline
- [`build-kit/checklist.md`](electron-knowledge-base/build-kit/checklist.md) — 88-пунктовый чеклист в 13 фазах
- [`build-kit/templates/02-ipc-contract.md`](electron-knowledge-base/build-kit/templates/02-ipc-contract.md) — typed IPC шаблон
- [`build-kit/templates/05-railway-backend-client.md`](electron-knowledge-base/build-kit/templates/05-railway-backend-client.md) — auth + offline для Railway, **прямой шаблон под нашу архитектуру**
- [`atlas/case-studies/04-1password.md`](electron-knowledge-base/atlas/case-studies/04-1password.md) — паттерн «локальный core + remote backend», ближайший аналог

Всё что в `electron-knowledge-base/` — read-only справочник. **Не редактируем при работе над приложением.**

---

## 🚦 Правила работы

1. **Никаких backend-изменений отсюда.** Если нужен новый endpoint — это задача в `Juli374/ads-tracker`, не здесь.
2. **Security baseline неприкосновенен** — `contextIsolation: true`, `sandbox: true`, никаких `nodeIntegration`, никаких `webSecurity: false`. Перед изменениями в `index.ts` — проверить `electron-knowledge-base/atlas/core/03-security.md`.
3. **IPC только typed** — все новые каналы добавляются в `src/shared/ipc.ts` сначала, потом handler в `src/main/ipc-handlers.ts`, потом expose в `src/preload.ts`. Шаблон: `electron-knowledge-base/build-kit/templates/02-ipc-contract.md`.
4. **Все HTTP — через `src/main/api-client.ts`**, не из renderer'а напрямую. Renderer вызывает IPC-каналы, main делает запрос.
5. **Перед коммитом** — проверить, что не утекли секреты, токены, dev-URL'ы.

---

## 🛠️ Команды

```bash
# Установка
npm install

# Dev
npm start          # или: открыть "Запустить Ads Tracker (dev).command"

# Сборка пакета (Forge)
npm run package    # неподписанная сборка для проверки
npm run make       # инсталляторы (DMG / ZIP / NSIS)
npm run publish    # релиз (нужны signing креды + GitHub Releases токен)

# Lint
npm run lint
```

---

## 🔗 Окружение

| Переменная | Что | Где |
|---|---|---|
| `ADS_TRACKER_API_URL` | Override base URL для API | `src/main/api-client.ts:6` (опц.) |

Token хранится в OS Keychain через `safeStorage` — **не в .env, не в файле**.

---

## История

- **2026-04-30** — desktop/ создан внутри `ads-tracker` как Electron Forge скаффолд
- **2026-05-07** — принят трек "personal-use first" (см. `docs/electron-migration/README.md`)
- **2026-05-08** — `desktop/` вынесен в этот отдельный репо `Juli374/ads-tracker-desktop`. В исходном `ads-tracker/desktop/` пока остаётся как safety net
- **2026-05-16** — Phase Q (Design Pass): KDPBook visual identity. Emerald accent, Playfair Display wordmark + PageHeader, JetBrains Mono on metrics. ~10 new UI primitives (`Modal`, `SegmentedControl`, `Select`, `Textarea`, `Field`, `MetricNumber`, `DisplayHeading`, `Tabs`, `LockedFeatureCard`, `GradientArea`). Global attribution toggle in topbar (was hardcoded "14d" on 4 pages). Sidebar split: Actions / AI / Finance. См. [`docs/electron-migration/design-audit-2026-05-16/`](docs/electron-migration/design-audit-2026-05-16/).

## 🎨 Дизайн-система (Phase Q+)

Источник истины — `book-platform/design-dna.json` (KDPBook brand DNA). Адаптация под desktop — `DESIGN.md` в корне репо. Ключевое:

- **Шрифты:** Inter (UI body), Playfair Display 700 (wordmark + PageHeader H1 only), JetBrains Mono (metrics, table numbers, chart axes).
- **Accent:** emerald `#10b981` (focus ring, sidebar active, "Live"/"Active" pills, high-emphasis CTAs).
- **Module palette:** ads=emerald, analytics=blue, publishing=purple, ai=amber, marketplace=rose.
- **Primary actions:** `bg-zinc-900` (black) для form submits в модалках; emerald для high-emphasis CTA (Upgrade, Sync now, Run briefing).
- **Token-driven:** все цвета через семантические токены (`accent`, `surface`, `fg-muted`, `success-soft` и т.д.) в `tailwind.config.js`. Старые `bg-zinc-*` ещё в ходу — Phase R может довести codemod.
- **Out of scope:** Lenis smooth scroll, framer-motion entrances, mesh gradients, magnetic buttons, mobile responsive — это марк-сайт, не desktop power tool.
