import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import { SearchTermsPage } from '../SearchTermsPage';
import { ToastProvider } from '../../contexts/ToastContext';
import { NavProvider } from '../../contexts/NavContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { MarketplacesProvider } from '../../contexts/MarketplacesContext';
import { BooksProvider } from '../../contexts/BooksContext';
import { GlobalFiltersProvider } from '../../contexts/GlobalFiltersContext';
import { installMockApi, mockApiResponses } from '../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <NavProvider>
    <ToastProvider>
      <AuthProvider>
        <MarketplacesProvider>
          <BooksProvider>
            <GlobalFiltersProvider>{children}</GlobalFiltersProvider>
          </BooksProvider>
        </MarketplacesProvider>
      </AuthProvider>
    </ToastProvider>
  </NavProvider>
);

beforeEach(() => {
  installMockApi({ responses: mockApiResponses() });
});

/**
 * Phase J.1 Lane A — SearchTerms inbox workflow tests.
 *
 * These tests avoid `userEvent.setup()` (which uses fake timers and adds
 * setup overhead) in favour of `fireEvent` — faster, no async timer plumbing,
 * and sufficient for asserting UI state transitions.
 */
describe('SearchTermsPage — Phase J.1 Lane A inbox workflow', () => {
  it('renders 6 inbox-status tabs with count badges from mock', async () => {
    render(
      <Wrap>
        <SearchTermsPage />
      </Wrap>,
    );
    await screen.findByTestId('search_terms-page');

    // All 6 tabs in order.
    for (const id of [
      'inbox',
      'snoozed',
      'done',
      'archived_pause',
      'archived_final',
      'all',
    ]) {
      expect(await screen.findByTestId(`tab-${id}`)).toBeInTheDocument();
    }

    // Counts from mock: inbox:3, snoozed:2, done:5, archived_pause:1,
    // archived_final:4, total:15.
    await waitFor(() => {
      expect(screen.getByTestId('tab-inbox-count')).toHaveTextContent('3');
    });
    expect(screen.getByTestId('tab-snoozed-count')).toHaveTextContent('2');
    expect(screen.getByTestId('tab-done-count')).toHaveTextContent('5');
    expect(screen.getByTestId('tab-archived_pause-count')).toHaveTextContent('1');
    expect(screen.getByTestId('tab-archived_final-count')).toHaveTextContent('4');
    expect(screen.getByTestId('tab-all-count')).toHaveTextContent('15');
  });

  it('bulk-select-bar reflects count and offers pause/snooze/move actions', async () => {
    render(
      <Wrap>
        <SearchTermsPage />
      </Wrap>,
    );
    await screen.findByTestId('search_terms-page');

    // Wait for 3 rows to render.
    await screen.findByTestId('term-row-1');
    await screen.findByTestId('term-row-2');
    await screen.findByTestId('term-row-3');

    // No bulk bar before selection.
    expect(screen.queryByTestId('bulk-select-bar')).not.toBeInTheDocument();

    // Select all 3 rows.
    fireEvent.click(screen.getByTestId('term-row-1-checkbox'));
    fireEvent.click(screen.getByTestId('term-row-2-checkbox'));
    fireEvent.click(screen.getByTestId('term-row-3-checkbox'));

    // Bulk bar appears with full action set (Phase J.1 Lane A).
    // Note: testbed's i18n mock returns keys-as-strings (see src/test/setup.ts),
    // so we assert by presence of action testids rather than translated text.
    expect(await screen.findByTestId('bulk-select-bar')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-pause')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-snooze')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-move')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-done')).toBeInTheDocument();
  });

  it('opens snooze modal with presets and closes via Esc', async () => {
    render(
      <Wrap>
        <SearchTermsPage />
      </Wrap>,
    );
    await screen.findByTestId('search_terms-page');
    await screen.findByTestId('term-row-1');

    fireEvent.click(screen.getByTestId('term-row-1-checkbox'));
    fireEvent.click(await screen.findByTestId('bulk-snooze'));

    const modal = await screen.findByTestId('snooze-modal');
    expect(modal).toBeInTheDocument();

    // 4 preset buttons rendered.
    expect(screen.getByTestId('snooze-preset-1d')).toBeInTheDocument();
    expect(screen.getByTestId('snooze-preset-3d')).toBeInTheDocument();
    expect(screen.getByTestId('snooze-preset-7d')).toBeInTheDocument();
    expect(screen.getByTestId('snooze-preset-custom')).toBeInTheDocument();

    // Custom date input appears when "custom" preset is picked.
    fireEvent.click(screen.getByTestId('snooze-preset-custom'));
    expect(await screen.findByTestId('snooze-custom-date')).toBeInTheDocument();

    // Esc closes modal.
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('snooze-modal')).not.toBeInTheDocument();
    });
  });

  it('rank history modal renders graceful empty/unsupported state when backend endpoint is absent', async () => {
    render(
      <Wrap>
        <SearchTermsPage />
      </Wrap>,
    );
    await screen.findByTestId('search_terms-page');
    await screen.findByTestId('term-row-1');

    // The row-level "rank" action button is rendered (opacity controlled by
    // hover CSS, but the DOM node exists from the start).
    fireEvent.click(screen.getByTestId('term-row-1-rank'));

    const modal = await screen.findByTestId('rank-history-modal');
    expect(modal).toBeInTheDocument();

    // Mock returns 404 for `/api/search-terms/:id/rank-history` — getRankHistory
    // swallows it and returns null, which the modal renders as a graceful
    // empty / "unsupported" message rather than crashing.
    await waitFor(() => {
      const text = modal.textContent ?? '';
      const isGracefulEmpty =
        text.includes('not available') ||
        text.includes('No rank data') ||
        text.includes('rankHistory.unsupported') ||
        text.includes('rankHistory.empty');
      expect(isGracefulEmpty).toBe(true);
    });
  });

  it('right pane toggle reveals NegativeListsTab in a side column', async () => {
    render(
      <Wrap>
        <SearchTermsPage />
      </Wrap>,
    );
    await screen.findByTestId('search_terms-page');

    // Initially hidden.
    expect(screen.queryByTestId('search-terms-right-pane')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('toggle-right-pane'));
    expect(await screen.findByTestId('search-terms-right-pane')).toBeInTheDocument();
  });
});
