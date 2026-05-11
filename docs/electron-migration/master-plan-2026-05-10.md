# Master Plan — Production Push (2026-05-10)

> **Что это.** Единый исполняемый план довода `ads-tracker-desktop` до состояния «отдал .dmg/.exe человеку — он установил и работает». Включает: устранение ship-блокеров, добивку реальных параити-гэпов (где Phase A–H закрыты, но фактический код — заглушка), архитектуру subscription-tiers, новые AI-фичи для KDP-авторов.
>
> **Источники.** Аудит 2026-05-10 (5 параллельных агентов: parity, production-readiness, новые фичи, tier-gating, security/quality). Полные отчёты сохранены в этой сессии; ключевые выводы вынесены в Часть 1 ниже.
>
> **Контракт.** Этот файл — продолжение `parity-plan.md`. После закрытия Phase 10 / R / A–H открываем эти фазы в порядке `I → J → K → L → M → N → O`. Фазы можно частично распараллеливать (см. §«Параллелизация» в каждой фазе). Каждая под-задача — изолированный PR-sized chunk с явными файлами и acceptance.
>
> **Дата создания:** 2026-05-10. **Стек:** без изменений (React 18 + Tailwind + lucide + recharts).

---

## Часть 0. Состояние дел на 2026-05-10

| Слой | Состояние |
|---|---|
| Параити-каркас A–H | формально закрыт; 149/149 тестов |
| Реальное наполнение Settings (AI/Books/Stream) | **заглушки 22–53 LOC** при оригиналах в 600–1000 LOC |
| Search Terms inbox-workflow | **отсутствует**: только плоская таблица, никаких snooze/move/track/rank |
| Campaign Details: KeywordsTable bulk + Placement editor | **отсутствует** |
| Royalty xlsx local-mode | **TODO** в коде — toggle есть, парсера нет |
| Multipart upload IPC | **есть как канал**, но не подключён к Royalty/cover/avatar |
| Code signing / notarization / auto-update / CSP / crash log | **скаффолд + комментарии**, реального кода нет |
| Tier gating (Start/Pro/Business) | **архитектуры нет** |
| AI-фичи для KDP (Listing Studio, P&L, авто-минусовка, Reverse-ASIN) | **не существует**, есть только `AIAdvisorPanel` shell |
| Тест-моки `mediaUpload` / `localRoyalty.*` / `update.*` | **отсутствуют** в `src/test/mockApi.ts` — тесты на B.6/B.8/auto-update гоняются против `undefined`, зелёный-board вводит в заблуждение |
| Token `at_live_29099c08…` | **в git history** (commit `7a18778`); **ротация на Railway по-прежнему не выполнена** |

**Вывод аудита:** под текущим парити-планом «закрыто» ≠ «работает на пользователе». Чтобы реально шипнуть инсталлер — нужно ~7–9 рабочих дней (~2 недели календарных) на блокеры + 5–10 дней на добивку видимых параити-гэпов. Tier-gating и AI-фичи строятся уже после.

---

## Часть 1. Сводка пяти аудитов

### A. Parity-аудит — топ-10 пробелов

| # | Пробел | Файл-источник в Railway | Effort |
|---|---|---|---|
| 1 | **Search Terms full inbox workflow** (snooze/pause/move/negative/track/rank/trends) | `frontend/src/components/analytics/SearchTerms/index.tsx` (508 LOC + 7 модалов) | L |
| 2 | **CampaignDetails: inline pause/resume + inline budget edit** | `views/CampaignDetails/index.tsx` header | S |
| 3 | **Settings → Books tab — реальный** (сейчас 53 LOC) | `settings/BookManagement/` (1015+178 LOC) | L |
| 4 | **Settings → AI tab — реальный** (сейчас 22 LOC, gates AIAdvisor + automation) | `settings/AISettings.tsx` (603 LOC) | M |
| 5 | **CampaignDetails KeywordsTable bulk-action bar** | `views/CampaignDetails/KeywordsTable.tsx` (1062 LOC) | L |
| 6 | **CampaignDetails Placement modifiers editor (TOS/ROS/PP per-week)** | `views/CampaignDetails/CampaignPlacements.tsx` (907 LOC) | L |
| 7 | **Keywords noise filter + bulk + virtualization** | `pages/KeywordsPage.tsx:104-107` | M |
| 8 | **Books KDP metrics inline + weekly metrics table** | `CampaignWeeklyMetrics.tsx` + `/api/books/:id/kdp-metrics` | L |
| 9 | **Royalty xlsx parser (local mode)** | TODO в `src/main/local-db/royalty.ts:111` | M |
| 10 | **Multipart upload IPC реально подключённый** к Royalty / Cover / Avatar | канал `media:upload` есть, fan-out нет | M |

Дополнительно (не блокирует, но вид у десктопа сейчас слабее веба):
- AIAdvisorPanel — preview-stub (482 LOC оригинал → 110 LOC desktop, без SSE)
- Reports: Hourly + Budget Pacing табов нет
- Operations Center: DnD нет (только select-status)
- Comparison: dimension switcher (campaign/keyword/placement/match-type) нет
- Calendar dropdown: mini-month grid + add-event нет
- Profile editing + avatar upload нет
- Excel/PDF export подключён только в Reports (хелпер `lib/export.ts` существует — раздать на Keywords/Campaigns/Books/SearchTerms)

### B. Production-readiness — ship-blockers

1. **macOS sign + notarize** — `assets/entitlements.plist` отсутствует, env-vars не заведены. Без notarization Gatekeeper покажет «damaged app» на скачанном .dmg.
2. **Windows authenticode** — `MakerSquirrel` без cert. SmartScreen блокирует.
3. **Auto-update** — `src/main/updater.ts` стаб; `electron-updater` не в deps; publisher не настроен.
4. **CrashReporter / unhandledRejection / uncaughtException / render-process-gone** — нет ни одного.
5. **CSP** — отсутствует в `src/index.html`; renderer тянет Google Fonts.
6. **electron-log + кнопка «Reveal log file»** — нет.
7. **`setAppUserModelId`** — нет (Windows ломает уведомления + pin + Squirrel start-menu).
8. **Backend-unreachable UX + 10s fetch timeout** — fetch без `AbortSignal.timeout`.
9. **Plain-token fallback** — `auth-store.ts:71-77` пишет токен в `auth-token.txt` если safeStorage недоступен — silent fallback.
10. **CI/CD pipeline** — нет `.github/workflows/release.yml`.
11. **OAuth state CSRF** — `AmazonAdsSection.tsx:87` не сверяет `state` с сохранённым.
12. **Архитектурные стабы** — `licensing.ts`, `telemetry.ts`, `release-env.md` создать сейчас, реальные ключи позже.

### C. Security/quality — критическое

1. **Дубль OAuth-redeemer**: `AmazonAdsSection.tsx:46-80` И `CredentialsTab.tsx:19` оба слушают deeplink → второй redeem 4xx → юзер видит «OAuth failed» при успехе. Удалить `AmazonAdsSection.tsx` (мёртвый файл) и `src/renderer/api/amazonAds.ts` дубли — оставить только `CredentialsTab` + `ProfilesTab`.
2. **Token compromise** — `at_live_29099c08…` в git (commit `7a18778`). Ротировать сегодня.
3. **Plain-token fallback path preferred forever after first write** — `auth-store.ts:55` проверяет plain-файл первым.
4. **Нет CSP**, нет process-level handlers (см. ship-blockers).
5. **Mock incomplete** в `src/test/mockApi.ts` — `mediaUpload`, `localRoyalty.*`, `update.*` отсутствуют (149/149 — иллюзия).
6. **`will-navigate` allows localhost in packaged build** — обернуть в `if (!app.isPackaged)`.
7. **`setPermissionRequestHandler` не задан** — renderer может запросить камеру/мик/notifications.
8. **`event.senderFrame` не проверяется** в `ipcMain.handle` — Electron docs рекомендуют.

### D. Новые фичи — топ-5 must-build (после production)

1. **Listing Studio** (title/subtitle/description/bullets/A+ angles, side-by-side, regenerate) — Pro tier, killer.
2. **Book P&L** (royalty + spend + print-cost + returns → net profit per ASIN per MP per day) — Start tier, данные уже есть.
3. **Auto-Negativator** (ночной скан search-term reports → правила → push в существующий NegativeListsTab) — Pro, пайплайн почти готов.
4. **Reverse-ASIN keyword mining** через Publisher Rocket MCP — Pro, MCP уже доступен.
5. **Command Palette → AI quick actions** («rewrite blurb of X», «explain spike on campaign Y») — Pro, минимальный билд.

Swing-for-the-fences: **Niche Explorer** (B1), **Manuscript Formatter** (G1), **Anonymized benchmarks** (H1).

### E. Tier gating — архитектура (резюме)

Pattern: **1Password HMAC-snapshot + Raycast cache-and-badge UX**.

```
Backend (authoritative)
  POST /api/me/entitlements (Bearer) → Entitlements{v,issued_at,expires_at,tier,subscription,features,sig}
  Любой paid endpoint → 403 {reason:'tier_required',feature}
        ↓ HTTPS net.fetch
Main process
  src/main/entitlements.ts: fetch + safeStorage cache + in-memory current + emit changed
  src/main/api-client.ts: 403 → trigger refresh + typed ApiError
        ↓ typed IPC (entitlements:get/refresh/onChange)
Renderer (UX only — НЕ gate)
  EntitlementsContext + useEntitlement(key) + <LockedFeature> + UpgradeModal
  Sidebar dim/badge, route guards, in-context upgrade nudges
```

Ключевая идея — `tier` это label, `features: Record<FeatureKey, FeatureState>` это контракт. Server резолвит tier→features; backend бэк меняет mapping без релиза клиента. Renderer-enforcement косметический; реальный gate — backend на каждом paid endpoint.

---

# Стратегия выполнения

Шесть фаз в порядке исполнения. Каждая — самодостаточный документ для отдельной сессии или параллельных агентов.

```
Phase I  → ship-blockers (security + signing + auto-update + crash + CSP)        [~1 неделя]
Phase J  → parity polish (видимые гэпы и стабы из A.1–A.10)                       [~1 неделя]
Phase K  → tier-gating skeleton (без реальных ключей)                             [~3 дня]
Phase L  → AI wave 1 (Listing Studio / Auto-Negativator / P&L / Reverse-ASIN / CmdK AI)  [~1.5 нед]
Phase M  → AI wave 2 (Niche Explorer / Brand Voice / Bid Co-pilot / Cover QA)     [~1.5 нед]
Phase N  → architecture-only stubs (licensing.ts / telemetry.ts / billing docs)   [~2 дня]
Phase O  → release-prep dry-run + bug-bash                                        [~3 дня]
```

**Параллелизация.** Каждая фаза имеет помеченные «лейн-таски» (lane A/B/C/...) которые можно отдать параллельным агентам в worktree-isolation. Координирующие файлы (`shared/ipc.ts`, `MainLayout.tsx`, `SettingsTabs.tsx`, `forge.config.ts`) — конфликт-зона; всегда мерджит coordinator после агентов.

---

# Phase I — Ship-blockers (production hardening)

**Цель.** Сделать `npm run make` → артефакт, который можно отдать пользователю и он откроет без warning'ов, увидит логи при крэше, получит auto-update.

## I.1 Lane A — Security baseline (фасад без сертов)
**Параллельно с I.2 / I.3 / I.4.**

**Файлы:**
- `src/index.ts` — добавить:
  - `setAppUserModelId('com.juli374.ads-tracker')` для Windows перед `createWindow`
  - `crashReporter.start({ submitURL: '', uploadToServer: false, productName: 'Ads Tracker' })` ДО `app.whenReady()`
  - `process.on('uncaughtException', err => log(err); dialog.showErrorBox(...))`
  - `process.on('unhandledRejection', err => log(err))`
  - `webContents.on('render-process-gone', (e, details) => прозрачный reload prompt)`
  - `session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(false))` (deny-by-default; allow-list пуст для personal-use)
  - `session.defaultSession.webRequest.onHeadersReceived` — инжект CSP (см. ниже)
  - `webPreferences`: явно выставить `nodeIntegration: false`, `webSecurity: true`, `allowRunningInsecureContent: false`
  - `will-navigate` — обернуть localhost-allow в `if (!app.isPackaged)`
- `src/index.html` — добавить мета `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' https://ads-tracker-production.up.railway.app; img-src 'self' data: https:; script-src 'self'">` (плюс заголовок через onHeadersReceived для совпадения)
- `assets/entitlements.plist` — **NEW**: минимальный (`com.apple.security.cs.allow-jit` если нужно, никаких `disable-library-validation`)
- `src/main/auth-store.ts:62-78` — изменить fallback: throw + log warn вместо silent plain-write; единственный путь активации — env `ADS_TRACKER_ALLOW_PLAIN_TOKEN=1`
- `src/renderer/components/AmazonAdsSection.tsx` — **DELETE** (мёртвый дубль)
- `src/renderer/api/amazonAds.ts` — оставить только то, что зовёт `CredentialsTab` + `ProfilesTab`; удалить дубль deeplink-handler

**Acceptance:**
- [ ] `grep -R "setPermissionRequestHandler" src/` → 1 hit
- [ ] `grep -R "Content-Security-Policy" src/` → ≥ 2 hits (meta + onHeadersReceived)
- [ ] `grep -R "uncaughtException" src/` → 1 hit
- [ ] `grep -R "AmazonAdsSection" src/` → 0 hits
- [ ] `npm test` зелёный (требует обновления mockApi — см. I.5)
- [ ] `npm run lint` clean
- [ ] `npm run package` собирается на arm64 + x64

## I.2 Lane B — electron-log + crash visibility
**Параллельно с I.1.**

**Файлы:**
- `package.json` — добавить `electron-log` в deps
- `src/main/logger.ts` — **NEW**: init electron-log с rotating file в `app.getPath('logs')/ads-tracker.log`, level=info, fileSize=2MB×5
- `src/index.ts` — импортировать и инициализировать в начале
- `src/preload.ts` — expose `window.api.log.error/warn/info` через IPC
- `src/main/ipc-handlers.ts` — handler `app:log` (валидация: level enum, message string, stripPII)
- `src/shared/ipc.ts` — добавить `AppLog` channel + `log` namespace в `DesktopApi`
- `src/renderer/components/ErrorBoundary.tsx:21` — заменить `console.error` на `window.api.log.error(...)` плюс scrub well-known token-prefixes (`at_live_`, `eyJ`, `Bearer`) перед записью
- `src/renderer/components/settings/ApplicationTab.tsx` — добавить кнопку «Reveal log file» → IPC `shell:showItemInFolder` (новый канал, безопасный)

**Acceptance:**
- [ ] Спровоцированный `throw new Error('test')` в renderer пишет в `logs/ads-tracker.log` через IPC
- [ ] Кнопка в Settings открывает Finder/Explorer на лог-файле
- [ ] PII-scrub проверен: запись `Bearer at_live_xxx` ⇒ `Bearer ***`

## I.3 Lane C — Auto-update wiring (electron-updater + GitHub Releases)
**Параллельно с I.1 / I.2.**

**Файлы:**
- `package.json` — `electron-updater` в deps
- `forge.config.ts` — расскоментировать `publishers: [{ name: '@electron-forge/publisher-github', config: { repository: { owner: 'Juli374', name: 'ads-tracker-desktop' }, prerelease: false, draft: true } }]`. Cписать env: `GH_TOKEN`. Заполнить `osxSign`/`osxNotarize` блоки (env: `APPLE_DEVELOPER_ID`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`). Заполнить `MakerSquirrel({ certificateFile: process.env.WIN_CSC_LINK, certificatePassword: process.env.WIN_CSC_KEY_PASSWORD })`.
- `src/main/updater.ts` — заменить стаб реальной имплементацией: `import { autoUpdater } from 'electron-updater'`; subscribe к `checking-for-update` / `update-available` / `update-not-available` / `error` / `download-progress` / `update-downloaded`; экспортировать `getStatus(): UpdaterState` + `checkForUpdates()`. Состояние держать в memory + emit через IPC pub/sub.
- `src/main/ipc-handlers.ts` — `update:getStatus` и `update:check` теперь возвращают реальный state
- `src/index.ts` — после `createWindow()` вызвать `initAutoUpdater(mainWindow)` (только если `app.isPackaged`)
- `src/renderer/components/UpdateChecker.tsx` — добавить состояния downloading/downloaded/error + кнопку «Restart to update» при `update-downloaded`
- Создать stable channel в `latest-mac.yml` / `latest.yml` через GitHub Releases на следующий тег

**Acceptance:**
- [ ] Локально (`npm run package`) — UpdaterChecker рисует «Auto-update disabled in dev»
- [ ] CI после создания тега `v0.x` собирает signed артефакт с `latest.yml` (см. I.6)
- [ ] Симуляция обновления: установка v0.0.1 → подмена version в latest.yml → app предлагает update

## I.4 Lane D — Network resilience + token lifecycle
**Параллельно с I.1 / I.2 / I.3.**

**Файлы:**
- `src/main/api-client.ts:69` — добавить `signal: AbortSignal.timeout(10_000)` в `net.fetch`. На AbortError возвращать `ApiError` с `code: 'TIMEOUT'`.
- `src/main/api-client.ts:83-92` — добавить 401 interceptor: при 401 — clear `auth-store` + IPC event `auth:expired` → renderer показывает LoginScreen + toast «Сессия истекла»
- `src/main/ipc-handlers.ts:123` — multipart fetch — те же 10s timeout
- `src/renderer/components/LoginScreen.tsx:25-36` — детектить `error.code === 'TIMEOUT'` и `error.status === 0` → дедикатед retry screen «Не удаётся достучаться до бэкенда: <host>. Проверьте интернет / нажмите Повторить»
- `src/renderer/contexts/AuthContext.tsx` — слушать `auth:expired` → автоматический signOut + redirect
- `src/renderer/components/AmazonAdsSection.tsx` … удалена в I.1; CSRF-state хранение для OAuth: `src/main/auth-store.ts` — добавить `writePendingOAuthState(state) / consumePendingOAuthState()` (в memory + safeStorage); `CredentialsTab.tsx` — генерировать random state перед `startOAuth`, проверять при deeplink redeem

**Acceptance:**
- [ ] Pull network out на 11s в LoginScreen → видим dedicated retry-экран, не raw error
- [ ] 401 с протухшим токеном → автоматически вернулись на LoginScreen
- [ ] OAuth с подменённым state → redeem отказывается + toast «Подозрительный callback»

## I.5 Lane E — Test mocks complete (закрыть «фейковый зелёный»)
**Параллельно со всеми.**

**Файлы:**
- `src/test/mockApi.ts:14-47` — добавить:
  - `mediaUpload: { upload: vi.fn().mockResolvedValue({ ok:true, data:{ url: 'https://...' } }) }`
  - `localRoyalty: { listUploads, listRecords, getSummary, importUpload, deleteUpload, filePath }` — все мокнуты в shape совпадающие с cloud
  - `update: { getStatus: vi.fn().mockResolvedValue({ state:'idle', enabled:false }), check: vi.fn() }`
  - `log: { error/warn/info: vi.fn() }`
  - `shell: { openExternal, showItemInFolder }`
- `src/test/mockApi.ts:30` — `apiBaseUrl: 'http://test.local'` → `'https://test.local'`
- Добавить smoke-тест в `__tests__/mockApi.coverage.test.ts` — проходится по всем полям `DesktopApi` через `Object.keys` и проверяет что mock покрывает все

**Acceptance:**
- [ ] `Object.keys(window.api).every(k => k in mockApi)` ≡ true
- [ ] `npm test` 149/149 → ≥ 152/152 (3 новых coverage-теста)

## I.6 Lane F — CI/CD pipeline (Github Actions)
**После I.3 (нужны publisher-секреты).**

**Файлы:**
- `.github/workflows/release.yml` — **NEW**: matrix [macos-14, windows-2022, ubuntu-22.04]; trigger `on: push: tags: [v*]`; jobs:
  - `build`: `npm ci`, `npm run lint`, `npm test`, `npm run package`, `npm run make`, `npm run publish`
  - secrets: `APPLE_DEVELOPER_ID`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`, `GH_TOKEN`
- `docs/electron-migration/release-env.md` — **NEW**: документ обо всех env-vars (где взять, где хранить, что ломается без неё)
- `docs/electron-migration/release-runbook.md` — **NEW**: шаги релиза (тег → CI → проверка артефакта → publish из draft → проверка auto-update)

**Acceptance:**
- [ ] CI пробегает зелёный до `make` без секретов (на push в feature-branch)
- [ ] При тегировании `v0.0.1-rc.1` (с реальными секретами в repo settings) — собирается signed артефакт + draft release

## I.7 Lane G — Branding finishing touches
**Параллельно с I.1.**

**Файлы:**
- `assets/icon.iconset/` — добавить недостающие `512x512`, `1024x1024` PNG (если отсутствуют). Переэкспортить .icns/.ico
- `src/index.ts` — `app.setName('Ads Tracker')`, `app.setAboutPanelOptions({ ... })` (mac native About)
- `src/renderer/components/settings/ApplicationTab.tsx` — добавить «About» секцию: версия (`window.api.app.getVersion()`), commit SHA (через webpack DefinePlugin: `process.env.GIT_COMMIT`), license info, ссылка на https://github.com/Juli374/ads-tracker-desktop
- `webpack.main.config.ts` + `webpack.renderer.config.ts` — `new DefinePlugin({ 'process.env.GIT_COMMIT': JSON.stringify(execSync('git rev-parse --short HEAD').toString().trim()) })`

**Acceptance:**
- [ ] About в Settings показывает корректную версию + SHA
- [ ] Native About panel на mac работает

## I.8 Acceptance Phase I (overall)
- [ ] `npm test` ≥ 155/155 (149 + 3 mock-coverage + 3 i.x smoke)
- [ ] `npm run lint` clean
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run package` собирается локально (без сертов — unsigned artefact)
- [ ] CI зелёный на feature-branch
- [ ] Дев-build реагирует на:
  - локальный crash (throw в renderer) → лог в файле, error-screen с PII-scrub
  - оффлайн → dedicated retry screen на LoginScreen
  - 401 → авто-логаут
- [ ] Token `at_live_29099c08…` ротирован на Railway (внешняя задача — пометить в README)

**Параллелизация Phase I.** I.1/I.2/I.3/I.4/I.5/I.7 — 6 lane-tasks для параллельных агентов. I.6 — после I.3. Координирующие файлы (`shared/ipc.ts`, `index.ts`, `forge.config.ts`) — coordinator merge.

**Estimated:** ~7 рабочих дней (6 агентов × 1 день + 1 день coordinator).

---

# Phase J — Parity polish (видимые гэпы и stub-добивка)

**Цель.** Закрыть пробелы из Часть 1.A + сделать заглушки Settings реальными. После этой фазы — реально не стыдно показать.

## J.1 Lane A — Search Terms inbox workflow [L]
**Файлы:**
- `src/renderer/pages/SearchTermsPage.tsx` — переписать: tabs Inbox/Snoozed/Done/Paused/Archive/All с counts; bulk-select-bar (pause / snooze / move / negative / track); intgrate `<NegativeListsTab>` в правую панель
- `src/renderer/components/searchTerms/SnoozeModal.tsx` — **NEW**: 1d/3d/7d/until-date
- `src/renderer/components/searchTerms/PauseModal.tsx` — **NEW**: pause keyword/target reasoning
- `src/renderer/components/searchTerms/MoveModal.tsx` — **NEW**: move into another ad-group
- `src/renderer/components/searchTerms/RankHistoryModal.tsx` — **NEW**: line-chart of position over time (если backend имеет endpoint; иначе заглушка)
- `src/renderer/components/searchTerms/TrendModal.tsx` — **NEW**: clicks/spend/orders по дням (если backend имеет endpoint; иначе заглушка)
- Reference (читаем, не копируем): `/Users/yuliiparfonov/ads-tracker/frontend/src/components/analytics/SearchTerms/`

**Acceptance:**
- [ ] 5 табов с count badges
- [ ] Bulk select → bulk pause через одну операцию
- [ ] Snooze persisted (через backend status field или localStorage если бэк не поддерживает)
- [ ] 4–5 новых тестов в `__tests__/searchTerms.workflow.test.tsx`

## J.2 Lane B — CampaignDetails inline ops [S+L]
**Файлы:**
- `src/renderer/pages/CampaignDetailsPage.tsx` — добавить в header inline pause/resume button (icon-button, optimistic update + revert on error) и inline budget edit через `EditableNumber` (компонент уже есть в `components/ui/`)
- `src/renderer/components/campaigns/KeywordsTable.tsx` — **NEW** (вынести из CampaignDetailsPage TargetsTab): columns с inline-edit, status toggle column, bulk-select-bar с операциями (pause/resume / change bid ×N% / change bid +$N / add to negative / move to ad-group)
- `src/renderer/components/campaigns/CampaignPlacements.tsx` — **NEW**: per-placement edit (TOS/PP/ROS) c per-week breakdown (если бэк отдаёт `/api/campaigns/:id/placement-history`); если нет — single edit как сейчас
- Reference: `/Users/yuliiparfonov/ads-tracker/frontend/src/components/views/CampaignDetails/{KeywordsTable,CampaignPlacements}.tsx`

**Acceptance:**
- [ ] Inline pause/resume на CampaignDetailsPage header работает (network mock)
- [ ] Bulk select 5 keywords → «Изменить бид ×0.8» → один POST `/api/targets/bulk-update`
- [ ] Placement editor показывает 3 поля + (если бэк отдаёт) per-week chart

## J.3 Lane C — Settings real implementations [M+L+L]
**Файлы:**
- `src/renderer/components/settings/AITab.tsx` — переписать со stub'а 22 LOC: form для Claude API key (`POST /api/settings/ai-key` или localStorage в personal-use), 4 model slot'а (default-model для completion / vision / etc.), test-button «Сделать пробный запрос», status (key valid / invalid / not configured)
- `src/renderer/components/settings/books/index.tsx` — переписать со stub'а 53 LOC: list books с inline edit (title / author / language / series), bulk delete, link на BookDetails (для drilldown), import-CSV
- `src/renderer/components/settings/StreamTab.tsx` — добавить countdown timer + history pagination
- `src/renderer/components/settings/searchTerm/index.tsx` (если есть) — добавить queue tab + coverage grid (B.7 материал — проверить что зашиплено реально)
- Reference: `frontend/src/components/settings/{AISettings,BookManagement,StreamSettings}.tsx`

**Acceptance:**
- [ ] AITab имеет real form, persist в безопасном месте, test-button показывает результат
- [ ] BooksTab показывает реальный список (не placeholder), inline edit работает на title
- [ ] StreamTab показывает countdown до next sync

## J.4 Lane D — Royalty xlsx parser + multipart pipe [M+M]
**Файлы:**
- `src/main/local-db/royalty.ts:111` — заменить TODO реальной имплементацией: парсить с использованием `xlsx` lib (уже в deps), валидировать через `sanitizeImport`, возвращать count + warnings; при ошибке throw `RoyaltyParseError` с деталями
- `src/main/local-db/xlsxParser.ts` — экстракт логики (если ещё не экстрактна); поддержка двух KDP-форматов: monthly royalty + sales dashboard CSV
- `src/renderer/pages/RoyaltiesPage.tsx` (Local mode) — добавить «Import xlsx» button → native `dialog.showOpenDialog` (через IPC) → preview rows → confirm → store
- `src/renderer/components/books/UploadCoverModal.tsx` — переключить с stub на реальный multipart upload через `window.api.mediaUpload.upload(path, file)`
- `src/main/ipc-handlers.ts:123` (multipart `media:upload`) — проверить что валидация payload устойчива к large files (>10MB → reject)

**Acceptance:**
- [ ] Local Royalty: импорт реального .xlsx из KDP → видны записи в таблице
- [ ] Cover upload: загрузить .png 2MB → URL обновляется в Books

## J.5 Lane E — Keywords / Books polish [M+L]
**Файлы:**
- `src/renderer/pages/KeywordsPage.tsx` — добавить noise filter (min-targets-per-campaign + max-CPC slider); bulk-action toolbar; виртуализация через `@tanstack/react-virtual` (`npm i @tanstack/react-virtual`)
- `src/renderer/pages/BooksPage.tsx` (или `components/books/`) — добавить KDP metrics inline (royalty/page, BE-ACOS, max-CPC) — endpoint `POST /api/books/:id/kdp-metrics` (если бэк отдаёт; иначе compute client-side из royalty + page-count)
- `src/renderer/components/books/CampaignWeeklyMetrics.tsx` — **NEW**: транспонированная таблица (колонки = недели, строки = метрики)

**Acceptance:**
- [ ] KeywordsPage с 5000 mock-rows scroll'ит без джанков (виртуализация)
- [ ] Bulk pause 50 keywords → один POST
- [ ] Books drill: видим row «Royalty/page» / «BE-ACOS» / «Max CPC» с числами

## J.6 Lane F — Reports + Comparison + Export polish [M+M+S]
**Файлы:**
- `src/renderer/pages/ReportsPage.tsx` — добавить tabs: **Hourly** (379 LOC reference), **Budget Pacing** (276 LOC reference); каждая → отдельный компонент в `components/reports/`
- `src/renderer/pages/ComparisonPage.tsx` — добавить dimension switcher (book / campaign / keyword / placement / match-type), wire to existing `summaryByX`
- Раскатить `lib/export.ts` (xlsx/pdf/csv хелперы уже есть) на:
  - `KeywordsPage.tsx` (export button)
  - `CampaignsPage.tsx`
  - `BooksPage.tsx`
  - `SearchTermsPage.tsx`
  - `RoyaltiesPage.tsx`

**Acceptance:**
- [ ] Hourly tab отдаёт chart + table per-hour
- [ ] Comparison: переключение dimension → все KPI / таблица перерисовывается
- [ ] Export → xlsx скачивается на 5 страницах

## J.7 Lane G — Operations / Calendar / Profile / AIAdvisor real [M+M+M+XL]
**Файлы:**
- `src/renderer/pages/OperationsCenterPage.tsx` — добавить DnD (`react-dnd` + `react-dnd-html5-backend`), `EditTaskModal.tsx` (NEW), subtasks, KPI row
- `src/renderer/components/CalendarBell.tsx` + `CalendarDropdown.tsx` (NEW) — mini-month grid, AddEventModal (NEW), navigate-to-operations link
- `src/renderer/pages/ProfilePage.tsx` — **NEW** route + `G I` хоткей; форма name/email; avatar upload через multipart IPC
- `src/renderer/components/campaigns/AIAdvisorPanel.tsx` — реальная имплементация (482 LOC reference): chat-like UI, SSE streaming через main-process IPC `ai:stream` (новый канал; backend endpoint `/api/ai/advisor/stream` если есть; иначе non-streaming POST с polling)

**Acceptance:**
- [ ] DnD работает в Operations
- [ ] AddEvent в Calendar создаёт событие
- [ ] Avatar uploaded и виден в UserMenu
- [ ] AIAdvisorPanel показывает реальный ответ Claude (через `Settings → AI tab` ключ)

## J.8 Acceptance Phase J
- [ ] Все 10 пробелов из Часть 1.A закрыты или явно отложены с причиной
- [ ] Settings AI/Books/Stream — не стабы
- [ ] `npm test` ≥ 175 (J добавит ~20 тестов)
- [ ] Pre-flight (lint/tsc/package) clean

**Параллелизация Phase J.** J.1–J.7 = 7 lane-tasks. Координирующие файлы (`MainLayout.tsx`, `NavContext.tsx`, `CommandPalette.tsx`, `SettingsTabs.tsx`) — coordinator merge.

**Estimated:** ~10 рабочих дней (7 lanes × ~1.5 дня + 2 дня coordinator + bug-fix).

---

# Phase K — Tier-gating skeleton (без реальных ключей)

**Цель.** Положить архитектуру entitlements в код. Server возвращает stub `{tier:'pro', features:{...all on}}`; UI рисует Lock-states и UpgradeModal. Подключение Stripe/Paddle и backend-enforcement — следующая стадия.

## K.1 Lane A — Shared schema + main process

**Файлы:**
- `src/shared/entitlements.ts` — **NEW**: `Tier`, `FeatureKey` (12 keys из §B.6), `FeatureState`, `Entitlements{v,issued_at,expires_at,user_id,tier,subscription,features,sig}`, `EMPTY_ENTITLEMENTS`, `isFeatureOn(e, key) → boolean | trial`
- `src/shared/ipc.ts` — добавить `EntitlementsGet`, `EntitlementsRefresh`, `EntitlementsChanged` (push), `entitlements` namespace в `DesktopApi`
- `src/main/entitlements.ts` — **NEW**: `loadCached()` / `saveCache()` (safeStorage `entitlements.bin`), `fetchEntitlements()` (GET `/api/me/entitlements`), `getCurrent()`, `subscribe(cb)`, периодический refresh каждые 30 мин при focus
- `src/main/ipc-handlers.ts` — handlers; on `AuthSetToken` → trigger `fetchEntitlements`; on logout → clear; pipe `subscribe` to `webContents.send('entitlements:changed', e)`
- `src/preload.ts` — expose `window.api.entitlements.get/refresh/onChange`
- `src/main/api-client.ts:83-92` — на 403 с body `{reason:'tier_required',feature}` — non-blocking refresh + ApiError с `code:'TIER_REQUIRED'`

**Acceptance:**
- [ ] При первом login — main делает GET `/api/me/entitlements` (или fallback на `EMPTY_ENTITLEMENTS` если 404 — backend пока не реализован)
- [ ] Cache переживает рестарт
- [ ] `entitlements:changed` ивент диспатчится при refresh

## K.2 Lane B — Renderer integration + UpgradeModal

**Файлы:**
- `src/renderer/contexts/EntitlementsContext.tsx` — **NEW**: Provider; initial fetch via IPC; subscribe to onChange; expose `entitlements`, `tier`, `isOn(key)`, `refresh()`. Mount под `AuthProvider` в `App.tsx`
- `src/renderer/hooks/useEntitlement.ts` — **NEW**: `useEntitlement('ai.title_generator') → { on: boolean, state: FeatureState, tierRequired: Tier }`
- `src/renderer/components/LockedFeature.tsx` — **NEW**: wraps children; props `feature`, `mode='dim'|'hide'|'badge'`; click while locked → `UpgradeModal`
- `src/renderer/components/UpgradeModal.tsx` — **NEW**: plan comparison (Start / Pro / Business — статичная таблица фич); CTA «Upgrade» → `window.api.shell.openExternal('https://ads-tracker.app/billing?from=feature&u=<user_id>')`
- `src/renderer/contexts/AuthContext.tsx` — на signOut → entitlements.refresh; на successful login → trigger refresh
- `src/renderer/App.tsx` — mount `<EntitlementsProvider>` под `<AuthProvider>`
- `src/renderer/components/MainLayout.tsx` — sidebar items консультируют `useEntitlement` → dim/badge locked sections (НЕ скрывают)

**Acceptance:**
- [ ] Mock backend отдаёт `tier:'start'` → AIAdvisorPanel димится, click → UpgradeModal
- [ ] Mock отдаёт `tier:'pro'` → unlocked
- [ ] Sidebar показывает «Pro» badge на locked items

## K.3 Lane C — Wrap concrete features (механика)

**Файлы (применить wrap → 8–10 точек):**
- `src/renderer/components/campaigns/AIAdvisorPanel.tsx` — `<LockedFeature feature="ai.advisor_panel">…`
- `src/renderer/components/campaigns/HourlyDynamicsChart.tsx` — `useEntitlement('analytics.hourly_dynamics')` + skeleton+nudge
- `src/renderer/components/campaigns/MultiPeriodMetricsTable.tsx` — `useEntitlement('analytics.multi_period_metrics')`
- `src/renderer/pages/AutomationPage.tsx` — route guard top
- `src/renderer/components/GlobalFilters.tsx` — `marketplace.multi`: limit selector to 1 для start; до 3 для pro; unlimited для business
- `src/renderer/pages/RoyaltiesPage.tsx` — `royalties.advanced_breakdown` (per-country tab)

(остальные feature gates добавляются по мере роста фич; Phase L/M будут wrap'ить новые AI-фичи сразу при создании)

**Acceptance:**
- [ ] Тест `__tests__/locked-features.test.tsx` — для каждой feature key с `tier:'start'` рендер `LockedFeature` badge; с `tier:'pro'` — реальный компонент

## K.4 Acceptance Phase K
- [ ] Schema + main + renderer plumbing — зашиплено
- [ ] Wrap'нуто ≥ 6 точек (см. K.3)
- [ ] Mock backend (или временный constant в `entitlements.ts`) даёт переключаемое `tier:'start'` для дев-режима через env `ADS_TRACKER_FORCE_TIER=start|pro|business`
- [ ] `npm test` ≥ 180

**Параллелизация Phase K.** K.1 → блокирует K.2 (renderer ждёт shared types). K.2 ‖ K.3. Coordinator merge на shared/ipc + App.tsx.

**Estimated:** ~3 рабочих дня (K.1 day-1, K.2+K.3 day-2/3 параллельно).

---

# Phase L — AI features wave 1 (после Phase I + K)

**Цель.** Шипнуть пять фич, которые сделают десктоп killer-tool: Listing Studio, Auto-Negativator, Book P&L, Reverse-ASIN, Command Palette AI.

## L.1 Lane A — Listing Studio (Pro tier) [L]
- `src/renderer/pages/ListingStudioPage.tsx` или вкладка в Books drill — **NEW**
- IPC + main: `ai:generate` channel — `{ task: 'title'|'subtitle'|'description'|'bullets'|'aPlus', context: { asin, currentTitle, niche } } → AsyncIterable<string>` (SSE)
- main: `src/main/ai/anthropic.ts` — обёртка над Anthropic SDK, ключ из `AITab` config / safeStorage; system prompts per task
- Side-by-side current vs proposed, regenerate, variant history (localStorage `listing-studio:variants:<asin>`)
- Wrap в `<LockedFeature feature="ai.title_generator">`

**Acceptance:** ввод ASIN → AI streamит новую версию title; rationale показан; кнопка «Применить» делает PATCH `/api/books/:id`.

## L.2 Lane B — Auto-Negativator (Pro) [M]
- `src/main/automation/auto-negativator.ts` — **NEW**: ночной cron (electron `setTimeout` или `node-cron`), при `ADS_TRACKER_AUTO_NEG=on` env: GET `/api/search-terms?attribution=14d` → правила (zero-sale + N clicks; ACOS > target × 1.5 + Z orders) → создаёт pending recommendations через POST `/api/automation/recommendations`
- `src/renderer/pages/AutomationPage.tsx` — push карточки с reason + одним кликом apply → existing `NegativeListsTab` flow
- В Settings → AI tab: чекбокс «Включить ночное сканирование» + правила-thresholds

**Acceptance:** mock-данные показывают рекомендацию «Add 'kindle unlimited free' as negative — 12 кликов, 0 заказов»; one-click apply → запись в minus-list.

## L.3 Lane C — Book P&L (Start tier!) [M]
- `src/renderer/pages/PnLPage.tsx` — **NEW** (или промоутить `AccountingPage` → `AccountingPnLPage`); хоткей `G $`
- Считать клиентом: `(royalty[asin,date] - spend[asin,date] - print_cost*orders - returns) → net_profit`
- Per-book per-marketplace per-day matrix view; сортировка по profit; chart trend
- В отличие от других AI-фич — **бесплатная**: data plumbing for Pro upsell

**Acceptance:** видим P&L таблицу с реальными числами для seed-data; rolling 30-day chart; export xlsx.

## L.4 Lane D — Reverse-ASIN keyword mining (Pro) [M]
- В `KeywordsPage` — новая sub-tab «Reverse ASIN»
- IPC + main: `pr:reverseAsin` channel — wraps Publisher Rocket MCP `pr_reverse_asin` (auth через user-supplied PR session — добавить поле в Settings → AI tab)
- UI: ввод ASIN → таблица найденных keywords с estimated traffic → checkbox-bulk + кнопка «Send to ad group» (выбрать campaign + ad group в drop-down) или «Add to negatives»

**Acceptance:** ввод ASIN B0XXX → список keywords; «Send to ad group» создаёт targets через `POST /api/ad-groups/:id/targets/bulk`.

## L.5 Lane E — Command Palette AI quick actions (Pro) [S]
- `src/renderer/components/CommandPalette.tsx` — расширить: AI-команды («ai-rewrite-blurb», «ai-explain-spike», «ai-suggest-negatives») с иконкой Sparkles
- При выборе → main вызывает `ai:generate` с current page context (которое provider provided через Context); результат показывается inline в Palette → confirm-apply

**Acceptance:** Cmd+K → «explain ACOS spike on campaign X» → AI text появляется в Palette + ссылка «Открыть детали».

## L.6 Acceptance Phase L
- [ ] 5 новых фич в коде
- [ ] AI-фичи требуют ключ Claude из Settings AI; ошибка-state показан если ключ не сконфигурен
- [ ] Tier-wrap'нуто согласно §E.tier mapping (4 из 5 в Pro, P&L в Start)

**Параллелизация:** все 5 lanes параллельно (если Phase K + AI-key infrastructure из J.3 готовы).

**Estimated:** ~7 рабочих дней.

---

# Phase M — AI features wave 2

После Phase L закрыта. Прицел: Niche Explorer, Brand Voice, Bid Co-pilot, Cover QA, Weekly Briefing.

## M.1 Niche Explorer (B1) [L, Pro]
- `src/renderer/pages/ResearchPage.tsx` (новый sidebar item «Research», `G E`)
- Запрос → top 20 ASINs из PR MCP (`pr_keyword_search` + `pr_competition_*`) → BSR-to-revenue estimate (формула из K-lytics-style; задокументировать), saturation score, weak-cover flag, page-count, age, review velocity

## M.2 Brand Voice (A3) [M, Pro]
- В `Settings → AI tab` — раздел «Author voice profile»: POV, tone words, banned words, genre tropes
- Per-series style guide (extends profile)
- Все AI-промпты из L.x подмешивают этот profile

## M.3 Bid Co-pilot (C1) [L, Pro]
- Промоут `AIAdvisorPanel` (J.7) → расширить в bulk-apply table: «Снизить бид 12% на этих 8 keywords» → одним кликом BULK PATCH через existing targets API

## M.4 Cover QA checker (G2) [M, **Start tier giveaway**]
- Загрузить PNG/JPG → `sharp` или Image-magick проверки: DPI, bleed, spine, color profile (CMYK warn), low-contrast title-on-image, thumbnail legibility (resize to 280px и re-render)

## M.5 Weekly Author Briefing (D2) [M, Pro]
- main: weekly cron → GET все KPI → AI-summary (gated to <300 words, prompt в `ai/prompts/weekly-briefing.md`) → push notification + email через transactional service (placeholder; реальный поставщик — позже)

**Acceptance Phase M:** 5 фич в коде. Каждая wrap'нута. Tests ≥ 200.

**Estimated:** ~7 рабочих дней.

---

# Phase N — Architecture-only stubs (licensing / telemetry / billing docs)

**Цель.** Положить файлы и interface в код, чтобы при подключении реальных ключей не пришлось рефакторить.

**Файлы:**
- `src/main/licensing.ts` — **NEW** stub: интерфейс `verifyLicense(token): Promise<{valid:boolean, tier:Tier, expiresAt:string|null}>` → пока возвращает `{valid:true, tier:'pro', expiresAt:null}` (или из env `ADS_TRACKER_FORCE_TIER`)
- `src/main/telemetry.ts` — **NEW** stub: интерфейс `track(event, props)` / `init(consent)` → no-op + console.log в dev
- `src/renderer/components/settings/PrivacyTab.tsx` — **NEW**: telemetry consent toggle (events / crash); persist в `local-db`
- `docs/electron-migration/billing.md` — **NEW**: схема Stripe/Paddle webhook → backend `/api/license/issue` → клиент GET entitlements; не реализуется в десктопе, только описывается
- `docs/electron-migration/release-env.md` — обновить (добавить `SENTRY_DSN`, `STRIPE_WEBHOOK_SECRET`, `LICENSE_HMAC_SECRET`)
- `forge.config.ts` — добавить `extraResource: ['./assets/license-template.pdf']` если нужен license-файл в installer

**Acceptance:**
- [ ] All stubs typecheck
- [ ] `Settings → Privacy` показывает работающие toggles (state в local-db)
- [ ] `docs/electron-migration/{billing,release-env}.md` полные

**Estimated:** ~2 дня.

---

# Phase O — Release-prep dry-run + bug-bash

**Цель.** Шипнуть `v0.1.0-rc.1` для тестового пользователя.

**Шаги:**
1. Включить кеширование в Anthropic API (если AI-фичи активно используются — учесть стоимость)
2. Финальный регресс:
   - `npm test` ≥ 200/200
   - `npm run lint` clean
   - `npx tsc --noEmit` clean
   - `npm run package` локально (mac arm64 + x64; win x64) — собирается без ошибок
   - Manual smoke checklist (50 пунктов; см. ниже)
3. CI релиз:
   - `git tag v0.1.0-rc.1`
   - GitHub Actions matrix → signed артефакты + draft release
   - Скачать .dmg → открыть на тестовой машине без dev-tools
   - Login flow → token paste → main UI
   - Несколько ключевых workflow (создать кампанию, посмотреть Dashboard, exec AI generate, signOut)
4. Bug-bash → P0/P1 фиксы → `v0.1.0-rc.2` → repeat → `v0.1.0`

**Smoke checklist:**
- [ ] Установка из .dmg — нет «damaged app»
- [ ] Первый запуск — LoginScreen
- [ ] Token paste → Dashboard со skeleton'ами → реальные данные
- [ ] Sidebar: 14+ пунктов, все хоткеи работают
- [ ] Каждая страница — рендерится без ошибок при пустом ответе бэка
- [ ] OAuth Amazon → Settings → CredentialsTab → connect → видим profile
- [ ] CampaignDetails → inline pause → optimistic update
- [ ] Search Terms → bulk select 5 → add to negatives
- [ ] AI Listing Studio → ввод ASIN → streaming response
- [ ] Royalty Local → import xlsx → видим строки
- [ ] Settings → AI key set → test → success
- [ ] Force quit (Cmd+Q) → перезапуск → состояние восстановлено (token в keychain)
- [ ] Pull network → LoginScreen retry-screen
- [ ] Symlink locale в `~/Library/Logs/...` — лог пишется
- [ ] Update prompt (mock latest.yml) → Restart to update
- [ ] Crash в renderer (через console: `setTimeout(() => { throw new Error('test'); }, 0)`) → ErrorBoundary screen → лог записан → нет PII в displayed message

**Estimated:** ~3 дня.

---

# Часть 2. Auto-execute правила для параллельных агентов

**Best-practices из Phase R + сегодняшнего опыта (см. memory `feedback_parallel_agents.md`):**

1. **Worktree isolation — best-effort, не гарантия.** Перед запуском agent'а явно указать `isolation: 'worktree'`, но всегда проверять `git status` в основном репо после merge. 2/6 агентов сегодня писали в main directly.
2. **Координирующие файлы — не отдавать параллельно.** `shared/ipc.ts`, `MainLayout.tsx`, `SettingsTabs.tsx`, `forge.config.ts`, `NavContext.tsx`, `CommandPalette.tsx`, `App.tsx` — coordinator merge.
3. **Каждое lane-task self-contained:** prompt должен включать (a) список файлов, (b) acceptance, (c) команды для верификации, (d) что делать при конфликте.
4. **Мердж-протокол:** при конфликте — приоритет coordinator. Дубль типов (как сегодняшний `MediaUpload`) — отдельный dedup commit.
5. **Phase R-style review.** После каждой фазы — параллельный security-auditor + code-analyzer + perf-analyzer (см. `feedback_reviewers.md` — этот паттерн дал 30 находок за ~2 минуты).
6. **Token rotation pre-check.** Перед каждой Phase: убедиться что `at_live_29099c08…` ротирован (или явный TODO).
7. **CSP / no plain-token / no console.log of token / no hardcoded URL.** ESLint — добавить custom rule перед Phase J (см. ниже отложенные TODO).

---

# Часть 3. Risk register

| Риск | Severity | Mitigation |
|---|---|---|
| Token `at_live_29099c08…` в git | High | Ротировать на Railway сегодня; репо приватное — приостановить публичный push до ротации |
| Apple Developer cert procurement (~$99/год + ~1 неделя) | High | Стартовать Phase I.1 — заявка одновременно с I.6 |
| Windows code-signing cert ($300+/год OV или Azure Trusted Signing) | Medium | Решить на Phase I.6: либо OV cert, либо Azure Trusted Signing, либо отложить Windows-релиз на v0.2 |
| Anthropic API cost spike при активном использовании AI-фич | Medium | Внедрить prompt caching в `src/main/ai/anthropic.ts`; rate-limit per-user; отключить через Settings |
| PR MCP (Publisher Rocket) — third-party зависит от user-supplied session | Medium | Wrap в try/catch + clear error «PR session expired — reconfigure in Settings» |
| Amazon TOS scraping risk (Niche Explorer / Competitor Tracker) | High | Использовать только PA-API с user-supplied keys; throttle hard; gate за tier Business |
| Goodreads scraping ToS | Medium | Только manual paste / RSS / opt-in; не auto-scrape |
| AI-generated content disclosure (Amazon правило с 2023) | Medium | UI-prompt при использовании Listing Studio: «Не забудь disclose AI» |
| Manuscript Formatter font licensing | Medium | SIL OFL только; явная document'ация в `docs/electron-migration/fonts.md` |
| `safeStorage` keychain unavailable в headless / locked session | Low | Уже исправлено в I.1 (throw вместо silent plain-write) |
| OAuth state CSRF | Low | Исправлено в I.4 (PendingOAuthState write/consume) |

---

# Часть 4. Что НЕ делаем

| Фича | Причина |
|---|---|
| Stripe/Paddle UI in-app | `shell.openExternal` only; checkout — на web app |
| KDP login automation / scraping KDP dashboard | Hard no — ToS violation. Только CSV import. |
| Review reply auto-post в Amazon | ToS — author replies блокированы; только draft + manual paste |
| WebView для billing | Heavy + security; не нужно при `openExternal` |
| In-app keyboard shortcuts editor | Postpone — статичные хоткеи достаточны |
| Multi-user / team / shared-workspace | Personal-use scope (есть в parity-plan «не делаем») |
| Mobile companion app | Out of scope полностью |

---

# Часть 5. Точка входа в новой сессии

1. Открыть этот файл, найти первую фазу без `[ЗАКРЫТА]`.
2. Прочитать `parity-plan.md` (предыстория) + `CLAUDE.md` (security baseline + IPC rules) + `electron-knowledge-base/atlas/00-INDEX.md` (KB).
3. Запустить pre-flight checklist (см. `parity-plan.md:32`).
4. Для каждой lane-task в фазе:
   - Если задача self-contained → запускать в worktree-isolation (см. §«Auto-execute правила»).
   - Если координирующий файл → main session.
5. После завершения lane-task — coordinator merge → проверить `git diff` на дубли типов и stale imports → при необходимости dedup commit.
6. После завершения фазы — parallel review (security-auditor + code-analyzer + perf-analyzer) → закрыть P0/P1 находки → пометить `[ЗАКРЫТА YYYY-MM-DD]`.

---

# История

- **2026-05-10** — мастер-план создан после параллельного 5-агентного аудита (parity, production-readiness, новые фичи, tier-gating, security/quality). Источник для следующих сессий + параллельной агентной работы. Ожидаемая длительность всех фаз `I → O` ~6 недель календарных.
