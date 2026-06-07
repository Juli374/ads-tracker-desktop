I have all the information needed. Here is the complete end-to-end map.

---

# Adding a persisted user preference in KDPBook Desktop

The strict rule (from `ads-tracker-desktop/CLAUDE.md`): **IPC только typed — сначала `src/shared/ipc.ts`, потом handler в `src/main/ipc-handlers.ts`, потом expose в `src/preload.ts`.** Persistence lives in `src/main/local-db/index.ts`. The renderer reads/writes only through `window.api.*`.

The `telemetry_consent` boolean is the cleanest existing worked example of a single persisted preference and is traced through all four files below.

---

## (1) Settings-tab structure

### Tab registry (the source of truth for which tabs exist)

`src/renderer/components/settings/SettingsTabs.tsx:17-47` declares the union type and the registry array:

```ts
export type SettingsTabId =
  | 'application'
  | 'books'
  | 'credentials'
  | 'profiles'
  | 'token'
  | 'ai'
  | 'fullSync'
  | 'searchTerm'
  | 'royalties'
  | 'stream'
  | 'privacy';

interface TabSpec {
  id: SettingsTabId;
  icon: React.ElementType;
}

const TABS: TabSpec[] = [
  { id: 'application', icon: Cpu },
  { id: 'books', icon: BookOpen },
  // ...
  { id: 'privacy', icon: Shield },
];
```

The `TABS.map(...)` loop renders each button; the label is resolved via i18n: `t(`tabs.${tab.id}`)` (`SettingsTabs.tsx:63-91`). So a tab's button label is **not** in the component — it lives in the i18n `settings` namespace.

### Where tab bodies render

`src/renderer/pages/SettingsPage.tsx` (NOT under `pages/Settings.tsx` — the file is `SettingsPage.tsx`). It has a **second** validation list that must be kept in sync with the union, plus the body switch:

`SettingsPage.tsx:21-33`:
```ts
const VALID_TABS: SettingsTabId[] = [
  'application', 'books', 'credentials', 'profiles', 'token',
  'ai', 'fullSync', 'searchTerm', 'royalties', 'stream', 'privacy',
];
```

`SettingsPage.tsx:85-95` — the conditional render block:
```tsx
{activeTab === 'application' && <ApplicationTab />}
{activeTab === 'books' && <BooksSettingsTab />}
// ...
{activeTab === 'privacy' && <PrivacyTab />}
```

Active tab is persisted to sessionState (`useSessionState('settings:lastTab', ...)`, `SettingsPage.tsx:52`) and mirrored into the URL hash (`#settings/<tab>`, `readHashTab`/`writeHashTab` at `:35-48`).

### To add a NEW tab

1. Add the id to the `SettingsTabId` union — `SettingsTabs.tsx:17-28`.
2. Add `{ id: 'myThing', icon: SomeIcon }` to `TABS` — `SettingsTabs.tsx:35-47` (import the icon from `lucide-react`).
3. Add the id to `VALID_TABS` — `SettingsPage.tsx:21-33`.
4. Import your tab component + add `{activeTab === 'myThing' && <MyThingTab />}` — `SettingsPage.tsx:4-18` and `:85-95`.
5. Add i18n keys: `tabs.myThing` (button label) plus your tab body strings under the `settings` namespace at `src/renderer/i18n/resources/en/settings.json` (current `tabs` keys: `ariaLabel, application, books, credentials, profiles, profilesWithCount, token, ai, fullSync, searchTerm, royalties, stream, privacy`).

### To add a new SECTION inside ApplicationTab (lower-friction for a single toggle)

`ApplicationTab.tsx` is a stack of `<Card>` blocks inside `<div className="space-y-6">` (`ApplicationTab.tsx:105-299`). Each card uses the local `Row` helper (`ApplicationTab.tsx:303-315`). Add a new `<Card title={t('myPref.cardTitle')}>` with a control (see the disabled `<select>` at `:166-182` for the language row, or the checkbox pattern in `PrivacyTab.tsx:65-73`). The data wiring (load on mount via `useEffect` + `window.api...`, save on change) follows the `PrivacyTab` pattern in section (3).

---

## (2) Local settings store API — `src/main/local-db/index.ts`

### Shape & defaults
The entire persisted state is one interface, `LocalDbState` (`index.ts:196-214`). Single-value preferences are top-level optional fields. The telemetry example:

`index.ts:211-213`:
```ts
  // Phase N — Telemetry consent. Defaults to false (opt-in). Persisted so the
  // user doesn't see the consent prompt on every boot.
  telemetry_consent?: boolean;
```

Defaults are applied in **two** places:
- `freshEmptyState()` (`index.ts:230-253`) — brand-new install (note: `telemetry_consent` is simply omitted here, so it defaults to `undefined` → treated as `false`).
- `normaliseState()` (`index.ts:497-636`) — runs on every read; this is where on-disk values are validated/defaulted. Telemetry: `index.ts:632-633`:
  ```ts
  // Phase N — telemetry consent. Default false → opt-in.
  telemetry_consent: typeof parsed.telemetry_consent === 'boolean' ? parsed.telemetry_consent : false,
  ```
  For richer defaults (object-shaped prefs), the codebase exports a `DEFAULT_*` constant and deep-clones it (see `DEFAULT_AI_SETTINGS` at `:62-75`, `DEFAULT_AUTO_NEG` at `:159-165`, and the deep-clone caveat in the `freshEmptyState` comment at `:224-229`).

### Read / write API (`localStore`)
`index.ts:665-689` — a tiny synchronous fluent store:
```ts
export const localStore = {
  read(): LocalDbState {
    return readState();
  },

  mutate(update: (state: LocalDbState) => void): LocalDbState {
    const state = readState();
    update(state);
    writeState(state);
    return state;
  },

  reset(): void {
    writeState(freshEmptyState());
  },

  filePath(): string { /* returns .enc path if encryption available, else .json */ },
};
```
- **Read a setting:** `localStore.read().telemetry_consent`
- **Write a setting:** `localStore.mutate((state) => { state.telemetry_consent = value; })` — one read + one atomic write per call.

### On-disk format
JSON, schema-versioned via top-level `version` (`SCHEMA_VERSION = 5`, `index.ts:31`). `JSON.stringify(state, null, 2)` (`writeState`, `index.ts:638-639`).

### Encryption (at-rest)
Documented at `index.ts:284-309`. Whole-file symmetric encryption via Electron `safeStorage` (OS Keychain / DPAPI / libsecret):
- Primary file: `local-db.enc` (`dbEncFilePath()`, `:328-330`) when `safeStorage.isEncryptionAvailable()` (`encryptionAvailable()`, `:334-340`).
- Fallback file: `local-db.json` plaintext written `0o600` when safeStorage is unavailable (unsigned dev DMG, CI, Linux without keychain) — `writeState` fallback at `:657-662`.
- One-time plaintext→encrypted migration on first read after signing lands (`readState`, `:399-416`).
- All writes are crash-safe (`atomicWrite`: temp → fsync → rename, `:344-356`).

**Key takeaway for adding a pref:** you do **not** touch encryption, atomic-write, or file paths. A new top-level field is automatically encrypted/persisted because the whole `LocalDbState` is serialized as one blob. You only (a) add the field to the interface, and (b) add a defaulting line in `normaliseState`. No schema-version bump is required for an additive optional field (telemetry_consent was added without bumping `SCHEMA_VERSION`).

---

## (3) Step-by-step recipe to add a typed IPC channel — traced through `telemetry_consent`

The pattern is identical for any new preference. Each numbered step quotes the existing telemetry implementation.

### Step 0 — Persistence (local-db)
Add the field to `LocalDbState` and default it in `normaliseState` (see section 2). For telemetry: `index.ts:211-213` and `:632-633`.

### Step 1 — `src/shared/ipc.ts`: channel enum + types

**1a. Channel name constants** in the `IpcChannel` object (`ipc.ts:6-137`). Telemetry — `ipc.ts:133-136`:
```ts
  // Phase N — Telemetry consent (stub). Renderer toggles consent; main stores
  // it in local-db and forwards to telemetry module's runtime gate.
  TelemetryGetConsent: 'telemetry:getConsent',
  TelemetrySetConsent: 'telemetry:setConsent',
```
Convention: PascalCase TS key → colon-namespaced string value (`domain:verb`). The whole object is `as const`, and `IpcChannelValue` (`ipc.ts:139`) derives the value union.

**1b. Payload/return types.** A boolean needs no new interface. For structured prefs, add an exported `interface`/`type` here (see `AutoNegThresholds` at `:706-716` with its `DEFAULT_AUTO_NEG_THRESHOLDS` const, or `AiSettings` at `:597-602`). This file is the single shared contract — types declared here are imported by both main and preload.

**1c. Add the method(s) to the `DesktopApi` interface** (`ipc.ts:784-1013`) — this is what makes `window.api.<...>` type-check in the renderer. Telemetry — `ipc.ts:1005-1012`:
```ts
  /**
   * Phase N — Telemetry consent. Stub today: consent persists locally but
   * is not yet wired to a transport. UI uses these to render the toggle.
   */
  telemetry: {
    getConsent(): Promise<boolean>;
    setConsent(consent: boolean): Promise<void>;
  };
```

### Step 2 — `src/main/ipc-handlers.ts`: register the handlers

Inside `registerIpcHandlers()` add an `ipcMain.handle` per channel. **Always validate the argument** (the comment "a compromised renderer must not be able to poison our local-db" recurs throughout). Telemetry — `ipc-handlers.ts:1416-1432`:
```ts
  ipcMain.handle(IpcChannel.TelemetryGetConsent, async (): Promise<boolean> => {
    const state = localStore.read();
    return state.telemetry_consent === true;
  });

  ipcMain.handle(
    IpcChannel.TelemetrySetConsent,
    async (_evt, consent: unknown): Promise<void> => {
      if (typeof consent !== 'boolean') {
        throw new Error('telemetry:setConsent expects a boolean');
      }
      localStore.mutate((state) => {
        state.telemetry_consent = consent;
      });
      telemetrySetConsent(consent);   // side-effect; omit for a plain pref
    },
  );
```
Note `localStore` is already imported at `ipc-handlers.ts:56`:
```ts
import { localStore, DEFAULT_AI_SETTINGS, AiSettingsRow } from './local-db';
```
The setter argument arrives as `unknown` and is narrowed before use — this is the mandatory shape-validation idiom (compare the much stricter `AiSettingsSet` validator at `:884-993` for object payloads, and the clamping `AutoNegSettingsSet` at `:1322-1347`).

### Step 3 — `src/preload.ts`: expose over the contextBridge

Add a matching entry to the `api` object (typed as `DesktopApi`). Each method is a thin `ipcRenderer.invoke` pass-through. Telemetry — `preload.ts:238-243`:
```ts
  // Phase N — Telemetry consent. Persists locally; transport is stub today.
  telemetry: {
    getConsent: () => ipcRenderer.invoke(IpcChannel.TelemetryGetConsent) as Promise<boolean>,
    setConsent: (consent: boolean) =>
      ipcRenderer.invoke(IpcChannel.TelemetrySetConsent, consent) as Promise<void>,
  },
```
The whole object is exposed at `preload.ts:246`: `contextBridge.exposeInMainWorld('api', api);`. Because `const api: DesktopApi` is annotated, omitting a method that the interface declares is a compile error — the four files are kept in lockstep by the type checker.

### Step 4 — Renderer call shape

`window.api.<domain>.<method>(...)` returning a Promise. Worked example — `PrivacyTab.tsx`:

Load on mount (`PrivacyTab.tsx:21-36`):
```tsx
useEffect(() => {
  let cancelled = false;
  window.api.telemetry
    .getConsent()
    .then((value) => {
      if (cancelled) return;
      setConsent(value);
      setLoaded(true);
    })
    .catch(() => {
      if (!cancelled) setLoaded(true);
    });
  return () => { cancelled = true; };
}, []);
```

Save on change (`PrivacyTab.tsx:38-49`):
```tsx
const handleToggle = async (next: boolean) => {
  setSaving(true);
  try {
    await window.api.telemetry.setConsent(next);
    setConsent(next);
    toast.success(next ? t('privacy.optedIn') : t('privacy.optedOut'));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : t('privacy.saveFailed'));
  } finally {
    setSaving(false);
  }
};
```
The checkbox itself: `PrivacyTab.tsx:65-73` (`checked={consent}`, `onChange={(e) => handleToggle(e.target.checked)}`).

**Summary of files touched for one new preference:** `src/main/local-db/index.ts` (interface + `normaliseState` default) → `src/shared/ipc.ts` (2 channel consts + `DesktopApi` methods, + a type if non-scalar) → `src/main/ipc-handlers.ts` (2 `ipcMain.handle` with validation) → `src/preload.ts` (2 `ipcRenderer.invoke` pass-throughs) → renderer tab/section (`useEffect` load + handler save) → `settings.json` i18n strings.

---

## (4) Does a renderer hook/context for app settings exist?

**No.** There is no `useSettings`, `SettingsContext`, `SettingsProvider`, `usePreferences`, or `PreferencesContext` anywhere in `src/renderer/` (grep returned nothing). Each settings tab fetches its slice directly via `window.api.*` in a local `useEffect` and holds it in component `useState` — confirmed in `PrivacyTab.tsx` (telemetry), `ApplicationTab.tsx:42-85` (app info / git commit / log path), and the AI/autoNeg consumers (`src/renderer/api/autoNeg.ts`, `AITab`). There is no central cache; each mount re-reads from main.

Existing contexts (`src/renderer/contexts/`): `AuthContext, BooksContext, EntitlementsContext, GlobalFiltersContext, MarketplacesContext, NavContext, ThemeContext, ToastContext, WeeksFilterContext`. The only **preference-like** context is `ThemeContext.tsx` — but it is **not** backed by local-db/IPC; it persists to `window.localStorage` under key `theme:mode` (`ThemeContext.tsx:29,34-38,66-68`) and exposes `useTheme()` (`:107-109`). The only hook in `src/renderer/hooks/` is `useEntitlement.ts` (tier-gating, unrelated to settings).

Practical implication: for a new persisted preference there is **no shared hook to plug into** — follow the per-tab `window.api` + local `useState` pattern (section 3, Step 4). If the preference must be read from many places, you would need to introduce a new context yourself (modeled on `ThemeContext`, but calling `window.api.<pref>.get/set` instead of `localStorage`). There is also a lighter persistence path used by `SettingsPage` itself, `useSessionState` (`src/renderer/lib/useSessionState.ts`, used at `SettingsPage.tsx:19,52`) — but that is session-scoped UI state, **not** durable cross-boot preference storage; durable prefs must go through local-db via IPC.