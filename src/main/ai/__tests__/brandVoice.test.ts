// Phase M.2 — unit tests for the brand-voice merge helper.

import { describe, it, expect } from 'vitest';
import { describeBrandVoice, mergeForSeries } from '../brandVoice';
import type { AiSettingsRow } from '../../local-db';

const baseBrandVoice: AiSettingsRow['brandVoice'] = {
  pov: 'first-person',
  toneWords: ['warm', 'confident'],
  bannedWords: ['cheap'],
};

describe('mergeForSeries', () => {
  it('returns the base profile when seriesName is omitted', () => {
    const result = mergeForSeries(baseBrandVoice);
    expect(result).toEqual({
      pov: 'first-person',
      toneWords: ['warm', 'confident'],
      bannedWords: ['cheap'],
    });
  });

  it('returns the base profile when seriesOverrides has no entry for the name', () => {
    const result = mergeForSeries(
      { ...baseBrandVoice, seriesOverrides: { 'Other Series': { pov: 'third-person' } } },
      'Krimi Edition',
    );
    expect(result.pov).toBe('first-person');
    expect(result.toneWords).toEqual(['warm', 'confident']);
  });

  it('overrides pov when the series override sets a non-empty value', () => {
    const result = mergeForSeries(
      { ...baseBrandVoice, seriesOverrides: { 'Krimi': { pov: 'third-person' } } },
      'Krimi',
    );
    expect(result.pov).toBe('third-person');
    // Other fields unchanged.
    expect(result.toneWords).toEqual(['warm', 'confident']);
  });

  it('falls through to base pov when override.pov is empty string', () => {
    const result = mergeForSeries(
      { ...baseBrandVoice, seriesOverrides: { 'Krimi': { pov: '  ' } } },
      'Krimi',
    );
    expect(result.pov).toBe('first-person');
  });

  it('replaces toneWords entirely when override provides a non-empty list', () => {
    const result = mergeForSeries(
      {
        ...baseBrandVoice,
        seriesOverrides: { 'Krimi': { toneWords: ['dark', 'tense'] } },
      },
      'Krimi',
    );
    expect(result.toneWords).toEqual(['dark', 'tense']);
  });

  it('falls through to base toneWords when override.toneWords is empty array', () => {
    const result = mergeForSeries(
      { ...baseBrandVoice, seriesOverrides: { 'Krimi': { toneWords: [] } } },
      'Krimi',
    );
    expect(result.toneWords).toEqual(['warm', 'confident']);
  });

  it('unions bannedWords (base bans cannot be dropped)', () => {
    const result = mergeForSeries(
      {
        ...baseBrandVoice,
        seriesOverrides: { 'Krimi': { bannedWords: ['amazing'] } },
      },
      'Krimi',
    );
    expect(result.bannedWords.sort()).toEqual(['amazing', 'cheap']);
  });

  it('dedupes bannedWords when override repeats a base ban', () => {
    const result = mergeForSeries(
      {
        ...baseBrandVoice,
        seriesOverrides: { 'Krimi': { bannedWords: ['cheap', 'amazing'] } },
      },
      'Krimi',
    );
    expect(result.bannedWords.sort()).toEqual(['amazing', 'cheap']);
  });

  it('handles undefined brandVoice (returns empty profile)', () => {
    const result = mergeForSeries(undefined, 'Any');
    expect(result).toEqual({ pov: '', toneWords: [], bannedWords: [] });
  });
});

describe('describeBrandVoice', () => {
  it('returns empty string for empty profile', () => {
    expect(describeBrandVoice({ pov: '', toneWords: [], bannedWords: [] })).toBe('');
  });

  it('renders POV | Tone | Avoid in order', () => {
    expect(
      describeBrandVoice({
        pov: 'first-person',
        toneWords: ['warm', 'confident'],
        bannedWords: ['cheap'],
      }),
    ).toBe('POV: first-person | Tone: warm, confident | Avoid: cheap');
  });

  it('skips empty pov', () => {
    expect(
      describeBrandVoice({ pov: '   ', toneWords: ['x'], bannedWords: [] }),
    ).toBe('Tone: x');
  });

  it('caps tone at 6 words and avoid at 12 words', () => {
    const tone = Array.from({ length: 10 }, (_, i) => `t${i}`);
    const banned = Array.from({ length: 20 }, (_, i) => `b${i}`);
    const out = describeBrandVoice({ pov: '', toneWords: tone, bannedWords: banned });
    expect(out).toContain('t0, t1, t2, t3, t4, t5 |');
    expect(out).toContain('b0, b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11');
    expect(out).not.toContain('t6');
    expect(out).not.toContain('b12');
  });
});
