import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { CountrySelector } from '../CountrySelector';

const Wrapper: React.FC = () => {
  const [selected, setSelected] = useState<string[]>(['US']);
  return (
    <CountrySelector selected={selected} onChange={setSelected} />
  );
};

describe('CountrySelector', () => {
  it('renders country chips', () => {
    render(<Wrapper />);
    expect(screen.getByTestId('country-chip-US')).toBeInTheDocument();
    expect(screen.getByTestId('country-chip-DE')).toBeInTheDocument();
    expect(screen.getByTestId('country-chip-JP')).toBeInTheDocument();
  });

  it('US is initially selected', () => {
    render(<Wrapper />);
    const usChip = screen.getByTestId('country-chip-US');
    expect(usChip).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking unselected chip selects it', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);

    const deChip = screen.getByTestId('country-chip-DE');
    expect(deChip).toHaveAttribute('aria-pressed', 'false');
    await user.click(deChip);
    expect(deChip).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking selected chip deselects it', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);

    const usChip = screen.getByTestId('country-chip-US');
    expect(usChip).toHaveAttribute('aria-pressed', 'true');
    await user.click(usChip);
    expect(usChip).toHaveAttribute('aria-pressed', 'false');
  });

  it('supports multi-select', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);

    await user.click(screen.getByTestId('country-chip-CA'));
    await user.click(screen.getByTestId('country-chip-GB'));

    expect(screen.getByTestId('country-chip-US')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('country-chip-CA')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('country-chip-GB')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('country-chip-DE')).toHaveAttribute('aria-pressed', 'false');
  });
});
