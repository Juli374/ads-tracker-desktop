import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { installMockApi } from '../../../test/mockApi';
import { EntitlementsProvider } from '../../contexts/EntitlementsContext';
import { LockedFeature } from '../LockedFeature';
import {
  Entitlements,
  ALL_FEATURE_KEYS,
  type FeatureState,
} from '../../../shared/entitlements';

function withTier(tier: 'start' | 'pro' | 'business'): Partial<Entitlements> {
  const features = Object.fromEntries(
    ALL_FEATURE_KEYS.map((k) => [
      k,
      tier === 'start'
        ? ({ state: 'off', reason: 'tier' } as FeatureState)
        : ({ state: 'on' } as FeatureState),
    ]),
  ) as Entitlements['features'];
  return { tier, features };
}

describe('LockedFeature', () => {
  it('renders children unchanged when feature is on', async () => {
    installMockApi({ entitlements: withTier('pro') });
    render(
      <EntitlementsProvider>
        <LockedFeature feature="ai.advisor_panel" mode="dim">
          <div data-testid="real-child">REAL</div>
        </LockedFeature>
      </EntitlementsProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('real-child')).toBeInTheDocument();
    });
    // CTA overlay should NOT exist
    expect(screen.queryByTestId('locked-feature-cta-ai.advisor_panel')).toBeNull();
  });

  it('mode=dim renders children dimmed with CTA overlay', async () => {
    installMockApi({ entitlements: withTier('start') });
    render(
      <EntitlementsProvider>
        <LockedFeature feature="ai.advisor_panel" mode="dim">
          <div data-testid="real-child">REAL</div>
        </LockedFeature>
      </EntitlementsProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('locked-feature-ai.advisor_panel')).toBeInTheDocument();
    });
    const wrap = screen.getByTestId('locked-feature-ai.advisor_panel');
    expect(wrap.getAttribute('data-mode')).toBe('dim');
    expect(screen.getByTestId('locked-feature-cta-ai.advisor_panel')).toBeInTheDocument();
  });

  it('mode=badge renders children + lock badge', async () => {
    installMockApi({ entitlements: withTier('start') });
    render(
      <EntitlementsProvider>
        <LockedFeature feature="marketplace.multi" mode="badge">
          <div data-testid="real-child">REAL</div>
        </LockedFeature>
      </EntitlementsProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('locked-feature-marketplace.multi')).toBeInTheDocument();
    });
    expect(screen.getByTestId('real-child')).toBeInTheDocument(); // child still rendered
    expect(screen.getByTestId('locked-feature-cta-marketplace.multi')).toBeInTheDocument();
  });

  it('clicking CTA opens UpgradeModal', async () => {
    installMockApi({ entitlements: withTier('start') });
    const user = userEvent.setup();
    render(
      <EntitlementsProvider>
        <LockedFeature feature="ai.advisor_panel" mode="dim">
          <div data-testid="real-child">REAL</div>
        </LockedFeature>
      </EntitlementsProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('locked-feature-cta-ai.advisor_panel')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('locked-feature-cta-ai.advisor_panel'));
    expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();
  });
});
