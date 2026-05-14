import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { KeywordsPage } from '../../../pages/KeywordsPage';
import { ToastProvider } from '../../../contexts/ToastContext';
import { NavProvider } from '../../../contexts/NavContext';
import { AuthProvider } from '../../../contexts/AuthContext';
import { EntitlementsProvider } from '../../../contexts/EntitlementsContext';
import { MarketplacesProvider } from '../../../contexts/MarketplacesContext';
import { BooksProvider } from '../../../contexts/BooksContext';
import { GlobalFiltersProvider } from '../../../contexts/GlobalFiltersContext';
import { installMockApi, mockApiResponses } from '../../../../test/mockApi';

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

// Sample Publisher Rocket CSV — matches the shape PR's "Reverse ASIN"
// tool exports today (Title-Case header, 4 columns).
const SAMPLE_CSV = [
  'Keyword,Search Volume,Competing Products,Estimated Clicks',
  'crockpot recipes,12500,3200,890',
  'slow cooker dinner ideas,8400,1900,540',
  'pressure cooker cookbook,5200,2100,310',
  'instant pot cookbook,9700,4100,620',
  'easy weeknight meals,6300,1500,410',
].join('\n');

beforeEach(() => {
  window.localStorage.clear();
});

describe('ReverseAsinPanel', () => {
  it('renders the ASIN input and import button after switching to the tab', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'pro' },
    });
    const user = userEvent.setup();

    render(
      <Wrap>
        <KeywordsPage />
      </Wrap>,
    );

    await screen.findByTestId('keywords-page');
    // The Reverse-ASIN tab button is visible from the start.
    const tabBtn = await screen.findByTestId('keywords-tab-reverseAsin');
    await user.click(tabBtn);

    await waitFor(() => {
      expect(screen.getByTestId('reverse-asin-panel')).toBeInTheDocument();
    });
    expect(screen.getByTestId('reverse-asin-input')).toBeInTheDocument();
    expect(screen.getByTestId('reverse-asin-import-btn')).toBeInTheDocument();
    // Empty state before any CSV is loaded.
    expect(screen.getByTestId('reverse-asin-empty')).toBeInTheDocument();
  });

  it('parses an imported CSV and renders one row per keyword', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'pro' },
    });
    const user = userEvent.setup();

    render(
      <Wrap>
        <KeywordsPage />
      </Wrap>,
    );
    await user.click(await screen.findByTestId('keywords-tab-reverseAsin'));

    // Drop the CSV directly through the hidden file input. We bypass the
    // visible "Import…" button because clicking it just delegates to
    // fileInputRef.current.click() — same end state, fewer mocks.
    const fileInput = (await screen.findByTestId(
      'reverse-asin-file-input',
    )) as HTMLInputElement;
    const file = new File([SAMPLE_CSV], 'pr-export.csv', { type: 'text/csv' });
    await user.upload(fileInput, file);

    // Wait for the table to render — proves parser ran + state updated.
    await waitFor(() => {
      expect(screen.getByTestId('reverse-asin-table')).toBeInTheDocument();
    });
    expect(screen.getByTestId('reverse-asin-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('reverse-asin-row-4')).toBeInTheDocument();
    // Phrase from the CSV should be on the page.
    expect(screen.getByText('crockpot recipes')).toBeInTheDocument();
  });

  it('shows the bulk toolbar with Send / Negatives buttons after selection', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'pro' },
    });
    const user = userEvent.setup();

    render(
      <Wrap>
        <KeywordsPage />
      </Wrap>,
    );
    await user.click(await screen.findByTestId('keywords-tab-reverseAsin'));

    const fileInput = (await screen.findByTestId(
      'reverse-asin-file-input',
    )) as HTMLInputElement;
    const file = new File([SAMPLE_CSV], 'pr-export.csv', { type: 'text/csv' });
    await user.upload(fileInput, file);
    await screen.findByTestId('reverse-asin-table');

    // Select-all flips every row into the selection set.
    await user.click(screen.getByTestId('reverse-asin-select-all'));
    expect(
      await screen.findByTestId('reverse-asin-bulk-toolbar'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('reverse-asin-send-btn')).toBeInTheDocument();
    expect(screen.getByTestId('reverse-asin-negative-btn')).toBeInTheDocument();
  });

  it('"Send to ad group" opens a modal that loads candidate ad groups', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'pro' },
    });
    const user = userEvent.setup();

    render(
      <Wrap>
        <KeywordsPage />
      </Wrap>,
    );
    await user.click(await screen.findByTestId('keywords-tab-reverseAsin'));

    const fileInput = (await screen.findByTestId(
      'reverse-asin-file-input',
    )) as HTMLInputElement;
    await user.upload(
      fileInput,
      new File([SAMPLE_CSV], 'pr-export.csv', { type: 'text/csv' }),
    );
    await screen.findByTestId('reverse-asin-table');

    // Select one row, then open the Send-to-ad-group modal.
    await user.click(screen.getByTestId('reverse-asin-row-checkbox-0'));
    await user.click(await screen.findByTestId('reverse-asin-send-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('reverse-asin-send-modal')).toBeInTheDocument();
    });
    // After ad groups load, the select becomes interactive — at minimum the
    // mocked AG-1 from `/api/campaigns/100/ad-groups` should be an option.
    await waitFor(() => {
      expect(screen.getByTestId('reverse-asin-adgroup-select')).toBeInTheDocument();
    });
    const select = screen.getByTestId(
      'reverse-asin-adgroup-select',
    ) as HTMLSelectElement;
    // Wait until the loaded options replace the placeholder-only state.
    await waitFor(() => {
      expect(select.options.length).toBeGreaterThan(1);
    });
    expect(
      Array.from(select.options).some((o) => o.textContent === 'AG-1'),
    ).toBe(true);
  });

  it('renders the locked CTA overlay when tier=start (ai.reverse_asin off)', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'start' },
    });
    const user = userEvent.setup();

    render(
      <Wrap>
        <KeywordsPage />
      </Wrap>,
    );
    await user.click(await screen.findByTestId('keywords-tab-reverseAsin'));

    // LockedFeature wrapper renders the dimmed children + a CTA button.
    await waitFor(() => {
      expect(
        screen.getByTestId('locked-feature-ai.reverse_asin'),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('locked-feature-cta-ai.reverse_asin'),
    ).toBeInTheDocument();
  });
});
