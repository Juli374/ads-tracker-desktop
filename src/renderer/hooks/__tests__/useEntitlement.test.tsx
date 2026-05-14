import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { installMockApi } from '../../../test/mockApi';
import {
  EntitlementsProvider,
} from '../../contexts/EntitlementsContext';
import { useEntitlement } from '../useEntitlement';
import {
  Entitlements,
  ALL_FEATURE_KEYS,
  type FeatureState,
} from '../../../shared/entitlements';

function makeEntitlements(overrides: Partial<Entitlements>): Entitlements {
  const features = Object.fromEntries(
    ALL_FEATURE_KEYS.map((k) => [k, { state: 'off', reason: 'tier' } as FeatureState]),
  ) as Entitlements['features'];
  return {
    v: 1,
    issued_at: '2026-05-14T00:00:00Z',
    expires_at: '2026-05-14T01:00:00Z',
    user_id: 1,
    tier: 'start',
    subscription: { status: 'none' },
    features,
    sig: 'test-sig',
    ...overrides,
  };
}

const Probe: React.FC<{ feature: 'ai.advisor_panel' | 'marketplace.multi' | 'ai.title_generator' }> = ({
  feature,
}) => {
  const r = useEntitlement(feature);
  return (
    <div>
      <div data-testid={`${feature}-on`}>{String(r.on)}</div>
      <div data-testid={`${feature}-state`}>{r.state.state}</div>
      <div data-testid={`${feature}-tier`}>{r.tierRequired}</div>
    </div>
  );
};

describe('useEntitlement', () => {
  beforeEach(() => {
    // reset DOM/api between tests
  });

  it('returns on=true for unlocked feature', async () => {
    installMockApi({
      entitlements: makeEntitlements({
        tier: 'pro',
        features: Object.fromEntries(
          ALL_FEATURE_KEYS.map((k) => [k, { state: 'on' } as FeatureState]),
        ) as Entitlements['features'],
      }),
    });
    render(
      <EntitlementsProvider>
        <Probe feature="ai.advisor_panel" />
      </EntitlementsProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('ai.advisor_panel-on').textContent).toBe('true');
    });
    expect(screen.getByTestId('ai.advisor_panel-state').textContent).toBe('on');
  });

  it('returns on=false with off-state for locked feature', async () => {
    installMockApi({ entitlements: makeEntitlements({ tier: 'start' }) });
    render(
      <EntitlementsProvider>
        <Probe feature="ai.advisor_panel" />
      </EntitlementsProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('ai.advisor_panel-on').textContent).toBe('false');
    });
    expect(screen.getByTestId('ai.advisor_panel-state').textContent).toBe('off');
  });

  it('reports trial state as on when until is in the future', async () => {
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const features = Object.fromEntries(
      ALL_FEATURE_KEYS.map((k) => [
        k,
        k === 'ai.title_generator'
          ? ({ state: 'trial', until: future } as FeatureState)
          : ({ state: 'off', reason: 'tier' } as FeatureState),
      ]),
    ) as Entitlements['features'];
    installMockApi({
      entitlements: makeEntitlements({ tier: 'start', features }),
    });
    render(
      <EntitlementsProvider>
        <Probe feature="ai.title_generator" />
      </EntitlementsProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('ai.title_generator-on').textContent).toBe('true');
    });
    expect(screen.getByTestId('ai.title_generator-state').textContent).toBe('trial');
  });

  it('computes correct tierRequired per feature', async () => {
    installMockApi({ entitlements: makeEntitlements({ tier: 'start' }) });
    render(
      <EntitlementsProvider>
        <Probe feature="marketplace.multi" />
        <Probe feature="ai.advisor_panel" />
      </EntitlementsProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('marketplace.multi-tier').textContent).toBe('business');
      expect(screen.getByTestId('ai.advisor_panel-tier').textContent).toBe('pro');
    });
  });
});
