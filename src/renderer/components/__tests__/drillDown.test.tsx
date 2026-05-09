import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

    await user.click(screen.getByRole('button', { name: /Книги/ }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Книги' })).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByText('Test Book')).toBeInTheDocument());

    const bookCell = screen.getByText('Test Book');
    await user.click(bookCell);

    // После drill-down: страница Campaigns + global Book filter в topbar показывает Test Book
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Кампании' })).toBeInTheDocument(),
    );
    // Кнопка-сброс «Сбросить книгу» свидетельствует что global bookId установлен
    await waitFor(() =>
      expect(screen.getByLabelText('Сбросить книгу')).toBeInTheDocument(),
    );
  });

  it('Campaigns → SearchTerms: клик по строке кампании переключает на SearchTerms с chip-кампанией', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /Кампании/ }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Кампании' })).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByText('Test Campaign')).toBeInTheDocument());

    await user.click(screen.getByText('Test Campaign'));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Поисковые запросы' }),
      ).toBeInTheDocument();
    });
    await waitFor(() => {
      const chip = screen.getByTitle('Сбросить фильтр по кампании');
      expect(within(chip).getByText(/кампания #100/)).toBeInTheDocument();
    });
  });
});
