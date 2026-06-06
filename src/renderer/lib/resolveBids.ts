// src/renderer/lib/resolveBids.ts
//
// Pure client-side resolver: turns a bulk-bid edit (set / multiply / delta)
// into ABSOLUTE per-target bids for POST /api/amazon-ads/targets/bulk-update.
// The backend does NO bid-range validation and forwards `state` raw to Amazon,
// so BOTH the 0.02 floor AND the uppercase ENABLED/PAUSED casing must be
// enforced here. (Verdict BUG1 + BUG4.)

/** De-facto floor from EditableNumber min at both single-bid sites. */
export const MIN_BID = 0.02;
/** Cent granularity (EditableNumber step). */
export const BID_STEP = 0.01;
/** Fat-finger guard — Amazon rejects absurd bids per-item anyway, but cap client-side. */
export const MAX_BID = 1000;

export type BidEditSpec =
  | { kind: 'set'; value: number }
  | { kind: 'multiply'; factor: number }
  | { kind: 'delta'; amount: number };

/** Minimal row shape the resolver needs (covers Target and KeywordAnalyticsItem). */
export interface BidTargetInput {
  target_id: number | null | undefined;
  bid: number | null | undefined;
  state?: string;  // Target.state  ('enabled' | 'paused')
  status?: string; // KeywordAnalyticsItem.status ('enabled' | 'paused')
}

/** One item for the { updates: [...] } body. `state` omitted for pure bid edits. */
export interface BidUpdate {
  target_id: number;
  bid?: number;
  state?: 'ENABLED' | 'PAUSED';
}

export type SkipReason =
  | 'no-bid'        // multiply/delta needs a current bid, row has none
  | 'no-target-id'  // unsynced / auto-target row
  | 'no-change'     // resolved bid == current bid (skip the no-op Amazon write)
  | 'invalid-spec'  // non-finite set value, factor<=0, etc.
  | 'out-of-range'; // exceeds MAX_BID

export interface ResolveResult {
  updates: BidUpdate[];
  skipped: Array<{ target_id: number | null | undefined; reason: SkipReason }>;
}

/** Round to whole cents, half-up, fp-dust-safe (e.g. 0.1*3 -> 0.30). */
export function roundCents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Clamp to [MIN_BID, MAX_BID]. */
export function clampBid(n: number): number {
  return Math.min(MAX_BID, Math.max(MIN_BID, n));
}

/** UPPERCASE state for the Amazon batch API. (Verdict BUG1.) */
export function normState(t: Pick<BidTargetInput, 'state' | 'status'>): 'ENABLED' | 'PAUSED' {
  const s = (t.state ?? t.status ?? 'enabled').toLowerCase();
  return s === 'paused' || s === 'archived' ? 'PAUSED' : 'ENABLED';
}

function resolveOne(spec: BidEditSpec, current: number | null | undefined): number | null {
  if (spec.kind === 'set') {
    return Number.isFinite(spec.value) ? spec.value : null;
  }
  if (typeof current !== 'number' || !Number.isFinite(current)) return null;
  if (spec.kind === 'multiply') {
    return Number.isFinite(spec.factor) && spec.factor > 0 ? current * spec.factor : null;
  }
  return Number.isFinite(spec.amount) ? current + spec.amount : null;
}

/**
 * Map (selectedTargets, editSpec) -> { updates, skipped }.
 *  - 'set'      bid := value                (works even when current bid is null)
 *  - 'multiply' bid := current * factor     (skip rows with no current bid)
 *  - 'delta'    bid := current + amount     (skip rows with no current bid)
 * Order: resolve -> roundCents -> clampBid(MIN_BID..MAX_BID). Rows whose final
 * bid equals current (after rounding) are skipped as 'no-change'. `state` is
 * NEVER attached here — a bid edit must not re-assert Amazon state (Verdict
 * Issue 6); pause/resume build their own state-only updates.
 */
export function resolveBidUpdates(selected: BidTargetInput[], spec: BidEditSpec): ResolveResult {
  const updates: BidUpdate[] = [];
  const skipped: ResolveResult['skipped'] = [];

  for (const t of selected) {
    if (t.target_id == null) { skipped.push({ target_id: t.target_id, reason: 'no-target-id' }); continue; }

    const raw = resolveOne(spec, t.bid);
    if (raw == null) {
      skipped.push({ target_id: t.target_id, reason: spec.kind === 'set' ? 'invalid-spec' : 'no-bid' });
      continue;
    }
    if (raw > MAX_BID) { skipped.push({ target_id: t.target_id, reason: 'out-of-range' }); continue; }

    const next = clampBid(roundCents(raw));
    const cur = typeof t.bid === 'number' && Number.isFinite(t.bid) ? roundCents(t.bid) : null;
    if (cur != null && next === cur) { skipped.push({ target_id: t.target_id, reason: 'no-change' }); continue; }

    updates.push({ target_id: t.target_id, bid: next });
  }
  return { updates, skipped };
}

/** State-only updates for bulk pause/resume. No bid attached. (Verdict BUG1.) */
export function resolveStateUpdates(
  selected: BidTargetInput[],
  state: 'ENABLED' | 'PAUSED',
): ResolveResult {
  const updates: BidUpdate[] = [];
  const skipped: ResolveResult['skipped'] = [];
  for (const t of selected) {
    if (t.target_id == null) { skipped.push({ target_id: t.target_id, reason: 'no-target-id' }); continue; }
    updates.push({ target_id: t.target_id, state });
  }
  return { updates, skipped };
}
