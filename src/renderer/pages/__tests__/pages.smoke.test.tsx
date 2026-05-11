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

  it('SearchTermsPage renders header and inbox-status tabs', async () => {
    render(
      <Wrap>
        <SearchTermsPage />
      </Wrap>,
    );
    expect(await screen.findByTestId('search_terms-page')).toBeInTheDocument();
    // Phase J.1 Lane A — inbox-status tabs are part of the page now.
    expect(await screen.findByTestId('search-terms-tabs')).toBeInTheDocument();
    expect(await screen.findByTestId('tab-inbox')).toBeInTheDocument();
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

  it('SettingsPage renders tabs and default Application content', async () => {
    render(
      <Wrap>
        <SettingsPage />
      </Wrap>,
    );
    expect(await screen.findByTestId('settings-page')).toBeInTheDocument();
    expect(await screen.findByTestId('settings-tabs')).toBeInTheDocument();
    // 5 tabs visible
    expect(screen.getByTestId('settings-tab-application')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-credentials')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-profiles')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-token')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-ai')).toBeInTheDocument();
    // Application tab is active by default — its content visible
    expect(await screen.findByTestId('settings-application-tab')).toBeInTheDocument();
    expect(await screen.findByText('account.cardTitle')).toBeInTheDocument();
    expect(await screen.findByText('app.cardTitle')).toBeInTheDocument();
  });
});
