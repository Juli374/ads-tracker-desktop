import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { Select } from '../Select';

describe('Select', () => {
  it('renders options', () => {
    render(
      <Select aria-label="country" defaultValue="us">
        <option value="us">US</option>
        <option value="uk">UK</option>
      </Select>,
    );
    const select = screen.getByLabelText('country') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.value).toBe('us');
    expect(screen.getByRole('option', { name: 'US' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'UK' })).toBeInTheDocument();
  });

  it('fires onChange when selection changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select aria-label="country" defaultValue="us" onChange={onChange}>
        <option value="us">US</option>
        <option value="uk">UK</option>
      </Select>,
    );
    const select = screen.getByLabelText('country') as HTMLSelectElement;
    await user.selectOptions(select, 'uk');
    expect(onChange).toHaveBeenCalled();
    expect(select.value).toBe('uk');
  });

  it('forwards ref to the underlying <select>', () => {
    const ref = React.createRef<HTMLSelectElement>();
    render(
      <Select ref={ref} aria-label="x">
        <option value="a">A</option>
      </Select>,
    );
    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });

  it('respects disabled', () => {
    render(
      <Select aria-label="x" disabled>
        <option value="a">A</option>
      </Select>,
    );
    expect((screen.getByLabelText('x') as HTMLSelectElement).disabled).toBe(true);
  });
});
