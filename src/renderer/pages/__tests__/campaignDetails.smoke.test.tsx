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
  await screen.findByRole('heading', { name: 'Обзор' });
  await user.click(screen.getByRole('button', { name: /Кампании/ }));
  await screen.findByRole('heading', { name: 'Кампании' });
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
    // Все 5 табов через aria-label «Таб: …»
    expect(await screen.findByRole('tab', { name: 'Таб: Ad Groups' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Таб: Targets' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Таб: Search Terms' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Таб: Минус-слова' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Таб: История' })).toBeInTheDocument();
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

    await user.click(screen.getByRole('tab', { name: 'Таб: Targets' }));
    expect(await screen.findByText('test keyword')).toBeInTheDocument();
  });

  it('breadcrumb «Кампании» возвращает на список', async () => {
    const user = userEvent.setup();
    renderApp();
    await goToDetails(user);

    // Breadcrumb-кнопка «Кампании» — в верхней части CampaignDetailsPage.
    // Их две (sidebar + breadcrumb), берём первую соответствующую.
    const buttons = await screen.findAllByRole('button', { name: /Кампании/ });
    // Ищем breadcrumb-кнопку с иконкой ArrowLeft (text "Кампании" ровно).
    const breadcrumb = buttons.find((b) => b.textContent?.trim() === 'Кампании');
    expect(breadcrumb).toBeDefined();
    if (breadcrumb) {
      await user.click(breadcrumb);
      expect(await screen.findByRole('heading', { name: 'Кампании' })).toBeInTheDocument();
    }
  });
});
