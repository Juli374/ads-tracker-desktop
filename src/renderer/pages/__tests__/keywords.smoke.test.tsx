import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { KeywordsPage } from '../KeywordsPage';
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

describe('KeywordsPage', () => {
  it('рендерит заголовок и таблицу из mock', async () => {
    render(
      <Wrap>
        <KeywordsPage />
      </Wrap>,
    );
    expect(
      await screen.findByTestId('keywords-page'),
    ).toBeInTheDocument();
    expect(await screen.findByText('test keyword')).toBeInTheDocument();
  });

  it('хоткей G K из MainLayout переключает на Keywords', async () => {
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
    await user.keyboard('gk');
    expect(
      await screen.findByTestId('keywords-page'),
    ).toBeInTheDocument();
  });
});
