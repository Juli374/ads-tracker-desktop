import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { DashboardPage } from '../DashboardPage';
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

describe('DashboardPage (Phase 1 redesign)', () => {
  beforeEach(() => {
    installMockApi({ responses: mockApiResponses() });
  });

  it('renders 4 KpiDelta cards with new labels', async () => {
    render(
      <Wrap>
        <DashboardPage />
      </Wrap>,
    );
    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();
    // KpiDelta labels — теперь Profit/ACOS/Sales/Spend (не TACoS)
    expect((await screen.findAllByText('Profit')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('ACOS')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Sales')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Spend')).length).toBeGreaterThan(0);
  });

  it('renders Hero, Top Performers, Funnel, Marketplace sections', async () => {
    render(
      <Wrap>
        <DashboardPage />
      </Wrap>,
    );
    // Mock react-i18next возвращает key, поэтому assertим на ключи namespace.
    expect(await screen.findByText('cards.performance')).toBeInTheDocument();
    expect(await screen.findByText('cards.topPerformers')).toBeInTheDocument();
    expect(await screen.findByText('cards.funnel')).toBeInTheDocument();
    expect(await screen.findByText('cards.marketplaceShare')).toBeInTheDocument();
  });

  it('renders top performers winners from mock', async () => {
    render(
      <Wrap>
        <DashboardPage />
      </Wrap>,
    );
    // Из mockApiResponses: winners.books = [{ title: 'Test Book', profit: 30 }]
    // У нас Test Book встречается в TopPerformers + в нижней таблице книг.
    const occurrences = await screen.findAllByText('Test Book');
    expect(occurrences.length).toBeGreaterThanOrEqual(1);
  });

  it('TopPerformers tabs use disambiguating aria-label', async () => {
    render(
      <Wrap>
        <DashboardPage />
      </Wrap>,
    );
    expect(
      await screen.findByRole('button', { name: 'topPerformers.ariaTab.books' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'topPerformers.ariaTab.campaigns' }),
    ).toBeInTheDocument();
  });

  it('renders without crashing when overview endpoint returns empty', async () => {
    const responses = { ...mockApiResponses() };
    delete (responses as Record<string, unknown>)['/api/metrics/summary/overview'];
    delete (responses as Record<string, unknown>)['/api/metrics/summary/top-performers'];
    installMockApi({ responses });

    render(
      <Wrap>
        <DashboardPage />
      </Wrap>,
    );
    // Header всё равно должен отрендериться через summaryByBook (он есть в моках).
    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();
  });
});
