# Design System — KDPBook Desktop

> **Read this before making any visual or UI decision.** This doc is a pointer to
> the brand DNA plus the desktop-specific adaptations on top of it. If you must
> deviate, document why in the Decisions Log.

## Source of truth

The KDPBook brand DNA lives at [`book-platform/design-dna.json`](../book-platform/design-dna.json). It is the canonical specification for color, typography, and motion across the marketing site and this desktop client. Read it first; everything below either mirrors it, narrows it for desktop use, or carves out an explicit exception.

The desktop client is **not** the marketing site. It is an information-dense Electron tool used 4+ hours per day for ad operations. The brand is the same; the application of the brand is leaner.

## Desktop-specific adaptations

- **No Lenis smooth scroll.** Native browser scroll only. Lenis is a marketing-site decoration; in a data table it fights muscle memory.
- **No framer-motion entrance animations.** No fade-up, no stagger. The marketing site uses these; the desktop opens directly to data.
- **No mesh gradients, decorative blobs, or animated backgrounds.** Surfaces are flat.
- **No magnetic buttons or cursor-tracking effects.** Buttons sit where they sit.
- **Playfair Display is rationed.** On the marketing site it is the headline voice. In the desktop it appears in exactly two places: the wordmark in the sidebar, and the `<h1>` of `PageHeader`. Everywhere else (table headers, modal titles, card headings, section labels) uses Inter. Serif in a data grid reads as decorative; we keep it for moments of brand, not chrome.
- **JetBrains Mono is for numerals, not prose.** Metrics, KPIs, table number columns, axis ticks, chart tooltips, currency. Body prose digits stay in Inter — switching mid-sentence is jarring.
- **Density default is "comfortable" but tables are "dense".** Cards/modals/settings get 16–24px padding; table rows get ~10px vertical, ~16px horizontal.

## Color tokens

All tokens below were added to `tailwind.config.js` in Phase Q.0.2. Hex values match `design-dna.json`. Use the Tailwind class, never raw hex in components.

| Tailwind token | Hex | Intended use |
|---|---|---|
| `accent` / `bg-accent` | `#10b981` | High-emphasis CTA only (see rule below). Focus ring, primary chart stroke, active emerald state. |
| `accent-hover` | `#059669` | Hover state for `bg-accent` buttons. |
| `accent-soft` | `#10b98126` | Focus ring halo, soft active-nav fill, emerald pill backgrounds. |
| `accent-fg` | `#ffffff` | Foreground on `bg-accent`. |
| `surface` | `#ffffff` | Card and modal background. |
| `surface-2` | `#f4f4f5` (zinc-100) | Row hover, secondary panel, input background in some contexts. |
| `surface-3` | `#e4e4e7` (zinc-200) | Tertiary surface, divider blocks. |
| `fg` | `#09090b` | Primary text. |
| `fg-muted` | `#71717a` (zinc-500) | Secondary text, helper copy, inactive nav. |
| `fg-subtle` | `#a1a1aa` (zinc-400) | Eyebrow labels, placeholder, table header text. |
| `border` | `#e4e4e7` (zinc-200) | Default 1px border on cards, inputs, table rows. |
| `border-strong` | `#d4d4d8` (zinc-300) | Emphasized border (focused or selected). |
| `success` / `success-soft` / `success-fg` | `#10b981` / `#ecfdf5` / `#065f46` | Low ACOS, sync OK, gain. |
| `warning` / `warning-soft` / `warning-fg` | `#f59e0b` / `#fffbeb` / `#92400e` | Review needed, ACOS borderline. |
| `error` / `error-soft` / `error-fg` | `#ef4444` / `#fef2f2` / `#991b1b` | High ACOS, sync failed, loss. |
| `info` / `info-soft` / `info-fg` | `#3b82f6` / `#eff6ff` / `#1e40af` | Sync in progress, neutral signal. |
| `module.ads` | `#10b981` | Ads charts, ads-domain accents. |
| `module.analytics` | `#3b82f6` | Analytics/metrics charts, info pills. |
| `module.publishing` | `#8b5cf6` | Publishing/series/book-platform accents. |
| `module.ai` | `#f59e0b` | AI lock badges, AI feature surfaces (Brand Voice, Bid Co-pilot, briefings). |
| `module.marketplace` | `#f43f5e` | Marketplace/keyword research surfaces. |

## Typography

- **Body / UI:** Inter, 400/500/600/700. Default for everything except the two display exceptions and numerals.
- **Display:** Playfair Display 700, only in: the sidebar wordmark, and the `<h1>` rendered by `PageHeader`. Letter-spacing `-0.02em`.
- **Mono / numerals:** JetBrains Mono on every numeric value: KPIs, table number columns, axis ticks, chart tooltips, currency formatting, percentages. Always pair with `font-variant-numeric: tabular-nums`. **Not** used for prose that happens to contain digits.

### Size scale (Tailwind `text-*`)

| Class | Size / line-height | Role |
|---|---|---|
| `text-xs` | 11/16 | Eyebrows, table headers, status badges |
| `text-sm` | 13/20 | Secondary body, dense list rows, button text |
| `text-base` | 14/22 | Default body |
| `text-lg` | 16/24 | H3, card titles |
| `text-xl` | 18/28 | H2 |
| `text-2xl` | 22/30 | Section heads |
| `text-3xl` | 28/36 | `PageHeader` H1 (Playfair) |

## Spacing, radius, shadow

- **Base unit:** 4px. Use Tailwind's default scale (`p-2 p-4 p-6 p-8 p-12 p-16`). Comfortable density at 16–24px, dense density (tables, lists, command palette) at 8–10px vertical.
- **Max content width:** Tables full-width. Forms and settings panels constrained to `max-w-3xl`.
- **Radius (Tailwind `rounded-*`):** `rounded-btn` (6px) buttons & inputs, `rounded-card` (8px) cards, `rounded-modal` (12px) modals & popovers, `rounded-pill` (9999px) status pills and ONLY status pills. Never `rounded-full` on buttons.
- **Shadow:** `shadow-soft` for hover lift, `shadow-card` for elevated cards (use sparingly — flat is the default), `shadow-popover` for dropdowns and command palette, `shadow-modal` for modal dialogs. Plain `shadow-none` for in-grid cards; rely on `border` instead.
- **Transitions:** `transition-* duration-fast` (100ms) for hover/focus, `duration-base` (200ms) for panels/dropdowns, `duration-modal` (300ms) for modal enter/exit. Always pair with `ease-smooth`.

## Motion

- **Single shared easing:** `cubic-bezier(0.16, 1, 0.3, 1)` exposed as Tailwind `ease-smooth`. Used for every state transition.
- **Durations:** 100ms (hover/focus), 200ms (dropdowns, panels), 300ms (modal in/out). Nothing slower.
- **Banned:** Lenis smooth scroll, framer-motion entrance animations, fade-up, stagger, magnetic buttons, mesh gradients, animated backgrounds, scroll-driven animations, parallax, spring bounce. A pulsing dot on a `syncing` badge is fine; a glowing border on a card is not.

## Primary action color rule

Two action colors, never mix them:

- **`bg-zinc-900`** (black, with `hover:bg-zinc-800`) for **in-modal submits and form save actions**: "Save", "Apply", "Confirm", "Create campaign", "Update settings". This is the workhorse color and lives inside modals and forms across the app.
- **`bg-accent`** (emerald `#10b981`, with `hover:bg-accent-hover`) reserved for **high-emphasis CTAs that promote a paid or workflow-starting action**: "Upgrade", "Sync now", "Run briefing", "Apply rules" (bulk co-pilot). One emerald button per screen, ideally.

Rationale: if every button is emerald, none of them are emphasized. Black says "this is the safe default action of this form"; emerald says "this is the moment".

## Module color usage

When a screen is about one domain, use that module color to tint its charts, accent elements, and lock badges. Do not use module colors for body text, borders, or chrome.

- **`module.ads`** (emerald) — ads/PPC charts, ACOS lines, spend bars. Matches the global `accent` because ads is the primary product.
- **`module.analytics`** (blue) — metric overlay charts, hourly dynamics, comparison series.
- **`module.publishing`** (purple) — Books pages, series overrides, royalty/P&L surfaces.
- **`module.ai`** (amber) — AI feature surfaces: Brand Voice, Bid Co-pilot, Author Briefing, Cover QA. All AI lock badges and "AI-suggested" pills use this color.
- **`module.marketplace`** (rose) — keyword research, ASIN reverse lookup, competitive intel.

## Anti-slop checklist

If your screen has any of these, it is wrong:

- Purple/violet gradient backgrounds (we use flat module colors)
- 3-column feature grid with icons in colored circles
- Pill-shaped buttons (`rounded-full` / `rounded-pill` on buttons)
- Drop shadows on in-grid cards (use 1px borders)
- Decorative blobs, glows, mesh gradients, or grain backgrounds
- Numbers in proportional (non-mono) fonts
- Border-radius bigger than `rounded-modal` (12px) on anything that isn't a modal
- Playfair Display anywhere other than the wordmark and `PageHeader` H1
- Two emerald buttons on the same screen
- Framer-motion entrance on page navigation

## Out of scope

Phase Q (design pass) does **not** touch:

- Mobile responsive layouts. Electron desktop only; no tablet or mobile breakpoints.
- Dark mode redesign. Dark mode tokens exist in `design-dna.json` but the desktop ships light-only until a dedicated dark pass.
- Information architecture / navigation rebuild. Sidebar structure, page count, and routing are frozen.
- Full motion library (framer-motion, Lenis, animated illustrations). The marketing site owns those; the desktop is intentionally still.
- Replacing tables with cards. Power users want rows.

## Decisions Log

| Date       | Decision                                                            | Rationale |
|------------|---------------------------------------------------------------------|-----------|
| 2026-05-10 | Quiet Pro aesthetic (Linear/Raycast energy)                         | Power-user tool, 4h/day, data density. |
| 2026-05-16 | Retire violet `#6E56CF` + Geist. Adopt KDPBook brand DNA.           | Align desktop with marketing site `book-platform/design-dna.json`. Single brand across surfaces. |
| 2026-05-16 | Playfair Display rationed to wordmark + `PageHeader` H1 only        | Serif in a data grid reads as decoration; preserve it for moments of brand, not chrome. |
| 2026-05-16 | Black (`bg-zinc-900`) for form submits; emerald reserved for CTAs   | Two clearly-tiered action colors. If every button is emerald, none are emphasized. |
| 2026-05-16 | No Lenis, no framer-motion entrances, no mesh gradients             | These are marketing-site decorations; desktop opens directly to data. |
