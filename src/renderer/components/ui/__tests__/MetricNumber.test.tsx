import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { MetricNumber } from '../MetricNumber';

describe('MetricNumber', () => {
  it('renders value with mono + tabular-nums by default', () => {
    render(<MetricNumber value="1,234" />);
    const el = screen.getByText('1,234');
    expect(el.className).toMatch(/font-mono/);
    expect(el.className).toMatch(/tabular-nums/);
    expect(el.className).toMatch(/tracking-tight/);
  });

  it('applies default tone (zinc-900)', () => {
    render(<MetricNumber value="42" />);
    expect(screen.getByText('42').className).toMatch(/text-zinc-900/);
  });

  it('applies positive tone class', () => {
    render(<MetricNumber value="up" tone="positive" />);
    expect(screen.getByText('up').className).toMatch(/text-emerald-600/);
  });

  it('applies negative tone class', () => {
    render(<MetricNumber value="down" tone="negative" />);
    expect(screen.getByText('down').className).toMatch(/text-red-600/);
  });

  it('applies muted tone class', () => {
    render(<MetricNumber value="-" tone="muted" />);
    expect(screen.getByText('-').className).toMatch(/text-zinc-400/);
  });

  it('applies sm size', () => {
    render(<MetricNumber value="sm-val" size="sm" />);
    expect(screen.getByText('sm-val').className).toMatch(/text-sm/);
  });

  it('applies md size (default)', () => {
    render(<MetricNumber value="md-val" />);
    const el = screen.getByText('md-val');
    expect(el.className).toMatch(/text-xl/);
    expect(el.className).toMatch(/font-semibold/);
  });

  it('applies lg size', () => {
    render(<MetricNumber value="lg-val" size="lg" />);
    const el = screen.getByText('lg-val');
    expect(el.className).toMatch(/text-2xl/);
    expect(el.className).toMatch(/font-semibold/);
  });

  it('applies hero size', () => {
    render(<MetricNumber value="hero-val" size="hero" />);
    const el = screen.getByText('hero-val');
    expect(el.className).toMatch(/text-4xl/);
    expect(el.className).toMatch(/font-bold/);
  });

  it('appends custom className', () => {
    render(<MetricNumber value="x" className="custom-extra" />);
    expect(screen.getByText('x').className).toMatch(/custom-extra/);
  });
});
