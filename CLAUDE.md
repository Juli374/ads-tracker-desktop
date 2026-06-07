# CLAUDE.md — KDPBook Desktop (Ads Tracker)

> **Что это:** Electron desktop-клиент **KDPBook** — это **ПРОДУКТ, который мы продаём** (Mac + Windows). Только клиент. Бэкенд (Flask + Railway PostgreSQL) живёт в `Juli374/ads-tracker` и сюда не входит — мы ходим к нему по HTTPS.
> Корневая карта всего бизнеса: [`../CLAUDE.md`](../CLAUDE.md). Текущее состояние/блокеры: `../STATUS-2026-06-07-blocker-audit.md`.
>
> **Версия:** `package.json` = **3.5.0** (релиз live, Mac+Win, UNSIGNED — подпись = отдельная команда).
> **Brand:** surface = "KDPBook · Ads Tracker". `appBundleId`, URL scheme `ads-tracker-desktop://`, repo `Juli374/ads-tracker-desktop` — НЕ менять (ломает auto-update).

---

## 🎯 Трек: продаваемый продукт (НЕ personal-use)

Это полноценное приложение для пользователей. Роялти хранится **локально** на машине автора (Amazon ToS: роялти нельзя отдавать третьим лицам) — это и есть причина существования десктопа. Подписка/лицензирование — через backend entitlements (платёжная часть = отдельная команда).

---

## 🗺️ Карта `src/` (Electron app)

```
src/
├── index.ts            # main entry: BrowserWindow (contextIsolation:true, sandbox:true)
├── preload.ts          # contextBridge bootstrap
├── renderer.tsx        # renderer entry
├── shared/             # типы IPC-контракта (renderer ↔ main)
├── main/               # Electron main process (см. таблицу ниже)
└── renderer/           # React 18 UI: pages/ components/ api/ contexts/
```

### `src/main/` — процессы main

| Модуль | Что |
|---|---|
| `api-client.ts` | `net.fetch` к `https://ads-tracker-production.up.railway.app`, Bearer-токен (override `ADS_TRACKER_API_URL`) |
| `auth-store.ts` | токен в `safeStorage` (OS Keychain / DPAPI) |
| `local-db/` | **локальная роялти** — `royalty.ts` + `xlsxParser.ts` (импорт KDP XLSX, шифрование); `index.ts` = local settings (вкл. AI model defaults) |
| `scraper/` | **клиентский sidecar** BSR/ratings (PyInstaller-бинарь из `amazon-scrapers`, кладётся CI в `resources/scraper-sidecar/<os>/`); шлёт на backend `/api/scrape/*` (LIVE в проде, PR #7) |
| `ai/` | вызовы Anthropic API (BYOK) для advisor / title-gen / reverse-ASIN / niche / listing / briefing |
| `automation/` | PPC-автоматизация (рекомендации) |
| `briefing/` | weekly briefing |
| `cover-qa/` | проверка обложек |
| `entitlements.ts` · `licensing.ts` | tier/лицензия (⚠ `licensing.ts` сейчас STUB → всегда `pro`; реальный гейт = backend; payments carve-out) |
| `ipc-handlers.ts` | регистрация typed IPC |
| `updater.ts` | electron-updater + GitHub Releases |
| `logger.ts` · `telemetry.ts` | логи/телеметрия |

### `src/renderer/pages/` — 21 страница

`Dashboard` · `Books` · `Campaigns` · `CampaignDetails` · `Keywords` · `SearchTerms` · `Negatives` · `Reports` · `Royalties` · `PnL` · `Accounting` · `Comparison` · `ActionCenter` · `OperationsCenter` · `Automation` · `Alerts` · `Briefing` · `Research` · `ListingStudio` · `Profile` · `Settings`

### `src/renderer/components/` (ключевое)

`MainLayout` · `LoginScreen` · `SignupScreen` · `CommandPalette` · `UpgradeModal` · `UpdateChecker`/`UpdatePill` · `GlobalAttributionToggle` · `GlobalFilters` · модальные (`AddCampaignModal`, `EditCampaignModal`, `AddTargetModal`, `AddAdGroupModal`, `AddEventModal`) · подпапки: `auth/ automation/ books/ campaigns/ dashboard/ keywords/ listing/ niche/ operations/ pnl/ reports/ searchTerms/ settings/ ui/`

> ⚠ **TokenPasteScreen / PagePlaceholder УДАЛЕНЫ** — больше не существуют. Не ссылаться.

---

## 🔐 Аутентификация (3 пути)

1. **Email/пароль** — `SignupScreen` / `LoginScreen` (Supabase IdP через backend).
2. **SSO «войти через браузер»** — handoff: логин на сайте `book-platform` → deep-link `ads-tracker-desktop://` → редим токена. ⚠ split-brain хостов: `LoginScreen.tsx:44` `SITE_BASE_URL` = vercel-preview, а `CredentialsTab.tsx:10` OAuth = `kdpbook.click` — надо унифицировать (открытый блокер).
3. **Amazon Ads OAuth** — `CredentialsTab` → `kdpbook.click/callback`. ⚠ backend `/token-info` пока не отдаёт `has_refresh_token` → Dashboard показывает «не подключено» (открытый блокер).

Токен — в `safeStorage`, не в .env/файле.

---

## 🔌 Связь с backend

**Только HTTPS, никакого shared-кода с `ads-tracker`.** Base URL хардкод в `src/main/api-client.ts` (override `ADS_TRACKER_API_URL`). API-контракт должен совпадать с `Juli374/ads-tracker/backend/routes/*`. Если backend меняет endpoint — правки в обоих репо; координатор — пользователь.

---

## ⚠️ Известные открытые блокеры (десктоп-сторона, на 2026-06-07)

См. полный список в `../STATUS-2026-06-07-blocker-audit.md` + карте транспарентности L3. Десктопные:
- **AI model picker** — `AITab.tsx:47-50` содержит несуществующий `claude-sonnet-4-7` + снятые `claude-3-5-*-latest` → все AI-фичи 404. Валидные id: `claude-opus-4-8 / claude-opus-4-7 / claude-sonnet-4-6 / claude-haiku-4-5`.
- **Toggle статуса** — `renderer/api/amazonAds.ts:86,123` шлёт lowercase `enabled/paused`, бэкенд требует UPPERCASE → 400 (фикс: `.toUpperCase()`).
- **BooksPage royalty=$0** — `BooksPage.tsx` не читает local royalty store (Royalty/TACoS колонки $0 после импорта).
- ⚠ Любой десктоп-фикс дойдёт до юзеров только через **подписанный** авто-апдейт (подпись = отдельная команда).

---

## 📚 База знаний по Electron

`electron-knowledge-base/` — read-only справочник (2026-актуальный). **Не редактируем при работе над приложением.** Точки входа: `atlas/00-INDEX.md`, `atlas/core/03-security.md` (security baseline), `atlas/core/05-packaging-and-signing.md`, `atlas/core/07-auto-update.md`, `build-kit/checklist.md`.

---

## 🚦 Правила работы

1. **Никаких backend-изменений отсюда.** Новый endpoint → задача в `Juli374/ads-tracker`.
2. **Security baseline неприкосновенен** — `contextIsolation:true`, `sandbox:true`, без `nodeIntegration`, без `webSecurity:false`.
3. **IPC только typed** — сначала `src/shared/ipc.ts`, потом handler в `src/main/ipc-handlers.ts`, потом expose в `src/preload.ts`.
4. **Все HTTP — через `src/main/api-client.ts`**, не из renderer напрямую.
5. **Перед коммитом** — проверить, что не утекли секреты/токены/dev-URL.

---

## 🛠️ Команды

```bash
npm install
npm start          # dev (или "Запустить Ads Tracker (dev).command")
npm run package    # неподписанная сборка для проверки
npm run make       # инсталляторы (DMG / ZIP / NSIS)
npm run publish    # релиз (нужны signing-креды + GitHub token)
npm run lint
npm test           # ⚠ vitest сейчас зависает без summary (открытый P2)
```

---

## 🎨 Дизайн-система

Источник истины — `book-platform/design-dna.json` (KDPBook brand DNA), адаптация — `DESIGN.md` в корне репо. Шрифты: Inter (UI), Playfair Display 700 (wordmark/H1), JetBrains Mono (метрики). Accent: emerald `#10b981`. Палитра модулей: ads=emerald, analytics=blue, publishing=purple, ai=amber, marketplace=rose. Цвета — через семантические токены в `tailwind.config.js`.

---

## История

- **2026-04-30** — Electron Forge скаффолд (внутри `ads-tracker/desktop/`).
- **2026-05-08** — вынесен в отдельный репо `Juli374/ads-tracker-desktop`.
- **2026-05-16** — Phase Q (KDPBook visual identity).
- **2026-06-07** — v3.4.0 → **v3.5.0** (live, Mac+Win, unsigned): добавлен клиентский BSR/ratings scraper-sidecar; backend `/api/scrape/*` влит в прод (PR #7).
