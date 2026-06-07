I now have comprehensive, well-sourced material across both topic areas. Synthesizing the final brief.

---

# Engineering Brief: User-Controlled Feature Activation + Privacy-Respecting Adoption Analytics for a Local-First Electron App

*Synthesized from 2024–2026 best-practice sources. Tailored for KDPBook desktop (Electron, Mac+Win, royalty data must stay local per Amazon ToS).*

---

## Part A — The Two-Axis Activation/Entitlement Architecture

### A.1 The core insight: these are three orthogonal systems, not one

The single most important architectural decision, repeated across every authoritative 2024–2026 source, is to **keep three concerns physically separate** because each is owned by a different actor, changes on a different cadence, and answers a different question:

| System | Question it answers | Changes when… | Owner | Scope |
|---|---|---|---|---|
| **Entitlement** | "Does this user's *plan* grant access?" | Subscription up/downgrades, billing state | Commerce/billing | Account |
| **Feature flag** (ops) | "Is this code path *deployed/safe* to run?" | Deploy, rollout %, kill-switch, experiment | Engineering | Cohort/global |
| **Activation** (the new axis you're asking about) | "Has the *user chosen* to turn this optional module on?" | User flips a toggle in Settings | **The user** | User/device |

Stigg's decision test is the cleanest heuristic: *"Would this change if the user upgraded their subscription?" → entitlement. "Would this change based on deployment state or experiment?" → feature flag.* Your third axis adds: *"Did the user pick this in their own preferences?" → activation.* ([Stigg](https://www.stigg.io/blog-posts/entitlements-untangled-the-modern-way-to-software-monetization), [Schematic](https://schematichq.com/blog/feature-flag-management), [Salable](https://salable.app/blog/insights/entitlements-future-feature-management))

The reason to resist collapsing "user enabled it" into the flag/entitlement system: feature flags "control execution flow, not monetization logic" and "never need to know about plans," while entitlements "never need to know about rollout percentages" ([Schematic](https://schematichq.com/blog/feature-flag-management)). User *preference* is a fourth thing — it is neither commercial nor operational; it is **consent-to-surface-area**. Mixing it in corrupts both systems and makes the "what do users actually want?" analytics (Part B) impossible to read cleanly.

### A.2 Resolution order (precedence) — this is the load-bearing design

Every source that shows runtime resolution uses **strict, ordered precedence** where the first failing gate short-circuits. Prefab: *"Rules are evaluated in order, so the top rule will win"* ([Prefab](https://prefab.cloud/blog/modeling-product-entitlements-with-feature-flags/)). Stigg's combined stack ([Stigg](https://www.stigg.io/blog-posts/entitlements-untangled-the-modern-way-to-software-monetization)):

```
1. feature flag enabled?      → no → hide entirely (code not ready / killed)
2. plan entitled?             → no → show upsell / locked state
3. user activated?            → no → show "enable this module" affordance
4. user permission/role?      → no → request-access state   (multi-seat only; likely N/A for you)
→ all pass → render the feature live
```

The crucial UX consequence of ordering: a feature the user is **entitled to but hasn't activated** should render an *inviting "Enable" affordance*, NOT a paywall. A feature they're **not entitled to** renders an upsell. Getting the order right (flag → entitlement → activation) is what makes those two states visually and behaviorally distinct.

**Recommended single abstraction.** Stigg's #1 best practice: *"Avoid nesting entitlement checks — create a single abstraction."* Expose one function that returns a rich status enum, not a boolean:

```ts
type FeatureStatus =
  | 'live'          // all gates pass — render it
  | 'not_released'  // flag off — render nothing
  | 'locked'        // entitled=false — render upsell
  | 'available';    // entitled=true, activated=false — render "Enable" CTA

featureGate(featureId): FeatureStatus
```

This keeps the dual-axis logic in one place and gives the UI exactly the four states it needs.

### A.3 The data model

Follow Stigg's three *entitlement types* on the commercial axis and store the activation axis as a separate, user-owned record. Note the key local-first adaptation: **for a local-first app, the activation store lives on-device** (electron-store / your existing `src/main/local-db`), never round-tripping to a server — same locality principle as the royalty data.

```jsonc
// AXIS 1 — ENTITLEMENTS (from plan; cached locally, source of truth = backend/license)
// Stigg's 3 types: gate | config | metered-limit
{
  "advanced_analytics":  { "type": "gate" },
  "kenp_history_days":   { "type": "config", "value": 365 },
  "tracked_books":       { "type": "limit",  "limit": 50, "usage": 12 }
}

// AXIS 2 — ACTIVATION (user's own choices; lives ON-DEVICE, like royalty data)
{
  "schemaVersion": 3,
  "modules": {
    "bsr_scraper":        { "enabled": true,  "activatedAt": "2026-06-01T10:22:00Z", "source": "user" },
    "review_tracker":     { "enabled": false, "activatedAt": null,                   "source": "default" },
    "ai_audit":           { "enabled": true,  "activatedAt": "2026-06-03T09:00:00Z", "source": "enable_all" }
  },
  "lastSeenFeatureSet": ["bsr_scraper","review_tracker","ai_audit","royalty_import"]
}
```

Why these fields:
- **`activatedAt`** is not bookkeeping fluff — it is the raw material for *time-to-activate* and *activation-order* analytics (Part B). Persist it.
- **`source`** (`default | user | enable_all | reset`) lets your analytics distinguish a *deliberate* activation from a bulk "enable everything," which read completely differently for "what do users need."
- **`lastSeenFeatureSet`** drives new-feature migration (next section).

### A.4 Defaults, and the central question: should new features ship OFF?

**Recommendation: new optional modules ship OFF by default ("opt-in"), with one deliberate exception class.** This is the dominant guidance and it is *especially* right for a privacy-sensitive, ToS-constrained app.

Rationale, grounded in sources:
1. **Safety/consent.** Anything that scrapes, calls Amazon, spawns the sidecar, or moves data must be an explicit user choice — opt-in by default. The Eclectic Light Company's settings guidance and the broader privacy literature both push non-essential/new behaviors to off-by-default ([Eclectic Light](https://eclecticlight.co/2026/05/19/settings-preferences-and-defaults/)).
2. **Migration correctness.** The preference-migration rule from Customer.io is the trap to avoid: *"unmapped topics revert to the default opt-in/out status"* ([Customer.io](https://docs.customer.io/journeys/migrate-subscription-prefs/)). If you don't explicitly map a newly shipped feature, it inherits whatever your global default is — so make the global default for new keys **OFF** and make new-feature introduction an explicit, observable event.
3. **Clean adoption signal.** If new features defaulted ON, your "adoption rate" (Part B) would be meaningless — you can't tell wanted from merely-not-disabled. Off-by-default makes every activation a genuine demand signal. This is the analytics-driven argument and it's decisive for your stated goal ("learn what users need / what is useless").

**The one exception:** a feature that is a *non-destructive, no-side-effect replacement/upgrade of an existing surface* (e.g., a better empty-state, a v2 of a table the user already uses) may default ON, because there the user already "opted in" to the parent surface. Adobe AEM's early-adopter toggle pattern is the model for the inverse — genuinely new/experimental capability stays behind an explicit toggle ([Adobe AEM](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/forms/setup-configure-migrate/enable-feature-toggle)).

**Migration mechanism (concrete).** On every app launch:
```
newFeatures = currentFeatureRegistry − activation.lastSeenFeatureSet
for f in newFeatures:
    activation.modules[f] = { enabled: registry[f].defaultEnabled ?? false, source: "default" }
    emit("feature_introduced", { feature: f })   // analytics: measures discovery latency
activation.lastSeenFeatureSet = currentFeatureRegistry
bump schemaVersion if shape changed
```
Both-states-valid is the Thoughtworks rule for any toggle that touches stored data: *"ensure both ON and OFF states are valid for the DB state at any time"* and keep migrations reversible ([Thoughtworks](https://www.thoughtworks.com/en-us/insights/blog/continuous-delivery/feature-toggles-and-database-migrations-part-3)). Practically: never let activation state and a schema migration depend on each other in one irreversible step.

### A.5 Enable-all / Reset

- **Enable-all** must respect the entitlement axis — it activates only modules where `entitlement == granted` (you cannot activate a locked feature; that's an upsell moment). Tag each as `source: "enable_all"` so analytics can separate bulk-on from intentional adoption (bulk-on users churn off features differently — it's noise you want to filter).
- **Reset** restores every module to its registry default (mostly OFF). Tag `source: "reset"` and emit a `features_reset` event — a reset is a strong negative signal worth watching.
- **Grandfathering / plan immutability** (Stigg): when entitlements change later, *"changes to existing plans must not affect current customers; new versions apply to new subscribers."* Keep the user's activation choices intact across plan changes — losing entitlement should *suspend* (not erase) activation, so re-upgrading restores their prior setup.

**Fail-open** (Stigg best practice): if the entitlement source (backend/license) is unreachable — common for a desktop app that may be offline — *"grant maximum access without breaking invariants"* rather than locking the user out of features they own. The activation axis is local so it's always available; only the entitlement check can fail, and it should fail open.

---

## Part B — Privacy-Respecting Feature-Adoption Analytics

### B.1 Non-negotiable constraint first: consent-gated, royalty-data-never-leaves

For a desktop app holding data you're contractually required to keep local, telemetry is a *liability surface*. The literature is blunt: *"78% of enterprise Electron apps silently transmit usage data even when users believe they've opted out"* ([Techpulsify](https://www.techpulsify.com/how-to-completely-disable-electron-telemetry-in-2025)). You must be in the trustworthy minority. Design rules, drawn directly from the sources:

1. **Opt-OUT by default for telemetry** (the inverse of feature activation). The emerging desktop standard (GitHub CLI, Archon, .NET) is: *"telemetry sends nothing until the user explicitly turns it on; transparent (inspect shows literal JSON of what would be sent); easy to disable via multiple paths"* ([Archon #980](https://github.com/coleam00/Archon/issues/980), [GitHub CLI](https://github.blog/changelog/2026-04-22-github-cli-opt-out-usage-telemetry/)). For a privacy-sensitive app, prefer **opt-in** (ask once, clearly, during onboarding). GDPR requires *explicit consent for non-essential analytics* and a withdrawal mechanism *as accessible as granting it* ([Usercentrics](https://usercentrics.com/knowledge-hub/ultimate-guide-to-app-privacy/), [PostHog GDPR](https://posthog.com/docs/privacy/gdpr-compliance)).
2. **The SDK must not initialize until consent is granted.** PostHog: *"ensure your application logic either does not load the SDK or disables capture when a user opts out"* ([PostHog privacy](https://posthog.com/docs/product-analytics/privacy)). Use the consent-wrapper / permission-aware-init pattern ([Secure Privacy](https://secureprivacy.ai/blog/mobile-app-consent-ios-2025)).
3. **Honor `DO_NOT_TRACK=1`** env var and provide a config flag + a Settings toggle — multiple opt-out paths is the convention ([donottrack.sh](https://donottrack.sh/)).
4. **Transparency command/screen**: let users see the literal payload that would be sent (GitHub CLI prints it to stderr; Archon has `telemetry inspect`). Bake an "Inspect what we'd send" button into Settings.
5. **Allowlist, never blocklist, event properties.** Send *only* an explicit set of feature-meta properties. Never send book titles, ASINs, sales figures, KENP counts, royalty amounts, customer data, or file paths. Survive updates resetting privacy settings — re-assert consent state on every launch ([Techpulsify](https://www.techpulsify.com/how-to-completely-disable-electron-telemetry-in-2025)).

### B.2 Tooling recommendation: PostHog (EU Cloud or self-hosted) for product analytics + Sentry for errors — with hard property controls

The PostHog-vs-Sentry comparison is unambiguous that **they solve different problems and mature teams run both**: *"PostHog cares about events and people; Sentry cares about errors and code… PostHog tells you a user dropped off at Step 3; Sentry tells you Step 3 threw a null reference"* ([PostHog vs Sentry](https://posthog.com/blog/posthog-vs-sentry)). For *feature-adoption* (your actual question) you need PostHog's funnels/retention/paths, which Sentry lacks.

**Why PostHog specifically, for a privacy-sensitive app:**

| Capability | Why it matters here | Source |
|---|---|---|
| **Self-hostable** | Maximum control; you can keep the analytics plane inside infra you already run. *"Self-hosting gives maximum control but isn't required for GDPR."* | [PostHog self-host](https://posthog.com/docs/self-host) |
| **`before_send` hook** | Inspect/modify/`null`-drop every event *client-side before transmission* — your hard guarantee that royalty fields never leave. | [PostHog privacy](https://posthog.com/docs/product-analytics/privacy) |
| **`opt_out_capturing_by_default: true`** | SDK boots dark; capture only after explicit consent. Plus `opt_in_capturing()` / `has_opted_out_capturing()`. | [PostHog privacy](https://posthog.com/docs/product-analytics/privacy) |
| **Disable autocapture + cookieless/in-memory** | A desktop analytics build should send *only* your explicit events — no autocapture of DOM/inputs that could leak data. Use memory persistence. | [PostHog privacy](https://posthog.com/docs/product-analytics/privacy) |
| **Property filtering / GeoIP off** | Strip IP at project level; drop geo. | [PostHog privacy](https://posthog.com/docs/product-analytics/privacy) |
| **One tool = funnels + retention + paths + flags + surveys** | You can run feature flags (ops axis) *and* adoption analytics in one place; generous free tier. | [PostHog vs Sentry](https://posthog.com/blog/posthog-vs-sentry) |

**Tradeoff guidance:**
- **PostHog EU Cloud** — recommended default. GDPR-friendly (EU data residency), zero ops, and crucially: when self-hosting you *"can list a generic 'Product Analytics' in your privacy policy"* but with Cloud you must name PostHog ([PostHog GDPR](https://posthog.com/docs/privacy/gdpr-compliance)). Minor disclosure cost; big ops saving.
- **PostHog self-hosted** — only if you want analytics on your own infra for trust/marketing ("your usage data never touches a third party"). Honest tradeoff: real ops overhead ([Cotera](https://cotera.co/articles/posthog-self-hosted-guide)). Given KDPBook is small and the royalty data already stays local by design, **self-hosting analytics is likely over-engineering**; EU Cloud with `before_send` + allowlist gets you 95% of the trust at 5% of the cost.
- **Sentry** — add for crash/error monitoring (separate concern). Scrub PII in Sentry's `beforeSend` too. Don't try to do adoption funnels in Sentry.
- **Avoid** Firebase/GA-style SDKs that *"begin collection on launch unless specifically configured otherwise"* ([Secure Privacy](https://secureprivacy.ai/blog/mobile-app-consent-ios-2025)) — wrong defaults for your threat model.

> Architectural note: route telemetry through the **main process**, not the renderer. One choke point to enforce the allowlist + consent gate, and it keeps any analytics SDK away from renderer surfaces that hold royalty data.

### B.3 Event taxonomy — the schema

Follow the **industry-standard Object-Action, past-tense** convention used by both Amplitude and Segment: `[Object] [Past-Tense Verb]`, consistent casing (Amplitude recommends Title Case; pick one and enforce — `Song Played` ≠ `song played` are two events) ([Optizent](https://www.optizent.com/blog/a-practical-guide-to-designing-your-amplitude-event-taxonomy/), [Growth Method](https://growthmethod.com/object-action-framework/), [Avo](https://www.avo.app/docs/data-design/best-practices/naming-conventions)). Keep event *names* coarse and push detail into **properties** (`snake_case`) so names stay analyzable ([Optizent](https://www.optizent.com/blog/a-practical-guide-to-designing-your-amplitude-event-taxonomy/)). Document the taxonomy as the canonical reference everyone checks before adding events.

**Core activation/adoption events** (this is your implement-ready schema):

```jsonc
// ---- The activation lifecycle (your Part-A axis, instrumented) ----
"Feature Introduced"   { feature_id, app_version }
   // emitted by the migration step in A.4 — start of time-to-activate clock

"Feature Activated"    { feature_id, source,           // user | enable_all | reset_default
                         activation_index,              // 1=first feature this user ever turned on, 2=second…  ← ORDER
                         days_since_install,            // time-to-activate
                         days_since_introduced,         // discovery latency for features shipped post-install
                         entitled }                     // true/false at moment of activation

"Feature Deactivated"  { feature_id, source,
                         days_active,                   // how long it survived before being turned off
                         times_used_while_active }      // was it used at all before disabling? (uselessness signal)

"Features Reset"       { count_active_before }
"Enable All Clicked"   { count_newly_activated, count_already_on, count_locked }

// ---- Usage (the "used / used again" funnel stages) ----
"Feature Used"         { feature_id, surface }          // a meaningful in-feature action, NOT a page view

// ---- Gating visibility (entitlement axis, for upsell analysis) ----
"Locked Feature Viewed" { feature_id }                  // entitled=false state shown
"Upsell Clicked"        { feature_id }

// ---- Consent (compliance audit trail) ----
"Telemetry Consent Changed" { consented }               // the only event allowed pre-consent? No — emit only AFTER opt-in
```

Hard rules for properties:
- **Allowlist of property keys is fixed in code.** `feature_id` values come from a controlled enum. Nothing free-text. No identifiers derived from user content.
- **No PII / no royalty data, ever** — not in any property, not in user properties. Identify users by a random install UUID generated locally (rotatable), never by email/Amazon account.
- `activation_index` and `days_since_*` are computed locally from `activatedAt`/install date — they encode order and timing without sending any timestamps tied to real-world dates if you prefer (send the *delta*, not the wall-clock).

### B.4 The metrics that reveal "what users need" vs "what is useless"

Anchor on **Google's HEART** (Goals→Signals→Metrics) ([IxDF](https://ixdf.org/literature/topics/heart-framework), [Kerry Rodden](https://kerryrodden.com/heart/)) and the **Exposed → Activated → Used → Used-again** adoption funnel (Justin Butlion / Chameleon) ([Chameleon](https://www.chameleon.io/blog/advanced-feature-adoption), [Appcues](https://www.appcues.com/blog/a-guide-to-feature-adoption)). Concrete per-feature scorecard:

| Metric | Formula / definition | What it tells you | Source |
|---|---|---|---|
| **Activation rate** | `Feature Activated (source=user) ÷ users who saw it` | Genuine demand (off-by-default makes this clean) | [Chameleon](https://www.chameleon.io/blog/advanced-feature-adoption), [UserGuiding](https://userguiding.com/blog/feature-adoption-metrics) |
| **Time-to-activate** | **median** & p75/p90 of `days_since_introduced` at first `Feature Activated` | Discoverability; long tail ⇒ hidden/confusing. Always median, not mean — TTV distributions have long tails | [Count.co](https://count.co/metric/time-to-first-value), [Amplitude TTV](https://amplitude.com/explore/analytics/time-to-value) |
| **Activation order** | distribution of `activation_index` per feature | *What users reach for FIRST* = what they need most; what's only ever activated 5th+ is peripheral | [Path analysis / Kissmetrics](https://www.kissmetrics.io/blog/path-analysis-user-flows), [Statsig journeys](https://docs.statsig.com/product-analytics/user-journeys) |
| **Activation→Used conversion** | `Feature Used ÷ Feature Activated` | **The uselessness detector**: activated but never used = curiosity, not value | [Chameleon](https://www.chameleon.io/blog/advanced-feature-adoption) |
| **Feature retention** | % of activators still firing `Feature Used` at W1/W4/W8 | Sustained value vs novelty; the "used again" stage | [UserGuiding](https://userguiding.com/blog/feature-adoption-metrics), [UXCam](https://uxcam.com/blog/feature-adoption-metrics-kpis/) |
| **Feature stickiness** | feature `DAU/MAU` (or WAU/MAU for weekly tools) | Habit formation. SaaS norm 13–40%; B2B lower | [Userpilot DAU/WAU/MAU](https://userpilot.com/blog/dau-wau-mau/), [CleverTap](https://clevertap.com/blog/dau-vs-mau-app-stickiness-metrics/) |
| **Deactivation rate + days_active** | `Feature Deactivated ÷ Feature Activated`, and survival time | Active rejection signal — stronger than non-adoption | (derived) |
| **Breadth/Depth/Frequency** | breadth = # features per user; depth = uses/session; frequency = sessions using it | HEART Engagement decomposition | [HEART](https://ixdf.org/literature/topics/heart-framework) |

**The two killer cross-tabs for your stated goal:**

1. **"What's useless" quadrant** — plot every feature on *Activation rate* (x) × *Activation→Used→Retained* (y):
   - low activation **and** low use → **kill / hide it** (nobody wants it, nobody who tries it stays).
   - **high activation, low Used→Retained** → **misleading or broken**: it *sounds* valuable (people turn it on) but delivers nothing — fix or remove. This is the highest-ROI insight and you can *only* see it because activation is off-by-default and separately instrumented.
   - low activation, high retention → **discoverability problem**, not a value problem → improve onboarding/surfacing, don't kill.
   - high/high → core feature; protect it.

2. **Activation-order funnel** — sequence/path analysis on `activation_index` reveals the *natural adoption order*, which is your roadmap for default onboarding flow and for which module to recommend next. Path/journey analysis is exactly *"the sequence of actions… what percentage do X then Y"* ([Statsig](https://docs.statsig.com/product-analytics/user-journeys), [Sensors](https://docs.sensorsdata.com/sa/docs/guide_analytics_path), [GA4 path exploration](https://support.google.com/analytics/answer/9317498)).

**Tie it to retention to prove value** (the why-bother justification): *"users who reach the aha moment in their first session retain at 2–3×"* and Forrester found *"15–20% higher ROI when feature adoption is rigorously measured"* ([Count.co](https://count.co/metric/time-to-first-value), [Chameleon](https://www.chameleon.io/blog/advanced-feature-adoption)). Only measure retention for users who actually activated+used — don't dilute with non-adopters ([Userpilot DAU/WAU/MAU](https://userpilot.com/blog/dau-wau-mau/)).

---

## Recommended model — opinionated summary

1. **Three separated axes**, resolved in strict order `flag → entitlement → activation (→ permission)` behind one `featureGate()` returning `{live | not_released | locked | available}`. Never collapse user-activation into the flag or billing system. ([Stigg](https://www.stigg.io/blog-posts/entitlements-untangled-the-modern-way-to-software-monetization), [Prefab](https://prefab.cloud/blog/modeling-product-entitlements-with-feature-flags/), [Schematic](https://schematichq.com/blog/feature-flag-management))
2. **Activation state lives on-device** (same locality as royalty data), with `activatedAt` + `source` + `lastSeenFeatureSet`.
3. **New optional modules ship OFF**; explicit per-launch migration emits `Feature Introduced`; only no-side-effect upgrades-of-existing-surfaces may default ON. Map every new key or it silently inherits the global default. ([Eclectic Light](https://eclecticlight.co/2026/05/19/settings-preferences-and-defaults/), [Customer.io](https://docs.customer.io/journeys/migrate-subscription-prefs/), [Thoughtworks](https://www.thoughtworks.com/en-us/insights/blog/continuous-delivery/feature-toggles-and-database-migrations-part-3))
4. **Enable-all respects entitlements; Reset restores defaults; entitlement checks fail OPEN** (offline desktop); plan loss suspends but does not erase activation. ([Stigg](https://www.stigg.io/blog-posts/entitlements-untangled-the-modern-way-to-software-monetization))
5. **Analytics: PostHog EU Cloud** (not self-hosted unless trust-marketing demands it) + **Sentry** for errors. Boot SDK dark (`opt_out_capturing_by_default`), gate on explicit consent, `before_send` allowlist, autocapture off, route through main process, honor `DO_NOT_TRACK`, ship an "inspect payload" screen. **Royalty/book/customer data is never a property — fixed allowlist only.** ([PostHog privacy](https://posthog.com/docs/product-analytics/privacy), [PostHog vs Sentry](https://posthog.com/blog/posthog-vs-sentry), [Archon #980](https://github.com/coleam00/Archon/issues/980))
6. **Event schema**: Object + past-tense, the lifecycle events in B.3, with `activation_index` (order) and `days_since_*` (timing) as first-class properties. ([Optizent](https://www.optizent.com/blog/a-practical-guide-to-designing-your-amplitude-event-taxonomy/), [Avo](https://www.avo.app/docs/data-design/best-practices/naming-conventions))
7. **Metrics**: HEART + Exposed→Activated→Used→Used-again funnel; read the **Activation×(Used→Retained) quadrant** to find useless-but-tempting features and the **activation-order path** to find what users need first. ([Chameleon](https://www.chameleon.io/blog/advanced-feature-adoption), [HEART/IxDF](https://ixdf.org/literature/topics/heart-framework), [Statsig](https://docs.statsig.com/product-analytics/user-journeys))

---

### Sources
- Stigg — Entitlements untangled: https://www.stigg.io/blog-posts/entitlements-untangled-the-modern-way-to-software-monetization
- Stigg (DEV) — Shortcomings of plan identifiers/flags: https://dev.to/getstigg/how-to-gate-end-user-access-to-features-shortcomings-of-plan-identifiers-authorization-feature-flags-38dh
- Prefab — Modeling product entitlements with feature flags: https://prefab.cloud/blog/modeling-product-entitlements-with-feature-flags/
- Schematic — Feature flag management for monetization: https://schematichq.com/blog/feature-flag-management
- Salable — Feature flags and entitlements practical guide: https://salable.app/blog/insights/entitlements-future-feature-management
- LaunchDarkly — Manage entitlements with feature flags: https://launchdarkly.com/blog/how-to-manage-entitlements-with-feature-flags/
- Eclectic Light — Settings, preferences and defaults: https://eclecticlight.co/2026/05/19/settings-preferences-and-defaults/
- Customer.io — Migrate subscription preferences: https://docs.customer.io/journeys/migrate-subscription-prefs/
- Thoughtworks — Feature toggles and DB migrations (pt.3): https://www.thoughtworks.com/en-us/insights/blog/continuous-delivery/feature-toggles-and-database-migrations-part-3
- Adobe AEM — Enable feature toggle (early adopter): https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/forms/setup-configure-migrate/enable-feature-toggle
- PostHog — Product-analytics privacy controls: https://posthog.com/docs/product-analytics/privacy
- PostHog — GDPR compliance: https://posthog.com/docs/privacy/gdpr-compliance
- PostHog — Self-host docs: https://posthog.com/docs/self-host
- PostHog — PostHog vs Sentry: https://posthog.com/blog/posthog-vs-sentry
- Cotera — PostHog self-hosted, honest take: https://cotera.co/articles/posthog-self-hosted-guide
- Techpulsify — Disabling Electron telemetry 2025: https://www.techpulsify.com/how-to-completely-disable-electron-telemetry-in-2025
- Secure Privacy — Mobile app consent 2025: https://secureprivacy.ai/blog/mobile-app-consent-ios-2025
- Usercentrics — App privacy guide: https://usercentrics.com/knowledge-hub/ultimate-guide-to-app-privacy/
- Archon #980 — Opt-in PostHog telemetry for binaries: https://github.com/coleam00/Archon/issues/980
- GitHub CLI — Opt-out usage telemetry: https://github.blog/changelog/2026-04-22-github-cli-opt-out-usage-telemetry/
- DO_NOT_TRACK standard: https://donottrack.sh/
- Chameleon — Advanced feature adoption: https://www.chameleon.io/blog/advanced-feature-adoption
- Appcues — Guide to feature adoption: https://www.appcues.com/blog/a-guide-to-feature-adoption
- UserGuiding — Feature adoption metrics: https://userguiding.com/blog/feature-adoption-metrics
- UXCam — Feature adoption metrics/KPIs 2026: https://uxcam.com/blog/feature-adoption-metrics-kpis/
- Count.co — Time to first value: https://count.co/metric/time-to-first-value
- Amplitude — Time to value: https://amplitude.com/explore/analytics/time-to-value
- Optizent — Amplitude event taxonomy: https://www.optizent.com/blog/a-practical-guide-to-designing-your-amplitude-event-taxonomy/
- Growth Method — Object-Action framework: https://growthmethod.com/object-action-framework/
- Avo — Naming conventions: https://www.avo.app/docs/data-design/best-practices/naming-conventions
- IxDF — HEART framework: https://ixdf.org/literature/topics/heart-framework
- Kerry Rodden — HEART for UX metrics: https://kerryrodden.com/heart/
- Statsig — User journeys: https://docs.statsig.com/product-analytics/user-journeys
- Kissmetrics — Path analysis: https://www.kissmetrics.io/blog/path-analysis-user-flows
- GA4 — Path exploration: https://support.google.com/analytics/answer/9317498
- Userpilot — DAU/WAU/MAU: https://userpilot.com/blog/dau-wau-mau/
- CleverTap — DAU vs MAU stickiness: https://clevertap.com/blog/dau-vs-mau-app-stickiness-metrics/