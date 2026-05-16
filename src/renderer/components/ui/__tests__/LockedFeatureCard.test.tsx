import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Sparkles } from 'lucide-react';

import { LockedFeatureCard } from '../LockedFeatureCard';

describe('LockedFeatureCard', () => {
  it('renders title, description, and default PRO badge', () => {
    render(
      <LockedFeatureCard
        icon={<Sparkles data-testid="lock-icon" />}
        title="Premium feature"
        description="Unlock with Pro"
      />,
    );
    expect(screen.getByText('Premium feature')).toBeTruthy();
    expect(screen.getByText('Unlock with Pro')).toBeTruthy();
    expect(screen.getByText('PRO')).toBeTruthy();
    expect(screen.getByTestId('lock-icon')).toBeTruthy();
  });

  it('renders BUSINESS badge when tier="business"', () => {
    render(
      <LockedFeatureCard
        icon={<Sparkles />}
        title="t"
        description="d"
        tier="business"
      />,
    );
    expect(screen.getByText('BUSINESS')).toBeTruthy();
  });

  it('uses the title in font-display (Playfair)', () => {
    render(
      <LockedFeatureCard
        icon={<Sparkles />}
        title="Hello title"
        description="d"
      />,
    );
    const title = screen.getByText('Hello title');
    expect(title.tagName).toBe('H2');
    expect(title.className).toMatch(/font-display/);
    expect(title.className).toMatch(/font-bold/);
  });

  it('renders default Pro CTA label when onUpgrade is provided', () => {
    render(
      <LockedFeatureCard
        icon={<Sparkles />}
        title="t"
        description="d"
        onUpgrade={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Upgrade to Pro' })).toBeTruthy();
  });

  it('renders default Business CTA label when tier="business"', () => {
    render(
      <LockedFeatureCard
        icon={<Sparkles />}
        title="t"
        description="d"
        tier="business"
        onUpgrade={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Upgrade to Business' }),
    ).toBeTruthy();
  });

  it('uses a custom CTA label when provided', () => {
    render(
      <LockedFeatureCard
        icon={<Sparkles />}
        title="t"
        description="d"
        ctaLabel="Get access"
        onUpgrade={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Get access' })).toBeTruthy();
  });

  it('does not render a CTA button when onUpgrade is omitted', () => {
    render(
      <LockedFeatureCard icon={<Sparkles />} title="t" description="d" />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('fires onUpgrade when the CTA is clicked', async () => {
    const user = userEvent.setup();
    const onUpgrade = vi.fn();
    render(
      <LockedFeatureCard
        icon={<Sparkles />}
        title="t"
        description="d"
        onUpgrade={onUpgrade}
      />,
    );
    await user.click(screen.getByRole('button'));
    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it('uses emerald primary styling on the CTA button', () => {
    render(
      <LockedFeatureCard
        icon={<Sparkles />}
        title="t"
        description="d"
        onUpgrade={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/bg-emerald-500/);
    expect(btn.className).toMatch(/text-white/);
    expect(btn.className).toMatch(/rounded-btn/);
  });

  it('forwards data-testid', () => {
    render(
      <LockedFeatureCard
        icon={<Sparkles />}
        title="t"
        description="d"
        data-testid="locked-card"
      />,
    );
    expect(screen.getByTestId('locked-card')).toBeTruthy();
  });
});
