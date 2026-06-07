I now have the complete end-to-end picture. I have the data model, hook API, all call sites, the IPC push mechanism, the nav structure, and the page-to-feature classification. I have everything needed to produce the report including the seam recommendation.

---

# KDPBook Desktop — Entitlement / Feature-Gating System (end-to-end map)

All paths absolute under `/Users/yulii/KDP-business/ads-tracker-desktop`. This is the **Phase K tier-gating skeleton**: a server-issued, signed snapshot of paid features, pushed from main → renderer over IPC, consumed declaratively via a per-feature hook.

---

## (1) Data model — `src/shared/entitlements.ts`

The single source of truth shared by both processes. Imported by main, preload, IPC contract, and renderer.

**`Tier`** — `entitlements.ts:12`. Strictly ordered scale (`start < pro < business`):
```ts
export type Tier = 'start' | 'pro' | 'business';
```

**`FeatureKey`** — `entitlements.ts:22-46`. The 16-key union (the comments tie each to a build phase):
```ts
export type FeatureKey =
  | 'ai.title_generator'
  | 'ai.advisor_panel'
  | 'ai.reverse_asin'
  | 'ai.niche_explorer'          // Phase M.1
  | 'ai.weekly_briefing'         // Phase M.5 Lane E
  | 'ai.bid_copilot'             // Phase M.3
  | 'analytics.hourly_dynamics'
  | 'analytics.multi_period_metrics'
  | 'analytics.search_terms_deep'
  | 'marketplace.multi'
  | 'automation.rules'
  | 'automation.scheduled_reports'
  | 'books.bulk_import'
  | 'royalties.advanced_breakdown'
  | 'export.unlimited'
  | 'support.priority';
```
The same 16 are re-listed as a runtime array **`ALL_FEATURE_KEYS`** (`entitlements.ts:49-66`) for DRY iteration (used to build EMPTY/FALLBACK maps).

**`DEFAULT_TIER_FOR_FEATURE: Record<FeatureKey, Tier>`** — `entitlements.ts:74-91`. Static UX-only map driving the "Upgrade to Pro / Business" CTA. Notably, **9 keys require `pro`** and **5 require `business`** (`marketplace.multi`, `automation.rules`, `automation.scheduled_reports`, `support.priority`), with `books.bulk_import`/`royalties.advanced_breakdown`/`export.unlimited` = pro. The file's own comment (line 250) says "12 keys" — that's stale; there are 16.

**`FeatureState`** — `entitlements.ts:103-106`. Discriminated union, the per-feature atom:
```ts
export type FeatureState =
  | { state: 'on' }
  | { state: 'off'; reason: 'tier' | 'expired' | 'admin_off' | 'unknown' }
  | { state: 'trial'; until: string };
```

**`SubscriptionInfo`** — `entitlements.ts:113-117`: `status: 'active' | 'in_grace' | 'expired' | 'none'` + optional `renews_at` / `in_grace_until`.

**`Entitlements`** (the snapshot) — `entitlements.ts:127-145`:
```ts
export interface Entitlements {
  v: 1;
  issued_at: string;
  expires_at: string;
  user_id: number | null;
  tier: Tier;
  subscription: SubscriptionInfo;
  features: Record<FeatureKey, FeatureState>;
  overrides?: Partial<Record<FeatureKey, FeatureState>>;  // support grants; WINS over features
  sig: string;  // server HMAC; UI does NOT validate
}
```

**Helpers (pure):**
- `emptyEntitlements()` / `EMPTY_ENTITLEMENTS` — `entitlements.ts:153-170`: tier=`start`, every feature `{state:'off', reason:'tier'}`. Fail-closed default.
- `isFeatureOn(e, key): boolean` — `entitlements.ts:176-185`: **override beats base**, then delegates to `effectiveStateIsOn`.
- `effectiveStateIsOn(s)` — `entitlements.ts:187-195`: `on`→true; `trial`→true only if `Date.now() < Date.parse(until)`; else false.
- `forcedTierEntitlements(tier)` — `entitlements.ts:205-225`: synthetic snapshot for the `ADS_TRACKER_FORCE_TIER` dev/QA env. start→all off, pro/business→all on, 30-min expiry.

---

## (2) Renderer hook API

### Primary hook: `useEntitlement(key)` — `src/renderer/hooks/useEntitlement.ts:31-44`
```ts
export interface UseEntitlementResult {
  on: boolean;          // isFeatureOn (incl. trial window)
  state: FeatureState;  // full state for off.reason / trial.until UX
  tierRequired: Tier;   // from DEFAULT_TIER_FOR_FEATURE — drives CTA
}
export function useEntitlement(key: FeatureKey): UseEntitlementResult
```
Reads `entitlements` from context, memoizes on `[entitlements, key]`, resolves `override ?? base ?? FALLBACK_OFF` (`{state:'off',reason:'tier'}`) for `state`.

### Context hooks — `src/renderer/contexts/EntitlementsContext.tsx`
- `useEntitlements(): EntitlementsContextValue` — `:142-148`. Shape (`:30-35`): `{ entitlements, tier, isOn(key), refresh() }`. **Crucial fallback:** if no Provider is mounted, returns `FALLBACK_VALUE` (`:135-140`) which is **all-on, tier=pro** — so tests/legacy pages render unlocked. Production always mounts the Provider.
- `useEntitlementsOptional(): EntitlementsContextValue | null` — `:152-154`. Returns `null` outside a Provider; used crash-safely by `UpgradeModal`.

### Call sites (15 production consumers)

| File:line | Hook call | Feature gated | Pattern |
|---|---|---|---|
| `components/MainLayout.tsx:446` | `useEntitlement(item.feature ?? 'ai.title_generator')` | per-nav-item | Sidebar badge only; **nav not blocked** |
| `components/CommandPalette.tsx:69` | `useEntitlement('ai.title_generator')` | `ai.title_generator` | Hides/labels "Ask AI" command |
| `components/GlobalFilters.tsx:170` | `useEntitlement('marketplace.multi')` | `marketplace.multi` | Gates multi-marketplace filter |
| `components/dashboard/BriefingCard.tsx:45` | `useEntitlement('ai.weekly_briefing')` | `ai.weekly_briefing` | Wraps card in `<LockedFeature mode="dim">` (`:97`) |
| `components/campaigns/AIAdvisorPanel.tsx:49` | `useEntitlement('ai.bid_copilot')` | `ai.bid_copilot` | Gates bulk-apply sub-feature |
| `components/campaigns/HourlyDynamicsChart.tsx:50` | `useEntitlement('analytics.hourly_dynamics')` | `analytics.hourly_dynamics` | Inline gate |
| `components/campaigns/MultiPeriodMetricsTable.tsx:90` | `useEntitlement('analytics.multi_period_metrics')` | `analytics.multi_period_metrics` | Inline gate |
| `pages/CampaignDetailsPage.tsx:84` | `useEntitlement('ai.advisor_panel')` | `ai.advisor_panel` | Gates advisor panel |
| `pages/ResearchPage.tsx:95` | `useEntitlement('ai.niche_explorer')` | `ai.niche_explorer` | Full-page guard → `LockedFeatureCard` (`:103`) |
| `pages/RoyaltiesPage.tsx:42` | `useEntitlement('royalties.advanced_breakdown')` | `royalties.advanced_breakdown` | Gates advanced breakdown |
| `pages/BriefingPage.tsx:88` | `useEntitlement('ai.weekly_briefing')` | `ai.weekly_briefing` | Full-page guard → `LockedFeatureCard` (`:153`) |
| `pages/ListingStudioPage.tsx:71` | `useEntitlement('ai.title_generator')` | `ai.title_generator` | Full-page guard → `LockedFeatureCard` (`:81`) |
| `pages/AutomationPage.tsx:49` | `useEntitlement('automation.rules')` | `automation.rules` | Full-page guard + **skips backend fetch when off** (`:69`) → `LockedFeatureCard` (`:140`) |
| `pages/KeywordsPage.tsx` (via `LockedFeature` at `:454`) | — | `ai.reverse_asin` | Reverse-ASIN panel wrapped `mode="dim"` |

**Two wrapper components** consume `useEntitlement` internally:
- `components/LockedFeature.tsx:37` — `const { on, tierRequired } = useEntitlement(feature)`. Props `{feature, mode?: 'dim'|'badge'|'hide'}` (`:23-29`). `on`→render children; `hide`→null; `dim`/`badge`→overlay/badge button → opens `UpgradeModal` (`:118-123`).
- `components/ui/LockedFeatureCard.tsx` — presentational only (takes `tier` + `onUpgrade`, **no hook**); pages call the hook themselves and render this when `!on`.

**Unused keys:** `analytics.search_terms_deep`, `automation.scheduled_reports`, `books.bulk_import`, `export.unlimited`, `support.priority` are declared but have **zero `useEntitlement` call sites** — defined ahead of their UI.

---

## (3) Main → renderer push (`EntitlementsChanged`)

**Channel constant:** `src/shared/ipc.ts:104-106`:
```ts
EntitlementsGet: 'entitlements:get',
EntitlementsRefresh: 'entitlements:refresh',
EntitlementsChanged: 'entitlements:changed',
```
Payload type `Entitlements` is imported into the IPC contract (`ipc.ts:4`) and the `DesktopApi.entitlements` surface is `{ get(), refresh(), onChange(handler) }` (`ipc.ts:956-960`).

**Main-process store — `src/main/entitlements.ts`** (module-singleton):
- State: `currentEntitlements`, `subscribers[]`, `refreshTimer`, `inFlight` (single-flight guard `:41,146`).
- `fetchEntitlements()` (`:139-184`): if `ADS_TRACKER_FORCE_TIER` set → synthetic; else `GET /api/me/entitlements` via `performApiRequest`. **Fail-closed graceful fallback** (`:169-173`): 404/401/network → `EMPTY_ENTITLEMENTS`; other 5xx → keep current; unknown `v` → EMPTY.
- `refresh()` (`:225-241`): fetch → set current → `saveCache` → **notify only if changed** (`shallowEqual`, `:243-253`, JSON-compares features+overrides).
- `notifySubscribers(e)` (`:186-205`): calls in-process subscribers, **then broadcasts to every window**: `win.webContents.send(IpcChannel.EntitlementsChanged, e)` (`:199`).
- `startEntitlementsTracking()` (`:259-287`): load disk cache (safeStorage-encrypted `entitlements.bin`, plain `entitlements.json` fallback) → `refresh()` → 30-min interval refresh **only when a window is focused** (`:278-281`).
- `clearOnLogout()` (`:290-294`): wipe cache, reset to EMPTY, notify.
- `subscribe(cb)` (`:211-216`): in-process subscriber registry (used by `index.ts` to start/stop schedulers on tier change).

**IPC handlers — `src/main/ipc-handlers.ts:1281-1287`:**
```ts
ipcMain.handle(IpcChannel.EntitlementsGet, async () => getCurrentEntitlements());
ipcMain.handle(IpcChannel.EntitlementsRefresh, async () => refreshEntitlements());
```
No handler for `EntitlementsChanged` — it's push-only (`send`, not `handle`).

**Refresh triggers:**
- Startup: `index.ts:296` `startEntitlementsTracking()` after `createWindow()`; `index.ts:327-334` subscribes to tier changes to start/stop the Auto-Negativator + Weekly Briefer schedulers (gated on `automation.rules`/`ai.weekly_briefing` tiers).
- On login: `ipc-handlers.ts:287` (`AuthSetToken` fires `refreshEntitlements()` fire-and-forget) **and** `AuthContext.tsx:122-123,140-142` explicitly calls `window.api.entitlements.refresh()`.
- On logout: `ipc-handlers.ts:296` (`AuthClearToken` → `clearEntitlementsOnLogout()`) + `AuthContext.tsx:177-178` forces a refresh.

**Preload bridge — `src/preload.ts:185-195`:**
```ts
entitlements: {
  get: () => ipcRenderer.invoke(IpcChannel.EntitlementsGet),
  refresh: () => ipcRenderer.invoke(IpcChannel.EntitlementsRefresh),
  onChange: (handler) => {
    const wrapped = (_e, e) => handler(e);
    ipcRenderer.on(IpcChannel.EntitlementsChanged, wrapped);
    return () => ipcRenderer.off(IpcChannel.EntitlementsChanged, wrapped);  // returns unsub
  },
},
```

**Context subscription — `src/renderer/contexts/EntitlementsContext.tsx`:**
- `:54-70` initial `entitlements.get()` (guarded by `typeof window.api?.entitlements?.get === 'function'`; stays EMPTY if absent).
- `:74-82` `entitlements.onChange(next => setEntitlements(next))`; returns `unsub` as the effect cleanup.
- `:84-94` `refresh()` exposed for manual refetch (post-billing).

Full path: `server → main.fetch → currentEntitlements → notifySubscribers → webContents.send('entitlements:changed') → preload onChange → setEntitlements → useEntitlement re-memo → component re-render`.

---

## (4) FeatureKey ↔ nav-page mapping (16 keys vs 21 pages)

The 21 pages = the `ViewId` union (`src/renderer/contexts/NavContext.tsx:9-33`) minus `campaign_details` (a drill-down view, not a sidebar page) plus the sidebar set in `MainLayout.tsx:123-165`. **Sidebar `feature` only controls the badge (`MainLayout.tsx:447` `isLocked = item.feature ? !ent.on : false`); navigation is never blocked** — each page self-gates its body.

### Pages WITH a feature key

| Page (ViewId) | Sidebar `feature` (MainLayout:line) | Body-level gate (file:line → key) | Tier |
|---|---|---|---|
| `research` (ResearchPage) | `ai.niche_explorer` (`:136`) | `ResearchPage.tsx:95` → `ai.niche_explorer` | pro |
| `automation` (AutomationPage) | `automation.rules` (`:141`) | `AutomationPage.tsx:49` → `automation.rules` | business |
| `operations` (OperationsCenterPage) | `automation.rules` (`:143`) | *no body gate* (badge only; page renders free) | business (badge) |
| `listing_studio` (ListingStudioPage) | `ai.title_generator` (`:153`) | `ListingStudioPage.tsx:71` → `ai.title_generator` | pro |
| `briefing` (BriefingPage) | `ai.weekly_briefing` (`:154`) | `BriefingPage.tsx:88` → `ai.weekly_briefing` | pro |
| `royalties` (RoyaltiesPage) | *(none)* | `RoyaltiesPage.tsx:42` → `royalties.advanced_breakdown` (partial gate) | pro |
| `keywords` (KeywordsPage) | *(none)* | `KeywordsPage.tsx:454` `<LockedFeature>` → `ai.reverse_asin` (panel only) | pro |
| `campaign_details` (CampaignDetailsPage) | *(not a sidebar item)* | `CampaignDetailsPage.tsx:84` → `ai.advisor_panel` (+ `ai.bid_copilot` inside `AIAdvisorPanel.tsx:49`) | pro |

### Pages with NO feature key (free / core) — 13 sidebar pages

`dashboard`, `books`, `campaigns`, `search_terms`, `negatives`, `reports`, `comparison`, `action_center`, `alerts`, `pnl`, `accounting`, `profile`, `settings`.

(Confirmed by grep: none import `useEntitlement`/`LockedFeature`. Note: `DashboardPage` is free *as a page*, but it embeds `BriefingCard` which gates `ai.weekly_briefing`; `CampaignsPage` is free but `CampaignDetailsPage` and its `HourlyDynamicsChart`/`MultiPeriodMetricsTable` children gate analytics keys.)

### Keys with NO page (component- or not-yet-wired)
- **Component-level only:** `ai.advisor_panel`, `ai.bid_copilot` (CampaignDetails), `analytics.hourly_dynamics`, `analytics.multi_period_metrics` (Campaign children), `marketplace.multi` (GlobalFilters), `ai.reverse_asin` (Keywords panel), `ai.weekly_briefing` (also BriefingCard), `royalties.advanced_breakdown` (Royalties sub-section).
- **Declared but entirely unused (no UI yet):** `analytics.search_terms_deep`, `automation.scheduled_reports`, `books.bulk_import`, `export.unlimited`, `support.priority`.

**Summary:** Only **2 pages** are hard full-page gated (Research, Automation, Listing Studio, Briefing are 4 actually — full-page `LockedFeatureCard`). Most gating is **per-component**, not per-page. The page↔key relationship is many-to-many, not 1:1.

---

## (5) Recommended seam for a SECOND axis (user-controlled activation)

**Goal:** a feature is *entitled* (axis 1, server) but stays hidden until the user *opts in* (axis 2, local). Effective visibility = `entitled AND activated`.

### Recommendation: a **separate, new context + local-only store** — do NOT fold it into `EntitlementsContext`.

**Why separate:**

1. **Different source of truth & lifecycle.** Entitlements are *server-issued, signed, fail-closed, refreshed/expired, wiped on logout* (`main/entitlements.ts`). Activation is *user intent, local, sticky, survives logout, never expires*. Mixing them into one snapshot/cache would force activation to inherit entitlements' expiry/refresh/HMAC semantics — wrong. There's direct precedent in this codebase for keeping user-toggles local: Auto-Negativator's "sticky enabled flag in local-db" (`index.ts:304`) and `update.setAutoDownload` (`ipc.ts:65-68`), both persisted in `userData`/local-db, **not** in the entitlements snapshot.

2. **The two axes compose cleanly without coupling.** Keep `useEntitlement` exactly as-is and add a thin composed hook rather than widening the result type:
   ```ts
   // new: src/renderer/hooks/useFeatureVisible.ts
   export function useFeatureVisible(key: FeatureKey) {
     const ent = useEntitlement(key);                 // axis 1 (unchanged)
     const { isActivated, setActivated } = useActivation(); // axis 2 (new ctx)
     return { ...ent, activated: isActivated(key), setActivated,
              visible: ent.on && isActivated(key) };
   }
   ```
   Existing 15 call sites keep working untouched; only surfaces that want the second axis migrate to `useFeatureVisible`.

3. **Storage seam already exists.** Mirror `main/entitlements.ts` minus the network: a new `src/main/feature-activation.ts` persisting a `Record<FeatureKey, boolean>` to `userData/feature-activation.json` (plain is fine — no secrets; same pattern as updater prefs), with IPC channels `FeatureActivationGet/Set/Changed` added to `ipc.ts` and a `window.api.featureActivation` preload surface. The `Changed` push reuses the exact `notifySubscribers`/`webContents.send` pattern (`entitlements.ts:186-205`) so the new context subscribes identically (`EntitlementsContext.tsx:74-82`).

**Why NOT the same context:** widening `Entitlements.features[key]` or `FeatureState` to carry activation would (a) require the server (which owns that schema, `v:1`) to round-trip a purely-client concern, (b) break the `sig` HMAC contract (`entitlements.ts:143`), (c) make `clearOnLogout` (`entitlements.ts:290`) wipe user preferences that should persist, and (d) entangle the fail-closed EMPTY default with a user setting that should default *visible-on-when-entitled* or *opt-in*, depending on product choice.

**Single-axis exception:** if you specifically want "activation rides server config" (e.g., staged rollout the *server* controls), the cleaner spot is a new top-level field on `Entitlements` (e.g. `activations?: Partial<Record<FeatureKey, boolean>>`, parallel to `overrides`) consumed in `useEntitlement`'s memo — but that is server-controlled, not "user-controlled," so it does not satisfy the stated requirement. For genuine **user**-controlled activation, the separate local context is the correct seam.

**Concrete touch-list for the separate-context approach:** new `src/main/feature-activation.ts` (store+IPC) · 3 channels in `src/shared/ipc.ts` + `DesktopApi.featureActivation` · bridge block in `src/preload.ts` (clone of `:185-195`) · new `src/renderer/contexts/FeatureActivationContext.tsx` (clone of EntitlementsContext subscribe pattern) · new `src/renderer/hooks/useFeatureVisible.ts` · mount provider beside `EntitlementsProvider` in `App.tsx`. Zero changes to `shared/entitlements.ts` or the server contract.