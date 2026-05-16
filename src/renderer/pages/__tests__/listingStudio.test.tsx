// Phase L Lane A — ListingStudioPage tests.
//
// Covers:
//   1. Renders the ASIN picker + task tabs when unlocked (tier=pro).
//   2. Clicking Regenerate dispatches `ai:generate` with the expected payload.
//   3. Clicking Apply dispatches PUT /api/books/:id with the AI text.
//   4. tier=start → renders the upgrade card, no editor.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ListingStudioPage } from '../ListingStudioPage';
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

describe('ListingStudioPage', () => {
  beforeEach(() => {
    // Reset window.localStorage between tests so variant history doesn't bleed.
    window.localStorage.clear();
  });

  it('renders the ASIN picker + task tabs when unlocked (tier=pro)', async () => {
    installMockApi({
      responses: {
        ...mockApiResponses(),
        '/api/books': [
          { id: 1, title: 'Test Book', subtitle: null, cover_image: null, account: 'Test', publication_date: null },
        ],
      },
      entitlements: { tier: 'pro' },
    });
    render(
      <Wrap>
        <ListingStudioPage />
      </Wrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('listing-studio-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('listing-studio-asin-picker')).toBeInTheDocument();
    expect(screen.getByTestId('listing-task-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('listing-tab-title')).toBeInTheDocument();
    expect(screen.getByTestId('listing-tab-aPlus')).toBeInTheDocument();
  });

  it('clicking Regenerate dispatches ai:generate with task + asin', async () => {
    installMockApi({
      responses: {
        ...mockApiResponses(),
        '/api/books': [
          {
            id: 1,
            title: 'Old Title',
            subtitle: null,
            cover_image: null,
            account: 'Test',
            publication_date: null,
            asins: [{ id: 11, marketplace: 'USA', asin: 'B0TESTASIN', format: 'kindle', price: 0.99, is_active: 1 }],
          },
        ],
      },
      entitlements: { tier: 'pro' },
      aiGenerateResult: {
        text: 'Sharper New Title',
        rationale: 'Punchier and keyword-rich.',
        model: 'claude-opus-4-7',
      },
    });
    render(
      <Wrap>
        <ListingStudioPage />
      </Wrap>,
    );
    // Wait for the books context to finish loading — the picker is enabled
    // (i.e. has at least one option) only after BooksContext.fetch resolves.
    await waitFor(() => {
      const picker = screen.getByTestId('listing-studio-asin-picker') as HTMLSelectElement;
      expect(picker.options.length).toBeGreaterThan(0);
      expect(picker.options[0].textContent).not.toMatch(/No books available/i);
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId('listing-studio-regenerate'));

    // Verify the IPC mock was invoked with the right shape.
    const generateMock = window.api.ai.generate as ReturnType<typeof import('vitest').vi.fn>;
    await waitFor(() => {
      expect(generateMock).toHaveBeenCalledTimes(1);
    });
    const arg = generateMock.mock.calls[0][0];
    expect(arg.task).toBe('title');
    expect(arg.asin).toBe('B0TESTASIN');

    // Proposed text appears in the right-hand proposed pane.
    await waitFor(() => {
      const proposed = screen.getByTestId('listing-side-proposed');
      expect(proposed.textContent).toMatch(/Sharper New Title/);
    });
    // Rationale appears.
    expect(screen.getByTestId('listing-side-rationale')).toBeInTheDocument();
  });

  it('clicking Apply sends PUT /api/books/:id with the proposed title', async () => {
    installMockApi({
      responses: {
        ...mockApiResponses(),
        '/api/books': [
          {
            id: 42,
            title: 'Old Title',
            subtitle: null,
            cover_image: null,
            account: 'Test',
            publication_date: null,
            asins: [{ id: 11, marketplace: 'USA', asin: 'B0APPLY01', format: 'kindle', price: 0.99, is_active: 1 }],
          },
        ],
        // Books PUT must be mocked so the call succeeds. mockApi's `request`
        // returns 404 by default for unmocked paths; we add a permissive entry.
        '/api/books/42': { message: 'updated' },
      },
      entitlements: { tier: 'pro' },
      aiGenerateResult: {
        text: 'Brand New Title',
        rationale: 'Catchy.',
        model: 'claude-opus-4-7',
      },
    });
    render(
      <Wrap>
        <ListingStudioPage />
      </Wrap>,
    );
    await waitFor(() => {
      const picker = screen.getByTestId('listing-studio-asin-picker') as HTMLSelectElement;
      expect(picker.options.length).toBeGreaterThan(0);
      expect(picker.options[0].textContent).not.toMatch(/No books available/i);
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('listing-studio-regenerate'));
    // Wait until the proposed pane shows the new text — scope the search to
    // the proposed column so the dropdown option doesn't collide.
    await waitFor(() => {
      const proposed = screen.getByTestId('listing-side-proposed');
      expect(proposed.textContent).toMatch(/Brand New Title/);
    });

    await user.click(screen.getByTestId('listing-studio-apply'));

    const requestMock = window.api.request as ReturnType<typeof import('vitest').vi.fn>;
    await waitFor(() => {
      // Find the PUT /api/books/42 call.
      const putCall = requestMock.mock.calls.find(
        (c) => c[0].method === 'PUT' && c[0].path === '/api/books/42',
      );
      expect(putCall).toBeDefined();
      expect((putCall as unknown as [{ body: { title: string } }])[0].body).toEqual({
        title: 'Brand New Title',
      });
    });
  });

  it('renders the locked upgrade card when tier=start', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'start' },
    });
    render(
      <Wrap>
        <ListingStudioPage />
      </Wrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('listing-studio-page-locked')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('listing-studio-page')).toBeNull();
    // Phase Q.1: migrated to <LockedFeatureCard> primitive — testid sits on
    // the primitive container; CTA is its built-in button.
    expect(screen.getByTestId('listing-studio-upgrade-cta')).toBeInTheDocument();
  });
});
