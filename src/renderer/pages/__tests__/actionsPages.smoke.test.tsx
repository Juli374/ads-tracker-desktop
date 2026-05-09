import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { ActionCenterPage } from '../ActionCenterPage';
import { AutomationPage } from '../AutomationPage';
import { AlertsPage } from '../AlertsPage';
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

beforeEach(() => {
  installMockApi({ responses: mockApiResponses() });
});

describe('ActionCenterPage', () => {
  it('рендерит ленту с записью из mock', async () => {
    render(
      <Wrap>
        <ActionCenterPage />
      </Wrap>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Центр действий' }),
    ).toBeInTheDocument();
    // Action_type 'change_bid' рендерится как «Изменение бида» — в фильтре <option> и в карточке.
    const labels = await screen.findAllByText('Изменение бида');
    expect(labels.length).toBeGreaterThanOrEqual(1);
    // Entity name из mock — в карточке action.
    expect(await screen.findByText(/«test keyword»/)).toBeInTheDocument();
  });
});

describe('AutomationPage', () => {
  it('рендерит pending tab и рекомендацию', async () => {
    render(
      <Wrap>
        <AutomationPage />
      </Wrap>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Автоматизация' }),
    ).toBeInTheDocument();
    // Rule name из mock
    expect(await screen.findByText('ACOS выше цели')).toBeInTheDocument();
    // Кнопки apply/dismiss есть на pending
    expect(
      await screen.findByRole('button', { name: /Применить/ }),
    ).toBeInTheDocument();
  });
});

describe('AlertsPage', () => {
  it('рендерит заголовок и group', async () => {
    render(
      <Wrap>
        <AlertsPage />
      </Wrap>,
    );
    expect(await screen.findByTestId('alerts-page')).toBeInTheDocument();
    // Mock alerts: [] → empty state
    expect(await screen.findByText('empty.title')).toBeInTheDocument();
  });
});

describe('Хоткеи G A / G U / G L', () => {
  it('G A → Центр действий', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByTestId('dashboard-page');
    await user.keyboard('ga');
    expect(
      await screen.findByRole('heading', { name: 'Центр действий' }),
    ).toBeInTheDocument();
  });

  it('G U → Автоматизация', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByTestId('dashboard-page');
    await user.keyboard('gu');
    expect(
      await screen.findByRole('heading', { name: 'Автоматизация' }),
    ).toBeInTheDocument();
  });

  it('G L → Мониторинг', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByTestId('dashboard-page');
    await user.keyboard('gl');
    expect(await screen.findByTestId('alerts-page')).toBeInTheDocument();
  });
});
