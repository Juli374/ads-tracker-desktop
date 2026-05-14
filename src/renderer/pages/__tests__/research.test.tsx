// Phase M.1 — ResearchPage tests.
//
// Covers:
//   1. Renders the keyword/ASIN sub-tabs + query inputs when unlocked.
//   2. After "Add row" the manual editor populates the keyword table.
//   3. tier=start → page is locked behind the upgrade CTA.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { ResearchPage } from '../ResearchPage';
import { ToastProvider } from '../../contexts/ToastContext';
import { NavProvider } from '../../contexts/NavContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { EntitlementsProvider } from '../../contexts/EntitlementsContext';
import { MarketplacesProvider } from '../../contexts/MarketplacesContext';
import { BooksProvider } from '../../contexts/BooksContext';
import { GlobalFiltersProvider } from '../../contexts/GlobalFiltersContext';
import { installMockApi, mockApiResponses } from '../../../test/mockApi';

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

describe('ResearchPage', () => {
  beforeEach(() => {
    // Reset localStorage so saved projects don't leak between tests.
    window.localStorage.clear();
  });

  it('renders keyword/ASIN tabs + query inputs when tier=pro', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'pro' },
    });
    render(
      <Wrap>
        <ResearchPage />
      </Wrap>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('research-page')).toBeInTheDocument();
    });
    // Tab switcher + both tab buttons.
    expect(screen.getByTestId('research-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('research-tab-keyword')).toBeInTheDocument();
    expect(screen.getByTestId('research-tab-asin')).toBeInTheDocument();
    // Keyword tab is the default → keyword input is present.
    expect(screen.getByTestId('research-keyword-input')).toBeInTheDocument();
    // Marketplace + CSV import always present.
    expect(screen.getByTestId('research-marketplace-select')).toBeInTheDocument();
    expect(screen.getByTestId('niche-csv-import-btn')).toBeInTheDocument();

    // Switching to "By ASIN" reveals the ASIN input.
    const user = userEvent.setup();
    await user.click(screen.getByTestId('research-tab-asin'));
    expect(screen.getByTestId('research-asin-input')).toBeInTheDocument();
    expect(screen.queryByTestId('research-keyword-input')).toBeNull();
  });

  it('Add row in manual editor populates the keyword table', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'pro' },
    });
    render(
      <Wrap>
        <ResearchPage />
      </Wrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('research-page')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    // Open the manual editor.
    await user.click(screen.getByTestId('research-manual-toggle'));
    expect(screen.getByTestId('research-manual-editor')).toBeInTheDocument();
    // Add a row.
    await user.click(screen.getByTestId('research-manual-add-row'));

    // The keyword table (NicheKeywordTable) now has one row — its empty-state
    // disappears and the table itself renders.
    await waitFor(() => {
      expect(screen.queryByTestId('niche-table-empty')).toBeNull();
      expect(screen.getByTestId('niche-keyword-table')).toBeInTheDocument();
    });
    // Manual editor has matching row inputs.
    expect(screen.getByTestId('research-manual-asin-0')).toBeInTheDocument();
    expect(screen.getByTestId('research-manual-title-0')).toBeInTheDocument();
  });

  it('shows the locked upgrade card when tier=start', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'start' },
    });
    render(
      <Wrap>
        <ResearchPage />
      </Wrap>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('research-page-locked')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('research-page')).toBeNull();
    // Upgrade CTA is wrapped in LockedFeature — its CTA testid exists.
    expect(
      screen.getByTestId('locked-feature-cta-ai.niche_explorer'),
    ).toBeInTheDocument();
  });
});
