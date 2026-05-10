import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { MainLayout } from '../MainLayout';
import { ToastProvider } from '../../contexts/ToastContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { MarketplacesProvider } from '../../contexts/MarketplacesContext';
import { BooksProvider } from '../../contexts/BooksContext';
import { GlobalFiltersProvider } from '../../contexts/GlobalFiltersContext';

import { installMockApi, mockApiResponses } from '../../../test/mockApi';

beforeEach(() => {
  installMockApi({
    responses: {
      ...mockApiResponses(),
      '/api/ratings/all-books': { ratings: [] },
      // Keep the mockApiResponses campaign list so CampaignDetails test can find 'Test Campaign'
    },
  });
});

const renderApp = () =>
  render(
    <ToastProvider>
      <AuthProvider>
        <MarketplacesProvider>
          <BooksProvider>
            <GlobalFiltersProvider>
              <MainLayout />
            </GlobalFiltersProvider>
          </BooksProvider>
        </MarketplacesProvider>
      </AuthProvider>
    </ToastProvider>,
  );

describe('drill-down navigation', () => {
  it('Books: clicking book row drills to marketplaces panel', async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByTestId('dashboard-page');
    await user.click(screen.getByTestId('nav-books'));

    await screen.findByTestId('books-page');
    const bookRow = await screen.findByTestId('book-row-1');
    fireEvent.click(bookRow);

    expect(await screen.findByTestId('books-marketplaces-panel')).toBeInTheDocument();
  });

  it('Campaigns → CampaignDetails: click on campaign row opens details', async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByTestId('dashboard-page');
    await user.click(screen.getByTestId('nav-campaigns'));
    await screen.findByTestId('campaigns-page');

    const campaignRow = await screen.findByText('Test Campaign');
    await user.click(campaignRow);

    // Details page renders - heading = campaign name.
    const headings = await screen.findAllByRole('heading', { name: 'Test Campaign' });
    expect(headings.length).toBeGreaterThan(0);
    // Tabs render
    expect(await screen.findByTestId('details-tab-ad_groups')).toBeInTheDocument();
    expect(await screen.findByTestId('details-tab-targets')).toBeInTheDocument();
  });
});
