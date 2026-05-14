// Phase L Lane A — thin renderer-side wrapper around the `ai:generate` IPC.
//
// Kept minimal on purpose: callers (`ListingStudioPage`, `CommandPalette`)
// pass through the payload and surface the result / error. We do NOT swallow
// errors here — the page renders the verbatim main-side message (e.g.
// "Claude API key not configured — set in Settings → AI") so the user knows
// what to fix.

import type { AiGeneratePayload, AiGenerateResult } from '../../shared/ipc';

export const aiApi = {
  /**
   * Run a one-shot AI generation. Throws on:
   *   - missing Claude API key in Settings → AI
   *   - Anthropic 4xx/5xx (with the original error message attached)
   *   - request timeout (30s default in main)
   */
  generate(payload: AiGeneratePayload): Promise<AiGenerateResult> {
    return window.api.ai.generate(payload);
  },
};
