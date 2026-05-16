# Phase Q — Design Pass (option B)
_Date: 2026-05-16 · Owner: Juli374 · Source: synthesis of audits 01–06 in this folder_

> **Контекст.** Решение от 2026-05-16: переход на «option B» (cosmetic + design system, 3–5 рабочих дней). НЕ перестраиваем IA в 4 модуля как в мокапе букплатформы (это option C, отложен). Цель — сделать так, чтобы реальный Electron-клиент _читался как KDPBook десктоп-приложение_, использовал ту же палитру/типографику/чарты, что и маркетинг-сайт, без переписывания структуры 21 страницы.
>
> **Что прочитать перед стартом:** все 6 файлов в этой папке. Это источник истины для каждой задачи ниже. Каждый таск ссылается на конкретный аудит-файл + раздел.

---

## 0. TL;DR

Аудит выявил **три блокера**, без решения которых работать нельзя:

1. **В репо два конфликтующих дизайн-стандарта**: `DESIGN.md` (violet `#6E56CF` + Geist Sans, частично применён в чартах + lock-badges) vs `book-platform/design-dna.json` (emerald `#10b981` + Playfair Display + JetBrains Mono, полностью применён на маркетинге). Нужно явно выбрать **одну спеку как канон** до любых правок токенов.
2. **P0 hidden bug**: примитивы `Button`, `Input`, `Badge`, `Num`, `NavItem`, `DataTable` ссылаются на Tailwind-токены (`bg-accent`, `text-fg-muted`, `bg-surface-2`, `border-border-strong`, `bg-success-soft`, etc.), **которых нет в `tailwind.config.js`**. Они рендерятся невидимо. Поэтому adoption катастрофически низкий (Button = 14 vs 299 inline, Input = 1 vs ~190 inline). Сначала надо чинить токены — без этого никакая миграция на примитивы не работает.
3. **Brand boundary**: переименовываем «Ads Tracker» → «KDPBook» полностью / делаем гибрид «KDPBook · Ads Tracker» / оставляем как есть. От ответа зависит работа Day 1.

После этих трёх решений план разбит на 6 фаз (Q.0 → Q.5), каждая — 0.5–1.5 дня. Итог 4–5 рабочих дней. Acceptance criteria и риски — в конце документа.

---

## 1. Цели и не-цели

### Цели
- Real app визуально читается как «KDPBook desktop» (тот же бренд, что и kdpbook.click), а не как анонимный SaaS-tracker.
- Дизайн-система становится **единой**: все примитивы работают и доступны; пять дублирующих паттернов схлопнуты в один.
- Сюжетные UX-баги, найденные параллельно (G E коллизия, attribution hardcode, sync discoverability) — закрываются.
- 5 worst-страниц (Reports, Keywords, Negatives, Accounting, SearchTerms) поднимаются с composite 3.3–4.4/10 до ≥5.5/10.
- 152 тестов остаются зелёными (`data-testid` мы не трогаем).

### Не-цели (явно)
- **Полная перестройка IA в 4 модуля Ads/Analytics/Publishing/AI Tools** — это option C, отложен.
- **Mobile / narrow-window responsive** — Electron окно почти всегда ≥1280px.
- **Dark mode redesign** — оставляем существующую zinc-инверсию (Phase B уже отгружена).
- **Анимационные библиотеки** (Lenis, framer-motion, magnetic buttons, mesh gradients) — не для дашборда власть-юзера.
- **A11y deep audit** — отдельная фаза, здесь только то, что мы и так трогаем.
- **Renaming `appBundleId` / URL scheme / GitHub repo** — ломает auto-update, signed installs, deep links. Невидимо для юзера, ноль выгоды, высокая цена.
- **Marketing-style hero illustrations, mega-menu, animated topo** — не для десктоп-приложения.

---

## 2. Pre-flight decisions (3 решения нужны до Day 1)

Без этих ответов работа Day 1 не начинается. Решения короткие, у каждого есть рекомендация от аудита, но финал — за тобой.

### Decision 1: Дизайн-канон — `design-dna.json` или `DESIGN.md`?

| Спека | Палитра | Шрифты | Где применена сейчас |
|---|---|---|---|
| `book-platform/design-dna.json` | emerald `#10b981` accent, blue/violet/amber/rose модули | Playfair Display + Inter + JetBrains Mono | весь маркетинг-сайт, полная адопция |
| `ads-tracker-desktop/DESIGN.md` | violet `#6E56CF` | Geist Sans | 4 chart файла (TrendModal, RankHistoryModal, HourlyTab, BudgetPacingTab) + ~10 lock-badges |

**Рекомендация аудитов (1, 3):** взять **`design-dna.json`** как канон. `DESIGN.md` либо удалить, либо переписать в 30-строчное пояснение «Desktop adaptation of KDPBook DNA». Конкретно:
- `#6E56CF` retire в 4 chart файлах → заменить на `#3b82f6` (analytics) или `#10b981` (primary).
- Violet lock-badges (`MainLayout:447`, `LockedFeature.tsx`, `settings/AITab.tsx`, ~10 файлов) → amber (`#f59e0b`, соответствует `modules.ai` в DNA).

**Альтернатива:** оставить DESIGN.md как канон, переписать design-dna.json под violet+Geist. Маловероятно — маркетинг уже разогнан под emerald.

**🔴 ТРЕБУЕТСЯ ОТВЕТ.**

---

### Decision 2: Brand boundary — rename / hybrid / keep?

| Вариант | Что меняется | Цена | Риски |
|---|---|---|---|
| **A. Полный rename → KDPBook** | Sidebar wordmark, html title, productName, Squirrel name, native dialogs, README + ~15 docs, иконка | ~34 file touches, ~half day | Юзер может не узнать в Dock «KDPBook» если знал как «Ads Tracker» |
| **B. Hybrid «KDPBook · Ads Tracker»** ⭐ | То же, но «Ads Tracker» остаётся как subtitle/tagline в header, About, README intro | то же | Минимальный — обе строки видны |
| **C. Keep current «Ads Tracker»** | ничего | 0 | Рассинхрон: маркетинг = KDPBook, app = Ads Tracker. После всех остальных Q.* юзер видит emerald + Playfair + … но «Ads Tracker» в углу — диссонанс. |

**Рекомендация аудита 3:** **вариант B (hybrid)**. Sidebar читается `[K] KDPBook · Ads Tracker · v0.1.0`. Полная детализация: `03-brand.md §Logo / wordmark`.

**🔴 ТРЕБУЕТСЯ ОТВЕТ.**

---

### Decision 3: Primary action color — black-as-primary или emerald-as-primary?

Сейчас: 75 inline buttons hardcode `bg-zinc-900 text-white hover:bg-zinc-800` — это «brand black», DNA это значение `palette.primary`. DNA target accent = `#10b981` (emerald) для CTA.

| Вариант | Что | Где emerald |
|---|---|---|
| **A. Keep black-as-primary** ⭐ | Модальные submit'ы, формы, `Apply`, `Save` остаются `bg-zinc-900`. Emerald только на high-emphasis CTA (Upgrade, Run sync, Run briefing). | Sidebar active, focus ring, `Active`/`Live` badges, chart primary line, верхняя пилюля «Quick action» |
| **B. Emerald-as-primary везде** | Все 75 кнопок → emerald. | Везде, кроме destructive (red) и secondary (zinc) |

**Рекомендация аудитов (3, 6):** **вариант A**. Stripe/Linear convention: чёрный для submit'ов (нейтральная сила), emerald для уникальных моментов. Если флипнуть все 75 на emerald — потеряется «restraint» эстетика которая у app уже есть. Полная детализация: `06-forms.md §Recommendation 4`.

**🔴 ТРЕБУЕТСЯ ОТВЕТ.**

---

## 3. Phase Q.0 — Foundation (Day 1, ~6–7 hours)

**Цель.** Снять P0-блокер: токены, шрифты, бренд-чрома. Без этой фазы ничего другого работать не может.

### Q.0.1 — Установить шрифты (45 min)
Self-host через `@fontsource/*` (offline-safe для Electron).

```
npm i @fontsource/inter @fontsource/playfair-display @fontsource/jetbrains-mono
```

В `src/renderer.tsx` верху:
```ts
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/900.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
```

Bundle budget: ~280 KB woff2 total, one-time. Acceptable.

**Файлы:** `package.json`, `src/renderer.tsx`.
**Reference:** `03-brand.md §Typography mapping → Font loading`.

### Q.0.2 — Расширить `tailwind.config.js` (60 min)

Добавить все недостающие токены. Полный список:

```js
// tailwind.config.js — extend
fontFamily: {
  sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', ...current],
  display: ['"Playfair Display"', 'Georgia', 'serif'],
  mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
},
colors: {
  // ↓ существующие zinc-mapping оставляем
  // ↓ NEW: семантические токены, которые ждут примитивы
  accent: {
    DEFAULT: '#10b981',   // emerald-500 — было zinc-100
    hover: '#059669',     // emerald-600
    soft: '#10b98115',    // emerald-500 @ 8% alpha
    fg: '#ffffff',
  },
  surface: {
    DEFAULT: '#ffffff',
    2: '#f4f4f5',         // zinc-100
    3: '#e4e4e7',         // zinc-200
  },
  fg: {
    DEFAULT: '#09090b',
    muted: '#71717a',     // zinc-500
    subtle: '#a1a1aa',    // zinc-400
  },
  'border-strong': '#d4d4d8',  // zinc-300
  success: { DEFAULT: '#10b981', soft: '#10b98115', fg: '#065f46' },
  warning: { DEFAULT: '#f59e0b', soft: '#fffbeb', fg: '#92400e' },
  error: { DEFAULT: '#ef4444', soft: '#fef2f2', fg: '#991b1b' },
  info: { DEFAULT: '#3b82f6', soft: '#eff6ff', fg: '#1e40af' },
  module: {
    ads: '#10b981',
    analytics: '#3b82f6',
    publishing: '#8b5cf6',
    ai: '#f59e0b',
    marketplace: '#f43f5e',
  },
},
borderRadius: {
  btn: '6px',
  card: '8px',
  modal: '12px',
  pill: '9999px',
},
boxShadow: {
  soft: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
  card: '0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.05)',
  popover: '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
  modal: '0 10px 15px -3px rgb(0 0 0 / 0.10), 0 4px 6px -4px rgb(0 0 0 / 0.10)',
},
transitionTimingFunction: {
  smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
},
transitionDuration: {
  fast: '100ms',
  base: '200ms',
  modal: '300ms',
},
ringColor: { DEFAULT: '#10b981' },  // focus ring → emerald
```

**После этого** примитивы `Button`, `Input`, `Badge`, `Num`, `NavItem`, `DataTable` перестают быть невидимыми. **Это даёт визуальный win за один коммит — даже без миграции страниц.**

**Файлы:** `tailwind.config.js`.
**Reference:** `01-primitives.md §Tailwind config gaps`, `03-brand.md §Color palette mapping`.

### Q.0.3 — Smoke-test токенов (30 min)

Перед коммитом — открыть страницы где `Button`/`Badge`/`Input` уже используются (ListingStudio, Research, settings/AITab) и визуально проверить, что они теперь рендерятся правильно. Если что-то всё ещё невидимо — добавить недостающий токен.

### Q.0.4 — Retire `#6E56CF` (30 min)

Find-replace в 4 файлах:
- `src/renderer/components/searchTerms/TrendModal.tsx:29` — `#6E56CF` → `#3b82f6` (analytics для clicks)
- `src/renderer/components/searchTerms/RankHistoryModal.tsx:187` — `#6E56CF` → `#8b5cf6` (publishing для rank-history)
- `src/renderer/components/reports/HourlyTab.tsx:138` — heatmap final color → `#10b981`
- `src/renderer/components/reports/BudgetPacingTab.tsx:107` — `#6E56CF` → `#3b82f6`

**Reference:** `04-charts.md §Color palette in charts`, `03-brand.md §Dead tokens to retire`.

### Q.0.5 — Бренд-марк + wordmark в MainLayout (60 min)

Только если Decision 2 = «hybrid» или «full rename».

`src/renderer/components/MainLayout.tsx:315-321`:
```tsx
// было:
<div className="w-6 h-6 rounded-md bg-zinc-900 ...">A</div>
<span className="text-sm font-semibold ...">Ads Tracker</span>
<span className="text-xs text-zinc-400 ml-1">v0.1.0</span>

// после (hybrid):
<div className="w-7 h-7 rounded-md bg-zinc-900 flex items-center justify-center">
  <span className="font-display text-sm font-bold text-emerald-400">K</span>
</div>
<span className="font-display text-base font-bold tracking-tight text-zinc-900">
  KDPBook
</span>
<span className="text-[10px] text-zinc-400 ml-1">· Ads Tracker · v0.1.0</span>
```

И параллельно:
- `src/index.html:16` — `<title>KDPBook</title>`
- `src/index.ts` lines 23, 38, 66, 73, 175, 213 — `"Ads Tracker"` → `"KDPBook"`
- `package.json:3` — `productName: "KDPBook"`
- `forge.config.ts:84,102` — Squirrel name + protocol name `KDPBook`
- `src/renderer/i18n/resources/en/auth.json` — `appName: "KDPBook"`
- `src/renderer/i18n/resources/en/settings.json` — `appNameValue: "KDPBook"`
- `assets/icon.*` (icns / png / ico) — _оставить на follow-up_, старая иконка работает.

**НЕ менять:** `appBundleId`, URL scheme `ads-tracker-desktop://`, GitHub repo, `electron-updater` URL.

**Files (всего):** 11 source + 3 i18n + 2 build = 16 file touches.
**Reference:** `03-brand.md §Logo / wordmark`, §Concrete migration list.

### Q.0.6 — Update `DESIGN.md` (30 min)

Полностью переписать (или удалить, если стало неактуально). Новое содержимое — 30 строк, указывающих на `book-platform/design-dna.json` как канон + 5–10 desktop-специфичных уточнений (Playfair только на wordmark + PageHeader H1; emerald на focus ring + active states; JetBrains Mono на числа; никаких Lenis).

**Reference:** `03-brand.md §Docs prose`.

### Day 1 — Acceptance
- [ ] `npm start` запускает app, шрифты загружены (DevTools → Network: 3 woff2 файла).
- [ ] `tailwind.config.js` имеет все токены из Q.0.2.
- [ ] На страницах ListingStudio/Research/AITab `<Button>` и `<Badge>` рендерятся правильно (видны).
- [ ] `#6E56CF` отсутствует в `src/` (`grep -r "6E56CF" src/` → 0 результатов).
- [ ] Sidebar показывает `[K] KDPBook · Ads Tracker · v0.1.0` (если decision = hybrid).
- [ ] 152 теста зелёные.

---

## 4. Phase Q.1 — Primitives layer (Day 2, ~7 hours)

**Цель.** Снять долг по дублирующим паттернам. Если фундамент собран — это самый высокий leverage пасс.

### Q.1.1 — `<Modal>` primitive из ModalShell (2.5 hours)

Промоутнуть `src/renderer/components/searchTerms/ModalShell.tsx` → `src/renderer/components/ui/Modal.tsx`. ModalShell уже gold standard: Esc handling, `data-modal-open`, overlay click-to-close, aria, size variants (`sm` / `md` / `lg` / `xl`).

Канонический overlay: `bg-zinc-900/20 backdrop-blur-sm` (12 из 20 модалок уже так). Z-index единый: `z-50`. Container: `rounded-modal shadow-modal`.

API:
```tsx
<Modal open={...} onClose={...} size="md" title="..." data-testid="...">
  <ModalBody>...</ModalBody>
  <ModalFooter>
    <Button variant="secondary" onClick={onCancel}>Cancel</Button>
    <Button variant="primary" onClick={onSubmit}>Save</Button>
  </ModalFooter>
</Modal>
```

Затем мигрировать **15 модалок:**
- `AddCampaignModal.tsx`
- `EditCampaignModal.tsx`
- `AddAdGroupModal.tsx`
- `AddTargetModal.tsx`
- `AddEventModal.tsx`
- `operations/EditTaskModal.tsx`
- `books/BsrModal.tsx`
- `books/EditBookModal.tsx`
- `books/DeleteBookModal.tsx`
- `books/AddChangeModal.tsx`
- `books/AddAsinModal.tsx`
- `books/CoverQAModal.tsx`
- `books/UploadCoverModal.tsx`
- `settings/ImportRoyaltyModal.tsx`
- `NegativeListsTab.tsx` (inline modal)

`UpgradeModal.tsx` (z-[100], 860px width, без backdrop-blur) — **исключение**, оставляем отдельным паттерном (целевое — Pro upgrade overlay, нужно стоять выше всего).

`CommandPalette.tsx` — отдельный паттерн (`pt-24`, search-input header), **не мигрируем**.

**Файлы:** новый `ui/Modal.tsx` + 15 file edits.
**Reference:** `06-forms.md §Modal inventory + §Recommendation 2`.

### Q.1.2 — `<SegmentedControl>` primitive (1 hour)

Запилить `ui/SegmentedControl.tsx` из паттерна `inline-flex bg-white border border-zinc-200 rounded-md p-0.5`. Active state — **`bg-zinc-100 text-zinc-900`** (нейтральный, как в `WeeksSegment`). Цветовое значение (active/paused/warning) — задача `Badge`, не SegmentedControl.

API:
```tsx
<SegmentedControl<'daily' | 'weekly'>
  value={granularity}
  onChange={setGranularity}
  options={[
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
  ]}
/>
```

Мигрировать 10+ inline копий:
- `pages/BooksPage.tsx:529`
- `pages/CampaignsPage.tsx:589`
- `pages/KeywordsPage.tsx:591`
- `pages/ReportsPage.tsx:735`
- `pages/SearchTermsPage.tsx` (2 места)
- `pages/PnLPage.tsx`
- `pages/NegativesPage.tsx`
- `pages/ResearchPage.tsx`
- `components/AddCampaignModal.tsx:305,444,477`
- `components/EditCampaignModal.tsx:143`
- `components/AddTargetModal.tsx:161,201`
- `components/NegativeListsTab.tsx:263`
- `components/books/CoverQAModal.tsx:145`

`RangePicker.tsx:67` и `WeeksSegment.tsx` — рефакторнуть на использование `SegmentedControl` как базы.

**Файлы:** новый `ui/SegmentedControl.tsx` + 13–15 file edits.
**Reference:** `01-primitives.md §Inline-styled duplicates`, `06-forms.md §Segmented controls`.

### Q.1.3 — `<Select>`, `<Textarea>`, `<Field>` primitives (1.5 hours)

`Input.tsx` примитив уже существует (после Q.0.2 заработал). Не хватает `Select` и `Textarea` для тех же визуальных свойств.

```tsx
// ui/Select.tsx — native <select> (нет radix/headlessui в проекте, не добавляем)
<Select value={...} onChange={...}>
  <option>...</option>
</Select>

// ui/Textarea.tsx
<Textarea rows={4} value={...} onChange={...} />

// ui/Field.tsx — label + input/select/textarea + helper text + error
<Field label="Campaign name" error={errors.name} hint="Max 80 chars">
  <Input value={...} onChange={...} />
</Field>
```

Кодмод (вручную, не sed — слишком много контекстных вариантов): убрать 5 копий `const inputClass = '...'`:
- `AddCampaignModal.tsx:532`
- `EditCampaignModal.tsx:282`
- `EditBookModal.tsx:196`
- `AddChangeModal.tsx:129`
- `(implicit)` в `AddAdGroupModal`, `AddTargetModal`, `NegativeListsTab`, `EditTaskModal`, `UploadCoverModal`

`<select>` тегов 32 — заменить на `<Select>` где встречаются.

**⚠️ Risk:** inline `inputClass` использует `h-9 rounded-md`, а `<Input>` primitive — `h-auto py-1.5 rounded-sm`. Перед миграцией — выровнять `Input.tsx` под `h-9 rounded-btn`, чтобы swap был визуально нулевым.

**Файлы:** новый `ui/Select.tsx`, `ui/Textarea.tsx`, `ui/Field.tsx` + правка `ui/Input.tsx` + ~10 file edits в модалках.
**Reference:** `06-forms.md §Input / form audit`.

### Q.1.4 — Починить MainLayout sidebar nav (45 min)

Сейчас `MainLayout.tsx:408-462` строит свой кастомный `NavItemRow` (с Pro badge + shortcut hint), а `ui/NavItem.tsx` — dead code.

Варианты:
- **A. Удалить `ui/NavItem.tsx`**, акцептовать что sidebar nav живёт в MainLayout. **+**: меньше кода, **−**: NavItem перестаёт быть «примитивом».
- **B. Расширить `ui/NavItem.tsx`** props `lockedBadge?: 'pro' | 'business'` + `shortcut?: string`, заменить inline NavItemRow на `<NavItem>`. **+**: NavItem становится переиспользуемым, **−**: NavItem usage = 1 (только MainLayout), может стать переиспользуемым в будущем (Settings sub-nav, Command palette items).

**Рекомендация:** **B**. Это primitives layer; пусть будет один nav primitive вместо двух.

**Файлы:** `ui/NavItem.tsx` (расширить), `MainLayout.tsx` (заменить inline → primitive).
**Reference:** `01-primitives.md §Inline-styled duplicates → NavItem inlined`, `02-pages.md §Recommendation 1`.

### Q.1.5 — `<GradientArea>` chart primitive (1 hour)

Запилить `src/renderer/components/ui/charts/GradientArea.tsx`. Тонкая обёртка вокруг recharts `<AreaChart>` + `<defs><linearGradient>`. Параметры:
- `data`, `dataKey`, `xKey`
- `color` (default `'analytics'` → module token `#3b82f6`)
- `headlineValue?: string` (overlay в верхнем-левом углу в Playfair Display)
- `tickFormat?: (v) => string`
- Default: `vertical={false}` grid, `tickLine={false}`, `axisLine={false}`, tick color `#a1a1aa`, font-mono ticks.

Не мигрируем чарты в Q.1 — только примитив. Миграция — в Q.3 (HeroChart, PnLChart, BsrModal, TrendModal, RankHistoryModal).

**Файлы:** новый `ui/charts/GradientArea.tsx`.
**Reference:** `04-charts.md §Recommendation 1`.

### Q.1.6 — `<MetricNumber>` + `<DisplayHeading>` (30 min)

`ui/MetricNumber.tsx` — обёртка `<span className="font-mono tabular-nums">{value}</span>` с опциональными props `size: 'sm' | 'md' | 'lg' | 'hero'` (15/18/24/48 px). Заменяет 10+ inline `text-2xl font-semibold tabular-nums` в `Kpi.tsx`, `KpiDelta.tsx`, и в money-cells.

`ui/DisplayHeading.tsx` — `<h1 className="font-display font-bold tracking-tight">`. Используется в `PageHeader.tsx` (см. Q.2.2). Не на всех страницах напрямую — только через PageHeader.

**Файлы:** `ui/MetricNumber.tsx`, `ui/DisplayHeading.tsx`.

### Q.1.7 — `<Tabs>` primitive (1.5 hours)

Сейчас 3 разных tab-bar implementation. Запилить один:

```tsx
<Tabs value={activeTab} onChange={setActiveTab} variant="underline">
  <Tab value="overview" label="Overview" count={12} />
  <Tab value="campaigns" label="Campaigns" count={245} />
</Tabs>
```

Variants: `underline` (border-bottom, как Alerts/Reports/Negatives/CampaignDetails/Automation), `pill` (rounded-md, не используется сейчас, но Settings + ReverseAsin требуют).

**НЕ мигрировать все 5 страниц в Q.1** — это часть Q.3 (worst-pages repaint, особенно Reports). Только сам примитив.

**Файлы:** новый `ui/Tabs.tsx`.
**Reference:** `01-primitives.md §Missing primitives`, `02-pages.md §Recommendation 1`.

### Q.1.8 — `<StatusBadge>` (30 min)

Расширить существующий `Badge.tsx`:
- `size?: 'xs' | 'sm'` (для `h-4`/`h-5` cases)
- `shape?: 'rect' | 'pill'` (для `rounded-full` uppercase tracking-wider случаев)
- `variant`: добавить `active` / `paused` / `pending` поверх существующих

Заменить 5 inline pill-styles в:
- `settings/AITab.tsx:641`
- `settings/ApplicationTab.tsx:321`
- `settings/StreamTab.tsx:76`
- `settings/fullSync/SyncQueue.tsx:129`
- `NegativeListsTab.tsx:210`
- `CountrySelector.tsx:38`

**Файлы:** `ui/Badge.tsx` + 5–6 file edits.
**Reference:** `06-forms.md §Badge / status pill audit`.

### Q.1.9 — `<LockedFeatureCard>` (40 min)

5 разных страниц имеют ~80% идентичные lock-screens:
- `Automation:130-164`
- `ListingStudio:73-103`
- `Research:96-113`
- `Briefing:144-177`
- `KeywordsPage` Reverse-ASIN locked

Запилить `ui/LockedFeatureCard.tsx`:
```tsx
<LockedFeatureCard
  icon={<Sparkles />}
  title={t('ai.titleGenerator.locked.title')}
  description={t('ai.titleGenerator.locked.description')}
  tier="pro"
  onUpgrade={...}
/>
```

Tier badge → amber (из decision 1, modules.ai), не violet.

**Файлы:** новый `ui/LockedFeatureCard.tsx` + 5 file edits.
**Reference:** `02-pages.md §Cross-page patterns 7`, `03-brand.md §modules.ai`.

### Day 2 — Acceptance
- [ ] `<Modal>`, `<SegmentedControl>`, `<Select>`, `<Textarea>`, `<Field>`, `<GradientArea>`, `<MetricNumber>`, `<DisplayHeading>`, `<Tabs>`, `<StatusBadge>`, `<LockedFeatureCard>` — все экспортированы из `ui/index.ts`.
- [ ] 15 модалок мигрированы на `<Modal>`.
- [ ] 10+ inline segmented controls мигрированы.
- [ ] 5 lock-screens мигрированы.
- [ ] `MainLayout` использует `<NavItem>` primitive.
- [ ] 5 копий `const inputClass` удалены.
- [ ] `grep "bg-zinc-900/20\\|/30\\|/40" src/` показывает только один паттерн (или ноль — всё через `<Modal>`).
- [ ] 152 теста зелёные.

---

## 5. Phase Q.2 — Brand identity application (Day 3, ~6 hours)

**Цель.** Применить emerald + Playfair + JetBrains Mono. Visual moment — это после Q.2 app начинает _выглядеть_ как KDPBook.

### Q.2.1 — Emerald reapplication (1.5 hours)

Применить emerald **точечно** (на основе Decision 3 = «keep black-as-primary, emerald на акценты»):

| Где | До | После | Файл |
|---|---|---|---|
| Sidebar active item | `bg-zinc-100 text-zinc-900 font-medium` | `bg-emerald-50 text-zinc-900 font-medium` + `border-l-2 border-emerald-500 -ml-2 pl-[10px]` (или icon → `text-emerald-600`) | `MainLayout.tsx:431-433` |
| Active icon color | `text-zinc-900` | `text-emerald-600` | `MainLayout.tsx:439` |
| Focus ring | `ring-zinc-900` | `ring-accent` (emerald через token) | везде через tailwind `ring` token |
| "Active"/"Live" pills | уже emerald в части мест | unify emerald | `CampaignsPage.tsx:457` + ~5 мест |
| Connection indicator dot online | `bg-emerald-500` уже OK | без изм. | `MainLayout.tsx:509` |
| Primary chart line (single-metric mode) | `#3b82f6` analytics | без изм. (analytics — это blue, не emerald) | charts |
| Sync running pill | если есть progress bar | `bg-emerald-500` fill | `SyncStatusPill.tsx` |
| High-emphasis CTAs (Upgrade, Run briefing now, Apply rules) | `bg-violet-600` или `bg-zinc-900` | `bg-emerald-500 hover:bg-emerald-600` | `BriefingPage.tsx:196`, `UpgradeModal.tsx`, etc. ~4 места |

НЕ менять:
- 75 inline `bg-zinc-900` модальных submit-кнопок (decision 3 = keep black).
- Destructive (red), warning (amber) — semantic, остаётся.

**Файлы:** `MainLayout.tsx` + ~10 точечных правок.
**Reference:** `03-brand.md §Concrete migration list → Accent reapplication`.

### Q.2.2 — `PageHeader` с Playfair (30 min)

`src/renderer/components/ui/PageHeader.tsx`:
```tsx
<h1 className="font-display text-[clamp(1.75rem,3.5vw,2.5rem)] font-bold tracking-[-0.02em] text-zinc-900">
  {title}
</h1>
<p className="text-sm text-zinc-500 mt-1">{subtitle}</p>
```

Один файл — 21 страница получает serif heading автоматически. Это **второй editorial moment** в app (первый — wordmark).

**Файлы:** `ui/PageHeader.tsx`.
**Reference:** `03-brand.md §Typography mapping`.

### Q.2.3 — JetBrains Mono для чисел (2 hours)

Applied selectively. **НЕ применять к произвольным цифрам в prose** («3 books selected») — overkill.

Применить через `<MetricNumber>` или прямой `font-mono tabular-nums`:

| Где | Файлы |
|---|---|
| `<Kpi>` value | `ui/Kpi.tsx:29` |
| `<KpiDelta>` value | `ui/KpiDelta.tsx` |
| Money cells in tables | `BooksPage`, `CampaignsPage`, `KeywordsPage`, `SearchTermsPage`, `PnLPage`, `ReportsPage`, `DashboardPage`, `ComparisonPage`, `AccountingPage`, `NegativesPage` |
| Percent cells (ACOS, TACoS, ROAS) | same |
| Recharts axis tick labels | `HeroChart`, `HourlyDynamicsChart`, `PnLChart`, `MarketplaceDistribution`, `BsrModal`, `TrendModal`, `RankHistoryModal`, `ReportsPage` daily + by-marketplace |
| ChartTooltip values column | `ui/ChartTooltip.tsx` (add `font-mono` to value span) |
| ⌘K kbd hints | `MainLayout.tsx:338`, `CommandPalette.tsx` (уже font-mono через Tailwind default — просто загружаются настоящие JetBrains Mono после Q.0.1) |

Tactic: codemod добавляет `font-mono` к классам где уже есть `tabular-nums`. ~30 точек.

**Файлы:** ~15 file edits (table cell renderers).
**Reference:** `03-brand.md §Typography mapping → Numbers in metrics`, `04-charts.md §ChartTooltip consistency`.

### Q.2.4 — Lock-badges violet → amber (45 min)

Replace в:
- `MainLayout.tsx:447` — Pro badge — `bg-violet-100 text-violet-700` → `bg-amber-100 text-amber-700`
- `LockedFeature.tsx` (если используется)
- `settings/AITab.tsx`
- `index.css:53,67` — dark-mode mapping
- `<LockedFeatureCard>` (из Q.1.9) — icon container color amber

Reasoning: DNA `modules.ai = #f59e0b` (amber). Сейчас все lock-badges violet (DESIGN.md leftover). После retire DESIGN.md violet нет смысла держать.

**Файлы:** ~5–10 file edits.
**Reference:** `03-brand.md §modules.ai decision`.

### Q.2.5 — HeroChart single-metric mode + gradient (1.5 hours)

`src/renderer/components/dashboard/HeroChart.tsx`:
- Когда `active.length === 1`: render через `<GradientArea>` (Q.1.5), не line. Color по module (spend=ads green, sales=marketplace rose, profit=ai amber, royalty=publishing violet, ROAS=analytics blue, etc.) — таблица в `04-charts.md §Module color mapping`.
- Когда `active.length > 1`: оставить multi-line как есть (power-user view).
- Overlay headline: top-left absolute `<div className="font-display text-3xl font-bold">$12,847</div>` показывает sum/avg для активной метрики.
- Move `HeroTooltip` определение **наружу** render body (сейчас на `:170` — создаёт new component identity каждый render).

**Файлы:** `HeroChart.tsx`.
**Reference:** `04-charts.md §Recommendation 3, §Other findings (perf)`.

### Day 3 — Acceptance
- [ ] Sidebar active item — emerald accent, не zinc.
- [ ] Page headers — Playfair Display, ~28px, tracking-tight.
- [ ] Kpi values, money/percent cells, chart axis labels — JetBrains Mono.
- [ ] Lock-badges — amber, не violet.
- [ ] HeroChart single-metric mode — gradient area + headline overlay.
- [ ] `grep violet src/` показывает только legacy fallback или ничего.
- [ ] 152 теста зелёные.

---

## 6. Phase Q.3 — Worst pages repaint (Day 4, ~7 hours)

**Цель.** Поднять 5 worst-страниц до приемлемого уровня (composite ≥ 5.5). Не редизайн — целевое применение паттернов из Q.0-Q.2 + cross-page fixes.

### Q.3.1 — Cross-page sweep (2 hours, hits everything)

Эти изменения применяются глобально и поднимают все страницы одновременно:

**Table cell size:** `text-xs` / `text-[10px]` / `text-[11px]` → `text-sm` (body) и `text-xs uppercase` (headers).
- Файлы: `BooksPage:411-421`, `CampaignsPage:317-329`, `Dashboard:325-333`, `Accounting:111-117`, `SearchTermsPage`, `NegativesPage`, `ReportsPage`, `ComparisonPage:393-409`, `AlertsPage`, `ActionCenterPage`, `KeywordsPage` (virtualized — bump `ROW_HEIGHT=40` → 44 + `text-sm`).
- 12 файлов, единый паттерн.

**KPI grid:** `grid-cols-4` → `grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4`. `Kpi` value bump `text-2xl` → `text-3xl`.
- Файлы: `Dashboard:187`, `BooksPage:380`, `OperationsCenter:160`, `SearchTermsPage:390`, `ComparisonPage:348`, `Reports:402`, `PnL` (PnLKpiRow), `Alerts:139`, `Automation`.

**ActiveFiltersBar:** добавить на 14 страниц где global filters applied но bar отсутствует — `Keywords`, `Alerts`, `Negatives`, `Accounting`, `ActionCenter`, `Operations`, `Automation`, `Briefing`, `Research`, `ListingStudio`, `Royalties`, `CampaignDetails`. (Profile, Settings — не trogaem, не data pages.)

**Файлы:** ~20 file edits, паттерны простые.
**Reference:** `02-pages.md §Cross-page patterns 1, 2, 10`, §Recommendation 2, 3, 11.

### Q.3.2 — ReportsPage (composite 3.3 → target 6.0, 1.5 hours)

Сейчас: 14 inline tabs в horizontal scroller. Cluster + sub-tab без иерархии.

**Изменения:**
- 14 tabs → 3 группы через подзаголовки в новом `<Tabs>` primitive (group headers — sticky, не выбираемые):
  - **Time series** (overview, hourly, budget_pacing)
  - **Breakdown** (by-marketplace, by-account, by-book, by-campaign, by-keyword)
  - **Cross-cut** (matrix, placement, match_type, targeting_type, bidding_strategy, campaign_type)
- Granularity toggle (`daily`/`weekly`) — переехать из тела `overview` tab в PageHeader right-slot (или сразу под KPI strip).
- Daily chart: переключить spend line на module ads green (`#10b981`), sales line на marketplace rose (`#f43f5e`), чтобы не были visually identical. Опционально — spend → `<GradientArea>`.

**Файлы:** `ReportsPage.tsx`.
**Reference:** `02-pages.md §Top-5 worst pages → ReportsPage`, §Recommendation 5; `04-charts.md §ReportsPage Daily`.

### Q.3.3 — KeywordsPage (3.6 → 6.0, 1 hour)

Сейчас: virtualized table `ROW_HEIGHT=40` + `text-xs`, нет KPIs, нет chart-hero, noise-filter inline.

**Изменения:**
- Bump `ROW_HEIGHT=40` → `48` + `text-sm` body cells.
- Добавить 3-KPI strip над таблицей: `top movers`, `avg ACOS`, `total clicks` (используя `<Kpi>`).
- Noise filter — вытащить в `<Card title="Filters">` collapsible, не inline.
- Опционально (можно отложить): top-5 movers `<GradientArea>` chart hero на 80px высоту.

**Файлы:** `KeywordsPage.tsx`.
**Reference:** `02-pages.md §Top-5 worst pages → KeywordsPage`.

### Q.3.4 — NegativesPage (3.9 → 5.5, 30 min)

Сейчас: select-as-Card-body, нет KPIs, no Add CTA in header.

**Изменения:**
- Campaign picker `<select>` → `<Select>` primitive (через Q.1.3), переехать в PageHeader right-slot.
- Удалить «Pick a campaign» Card — освободить above-the-fold.
- Add KPI strip: `total negatives`, `from search terms`, `manual`, `active lists`.
- Add `<Button variant="primary">+ Add words</Button>` в PageHeader right-slot.

**Файлы:** `NegativesPage.tsx`, `NegativeListsTab.tsx` (если merged view).
**Reference:** `02-pages.md §Top-5 worst pages → NegativesPage`.

### Q.3.5 — AccountingPage (4.4 → 5.5, 45 min)

Сейчас: две raw tables stacked, no charts, no filters.

**Изменения:**
- Date format в transaction rows: ISO slice (`'…'.slice(0,10)`) → `fmtDate(d, locale)` (через существующий `lib/format.ts`).
- Truncate `max-w-md` без tooltip → добавить `<Tooltip>` (Q.1 не добавляет tooltip primitive — можно отложить или использовать native `title=` до Phase R).
- Добавить date-range фильтр (`<RangePicker>`) + per-account фильтр в PageHeader right-slot.
- Добавить 1 chart: monthly balance trend `<GradientArea>` сверху над таблицами.
- Pagination на 100-row tx table.

**Файлы:** `AccountingPage.tsx`.
**Reference:** `02-pages.md §Top-5 worst pages → AccountingPage`.

### Q.3.6 — SearchTermsPage (4.4 → 5.5, 1 hour)

Сейчас: 4-control header cluster, narrow right-pane, sticky bulk-select bar fights for attention.

**Изменения:**
- Header right-slot — сократить до 2 controls: `<RangePicker>` + `<ExportMenu>`. Tab bar + right-pane toggle переехать в sub-row под `PageHeader`.
- Right-pane width: `grid-cols-[1fr_320px]` → `grid-cols-[1fr_360px]` (даёт modal больше места) ИЛИ полностью убрать тогл и сделать right-pane либо `380px`, либо hidden — без середины.
- Sticky bulk-select bar: `bg-zinc-900 text-white` → `bg-emerald-50 text-emerald-900 border border-emerald-200` (мягче, не fight за внимание с sidebar + topbar).
- Tab count badges `text-[10px] min-w-[18px]` → `<Badge size="xs">` (Q.1.8).

**Файлы:** `SearchTermsPage.tsx`.
**Reference:** `02-pages.md §Top-5 worst pages → SearchTermsPage`.

### Q.3.7 — Дополнительные чарты на gradient (45 min, если время)

Использовать `<GradientArea>` где осталось:
- `PnLChart.tsx:79` — single-line spend, идеальный candidate для `<Area>` + gradient.
- `BsrModal.tsx:102` — already minimal axis, add gradient.
- `TrendModal.tsx:174` — переключить с default tooltip на `<ChartTooltip>` + line→area.
- `RankHistoryModal.tsx:178` — same.

**Файлы:** 4 chart files.
**Reference:** `04-charts.md §Gap analysis vs mockup`, §Recommendation 1.

### Day 4 — Acceptance
- [ ] Worst-5 страниц подняты до composite ≥ 5.5 (повторный visual review).
- [ ] Все table body cells = `text-sm`, headers = `text-xs uppercase`.
- [ ] KPI grid responsive (2/3/4 cols).
- [ ] `ActiveFiltersBar` на 7+14 = 21 страницах где global filters applied.
- [ ] Reports — 14 tabs сгруппированы в 3 секции.
- [ ] HeroChart, PnLChart, BsrModal, TrendModal, RankHistoryModal — gradient + ChartTooltip unified.
- [ ] 152 теста зелёные.

---

## 7. Phase Q.4 — Navigation & UX bugfixes (Day 5 AM, ~3 hours)

**Цель.** Закрыть конкретные UX-баги из Phase P audit + sidebar polish.

### Q.4.1 — Attribution global toggle (1.5 hours)

**Bug:** `AttributionToggle` существует только на PnL. На Dashboard / Reports / Comparison / Books drill — hardcoded `attribution="14d"`.

**Fix:**
- Создать `<GlobalAttributionToggle>` в topbar (между `<GlobalFilters>` и `⌘K`), persist в `localStorage` (`global:attribution`), default `14d`.
- Lift `attribution` из per-page hardcode в новый Context `GlobalAttributionContext` (или extend существующий `GlobalFiltersContext`).
- Заменить hardcoded `attribution="14d"` в:
  - `DashboardPage.tsx:282, 300`
  - `ReportsPage.tsx:355, 368, 381`
  - `ComparisonPage.tsx:274`
  - `CampaignWeeklyMetrics.tsx` (Books drill)
  - `metrics.ts:417` (default остаётся 14d)

**Файлы:** новый `components/GlobalAttributionToggle.tsx`, новый context (или extend), 4 page edits, `MainLayout.tsx` (slot in topbar).
**Reference:** `05-navigation.md §Discoverability findings`.

### Q.4.2 — Fix `G E` hotkey label (15 min)

Listing Studio: `shortcut: 'G E'` → `'G W'` в:
- `MainLayout.tsx:144` (sidebar metadata)
- `CommandPalette.tsx:106` (palette hint)

Runtime mapping уже правильный (`MainLayout.tsx:189` `w → listing_studio`), просто label stale.

**Файлы:** 2 file edits.
**Reference:** `05-navigation.md §Hotkey conflicts`.

### Q.4.3 — Sidebar polish (45 min)

- **Add «AI» subhead** между `alerts` и `listing_studio` в Actions section (typography only, без collapse / restructure). Просто `<div className="px-3 pt-3 pb-1.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">AI</div>`.
- **Collapse Actions + Finance by default** (option A из density table) — `localStorage` key `sidebar:section:actions:collapsed`, `sidebar:section:finance:collapsed`. Chevron icon на header. Animation `transition-all duration-base ease-smooth`.

**Файлы:** `MainLayout.tsx` + minor state.
**Reference:** `05-navigation.md §Within-option-B recommendations 3, 4`.

### Q.4.4 — CommandPalette missing actions (30 min)

Добавить 4 пункта:
- `Sync now` — calls into SyncStatusPill logic
- `Open Settings → Full Sync` — deep-link
- `Toggle theme` — re-uses UserMenu segmented control logic
- `Reset global filters` — re-uses GlobalFilters reset

**Файлы:** `CommandPalette.tsx`.
**Reference:** `05-navigation.md §Command palette coverage`.

### Q.4.5 — Sidebar ConnectionIndicator → SyncStatusPill (skipped, optional)

`05-navigation.md` рекомендует folding ConnectionIndicator footer в SyncStatusPill amber state. **Откладываем на Phase R** — SyncStatusPill только что добавлен, его API ещё не stable. Не блокируем Q на этом.

### Day 5 AM — Acceptance
- [ ] Attribution toggle виден в topbar, меняет attribution на 4 страницах.
- [ ] Listing Studio sidebar label = `G W`, palette hint = `G W`, runtime срабатывает.
- [ ] Sidebar: «AI» subhead, Actions + Finance свёрнуты по умолчанию.
- [ ] ⌘K имеет Sync now / Open Settings → Full Sync / Toggle theme / Reset global filters.

---

## 8. Phase Q.5 — QA + docs (Day 5 PM, ~3 hours)

### Q.5.1 — Visual regression (1 hour)
- Screenshot before / after per page (21 страница). Использовать существующий `npm start` + manual capture, или Playwright если уже настроен.
- Кросс-чек: dark mode не сломан (для каждой страницы переключить theme в UserMenu, проверить).

### Q.5.2 — Test pass (30 min)
- `npm test` (152 теста).
- Fix breakages (если есть). Не ожидается много — мы не трогаем `data-testid`, не меняем i18n keys.
- Если есть test, который проверяет visible string «Ads Tracker» — обновить под «KDPBook».

### Q.5.3 — Lint pass (15 min)
- `npm run lint`. Fix warnings.

### Q.5.4 — DESIGN.md финализировать (15 min)
Уже сделано в Q.0.6, повторный проход: убедиться что нет legacy refs на `#6E56CF` / Geist / violet anywhere в docs.

### Q.5.5 — CLAUDE.md / README обновить (30 min)
- `CLAUDE.md`: обновить top section с новым именем (если decision = rename/hybrid).
- `README.md` first paragraph.
- `docs/electron-migration/README.md`: добавить entry "Phase Q completed 2026-05-2X".
- `parity-plan.md` или `master-plan-2026-05-10.md`: отметить Phase Q closed.

### Q.5.6 — Memory update (15 min)
Записать новые memory files:
- `feedback_design_system.md` — emerald + Playfair + JetBrains Mono + module palette + tokens established
- `project_phase_Q_status.md` — Phase Q closed, что включено, что отложено

### Q.5.7 — Commit strategy (по запросу юзера)
- Не коммитим автоматом (memory: `feedback_commits.md`).
- Готовим one PR `phase-q-design-pass` с logical sub-commits per phase (Q.0 / Q.1 / Q.2 / Q.3 / Q.4 / Q.5). Юзер reviews + merges.

### Day 5 PM — Acceptance
- [ ] 21 screenshot before/after.
- [ ] 152 теста зелёные, lint zero warnings.
- [ ] DESIGN.md / CLAUDE.md / README обновлены.
- [ ] Memory обновлена.
- [ ] PR draft готов, не запушен.

---

## 9. Acceptance criteria (Phase Q overall)

Phase Q считается closed когда:

1. **Visual.** Каждая из 21 страницы прошла visual review side-by-side с букплатформ-мокапом. Composite (по аудиту 02) ≥ 5.5 для всех; ≥ 7.0 для Dashboard/Listing/Briefing/PnL.
2. **Tokens.** `tailwind.config.js` имеет все 30+ новых токенов из Q.0.2. Никаких `bg-accent-soft`-style undefined classes в коде.
3. **Brand.** Sidebar wordmark = «KDPBook · Ads Tracker · v0.1.0» (если decision = hybrid). HTML title = «KDPBook». Native dialogs «KDPBook». README first paragraph mentions KDPBook.
4. **Primitives.** Adoption rate (количество `<Button>` / `<Input>` / `<Modal>` / `<Badge>` / etc.):
   - Modals: 15 of 20 use `<Modal>` (UpgradeModal + CommandPalette + 3 searchTerms — исключения).
   - Buttons: ≥150 usages of `<Button>` (с 14 до 150+ за счёт modal migration + page-level migration).
   - Inputs: ≥80 usages of `<Input>`.
   - Inline `<input className="w-full h-9 ...">` constants: 0 (5 → 0).
5. **Charts.** HeroChart + PnLChart + BsrModal + TrendModal + RankHistoryModal используют gradient + `<ChartTooltip>`. Zero `#6E56CF` in `src/`.
6. **Hotkeys.** Listing Studio → `G W` everywhere. Attribution global toggle works.
7. **Tests.** 152/152 green. Lint 0 warnings.
8. **Docs.** DESIGN.md актуальный, parity-plan / master-plan обновлены, memory `project_phase_Q_status.md` создана.
9. **Dark mode.** Не сломан (random spot-check 5 страниц).

---

## 10. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Тесты ломаются из-за изменённых visible strings («Ads Tracker» → «KDPBook») | Medium | Low | I18n abstracts uses — touch `appName` value once, tests читают через i18n key. Перед коммитом — find/replace в тестах. |
| `<Input>` height mismatch (`h-9` vs `h-auto`) ломает alignment в формах | Medium | Medium | Q.1.3: align `Input.tsx` к `h-9 rounded-btn` ДО миграции. Visual diff проверить. |
| Playfair Display на 14px UI читается «fussy» | Low | High (если случилось — vibe сломан) | Применяем ТОЛЬКО на wordmark + PageHeader H1 (≥28px). НЕ на body/buttons/inputs. Reference: `03-brand.md §Honest take on Playfair`. |
| Emerald + zinc dark mode → contrast issues | Medium | Medium | Перед коммитом — `--ring` в dark mode `oklch(0.73 0.17 162)` или `emerald-400`. Spot-check dark mode toggle на 5 страницах. |
| Bundle size +280 KB woff2 фонтов | Low | Low | One-time, Electron app. Acceptable per `03-brand.md`. |
| 15 modal миграция = большой diff = merge conflicts | High | Low | Q.1.1 → отдельный коммит, маленький per modal. Sequential. |
| `appBundleId` случайно меняется | Low | **High** | NOT TOUCHING `appBundleId`. Если кто-то трогает `package.json` `name`/`productName` — НЕ трогать `appBundleId` в `forge.config.ts`. Reference: `03-brand.md §Brand boundary decision §4`. |
| `electron-updater` ломается из-за GitHub repo rename | Very Low | **Critical** | NOT renaming the repo. URL `Juli374/ads-tracker-desktop` hardcoded в forge config — leave untouched. |
| Phase P bug fix (attribution) ломает existing pages | Medium | Medium | Q.4.1 → новый context добавляется поверх существующего GlobalFiltersContext, default = 14d (текущий hardcoded value). Visually zero change для юзера в default state. |
| Visual regression — что-то выглядит хуже | Medium | Medium | Q.5.1 screenshot before/after. Если хуже — откат конкретного коммита, не всей фазы. |
| Расширение скоупа во время работы | High | High | **Out-of-scope list ниже** — приколочен. Любое «давай ещё» → Phase R. |

---

## 11. Out-of-scope (явно, для будущей фазы)

Эти вещи **НЕ делаем в Phase Q**, даже если очень хочется:

### Стратегические (option C, public release lane):
- Перестройка IA в 4 модуля (Ads / Analytics / Publishing / AI Tools).
- Reclassify Books → Publishing.
- Reclassify Listing Studio / Briefing / Research → AI Tools.
- Icon-only sidebar mode.
- Pinning / Recent / "More" submenus.
- Replacement of 3-section sidebar with 2-level navigation.

### Motion / эффекты:
- Lenis smooth scroll.
- Framer-motion entrance animations.
- Magnetic buttons.
- Mesh gradients.
- Cursor glow.
- Animated topo SVG.

### Visual deep work:
- Marketing-style hero illustrations на страницах.
- Mobile / narrow-window responsive.
- Dark mode redesign (оставляем как есть).
- Hero illustration на Profile / Briefing / Listing Studio.

### Tooling:
- Radix / headlessui для `<Select>` / `<Tooltip>` / `<Popover>` (используем native + thin custom).
- Storybook.
- Visual regression CI (Playwright + screenshots в pipeline).

### Brand:
- Renaming `appBundleId`, URL scheme, GitHub repo, `electron-updater` URL — **никогда** в Phase Q.
- Иконки `icon.icns` / `icon.ico` / `icon.png` — можно отложить на follow-up commit (старая иконка работает).

### Forms / validation:
- Inline form validation (error border, helper text, aria-invalid) — отложено в Phase R.
- Tooltip primitive (используем native `title=`) — Phase R.

### Charts:
- A11y `sr-only` summary tables для charts — Phase R.
- `<Funnel>` (recharts native) — оставляем CSS-implementation.
- `<MarketplaceDistribution>` recolor по mapping — частично сделано в Q.0.4 (retire violet), полный module mapping — Phase R.

---

## 12. Effort breakdown

| Phase | Working hours | Owner |
|---|---|---|
| Pre-flight decisions | 0 (нужны ответы юзера) | юзер |
| Q.0 — Foundation | 6–7 | dev |
| Q.1 — Primitives | 7 | dev |
| Q.2 — Brand application | 6 | dev |
| Q.3 — Worst pages | 7 | dev |
| Q.4 — Nav / UX bugfixes | 3 | dev |
| Q.5 — QA + docs | 3 | dev |
| **Total** | **32–33 h** | |

При темпе 6–7h/day = **5 рабочих дней**. При темпе 8h/day = **4 рабочих дня**. План соответствует option B бюджету.

---

## 13. File touch summary

Объём изменений (приблизительный):

| Категория | File count | Lines changed (≈) |
|---|---|---|
| `tailwind.config.js` | 1 | +60 |
| `package.json` | 1 | +3 deps |
| `src/renderer.tsx` | 1 | +8 (font imports) |
| New `ui/*.tsx` primitives | 10 | +600 |
| Modal migration | 15 | -400 / +200 |
| Inline `inputClass` removal | 5–9 | -90 |
| Inline segmented control removal | 14 | -210 |
| Lock-screen migration | 5 | -250 / +50 |
| Page-level table cell sweep (`text-xs` → `text-sm`) | 12 | +24 |
| KPI grid responsive | 9 | +18 |
| ActiveFiltersBar add | 14 | +28 |
| Worst-page repaints | 5 | +200 / -150 |
| Chart gradient migration | 5 | +60 / -20 |
| Brand text rename (`Ads Tracker` → `KDPBook` hybrid) | 16 | +20 / -16 |
| MainLayout (wordmark + sidebar nav + ag subhead + attribution slot) | 1 | +50 / -10 |
| Hotkey label fix | 2 | +2 / -2 |
| Attribution global toggle | new + 4 edits | +120 |
| Command palette new actions | 1 | +30 |
| DESIGN.md rewrite | 1 | -150 / +30 |
| README / CLAUDE.md docs | 3 | +20 / -20 |
| **TOTAL** | **~120 file touches** | **+2,500 / -1,300 net = +1,200 LOC** |

Не должно занять >5 дней при сосредоточенной работе. Большинство изменений — token-level + mechanical sweeps.

---

## 14. Reference index

| Audit | File | Key content |
|---|---|---|
| 01 | [01-primitives.md](./01-primitives.md) | Existing primitives table, broken tokens, missing primitives, Top-10 recommendations |
| 02 | [02-pages.md](./02-pages.md) | All 21 pages scored, worst-5 deep-dives, cross-page patterns |
| 03 | [03-brand.md](./03-brand.md) | Brand mapping, color palette, typography rules, day-by-day plan, scope decisions |
| 04 | [04-charts.md](./04-charts.md) | Chart inventory, gradient/color gaps, module color mapping, perf flags |
| 05 | [05-navigation.md](./05-navigation.md) | Sidebar IA, hotkeys, attribution bug, command palette, topbar |
| 06 | [06-forms.md](./06-forms.md) | Modal inventory (20), Button/Input adoption, segmented controls, status pills |

External:
- `book-platform/design-dna.json` — brand source of truth
- `book-platform/app/globals.css` — target CSS tokens
- `book-platform/components/dashboard/Sidebar.tsx` — target sidebar reference
- `docs/electron-migration/master-plan-2026-05-10.md` — overall product trajectory (Phase Q adds to this)

---

## 15. Next steps

1. **Юзер отвечает на 3 pre-flight decisions** (Decision 1, 2, 3 в §2).
2. **Опционально:** короткий design review session 15–30 min — пройти по wireframe-уровню 3–5 страниц мокап vs план, убедиться что направление правильное.
3. **После решений:** старт Day 1 (Phase Q.0). Каждая фаза — отдельный commit, тесты прогоняются после каждой.
4. **После Day 5:** screenshot review side-by-side + PR draft. Merge — после визуального approval юзером.

_Конец плана. Все детали — в 6 файлах аудита в этой же папке._
