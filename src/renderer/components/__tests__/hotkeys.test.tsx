import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

describe('keyboard hotkeys', () => {
  it('g+b переключает на Books', async () => {
    const user = userEvent.setup();
    renderApp();
    // Стартовая страница — Dashboard
    expect(screen.getByRole('heading', { name: 'Обзор' })).toBeInTheDocument();

    await user.keyboard('g');
    await user.keyboard('b');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Книги' })).toBeInTheDocument(),
    );
  });

  it('g+c переключает на Campaigns', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.keyboard('g');
    await user.keyboard('c');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Кампании' })).toBeInTheDocument(),
    );
  });

  it('g без последующего ключа в окне 1.5с не делает ничего', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.keyboard('g');
    // Не нажимаем второй ключ — заголовок остаётся «Обзор»
    expect(screen.getByRole('heading', { name: 'Обзор' })).toBeInTheDocument();
  });
});
