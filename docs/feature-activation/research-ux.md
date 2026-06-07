I have comprehensive material across all four requested areas plus app-specific detail. Writing the brief now.

---

# Progressive Disclosure & Staged Feature Reveal in Feature-Rich Desktop SaaS — Research Brief (2024–2026)

A field guide for taking a ~21-page, module-grouped desktop app from "overwhelming on first launch" to "simple → complex, opt-in, self-revealing." Synthesized from how mature apps actually do it, plus the failure modes, plus opinionated recommendations for your specific shape (Ads / Analytics / AI / Publishing / Marketplace, with paid-tier gates layered on top).

---

## 0. The one principle that governs everything

Jakob Nielsen's original framing (he coined "progressive disclosure" in 1995) gives you the two hard constraints you cannot violate, and they're more demanding than most teams assume:

1. **You must surface up front everything users *frequently* need** — they should hit the secondary/hidden layer only on *rare* occasions. If a feature is needed weekly, hiding it is a bug, not a kindness.
2. **The primary layer must stay small enough to actually focus attention** — if your "simple" view is still 30 things, you haven't disclosed progressively, you've just relabeled the clutter.

And the killer caveat: **"more than 2 disclosure levels typically has low usability because users get lost moving between levels."** If you find yourself needing 3+ tiers, NN/g's prescription is *not* "add another tier" — it's "simplify the design." Hiding complexity without reducing it just *relocates* it. ([NN/g — Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/))

The other half of the principle is **information scent**: a hidden feature only "exists" to a user if the control that reveals it is clearly labeled with what they'll find. ([NN/g](https://www.nngroup.com/articles/progressive-disclosure/), [UXPin – Discoverability](https://www.uxpin.com/studio/blog/discoverability-in-ux/)) This is the crux of your pitfall #3 — get to it below.

---

## 1. How mature apps actually expose optional features gradually

The market has converged on **five mechanisms**. Most strong apps use 2–3 of them in combination, not one.

### A. The white-glove / drilled onboarding (teach the core, ignore the rest) — *Superhuman*

Superhuman's famous model is the gold standard for "don't reveal everything, drill the 20% that matters":
- Mandatory 30-min 1:1 onboarding that teaches **only core shortcuts**, not features.
- A **synthetic/sandbox inbox** of fake emails so users practice `E` / `R` / `J/K` with zero consequences before touching real data.
- **Just-in-time shortcut teaching**: hit `Cmd+K`, type the action, and the command palette *shows you the keyboard shortcut on the right* so you learn it for next time.
- Reported result: **+20% shortcut usage, +67% feature adoption** vs. self-guided onboarding.

Lesson for you: the command palette is not just navigation — it's the **teaching surface** that reveals features *and* their shortcut, on demand. ([First Round Review – Superhuman Onboarding Playbook](https://review.firstround.com/superhuman-onboarding-playbook/), [Growthmates](https://www.growthmates.news/p/onboarding-lab-how-superhuman-and), [Superhuman – Speed Up With Shortcuts](https://help.superhuman.com/hc/en-us/articles/45191759067411-Speed-Up-With-Shortcuts))

### B. The modular catalog / "add capability as needed" — *Raycast*

Raycast ships a small **Core** set (changelog, feedback, basic utilities) and pushes everything else into an **Extensions Store** that users browse by name/command/keyword/category and install incrementally. The explicit design philosophy: *"You don't need to memorize complex workflows up front; add extensions as needs arise."* Crucially, **only OS-compatible extensions appear** — they filter the catalog so nothing you can't use shows up.

Lesson: an **opt-in capability catalog** beats a giant default surface — *if* the catalog itself is browsable and filtered to what's relevant. ([Raycast Manual – Extensions](https://manual.raycast.com/extensions), [Raycast – Core extension](https://www.raycast.com/extensions/core))

### C. Opt-in advanced/AI bundle with granular *or* all-at-once enable — *Arc (Max)*

Arc Max is the cleanest example of a **paid/advanced feature pack gated behind a single opt-in** that respects user control:
- It's an **optional upgrade you turn on from settings**.
- You can **enable all features at once OR pick only the ones you find useful** (granular toggles).
- Core value is demonstrated **hands-on in ~90 seconds** (pinch-to-summarize, hover-preview) rather than explained, and the onboarding gestures transfer directly to real use.
- Toggling is **one click and reversible** (e.g., one click back to standard Google).

Lesson: bundle advanced features into a named pack, demo the value live, and offer *both* "enable all" and per-feature toggles. ([OnboardMe teardown – Arc Max](https://onboardme.substack.com/p/how-arc-browser-introduces-ai-max-feature), [Arc Help – Arc Max](https://resources.arc.net/hc/en-us/articles/19335160678679-Arc-Max-Boost-Your-Browsing-with-AI))

### D. Tagged/searchable settings with experimental & modified filters — *VS Code*

VS Code is the reference for "thousands of options without drowning beginners," and it does it with **search + tags + profiles**, not hiding:
- Settings editor shows **explicit `Experimental` and `Preview` indicators** next to bleeding-edge settings; you filter to them with `@tag:experimental` / `@tag:preview`. (This was a deliberate 2024 fix because *"it wasn't always clear which settings were experimental."*)
- **`@modified`** filters to only settings that differ from default — the "what did I change / what's on?" answer (directly addresses the buried-settings pitfall).
- **Profiles** let you ship/curate a *minimal* default set and switch into richer configurations per task — the structural version of "default-minimal."

Lesson: **make the settings surface searchable and taggable rather than deep**, and give users a "show me only what's enabled / changed" filter. ([VS Code – Settings](https://code.visualstudio.com/docs/configure/settings), [VS Code 1.95 release notes](https://code.visualstudio.com/updates/v1_95), [VS Code – Profiles](https://code.visualstudio.com/docs/configure/profiles))

### E. Mode-switch for whole personas — *Figma Dev Mode* and *Slack Workflow Builder*

- **Figma Dev Mode** is a *separate mode* that strips the chaotic layers panel down to what's "Ready for dev," removing design-editing complexity entirely for a different persona — without two products. ([Figma – Introducing Dev Mode](https://www.figma.com/blog/introducing-dev-mode/), [Figma Dev Mode guide](https://help.figma.com/hc/en-us/articles/15023124644247-Guide-to-Dev-Mode))
- **Slack Workflow Builder**: start from a **template** (simple) or **build from scratch** (complex); advanced templates are explicitly **labeled "Advanced"** and only then open the full builder. Slack keeps core chat in the primary UI and tucks automation behind menus. ([Slack – Guide to Workflow Builder](https://slack.com/help/articles/360035692513-Guide-to-Slack-Workflow-Builder))
- **Notion** discloses formatting/block tools only on hover or `/`-command, and **Linear** keeps high information density readable via consistent spacing + progressive disclosure, with shortcuts that are *discoverable* (hover shows them), *learnable* (single letters), and *composable*. ([GoodUX – Notion onboarding](https://goodux.appcues.com/blog/notions-lightweight-onboarding), [925 Studios – Linear design breakdown](https://www.925studios.co/blog/linear-design-breakdown-saas-ui-2026))

---

## 2. The pattern catalog (with verdicts for your case)

| Pattern | What it is | Best for | Watch out for |
|---|---|---|---|
| **Default-minimal** | Ship the smallest useful surface; everything else opt-in | New-user activation; reduces NN/g "wrong split" risk | Power users feel features are "missing" → need a fast "enable more" path |
| **Default-full** | Everything on, user prunes | Tiny/expert audiences | Catastrophic for a 21-page app; classic overwhelm |
| **Opt-in feature catalog** | Browsable list of capabilities to turn on (Raycast model) | Modular apps with clear capability boundaries | The catalog must be *findable and filtered*, or it becomes its own buried menu |
| **Leveling / stages** | Capabilities unlock as users hit milestones (rookie→pro; "level 7 = advanced") | Skill-building curves; engagement | Don't gate *needed* features behind grind — that's hostile. Gate *complexity*, not *utility* |
| **Recommended-next-feature** | App suggests the next capability based on behavior/context | Driving depth after activation | Must be behavior-triggered, not nagging on every 3rd action |
| **Contextual disclosure** | Reveal the feature exactly when the task calls for it (Notion `/`, JIT prompts) | Almost always the safest tier-2 | Weak information scent = users never find it |
| **Mode switch** | Whole-persona UI swap (Figma Dev Mode) | Distinct user types sharing data | Two modes = double the QA; only worth it for genuinely different jobs |
| **Onboarding checklist** | A visible, dismissible "set up your account" task list | First-session momentum; surfaces what exists | Must be skippable, must show progress, must not block the app |

**Default-minimal vs default-full verdict for you:** For ~21 pages across 5 modules, **default-minimal is the only defensible choice.** Three of NN/g's, Notion's, Slack's, and Arc's examples all confirm: front-load the *frequent* core, defer the rest, keep the primary surface small. The risk of default-minimal (hidden features) is *solvable* with discoverability tooling (§3); the risk of default-full (overwhelm + churn) is not solvable at all for an app this size.

**On leveling/gamification:** The research supports staged *complexity* reveal ("level 1 = onboarding, level 2 = basic content, level 7 = advanced features") and milestone-triggered feature introduction as a real cognitive-load reducer ([Talisman](https://www.gettalisman.com/blog/leveling-up-user-onboarding-lessons-from-video-game-design-for-software-companies), [Chameleon](https://www.chameleon.io/blog/gamify-user-onboarding)). But for a *business* tool where money is on the line, prefer **soft "stages" tied to readiness/usage** over hard XP locks. An author who needs the Ads bid editor on day one should not have to "earn" it.

---

## 3. Pitfalls — and the concrete fixes

### Pitfall 1: "How do users find what's turned OFF?" (the discoverability hole)
This is the central failure mode of every opt-in/hidden-feature scheme. NN/g: hiding only works *"if users can still find them when needed"*; features with weak information scent are *never discovered*. ([NN/g](https://www.nngroup.com/articles/progressive-disclosure/))

**Fixes (use several):**
- **Command palette as the universal discovery layer.** A palette lets users *"type what they want and find out if functionality exists and where it is, without needing to know if it exists."* Make *disabled* features appear in palette results with an "Enable…" affordance (this is the single highest-leverage fix). ([Command.ai](https://www.command.ai/blog/command-palette-past-present-and-future/), [UX Patterns – Command Palette](https://outdraw-academy.gitbook.io/ux-patterns/command-palette))
- **A single "Features / Modules" catalog page** (Raycast/Arc model): every capability listed with on/off state, one-click enable, and a one-line "what it does." This is your "reset / enable-all" home (pitfall #3).
- **Greyed-but-visible entry points** for tier-2 features with clear labels (Slack's "Advanced" tag; VS Code's `Experimental`/`Preview` indicators). Visible-but-marked >> invisible.
- **Contextual "want more?" affordances** in the relevant module rather than a global settings dump.

### Pitfall 2: The buried-settings problem
Deep menu trees re-create the very complexity you tried to hide ("layers of menus hiding valuable utilities behind unintuitive paths"). ([ComputerWorld – Command Palette launcher](https://www.computerworld.com/article/3956444/windows-start-menu-command-palette.html))

**Fixes:**
- **Searchable settings** with `@`-style filters (VS Code). At minimum: free-text search + tag filters (`module:ads`, `experimental`, `pro`).
- **Stay within NN/g's 2-level limit.** If a setting needs 3 clicks to reach, restructure.
- **Keep settings flat per module**, not one giant tree.

### Pitfall 3: Reset / enable-all / "show me everything"
Opt-in systems must have an escape hatch or power users feel trapped, and users lose track of their own config.

**Fixes:**
- **A "Modules/Features" page with "Enable all" and per-item toggles** (Arc Max's "all at once OR pick").
- **A "what's on / what changed" view** — VS Code's `@modified` is the proven pattern: one place that answers "what have I enabled?" and lets you reset to defaults.
- **Reversibility everywhere** — every enable is one-click undoable (Arc).

### Pitfall 4 (your context-specific one): paid-gating colliding with progressive disclosure
You have features that are *both* "advanced/optional" *and* "paid-tier-gated." If a feature is hidden for being advanced **and** locked for being paid, the user gets a double-blind: they neither know it exists nor that they could buy it. That kills upsell.

**Fixes (from the gating research):**
- **Prefer "show locked, with contextual upgrade" over "hide entirely"** for paid features. Soft walls/previews beat hard walls for both discovery and conversion. ([Demogo – Feature Gating models](https://demogo.com/2025/11/24/feature-gating-in-saas-practical-models-for-freemium-conversion-with-examples/), [Appcues – Freemium upgrade prompts](https://www.appcues.com/blog/best-freemium-upgrade-prompts))
- **Frame as discovery, not denial.** Spotify's *"You discovered a Premium feature"* converts better than *"you're not allowed."* ([Userpilot – Upselling examples](https://userpilot.com/blog/upselling-examples-saas/))
- **Trigger upgrade prompts contextually, at natural breakpoints** — Zapier shows the upgrade modal *exactly when* a user reaches for a feature one tier up; never on every third action. ([Appcues – Upselling prompts](https://www.appcues.com/blog/upselling-prompts-saas), [Userpilot](https://userpilot.com/blog/upselling-examples-saas/))
- **Always show what's free vs premium** transparently — no scare tactics. ([Demogo](https://demogo.com/2025/11/24/feature-gating-in-saas-practical-models-for-freemium-conversion-with-examples/))

**The key distinction:** **progressive disclosure (advanced ≠ hidden-forever) and paid-gating (preview-then-upsell) are *different axes*.** Don't let "advanced" and "paid" both resolve to "invisible." A feature can be *off-by-default* (disclosure) yet *visible-and-previewable* (gating).

---

## 4. Concrete, opinionated recommendations for YOUR desktop app

Your shape: ~21 pages, 5 modules (**Ads, Analytics, AI, Publishing, Marketplace**), some features paid-gated, desktop (Electron), new users must not be overwhelmed.

### R1 — Ship a "Starter" surface: one module on, four available
On first run, **enable only the module tied to the core job-to-be-done** (for KDPBook that's almost certainly **Ads** + the minimal **Analytics** needed to read results — the bid→result→royalty loop is your moat). The other modules (AI, Publishing, Marketplace) are **visible in the sidebar but in a clearly-labeled "available / not yet enabled" state**, not absent. This is default-minimal with strong scent — the opposite of hiding. (NN/g frequency rule; Arc opt-in; Slack visible-but-tagged.)

### R2 — A "Modules" catalog page = your control center for disclosure AND gating
One page listing all 5 modules and their notable features, each with:
- **State chip**: `On` / `Off` / `Pro` (paid) / `Beta`.
- **One-line description** (information scent).
- **One-click Enable** (free) or **"See what's in Pro"** (paid → contextual upsell, not a wall).
- **"Enable all" + per-item toggles** (Arc) and a **"Reset to recommended"** (VS Code `@modified` spirit).

This single page solves pitfalls #1, #3, and #4 at once. It's the Raycast Store + Arc Max settings + VS Code profiles, collapsed into one surface sized for 5 modules.

### R3 — Command palette as the universal "find what's off" layer
Add a global palette (`Cmd/Ctrl+K`). Index **all 21 pages and all features, including disabled and Pro ones.** When a user invokes a disabled feature: inline **"Enable Ads Negative-Keyword Rules?"**; for a Pro feature: **"Unlock with Pro"** with one line on value. Show the **keyboard shortcut on the right** (Superhuman) so the palette teaches. This is the highest-ROI single component you can build for discoverability. ([Command.ai](https://www.command.ai/blog/command-palette-past-present-and-future/), [Superhuman](https://review.firstround.com/superhuman-onboarding-playbook/))

### R4 — Per-module "advanced" toggle, not a global one
Each module gets its own **simple ↔ advanced** switch (Slack template vs. scratch; Figma Dev Mode-style focus). Example: **Ads** simple = campaigns + spend + ACOS; advanced (off by default) = bid rules, bulk edits, negative-keyword lists, search-term harvesting. Keep it to **two levels** per module (NN/g's limit). Don't make one global "expert mode" — different authors go deep in different modules.

### R5 — An onboarding checklist that *reveals what exists*, not a forced tour
A dismissible, progress-showing checklist ("Connect Amazon Ads → Import a campaign → See your true royalty → Try an AI suggestion"). Each completed step **unlocks/【introduces】the next relevant capability** (recommended-next-feature). This doubles as a discoverability map of the product. Make it **skippable** and non-blocking. ([Candu – Notion onboarding](https://www.candu.ai/blog/how-notion-crafts-a-personalized-onboarding-experience-6-lessons-to-guide-new-users), [UX Design Institute – onboarding 2025](https://www.uxdesigninstitute.com/blog/ux-onboarding-best-practices-guide/))

### R6 — Empty states that *invite enabling*, on every not-yet-used page
For each of the 21 pages, the empty state must: (a) say what the page does as a **positive statement** ("Start by importing a campaign," not "No data"), (b) carry a **single primary CTA**, and (c) where relevant, **enable the feature or load sample/dummy data** so the page isn't anxiety-inducing whitespace. This is where you convert "feature is off" into "feature is tried." ([Pencil & Paper – Empty States](https://www.pencilandpaper.io/articles/empty-states), [UserOnboard – Empty States](https://www.useronboard.com/onboarding-ux-patterns/empty-states/), [UXPin – Empty States](https://www.uxpin.com/studio/blog/ux-best-practices-designing-the-overlooked-empty-states/))

### R7 — Paid features: preview, don't hide; upsell in context
For Pro-gated features (likely deeper AI, cross-account/Marketplace analytics, advanced automation): keep them **visible with a `Pro` chip**, let users **see a preview / read what it does**, and trigger the upgrade prompt **only when they reach for it** — framed as discovery ("You found a Pro feature"). Always show free-vs-Pro side by side. ([Demogo](https://demogo.com/2025/11/24/feature-gating-in-saas-practical-models-for-freemium-conversion-with-examples/), [Userpilot](https://userpilot.com/blog/upselling-examples-saas/), [Appcues](https://www.appcues.com/blog/best-freemium-upgrade-prompts))

### R8 — Just-in-time teaching for the AI module
The AI module is where overwhelm and distrust peak. Borrow Arc Max: **demo one AI action live in <90 seconds** during onboarding (e.g., "AI suggested 3 negative keywords — apply?"), make it **one-click reversible**, and keep deeper AI (audits, autonomous actions) **off by default** behind the module's advanced toggle with an explicit, plain-language enable. ([Arc Max teardown](https://onboardme.substack.com/p/how-arc-browser-introduces-ai-max-feature))

### R9 — Tag and make settings searchable from day one
Even at desktop scale, adopt VS Code's discipline: **free-text settings search + tag filters** (`module:`, `pro`, `beta`, `@modified`). Cheap to build early, prevents the buried-settings problem from ever forming as you add pages. ([VS Code settings](https://code.visualstudio.com/docs/configure/settings))

### R10 — Respect the 2-level law as an architecture rule
No feature, setting, or capability should be more than **two disclosure levels** from the surface. If something needs a third level, that's your signal to **simplify or split the module**, per NN/g — not to nest deeper. ([NN/g](https://www.nngroup.com/articles/progressive-disclosure/))

---

### Build priority (highest leverage first)
1. **Command palette indexing everything incl. disabled/Pro** (R3) — solves discoverability, teaching, and gating discovery in one component.
2. **Modules catalog page** with On/Off/Pro/Beta + enable-all + reset (R2) — your control center; solves pitfalls #1/#3/#4.
3. **Default-minimal first-run** (one module on, rest visible-available) (R1).
4. **Actionable empty states + onboarding checklist** (R5, R6).
5. **Per-module advanced toggle** (R4) and **contextual paid previews** (R7).
6. **Searchable/tagged settings** (R9).

---

### Sources
- [NN/g — Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
- [IxDF — Progressive Disclosure (2026)](https://ixdf.org/literature/topics/progressive-disclosure)
- [UXPin — What Is Progressive Disclosure (2026)](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/) · [UXPin — Discoverability in UX](https://www.uxpin.com/studio/blog/discoverability-in-ux/) · [UXPin — Empty States](https://www.uxpin.com/studio/blog/ux-best-practices-designing-the-overlooked-empty-states/)
- [LogRocket — Progressive disclosure types & use cases](https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases/)
- [Lollypop — Progressive Disclosure in SaaS UX](https://lollypop.design/blog/2025/may/progressive-disclosure/) · [Userpilot — Progressive Disclosure examples](https://userpilot.com/blog/progressive-disclosure-examples/)
- VS Code: [Settings](https://code.visualstudio.com/docs/configure/settings) · [Profiles](https://code.visualstudio.com/docs/configure/profiles) · [1.95 release notes (experimental/preview indicators)](https://code.visualstudio.com/updates/v1_95)
- Notion: [GoodUX teardown](https://goodux.appcues.com/blog/notions-lightweight-onboarding) · [Candu — 6 lessons](https://www.candu.ai/blog/how-notion-crafts-a-personalized-onboarding-experience-6-lessons-to-guide-new-users)
- Linear: [925 Studios design breakdown](https://www.925studios.co/blog/linear-design-breakdown-saas-ui-2026) · [Tela — Elegant design of Linear](https://telablog.com/the-elegant-design-of-linear-app/)
- Superhuman: [First Round — Onboarding Playbook](https://review.firstround.com/superhuman-onboarding-playbook/) · [Growthmates — Onboarding Lab](https://www.growthmates.news/p/onboarding-lab-how-superhuman-and) · [Speed Up With Shortcuts](https://help.superhuman.com/hc/en-us/articles/45191759067411-Speed-Up-With-Shortcuts)
- Raycast: [Manual — Extensions](https://manual.raycast.com/extensions) · [Core extension](https://www.raycast.com/extensions/core)
- Arc: [OnboardMe — Arc Max progressive disclosure teardown](https://onboardme.substack.com/p/how-arc-browser-introduces-ai-max-feature) · [Arc Help — Arc Max](https://resources.arc.net/hc/en-us/articles/19335160678679-Arc-Max-Boost-Your-Browsing-with-AI)
- Figma: [Introducing Dev Mode](https://www.figma.com/blog/introducing-dev-mode/) · [Guide to Dev Mode](https://help.figma.com/hc/en-us/articles/15023124644247-Guide-to-Dev-Mode)
- Slack: [Guide to Workflow Builder](https://slack.com/help/articles/360035692513-Guide-to-Slack-Workflow-Builder)
- Command palette: [Command.ai — Past, present, future](https://www.command.ai/blog/command-palette-past-present-and-future/) · [UX Patterns — Command Palette](https://outdraw-academy.gitbook.io/ux-patterns/command-palette) · [ComputerWorld — Command Palette launcher](https://www.computerworld.com/article/3956444/windows-start-menu-command-palette.html)
- Empty states: [Pencil & Paper](https://www.pencilandpaper.io/articles/empty-states) · [UserOnboard](https://www.useronboard.com/onboarding-ux-patterns/empty-states/) · [Carbon Design System](https://carbondesignsystem.com/patterns/empty-states-pattern/)
- Leveling/gamification: [Talisman — Leveling up onboarding](https://www.gettalisman.com/blog/leveling-up-user-onboarding-lessons-from-video-game-design-for-software-companies) · [Chameleon — Gamify onboarding](https://www.chameleon.io/blog/gamify-user-onboarding)
- Feature gating / upsell: [Demogo — Feature Gating models](https://demogo.com/2025/11/24/feature-gating-in-saas-practical-models-for-freemium-conversion-with-examples/) · [Appcues — Upselling prompts](https://www.appcues.com/blog/upselling-prompts-saas) · [Appcues — Freemium upgrade prompts](https://www.appcues.com/blog/best-freemium-upgrade-prompts) · [Userpilot — Upselling examples](https://userpilot.com/blog/upselling-examples-saas/)