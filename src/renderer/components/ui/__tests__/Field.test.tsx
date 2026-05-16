import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { Field } from '../Field';
import { Input } from '../Input';

describe('Field', () => {
  it('renders label, control, and hint', () => {
    render(
      <Field label="Email" htmlFor="email" hint="We never share it">
        <Input id="email" />
      </Field>,
    );
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('We never share it')).toBeInTheDocument();
    // label pairs with the control via htmlFor/id
    const input = screen.getByLabelText('Email') as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
  });

  it('renders required asterisk', () => {
    render(
      <Field label="Name" required>
        <Input aria-label="name" />
      </Field>,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('error overrides hint when both are provided', () => {
    render(
      <Field label="Email" hint="hint text" error="Required field">
        <Input aria-label="email" />
      </Field>,
    );
    expect(screen.getByText('Required field')).toBeInTheDocument();
    expect(screen.queryByText('hint text')).not.toBeInTheDocument();
  });

  it('error text gets error color class', () => {
    render(
      <Field label="x" error="bad">
        <Input aria-label="x" />
      </Field>,
    );
    expect(screen.getByText('bad').className).toMatch(/text-error/);
  });

  it('hint text gets subtle color class', () => {
    render(
      <Field label="x" hint="helper">
        <Input aria-label="x" />
      </Field>,
    );
    expect(screen.getByText('helper').className).toMatch(/text-fg-subtle/);
  });

  it('renders no helper paragraph when neither hint nor error is set', () => {
    const { container } = render(
      <Field label="x">
        <Input aria-label="x" />
      </Field>,
    );
    expect(container.querySelectorAll('p').length).toBe(0);
  });
});
