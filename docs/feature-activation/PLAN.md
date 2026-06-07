Every seam is verified exactly as the maps described. I have the complete `App.tsx` provider tree, the IPC patterns, the local-db FIFO pattern, the Settings tab machinery, the test folder layout, and the i18n shape. I noticed two important codebase facts the maps did not surface: (1) `feature_keys.json` + `scripts/emit-feature-keys.mjs` is an export pipeline I must respect if touching `entitlements.ts` (the plan deliberately won't), and (2) the existing `EntitlementsContext.test.tsx` and `automation.locked.test.tsx` give me precedent patterns for the test plan.

I have everything needed. Writing the final plan now.

---

# KDPBook Desktop — User-Controlled Feature-Activation / Progressive-Disclosure Layer

**Implementation plan, file-level.** Target repo: `/Users/yulii/KDP-business/ads-tracker-desktop` (Electron 41, React 18, v3.5.0). All five maps verified against source on 2026-06-07; every cited line/file confirmed accurate.

**One-line thesis:** add a **second, local-only, user-owned visibility axis** ("activation") orthogonal to the existing server-issued **entitlement** axis, resolved as `visible = core OR (entitled AND activated)`, persisted in `local-db`, exposed through one typed IPC surface mirroring the `telemetry`/`entitlements` recipe, consumed by a new `FeatureActivationContext`, surfaced as a new **Modules** Settings tab + made discoverable in the sidebar/CommandPalette/empty-states, and instrumented through the existing consent-gated `track()` seam plus a local activation-history log. **Zero changes to `src/shared/entitlements.ts`, zero backend changes, zero security-baseline changes.**

---

## 1. THE MODEL — activatable-module taxonomy

### 1.1 Design rules (from Research F + G)

- **Default-minimal is the only defensible choice** for a 21-page, 5-module app (Research F §2 verdict; NN/g frequency rule). Brand-new users see a small Starter surface; everything else is visible-but-available, never absent.
- **The unit of activation is a *module* (a sidebar group / coherent capability), not an individual `FeatureKey`.** This keeps the toggle list to ~9 items (NN/g 2-level law, Research F R10), maps cleanly onto the existing sidebar sections, and avoids a 21-row wall. Module → `ViewId[]` is the binding; `FeatureKey` stays purely the entitlement axis (Research G A.1: three orthogonal systems).
- **New optional modules ship OFF** (Research G A.4) so every activation is a clean demand signal for the telemetry (§6). The one exception class (no-side-effect upgrade of an already-used surface) does not occur in this taxonomy.
- **Royalty/PII never leaves the machine** — activation state is local-only, same locality as royalty data (Research G A.3, root CLAUDE.md ToS rule).

### 1.2 The taxonomy

`ModuleId` is a new union. Each module lists its member `ViewId`s (the sidebar rows it shows/hides) and the `FeatureKey`s those views gate (for the catalog's paid-lock badge — read-only cross-reference, not a new binding).

| ModuleId | Group | Member ViewId(s) | Related FeatureKey(s) (badge only) | Core? | Default-ON (Starter)? | Justification |
|---|---|---|---|---|---|---|
| `core` | **Core** | `dashboard`, `books`, `campaigns`, `settings`, `profile`, `campaign_details` | — | **YES (never hideable)** | always | Map A + root CLAUDE.md: Dashboard/Books/Campaigns/Settings are the spine; `profile`/`campaign_details` are already non-sidebar routable targets — must stay reachable. NN/g: surface what's *frequently* needed. |
| `ads_core` | Ads | `search_terms`, `negatives` | — | no | **YES** | Research F R1: enable the core job-to-be-done (the bid→result loop). Search-terms + negatives are the daily Ads workflow on top of Campaigns. |
| `ads_advanced` | Ads | `automation`, `operations` | `automation.rules` (business) | no | no | Per-module simple↔advanced split (Research F R4). Rules/bulk ops are the "advanced" Ads tier. |
| `analytics` | Analytics | `reports`, `comparison` | `analytics.*` (component-level) | no | no | Read-results depth; opt-in once user wants more than the Dashboard. |
| `alerts` | Analytics | `alerts` | — | no | no | Monitoring is a deliberate add-on, not a day-1 need. |
| `ai` | AI | `listing_studio`, `briefing`, `research` | `ai.title_generator`, `ai.weekly_briefing`, `ai.niche_explorer` (pro) | no | no | Research F R8: AI is where overwhelm + distrust peak — keep off by default, reveal via JIT. (`sections.ai` already renders via `defaultValue` fallback — Map A.) |
| `finance` | Publishing | `royalties`, `pnl`, `accounting` | `royalties.advanced_breakdown` (pro, sub-section) | no | **YES (royalties only — see note)** | Royalty is the moat + the reason the desktop exists (root CLAUDE.md). **Decision D1 below**: ship `royalties` visible by default, `pnl`/`accounting` behind the module. Splitting requires either two modules or a finer grain — see Open Decision D1. |
| `marketplace` | Marketplace | (none today — `keywords` is core-adjacent) | `marketplace.multi`, `ai.reverse_asin` (component-level) | no | no | No dedicated page yet (Map B: marketplace keys are component-level only). Reserved module slot; renders nothing in nav until a page exists, but appears in the catalog as "coming soon"/empty. **Or fold into a future page — Open Decision D2.** |

**Notes / resolved choices:**
- `keywords` is assigned to **`core`** (not Marketplace). Rationale: it has no full-page entitlement gate (Map B: only a `reverse_asin` *panel* inside it is gated), it is a primary Ads research surface used from day one, and the founder's "simple starting point" needs keyword visibility. Keeping it core avoids hiding a high-frequency page.
- **Starter default-ON set** = `core` + `ads_core` + `finance(royalties)`. That is: Dashboard, Books, Campaigns, Keywords, Search terms, Negatives, Royalty, Settings — a coherent "run my ads + see my true royalty" surface (~8 rows vs 20). This is the simple starting point.
- **`marketplace` has no live page**, so it is a catalog-only entry with a "coming soon" state — it demonstrates the new-module mechanism (§3) without shipping a dead nav row.

### 1.3 The registry (single source of truth)

A new `src/shared/modules.ts` declares the taxonomy as data (the *only* new shared file; it does **not** touch `entitlements.ts`, so the `feature_keys.json` export pipeline at `scripts/emit-feature-keys.mjs` is unaffected):

```ts
// src/shared/modules.ts
import type { ViewId } from '...'; // NB: ViewId lives in renderer/contexts/NavContext.tsx
import type { FeatureKey } from './entitlements';

export type ModuleId =
  | 'core' | 'ads_core' | 'ads_advanced' | 'analytics'
  | 'alerts' | 'ai' | 'finance' | 'marketplace';

export type ModuleGroup = 'core' | 'ads' | 'analytics' | 'ai' | 'publishing' | 'marketplace';

export interface ModuleSpec {
  id: ModuleId;
  group: ModuleGroup;
  views: ViewId[];            // sidebar rows this module controls
  relatedFeatures: FeatureKey[]; // for the paid-lock badge cross-ref (read-only)
  core: boolean;             // true → never hideable, never in toggle list
  defaultOn: boolean;        // Starter set membership for brand-new users
  comingSoon?: boolean;      // catalog entry with no live page yet (marketplace)
}

export const MODULES: readonly ModuleSpec[] = [ /* the 8 rows above */ ];

// Derived helpers (pure, used by both processes):
export const ALL_MODULE_IDS: readonly ModuleId[];
export const DEFAULT_ACTIVE_MODULES: readonly ModuleId[]; // defaultOn===true
export function moduleForView(v: ViewId): ModuleSpec | undefined; // view → owning module
export function isViewCore(v: ViewId): boolean; // moduleForView(v)?.core === true
```

> **ViewId import caveat (verified):** `ViewId` is currently defined in `src/renderer/contexts/NavContext.tsx`, not in `src/shared`. To reference it from a shared file without import cycles, the cleanest move is to **extract the `ViewId` union into `src/shared/views.ts`** and re-export it from `NavContext.tsx` (one-line `export type { ViewId } from '../../shared/views'`). This is a tiny, safe refactor and is listed in the file-change list (§7). It keeps `modules.ts` in `shared/` so main can validate payloads against the registry.

---

## 2. TWO-AXIS RESOLUTION

### 2.1 The four-state resolver (Research G A.2 single-abstraction rule)

The composed status, computed per `ViewId`:

```
resolveNav(viewId):
  module = moduleForView(viewId)
  if module.core            → 'core'        // always visible, no badge logic beyond existing entitlement badge
  entitled = entitlement-on for the view's gating FeatureKey(s) (if any; views with no key are "entitled by default")
  activated = activation-state[module.id]
  if !entitled && !activated → 'locked'      // discoverable in catalog as upgrade; sidebar: see policy below
  if !entitled &&  activated → 'locked'      // user wants it but plan doesn't grant → upsell, not blank
  if  entitled && !activated → 'available'    // show "Enable" affordance in catalog; HIDDEN from sidebar
  if  entitled &&  activated → 'visible'      // render the nav row live
```

Note resolution order matches Research G A.2 (`entitlement → activation`), with `core` short-circuiting first.

### 2.2 Behavior matrix (the precise rule for each case)

| Case | Sidebar (MainLayout) | CommandPalette | Catalog (Modules tab) | Page body if navigated to directly (deep-link/hotkey) |
|---|---|---|---|---|
| **core** | always rendered (existing entitlement badge still applies, e.g. none for these) | always present | shown as "Always on", toggle disabled | renders normally |
| **entitled + activated** (`visible`) | rendered | present | toggle ON | renders normally |
| **entitled + not-activated** (`available`) | **hidden** | present, labeled **"Enable <module>…"** (one-click activate, then navigate) | toggle OFF, "Enable" CTA, recommended-hint if in Starter | **renders normally** (routability decoupled from sidebar — precedent: `profile`/`campaign_details`) |
| **not-entitled** (`locked`, regardless of activation) | **hidden from sidebar** (avoids the double-blind, Research F pitfall #4) BUT surfaced via catalog + palette | present, labeled **"Unlock <module> with Pro/Business"** → opens existing `UpgradeModal` | shown with **paid-lock badge** (reuse `LockedFeatureCard` amber=Pro/purple=Business), "See what's in Pro" → `UpgradeModal` | renders the page's **own** existing `LockedFeatureCard` upsell (unchanged — Map B) |

**Key decisions, justified:**

1. **Not-entitled → show in catalog as locked, hide from sidebar.** Research F pitfall #4 (double-blind): a feature that is both advanced *and* paid must not resolve to invisible. The **catalog page is the discovery surface** that shows locked features with an upgrade CTA; the **sidebar stays clean**. This is "preview, don't hide" (Research F R7) relocated to the right surface — the sidebar is the *frequent-use* surface (must stay minimal), the catalog is the *discovery* surface.

2. **Routability is preserved for hidden views** (the `switch` in `MainLayout.tsx:261-306` keeps all cases). Hiding affects only the two *visible* lists (sidebar render loop + palette nav entries) and the hotkey map. A deep-link or drill-down (`navigate('campaign_details', …)`) still renders. This mirrors the existing `profile`/`campaign_details` precedent exactly (Map A §5).

3. **Hotkeys for hidden modules:** the `G`-prefix hotkey for a non-visible view is **gated** (no-op + optional toast "Module X is off — enable in Settings"). Rationale: a power user who memorized `G U` shouldn't silently land on a page they hid; but we also don't want the hotkey to be a hidden bypass that desyncs from the sidebar. **Decision: gate the hotkey, show a one-line toast pointing to the catalog** (discoverability, Research F pitfall #1).

4. **`available` (entitled but off) is the inviting "Enable" state, never a paywall** (Research G A.2). The palette entry and the catalog both offer one-click enable.

---

## 3. DATA + PERSISTENCE

### 3.1 Activation-state shape (in `LocalDbState`)

Following the verified `telemetry_consent` pattern (additive optional field, no `SCHEMA_VERSION` bump) and the `weekly_briefings` FIFO precedent. Added to `src/main/local-db/index.ts`:

```ts
// in LocalDbState (after telemetry_consent, ~index.ts:213)
export interface ModuleActivationRow {
  enabled: boolean;
  activatedAt: string | null;   // ISO; raw material for time-to-activate (telemetry §6)
  source: 'default' | 'user' | 'enable_all' | 'reset'; // distinguishes deliberate vs bulk
}
// ...
  // Phase R — user-controlled module activation (progressive disclosure).
  // Local-only, second axis on top of server entitlements. Survives logout
  // (user preference, not a session artifact). Default: Starter set on,
  // rest off.
  module_activation?: Record<string, ModuleActivationRow>; // keyed by ModuleId
  // Set of ModuleIds the user has already "seen" — drives the "new module"
  // badge on next ship (migration §3.3). Defaults to all-known on first write.
  modules_seen?: string[];
  // Phase R — local activation-history log (telemetry path (c), §6). Bounded.
  activation_events?: ActivationEventRow[];
  next_activation_seq?: number; // monotonic per-user "order" counter

export interface ActivationEventRow {
  seq: number;                 // monotonic — the ORDER signal
  module: string;              // ModuleId, from a fixed allowlist
  action: 'enable' | 'disable';
  source: ModuleActivationRow['source'];
  ts: number;                  // epoch ms
  entitled: boolean;           // was the plan granting it at the moment of activation
}

export const ACTIVATION_HISTORY_CAP = 200; // FIFO, mirrors BRIEFING_HISTORY_CAP
```

### 3.2 Defaults

Defaulted in **both** places, per the verified two-site convention:
- `freshEmptyState()` (`index.ts:230`): seed `module_activation` from `DEFAULT_ACTIVE_MODULES` (Starter set → `{enabled:true, activatedAt:null, source:'default'}`; all others → `{enabled:false,…}`), `modules_seen` = `ALL_MODULE_IDS` (a fresh install has "seen" everything — no new-badges on day one), `activation_events: []`, `next_activation_seq: 1`.
- `normaliseState()` (`index.ts:620-634`): coerce on read. For each `ModuleId` in `ALL_MODULE_IDS`, if absent from the parsed map, insert the registry default (this is *also* the migration hook — §3.3). Validate `source` against the enum; clamp `activation_events` to the last `ACTIVATION_HISTORY_CAP`.

### 3.3 Migration when NEW modules ship later (Research G A.4 mechanism)

The mechanism runs inside `normaliseState()` on every read (so it fires on the first launch after an update that adds a `ModuleId` to the registry):

```
for each m in ALL_MODULE_IDS:
  if !(m in module_activation):
    module_activation[m] = { enabled: registry(m).defaultOn ?? false, activatedAt: null, source: 'default' }
newModules = ALL_MODULE_IDS − modules_seen
// newModules drives the "new" badge in the UI; they are persisted off-by-default already.
// modules_seen is NOT updated here — the renderer updates it via an IPC call when the
// user opens the Modules tab (so the badge persists until actually seen). See §4.
```

- **New optional modules default OFF** (Research G A.4 decisive argument: keeps adoption signal clean).
- **The "new" badge** = membership in `ALL_MODULE_IDS − modules_seen`. The renderer reads this, renders a `Badge variant="info"` "New" on those rows, and calls `featureActivation.markSeen()` (new IPC) when the Modules tab mounts, which sets `modules_seen = ALL_MODULE_IDS`. This is the "default off + new badge" the prompt asks for, with an explicit persisted seen-set so the badge survives restarts until the user actually looks.
- No `SCHEMA_VERSION` bump needed (additive optional fields, proven by `telemetry_consent`).

---

## 4. IPC + STATE

### 4.1 New typed IPC channels (exact repo recipe — Map C verified)

Following the 4-file lockstep (`shared/ipc.ts` → `main/ipc-handlers.ts` → `preload.ts` → renderer), modeled on the `telemetry` + `autoNeg` (push) surfaces.

**Step 1 — `src/shared/ipc.ts`** (add to `IpcChannel`, after `TelemetrySetConsent` ~line 136):
```ts
  // Phase R — user-controlled module activation (progressive disclosure).
  // Local-only second axis on top of entitlements. get/set + push-on-change.
  FeatureActivationGet: 'featureActivation:get',
  FeatureActivationSet: 'featureActivation:set',
  FeatureActivationMarkSeen: 'featureActivation:markSeen',
  FeatureActivationReset: 'featureActivation:reset',
  FeatureActivationChanged: 'featureActivation:changed', // main → renderer push
```
Add the payload type + `DesktopApi.featureActivation` surface (after `telemetry`, ~line 1012). Type lives here (shared contract):
```ts
export interface ModuleActivationState {
  modules: Record<string, { enabled: boolean; activatedAt: string | null; source: string }>;
  newModuleIds: string[]; // ALL − seen, for the "new" badge
}
// in DesktopApi:
  featureActivation: {
    get(): Promise<ModuleActivationState>;
    set(moduleId: string, enabled: boolean, source?: string): Promise<ModuleActivationState>;
    markSeen(): Promise<void>;
    reset(): Promise<ModuleActivationState>;             // restore Starter defaults
    onChange(handler: (s: ModuleActivationState) => void): () => void;
  };
```

**Step 2 — `src/main/ipc-handlers.ts`** (register in `registerIpcHandlers()`, with mandatory arg validation, mirroring `TelemetrySetConsent` at `:1421-1432` and `AutoNegToggle`). Delegates to a new module-singleton store (§4.2). Each setter validates `moduleId ∈ ALL_MODULE_IDS`, rejects core modules (`if (registry.core) throw`), narrows `enabled`/`source`, then mutates local-db + appends an `ActivationEventRow` + calls `track()` (§6) + broadcasts `FeatureActivationChanged`.

**Step 3 — `src/preload.ts`** (clone of the `entitlements`/`autoNeg` blocks at `:185-215`, with the `onChange` unsub pattern). Pure `ipcRenderer.invoke` pass-throughs + one `ipcRenderer.on/off` for the push channel. `const api: DesktopApi` annotation forces lockstep (compile error if a method is missing).

### 4.2 New main store: `src/main/feature-activation.ts`

Mirrors `src/main/entitlements.ts` **minus the network** (Map B recommendation). Module-singleton with: in-memory current state, `subscribers[]` + per-window broadcast (`win.webContents.send(IpcChannel.FeatureActivationChanged, state)` — exact clone of `entitlements.ts:199`), `get()`/`setModule()`/`markSeen()`/`reset()` reading/writing via `localStore.mutate(...)`. **No refresh timer, no fail-closed, no logout-wipe** (activation is sticky and survives logout — Research G A.3). On `setModule`, it: writes activation, appends the history event (FIFO-capped), emits the telemetry event, then notifies.

### 4.3 Renderer context: **new `FeatureActivationContext`** (recommended over extending EntitlementsContext)

**Recommendation: a separate `src/renderer/contexts/FeatureActivationContext.tsx`** (clone of `EntitlementsContext.tsx`'s get-then-subscribe pattern at `:54-82`), **not** an extension of `EntitlementsContext`. Justification (Map B §5 + Research G A.1, both independently reach this):

1. **Different lifecycle/owner.** Entitlements are server-issued, signed, fail-closed, refreshed every 30 min, and **wiped on logout** (`entitlements.ts:290`). Activation is user-owned, local, sticky, never expires, **survives logout**. Folding activation into the entitlements snapshot would force it to inherit expiry/refresh/HMAC/logout-wipe semantics — all wrong, and `clearOnLogout` would erase user preferences.
2. **The `Entitlements` schema is `v:1` and HMAC-signed** by the backend; widening it breaks the `sig` contract and the `feature_keys.json` export pipeline.
3. **Clean composition.** Keep `useEntitlement` and its 15 call sites untouched. Add a thin composed hook:

```ts
// src/renderer/hooks/useModuleActivation.ts  (context consumer)
export function useModuleActivation(): {
  isModuleActive(id: ModuleId): boolean;
  isViewVisible(v: ViewId): boolean;   // core OR (entitled AND activated)
  setModuleActive(id: ModuleId, on: boolean, source?: string): Promise<void>;
  state: ModuleActivationState;
  newModuleIds: ModuleId[];
};
```
`isViewVisible` internally combines `moduleForView(v)` + the activation state + (for the entitlement half) reads `useEntitlements().isOn(key)` for the view's gating key. This is the single resolver from §2.1.

**Provider placement:** mount `<FeatureActivationProvider>` in `App.tsx` **directly inside `<EntitlementsProvider>`** (verified tree at `App.tsx:74-88`), so `useModuleActivation` can read entitlements for the combined resolver. Both are below `AuthProvider`.

### 4.4 How nav + CommandPalette consume it (the two seams — Map A verified)

**Seam 1 — sidebar (`MainLayout.tsx`).** Filter each config array *before* `.map(renderNavItem)` (the verified insertion points at lines 369/374/379/384). Inside `Layout`, call `const { isViewVisible } = useModuleActivation();` once, then:
```tsx
{mainNav.filter(i => isViewVisible(i.id)).map(renderNavItem)}
{actionsNav.filter(i => isViewVisible(i.id)).map(renderNavItem)}
{aiNav.filter(i => isViewVisible(i.id)).map(renderNavItem)}
{financeNav.filter(i => isViewVisible(i.id)).map(renderNavItem)}
```
Section headers should hide when their group is fully empty (wrap each header+map in `{group.some(isViewVisible) && (<>…</>)}`). `bottomNav` (Settings) is core → never filtered. `NavItemRow`'s existing `useEntitlement` badge logic stays exactly as-is (entitlement axis untouched).

**Hotkey gate** (`MainLayout.tsx:247-249`): before `navigate(HOTKEY_MAP[key])`, check `isViewVisible(target)`; if false, show a toast and `return` (don't navigate). (Hook the toast via the existing `useToast`.)

**Seam 2 — CommandPalette (`CommandPalette.tsx:93-207`).** This list is independent and must apply the same resolver, **but with richer behavior** (Research F R3 — the palette is the universal discovery layer): unlike the sidebar, the palette **keeps locked/available entries visible** with action-relabeling:
- `visible`/`core` → normal `goto(id)`.
- `available` (entitled, off) → label "Enable <module>…", `onRun` calls `setModuleActive(module, true, 'command_palette')` then `goto(id)`.
- `locked` (not entitled) → label "Unlock with Pro/Business", `onRun` opens `UpgradeModal`.

This makes the palette the "find what's off" surface while the sidebar stays minimal — the highest-ROI discoverability fix (Research F build-priority #1).

---

## 5. UI — Settings surface + progressive-disclosure entry points

### 5.1 New **Modules** tab (Map C + E recipe, verified)

Add a new Settings tab `modules` (Research F R2 — the catalog *is* the control center). Five exact edits per Map C §1:
1. `SettingsTabs.tsx:17-28` — add `'modules'` to `SettingsTabId`.
2. `SettingsTabs.tsx:35-47` — add `{ id: 'modules', icon: LayoutGrid }` (import `LayoutGrid` from lucide-react). **Place it first or second** (it's the progressive-disclosure home).
3. `SettingsPage.tsx:21-33` — add `'modules'` to `VALID_TABS`.
4. `SettingsPage.tsx:4-18, 85-95` — import + render `{activeTab === 'modules' && <ModulesTab />}`.
5. i18n `tabs.modules` key (§5.4).

### 5.2 `ModulesTab` component design (`src/renderer/components/settings/ModulesTab.tsx`)

Layout = verified settings convention: `<div className="space-y-6">` of `Card`s, **one Card per `ModuleGroup`** (Core, Ads, Analytics, AI, Publishing, Marketplace), body `<div className="px-5 py-5 space-y-4">`. Each toggle row:
- Reuses the **extracted `Switch`** primitive (see §7 — lift `UpdateChecker.tsx:20-49` into `ui/Switch.tsx`).
- `text-xs font-medium text-zinc-900` label + `text-[11px] text-zinc-500` hint (Map E `PrivacyTab` pattern).
- Leading icon tinted with the module color (`text-module-ads`/`-analytics`/`-ai`/`-publishing`/`-marketplace`; Map E §3 — color on icon only, never chrome).
- **Paid-lock badge:** for a module whose `relatedFeatures` are not entitled, show the amber-Pro/purple-Business badge (reuse the `useEntitlement` + `LockedFeatureCard` convention from Map B) and replace the Switch with a "See what's in Pro" button → `UpgradeModal`. (You cannot activate a locked module — Research G A.5: enable-all respects entitlements.)
- **Recommended hint:** Starter-set modules show a small "Recommended" `Badge variant="success"`.
- **"New" badge:** modules in `newModuleIds` show `Badge variant="info"` "New".
- **Core group:** rendered with toggles **disabled + checked** and an "Always on" caption (so users see the spine but can't break it).

**Header controls** (in the tab's top `Card` `rightSlot` or a toolbar row): a **search `Input`** (compose `Input` + `Search` icon — Map E: no SearchInput primitive), **"Enable all"** button (activates only entitled non-core modules, tags `source:'enable_all'` — Research G A.5), and **"Reset to recommended"** button (restores Starter set, tags `source:'reset'`, confirm via `Modal`). Search filters rows by translated label/hint substring (the VS Code `@modified`-spirit "what's on" view, Research F pitfall #3).

### 5.3 Progressive-disclosure entry points (so hidden features stay findable — Research F §3)

1. **Onboarding default set** = the Starter activation seeded in `freshEmptyState()` (§3.2). New users land on a small, coherent surface (R1).
2. **CommandPalette** indexes everything incl. off/locked with Enable/Unlock affordances (§4.4 seam 2) — the universal discovery layer (R3).
3. **"Discover more features" nudge / empty-state CTA:** add a small dismissible affordance at the bottom of the sidebar nav (under `financeNav`, above the Settings footer) — a `text-xs` button "＋ More features" that does `navigate('settings')` and sets the hash to `#settings/modules`. This is the always-present "information scent" that hidden modules exist (R1, NN/g scent). Reuse the existing hash-deep-link mechanism (`SettingsPage` already reads `#settings/<tab>` at `:35-48`).
4. **Empty-state on the catalog** when a group is collapsed/all-off: a positive-framing line + the Enable CTA (Research F R6).

### 5.4 i18n keys (Map E recipe — reuse `settings` namespace; verified shape)

Add a `modules` object to `src/renderer/i18n/resources/en/settings.json` (top-level `tabs.modules` for the tab label + a `modules.*` block for the body) and mirror in `ru/settings.json`. **Flag (Map E critical gotcha, verified):** `ru` is dead at runtime today (`i18n/index.ts` hardcodes `lng:'en'`, imports only `en/*`, `ru/settings.json` is 3 bytes `{}`, no language switcher). Authoring `ru` is harmless and keeps convention parity, but it will not render until `ru` is wired into `index.ts` + a switcher added. **Authoring both is required by the prompt; rendering `ru` is out of scope of this feature.**

Representative keys (en → ru):
```jsonc
"tabs": { "modules": "Modules" /* "Модули" */ },
"modules": {
  "title": "Modules & features",            // "Модули и функции"
  "subtitle": "Turn optional modules on as you need them. Core modules are always on.",
  "search": "Search modules…",               // "Поиск модулей…"
  "enableAll": "Enable all",                  // "Включить все"
  "resetRecommended": "Reset to recommended", // "Сбросить к рекомендуемому"
  "alwaysOn": "Always on",                    // "Всегда включено"
  "recommended": "Recommended",               // "Рекомендуется"
  "new": "New",                               // "Новое"
  "comingSoon": "Coming soon",                // "Скоро"
  "lockedHint": "Available on {{tier}}",      // "Доступно на тарифе {{tier}}"
  "seePro": "See what's in Pro",              // "Что входит в Pro"
  "discoverMore": "More features",            // "Больше функций"
  "groups": { "core": "Core", "ads": "Ads", "analytics": "Analytics",
              "ai": "AI", "publishing": "Publishing", "marketplace": "Marketplace" },
  "items": {
    "ads_core":     { "label": "Search terms & negatives", "hint": "The daily Ads workflow on top of campaigns." },
    "ads_advanced": { "label": "Automation & operations",  "hint": "Bid rules and bulk operations (Business)." },
    "analytics":    { "label": "Reports & comparison",     "hint": "Deeper analysis beyond the dashboard." },
    "alerts":       { "label": "Monitoring",               "hint": "Alerts on metric changes." },
    "ai":           { "label": "AI assistant",             "hint": "Listing studio, briefing, niche research (Pro)." },
    "finance":      { "label": "P&L & accounting",         "hint": "Profit/loss and bookkeeping on top of royalty." },
    "marketplace":  { "label": "Marketplace research",     "hint": "Reverse-ASIN & multi-marketplace (coming soon)." }
  }
}
```
Dynamic-key access uses the verified cast escape hatch: `t(\`modules.items.${id}.label\` as 'modules.items.ai.label')`.

---

## 6. TELEMETRY

### 6.1 Recommendation: do (a) + (c) now, defer (b) (Map D verdict)

- **(a)** Emit via the existing `track()` seam at every activate/deactivate (defines the canonical taxonomy + puts call sites in once; flipping to real transport later is a single-module change). **Also fix the verified boot-hydration gap:** call `init(persistedConsent)` from `src/index.ts` startup and `setUser(id)`/`clearUser()` from the auth handlers (Map D §2/§3 — currently `init` is never called, so the in-memory gate is stale; harmless while transport is a no-op but must be fixed before transport lands).
- **(c)** The **local `activation_events` log** (§3.1) is the cheapest way to actually *see activation order today, including in packaged builds* where `track()` is a no-op (Map D §4(a) cons). Surfaced read-only in the **Privacy tab** as an "Activation history" list (the existing transparency home) — doubles as a user-facing transparency feature, no consent needed (it's the user's own local data).
- **(b)** Backend `/api/events` is the only cross-user-aggregation path but is a **separate task in `Juli374/ads-tracker`** (root CLAUDE.md rule #1: no backend changes from this repo) and must be account-scoped. When built, `track()`'s packaged branch routes through the existing `performApiRequest` seam (`api-client.ts:363`) — no new renderer HTTP path. **Note the minimal real path** explicitly so the founder can green-light it: add a Flask `POST /api/events` (account-scoped), flip `telemetry.ts`'s `app.isPackaged` branch from no-op to `performApiRequest({method:'POST', path:'/api/events', body:{name, props}})`. That is the entire transport flip.

### 6.2 Event taxonomy (Map D taxonomy + Research G B.3 — PII-free, conforms to `TelemetryEvent`)

All names dotted/lowercase; all props bounded scalars from a fixed allowlist; **never** titles/ASINs/keywords/emails/tokens/royalty.

```ts
// emitted in feature-activation.ts setModule() and reset()
track({ name: 'feature.activation.enable', props: {
  module,            // ModuleId enum (fixed allowlist)
  source,            // 'user' | 'enable_all' | 'command_palette' | 'reset'
  seq,               // monotonic activation_index — THE ORDER SIGNAL (from next_activation_seq)
  entitled,          // boolean: plan granted it at activation moment
  ts,                // epoch ms
}});
track({ name: 'feature.activation.disable', props: { module, source, seq, ts }});
track({ name: 'feature.activation.reset',   props: { count_active_before, ts }});
track({ name: 'feature.activation.enable_all', props: {
  count_newly_activated, count_already_on, count_locked, ts }});
// optional, from the catalog when a locked row is shown / its CTA clicked:
track({ name: 'feature.locked.viewed',  props: { module, tier, ts }}); // tier = 'pro' | 'business'
track({ name: 'feature.upsell.clicked', props: { module, tier, ts }});
```

**Order reconstruction:** `module` + `seq` (with `ts` tiebreak) replays the exact enable sequence per user — readable from the local `activation_events` log today (path c), in dev `console.debug` (path a), aggregating server-side once (b) lands. `seq` is sourced from the persisted `next_activation_seq` counter so it is stable across restarts (Research G B.3). The metrics this unlocks (activation rate, time-to-activate, the **activation × used-retained "uselessness" quadrant**, the **activation-order path**) are exactly the founder's "what users need / what is useless" question (Research G B.4).

### 6.3 Where developers see the data

- **Today:** Privacy-tab "Activation history" list (path c) + dev `console.debug` (path a).
- **Real cross-user:** the §6.1(b) minimal path — one Flask route + one `track()` branch flip. (Research G B.2 recommends PostHog EU Cloud + `before_send` allowlist + main-process choke point when that day comes; out of scope here but noted as the documented target.)

---

## 7. FILE-LEVEL CHANGE LIST (ordered)

### ADD (7 files)
1. **`src/shared/views.ts`** — extract the `ViewId` union here (moved from NavContext) so `shared/modules.ts` can import it without a renderer→shared cycle. ~2 lines + the union.
2. **`src/shared/modules.ts`** — the `ModuleId`/`ModuleSpec` taxonomy + `MODULES` registry + pure helpers (`moduleForView`, `isViewCore`, `DEFAULT_ACTIVE_MODULES`, `ALL_MODULE_IDS`). Single source of truth (§1.3). Does **not** import/modify `entitlements.ts`.
3. **`src/main/feature-activation.ts`** — main-process module-singleton store + per-window push, backed by `localStore`; emits telemetry + history on change (§4.2). Clone of `entitlements.ts` minus network.
4. **`src/renderer/contexts/FeatureActivationContext.tsx`** — provider: get-then-subscribe (clone of `EntitlementsContext.tsx:54-82`); exposes raw state + `setModule`/`reset`/`markSeen` (§4.3).
5. **`src/renderer/hooks/useModuleActivation.ts`** — the composed resolver hook (`isViewVisible` = core OR entitled-AND-activated), reads both contexts (§4.3).
6. **`src/renderer/components/ui/Switch.tsx`** — extracted iOS-switch primitive (lift `UpdateChecker.tsx:20-49`); export from `ui/index.ts`. The missing primitive the toggle-heavy tab needs (Map E §1 recommendation).
7. **`src/renderer/components/settings/ModulesTab.tsx`** — the catalog UI: grouped `Card`s of `Switch` rows, search, enable-all, reset, paid-lock/recommended/new badges, coming-soon (§5.2).

### EDIT (12 files)
8. **`src/renderer/contexts/NavContext.tsx`** — re-export `ViewId` from `shared/views` (`export type { ViewId } from '../../shared/views'`); remove the inline union. Keep everything else.
9. **`src/main/local-db/index.ts`** — add `module_activation`/`modules_seen`/`activation_events`/`next_activation_seq` + `ModuleActivationRow`/`ActivationEventRow`/`ACTIVATION_HISTORY_CAP`; default in `freshEmptyState()` + `normaliseState()` incl. the new-module migration loop (§3).
10. **`src/shared/ipc.ts`** — 5 channel consts + `ModuleActivationState` type + `DesktopApi.featureActivation` surface (§4.1).
11. **`src/main/ipc-handlers.ts`** — register the 4 handlers + 1 push, with arg validation + core-module rejection; wire telemetry + history append (§4.1 step 2).
12. **`src/preload.ts`** — `featureActivation` bridge block (clone of `entitlements`/`autoNeg` at `:185-215`) (§4.1 step 3).
13. **`src/renderer/App.tsx`** — mount `<FeatureActivationProvider>` directly inside `<EntitlementsProvider>` (verified tree at `:74-88`).
14. **`src/renderer/components/MainLayout.tsx`** — call `useModuleActivation()`; `.filter(isViewVisible)` before each of the 4 `.map(renderNavItem)` (lines 369/374/379/384); hide empty section headers; gate the hotkey at `:247-249` with a toast; add the "More features" sidebar nudge (§4.4, §5.3).
15. **`src/renderer/components/CommandPalette.tsx`** — apply the resolver to the `go-*` nav entries (`:95-136`); relabel `available`→"Enable…"(+activate) and `locked`→"Unlock…"(+`UpgradeModal`) instead of hiding (§4.4 seam 2).
16. **`src/renderer/components/settings/SettingsTabs.tsx`** — add `'modules'` to union + `TABS` (icon `LayoutGrid`) (§5.1).
17. **`src/renderer/pages/SettingsPage.tsx`** — add `'modules'` to `VALID_TABS` + import/render `ModulesTab` (§5.1).
18. **`src/renderer/components/settings/PrivacyTab.tsx`** — add read-only "Activation history" `Card` (renders `activation_events` from a new `featureActivation` read or a small dedicated getter) (§6.3).
19. **`src/main/telemetry.ts`** *(no signature change)* + **`src/index.ts`** + auth handlers — call `init(persistedConsent)` on boot and `setUser/clearUser` on login/logout to fix the verified hydration gap (§6.1). (`telemetry.ts` itself unchanged; only its callers.)
20. **i18n:** `src/renderer/i18n/resources/en/settings.json` (+ `ru/settings.json`) — `tabs.modules` + `modules.*` block; plus `nav` namespace key for the "More features" nudge + the hotkey-gated toast string (§5.4).

### Code sketches for the trickiest 4 files

**(a) `src/main/feature-activation.ts`** (the new store + push — security baseline: main-only, validated):
```ts
import { BrowserWindow } from 'electron';
import { localStore, ACTIVATION_HISTORY_CAP } from './local-db';
import { IpcChannel, ModuleActivationState } from '../shared/ipc';
import { MODULES, ALL_MODULE_IDS, ModuleId } from '../shared/modules';
import { track } from './telemetry';

function buildState(): ModuleActivationState {
  const s = localStore.read();
  const modules = s.module_activation ?? {};
  const seen = new Set(s.modules_seen ?? ALL_MODULE_IDS);
  return {
    modules: Object.fromEntries(ALL_MODULE_IDS.map(id => [id, modules[id] ?? { enabled: false, activatedAt: null, source: 'default' }])),
    newModuleIds: ALL_MODULE_IDS.filter(id => !seen.has(id)),
  };
}

function broadcast(state: ModuleActivationState): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannel.FeatureActivationChanged, state); // mirrors entitlements.ts:199
  }
}

export function getActivation(): ModuleActivationState { return buildState(); }

export function setModule(moduleId: string, enabled: boolean, source = 'user'): ModuleActivationState {
  const spec = MODULES.find(m => m.id === moduleId);
  if (!spec) throw new Error(`unknown module: ${moduleId}`);
  if (spec.core) throw new Error(`core module ${moduleId} cannot be toggled`);
  let seq = 0;
  localStore.mutate((st) => {
    st.module_activation = st.module_activation ?? {};
    st.module_activation[moduleId] = {
      enabled, activatedAt: enabled ? new Date().toISOString() : null,
      source: source as never,
    };
    seq = st.next_activation_seq ?? 1;
    st.next_activation_seq = seq + 1;
    st.activation_events = [
      ...(st.activation_events ?? []),
      { seq, module: moduleId, action: enabled ? 'enable' : 'disable', source: source as never, ts: Date.now(), entitled: enabled /* refined by caller via entitlement check if needed */ },
    ].slice(-ACTIVATION_HISTORY_CAP);
  });
  track({ name: enabled ? 'feature.activation.enable' : 'feature.activation.disable',
          props: { module: moduleId, source, seq, ts: Date.now() } });
  const state = buildState();
  broadcast(state);
  return state;
}
```

**(b) `src/renderer/hooks/useModuleActivation.ts`** (the resolver — the heart of two-axis composition):
```ts
import { useCallback } from 'react';
import { useFeatureActivation } from '../contexts/FeatureActivationContext';
import { useEntitlements } from '../contexts/EntitlementsContext';
import { MODULES, moduleForView, ModuleId } from '../../shared/modules';
import type { ViewId } from '../../shared/views';

export function useModuleActivation() {
  const { state, setModule, reset, markSeen } = useFeatureActivation();
  const { isOn } = useEntitlements();

  const isModuleActive = useCallback((id: ModuleId) => state.modules[id]?.enabled ?? false, [state]);

  const isViewVisible = useCallback((v: ViewId) => {
    const m = moduleForView(v);
    if (!m) return true;            // unknown view → fail-open visible
    if (m.core) return true;        // core: always visible
    const entitled = m.relatedFeatures.length === 0 || m.relatedFeatures.some(isOn);
    return entitled && (state.modules[m.id]?.enabled ?? false);
  }, [state, isOn]);

  return { state, isModuleActive, isViewVisible,
           setModuleActive: setModule, reset, markSeen,
           newModuleIds: state.newModuleIds as ModuleId[] };
}
```

**(c) `src/renderer/components/MainLayout.tsx`** (sidebar filter + hotkey gate — the primary seam):
```tsx
// inside Layout(), after existing hooks:
const { isViewVisible } = useModuleActivation();
const { error: toastError } = useToast(); // existing ToastContext

// hotkey handler, replacing the navigate at :247-249:
if (pendingG.current && HOTKEY_MAP[key]) {
  e.preventDefault();
  const target = HOTKEY_MAP[key];
  if (isViewVisible(target)) navigate(target);
  else toastError(t('hotkeys.moduleOff')); // "Module is off — enable it in Settings → Modules"
  pendingG.current = false;
  if (pendingTimer.current) clearTimeout(pendingTimer.current);
}

// render (each group), e.g.:
{mainNav.some(i => isViewVisible(i.id)) && (
  <>
    <div className="…">{t('sections.analytics')}</div>
    {mainNav.filter(i => isViewVisible(i.id)).map(renderNavItem)}
  </>
)}
```

**(d) `src/renderer/components/ui/Switch.tsx`** (extracted primitive — design-token exact, lifted verbatim from `UpdateChecker.tsx:20-49`):
```tsx
import React from 'react';
export const Switch: React.FC<{
  checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; testId?: string;
}> = ({ checked, onChange, disabled = false, testId }) => (
  <button type="button" role="switch" aria-checked={checked} disabled={disabled}
    onClick={() => onChange(!checked)} data-testid={testId}
    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full
      transition-colors duration-fast ease-smooth focus-visible:outline-none
      focus-visible:ring-2 focus-visible:ring-emerald-500/40
      disabled:opacity-50 disabled:cursor-not-allowed
      ${checked ? 'bg-emerald-500' : 'bg-zinc-300'}`}>
    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm
      transition-transform duration-fast ease-smooth
      ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
  </button>
);
```
(Then refactor `UpdateChecker.tsx` to import this instead of its local copy — DRY, one edit.)

---

## 8. TEST PLAN (vitest; verified `__tests__` layout + precedents)

Repo runs `vitest run --pool=forks --no-file-parallelism`. Precedents to mirror: `EntitlementsContext.test.tsx`, `automation.locked.test.tsx`, `auto-negativator.test.ts`, `royalty.test.ts`.

1. **`src/shared/__tests__/modules.test.ts`** (new dir) — registry invariants: every `ViewId` maps to exactly one module (no orphan, no double-assign); `core` modules have `core:true`; `DEFAULT_ACTIVE_MODULES` = Starter set; `moduleForView`/`isViewCore` correctness; coming-soon module has empty `views`.
2. **`src/main/local-db/__tests__/featureActivation.test.ts`** — defaults seeded (`freshEmptyState` → Starter on, rest off); `normaliseState` coerces bad `source`/missing modules; **new-module migration** (registry adds an id → appears off + in `newModuleIds`); `activation_events` FIFO cap at `ACTIVATION_HISTORY_CAP`; `next_activation_seq` monotonic; round-trip through encrypted + plaintext write.
3. **`src/main/__tests__/feature-activation.store.test.ts`** — `setModule` writes state + appends event + bumps seq + broadcasts (mock `BrowserWindow.getAllWindows`); **core module toggle throws**; unknown module throws; `reset` restores Starter + tags `source:'reset'`; `track` called with correct name/props (mock telemetry).
4. **`src/renderer/contexts/__tests__/FeatureActivationContext.test.tsx`** — mirrors `EntitlementsContext.test.tsx`: initial `get()`, `onChange` push updates state, `setModule` optimistic flow; behaves when `window.api.featureActivation` absent (stays default — the verified defensive pattern).
5. **`src/renderer/hooks/__tests__/useModuleActivation.test.tsx`** — the resolver truth table: core→visible; entitled+activated→visible; entitled+not-activated→hidden; not-entitled (either activation)→hidden; unknown view→visible (fail-open). Combine mocked `EntitlementsContext` (use its `FALLBACK_VALUE` all-on, and an EMPTY-style all-off) × activation states.
6. **`src/renderer/pages/__tests__/modulesTab.test.tsx`** — renders grouped toggles; core rows disabled+checked; toggling a non-core module calls `setModule`; enable-all skips locked + already-on; reset confirm flow; search filters rows; "New" badge on `newModuleIds`; paid-lock row shows badge + UpgradeModal trigger (mirror `automation.locked.test.tsx`).
7. **`src/renderer/components/__tests__/mainLayoutVisibility.test.tsx`** — sidebar hides rows for inactive modules; empty section header hidden; core rows always present; hotkey to a hidden view does **not** navigate (asserts toast + page unchanged); "More features" nudge deep-links to `#settings/modules`.
8. **`src/renderer/components/__tests__/commandPaletteActivation.test.tsx`** — `available` entry relabels to "Enable…" and calls `setModule`+`goto`; `locked` entry opens `UpgradeModal`; `visible`/`core` entries navigate normally (palette keeps all entries, unlike sidebar).

---

## 9. RISKS & OPEN DECISIONS

### Open decisions for the founder (max 4)
- **D1 — Finance granularity.** The Starter set wants **Royalty visible** but **P&L/Accounting hidden**, yet they're one natural "Publishing/Finance" module. Options: (a) split into two modules (`finance_royalty` core-ish default-on + `finance_advanced` off) — cleaner UX, one extra toggle; (b) make the whole `finance` module default-on — simpler, but shows P&L/Accounting to brand-new users (mild over-surface). **Recommend (a).** Founder to confirm.
- **D2 — Marketplace module.** It has no live page today (keys are component-level only). Ship it as a **catalog-only "coming soon" row** (demonstrates the new-module mechanism, sets expectation) or **omit until a page exists** (less clutter). **Recommend coming-soon row.**
- **D3 — Locked (not-entitled) modules in the sidebar.** Plan hides them from the sidebar (clean) and surfaces them only in the catalog + palette. Alternative (Research F R7 "preview, don't hide" taken further): show them in the sidebar *with a Pro badge and a lock* like the current entitlement-badge behavior. **Recommend catalog-only** (sidebar is the frequent-use surface; the badge today never hides, so this is a deliberate divergence) — but the founder may prefer maximum upsell visibility in the sidebar.
- **D4 — Telemetry transport timing.** Paths (a)+(c) ship now (local + dev-only). Greenlight the §6.1(b) minimal backend `/api/events` (account-scoped, in the *other* repo) now or later? Affects whether cross-user "what users need" data starts accruing immediately. **Recommend: ship (a)+(c) now, schedule (b).**

### Risks
- **Discoverability of hidden paid features (Research F pitfall #4).** Mitigated by: catalog always lists locked modules with upsell; palette surfaces them; the "More features" sidebar nudge. If D3 chooses sidebar-hide, the catalog/palette become the *only* upsell surfaces — ensure copy is strong.
- **Deep-link / palette / hotkey to a hidden page.** Routability is intentionally preserved (the `switch` keeps all cases), so a stale deep-link or drill-down still renders the page even if its module is off — by design (matches `profile`/`campaign_details`). The page's own entitlement gate still fires. Only the *visible lists* + hotkey are gated. Tested in §8.7.
- **Two parallel lists drift (Map A).** Sidebar config arrays and the palette nav list are independent and must both consume `isViewVisible`. Covered by tests §8.7/§8.8; the shared resolver hook is the single predicate to keep them honest.
- **Section-header emptiness / layout.** Hiding a whole group's rows must also hide its header (handled) — otherwise an orphan header renders.
- **`ViewId` extraction.** Moving the union to `shared/views.ts` touches an import many files rely on transitively; re-exporting from `NavContext.tsx` keeps all existing imports working (no churn). Low risk, but a `tsc`/`lint` pass is the gate (note: `npm test` hangs without summary per root memory, but `lint`/`tsc` are clean gates).
- **Security baseline:** all new IPC is typed, validated in main, core-rejected, and exposed via `contextBridge` only — `contextIsolation:true`/`sandbox:true` untouched (root CLAUDE.md rule #2/#3 honored). No new HTTP from renderer (rule #4). No `entitlements.ts`/`feature_keys.json`/backend changes.

---

**Verification note for the implementer:** every file:line cited above was confirmed against source on 2026-06-07 (NavContext, entitlements.ts, EntitlementsContext, useEntitlement, MainLayout, local-db index, SettingsTabs, SettingsPage, ipc.ts, preload.ts, UpdateChecker, telemetry.ts, App.tsx, test layout, i18n settings.json shape). Two facts the maps omitted and you must respect: (1) `feature_keys.json` + `scripts/emit-feature-keys.mjs` is an export pipeline keyed off `entitlements.ts` — this plan deliberately never edits `entitlements.ts`, so it is unaffected; (2) `ViewId` lives in `renderer/contexts/NavContext.tsx`, not `shared/`, hence the small `shared/views.ts` extraction in §7.