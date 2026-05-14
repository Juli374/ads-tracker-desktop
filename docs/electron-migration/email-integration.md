# Email integration — design stub (Phase M.5 Lane E)

> **Status: not implemented.** The desktop client currently delivers the
> weekly briefing via a native Electron `Notification` and the in-app
> `BriefingPage`. This document describes how to plug a real transactional
> email provider into the briefer without rewriting the surrounding code.

## Why not implemented now

- The personal-use track does not yet have a billing / account-server side
  that owns user email addresses with verified consent.
- Picking a provider locks in DNS (SPF, DKIM, DMARC) and a per-domain
  warming budget — premature without an active customer base.
- The renderer-side UX (in-app card + native notification) is sufficient for
  one author using the app on one machine.

## Where it plugs in

`src/main/briefing/briefer.ts` exposes a `BrieferDeps.notifyFn(briefing)`
callback. Today the production wiring in `src/main/briefing/index.ts` calls
`new Notification(...)` from Electron's main process. To add email delivery:

1. Extend `BrieferDeps` with an **optional** `emailFn?: (briefing: WeeklyBriefing) => Promise<void>`.
2. Inside `runOnce`, after the existing `notifyFn`, fire `emailFn` and
   `catch` failures so they don't bubble up — email is best-effort.
3. Production wiring in `src/main/briefing/index.ts` reads the user's email
   address from local-db (added in a later phase along with billing) and
   delegates to a provider helper.

## Recommended providers (post-Phase O)

| Provider   | Why                                              | Auth model |
|------------|--------------------------------------------------|------------|
| Resend     | First-class developer DX, predictable pricing    | API key    |
| SendGrid   | Industry standard, robust deliverability         | API key    |
| Postmark   | Best transactional reputation, US/EU pops        | API key    |

We recommend **Resend** as the default. The implementation surface is small
(one POST per briefing) and the SDK ships React templates that the briefing
card UX could re-use for HTML rendering.

## Implementation sketch

```ts
// src/main/briefing/email-resend.ts (NOT YET CREATED)
import type { WeeklyBriefing } from '../../shared/ipc';

const RESEND_API = 'https://api.resend.com/emails';

export function makeResendEmailFn(opts: {
  apiKey: string;
  from: string;       // "Ads Tracker <briefings@ads-tracker.app>"
  to: string;         // user's verified address
}) {
  return async (briefing: WeeklyBriefing) => {
    const body = {
      from: opts.from,
      to: [opts.to],
      subject: `Your weekly KDP briefing (${briefing.period_from} → ${briefing.period_to})`,
      text: briefing.content,
      // html: renderBriefingHtml(briefing),    // optional pretty-print
    };
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Resend ${res.status}: ${await res.text()}`);
    }
  };
}
```

## Privacy

- **Keep the briefing content on-device until it ships.** Today's design
  reads metrics from Railway, transforms in main, calls Anthropic, and
  stores the result locally — Resend would be the first third party that
  sees the digest text.
- **Make email opt-in.** When billing lands, surface a Settings → Briefing
  toggle (`emailWeeklyBriefing: boolean`) and a verified-address field.
- **No PII beyond the briefing text.** Do not include ASINs / royalty
  numbers in the subject line; keep specifics in the body.

## Env vars (added when implemented)

- `RESEND_API_KEY` — Resend SDK token.
- `BRIEFING_FROM_ADDRESS` — must match a verified Resend domain.
- `BRIEFING_BCC` (optional) — internal copy for early debugging.

Add these to `release-env.md` when the feature graduates from stub.
