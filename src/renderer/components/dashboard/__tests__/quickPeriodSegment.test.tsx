import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  QuickPeriodSegment,
  quickFromRange,
  rangeFromQuick,
} from '../QuickPeriodSegment';

describe('QuickPeriodSegment helpers', () => {
  it('rangeFromQuick maps presets and returns null for custom', () => {
    expect(rangeFromQuick('last30')).toBe('30d');
    expect(rangeFromQuick('thisMonth')).toBe('mtd');
    expect(rangeFromQuick('lastMonth')).toBe('lastMonth');
    expect(rangeFromQuick('custom')).toBeNull();
  });

  it('quickFromRange round-trips presets and falls back to custom', () => {
    expect(quickFromRange('30d')).toBe('last30');
    expect(quickFromRange('mtd')).toBe('thisMonth');
    expect(quickFromRange('lastMonth')).toBe('lastMonth');
    expect(quickFromRange('7d')).toBe('custom');
    expect(quickFromRange('90d')).toBe('custom');
    expect(quickFromRange('ytd')).toBe('custom');
  });
});

describe('QuickPeriodSegment', () => {
  it('marks the active button and emits change', () => {
    const onChange = vi.fn();
    render(<QuickPeriodSegment value="thisMonth" onChange={onChange} />);

    const thisMonthBtn = screen.getByTestId('quick-period-thisMonth');
    const lastMonthBtn = screen.getByTestId('quick-period-lastMonth');
    expect(thisMonthBtn).toHaveAttribute('aria-selected', 'true');
    expect(lastMonthBtn).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(lastMonthBtn);
    expect(onChange).toHaveBeenCalledWith('lastMonth');
  });
});
