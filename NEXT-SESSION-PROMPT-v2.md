# Промпт для следующей сессии — ads-tracker-desktop polish до 80%

Открой Claude Code в `/Users/yuliiparfonov/ads-tracker-desktop/`. Скопируй блок между ⬇️ и ⬆️ как первое сообщение.

---

## ⬇️ Скопировать всё ниже этой строки ⬇️

Контекст и задача.

Это Electron desktop-клиент для Ads Tracker. **Только клиент** — бэкенд (Flask + Neon PostgreSQL) живёт в `/Users/yuliiparfonov/ads-tracker/` и сюда не входит. Архитектурные правила — в `CLAUDE.md` корня репозитория, прочитай его сразу.

**Текущее состояние (~60% готовности).** Прошлая сессия (commit `b80104e`) реализовала 5 placeholder-страниц поверх Railway backend и извлекла переиспользуемые примитивы. Тип-чек чистый, lint чистый, webpack package собирается. Но до настоящего daily-use не хватает polish'а. Задача этой сессии — **довести до ~80%**.

**Жёсткие правила (нарушать нельзя):**
- Security baseline неприкосновенен: `contextIsolation: true`, `sandbox: true`, никаких `nodeIntegration`. Перед любым изменением `src/index.ts` сверь `electron-knowledge-base/atlas/core/03-security.md`.
- IPC только typed: новые каналы — сначала в `src/shared/ipc.ts`, потом handler в `src/main/ipc-handlers.ts`, потом expose в `src/preload.ts`.
- Все HTTP — через `src/main/api-client.ts`, никогда из renderer'а напрямую.
- Никаких изменений в backend (`/Users/yuliiparfonov/ads-tracker/`).
- Никакого Cloudscape. Только Tailwind 3 + lucide-react. Палитра zinc.
- Не расширять scope (см. ниже «что НЕ делаем»).

**Стек:** Electron 41, React 18, TypeScript 5.4, Tailwind 3.4, lucide-react ^1.14, electron-forge 7.11. Базовый URL backend: `https://ads-tracker-production.up.railway.app`.

**Что нужно починить — приоритезированный список (P0 > P1 > P2).**

### P0 — обязательно к закрытию (без этого 80% нельзя считать)

1. **Запусти `npm start` и пройди по всем страницам в живом UI.** Webpack-сборка прошла, но рантайм может ломаться. Заведи лог найденных багов и закрой их. Проверь:
   - переход между всеми 6 страницами через sidebar
   - переключение диапазонов 7d/30d/MTD/YTD
   - фильтры в Campaigns (MP / type / active-only / sort / search)
   - фильтры в SearchTerms (тип, min-clicks, search, sort, пагинация)
   - переключатель daily/weekly + CSV экспорт в Reports
   - drill-down (раскрытие маркетплейсов) в Books
   - sign-out в Settings — должен вернуть TokenPasteScreen
   - что таблицы не разъезжаются на узком окне (макс 1200px / мин 1024px)

2. **Отрефакторь `DashboardPage.tsx`** на общие примитивы из `components/ui/` и `lib/`:
   - убрать локальные `Kpi`, `BookRow` оставить, `RANGES`/`dateRangeFor`/`fmtMoney` импортировать из `lib/`
   - использовать `<PageHeader>`, `<RangePicker>`, `<Card>`, `<ErrorBanner>`, `<EmptyState>`, `<LoadingRow>`
   - сохранить визуальную идентичность 1:1 — это эталон, ничего не менять кроме источника кода
   - снять оставшийся eslint warning `no-non-null-assertion` на строке 31

3. **Глобальный error toast.** Сейчас IPC-ошибка показывается `<ErrorBanner>` внутри каждой страницы — это половинчато. Сделай:
   - `<ToastProvider>` в `App.tsx`, контекст `useToast()`
   - `<ErrorBoundary>` поверх `MainLayout` — чтобы рантайм-ошибка React не давала белый экран, а показывала «что-то пошло не так, перезагрузить»
   - страницы кидают ошибки в toast вместо локального ErrorBanner (но локальный оставить как inline-индикатор для form-validation)

4. **CSV-экспорт с правильным escaping.** Сейчас в `ReportsPage` — самописный `lines.join(',')` без escape. Если в значении запятая или кавычка — файл сломается. Используй простую функцию:
   ```ts
   const csvEscape = (v: unknown) => {
     const s = String(v ?? '');
     return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
   };
   ```
   Перенеси в `lib/csv.ts` чтобы переиспользовать.

5. **Drill-down навигация.** Сейчас страницы изолированы. Сделай:
   - в `MainLayout` добавь контекст `useNav({ page, filters })` и метод `navigate(page, filters?)`
   - в `BooksPage` строка книги при клике (не на chevron) → `navigate('campaigns', { bookId: g.book_id })`
   - в `CampaignsPage` строка кампании → `navigate('search_terms', { localCampaignId: c.campaign_id })`
   - `CampaignsPage` и `SearchTermsPage` принимают начальные фильтры из nav-контекста
   - chevron в Books продолжает работать как inline-раскрытие маркетплейсов

6. **Удали мёртвый код.** `src/renderer/components/PagePlaceholder.tsx` нигде не используется — удалить.

### P1 — желательно (если останется время)

7. **Графики в Reports** через `recharts` (`npm i recharts`):
   - линейный график spend/sales по дням (использует существующие `daily` данные)
   - bar chart spend по маркетплейсам (использует `byMp`)
   - стиль: `stroke-zinc-300/700`, без декорировки, тонкие линии, без gradient'ов
   - Оба графика над таблицей, сворачиваемые в `<Card>` с заголовком

8. **Нативная пагинация в `CampaignsPage`** (как в SearchTermsPage), убрать костыль `slice(0, 500)`. Backend `/api/metrics/summary/by-campaign` пагинации не поддерживает — оставь client-side: считай `pages` через `Math.ceil(filtered.length / 50)`, рендери только текущую страницу.

9. **Загрузка списка маркетплейсов из `/api/marketplaces`** — сейчас фильтры строятся из загруженных данных, что даёт неполный список если за период какой-то MP не активен. Добавь `marketplacesApi.list()` в `api/`, кэшируй на сессию.

10. **Хоткеи навигации.** `useEffect` в `MainLayout` слушает `keydown`, при `g` ждёт второй клавиши `o/b/s/c/r` → переключает `activeView`. Не делай через сторонние библиотеки — вручную, ~30 строк.

### P2 — НЕ делать в этой сессии (отложить)

- Командная палитра Cmd+K
- Auto-refresh с интервалом
- Edit campaign через `PUT /api/campaigns/<id>`
- Negative keywords / Targets / KeywordDiscovery полные модули
- Notifications, Alerts, Action Center страницы
- Авторизация через login/password (сейчас только token paste — ОК)
- Локальный SQLite для royalty (это Phase 3 plan, public release)

**Эталон стиля:**
- `src/renderer/components/MainLayout.tsx`
- `src/renderer/pages/DashboardPage.tsx` (после рефакторинга в P0.2 — будет ещё чище)
- Любой новый компонент должен выглядеть как продолжение этих двух

**Где документация:**
- `CLAUDE.md` — правила работы в репо
- `docs/electron-migration/README.md` — план миграции (статус «Phase 2/4 закрыты» обновлён прошлой сессией)
- `electron-knowledge-base/atlas/00-INDEX.md` — KB по Electron 2026 (read-only)

**Установлен Ruflo (v3.7.0-alpha.17).** Можешь использовать `memory_search` чтобы найти что прошлая сессия уже выяснила про API/бэкенд, и `memory_store` чтобы зафиксировать новое. Не обязательно.

**Workflow на сессию.**

1. Прочитай контекст: `CLAUDE.md`, `docs/electron-migration/README.md`, `src/renderer/components/MainLayout.tsx`, `src/renderer/pages/DashboardPage.tsx`, `src/renderer/components/ui/index.ts`, `src/renderer/lib/format.ts`.
2. Запусти `npm start` и пройди по всем страницам — это **первое** что нужно сделать (P0.1). Найди реальные баги и заведи список.
3. Закрывай P0 пункт за пунктом. После каждого `npx tsc --noEmit` + `npm run lint`.
4. Если P0 закрыт — берись за P1.
5. Не делай гигантских коммитов: каждый P0/P1-пункт — отдельный коммит с понятным сообщением.
6. В конце сессии:
   - обнови `docs/electron-migration/README.md` (статус прогресса)
   - сделай финальный `npm start` для регресс-чека
   - перечисли что сделано / что не успел

**Критерий «80%»:** все P0 закрыты + рантайм-проход чистый + хотя бы один P1 (графики или хоткеи). После этой сессии приложение должно быть достаточно полным чтобы юзер реально пользовался им вместо веб-версии каждый день.

Действуй.

## ⬆️ Скопировать всё выше этой строки ⬆️

---

## Подсказки Юлию (не входят в промпт)

**Перед сессией:**
1. `cd /Users/yuliiparfonov/ads-tracker-desktop`
2. `git status` — у тебя ещё несоммиченные с до-ruflo `forge.config.ts`, `package.json`, `package-lock.json`, `assets/`. Реши что с ними **до** сессии.
3. `claude` — открой Claude Code
4. Скопируй промпт первым сообщением

**После сессии — спроси у себя:**
- Реально ли я могу пользоваться этим вместо веб-версии? Если нет — какой пункт P2 надо вытащить в P1?
- Стоит ли в следующей сессии возвращаться к Ruflo Federation/Hive-mind, или это пока избыточно?
- Готов ли визуально презентовать кому-то (родителям, коллеге)? Если стыдно за UI — это точка роста.

**Текущая ставка:**
- Если все P0 + 1 P1 закрыты → 80% personal-use готовности
- Если все P0 + все P1 → 85-90%
- P2 — это уже территория public release, не сейчас
