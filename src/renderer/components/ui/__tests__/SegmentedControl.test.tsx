import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { SegmentedControl } from '../SegmentedControl';

type Letter = 'a' | 'b' | 'c';

const OPTIONS = [
  { value: 'a' as const, label: 'A' },
  { value: 'b' as const, label: 'B' },
  { value: 'c' as const, label: 'C', disabled: true },
];

describe('SegmentedControl', () => {
  it('marks the selected option with active styles and aria-checked', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl<Letter>
        value="a"
        onChange={onChange}
        options={OPTIONS}
        aria-label="letters"
      />,
    );

    const activeBtn = screen.getByTestId('segmented-a');
    expect(activeBtn).toHaveAttribute('aria-checked', 'true');
    expect(activeBtn.className).toContain('bg-zinc-100');
    expect(activeBtn.className).toContain('text-zinc-900');

    const inactiveBtn = screen.getByTestId('segmented-b');
    expect(inactiveBtn).toHaveAttribute('aria-checked', 'false');
    expect(inactiveBtn.className).not.toContain('bg-zinc-100');
  });

  it('calls onChange when clicking an inactive option', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl<Letter>
        value="a"
        onChange={onChange}
        options={OPTIONS}
      />,
    );

    await user.click(screen.getByTestId('segmented-b'));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('does not call onChange when clicking a disabled option', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl<Letter>
        value="a"
        onChange={onChange}
        options={OPTIONS}
      />,
    );

    const disabledBtn = screen.getByTestId('segmented-c');
    expect(disabledBtn).toBeDisabled();
    await user.click(disabledBtn);
    expect(onChange).not.toHaveBeenCalled();
  });
});
