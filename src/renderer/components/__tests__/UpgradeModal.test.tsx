import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { installMockApi } from '../../../test/mockApi';
import { EntitlementsProvider } from '../../contexts/EntitlementsContext';
import { UpgradeModal } from '../UpgradeModal';

describe('UpgradeModal', () => {
  it('renders 3 plan cards when open', async () => {
    installMockApi({ entitlements: { tier: 'start' } });
    render(
      <EntitlementsProvider>
        <UpgradeModal open onClose={() => undefined} />
      </EntitlementsProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();
    });
    expect(screen.getByTestId('upgrade-plan-start')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-plan-pro')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-plan-business')).toBeInTheDocument();
  });

  it('clicking Upgrade CTA invokes shell.openExternal with billing URL', async () => {
    installMockApi({ entitlements: { tier: 'start' } });
    const user = userEvent.setup();
    render(
      <EntitlementsProvider>
        <UpgradeModal
          open
          onClose={() => undefined}
          triggeredBy="ai.advisor_panel"
        />
      </EntitlementsProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();
    });

    const openExternal = window.api.shell.openExternal as ReturnType<typeof vi.fn>;
    // CTA on recommended (pro by default) plan card.
    await user.click(screen.getByTestId('upgrade-cta-pro'));

    expect(openExternal).toHaveBeenCalledTimes(1);
    const url = openExternal.mock.calls[0][0] as string;
    expect(url).toMatch(/^https:\/\/ads-tracker\.app\/billing\?/);
    expect(url).toContain('feature=ai.advisor_panel');
    expect(url).toContain('from=feature');
  });

  it('returns null when open=false', async () => {
    installMockApi({});
    render(
      <EntitlementsProvider>
        <UpgradeModal open={false} onClose={() => undefined} />
      </EntitlementsProvider>,
    );
    expect(screen.queryByTestId('upgrade-modal')).toBeNull();
  });
});
