import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { ReportsPage } from '../ReportsPage';
import { ComparisonPage } from '../ComparisonPage';
import { MainLayout } from '../../components/MainLayout';
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

describe('ReportsPage tabs', () => {
  it('рендерит tab strip и переключает на Placement', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <ReportsPage />
      </Wrap>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Отчёты' }),
    ).toBeInTheDocument();
    // Все 6 табов
    expect(
      await screen.findByRole('tab', { name: 'Таб отчётов: Динамика' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('tab', { name: 'Таб отчётов: Placement' }),
    ).toBeInTheDocument();
    // Переключаем на Placement
    await user.click(screen.getByRole('tab', { name: 'Таб отчётов: Placement' }));
    expect(await screen.findByText(/Разрез по: Placement/)).toBeInTheDocument();
    // Mock placement → 'Top Of Search' после форматирования
    expect(await screen.findByText(/Top Of Search/)).toBeInTheDocument();
  });
});

describe('ComparisonPage', () => {
  it('рендерит с двумя select периодами и delta KPIs', async () => {
    render(
      <Wrap>
        <ComparisonPage />
      </Wrap>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Сравнение' }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('Период A')).toBeInTheDocument();
    expect(await screen.findByLabelText('Период B')).toBeInTheDocument();
    expect((await screen.findAllByText('Spend')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Sales')).length).toBeGreaterThan(0);
  });

  it('хоткей G P переключает на Сравнение', async () => {
    const user = userEvent.setup();
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
    await screen.findByTestId('dashboard-page');
    await user.keyboard('gp');
    expect(
      await screen.findByRole('heading', { name: 'Сравнение' }),
    ).toBeInTheDocument();
  });
});
