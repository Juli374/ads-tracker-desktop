# A4. Accessibility & i18n

> Status: 🟨 draft v1
> Last updated: 2026-04-30

## TL;DR

Accessibility and internationalization in Electron split cleanly along the process boundary. **In the renderer, you're in Chromium** — every web a11y/i18n technique applies as-is (semantic HTML, ARIA, `Intl`, i18next). **In the main process, you own a small set of native surfaces** — system menus, tray, dialogs, deep links — and Electron does *not* localize those for you. Plus there is one Electron-specific knob worth knowing: `app.setAccessibilitySupportEnabled()`, which toggles Chromium's accessibility tree at runtime. For B2B / regulated buyers (government, healthcare, education), a11y is contractual, not optional — audit early.

## Accessibility

### The renderer is just Chromium

Anything you would do in a web app, you do here. Semantic HTML elements, ARIA attributes only when semantics aren't enough, full keyboard reachability for every interactive control, visible focus indicators, sufficient color contrast (WCAG 2.1 AA = 4.5:1 for body text), and respect for OS preferences via `prefers-reduced-motion` and `prefers-contrast` media queries. Chrome DevTools' built-in **Lighthouse accessibility audit** and the **Accessibility pane** are available as in any Chrome page — open DevTools and run them against your renderer.

For automated regression testing, **axe-core** plugs into Playwright's Electron support (see [A5 Testing](05-testing.md)) and gives you per-build a11y scans. The Electron docs explicitly call out `axe-core` as the recommended automated tool.[^1]

### Electron-specific: `app.setAccessibilitySupportEnabled(enabled)`

Chromium maintains an accessibility tree (the data structure screen readers consume). Building it has measurable runtime cost, so **Chromium turns it on lazily when assistive tech is detected** — JAWS or Narrator on Windows, VoiceOver on macOS. Electron exposes a manual override via `app.setAccessibilitySupportEnabled(true)` so you can ship a "force-enable accessibility" toggle in your app's preferences for users whose assistive tools aren't auto-detected.[^2]

A few points worth remembering:

- Auto-detection covers the common cases — VoiceOver, Narrator, JAWS, NVDA. You don't need to call this on app start; it's a fallback knob.
- The user's system assistive utilities take priority and will override the setting.[^2]
- Calling `setAccessibilitySupportEnabled(true)` does have a perf hit (extra tree maintenance), so don't enable it unconditionally for every user.

Linux/Orca support exists but is the least mature of the three majors; expect more rough edges than on Windows or macOS.

### Native menus, tray, dialogs

Native UI built via `Menu`, `MenuItem`, `Tray`, and the `dialog` module is rendered by the OS, so it inherits OS accessibility for free — VoiceOver, Narrator, and Orca all read native menu items without you wiring anything up. The catch: `accelerator` strings (keyboard shortcuts) need to follow OS conventions (`CommandOrControl+S`, not `Ctrl+S` on macOS) for the right shortcut to be announced.

### Compliance frameworks worth knowing

If you're selling into:

- **US federal / contractor** — Section 508 (mirrors WCAG 2.0 AA).
- **EU public sector** — EN 301 549 (mirrors WCAG 2.1 AA, mandatory under the European Accessibility Act in force since June 2025).
- **General target** — **WCAG 2.2 AA** (published Oct 2023, current as of 2026-04). Most procurement RFPs are migrating from 2.1 → 2.2.

Apple's App Store reviewers spot-check VoiceOver labelling; missing or wrong labels on interactive controls is a documented rejection reason. Microsoft Store surfaces accessibility status on listings but doesn't gate. Audit before submission, not after a rejection — retrofitting a11y into a finished UI is roughly an order of magnitude more work than building it in.

## Internationalization (i18n)

### Renderer: any web i18n stack works

[i18next](https://www.i18next.com/) (with `react-i18next` / `vue-i18n` adapters), `react-intl` / FormatJS, `svelte-i18n`, `vue-i18n`, `solid-i18next` — all of them work unchanged. Pick whichever your framework community is happiest with. Translation pipeline is identical to web: extract keys → translator deliverable (JSON / XLIFF / `.po`) → ship locale bundles → load on demand.

For dates, numbers, currencies, relative time, and pluralization, **prefer the built-in [`Intl` API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)**. V8 ships with full ICU, so `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.RelativeTimeFormat`, `Intl.PluralRules`, and `Intl.ListFormat` are all available without bundling moment.js or day.js for the simple cases. Use a date library only when you need timezone arithmetic (Luxon, date-fns-tz, Temporal polyfill).

### Detecting the user's locale

```js
const { app } = require('electron');
app.whenReady().then(() => {
  const locale = app.getLocale();             // e.g. "en-US", "de-DE", "ja"
  const country = app.getLocaleCountryCode(); // e.g. "US", "DE", "JP"
});
```

`app.getLocale()` returns a BCP 47 language tag derived from the OS preference. On Windows and Linux it uses Chromium's i18n library; on macOS it reads `[NSLocale currentLocale]`. **Note**: on Windows the call is only valid *after* the `ready` event — earlier and you may get an empty string.[^3]

`app.getLocaleCountryCode()` returns the ISO 3166-1 alpha-2 country code separately, which is useful when you want to localize content (e.g. distinguish Brazilian Portuguese `pt-BR` from European `pt-PT`) or when language and region need to be picked independently.[^4]

### Native menus do **not** translate automatically

This is the most common Electron i18n gotcha. When you build a `Menu` from a template, the strings you put in `label:` are exactly what gets rendered — Electron has no built-in translation layer for menu items, tray tooltips, dialog buttons, or `Notification` titles. You're responsible for:

1. Reading `app.getLocale()` (or your own user preference) at startup.
2. Looking the string up in your translation catalog.
3. Rebuilding the menu template against `Menu.setApplicationMenu(...)`.

If the user changes their OS language while the app is running, Chromium will pick up new translations for renderer-side `Intl` formatters but **your native menus won't refresh until you rebuild and re-set them**. There is no documented `locale-changed` event in the official `app` API as of Electron 41 (2026-04); listen to OS-specific signals (e.g. macOS distributed notifications) or just rebuild the menu when the user explicitly switches language in your settings UI.

### Right-to-left (RTL)

In the renderer, `<html dir="rtl">` or CSS `direction: rtl` does the bulk of the work — Chromium mirrors layout, text, and bidirectional input correctly. For custom canvas / WebGL drawing you handle RTL yourself. Native menus on Windows and Linux mirror automatically when the OS is in an RTL locale; macOS native menu mirroring follows the system-language setting.

### Translation pipeline

Same as any web app — there is nothing Electron-specific. Keep locale JSON in `src/locales/{lang}.json`, ship them as part of the asar, lazy-load by language tag, and feed to your i18n library. For native menu strings, keep a separate `src/locales/native/{lang}.json` so main-process code doesn't need to depend on the same catalog as the renderer.

## Practical advice

- **Audit a11y early.** Run `axe-core` in CI on a sample of routes from the first usable build. Cost of fixing a missing label at week 2 is a few minutes; week 20 it's a sprint.
- **Test with a real screen reader at least once.** VoiceOver (Cmd+F5 on macOS) and Narrator (Ctrl+Win+Enter on Windows) are free and built in. Five minutes of trying to navigate your app blind catches more issues than any automated tool.
- **Don't trust `app.getLocale()` blindly for user-facing language.** Offer an in-app language switcher; some users have an English OS but want a Russian UI, or vice versa.
- **Keep menu templates in a function**, not a top-level constant — you'll thank yourself when you add the second locale.
- **Test RTL with Arabic or Hebrew sample data**, not just `dir="rtl"` on English text. The `i` and `l` characters look identical regardless of direction; real RTL exposes layout assumptions immediately.
- **For B2B procurement**, prepare a VPAT (Voluntary Product Accessibility Template) document mapping your product against WCAG 2.2 AA / Section 508. Buyers in regulated sectors will ask.

## Cross-links

- [A5 Testing](05-testing.md) — Playwright + `axe-core` for automated a11y scans
- [C4 Native integrations](../core/04-native-integrations.md) — `Menu`, `Tray`, `Notification` APIs that need manual localization
- [C8 Frontend stack](../core/08-frontend-stack.md) — framework choice; all major frameworks have a working i18n binding
- [A3 Store distribution](03-store-distribution.md) — Apple's a11y review checks; MAS expectations

## Sources

- [Accessibility | Electron docs](https://www.electronjs.org/docs/latest/tutorial/accessibility) — official guidance, `axe-core` recommendation, `setAccessibilitySupportEnabled` overview *(as of 2026-04)*
- [app.setAccessibilitySupportEnabled | Electron API](https://www.electronjs.org/docs/latest/api/app#appsetaccessibilitysupportenabledenabled-macos-windows) — API surface and OS coverage
- [app.getLocale | Electron API](https://www.electronjs.org/docs/latest/api/app#appgetlocale) — BCP 47 return value, Windows ready-event caveat
- [app.getLocaleCountryCode | Electron API](https://www.electronjs.org/docs/latest/api/app#appgetlocalecountrycode) — ISO 3166 country code separation
- [Chromium accessibility internals](https://www.chromium.org/developers/design-documents/accessibility/) — the underlying tree model
- [WCAG 2.2 | W3C](https://www.w3.org/TR/WCAG22/) — current target standard *(as of 2026-04)*
- [European Accessibility Act / EN 301 549 | ETSI](https://www.etsi.org/deliver/etsi_en/301500_301599/301549/) — EU compliance baseline
- [Section 508 | US GSA](https://www.section508.gov/) — US federal compliance baseline
- [`Intl` | MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl) — built-in formatters
- [i18next](https://www.i18next.com/) — most common renderer i18n library

[^1]: [Accessibility | Electron docs](https://www.electronjs.org/docs/latest/tutorial/accessibility) — *"Electron applications keep accessibility working with `axe-core`"* and links to DevTools accessibility tooling.
[^2]: [app.setAccessibilitySupportEnabled | Electron API](https://www.electronjs.org/docs/latest/api/app#appsetaccessibilitysupportenabledenabled-macos-windows) — manual override; system assistive utilities override the setting; auto-detection on JAWS/VoiceOver.
[^3]: [app.getLocale | Electron API](https://www.electronjs.org/docs/latest/api/app#appgetlocale) — Windows-only ready-event constraint documented in the API page.
[^4]: [app.getLocaleCountryCode | Electron API](https://www.electronjs.org/docs/latest/api/app#appgetlocalecountrycode) — ISO 3166-1 alpha-2 country code.
