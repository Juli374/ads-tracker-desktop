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

    await screen.findByRole('heading', { name: 'Обзор' });
    await user.click(screen.getByRole('button', { name: /Книги/ }));

    await screen.findByRole('heading', { name: 'Книги' });
    const bookCell = await screen.findByText('Test Book');
    await user.click(bookCell);

    expect(
      await screen.findByRole('heading', { name: 'Кампании' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText('Сбросить книгу'),
    ).toBeInTheDocument();
  });

  it('Campaigns → SearchTerms: клик по строке кампании переключает на SearchTerms с chip-кампанией', async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole('heading', { name: 'Обзор' });
    await user.click(screen.getByRole('button', { name: /Кампании/ }));
    await screen.findByRole('heading', { name: 'Кампании' });

    const campaignRow = await screen.findByText('Test Campaign');
    await user.click(campaignRow);

    expect(
      await screen.findByRole('heading', { name: 'Поисковые запросы' }),
    ).toBeInTheDocument();
    const chips = await screen.findAllByText(/кампания #100/);
    expect(chips.length).toBeGreaterThan(0);
  });
});
