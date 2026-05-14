// Phase L Lane A — thin renderer-side wrapper around the `ai:generate` IPC.
//
// Kept minimal on purpose: callers (`ListingStudioPage`, `CommandPalette`)
// pass through the payload and surface the result / error. We do NOT swallow
// errors here — the page renders the verbatim main-side message (e.g.
// "Claude API key not configured — set in Settings → AI") so the user knows
// what to fix.
//
// Phase M.3 — Bid Co-pilot helpers.
//   - `parseCoPilotAdvice` — strict JSON parser for the AI advice array.
//     Throws `CoPilotParseError` on malformed JSON / wrong shape so callers
//     can surface a clear toast.
//   - `generateCampaignAdvice` — convenience wrapper around `aiApi.generate`
//     that composes the prompt + context and runs `parseCoPilotAdvice` on the
//     result. Returns `{ items, rationale, model }`.

import type { AiGeneratePayload, AiGenerateResult } from '../../shared/ipc';
import type { Target } from './targets';

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

// === Phase M.3 — Bid Co-pilot ===

/** Action recommended by the AI for a single target. */
export type CoPilotAction = 'lower' | 'raise' | 'pause';

/**
 * One row of AI advice. The JSON shape matches what we ask the model to
 * produce in the prompt.
 *
 * - `target_id` (number) — must reference a real target in the campaign.
 * - `action`:
 *   - `'lower'` / `'raise'` — change the bid; one of `multiplier` or `delta`
 *     must be present. `multiplier` is a positive number ≠ 1 (e.g. 0.88 for
 *     -12%, 1.15 for +15%). `delta` is a signed currency amount (e.g. -0.05).
 *   - `'pause'` — stop spending on this target. `multiplier`/`delta` ignored.
 * - `reason` (string) — short human explanation surfaced to the user.
 */
export interface CoPilotAdviceItem {
  target_id: number;
  action: CoPilotAction;
  multiplier?: number;
  delta?: number;
  reason: string;
}

export interface CoPilotAdvice {
  items: CoPilotAdviceItem[];
  rationale?: string;
  model: string;
}

/** Thrown when the AI response is not parsable into CoPilotAdvice. */
export class CoPilotParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoPilotParseError';
  }
}

/**
 * Strictly parse the AI response into a list of advice items.
 *
 * Accepts:
 *   - a raw JSON array (preferred)
 *   - a JSON array wrapped in a fenced ```json code block (model fallback)
 *
 * Throws CoPilotParseError on:
 *   - empty string
 *   - JSON syntax error
 *   - top-level is not an array
 *   - any item missing required fields or with wrong types
 */
export function parseCoPilotAdvice(raw: string): CoPilotAdviceItem[] {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    throw new CoPilotParseError('Empty AI response');
  }

  // Strip optional ```json ... ``` fences before JSON.parse.
  let payload = trimmed;
  const fenced = payload.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) payload = fenced[1].trim();

  // Fallback: extract the first balanced `[ ... ]` block if the model wrapped
  // the JSON in prose. Cheap heuristic — `JSON.parse` will throw on bad shape.
  if (!payload.startsWith('[')) {
    const start = payload.indexOf('[');
    const end = payload.lastIndexOf(']');
    if (start >= 0 && end > start) {
      payload = payload.slice(start, end + 1);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CoPilotParseError(`Invalid JSON: ${msg}`);
  }

  if (!Array.isArray(parsed)) {
    throw new CoPilotParseError('Expected a JSON array of advice items');
  }

  const VALID_ACTIONS: ReadonlySet<CoPilotAction> = new Set([
    'lower',
    'raise',
    'pause',
  ]);

  const items: CoPilotAdviceItem[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i];
    if (!row || typeof row !== 'object') {
      throw new CoPilotParseError(`Item ${i} is not an object`);
    }
    const r = row as Record<string, unknown>;
    if (typeof r.target_id !== 'number' || !Number.isFinite(r.target_id)) {
      throw new CoPilotParseError(`Item ${i}: target_id must be a number`);
    }
    if (typeof r.action !== 'string' || !VALID_ACTIONS.has(r.action as CoPilotAction)) {
      throw new CoPilotParseError(
        `Item ${i}: action must be one of lower|raise|pause`,
      );
    }
    if (typeof r.reason !== 'string') {
      throw new CoPilotParseError(`Item ${i}: reason must be a string`);
    }
    const item: CoPilotAdviceItem = {
      target_id: r.target_id,
      action: r.action as CoPilotAction,
      reason: r.reason,
    };
    if (typeof r.multiplier === 'number' && Number.isFinite(r.multiplier)) {
      item.multiplier = r.multiplier;
    }
    if (typeof r.delta === 'number' && Number.isFinite(r.delta)) {
      item.delta = r.delta;
    }
    // For bid changes we expect SOME magnitude — but the AI sometimes returns
    // pure "pause" rows with no multiplier/delta, which is fine.
    items.push(item);
  }
  return items;
}

/**
 * Compose the Co-pilot prompt and call the existing `ai:generate` IPC with
 * `task='ask'`. The system prompt for `'ask'` is generic enough that we can
 * push the strict JSON contract via the user message.
 *
 * Returns the parsed advice items.
 *
 * @throws ApiError (from IPC) on missing key / 4xx / 5xx
 * @throws CoPilotParseError when the response can't be parsed
 */
export async function generateCampaignAdvice(
  campaignContext: {
    campaignId: number;
    campaignName: string;
    targetAcos?: number;
    marketplace?: string;
  },
  targets: Target[],
): Promise<CoPilotAdvice> {
  const lines: string[] = [];
  lines.push(
    'You are a bid optimisation co-pilot for KDP Amazon Ads. Analyse the targets ' +
      'below and recommend bid adjustments to improve ROAS. Return ONLY a JSON array ' +
      '(no prose, no markdown fences) of advice items.',
  );
  lines.push('');
  lines.push('Schema for each item:');
  lines.push('{');
  lines.push('  "target_id": <number>,');
  lines.push('  "action": "lower" | "raise" | "pause",');
  lines.push('  "multiplier": <positive number, e.g. 0.85 for -15% or 1.1 for +10%> | undefined,');
  lines.push('  "delta": <signed currency, e.g. -0.05 or 0.10> | undefined,');
  lines.push('  "reason": "<one-sentence why>"');
  lines.push('}');
  lines.push('');
  lines.push('Rules:');
  lines.push('- Use multiplier OR delta, not both. Prefer multiplier for percentage changes.');
  lines.push('- For "pause", omit multiplier/delta.');
  lines.push('- Only include targets that need an action; omit healthy ones.');
  lines.push('- Keep "reason" under ~90 chars.');
  lines.push('');
  lines.push(`Campaign: ${campaignContext.campaignName} (id=${campaignContext.campaignId})`);
  if (campaignContext.marketplace) {
    lines.push(`Marketplace: ${campaignContext.marketplace}`);
  }
  if (
    typeof campaignContext.targetAcos === 'number' &&
    Number.isFinite(campaignContext.targetAcos)
  ) {
    lines.push(`Target ACOS: ${campaignContext.targetAcos}%`);
  }
  lines.push('');
  lines.push('Targets (id | type | text | match | current_bid | state):');
  for (const t of targets) {
    const text = t.keyword_text ?? t.asin ?? t.category ?? '—';
    const kind = t.keyword_text ? 'kw' : t.asin ? 'asin' : 'cat';
    const match = t.match_type ?? '—';
    const state = t.state ?? 'enabled';
    lines.push(`${t.id} | ${kind} | ${text} | ${match} | ${t.bid} | ${state}`);
  }

  const result = await window.api.ai.generate({
    task: 'ask',
    prompt: lines.join('\n'),
    context: {
      mode: 'bid_copilot',
      campaign_id: campaignContext.campaignId,
      target_count: targets.length,
    },
  });

  const items = parseCoPilotAdvice(result.text);
  return { items, rationale: result.rationale, model: result.model };
}
