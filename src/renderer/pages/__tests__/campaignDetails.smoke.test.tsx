import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { MainLayout } from '../../components/MainLayout';
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

const goToDetails = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByTestId('dashboard-page');
  await user.click(screen.getByTestId('nav-campaigns'));
  await screen.findByTestId('campaigns-page');
  const row = await screen.findByText('Test Campaign');
  await user.click(row);
  // Title — имя кампании из mock'а.
  await screen.findAllByRole('heading', { name: 'Test Campaign' });
};

describe('CampaignDetailsPage', () => {
  it('рендерит KPI и табы', async () => {
    const user = userEvent.setup();
    renderApp();
    await goToDetails(user);

    // KPI labels
    expect((await screen.findAllByText('Spend')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Sales')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Orders')).length).toBeGreaterThan(0);
    // Все 5 табов через стабильные data-testid (mock ICU не интерполирует {label}).
    expect(await screen.findByTestId('details-tab-ad_groups')).toBeInTheDocument();
    expect(await screen.findByTestId('details-tab-targets')).toBeInTheDocument();
    expect(await screen.findByTestId('details-tab-search_terms')).toBeInTheDocument();
    expect(await screen.findByTestId('details-tab-negatives')).toBeInTheDocument();
    expect(await screen.findByTestId('details-tab-history')).toBeInTheDocument();
  });

  it('Ad Groups таб показывает список из mock', async () => {
    const user = userEvent.setup();
    renderApp();
    await goToDetails(user);

    // Ad Groups — таб по умолчанию
    expect(await screen.findByText('AG-1')).toBeInTheDocument();
  });

  it('переключение на Targets-таб показывает список', async () => {
    const user = userEvent.setup();
    renderApp();
    await goToDetails(user);

    await user.click(screen.getByTestId('details-tab-targets'));
    expect(await screen.findByText('test keyword')).toBeInTheDocument();
  });

  it('breadcrumb «Кампании» возвращает на список', async () => {
    const user = userEvent.setup();
    renderApp();
    await goToDetails(user);

    // Breadcrumb back-to-campaigns в верхней части CampaignDetailsPage.
    await user.click(await screen.findByTestId('breadcrumb-back-to-campaigns'));
    expect(await screen.findByTestId('campaigns-page')).toBeInTheDocument();
  });
});
