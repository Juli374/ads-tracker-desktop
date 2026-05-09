import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { EditableNumber } from '../EditableNumber';

describe('EditableNumber', () => {
  it('начинает с display-mode и показывает форматированное значение', () => {
    render(<EditableNumber value={1.23} onSave={vi.fn()} format={(n) => `$${n.toFixed(2)}`} />);
    expect(screen.getByText('$1.23')).toBeInTheDocument();
  });

  it('клик переключает в edit-режим, Enter сохраняет', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditableNumber value={1} onSave={onSave} ariaLabel="bid" />);
    await user.click(screen.getByText('1.00'));
    const input = screen.getByLabelText('bid') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '2.5');
    await user.keyboard('{Enter}');
    expect(onSave).toHaveBeenCalledWith(2.5);
  });

  it('Esc отменяет без вызова onSave', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<EditableNumber value={1} onSave={onSave} ariaLabel="bid" />);
    await user.click(screen.getByText('1.00'));
    await user.keyboard('99{Escape}');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('одинаковое значение не вызывает onSave', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<EditableNumber value={5} onSave={onSave} ariaLabel="bid" />);
    await user.click(screen.getByText('5.00'));
    await user.keyboard('{Enter}');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('disabled — клик не открывает edit', async () => {
    const user = userEvent.setup();
    render(<EditableNumber value={1} onSave={vi.fn()} disabled />);
    await user.click(screen.getByText('1.00'));
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });
});
