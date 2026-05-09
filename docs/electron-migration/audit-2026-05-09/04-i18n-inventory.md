# i18n Inventory & Translation Plan Input

> Audit date: 2026-05-09. Scope: `ads-tracker-desktop` Electron client.
> Goal: prepare for full RU → EN translation pass with proper i18n infrastructure.

---

## Current state

### i18n libraries installed

| Project | Library | Notes |
|---|---|---|
| `ads-tracker-desktop/package.json` | **none** | Zero i18n deps. No `i18next`, no `react-intl`, no `formatjs`, no `lingui`, no `polyglot`. |
| `ads-tracker/frontend/package.json` (original) | **none (general)** | Only Cloudscape's built-in i18n: `@cloudscape-design/components/i18n` + `messages/all.en` is wired in `CloudscapeLayout.tsx`. This is **chrome-only** (Cloudscape widgets like DatePicker labels) and does **not** translate the app's content strings. App-level copy was always hard-coded in RU. |

So: **no app-level i18n exists in either repo**. All RU strings are inline in JSX/code. We are starting from zero, which is actually clean — no legacy keys to migrate.

### Hardcoded locale references

Single hit only:

```
src/renderer/components/AddCampaignModal.tsx:79
  () => [...books].sort((a, b) => a.title.localeCompare(b.title, 'ru')),
```

That `'ru'` is a sort-collator, not a UI locale. Should become locale-aware (current locale) or just `undefined` (use default) after migration. No `'ru-RU'` / `'ru_RU'` / `'RU'` strings anywhere else.

### Number / date / currency formatting

| File | What it does | Locale baked in |
|---|---|---|
| `src/renderer/lib/format.ts` | `fmtNumber`, `fmtMoney`, `fmtMoneyPrecise`, `fmtPct`, `formatDate` | `Intl.NumberFormat('en-US', …)` — already **en-US**. Currency uses symbol map (`$`, `€`, `£`, `¥`, `CA$`, `A$`, `₹`) returned by backend; no `руб` / `₽` / `RUB` anywhere. `formatDate` returns ISO `YYYY-MM-DD`, locale-independent. |
| `src/renderer/lib/dateRange.ts` | Range labels `'7 дней'`, `'30 дней'`, `'90 дней'`, `'MTD'`, `'YTD'` | Hardcoded RU labels — needs i18n. |
| Pages (e.g. `ReportsPage.tsx`) | Pluralization in `${granularity === 'daily' ? 'дней' : 'недель'}` | Hardcoded RU plural — needs ICU plurals. |
| `src/renderer/components/AddCampaignModal.tsx:79` | `localeCompare(…, 'ru')` | Sort collator only. |
| `src/main/local-db/royalty.ts:74` | `localeCompare(a, b)` | No locale arg, fine. |

**No `toLocaleDateString` / `toLocaleString` calls** in renderer or main — dates are always ISO. Good: switching the UI locale to `en` won't break date/number rendering, only labels and plurals.

### Backend Accept-Language

`src/main/api-client.ts` builds headers with only `Accept: application/json` + `Authorization: Bearer …` + `Content-Type: application/json`. **No `Accept-Language` header, no `lang=` query param**. Backend (Railway Flask) does not return localized strings — it returns numeric metrics + identifiers. So translation is purely a client-side concern. Good.

---

## RU strings by file

Counts are "lines containing at least one Cyrillic character" (a single line can have multiple strings; this overcounts strings slightly but undercounts large multi-line literals — it's the right ballpark).

### Top renderer files (highest yield)

| File | RU lines | Examples |
|---|---:|---|
| `src/renderer/components/AddCampaignModal.tsx` | 46 | `'SP — самый популярный, для всех ASIN'`, `'Книги с активными ASIN-ами по маркетплейсам, отсортированные по названию.'` (mostly comments + a few hints). |
| `src/renderer/components/NegativeListsTab.tsx` | 35 | `'Списки минус-слов'`, `'Не удалось загрузить списки'`, `'Создай первый — например, Brand exclusions, Competitor brands, Generic terms.'` |
| `src/renderer/pages/CampaignDetailsPage.tsx` | 34 | `'Минус-слова'`, `'История'`, `'Кампания #${campaignId} не найдена за выбранный период.'`, `'Не удалось загрузить кампанию'` |
| `src/renderer/components/CommandPalette.tsx` | 30 | `'Перейти на Обзор'`, `'Перейти на Книги'`, … (8 nav labels + cmd palette copy) |
| `src/renderer/components/MainLayout.tsx` | 29 | `'Обзор'`, `'Книги'`, `'Кампании'`, `'Поисковые запросы'`, … (sidebar nav) |
| `src/renderer/pages/RoyaltiesPage.tsx` | 28 | `'Удалить локальный импорт? Records внутри тоже удалятся.'`, `'Удалено'`, `'Не удалось загрузить royalty'` |
| `src/renderer/pages/NegativesPage.tsx` | 27 | UI labels + error copy |
| `src/renderer/pages/SearchTermsPage.tsx` | 25 | `'Поисковые запросы'`, `'Не удалось загрузить поисковые запросы'` |
| `src/renderer/components/EditCampaignModal.tsx` | 22 | `'Budget должен быть положительным числом'` + comments |
| `src/renderer/pages/SettingsPage.tsx` | 21 | `'Настройки'`, `'Учётная запись'`, `'API-доступ, информация об установке.'`, `'Скопировано'` |
| `src/renderer/pages/CampaignsPage.tsx` | 21 | `'Кампании'`, `'Не удалось загрузить кампании'`, `'из'` infix |
| `src/renderer/pages/DashboardPage.tsx` | 20 | UI section headers + error copy |
| `src/renderer/pages/AlertsPage.tsx` | 20 | alert UI + thresholds |
| `src/renderer/components/AmazonAdsSection.tsx` | 20 | section labels + hints |
| `src/renderer/pages/AutomationPage.tsx` | 19 | rule UI |
| `src/renderer/pages/AccountingPage.tsx` | 19 | accounting columns + form labels |
| `src/renderer/components/AddTargetModal.tsx` | 19 | targeting form |
| `src/renderer/pages/KeywordsPage.tsx` | 17 | keywords UI |
| `src/renderer/pages/BooksPage.tsx` | 17 | books UI |
| `src/renderer/pages/OperationsCenterPage.tsx` | 16 | ops center UI |
| `src/renderer/components/NotificationsBell.tsx` | 16 | notifications copy |
| `src/renderer/pages/ActionCenterPage.tsx` | 15 | actions copy |
| `src/renderer/pages/ComparisonPage.tsx` | 14 | comparison labels |
| `src/renderer/components/GlobalFilters.tsx` | 14 | filter labels |
| `src/renderer/api/actionCenter.ts` | 14 | mostly comments |
| `src/renderer/components/LoginScreen.tsx` | 13 | `'Неверный email или пароль'`, `'Войди email + паролем (как на сайте). Токен сохранится в системном keychain.'`, `'Вставь API-ключ at_live_…'` |
| `src/renderer/pages/ReportsPage.tsx` | 12 | `'Динамика'`, `'Не удалось загрузить отчёты'`, `'Экспортировано: N дней/недель'` |
| `src/renderer/components/UpdateChecker.tsx` | 12 | updater UI |
| `src/renderer/components/UserMenu.tsx` | 10 | menu items |
| `src/renderer/components/reports/BreakdownTab.tsx` | 9 | breakdown UI |
| `src/renderer/components/AddAdGroupModal.tsx` | 9 | ad-group form |
| `src/renderer/api/auth.ts` | 8 | auth error messages (user-visible) |
| `src/renderer/contexts/NavContext.tsx` | 7 | nav labels |
| `src/renderer/components/ui/EditableNumber.tsx` | 7 | inline-edit hints |
| `src/renderer/components/dashboard/HeroChart.tsx` | 7 | chart labels |
| `src/renderer/components/dashboard/FunnelChart.tsx` | 7 | funnel labels |
| `src/renderer/components/CalendarBell.tsx` | 7 | calendar UI |
| `src/renderer/components/dashboard/TopPerformers.tsx` | 6 | top-performers labels |
| `src/renderer/lib/format.ts` | 5 | comments only |
| `src/renderer/lib/dateRange.ts` | 5 | range labels (`'7 дней'` etc.) |
| `src/renderer/contexts/ThemeContext.tsx` | 5 | comments |
| `src/renderer/components/ui/RangePicker.tsx` | 5 | range picker labels |
| `src/renderer/components/dashboard/AlertsWidget.tsx` | 5 | alert widget |
| `src/renderer/components/ErrorBoundary.tsx` | 5 | crash screen copy |
| `src/renderer/api/targets.ts` | 5 | comments |
| `src/renderer/api/campaigns.ts` | 5 | comments |
| `src/renderer/api/automation.ts` | 5 | comments |
| `src/renderer/components/ui/KpiDelta.tsx` | 4 | comments |
| `src/renderer/api/metrics.ts` | 4 | comments |
| `src/renderer/api/amazonAds.ts` | 4 | comments |
| `src/renderer/window.d.ts` | 3 | comments |
| `src/renderer/components/ui/Pagination.tsx` | 3 | `'Стр.'`, `'из'` |
| Other small files | 1–2 each | mostly comments |

### Main process

| File | RU lines | Notes |
|---|---:|---|
| `src/main/updater.ts` | 20 | All comments (no user-visible strings). |
| `src/main/local-db/index.ts` | 19 | All comments. |
| `src/main/auth-store.ts` | 15 | All comments. |
| `src/main/local-db/royalty.ts` | 8 | Comments. |
| `src/main/api-client.ts` | 6 | Comments. |
| `src/main/ipc-handlers.ts` | 5 | Comments. |

**Main process has zero user-visible RU strings.** Everything is dev-comments. They can stay RU (or be translated lazily as a separate cleanup pass) — no blocker for shipping an EN UI.

### Tests

`src/renderer/**/__tests__/*` files contain ~164 RU lines, mostly literal expected strings inside `expect(screen.getByText('Обзор'))`. **These will need a search-and-replace once UI strings move to translation keys** (or update tests to query by `data-testid` instead).

### Totals

```
Renderer (non-test) :  770 lines with Cyrillic
Main process        :   73 lines with Cyrillic   (all comments)
Tests               :  164 lines with Cyrillic
─────────────────────────────────────────────────
Grand total         : 1007 lines with Cyrillic
```

Of the 770 renderer lines, ~67% (≈515) are likely user-visible strings (JSX text, attribute values, toast/error messages) and ~33% are comments. So **realistic translation target: ~500–550 user-visible string lines, ~250–350 unique strings** after dedup of repeated `'Не удалось загрузить …'`, nav labels reused via `NavContext`, etc.

---

## Date / number / currency formatting summary

- **Numbers**: already `Intl.NumberFormat('en-US')` — locale-neutral output (`1,234`). No change needed for EN.
- **Money**: symbol-prefix from backend (`$1,234`). No locale string. Good.
- **Percent**: `${n.toFixed(1)}%`. Locale-neutral. Good.
- **Dates**: ISO `YYYY-MM-DD` everywhere. Locale-neutral. Good.
- **Pluralization**: ad-hoc ternaries (`'дней' : 'недель'`). **Will break under i18n** — must move to ICU `plural` syntax.
- **Sort collator**: one explicit `'ru'` in `AddCampaignModal.tsx:79`. Should switch to `undefined` (default) or to current UI locale.

---

## Recommended stack

**Pick: `react-i18next` + `i18next-icu` (ICU plural plugin)**

1. **Bundle size**: i18next core ≈ 13 KB gz, react-i18next ≈ 5 KB gz, icu plugin ≈ 6 KB gz. Total ≈ 24 KB gz. FormatJS/`react-intl` is ≈ 40 KB gz with full ICU. Lingui is ≈ 8 KB but compiles messages at build time which adds Babel/Vite-plugin overhead and complicates our Webpack/Forge setup. For a desktop app where bundle size matters less than startup speed, the difference is small; i18next wins on no-build-step DX.

2. **DX**: `useTranslation()` hook + `t('key')` is the lowest-friction API for our React 18 + functional-component codebase. Hot-reload works out of the box. No codegen step; JSON dictionaries live next to source. Compatible with our existing Vitest setup (mock `useTranslation` once in `src/test/setup.ts`).

3. **Type safety for keys**: i18next has first-class TypeScript module-augmentation support — declaring a `Resources` type makes `t('settings.title')` autocomplete and reject typos at compile time. FormatJS supports this too but requires its CLI for type generation. With i18next we just point TS at our `en.json` and TS infers all keys.

4. **ICU MessageFormat (plurals, selects, gender)**: via `i18next-icu` we get full ICU syntax: `{count, plural, one {# day} other {# days}}` — directly replaces our `'дней' : 'недель'` ternaries. FormatJS has the same; both are interchangeable here. i18next's plugin is opt-in so we only pay for ICU on screens that need it.

5. **Migration / fallback path**: i18next supports `fallbackLng: 'en'` + `lng: 'en'` initially, with RU added later by dropping `ru.json` next to `en.json`. We can also keep RU strings as initial values via a `i18next-resources-to-backend` lazy loader so each page bundles its own namespace — keeps the initial chunk small. Adding RU back is purely additive: no code changes, just a JSON file. This matches our personal-use-first → public-release roadmap.

**Runner-up considered**: FormatJS / `react-intl`. Roughly equivalent feature-wise but heavier bundle and `<FormattedMessage>` JSX-tag style is more verbose than `t()`. Skip.

**Skipped**: Lingui (build-step overhead, smaller community for Electron), self-rolled JSON dictionary (we'd reinvent ICU plural handling — already burned by `'дней' : 'недель'`).

---

## File layout

```
src/renderer/i18n/
├── index.ts                  # i18next.init(...) — called once from App.tsx
├── resources/
│   ├── en/
│   │   ├── common.json       # buttons, errors, generic ("Save", "Cancel", "Failed to load …")
│   │   ├── nav.json          # sidebar + command palette nav labels
│   │   ├── auth.json         # LoginScreen, UserMenu
│   │   ├── dashboard.json    # DashboardPage + dashboard/* widgets
│   │   ├── books.json        # BooksPage
│   │   ├── campaigns.json    # CampaignsPage, CampaignDetailsPage, AddCampaignModal, EditCampaignModal
│   │   ├── searchTerms.json  # SearchTermsPage
│   │   ├── keywords.json     # KeywordsPage
│   │   ├── negatives.json    # NegativesPage, NegativeListsTab
│   │   ├── reports.json      # ReportsPage + reports/* tabs
│   │   ├── comparison.json   # ComparisonPage
│   │   ├── alerts.json       # AlertsPage, AlertsWidget, NotificationsBell
│   │   ├── automation.json   # AutomationPage
│   │   ├── operations.json   # OperationsCenterPage, ActionCenterPage
│   │   ├── accounting.json   # AccountingPage
│   │   ├── royalties.json    # RoyaltiesPage
│   │   └── settings.json     # SettingsPage, UpdateChecker
│   └── ru/                   # mirror; populated later when RU comes back
└── types.d.ts                # `declare module 'i18next'` augmentation for typed keys
```

**Namespace per page/feature**: matches our `src/renderer/pages/*.tsx` 1:1. Lazy-load namespaces with `useTranslation('campaigns')` so the initial bundle stays small (each page already lazy-loads via `React.lazy`; we co-locate namespaces).

`common.json` carries everything reused: nav labels (also in `nav.json` — duplicate intentional, command palette references nav names), generic CTAs (`Save`, `Cancel`, `Delete`, `Confirm`), generic error patterns (`'Failed to load {{entity}}'`), date range presets (`7d`, `30d`, `90d`, `MTD`, `YTD`).

---

## Volume / effort estimate

### Unique strings

After deduplication (nav labels are reused across `MainLayout`, `CommandPalette`, `NavContext`; toast errors follow `'Не удалось загрузить X'` template; modal CTAs are repeated):

- **Estimated unique user-visible strings: 250–350.**
- Of those, ~30–50 need ICU plurals / interpolation (counts, dates, names).
- Tests will need ~80–120 string updates (or a switch to `data-testid`-based queries).

### Effort breakdown (one engineer, focused)

| Phase | Hours | Notes |
|---|---:|---|
| **Setup**: install deps, init i18next, wire `I18nextProvider` in `App.tsx`, configure Vitest mock, type-augmentation file, ESLint rule (`no-literal-string` for JSX) | 4–6 | One-time. |
| **Extract pass**: walk every renderer file, replace inline RU with `t('namespace.key')`, populate `en/*.json` with English (translation happens inline since strings are already known and short) | 16–24 | The bulk of the work. ~30 files × ~30 min average. |
| **Plurals + interpolations**: `dateRange.ts`, `ReportsPage.tsx`, count-based labels, `'X из Y'` → ICU | 2–3 | Small surface but must be done carefully. |
| **Tests fixup**: replace expected RU strings with EN equivalents OR migrate to `data-testid` queries (recommended — decouples tests from copy) | 4–6 | ~10 test files. |
| **Settings UI for language**: add `i18n.changeLanguage(...)` toggle in `SettingsPage` (off by default — no RU yet, locked to EN) | 1 | Stub for future RU. |
| **Review + manual smoke** of every page in EN, fix awkward phrasings | 3–4 | Run the app, click through. |
| **Total** | **30–44 hours** | ≈ 4–6 working days. |

If RU translation is added back later: **+4–8 hours** (re-translate `en/*.json` into `ru/*.json` — small, since structure is fixed).

Main-process comments (~73 RU lines) and dev-comments inside renderer (~250 RU lines) are **not in scope** for translation; they're internal docs. A separate "переведём комменты" pass is ~2–4 hours if ever needed.

### Risk notes

- **Cloudscape leftover labels**: original frontend used Cloudscape `i18nStrings` for DatePicker/Pagination etc. Desktop dropped Cloudscape (per `CLAUDE.md`), so this is **not** a concern — our DatePicker/Pagination are custom (`src/renderer/components/ui/`) and surface their labels in plain props.
- **Backend error strings**: `api-client.ts` returns `parsed.error` as-is from the backend. Backend currently returns English-ish technical messages (`HTTP 500`, validation errors). User-visible wrapping is RU in renderer (`'Не удалось загрузить …'` + the backend message). After translation, the wrapping is EN; backend message stays whatever the backend says. Acceptable — same pattern as before.
- **`localeCompare(.., 'ru')` in `AddCampaignModal.tsx:79`**: change to `localeCompare(b.title, i18n.language)` or drop the locale arg. Does not affect the user beyond Cyrillic-book sort order, which is no longer a hot path for the EN-first audience.
- **Tests as documentation**: `__tests__/*.smoke.test.tsx` files use RU strings as locators. Migrating to `data-testid` is the more robust fix and decouples tests from copy revisions.

---

## Suggested rollout order

1. Land i18n setup + `common.json` + `nav.json` (covers sidebar, command palette, generic toasts) — 1 day.
2. Page-by-page migration in user-frequency order: Dashboard → Campaigns → Reports → Books → SearchTerms → Settings → rest.
3. Tests migration to `data-testid` happens *before* page migration of that page (so test asserts survive the copy switch).
4. Lock `lng: 'en'`, `fallbackLng: 'en'`. Skip RU resource file entirely until/if we want it back.
5. Optional cleanup pass on dev-comments (low priority, RU comments are fine for the developer audience).
