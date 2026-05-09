import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSessionState } from './useSessionState';

beforeEach(() => {
  window.localStorage.clear();
});

describe('useSessionState', () => {
  it('returns the initial value when no value persisted', () => {
    const { result } = renderHook(() => useSessionState('k:initial', 'A'));
    expect(result.current[0]).toBe('A');
  });

  it('reads a previously persisted value', () => {
    window.localStorage.setItem('k:read', JSON.stringify('persisted'));
    const { result } = renderHook(() => useSessionState('k:read', 'fallback'));
    expect(result.current[0]).toBe('persisted');
  });

  it('persists updates to localStorage', () => {
    const { result } = renderHook(() => useSessionState('k:update', 0));
    act(() => result.current[1](42));
    expect(result.current[0]).toBe(42);
    expect(window.localStorage.getItem('k:update')).toBe('42');
  });

  it('supports functional updaters', () => {
    const { result } = renderHook(() => useSessionState('k:fn', 1));
    act(() => result.current[1]((p) => p + 10));
    expect(result.current[0]).toBe(11);
  });
});
