import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { DashboardPage } from '../DashboardPage';
import { BooksPage } from '../BooksPage';
import { CampaignsPage } from '../CampaignsPage';
import { SearchTermsPage } from '../SearchTermsPage';
import { ReportsPage } from '../ReportsPage';
import { SettingsPage } from '../SettingsPage';
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

describe('page smoke renders', () => {
  it('DashboardPage renders header and KPIs', async () => {
    render(
      <Wrap>
        <DashboardPage />
      </Wrap>,
    );
    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();
    // KPI labels встречаются и в заголовках таблицы — findAllByText.
    expect((await screen.findAllByText('Spend')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Sales')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('ACOS')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('TACoS')).length).toBeGreaterThan(0);
  });

  it('BooksPage renders header and table', async () => {
    render(
      <Wrap>
        <BooksPage />
      </Wrap>,
    );
    expect(await screen.findByTestId('books-page')).toBeInTheDocument();
    expect(await screen.findByText('Test Book')).toBeInTheDocument();
  });

  it('CampaignsPage renders header and table', async () => {
    render(
      <Wrap>
        <CampaignsPage />
      </Wrap>,
    );
    expect(await screen.findByTestId('campaigns-page')).toBeInTheDocument();
    expect(await screen.findByText('Test Campaign')).toBeInTheDocument();
  });

  it('SearchTermsPage renders header without crashing on empty list', async () => {
    render(
      <Wrap>
        <SearchTermsPage />
      </Wrap>,
    );
    expect(await screen.findByTestId('search_terms-page')).toBeInTheDocument();
    expect(await screen.findByText('empty.noPeriod')).toBeInTheDocument();
  });

  it('ReportsPage renders header, table and marketplace card', async () => {
    render(
      <Wrap>
        <ReportsPage />
      </Wrap>,
    );
    expect(await screen.findByTestId('reports-page')).toBeInTheDocument();
    expect(await screen.findByText('daily.title')).toBeInTheDocument();
    expect(await screen.findByText('summary.title')).toBeInTheDocument();
    expect(await screen.findByText('marketplace.title')).toBeInTheDocument();
  });

  it('SettingsPage renders sections', async () => {
    render(
      <Wrap>
        <SettingsPage />
      </Wrap>,
    );
    expect(await screen.findByRole('heading', { name: 'Настройки' })).toBeInTheDocument();
    expect(await screen.findByText('Учётная запись')).toBeInTheDocument();
    expect(await screen.findByText('API-ключ')).toBeInTheDocument();
    expect(await screen.findByText('Backend')).toBeInTheDocument();
    expect(await screen.findByText('Приложение')).toBeInTheDocument();
  });
});
