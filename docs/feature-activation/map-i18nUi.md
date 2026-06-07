I have all the information needed. Here is the complete map.

---

# KDPBook Desktop — Settings/Feature-Toggle Build Map

All paths absolute. Repo root: `/Users/yulii/KDP-business/ads-tracker-desktop`.

**Top-level reality check:** A Settings section already exists and is tab-based. New feature-toggle UI should be added as **a new tab** in the existing `SettingsTabs`/`SettingsPage` machinery (or as grouped `Card`s within a tab), not a from-scratch page. There is **no dedicated `Switch`/`Toggle` primitive** in `components/ui/` — toggles are hand-rolled inline. There is also **no `cn`/`clsx`/`tailwind-merge` helper**; every component composes classes with template strings.

---

## (1) i18n recipe

### Where strings live & how it is wired
- **Config / bootstrap:** `src/renderer/i18n/index.ts` — single `i18next.init()`. Engine: `i18next` + `i18next-icu` (ICU plural/select syntax is available) + `initReactI18next`.
- **Bootstrap import:** `src/renderer/App.tsx:3` → `import i18n from './i18n';` (side-effect init; runs before render).
- **Type augmentation:** `src/renderer/i18n/types.d.ts` — declares `CustomTypeOptions` so `t()` keys are typed/autocompleted per namespace. **Every new namespace must be registered here too**, or `t()` won't type-check.
- **Resources:** `src/renderer/i18n/resources/<lang>/<namespace>.json`. One file = one namespace.

### CRITICAL gotcha — Russian is NOT actually loaded
Despite the project being Russian-facing, the runtime is **English-only right now**:
- `index.ts:30` hardcodes `lng: 'en'`, `fallbackLng: 'en'`.
- `index.ts` imports **only** the `en/*` files (lines 5-24). The `ru/` folder is **not imported at all**, and there is **no `changeLanguage` call or language switcher** anywhere in `src/renderer` or `src/main` (verified by grep).
- Most `ru/*.json` files are empty `{}` (3 bytes), including `ru/settings.json`. Only `ru/auth.json`, `ru/campaigns.json`, `ru/keywords.json` have partial content — but since `ru` is never registered in `resources`, none of it renders.

**Implication for the task:** The prompt asks for "ru AND en both required." Functionally, **only `en/settings.json` (or your new namespace's `en` file) will render today.** You should still author the `ru/` file to match (the scaffold convention expects it, and it's low-cost to keep parity), but to make `ru` ever appear you must additionally wire it into `index.ts` (import `ru*` files + add `ru: { ... }` to `resources`) and add a language switch. Flag this to the user — it's a latent gap, not a one-liner.

### Namespacing & the `t()` call pattern
- **Namespace = filename.** Settings strings live in the `settings` namespace (`resources/en/settings.json`).
- **Scope `t` to the namespace at the hook:** `const { t } = useTranslation('settings');` then call `t('privacy.consentLabel')`. Pattern seen at `SettingsPage.tsx:51`, `AITab.tsx:121`, `PrivacyTab.tsx:15`.
- **Keys are dot-paths into nested JSON.** `settings.json` top level is shallow groups: `title`, `subtitle`, `errors`, `tabs`, then one object per tab (`privacy`, `booksTab`, `ai`, `credentials`, `fullSync`, `searchTerm`, `stream`, …). So a toggle reads `t('mySection.someToggle.label')`.
- **ICU interpolation / pluralization:** `t('booksTab.selected', { count: selected.size })` and `t('tabs.profilesWithCount', { count })`. ICU plural blocks work because `i18next-icu` is loaded.
- **Dynamic keys need a cast** (typed-resources side effect): `t(`fullSync.options.${opt}` as 'fullSync.options.campaigns')` (`SyncOptionsGrid.tsx:50`), `t(`tabs.${tab.id}` as 'tabs.application')` (`SettingsTabs.tsx:69`). Use the same `as 'someKnownKey'` escape hatch for toggle keys built from a feature id.

### How to add a new section of toggles (recommended: reuse `settings` namespace)
Lowest-friction path — add a new object to the existing `settings` namespace rather than a new namespace:
1. Add e.g. `"features": { "title": "...", "groupAds": "...", "toggles": { "autoNegate": { "label": "...", "hint": "..." } } }` to `src/renderer/i18n/resources/en/settings.json`.
2. Mirror it in `src/renderer/i18n/resources/ru/settings.json` (currently `{}` — you'd seed it; remember it won't render until `ru` is wired).
3. In the component: `const { t } = useTranslation('settings');` → `t('features.toggles.autoNegate.label')`.
4. No `index.ts`/`types.d.ts` edits needed (namespace already registered). Types update automatically from the `en` JSON shape.

### How to add a brand-new namespace (if you want `featureFlags` separate)
1. Create `src/renderer/i18n/resources/en/featureFlags.json` **and** `…/ru/featureFlags.json`.
2. `src/renderer/i18n/index.ts`: add `import enFeatureFlags from './resources/en/featureFlags.json';`, append `'featureFlags'` to the `ns: [...]` array (line 33), and add `featureFlags: enFeatureFlags,` under `resources.en` (lines 35-55).
3. `src/renderer/i18n/types.d.ts`: add `import type enFeatureFlags …` and `featureFlags: typeof enFeatureFlags;` in the `resources` interface (so keys type-check).
4. Use `useTranslation('featureFlags')`.

> Note: `defaultNS: 'common'`. If you call `useTranslation()` with no arg you get `common`; always pass the namespace explicitly as every existing settings file does.

---

## (2) Reusable UI primitives

All exported from the barrel `src/renderer/components/ui/index.ts` — import as `import { Card, Tabs, Badge, … } from '../ui';` (or `'../components/ui'` from a page).

### Switch / Toggle — NO primitive exists; two inline canonical patterns
There is no `Switch.tsx`/`Toggle.tsx`. Reuse one of these two existing iOS-style switches (both `role="switch"` + `aria-checked`, knob slides via `translate-x`). **Strong recommendation: extract one into `components/ui/Switch.tsx` first**, since a "Settings section full of feature toggles" will instantiate it many times.

- **`SettingToggle`** — `src/renderer/components/UpdateChecker.tsx:20-49`. The cleanest, most design-token-aligned switch. Controlled `checked / onChange(next) / disabled / testId`. Uses **design tokens** (`duration-fast ease-smooth`, `focus-visible:ring-emerald-500/40`), ON = `bg-emerald-500` (matches `accent`/`module.ads`), OFF = `bg-zinc-300`, knob `translate-x-[18px]`/`[3px]`. **Copy this one** as the basis for the extracted `ui/Switch`.
  ```
  role="switch" aria-checked={checked}
  h-5 w-9 rounded-full, bg-emerald-500 (on) / bg-zinc-300 (off)
  knob: h-3.5 w-3.5 rounded-full bg-white, translate-x-[18px] | [3px]
  ```
- **`ScheduleProfilesPanel`** switch — `src/renderer/components/settings/searchTerm/ScheduleProfilesPanel.tsx:58-85`. Same shape but ON = `bg-zinc-900` (neutral, not emerald) and shows a `Loader2` spinner inside the knob while the async toggle is in flight (`toggling === id`). Good reference if your toggles persist over IPC/HTTP and need a pending state. Its test selects via `[role="switch"]` (`__tests__/searchTerm.test.tsx:53`) — keep that role if you want existing test patterns to work.

- **Checkbox alternative (simpler, also "in-app canonical"):** native `<input type="checkbox" className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400">` wrapped in a `<label className="flex items-start gap-3 cursor-pointer">`. See `PrivacyTab.tsx:60-84` (single consent toggle with label+hint+saving spinner — basically a one-row feature-toggle template) and `SyncOptionsGrid.tsx:30-57` (a 2-col grid of boolean options — closest existing analog to "a grid of feature toggles"). Use checkboxes for multi-select option lists, switches for on/off feature flags.

### Card / Section container — `Card`
`src/renderer/components/ui/Card.tsx` (exported `index.ts:1`). This is your section grouping primitive.
- Props: `title?: ReactNode`, `rightSlot?: ReactNode`, `className?`, `bodyClassName?`, `children`, `data-testid?`.
- Renders `bg-white border border-zinc-200 rounded-lg shadow-soft`; when `title`/`rightSlot` set, a header strip `px-5 py-3 border-b` with `text-sm font-semibold`.
- **Body has no default padding** — you add it. Established convention for settings bodies: `<div className="px-5 py-5 space-y-4">…</div>` (see `AITab.tsx:227`, `PrivacyTab.tsx:54`).
- Page/tab wrapper convention: outer `<div className="space-y-6">` stacking multiple `Card`s (every settings tab does this: `AITab.tsx:224`, `StreamTab.tsx:146`, `PrivacyTab.tsx:52`).

### SectionHeader — no standalone primitive; two idioms
There is no `SectionHeader.tsx`. Section titling is done either:
- via **`Card title=…`** (the dominant pattern), or
- a bare heading inside a tab: `<h2 className="text-base font-semibold text-zinc-900">{t('…title')}</h2>` (`StreamTab.tsx:148`).
- Page-level title bar = **`PageHeader`** (`src/renderer/components/ui/PageHeader.tsx`, props `title: string`, `subtitle?`, `rightSlot?`) — the only place besides the wordmark allowed to use Playfair (`font-display`). `SettingsPage.tsx:77` already renders it; a new tab should NOT add another `PageHeader`.
- `DisplayHeading` (`ui/DisplayHeading.tsx`, exported) exists for editorial headings if needed, but per DESIGN.md keep Playfair rationed.

### Tabs — `Tabs` (generic) and the bespoke `SettingsTabs`
- **`SettingsTabs`** — `src/renderer/components/settings/SettingsTabs.tsx`. The actual settings tab bar. To add a feature-toggles tab: add an id to the `SettingsTabId` union (line 17-28), a `{ id, icon }` entry to `TABS` (line 35-47, icons from `lucide-react`), then in `SettingsPage.tsx` add it to `VALID_TABS` (line 21-33) and a render branch `{activeTab === 'features' && <FeaturesTab />}` (line 85-95). Tab label comes from `t('tabs.features')`. Tab state persists to hash (`#settings/<tab>`) and session storage automatically.
- **`Tabs<T>`** — `src/renderer/components/ui/Tabs.tsx` (exported `index.ts:31`). The canonical generic underline tab bar. Props: `value`, `onChange`, `items: TabItem<T>[]` (`{ value, label, count?, icon?, disabled?, testId? }`), `className?`, `aria-label?`. Use this for **sub-tabs inside** your feature section (e.g. grouping toggles by module) rather than re-implementing.

### Badge — `Badge`
`src/renderer/components/ui/Badge.tsx` (exported `index.ts:35`). Props: `variant` (`success|warning|error|info|neutral|active`), `dot?`, `size` (`xs|sm|md`), `shape` (`rect|pill`), plus all `HTMLSpanElement` attrs. Use for status next to a toggle (e.g. `active` = emerald "Live", `neutral` = "Off", `warning` = "Beta"). `dot` adds a colored leading dot.

### SegmentedControl — `SegmentedControl<T>`
`src/renderer/components/ui/SegmentedControl.tsx` (exported `index.ts:50`). For **multi-state** settings (3-way mode pickers) where a binary switch is wrong. Props: `value`, `onChange`, `options: {value,label,icon?,testId?,disabled?}[]`, `size?: 'sm'|'md'`, `aria-label?`. Active state is neutral `bg-zinc-100` (cosmetic only — use `Badge` if it must convey status). Real usage: `GlobalAttributionToggle.tsx`.

### Form field wrappers
- **`Field`** — `src/renderer/components/ui/Field.tsx` (exported `index.ts:21`). Label + control + hint/error triplet. Props: `label`, `htmlFor?`, `hint?`, `error?` (overrides hint), `required?`, `children`. Wrap inputs that sit alongside toggles.
- **`Input`** — `src/renderer/components/ui/Input.tsx` (exported `index.ts`? — yes via barrel; class-token aligned `h-9 border-border rounded-btn focus:ring-accent-soft`). **`Textarea`**, **`Select`** also exported. Use these for any text/number/dropdown settings instead of raw `<input>`.

### Tooltip — none
There is **no `Tooltip` primitive**. The app uses the native `title=` attribute (e.g. `NavItem` `title`, icon buttons in `books/index.tsx:482`). For toggle help text, use `Field` `hint` / a `<span className="text-[11px] text-zinc-500">` sub-label (as `PrivacyTab.tsx:78` does), not a hover tooltip.

### SearchInput — none
No `SearchInput` primitive. Search boxes are plain `Input` with a search icon, or inline `<input placeholder="Search…">`. If your feature list is long enough to need filtering, compose `Input` + a `lucide-react` `Search` icon yourself. `ActiveFiltersBar` (`ui/ActiveFiltersBar.tsx`, exported) exists if you add removable filter chips.

### Other exported primitives (for completeness, `ui/index.ts`)
`Kpi`, `KpiDelta`, `MetricNumber`, `Num` (numerals — JetBrains Mono), `EditableNumber`, `RangePicker`, `WeeksSegment`, `Pagination`, `Modal`/`ModalHeader`/`ModalBody`/`ModalFooter` (for a confirm/edit dialog — props at `index.ts:42-49`; note `books/index.tsx` rolls its own `ConfirmDialog` instead), `Skeleton`/`TableRowSkeleton`/`TableSkeletonBody`/`KpiSkeleton` (loading), `ErrorBanner`/`LoadingRow`/`EmptyState` (from `States.tsx`), `LockedFeatureCard` (gate a Pro/Business feature toggle — `LockedTier`), `ExportMenu`, `DataTable` (in folder, not barrel), `ChartTooltip`, `GradientArea` (charts).

---

## (3) Design tokens & module colors

Source of truth: `DESIGN.md` (repo root) + `tailwind.config.js`. **Always use the Tailwind token class, never raw hex.** Read DESIGN.md's "Anti-slop checklist" (lines 102-116) before shipping — it explicitly bans 3-col icon-in-colored-circle feature grids, pill buttons, drop-shadows on in-grid cards, and module colors used for body text/borders/chrome.

### Module palette — use to visually group feature modules
Defined in `tailwind.config.js:109-115` as `module.*` (classes: `text-module-ads`, `bg-module-ai`, `border-module-marketplace`, etc.). Per DESIGN.md "Module color usage" (lines 92-100), module colors tint **charts, accent elements, lock badges, and "AI-suggested" pills — NOT body text, borders, or chrome.** So for grouping feature toggles by module, apply the color to a small leading icon, a dot, or a left-accent — keep the card border/text neutral zinc.

| Module | Token class | Hex | Use for the toggle group |
|---|---|---|---|
| Ads / PPC | `module-ads` | `#10b981` (emerald) | Same as global `accent`; ads/automation/PPC feature toggles. ON-switch emerald already matches. |
| Analytics | `module-analytics` | `#3b82f6` (blue) | Metrics/reports/comparison feature toggles. |
| Publishing | `module-publishing` | `#8b5cf6` (purple) | Books/series/royalty/P&L feature toggles. |
| AI | `module-ai` | `#f59e0b` (amber) | AI features (advisor, briefing, brand voice, cover QA). Existing precedent: `AITab.tsx:229` uses `text-amber-500` icon. AI lock badges use amber. |
| Marketplace | `module-marketplace` | `#f43f5e` (rose) | Keyword research / reverse-ASIN / niche feature toggles. |

> Note: `NavItem.tsx:93-96` and DESIGN.md tier rules use **amber=Pro, purple=Business** for lock/tier badges. If a feature toggle is gated, reuse `LockedFeatureCard` / the amber-Pro, purple-Business badge convention rather than inventing colors.

### Core semantic tokens (from `tailwind.config.js` + DESIGN.md "Color tokens" table)
- **Accent (emerald, single high-emphasis CTA per screen):** `accent` `#10b981`, `accent-hover` `#059669`, `accent-soft` `#10b98126` (focus halo / active-nav fill), `accent-fg` `#fff`.
- **Surfaces:** `surface` `#fff` (card/modal bg), `surface-2` `#f4f4f5` (row hover / input bg), `surface-3` `#e4e4e7`.
- **Text:** `fg` `#09090b`, `fg-muted` `#71717a` (helper/secondary), `fg-subtle` `#a1a1aa` (eyebrow/placeholder/table-header). (Settings components in practice often use raw `text-zinc-900/700/500/400` — both are fine; tokens preferred for new code.)
- **Borders:** `border` `#e4e4e7`, `border-strong` `#d4d4d8`.
- **Status:** `success`/`success-soft`/`success-fg`, `warning`/…, `error`/…, `info`/… — pair with `Badge` variants.

### Shape / elevation / motion tokens
- **Radius:** `rounded-btn` (6px) buttons+inputs, `rounded-card` (8px) cards, `rounded-modal` (12px) modals/popovers, `rounded-pill` (status pills ONLY). Never `rounded-full`/`rounded-pill` on buttons or switch containers' parent layout.
- **Shadow:** `shadow-soft` (Card default / hover lift), `shadow-card`, `shadow-popover`, `shadow-modal`. DESIGN.md: prefer flat + 1px `border` over shadows on in-grid cards.
- **Motion:** single easing `ease-smooth` (`cubic-bezier(0.16,1,0.3,1)`); durations `duration-fast` (100ms hover/focus), `duration-base` (200ms panels), `duration-modal` (300ms). The `SettingToggle` switch already uses `transition-colors duration-fast ease-smooth` — match it. Banned: framer-motion entrances, glows, mesh gradients (DESIGN.md lines 78-81, 102-116).

### Typography (DESIGN.md "Typography", lines 52-67)
- UI/body: Inter (default). Toggle labels = `text-xs`/`text-sm font-medium text-zinc-900`, hints = `text-[11px] text-zinc-500` (per `PrivacyTab`).
- `font-display` (Playfair 700): **only** the sidebar wordmark and `PageHeader` H1 — do not use in your tab.
- `font-mono` (JetBrains Mono) + `tabular-nums`: numeric values only (if a toggle shows a count/threshold).

---

## Concrete build recommendation (synthesizing the above)
1. **Extract a `Switch`** to `src/renderer/components/ui/Switch.tsx` by lifting `UpdateChecker.tsx:20-49` (`checked/onChange/disabled/testId`, emerald-on/zinc-off, design-token transitions), export it from `ui/index.ts`. This is the missing primitive the toggle-heavy section needs.
2. **Add a `features` tab** to `SettingsTabs.tsx` (union + `TABS` entry, pick a `lucide-react` icon) and a render branch + `VALID_TABS` entry in `SettingsPage.tsx`.
3. **Build the tab** as `<div className="space-y-6">` of `Card`s, one Card per module group (`Card title={t('features.ads.title')}`), body `<div className="px-5 py-5 space-y-4">`. Inside each, render toggle rows: `<label className="flex items-start gap-3">` with the extracted `Switch` (or native checkbox per `PrivacyTab`), a `text-xs font-medium text-zinc-900` label, and a `text-[11px] text-zinc-500` hint. Tint each group's leading icon with the module color (`text-module-ads`, `text-module-ai`, …).
4. **Strings:** add a `features` object to `en/settings.json` (and mirror in `ru/settings.json`); read via `useTranslation('settings')` → `t('features.…')`. No `index.ts`/`types.d.ts` change needed if you stay in the `settings` namespace.
5. **Flag to user:** the `ru` locale is dead code today (`index.ts` imports only `en`, `lng:'en'` hardcoded, no language switcher, `ru/settings.json` is `{}`). Authoring ru strings is harmless but they will not render until `ru` is wired into `index.ts` + a switcher added.