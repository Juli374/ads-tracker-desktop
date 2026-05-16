import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Stub ResponsiveContainer so jsdom's 0×0 layout doesn't suppress SVG render.
// Recharts charts only emit SVG when given explicit width/height props, so we
// clone the chart child with those props (a styled wrapper div alone is not
// enough — pnl.test.tsx gets away with it because it doesn't assert on SVG).
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => {
      if (React.isValidElement(children)) {
        return React.cloneElement(
          children as React.ReactElement<{ width?: number; height?: number }>,
          { width: 600, height: 240 },
        );
      }
      return <>{children}</>;
    },
  };
});

import { GradientArea } from '../charts/GradientArea';

interface Point extends Record<string, unknown> {
  date: string;
  value: number;
}

const DATA: Point[] = [
  { date: '2026-05-01', value: 10 },
  { date: '2026-05-02', value: 22 },
  { date: '2026-05-03', value: 18 },
];

describe('GradientArea', () => {
  it('renders an SVG chart with a linearGradient definition for the area fill', () => {
    const { container } = render(
      <GradientArea data={DATA} xKey="date" yKey="value" data-testid="ga" />,
    );

    const wrapper = screen.getByTestId('ga');
    expect(wrapper).toBeInTheDocument();

    // Recharts emits an <svg> for the chart surface.
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    // The gradient definition is the primitive's defining feature.
    // jsdom's CSS selector matching is case-insensitive for tag names, so
    // querySelector('linearGradient') returns null. Use getElementsByTagName,
    // which is case-sensitive inside SVG and matches the camelCase tag.
    const gradients = svg!.getElementsByTagName('linearGradient');
    expect(gradients.length).toBeGreaterThan(0);

    // Two stops: top (0.2 opacity) and bottom (0).
    const stops = gradients[0].getElementsByTagName('stop');
    expect(stops.length).toBe(2);
  });

  it('renders EmptyState when data is empty', () => {
    render(
      <GradientArea data={[] as Point[]} xKey="date" yKey="value" data-testid="ga-empty" />,
    );

    // react-i18next mock returns the key verbatim; EmptyState defaults to
    // t('states.emptyForPeriod') when no title is passed.
    expect(screen.getByText('states.emptyForPeriod')).toBeInTheDocument();

    // No SVG when empty.
    const wrapper = screen.getByTestId('ga-empty');
    expect(wrapper.querySelector('svg')).toBeNull();
  });

  it('renders headlineValue and headlineLabel as an absolutely-positioned overlay', () => {
    render(
      <GradientArea
        data={DATA}
        xKey="date"
        yKey="value"
        headlineLabel="Revenue"
        headlineValue="$1,234"
      />,
    );

    const headline = screen.getByText('$1,234');
    expect(headline).toBeInTheDocument();
    expect(headline.className).toMatch(/font-display/);

    const caption = screen.getByText('Revenue');
    expect(caption).toBeInTheDocument();
    expect(caption.className).toMatch(/uppercase/);
  });

  it('uses the analytics (blue) module color by default', () => {
    const { container } = render(
      <GradientArea data={DATA} xKey="date" yKey="value" />,
    );
    const svg = container.querySelector('svg')!;
    const stops = svg.getElementsByTagName('stop');
    expect(stops[0]?.getAttribute('stop-color')).toBe('#3b82f6');
    expect(stops[1]?.getAttribute('stop-color')).toBe('#3b82f6');
  });

  it('respects a custom color override', () => {
    const { container } = render(
      <GradientArea data={DATA} xKey="date" yKey="value" color="#ff00aa" />,
    );
    const svg = container.querySelector('svg')!;
    const stops = svg.getElementsByTagName('stop');
    expect(stops[0]?.getAttribute('stop-color')).toBe('#ff00aa');
  });
});
