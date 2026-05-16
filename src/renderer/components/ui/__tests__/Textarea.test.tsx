import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { Textarea } from '../Textarea';

describe('Textarea', () => {
  it('renders and accepts typing', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="notes" />);
    const ta = screen.getByLabelText('notes') as HTMLTextAreaElement;
    await user.type(ta, 'hello\nworld');
    expect(ta.value).toBe('hello\nworld');
  });

  it('fires onChange when value changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Textarea aria-label="notes" onChange={onChange} />);
    await user.type(screen.getByLabelText('notes'), 'x');
    expect(onChange).toHaveBeenCalled();
  });

  it('forwards ref to the underlying <textarea>', () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} aria-label="x" />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('respects disabled', () => {
    render(<Textarea aria-label="x" disabled />);
    expect((screen.getByLabelText('x') as HTMLTextAreaElement).disabled).toBe(true);
  });
});
