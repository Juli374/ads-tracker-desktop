import { describe, expect, it } from 'vitest';
import { resolveBidUpdates, resolveStateUpdates, roundCents, clampBid, normState, MIN_BID } from './resolveBids';

describe('resolveBids', () => {
  it('set: absolute, works with null current bid', () => {
    const { updates } = resolveBidUpdates([{ target_id: 1, bid: null }], { kind: 'set', value: 0.5 });
    expect(updates).toEqual([{ target_id: 1, bid: 0.5 }]);
  });
  it('multiply: current*factor, cent-rounded', () => {
    const { updates } = resolveBidUpdates([{ target_id: 1, bid: 0.1 }], { kind: 'multiply', factor: 3 });
    expect(updates[0].bid).toBe(0.3); // 0.1*3 fp-safe
  });
  it('delta below floor clamps to MIN_BID, never 0', () => {
    const { updates } = resolveBidUpdates([{ target_id: 1, bid: 0.03 }], { kind: 'delta', amount: -0.02 });
    expect(updates[0].bid).toBe(MIN_BID); // 0.01 -> 0.02
  });
  it('multiply factor<=0 is skipped (invalid), not sent as 0', () => {
    const { updates, skipped } = resolveBidUpdates([{ target_id: 1, bid: 0.5 }], { kind: 'multiply', factor: 0 });
    expect(updates).toHaveLength(0);
    expect(skipped[0].reason).toBe('no-bid'); // resolveOne returns null for factor<=0
  });
  it('skips no-bid for multiply/delta with null current', () => {
    const { skipped } = resolveBidUpdates([{ target_id: 1, bid: null }], { kind: 'multiply', factor: 1.1 });
    expect(skipped[0].reason).toBe('no-bid');
  });
  it('skips no-target-id', () => {
    const { skipped } = resolveBidUpdates([{ target_id: null, bid: 0.5 }], { kind: 'set', value: 1 });
    expect(skipped[0].reason).toBe('no-target-id');
  });
  it('skips no-change (resolved == current)', () => {
    const { updates, skipped } = resolveBidUpdates([{ target_id: 1, bid: 0.5 }], { kind: 'multiply', factor: 1 });
    expect(updates).toHaveLength(0);
    expect(skipped[0].reason).toBe('no-change');
  });
  it('never attaches state on bid edits', () => {
    const { updates } = resolveBidUpdates([{ target_id: 1, bid: 0.5, state: 'paused' }], { kind: 'set', value: 1 });
    expect(updates[0]).not.toHaveProperty('state');
  });
  it('normState uppercases from state or status', () => {
    expect(normState({ state: 'paused' })).toBe('PAUSED');
    expect(normState({ status: 'enabled' })).toBe('ENABLED');
    expect(normState({})).toBe('ENABLED');
  });
  it('resolveStateUpdates emits uppercase state-only updates', () => {
    const { updates } = resolveStateUpdates([{ target_id: 1, bid: 0.5 }], 'PAUSED');
    expect(updates).toEqual([{ target_id: 1, state: 'PAUSED' }]);
  });
  it('roundCents/clampBid helpers', () => {
    expect(roundCents(0.1 * 3)).toBe(0.3);
    expect(clampBid(0.001)).toBe(MIN_BID);
    expect(clampBid(2000)).toBe(1000);
  });
});
