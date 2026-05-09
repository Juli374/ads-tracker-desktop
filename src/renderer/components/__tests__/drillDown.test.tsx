import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  installMockApi({ responses: mockApiResponses() });
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
  it('Books → Campaigns: клик по строке книги ставит global bookId и переключает на Campaigns', async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByTestId('dashboard-page');
    await user.click(screen.getByTestId('nav-books'));

    await screen.findByTestId('books-page');
    const bookCell = await screen.findByText('Test Book');
    await user.click(bookCell);

    expect(
      await screen.findByTestId('campaigns-page'),
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText('globalFilters.books.resetAria'),
    ).toBeInTheDocument();
  });

  it('Campaigns → CampaignDetails: клик по строке кампании ведёт на детали', async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByTestId('dashboard-page');
    await user.click(screen.getByTestId('nav-campaigns'));
    await screen.findByTestId('campaigns-page');

    const campaignRow = await screen.findByText('Test Campaign');
    await user.click(campaignRow);

    // На детали попадаем — заголовок страницы = имя кампании.
    const headings = await screen.findAllByRole('heading', { name: 'Test Campaign' });
    expect(headings.length).toBeGreaterThan(0);
    // Табы рендерятся
    expect(await screen.findByTestId('details-tab-ad_groups')).toBeInTheDocument();
    expect(await screen.findByTestId('details-tab-targets')).toBeInTheDocument();
  });
});
