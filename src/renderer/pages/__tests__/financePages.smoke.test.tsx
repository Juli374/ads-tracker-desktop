import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { RoyaltiesPage } from '../RoyaltiesPage';
import { OperationsCenterPage } from '../OperationsCenterPage';
import { AccountingPage } from '../AccountingPage';
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

describe('RoyaltiesPage', () => {
  it('рендерит upload из mock', async () => {
    render(
      <Wrap>
        <RoyaltiesPage />
      </Wrap>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Royalty' }),
    ).toBeInTheDocument();
    // marketplace USA из mock
    expect(await screen.findByText('USA')).toBeInTheDocument();
  });
});

describe('OperationsCenterPage', () => {
  it('рендерит Kanban с задачей', async () => {
    render(
      <Wrap>
        <OperationsCenterPage />
      </Wrap>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Операционный центр' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Test task')).toBeInTheDocument();
  });
});

describe('AccountingPage', () => {
  it('рендерит заголовок', async () => {
    render(
      <Wrap>
        <AccountingPage />
      </Wrap>,
    );
    expect(await screen.findByTestId('accounting-page')).toBeInTheDocument();
    // Empty accounts → "accounts.empty" key.
    expect(await screen.findByText('accounts.empty')).toBeInTheDocument();
  });
});

describe('Hotkeys G Y / G T / G F', () => {
  it('G Y → Royalty', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByTestId('dashboard-page');
    await user.keyboard('gy');
    expect(
      await screen.findByRole('heading', { name: 'Royalty' }),
    ).toBeInTheDocument();
  });

  it('G T → Операционный центр', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByTestId('dashboard-page');
    await user.keyboard('gt');
    expect(
      await screen.findByRole('heading', { name: 'Операционный центр' }),
    ).toBeInTheDocument();
  });

  it('G F → Бухгалтерия', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByTestId('dashboard-page');
    await user.keyboard('gf');
    expect(await screen.findByTestId('accounting-page')).toBeInTheDocument();
  });
});
