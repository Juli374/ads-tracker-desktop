// Phase M.2 — Brand voice composition helpers.
//
// Two responsibilities:
//   1. `mergeForSeries(base, seriesName)` — produce an effective brand voice
//      for one series by overlaying `seriesOverrides[seriesName]` on top of
//      `base`. Missing series → returns `base` unchanged.
//   2. `describeBrandVoice(merged)` — render a one-line hint for the system
//      prompt (e.g. `POV: first-person | Tone: confident, warm | Avoid: …`).
//
// Merge semantics:
//   - pov:         override wins when present AND non-empty
//   - toneWords:   override wins when present AND non-empty (replace, not append)
//   - bannedWords: UNION of base + override (override cannot drop a base ban,
//                  which preserves the safety guarantee)
//
// Extracted out of `ipc-handlers.ts` (which previously inlined a base-only
// `describeBrandVoice`) so the merge logic is unit-testable in isolation.
// `ipc-handlers.ts` now calls these helpers and remains thin.
import type { AiSettingsRow } from '../local-db';

export interface EffectiveBrandVoice {
  pov: string;
  toneWords: string[];
  bannedWords: string[];
}

/**
 * Compute the effective brand voice for a given series. When `seriesName` is
 * omitted / unknown / has no override row, returns the base profile.
 */
export function mergeForSeries(
  brandVoice: AiSettingsRow['brandVoice'] | undefined,
  seriesName?: string | null,
): EffectiveBrandVoice {
  const base: EffectiveBrandVoice = {
    pov: brandVoice?.pov ?? '',
    toneWords: brandVoice?.toneWords ?? [],
    bannedWords: brandVoice?.bannedWords ?? [],
  };
  if (!seriesName || !brandVoice?.seriesOverrides) return base;
  const override = brandVoice.seriesOverrides[seriesName];
  if (!override) return base;

  const pov =
    typeof override.pov === 'string' && override.pov.trim().length > 0
      ? override.pov
      : base.pov;
  const toneWords =
    Array.isArray(override.toneWords) && override.toneWords.length > 0
      ? override.toneWords
      : base.toneWords;
  // Banned words are additive — a series may add more bans but never lift one.
  const bannedSet = new Set<string>(base.bannedWords);
  if (Array.isArray(override.bannedWords)) {
    for (const w of override.bannedWords) bannedSet.add(w);
  }
  return { pov, toneWords, bannedWords: [...bannedSet] };
}

/**
 * Render a one-line hint suitable for the system prompt. Empty / unconfigured
 * profile returns an empty string so callers can branch without churn.
 */
export function describeBrandVoice(bv: EffectiveBrandVoice): string {
  const parts: string[] = [];
  if (bv.pov && bv.pov.trim().length > 0) parts.push(`POV: ${bv.pov.trim()}`);
  if (Array.isArray(bv.toneWords) && bv.toneWords.length > 0) {
    parts.push(`Tone: ${bv.toneWords.slice(0, 6).join(', ')}`);
  }
  if (Array.isArray(bv.bannedWords) && bv.bannedWords.length > 0) {
    parts.push(`Avoid: ${bv.bannedWords.slice(0, 12).join(', ')}`);
  }
  return parts.join(' | ');
}
