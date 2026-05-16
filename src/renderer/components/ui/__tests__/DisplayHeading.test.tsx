import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { DisplayHeading } from '../DisplayHeading';

describe('DisplayHeading', () => {
  it('renders as h1 by default with page size', () => {
    render(<DisplayHeading>Hello</DisplayHeading>);
    const el = screen.getByText('Hello');
    expect(el.tagName).toBe('H1');
    expect(el.className).toMatch(/font-display/);
    // page size uses clamp(1.75rem,3.5vw,2.5rem)
    expect(el.className).toMatch(/text-\[clamp\(1\.75rem,3\.5vw,2\.5rem\)\]/);
    expect(el.className).toMatch(/font-bold/);
  });

  it('renders as h2 when as="h2"', () => {
    render(<DisplayHeading as="h2">Section</DisplayHeading>);
    expect(screen.getByText('Section').tagName).toBe('H2');
  });

  it('renders as h3 when as="h3"', () => {
    render(<DisplayHeading as="h3">Sub</DisplayHeading>);
    expect(screen.getByText('Sub').tagName).toBe('H3');
  });

  it('applies hero size', () => {
    render(<DisplayHeading size="hero">Big</DisplayHeading>);
    const el = screen.getByText('Big');
    expect(el.className).toMatch(/text-\[clamp\(2\.5rem,5vw,4rem\)\]/);
    expect(el.className).toMatch(/font-bold/);
  });

  it('applies section size with stable tracking', () => {
    render(<DisplayHeading size="section">Sect</DisplayHeading>);
    const el = screen.getByText('Sect');
    expect(el.className).toMatch(/text-2xl/);
    expect(el.className).toMatch(/tracking-tight/);
  });

  it('appends custom className', () => {
    render(<DisplayHeading className="custom-x">y</DisplayHeading>);
    expect(screen.getByText('y').className).toMatch(/custom-x/);
  });
});
