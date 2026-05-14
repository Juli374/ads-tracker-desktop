// Phase M.3 — Bid Co-pilot: parser unit tests for `parseCoPilotAdvice`.
//
// The wrapper validates JSON shape strictly so the renderer can surface a
// clean toast instead of crashing on a hallucinated/malformed model reply.

import { describe, it, expect } from 'vitest';
import { CoPilotParseError, parseCoPilotAdvice } from '../ai';

describe('parseCoPilotAdvice', () => {
  it('parses a clean JSON array of advice items', () => {
    const raw = JSON.stringify([
      { target_id: 1, action: 'lower', multiplier: 0.88, reason: 'High ACOS' },
      { target_id: 2, action: 'raise', delta: 0.05, reason: 'Strong CR' },
      { target_id: 3, action: 'pause', reason: 'Zero orders on 50 clicks' },
    ]);
    const items = parseCoPilotAdvice(raw);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      target_id: 1,
      action: 'lower',
      multiplier: 0.88,
      reason: 'High ACOS',
    });
    expect(items[1].delta).toBe(0.05);
    expect(items[2].action).toBe('pause');
  });

  it('strips a ```json fenced wrapper that some models emit', () => {
    const raw = '```json\n[{"target_id": 5, "action": "lower", "multiplier": 0.9, "reason": "x"}]\n```';
    const items = parseCoPilotAdvice(raw);
    expect(items).toHaveLength(1);
    expect(items[0].target_id).toBe(5);
  });

  it('extracts JSON array from prose-wrapped response', () => {
    const raw = 'Here is the advice:\n[{"target_id":7,"action":"raise","delta":0.1,"reason":"go"}]\nDone.';
    const items = parseCoPilotAdvice(raw);
    expect(items).toHaveLength(1);
    expect(items[0].action).toBe('raise');
  });

  it('throws CoPilotParseError on empty input', () => {
    expect(() => parseCoPilotAdvice('')).toThrow(CoPilotParseError);
    expect(() => parseCoPilotAdvice('   ')).toThrow(CoPilotParseError);
  });

  it('throws CoPilotParseError on malformed JSON', () => {
    expect(() => parseCoPilotAdvice('not-json')).toThrow(CoPilotParseError);
    expect(() => parseCoPilotAdvice('[{broken json')).toThrow(CoPilotParseError);
  });

  it('throws when top-level is not an array', () => {
    const raw = JSON.stringify({ target_id: 1, action: 'lower', reason: 'x' });
    expect(() => parseCoPilotAdvice(raw)).toThrow(CoPilotParseError);
  });

  it('throws when an item is missing target_id or has invalid action', () => {
    const missingId = JSON.stringify([{ action: 'lower', reason: 'x' }]);
    expect(() => parseCoPilotAdvice(missingId)).toThrow(CoPilotParseError);

    const badAction = JSON.stringify([
      { target_id: 1, action: 'destroy', reason: 'x' },
    ]);
    expect(() => parseCoPilotAdvice(badAction)).toThrow(CoPilotParseError);

    const noReason = JSON.stringify([{ target_id: 1, action: 'pause' }]);
    expect(() => parseCoPilotAdvice(noReason)).toThrow(CoPilotParseError);
  });
});
