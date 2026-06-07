I have everything needed. No SENTRY_DSN/PostHog env wiring exists anywhere (only in stub comments). There is an `OnboardingEmptyState` and feature toggles like `AutoNegativatorPanel`, which are the natural "activation" surfaces. I have a complete picture of the seam.

---

# Telemetry / Analytics Seam Audit — KDPBook Desktop
## Feature-Activation Event Capture Assessment

**Repo:** `/Users/yulii/KDP-business/ads-tracker-desktop` · **Version:** 3.5.0 · **Verdict:** the telemetry module is a fully-shaped **stub with no transport and no emitting call sites**. The consent half is wired end-to-end; the event half (`track`/`init`/`setUser`/`clearUser`) is dead code today.

---

## (1) The current telemetry API + consent gating + privacy invariants

All in `/Users/yulii/KDP-business/ads-tracker-desktop/src/main/telemetry.ts` (main process, 98 lines, module-level mutable `consent`/`userId`).

**Public surface:**

| Function | Line | Behavior today |
|---|---|---|
| `init(initialConsent: boolean)` | `telemetry.ts:45` | Sets module `consent`; if false, returns. Else STUB no-op (real impl would `Sentry.init()`). |
| `setConsent(next: boolean)` | `telemetry.ts:58` | Runtime flip; early-returns if unchanged. Both branches STUB no-op. |
| `getConsent(): boolean` | `telemetry.ts:68` | Returns in-memory `consent`. |
| `setUser(id: string \| null)` | `telemetry.ts:73` | Stores `userId` for later attachment. |
| `clearUser()` | `telemetry.ts:77` | Nulls `userId` (intended for signOut). |
| `track(event: TelemetryEvent)` | `telemetry.ts:86` | Consent-gated; in dev logs `console.debug`, in packaged build STUB no-op. |

**Event type contract** (`telemetry.ts:31-39`) — this is the typed shape any activation event must satisfy:
```ts
export interface TelemetryEvent {
  /** Short dotted event name, e.g. `ai.generate.title`. */
  name: string;
  /**
   * Sanitised properties. Callers must NOT pass raw user content, API keys,
   * tokens, or PII. Numeric / boolean / short enum strings only.
   */
  props?: Record<string, string | number | boolean | null | undefined>;
}
```

**Consent gate (the module owns it — callers never check)** — `track()` body, `telemetry.ts:86-97`:
```ts
export function track(event: TelemetryEvent): void {
  if (!consent) return;                                              // gate
  if (!event || typeof event.name !== 'string' || event.name.length === 0) return;
  if (app.isPackaged) {
    // STUB. Real impl: Sentry.addBreadcrumb(...) OR posthog.capture(...)
    return;
  }
  // Dev only — let the developer see what would have been sent.
  console.debug('[telemetry stub]', event.name, { ...event.props, userId });
}
```

**Privacy invariants (quoted verbatim from the file header, `telemetry.ts:11-24`):**
> - `track(event, props)` becomes the single emission point for product analytics + crash breadcrumbs. **Callers do not check consent — this module owns the gate.**
> - For now: no transport, every call is a console.debug in dev and a no-op in production. Callers can wire in unconditionally; flipping to real transport is a single-module change.
> - **Privacy invariant: this module MUST NOT auto-initialise on app boot.** It only activates after explicit user consent. The default of `consent=false` is sticky — re-confirmed on every app boot until the user opts in.

Plus the per-event PII rule (`telemetry.ts:35-37`): *"Callers must NOT pass raw user content, API keys, tokens, or PII. Numeric / boolean / short enum strings only."*

---

## (2) Every existing call site of `track()` — and events emitted today

**There are ZERO call sites of `track()`.** Grep across all of `src` (`*.ts`/`*.tsx`) for `.track(` / `track({` returns nothing outside the definition itself. **No product events are emitted today.**

Likewise dead: **`init()` is never called** (the main entry `src/index.ts` imports only `initLogger` and `initAutoUpdater` — `src/index.ts:3,5`; it never imports `./main/telemetry`). **`setUser()` and `clearUser()` are never called** — sign-in/sign-out in `src/renderer/contexts/AuthContext.tsx` use a local React `setUser` (unrelated state setter), not the telemetry one.

The **only** telemetry symbol imported anywhere in app code is `setConsent`:
- `src/main/ipc-handlers.ts:77` — `import { setConsent as telemetrySetConsent } from './telemetry';`

Consequence: even consent is **never restored into the module on boot** — because `init(initialConsent)` is never invoked, the module's `consent` variable resets to its `false` default every launch and only becomes `true` mid-session if the user re-toggles the Privacy tab. (The persisted DB value is still read correctly by the IPC getter, so the UI shows the right state; but the in-memory gate is stale until a toggle. This is moot while transport is a no-op, but is a real wiring gap to fix when transport lands.)

---

## (3) The consent flow — storage, toggle, boot read

End-to-end and fully functional (this is the one wired path). Default is **opt-in (false)**.

**Storage — local-db (encrypted JSON via safeStorage), not a real DB row:**
- Field declared: `src/main/local-db/index.ts:213` → `telemetry_consent?: boolean;` on `LocalDbState`.
- Default on load/migrate: `src/main/local-db/index.ts:633` → `telemetry_consent: typeof parsed.telemetry_consent === 'boolean' ? parsed.telemetry_consent : false`. Comment at `:632`: *"Phase N — telemetry consent. Default false → opt-in."* Persisted to disk (encrypted) by `writeState`, `index.ts:638`.

**Toggle path (renderer → IPC → main → DB + module):**
1. UI: `src/renderer/components/settings/PrivacyTab.tsx:38-49` `handleToggle` → `window.api.telemetry.setConsent(next)`.
2. Preload bridge: `src/preload.ts:239-243` (`telemetry.getConsent` / `telemetry.setConsent`).
3. IPC contract: `src/shared/ipc.ts:135-136` (`TelemetryGetConsent`/`TelemetrySetConsent` channels) + `src/shared/ipc.ts:1009-1012` (typed `telemetry` namespace on `DesktopApi`).
4. Handler: `src/main/ipc-handlers.ts:1421-1432` — validates boolean, `localStore.mutate(state => { state.telemetry_consent = consent })`, then `telemetrySetConsent(consent)` to mirror into the in-memory runtime gate.

**Boot read (UI only):**
- `PrivacyTab.tsx:21-36` `useEffect` calls `window.api.telemetry.getConsent()` → handler `ipc-handlers.ts:1416-1419` reads `state.telemetry_consent === true`. Drives the checkbox + status line (`PrivacyTab.tsx:88-93`).
- Tab is reachable: registered in `src/renderer/pages/SettingsPage.tsx:15,32,95` and `src/renderer/components/settings/SettingsTabs.tsx:28,46` (Shield icon, `'privacy'` tab).

**Gap noted above:** the *module* gate is never hydrated on boot (`init()` uncalled), only the *UI* reads the persisted value.

---

## (4) GAP ANALYSIS — minimal path to let developers see activation order

**Root gap:** `track()` has no transport and (a) is never called, so there is no event stream at all; (b) in `app.isPackaged` it is an unconditional no-op, so even if you call it, production emits nothing; (c) there is no analytics endpoint — `api-client.ts` exposes only `performApiRequest` (`src/main/api-client.ts:363`) routing to `/api/auth/*`, scrape, entitlements; no `/api/events`/`/api/analytics`/`/api/telemetry` exists in this repo, and there are no analytics deps in `package.json` (no Sentry/PostHog/etc.). All transport references are stub *comments* only (`telemetry.ts:8,43,91`).

### Comparison of the three paths

**(a) Emit via existing `track()` seam now (no transport yet)**
- Work: add `track({...})` calls at each feature-enable site; that's it for the emit side.
- Visibility: **dev only**. Events surface as `console.debug('[telemetry stub]', ...)` (`telemetry.ts:96`) and **only** when consent=true AND `!app.isPackaged`. A developer running `npm start` and toggling consent on would see the exact activation sequence in the terminal/devtools immediately.
- Pros: zero new infra, zero PII/network risk, honors every existing invariant, single-module flip later. Establishes the taxonomy + call-site coverage now.
- Cons: **invisible in production** — gives you nothing about real users until a transport is wired. Pure no-op in shipped builds.

**(b) Add a backend endpoint to receive events**
- Work: new Flask route in the *other* repo `Juli374/ads-tracker` (CLAUDE.md rule #1: **no backend changes from this repo**), e.g. `POST /api/events`; then make `track()`'s packaged branch call `performApiRequest({ method:'POST', path:'/api/events', body:{...} })` (note: the `/api/` prefix is enforced by `validatePath`, `api-client.ts:42-56` — compatible). Must be account-scoped to avoid the cross-tenant leak class already flagged in the data-layer audit.
- Visibility: **full, cross-user, production** — this is the only option that actually answers "what do real users enable, in what order" at scale.
- Pros: real product analytics; reuses the hardened request pipeline (timeout, 401-refresh, host-pinning).
- Cons: heaviest. Cross-repo coordination, server schema/storage, multi-tenancy isolation, retention/PII review, batching/offline-queue. Out of scope for a desktop-only change.

**(c) Store an activation-history log locally and surface it in-app**
- Work: add a bounded array (e.g. `activation_events: ActivationEventRow[]` + `next_activation_id`) to `LocalDbState` in `src/main/local-db/index.ts`, mirroring the existing `weekly_briefings` + `BRIEFING_HISTORY_CAP` FIFO pattern (`index.ts:207-210,222`). Append on each feature-enable; expose via a new typed IPC getter; render a small read-only "Activation history" list (natural home: the Privacy tab, or a debug panel).
- Visibility: **per-user, local, no consent needed, no network** (it's the user's own data on their own machine — same trust model as royalty). A developer can read it from a test machine or via a support export; you see that user's exact enable order with timestamps.
- Pros: no backend, no transport, no PII leaving the device, immediately inspectable; doubles as a user-facing transparency feature.
- Cons: not aggregatable across users without a separate export/upload step; only as useful as the machines you can inspect.

### Recommendation

**Do (a) + (c) together now; defer (b).**

- **(a)** is mandatory regardless — it defines the canonical taxonomy and puts the `track()` calls at every enable site *once*, so flipping to any transport later is the promised single-module change. Wire it in immediately, and also call `init(persistedConsent)` from the main boot path (currently missing — `src/index.ts`) and `setUser(id)`/`clearUser()` from the auth handlers so the module is correctly hydrated for when transport arrives.
- **(c)** is the cheapest way to actually *see activation order* today — including in packaged builds where (a) alone is silent — without any of (b)'s infra/privacy cost. It piggybacks the proven `weekly_briefings` FIFO-cap pattern and the existing local-db encryption. The same enable call sites feed both (a)'s `track()` and (c)'s local append.
- **(b)** only when cross-user aggregation is genuinely needed; it's a separate backend task in `Juli374/ads-tracker` and must be account-scoped. When built, `track()`'s packaged branch routes through the existing `performApiRequest` seam — no new HTTP path in the renderer (CLAUDE.md rule #4).

**Natural activation surfaces to instrument** (where a feature is turned on): `AutoNegativatorPanel` (`src/renderer/components/automation/AutoNegativatorPanel.tsx`), Settings full-sync option grid (`src/renderer/components/settings/fullSync/SyncOptionsGrid.tsx`), schedule profiles (`.../searchTerm/ScheduleProfilesPanel.tsx`), the Privacy consent toggle itself, and first-feature-use signals off `OnboardingEmptyState` (`src/renderer/components/dashboard/OnboardingEmptyState.tsx`). There is no existing onboarding/first-run state machine to hook, so "activation" must be defined by these explicit enable/first-use events.

### Recommended PII-free event taxonomy for activation

Conforms to `TelemetryEvent` (`telemetry.ts:31-39`): short dotted `name`, props are **numeric / boolean / short-enum strings only** — never titles, ASINs, keywords, emails, tokens, or free text.

**Event names (dotted, lower-case, `feature.activation.*`):**
- `feature.activation.enable` — a feature was turned on.
- `feature.activation.disable` — a feature was turned off (lets you measure churn within the sequence).
- `feature.activation.first_use` — first meaningful use of a feature that has no on/off toggle (e.g. first AI generation, first royalty import).

**Props (every prop is a bounded scalar):**

| Prop | Type | Notes / allowed values |
|---|---|---|
| `feature` | short-enum string | Stable feature key from a fixed allowlist, e.g. `auto_negativator`, `full_sync`, `schedule_profiles`, `ai_advisor`, `royalty_import`, `briefing`, `cover_qa`, `scraper_sidecar`, `telemetry_consent`. Never derived from user data. |
| `action` | short-enum string | `enable` \| `disable` (omit for `first_use`). |
| `seq` | number | Monotonic activation sequence index for this user (1, 2, 3 …) — the **order** signal. Source it from the local-db `next_activation_id` counter (path (c)), so it's stable and survives restarts. |
| `ts` | number | Unix epoch ms. (Note: don't also pass timezone/locale unless coarse.) |
| `source` | short-enum string | Where it was triggered: `settings` \| `onboarding` \| `command_palette` \| `panel` \| `upgrade_modal`. (`UpgradeModal.tsx:15` already carries a feature key "for telemetry" — reuse it.) |
| `tier` | short-enum string (optional) | `pro` \| `free` — gating context, not identity. |
| `nth_session` | number (optional) | Coarse session counter to bucket "activated on day 1 vs later" without timestamps-as-identity. |

**Example calls (illustrative — taxonomy only, not yet in code):**
```ts
track({ name: 'feature.activation.enable',
        props: { feature: 'auto_negativator', action: 'enable', seq: 3, source: 'settings', tier: 'pro', ts: Date.now() } });

track({ name: 'feature.activation.first_use',
        props: { feature: 'ai_advisor', seq: 4, source: 'panel', ts: Date.now() } });
```

**Order reconstruction:** with `feature` + `seq` (and `ts` as tiebreak), developers replay the exact enable sequence per user. Under path (c) this is readable directly from the local `activation_events` log today; under (a) it appears in dev `console.debug`; under (b) it aggregates server-side once that endpoint exists.

---

### Key file:line index
- Telemetry stub + invariants: `src/main/telemetry.ts:31-39` (type), `:45/:58/:68/:73/:77/:86` (API), `:11-24` (invariants), `:87` (consent gate), `:89-96` (packaged no-op / dev console).
- Consent IPC: `src/main/ipc-handlers.ts:77,1416-1432`; preload `src/preload.ts:239-243`; contract `src/shared/ipc.ts:135-136,1009-1012`.
- Consent storage: `src/main/local-db/index.ts:213,632-633` (+ FIFO-cap pattern to copy for path (c): `:207-210,222`).
- Consent UI: `src/renderer/components/settings/PrivacyTab.tsx:21-49,88-93`; registration `SettingsPage.tsx:15,32,95`, `SettingsTabs.tsx:28,46`.
- Transport seam for path (b): `src/main/api-client.ts:363` (`performApiRequest`), `:42-56` (`/api/` path guard). No analytics endpoint or dep exists anywhere.
- Activation surfaces to instrument: `AutoNegativatorPanel.tsx`, `settings/fullSync/SyncOptionsGrid.tsx`, `settings/searchTerm/ScheduleProfilesPanel.tsx`, `dashboard/OnboardingEmptyState.tsx`, `UpgradeModal.tsx:15`.