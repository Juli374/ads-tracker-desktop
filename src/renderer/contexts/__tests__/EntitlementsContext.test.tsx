import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';
import { installMockApi } from '../../../test/mockApi';
import {
  EntitlementsProvider,
  useEntitlements,
} from '../EntitlementsContext';
import {
  EMPTY_ENTITLEMENTS,
  Entitlements,
  ALL_FEATURE_KEYS,
  type FeatureState,
} from '../../../shared/entitlements';

function makeEntitlements(overrides: Partial<Entitlements>): Entitlements {
  const features = Object.fromEntries(
    ALL_FEATURE_KEYS.map((k) => [k, { state: 'on' } as FeatureState]),
  ) as Entitlements['features'];
  return {
    v: 1,
    issued_at: '2026-05-14T00:00:00Z',
    expires_at: '2026-05-14T01:00:00Z',
    user_id: 1,
    tier: 'pro',
    subscription: { status: 'active' },
    features,
    sig: 'test-sig',
    ...overrides,
  };
}

const Probe: React.FC = () => {
  const { tier, isOn, refresh } = useEntitlements();
  return (
    <div>
      <div data-testid="tier">{tier}</div>
      <div data-testid="advisor-on">{String(isOn('ai.advisor_panel'))}</div>
      <button onClick={refresh}>refresh</button>
    </div>
  );
};

describe('EntitlementsContext', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('fetches initial entitlements via IPC and exposes tier', async () => {
    const pro = makeEntitlements({ tier: 'pro' });
    installMockApi({ entitlements: pro });
    render(
      <EntitlementsProvider>
        <Probe />
      </EntitlementsProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('tier').textContent).toBe('pro');
    });
    expect(screen.getByTestId('advisor-on').textContent).toBe('true');
  });

  it('refresh() re-fetches and updates state', async () => {
    const start = makeEntitlements({ tier: 'start' });
    installMockApi({ entitlements: start });
    // Override refresh() to return a *different* snapshot so we can assert
    // that the new value propagates.
    const pro = makeEntitlements({ tier: 'pro' });
    (window.api.entitlements.refresh as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      pro,
    );

    render(
      <EntitlementsProvider>
        <Probe />
      </EntitlementsProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('tier').textContent).toBe('start');
    });

    await act(async () => {
      screen.getByText('refresh').click();
    });
    await waitFor(() => {
      expect(screen.getByTestId('tier').textContent).toBe('pro');
    });
  });

  it('onChange push updates state in renderer', async () => {
    let pushHandler: ((e: Entitlements) => void) | null = null;
    installMockApi({ entitlements: EMPTY_ENTITLEMENTS });
    (window.api.entitlements.onChange as ReturnType<typeof vi.fn>).mockImplementation(
      (handler: (e: Entitlements) => void) => {
        pushHandler = handler;
        return () => undefined;
      },
    );

    render(
      <EntitlementsProvider>
        <Probe />
      </EntitlementsProvider>,
    );
    await waitFor(() => {
      // Default in EMPTY_ENTITLEMENTS is 'start'
      expect(screen.getByTestId('tier').textContent).toBe('start');
    });

    expect(pushHandler).toBeTruthy();
    await act(async () => {
      pushHandler!(makeEntitlements({ tier: 'business' }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('tier').textContent).toBe('business');
    });
  });
});
