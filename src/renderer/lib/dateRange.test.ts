import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { dateRangeFor } from './dateRange';

// Pin "today" so tests are deterministic.
const FAKE_NOW = new Date('2026-05-15T12:00:00Z');

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FAKE_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

describe('dateRangeFor', () => {
  it('7d covers 7 days inclusive', () => {
    const { from, to } = dateRangeFor('7d');
    expect(to).toBe('2026-05-15');
    expect(from).toBe('2026-05-09');
  });

  it('30d covers 30 days inclusive', () => {
    const { from, to } = dateRangeFor('30d');
    expect(to).toBe('2026-05-15');
    expect(from).toBe('2026-04-16');
  });

  it('90d covers 90 days inclusive', () => {
    const { from, to } = dateRangeFor('90d');
    expect(to).toBe('2026-05-15');
    expect(from).toBe('2026-02-15');
  });

  it('mtd starts from first day of current month', () => {
    const { from, to } = dateRangeFor('mtd');
    expect(to).toBe('2026-05-15');
    expect(from).toBe('2026-05-01');
  });

  it('ytd starts from January 1st', () => {
    const { from, to } = dateRangeFor('ytd');
    expect(to).toBe('2026-05-15');
    expect(from).toBe('2026-01-01');
  });

  it('lastMonth covers the full previous calendar month', () => {
    const { from, to } = dateRangeFor('lastMonth');
    expect(from).toBe('2026-04-01');
    expect(to).toBe('2026-04-30');
  });
});
