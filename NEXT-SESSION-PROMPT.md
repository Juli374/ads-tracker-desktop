# Промпт для следующей сессии — ads-tracker-desktop до 60%

Открой Claude Code в `/Users/yuliiparfonov/ads-tracker-desktop/`. Затем скопируй блок ниже и вставь в чат как первое сообщение.

---

## ⬇️ Скопировать всё ниже этой строки ⬇️

Контекст и задача.

Это Electron desktop-клиент для Ads Tracker. **Только клиент** — бэкенд (Flask + Neon PostgreSQL) живёт в `/Users/yuliiparfonov/ads-tracker/` и сюда не входит. Архитектура и правила — в `CLAUDE.md` корня репозитория, прочитай его сразу.

**Текущее состояние (≈ 15-20% готовности):**
- ✅ Готов: Electron skeleton, security baseline, auth flow (TokenPasteScreen → safeStorage), типизированный IPC, API client (`net.fetch`), MainLayout (sidebar + topbar), полноценный DashboardPage с KPI и таблицей книг
- ❌ Placeholder'ы (по 11 строк каждый): BooksPage, CampaignsPage, SearchTermsPage, ReportsPage, SettingsPage

**Цель этой сессии — довести проект до ~60% готовности.** То есть:
1. Наполнить 5 placeholder-страниц реальной функциональностью на основе существующего Railway backend.
2. При необходимости расширить API client (`src/renderer/api/`) и IPC контракт (`src/shared/ipc.ts`).
3. Сохранить визуальный язык DashboardPage и MainLayout — они эталон.
4. Не трогать backend и `electron-knowledge-base/` (это read-only справочник).

**Жёсткие правила (нарушать нельзя):**
- Security baseline неприкосновенен: `contextIsolation: true`, `sandbox: true`, никаких `nodeIntegration`, никаких `webSecurity: false`. Перед изменением `src/index.ts` — проверь `electron-knowledge-base/atlas/core/03-security.md`.
- IPC только typed: новые каналы добавляются сначала в `src/shared/ipc.ts`, потом handler в `src/main/ipc-handlers.ts`, потом expose в `src/preload.ts`.
- Все HTTP — через `src/main/api-client.ts`, никогда из renderer'а напрямую.
- Никаких изменений в backend (`/Users/yuliiparfonov/ads-tracker/`).
- Никакого Cloudscape. Только Tailwind 3 + lucide-react. Палитра zinc.

**Стек (уже зафиксирован):**
- Electron 41, React 18, TypeScript 5.4, Tailwind 3.4, lucide-react ^1.14, electron-forge 7.11 с webpack template
- Базовый URL backend: `https://ads-tracker-production.up.railway.app` (хардкод в `src/main/api-client.ts:5`, override через env `ADS_TRACKER_API_URL`)
- Auth: JWT в `safeStorage`, передаётся как `Authorization: Bearer <token>`

**Backend endpoints, которые понадобятся (все уже работают в Railway):**
| Страница | Endpoints для использования |
|---|---|
| BooksPage | `/api/books`, `/api/metrics/summary/by-book` |
| CampaignsPage | `/api/campaigns`, `/api/metrics/by-campaign` (есть в `backend/routes/campaigns.py` и `metrics.py`) |
| SearchTermsPage | `/api/search_terms` |
| ReportsPage | `/api/metrics/*` для агрегаций, `/api/profile` для контекста |
| SettingsPage | `/api/auth/me` для проверки токена, `/api/profile` для пользователя |

Точные сигнатуры — в `/Users/yuliiparfonov/ads-tracker/backend/routes/*.py`. Можно подсмотреть как фронт использует их в `/Users/yuliiparfonov/ads-tracker/frontend/src/services/api/` и `/Users/yuliiparfonov/ads-tracker/frontend/src/components/pages/*Page.tsx` (там Cloudscape — берём только данные и логику, UI пишем заново на Tailwind).

**Эталон стиля — два файла:**
- `src/renderer/components/MainLayout.tsx` — sidebar/topbar, hover/active states, мелкая типографика
- `src/renderer/pages/DashboardPage.tsx` — KPI cards (`Kpi` компонент), data-table (`BookRow`), loading/error states, range-picker, форматтеры (`fmtMoney`, `fmtPct`, `fmtNumber`)

Любая новая страница должна выглядеть как продолжение этих двух. Если будешь делать переиспользуемые примитивы (Card, DataTable, KpiCard, RangePicker, Filter) — складывай в `src/renderer/components/ui/`.

**Где документация:**
- `CLAUDE.md` — правила работы в репо
- `docs/electron-migration/README.md` — план миграции, контекст «personal-use first» (трек принят 2026-05-07)
- `docs/electron-migration/open-questions.md` — открытые вопросы
- `electron-knowledge-base/` — 2026-актуальная KB по Electron, индекс `atlas/00-INDEX.md`. Прочитай **до** того, как трогать `index.ts` или `forge.config.ts`.

**Установлен Ruflo (v3.7.0-alpha.17):** `.claude/`, `.claude-flow/`, `.swarm/`, `.mcp.json` присутствуют. Можешь использовать MCP-инструменты (`memory_search`, `memory_store`, `agent_spawn`, `analyze_diff-risk`) если они помогают, но это не обязательно — обычная работа Claude Code тоже подходит. Если ruflo тормозит из-за хуков — выключи: `mv .claude/settings.json .claude/settings.json.off`.

**Workflow на сессию.**

1. **Прочитай контекст:** `CLAUDE.md`, `docs/electron-migration/README.md`, `src/renderer/components/MainLayout.tsx`, `src/renderer/pages/DashboardPage.tsx`, `src/renderer/api/metrics.ts`, `src/main/api-client.ts`, `src/shared/ipc.ts`. Это даст полное понимание паттернов.

2. **Расширь API слой:** добавь в `src/renderer/api/` обёртки `books.ts`, `campaigns.ts`, `searchTerms.ts`, `reports.ts`, `profile.ts` по образцу существующего `metrics.ts`. Если backend требует endpoint, который ещё не подключён к IPC — расширь `src/shared/ipc.ts` и `src/main/ipc-handlers.ts` (но обычно достаточно общего `request<T>()`).

3. **Реализуй страницы по очереди**, начиная с самой простой. Рекомендованный порядок:
   - **SettingsPage** (самая простая — версия, base URL, auth status, кнопка «Сменить токен»)
   - **BooksPage** (используй уже существующий `metricsApi.summaryByBook` — он отдаёт всё что нужно, плюс детали по книге)
   - **CampaignsPage** (таблица с фильтром по книге/MP, sort by spend/sales/ACOS)
   - **SearchTermsPage** (таблица с агрегациями, фильтр по диапазону дат)
   - **ReportsPage** (список доступных отчётов, может быть просто эмбед PDF/CSV для начала)

4. **На каждом шаге:**
   - Запусти `npm start` и проверь что собирается и страница рендерится
   - Запусти `npm run lint` перед коммитом
   - Не делай гигантских коммитов — одна страница = один-два коммита

5. **В конце сессии** обнови `docs/electron-migration/README.md` (статусы фаз) и сделай git commit с понятным описанием что сделано.

**Что НЕ делаем в этой сессии (отложено до public release):**
- Локальный SQLite слой для royalty (Phase 3)
- Порт parser xlsx на Node.js (Phase 3)
- Backend cleanup, API-key middleware (Phase 1)
- Code signing, notarization, auto-update (Phase 5)
- Sentry integration (Phase 6)

**Критерий «60%»:** все 5 placeholder'ов заменены на работающие страницы, основная функциональность доступна, можно использовать приложение для собственной работы вместо веб-версии. Финальный polishing — позже.

Действуй.

## ⬆️ Скопировать всё выше этой строки ⬆️

---

## Подсказки Юлию (не входят в промпт)

**Перед запуском новой сессии:**
1. `cd /Users/yuliiparfonov/ads-tracker-desktop`
2. `git status` — убедись что нет несохранённых изменений (или закоммить, или stash)
3. У тебя сейчас несоммиченные: `forge.config.ts`, `package.json`, `package-lock.json`, и неотслеживаемая `assets/` — реши что с ними делать **до** новой сессии
4. `claude` — открыть Claude Code
5. Скопировать блок выше первым сообщением

**Если ruflo будет мешать:**
- Хуки выключаются переименованием: `mv .claude/settings.json .claude/settings.json.off`
- Включаются обратно: `mv .claude/settings.json.off .claude/settings.json`

**Контроль расхода:**
- 5 страниц × ~30-50 минут = 2.5-4 часа в одно лицо
- Через swarm агентов с autopilot может быть быстрее, но дороже по токенам
- Перед сессией глянь `npx ccusage` если используешь

**Когда вернёшься после новой сессии — оцени:**
- Сколько страниц действительно сделано
- Где Ruflo помогал, где мешал
- Реалистично ли «60%» как метрика, или нужно по-другому считать
