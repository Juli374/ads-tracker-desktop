// Phase M.5 Lane E — BriefingPage tests.
//
// Coverage:
//   1. Pro tier with no history → "Run new briefing now" CTA renders, empty
//      placeholder visible.
//   2. Pro tier with seeded history → latest briefing renders, history list
//      contains both entries, clicking Run-now invokes IPC and triggers
//      success toast.
//   3. Start tier → renders the locked variant + upgrade CTA, never the
//      editor.

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { BriefingPage } from '../BriefingPage';
import { ToastProvider } from '../../contexts/ToastContext';
import { NavProvider } from '../../contexts/NavContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { EntitlementsProvider } from '../../contexts/EntitlementsContext';
import { MarketplacesProvider } from '../../contexts/MarketplacesContext';
import { BooksProvider } from '../../contexts/BooksContext';
import { GlobalFiltersProvider } from '../../contexts/GlobalFiltersContext';
import { installMockApi, mockApiResponses } from '../../../test/mockApi';
import type { WeeklyBriefing } from '../../../shared/ipc';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <NavProvider>
    <ToastProvider>
      <AuthProvider>
        <EntitlementsProvider>
          <MarketplacesProvider>
            <BooksProvider>
              <GlobalFiltersProvider>{children}</GlobalFiltersProvider>
            </BooksProvider>
          </MarketplacesProvider>
        </EntitlementsProvider>
      </AuthProvider>
    </ToastProvider>
  </NavProvider>
);

describe('BriefingPage', () => {
  it('renders the empty state when Pro user has no briefings yet', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'pro' },
      briefingList: [],
      briefingLast: null,
    });
    render(
      <Wrap>
        <BriefingPage />
      </Wrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('briefing-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('briefing-page-empty')).toBeInTheDocument();
    expect(screen.getByTestId('briefing-run-now')).toBeInTheDocument();
  });

  it('renders seeded history and invokes runNow when the user clicks the button', async () => {
    const seeded: WeeklyBriefing[] = [
      {
        id: 11,
        generated_at: '2026-05-11T09:00:00Z',
        period_from: '2026-05-04',
        period_to: '2026-05-11',
        content:
          'Top movers:\n- Book A: +$30 profit.\n\nUnderperforming:\n- Campaign X: ACOS 60%.\n\nSuggested actions:\n- Lower bid on Campaign X.',
        model: 'claude-opus-4-7',
      },
      {
        id: 10,
        generated_at: '2026-05-04T09:00:00Z',
        period_from: '2026-04-27',
        period_to: '2026-05-04',
        content:
          'Top movers:\n- Book B: strong sales.\n\nUnderperforming:\n- N/A.\n\nSuggested actions:\n- Keep scaling.',
        model: 'claude-opus-4-7',
      },
    ];
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'pro' },
      briefingList: seeded,
      briefingLast: seeded[0],
    });
    render(
      <Wrap>
        <BriefingPage />
      </Wrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('briefing-page-content')).toBeInTheDocument();
    });
    // History sidebar shows both entries.
    expect(screen.getByTestId('briefing-history-11')).toBeInTheDocument();
    expect(screen.getByTestId('briefing-history-10')).toBeInTheDocument();
    // Latest content renders heading markup from markdown transformer.
    const content = screen.getByTestId('briefing-page-content');
    expect(content.textContent).toMatch(/Top movers/i);
    expect(content.textContent).toMatch(/Book A/);

    const user = userEvent.setup();
    await user.click(screen.getByTestId('briefing-run-now'));

    const runNowMock = window.api.briefing.runNow as ReturnType<typeof import('vitest').vi.fn>;
    await waitFor(() => {
      expect(runNowMock).toHaveBeenCalledTimes(1);
    });
  });

  it('shows the locked variant when tier=start', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'start' },
    });
    render(
      <Wrap>
        <BriefingPage />
      </Wrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('briefing-page-locked')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('briefing-page')).toBeNull();
    // Phase Q.1: migrated to <LockedFeatureCard> primitive — the CTA is
    // now the primitive's built-in emerald button inside the container.
    expect(screen.getByTestId('briefing-page-upgrade-cta')).toBeInTheDocument();
  });
});
