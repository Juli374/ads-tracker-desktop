# Design System — Ads Tracker Desktop

> **Read this before making any visual or UI decision.** All choices below are
> deliberate and coherent — changing one without checking the rest will break
> the system. If you must deviate, document why in the Decisions Log.

## Product Context

- **What this is:** Electron desktop client for managing Amazon Ads (PPC) campaigns for self-published Kindle authors. Power-user tool, viewed 4+ hours per day.
- **Who it's for:** The author of this repo. Personal-use first. Future: KDP-publishing community.
- **Space:** Pro tools for ad operations. Adjacent: Helium 10, Pacvue, Skai. Reference: Linear, Raycast, Vercel, Stripe Dashboard.
- **Project type:** Information-dense desktop application (sidebar nav, data tables, drill-downs, real-time sync).

## Aesthetic Direction

- **Direction:** Quiet pro
- **Decoration level:** Minimal — typography and structure carry all the weight
- **Mood:** "A tool for adults who use it four hours a day." Calm, precise, never shouts. The product disappears so the data can speak.
- **References:** Linear, Raycast, Vercel dashboard, Stripe Dashboard, Cursor, TablePlus

## Typography

- **Display + UI + Body:** **Geist Sans** (Vercel, free) — designed for precise UI; weights 400 / 500 / 600 / 700
- **Numbers + Code:** **Geist Mono** — used wherever numerals appear, even inline in prose
- **Loading:** Google Fonts CDN (`fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap`). For offline-friendly future: self-host via `@fontsource/geist-sans` and `@fontsource/geist-mono`.
- **Always enable:** `font-feature-settings: 'cv11', 'ss01'` for Geist Sans; `font-variant-numeric: tabular-nums` on every number-bearing element.
- **Never:** Inter, Roboto, Helvetica, Arial as primary. They're the AI-slop default — using them undercuts the whole system.

### Scale (px / line-height)

| Role     | Size | LH  | Tracking | Weight |
|----------|------|-----|----------|--------|
| Display  | 48   | 52  | -2%      | 600    |
| H1       | 28   | 36  | -2%      | 600    |
| H2       | 22   | 30  | -1%      | 600    |
| H3       | 18   | 28  |  0       | 600    |
| Body     | 14   | 22  |  0       | 400    |
| Small    | 13   | 20  |  0       | 400    |
| Eyebrow  | 11   | 16  | +8%      | 500    |
| Mono     | 13   | 20  | -1%      | 400    |

## Color

- **Approach:** Restrained — cool zinc neutrals + one violet accent. Semantic colors (green/red/amber/blue) are rare and meaningful.

### Neutrals (Tailwind zinc)

| Token        | Light       | Dark        |
|--------------|-------------|-------------|
| `--bg`       | `#FAFAFA`   | `#09090B`   |
| `--surface`  | `#FFFFFF`   | `#18181B`   |
| `--surface-2`| `#F4F4F5`   | `#27272A`   |
| `--border`   | `#E4E4E7`   | `#27272A`   |
| `--border-strong` | `#D4D4D8` | `#3F3F46` |
| `--fg`       | `#09090B`   | `#FAFAFA`   |
| `--fg-muted` | `#52525B`   | `#A1A1AA`   |
| `--fg-subtle`| `#A1A1AA`   | `#71717A`   |

### Accent

- **Primary:** `#6E56CF` (cool violet) — buttons, focus rings, active nav, brand mark, primary chart strokes
- **Hover:** `#5D46BF`
- **Soft:** `#EFEBFB` (light) / `#2A2342` (dark) — backgrounds for active nav items, soft pills

### Semantic (use sparingly)

- **Success:** `#16A34A` (low ACOS, sync OK, gain) · soft `#DCFCE7`
- **Warning:** `#D97706` (review needed, ACOS borderline) · soft `#FEF3C7`
- **Error:** `#DC2626` (high ACOS, sync failed, loss) · soft `#FEE2E2`
- **Info:** `#0EA5E9` (sync in progress, neutral signal) · soft `#E0F2FE`

### Dark mode

- Surfaces redesigned, not just inverted. Saturation reduced ~10% on accents.
- Semantic colors lose their soft fills in dark mode — use bordered pills with text-color matching the semantic.

## Spacing

- **Base unit:** 4 px
- **Density:** Two modes
  - **Comfortable:** cards, modals, settings forms — padding `var(--space-4)` (16px) or `var(--space-6)` (24px)
  - **Dense:** tables, lists, command palette — row padding `8px 16px`, item height ~36px
- **Scale:** `2(2) 1(4) 2(8) 3(12) 4(16) 6(24) 8(32) 12(48) 16(64)` — match Tailwind defaults

## Layout

- **Approach:** Grid-disciplined, three-column desktop
- **Structure:** `240px sidebar` + `flexible main` + (optional) `320px right pane` for drill-down detail
- **Sidebar:** persistent (not collapsible by default — 9+ destinations, frequent access)
- **Top bar:** app title left, command palette pill (`⌘K`) center-right, sync + user avatar right
- **Max content width:** Tables full-width; forms / settings constrained to `max-w-3xl` (768px)
- **Border radius:** `6px` buttons & inputs, `8px` cards, `12px` modals & popovers — **never** `rounded-full` on buttons (consumer feel)
- **Shadows:** **none** on cards in light mode. Use `1px var(--border)`. Modals get a soft scrim, not a card shadow.

## Motion

- **Approach:** Minimal-functional. State transitions only. Zero decorative animation.
- **Easing:** enter `cubic-bezier(.22,1,.36,1)` (ease-out), exit `cubic-bezier(.55,.06,.68,.19)` (ease-in)
- **Durations:** fast `100ms` (hover/focus), base `150ms` (panels, dropdowns), slow `220ms` (modals only)
- **Never:** spring bounce, scroll-driven animation, parallax, animated gradients, decorative loaders. A pulsing dot on a syncing badge is OK; a glowing border on a card is not.

## Components — non-negotiable rules

- **Buttons:** `padding: 7px 14px`, `font-weight: 500`, `font-size: 13px`. Variants: primary (violet bg), secondary (1px border), ghost (transparent), destructive (error red).
- **Inputs:** `padding: 7px 12px`, `border: 1px var(--border)`, focus `box-shadow: 0 0 0 3px var(--accent-soft)` + `border-color: var(--accent)`.
- **Tables:** thead `text-transform: uppercase`, `font-size: 11px`, `letter-spacing: 0.08em`, `color: var(--fg-subtle)`. tbody rows `padding: 10px 16px`, `border-bottom: 1px var(--border)`. Number columns right-aligned with mono+tabular-nums. **No zebra stripes.** Hover row gets `var(--surface-2)` background.
- **Status badges:** `2px 8px`, `font-size: 11px`, `font-weight: 500`, semantic-soft background + semantic foreground in light mode; transparent + bordered in dark mode.
- **Sidebar nav item:** `6px 10px`, `font-size: 13px`, icon `16x16` from lucide-react, optional right-aligned count in mono.

## Anti-slop checklist

If your screen has any of these, it's wrong:

- ❌ Purple/violet gradient backgrounds (we use flat violet, never gradient)
- ❌ 3-column feature grid with icons in colored circles
- ❌ Centered everything with uniform spacing
- ❌ Pill-shaped buttons (`border-radius: 9999px`)
- ❌ Drop shadows on cards
- ❌ Stock-photo hero sections
- ❌ Decorative blobs, glows, or grain backgrounds
- ❌ Inter / Roboto / Helvetica anywhere as primary
- ❌ Numbers in proportional fonts
- ❌ Border-radius bigger than `12px` on anything that isn't a modal

## Implementation notes (project-specific)

- **Tailwind config** lives at `tailwind.config.js`. Update `fontFamily`, `colors`, `borderRadius`, `fontSize` to match the tokens above. Keep `darkMode: 'class'`.
- **CSS variables** are the source of truth for theming. Tailwind reads them via `theme.extend.colors` like `background: 'rgb(var(--bg) / <alpha-value>)'` (or simpler: hardcoded vars per mode).
- **Geist** loads via Google Fonts in `index.html`. Add a `<link rel="preconnect">` for `fonts.gstatic.com`.
- **Lucide icons** are already a dependency — use them everywhere. Default size `16` in nav, `14` inline with text, `20` in standalone buttons.
- **Number rendering** — wrap any number-bearing JSX in a `<Num>` component (or use a `.num` class) that applies `font-mono font-variant-numeric: tabular-nums tracking-tight`.
- **i18n note:** Russian and other locales must inherit the same numeral styling. `Intl.NumberFormat` output goes through the mono path.

## Decisions Log

| Date       | Decision                                                            | Rationale |
|------------|---------------------------------------------------------------------|-----------|
| 2026-05-10 | Adopted Quiet Pro aesthetic (Linear/Raycast energy)                 | Power-user tool, data density. Chose over editorial / industrial / wild after seeing previews. |
| 2026-05-10 | Single font family: Geist Sans + Geist Mono                         | Coherence over variety. Tabular-nums everywhere = numbers always align. |
| 2026-05-10 | Cool violet `#6E56CF` accent                                        | Distinct from Amazon orange; doesn't compete with semantic green/red. |
| 2026-05-10 | No shadows on cards                                                 | Information-dense screens drown in elevation. 1px borders only. |
| 2026-05-10 | Tabular-nums on every number, even in prose                         | The product is numbers. They must never reflow. |
| 2026-05-10 | 240px persistent sidebar (not collapsible by default)               | 9+ destinations visited multiple times per minute. |
