import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEscapeClose } from './useEscapeClose';

describe('useEscapeClose', () => {
  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeClose(onClose));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on other keys', () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeClose(onClose));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose when disabled', () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeClose(onClose, false));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cleans up listener on unmount', () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useEscapeClose(onClose));
    unmount();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
