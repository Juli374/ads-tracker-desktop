# 06 — Modals, Forms & Interactive Elements Audit
_Date: 2026-05-16_
_Scope: `src/renderer/**` (read-only)_

## Executive summary

The app has decent **bones** — there is a `Button`/`Input`/`Badge` primitive set in `src/renderer/components/ui/` and a shared `ModalShell` for the SearchTerms feature — but adoption is **catastrophically low**. Across ~300 interactive `<button>` tags in the renderer, only **14** use the `<Button>` primitive (≈4.5% adoption). For inputs the gap is even worse: **32 `<select>` + ~190 `<input>` literal tags vs 1 `<Input>` and 0 `<Select>` primitive usages**. Sixteen separate `*Modal.tsx` files re-implement the same overlay/container/header/footer pattern from scratch with copy-pasted Tailwind strings, leading to four overlay opacities (`zinc-900/20`, `/30`, `/40`, `black/40`), three corner radii on modal cards (`rounded-xl` everywhere except `UpgradeModal` which mixes `rounded-xl` and `rounded-lg` inside, and a few drop-zones using `rounded-lg`), and **five duplicate `const inputClass`** declarations that should be one shared primitive.

The most concrete and high-leverage fix for the "design pass" is: **(1) extend `ModalShell` to every modal**, **(2) sweep the inline `<button>` herd into the `Button` primitive**, **(3) introduce a `<Select>` primitive**, and **(4) flip the primary action token from `bg-zinc-900` (black) to the target emerald `#10b981`** from `book-platform/design-dna.json` so the entire app picks up the new accent in one config flip. The Button primitive already references a `bg-accent` token — but the Tailwind config does **not** define an `accent` color (only `muted` and a `DEFAULT` accent that's grey), so `<Button variant="primary">` today renders as broken grey-on-grey. That's a P0 hidden bug.

---

## Modal inventory

20 modal files identified. Pattern adherence:

| Modal | File | Overlay | Container | Footer pattern | Inconsistencies |
|---|---|---|---|---|---|
| `AddCampaignModal` | `components/AddCampaignModal.tsx:208` | `bg-zinc-900/20 backdrop-blur-sm` | `max-w-2xl rounded-xl shadow-card` | Cancel + zinc-900 submit | inline header/footer, 4 inline segmented controls, local `inputClass`/`selectClass`/`textareaClass`/`Section`/`Field` |
| `EditCampaignModal` | `components/EditCampaignModal.tsx:104` | same | `max-w-lg rounded-xl shadow-card` | same | duplicate `inputClass`; status toggle uses bespoke emerald/amber pill |
| `AddAdGroupModal` | `components/AddAdGroupModal.tsx:63` | same | `max-w-md` | same | inline inputs/buttons; no `Field` helper |
| `AddTargetModal` | `components/AddTargetModal.tsx:117` | same | `max-w-lg` | same | 2 inline segmented controls; duplicate inputClass |
| `AddEventModal` | `components/AddEventModal.tsx:74` | **`bg-zinc-900/30` backdrop-blur** | `max-w-md` | same | overlay 50% darker than peers; no `data-modal-open` |
| `EditTaskModal` | `components/operations/EditTaskModal.tsx:97` | **`bg-zinc-900/30`** | `max-w-md` | `justify-between` (Delete on left) | header uses `h-11 px-4` instead of `px-5 pt-5 pb-3`; footer `px-4` not `px-5`; X icon `size={14}` not `16` |
| `BsrModal` | `components/books/BsrModal.tsx:52` | `zinc-900/20 backdrop-blur-sm` | `max-w-2xl` | no footer | header pattern matches; only display-only |
| `EditBookModal` | `components/books/EditBookModal.tsx:71` | same | `max-w-lg` | same | local `inputClass`+`Field` helpers re-defined |
| `DeleteBookModal` | `components/books/DeleteBookModal.tsx:40` | same | `max-w-sm` | `bg-amber-600 text-white` confirm (destructive) | uses warning-amber for archive vs others using red for destruction |
| `AddChangeModal` | `components/books/AddChangeModal.tsx:47` | same | `max-w-sm` | same | another `inputClass` clone |
| `AddAsinModal` | `components/books/AddAsinModal.tsx` | same | `max-w-sm` | same | (likely same shape) |
| `CoverQAModal` | `components/books/CoverQAModal.tsx:117` | same | `max-w-2xl max-h-[90vh] flex flex-col` | "Close" + "Use anyway" | only modal with flex-col vertical layout |
| `UploadCoverModal` | `components/books/UploadCoverModal.tsx:95` | same | `max-w-md flex flex-col max-h-[90vh]` | same | duplicates QA panel inline |
| `ImportRoyaltyModal` | `components/settings/ImportRoyaltyModal.tsx:115` | same | `max-w-2xl` | same | matches AddCampaignModal pattern |
| `UpgradeModal` | `components/UpgradeModal.tsx:99` | **`bg-black/40` (no blur)** + `z-[100]` | `w-[860px] max-w-[92vw]` (literal px width!) + `rounded-xl shadow-2xl` | none — CTAs in cards | violet accent, X uses `h-7 w-7`, no portal but uses click-outside via `e.stopPropagation`; only modal with stacking layer 100 |
| `CommandPalette` | `components/CommandPalette.tsx:319` | `zinc-900/20 backdrop-blur-sm` | `max-w-lg rounded-xl shadow-card` | none | search-input header, custom violet "Ask AI" CTA; uses `pt-24` not centered |
| `MoveModal`/`PauseModal`/`SnoozeModal`/`TrendModal`/`RankHistoryModal` | `components/searchTerms/*Modal.tsx` | **via `ModalShell`** | via shell, sizes sm/md/lg | shell-provided footer slot | the **only** modals that share boilerplate |
| `LockedFeature` confirmation | `components/LockedFeature.tsx` | via `UpgradeModal` | n/a | n/a | nested overlay |
| Negatives "Add words" modal | `components/NegativeListsTab.tsx:388` | `zinc-900/20 backdrop-blur-sm` | `max-w-lg` | same | a 5th inline copy of the shell pattern |
| `AIAdvisor` slide-out | `components/campaigns/AIAdvisorPanel.tsx:412` | **`bg-black/20`** | side-drawer (not modal) | own | conflates drawer with modal token z-index |
| Reverse-ASIN/SaveSet sub-modals | `components/keywords/ReverseAsinPanel.tsx:462,644` | **`bg-zinc-900/40`** | n/a | n/a | overlay 100% darker than peers, two of them on the same panel |

**Pattern findings:**

- **One shared shell exists but is private to one feature.** `searchTerms/ModalShell.tsx:32` is the gold standard (Esc-handling, `data-modal-open`, overlay click-to-close, aria, size variants) but only 5 modals use it.
- **Overlay opacity drift:** `/20` (12 modals), `/30` (2), `/40` (3), `black/40` (1). Backdrop-blur present on most but missing on `UpgradeModal` and `AIAdvisorPanel`.
- **Z-index drift:** `z-50` (default), `z-[60]` (AIAdvisor confirm), `z-[100]` (UpgradeModal), `z-40` (AIAdvisor backdrop). No documented stacking order.
- **Header pattern:** `px-5 pt-5 pb-3 border-b border-zinc-100 + h-2 size=16 close X` is the dominant convention (≈15 modals). EditTaskModal uses `h-11 px-4` + `X size=14`; UpgradeModal uses `px-6 py-4` + bespoke `h-7 w-7` close button.
- **Footer:** `px-5 py-3 border-t border-zinc-100 flex justify-end gap-2` with `h-8 px-3` cancel + `h-8 px-4 bg-zinc-900` submit — uniform across 15 modals, but each modal redeclares the classes inline.
- **Open/close mechanism:** Five different patterns — `useEscapeClose` hook, manual `useEffect` with window keydown, `document.body.dataset.modalOpen`, `open` prop with early-return, and `if (!open) return null`.

## Button audit

- **Primitive:** `components/ui/Button.tsx` — variants `primary` / `secondary` / `ghost` / `destructive`; sizes `sm` / `md`; `leftIcon` slot; uses semantic tokens `bg-accent`, `text-accent-fg`, `bg-error` etc.
- **Critical bug:** the primitive references `bg-accent`, `bg-accent-hover`, `bg-error`, `text-fg`, `border-border-strong` — **none of these are defined in `tailwind.config.js`** (which only has `border`, `muted`, and a `DEFAULT` accent of grey `rgb(244 244 245)`). `<Button variant="primary">` currently renders as **grey-on-grey-foreground** in production. The variants will be invisible until the Tailwind theme is extended. This is also why nobody adopts the primitive — it doesn't work.
- **Inline button count:** **~299 `<button>` literals** (excluding tests). Only **14 `<Button>` usages**. Adoption ≈ 4.5%.
- **Primary inline pattern:** `h-8 px-4 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800` appears **75 times** as raw Tailwind. This is the de-facto primary button.
- **Top inline-button sample sites:**
  1. `components/AddCampaignModal.tsx:500,513` — cancel + submit
  2. `components/EditCampaignModal.tsx:250,263` — same pair
  3. `components/AddAdGroupModal.tsx:115,123`
  4. `components/AddTargetModal.tsx:241,249`
  5. `components/NegativeListsTab.tsx:461,468`
  6. `components/books/EditBookModal.tsx:174,182`
  7. `components/books/DeleteBookModal.tsx:67,75` (amber-600 destructive)
  8. `components/books/CoverQAModal.tsx:255,265`
  9. `components/operations/EditTaskModal.tsx:185,196,204` (3-button footer)
  10. `components/UpgradeModal.tsx:213` (per-plan CTA, violet variant)
- **Visual inconsistencies:**
  - Heights: `h-7` (segmented controls, NegativeListsTab top bar), `h-8` (modal footer), `h-9` (CalendarDropdown apply button: line 214), `h-11` (CommandPalette header) — at least 4 button heights in use simultaneously.
  - Font size: `text-xs` (most), `text-sm` (Button primitive), `text-[11px]` (segmented), `text-[10px]` (UserMenu theme switcher).
  - Border radius: `rounded-md` (most), `rounded-sm` (Button primitive), `rounded` (segmented inner buttons).
  - Focus ring: primitive uses `focus-visible:ring-2 focus-visible:ring-accent-soft`; inline buttons mostly have **no explicit focus ring** — relying on browser default outline which doesn't match.
  - Hover transitions: `transition-colors` (most), `transition-colors duration-100 ease-out` (primitive), some omit altogether.
- **Primary action color change required:** Sweep all 75 instances of `bg-zinc-900 text-white hover:bg-zinc-800` to use either (a) the `Button` primitive (after fixing tokens) or (b) `bg-emerald-500 text-white hover:bg-emerald-600` to match `design-dna.json` `palette.accent = #10b981`. Currently `bg-zinc-900` ≈ `#18181b` which is `palette.primary` in the DNA — so the app is using "primary brand black" where the DNA reserves emerald for paid actions and brand black for headers/text only. **Decision needed:** keep black-as-primary-action (Stripe/Linear convention) or shift to emerald.

## Input / form audit

- **Primitive:** `components/ui/Input.tsx` — `border-border rounded-sm px-3 py-1.5 text-sm` + accent focus ring. Uses tokens that don't exist in Tailwind config (same broken-tokens bug as Button).
- **Inline `<input>` count:** ≈190 inline usages in renderer; **1 `<Input>` usage**.
- **Duplicate `inputClass` constants:** 5 separate `const inputClass = 'w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400'` declarations:
  - `AddCampaignModal.tsx:532`
  - `EditCampaignModal.tsx:282`
  - `EditBookModal.tsx:196`
  - `AddChangeModal.tsx:129`
  - `(implicit)` re-inlined in `AddAdGroupModal`, `AddTargetModal`, `NegativeListsTab`, `EditTaskModal`, `UploadCoverModal`.
  Net: the **inline `inputClass` string** is the actual design token, not `<Input>`. The primitive uses `h-auto py-1.5 rounded-sm` — the inline version uses `h-9 rounded-md` — these will not be visually equivalent if you swap them.
- **Select / dropdown patterns:** 32 native `<select>` tags. No `<Select>` primitive exists. One inline `const selectClass` (AddCampaignModal:535); the rest re-inline. All use native browser dropdown — meaning the popup chrome is OS-native and **cannot be themed**. No headlessui / radix / custom listbox in the app.
- **Form validation visual pattern:** No standard. Each modal calls `toast.error(...)` on submit. Zero inline field-level error styling. There is no error border (`border-red-500`), no helper text, no aria-invalid. EditCampaignModal:60-73 validates by toast, leaves the bad field untouched.
- **Label pattern:** Mostly above-the-field as `<label className="block text-xs font-medium text-zinc-700">`. CoverQAModal:144 uses inline `<span>` next to a segmented control. Three separate local `Field` helper components (`AddCampaignModal:555`, `EditCampaignModal` via `PlacementInput:285`, `EditBookModal:199`, `AddChangeModal` inline). All do roughly the same thing — should be one primitive.
- **Textarea:** 7+ inline copies of `w-full px-3 py-2 text-sm rounded-md border border-zinc-200 bg-white ... resize-none`. No `<Textarea>` primitive. `AddCampaignModal:539` defines a local `textareaClass`.

## Badge / status pill audit

- **Primitive:** `components/ui/Badge.tsx` — variants `success`/`warning`/`error`/`info`/`neutral`, optional `dot`, dark-mode-aware via tokens.
- **Adoption:** 4 `<Badge>` usages. Versus inline pills:
  - `settings/AITab.tsx:641` — `inline-flex items-center px-2 h-5 rounded-full text-[10px] font-medium uppercase tracking-wider border ${cls}`
  - `settings/ApplicationTab.tsx:321` — identical pattern, separate copy
  - `settings/StreamTab.tsx:76` — same again
  - `settings/fullSync/SyncQueue.tsx:129` — same with `h-4` and `px-1.5`
  - `NegativeListsTab.tsx:210` — `px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100`
  - `CountrySelector.tsx:38` — `h-7 px-2.5 rounded-full text-[11px]`
  Three rounded-full uppercase styles, two rounded-rectangle styles, one `rounded-sm` (the primitive) — five distinct status-pill aesthetics.
- **Status colors:** EditCampaignModal:152 paints active=`bg-emerald-50 text-emerald-700` / paused=`bg-amber-50 text-amber-700`, but the Badge primitive's `success` uses `bg-success-soft` (token that doesn't exist) — and the Toast uses `border-emerald-200` for success ring. Same semantic (success) → three color stacks.

## Segmented controls

Pattern: `inline-flex bg-white border border-zinc-200 rounded-md p-0.5`. Confirmed 6 inline instances + 1 primitive (`WeeksSegment`):

- `ui/WeeksSegment.tsx:13` — primitive, `h-7 text-xs`, active = `bg-zinc-100 text-zinc-900`
- `ui/RangePicker.tsx:67` — same pattern inline, active variant uses **emerald** (`bg-emerald-50 text-emerald-700 border border-emerald-200`)
- `EditCampaignModal.tsx:143` — same shell, active uses **emerald or amber based on status**
- `AddCampaignModal.tsx:305,444,477` — 3 inline segmented controls in one modal alone; active = `bg-zinc-900 text-white` (different from peers!)
- `AddTargetModal.tsx:161,201`
- `NegativeListsTab.tsx:263`
- `CoverQAModal.tsx:145` — same shell, `h-6 text-[11px]`, active = `bg-zinc-100` (back to neutral)
- `UserMenu.tsx:91` — theme switcher uses `bg-zinc-100` outer instead of `bg-white border` — different visual entirely
- `dashboard/HeroChart.tsx:200` — rounded-full pill series, not segmented

**No `<Segmented>` primitive** — at least 4 active-state styles (`bg-zinc-900`, `bg-zinc-100`, `bg-emerald-50`, `bg-amber-50`) for the same control type.

## Toast / tooltip / empty state

- **Toast** (`contexts/ToastContext.tsx`): bottom-right viewport, `min-w-[260px]`, white card with colored border ring (`emerald-200`/`red-200`/`zinc-200`). Single styling source — clean. Animations: none on enter/exit (could look abrupt). Default durations: 3s info/success, 6s error. Dismiss = X button + auto-timer.
- **Tooltips:** No tooltip primitive. Falls back to native browser `title=` attribute (5+ places: `SyncStatusPill.tsx:158`, `RangePicker.tsx:103`, `NavItem.tsx:73,89`, `ProfilesTab.tsx:64`, `WeeksSegment.tsx:33`). Native tooltips are unstyleable, slow to appear, OS-themed — major UX gap.
- **Empty state:** `ui/States.tsx:19` provides `EmptyState` (used 9 places). Pattern: `px-5 py-12 text-center` + `text-sm text-zinc-500`. Inline empty states found in `ListingVariantHistory.tsx:87` and `BriefingPage.tsx:221` using different paragraph styling — should consolidate. The `EmptyState` API takes only `title` + `hint` strings — no icon, no CTA slot, which is why pages re-roll their own when they want a richer empty state.

## Recommendations (ordered by impact)

1. **Fix the broken Button/Input tokens (P0, half day).** Extend `tailwind.config.js` with `accent`, `accent-hover`, `accent-fg`, `accent-soft`, `surface`, `surface-2`, `border-strong`, `fg`, `fg-muted`, `fg-subtle`, `error`, `success` (and their `*-soft` variants). Map `accent → #10b981` from `book-platform/design-dna.json`. Until this lands, `<Button variant="primary">` is invisible and nobody can adopt it.
2. **Promote `ModalShell` from `searchTerms/` to `ui/Modal.tsx` and migrate all 15 inline modals (P1, 1.5 days).** This collapses 15 copy-pasted overlay/header/footer blocks into one, fixes overlay-opacity drift (`/20` vs `/30` vs `/40`), z-index drift (50 vs 100), and gives keyboard-accessibility for free. Decide the canonical overlay: `bg-zinc-900/20 backdrop-blur-sm` is the majority — go with that.
3. **Create `<Select>`, `<Textarea>`, `<Field>` primitives in `ui/` (P1, half day).** Then run a codemod to replace the 5 duplicate `const inputClass` constants and migrate `<input className="w-full h-9 px-3 ...">` to `<Input>`. Same for `<select>` → `<Select>`. Eliminates ~190 inline class strings.
4. **Decide primary-action color (P1, design decision).** Current state: 75 buttons use `bg-zinc-900 text-white` (brand-black). DNA target: emerald `#10b981` for accent, black for headers/text. Recommendation: keep black-as-primary in modals/forms (Stripe/Linear feel), use **emerald only for high-emphasis CTAs** (Upgrade, Run sync, Apply changes). Document the rule in DESIGN.md. **Do not** indiscriminately flip all 75 to emerald — that loses the "business tool" aesthetic.
5. **Build `<Segmented>` primitive (P2, 2 hours).** Replace 7 inline copies. Pick one active-state style (recommend neutral `bg-zinc-100` — matches WeeksSegment which is already used in headers) and stop letting status be colored via this widget; that's a Badge job.
6. **Build `<StatusBadge>` (or use `<Badge>`) consistently for status pills (P2, 2 hours).** Five settings tabs reimplement uppercase-rounded-full pills. Make `<Badge>` accept `size="xs"` for the `h-4`/`h-5` cases and `shape="pill"` for `rounded-full`.
7. **Replace native `title=` tooltips with a `<Tooltip>` primitive (P2, half day).** Radix Tooltip or a thin custom built on `data-tooltip` attribute. Affects ~8 places today, but is needed for table headers and icon-buttons where text clarity matters.
8. **Standardize destructive variant (P3, 1 hour).** `DeleteBookModal` uses `bg-amber-600` (warning), `EditTaskModal:190` uses `text-red-600 hover:bg-red-50` (ghost-destructive). The Button primitive's `destructive` is `bg-error text-white`. Pick one: amber for archive (reversible), red for delete (irreversible), and use Button.
9. **Add form validation patterns (P3, 1 day).** Currently 100% of validation surfaces via toast. Add an `error?: string` prop to `<Input>` that renders red border + helper text, set `aria-invalid`. EditCampaignModal/AddCampaignModal are the worst offenders.
10. **Empty state API expansion (P4, 2 hours).** Add `icon?: React.ReactNode` and `action?: React.ReactNode` slots to `EmptyState` so pages like `ListingVariantHistory` and `BriefingPage` stop rolling their own.

**Total estimated effort for items 1–6: ~3 working days.** That's the bulk of the option-B cosmetic + design system pass. Items 7–10 are polish that can extend to day 4–5.
