import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { AutomationPage } from '../AutomationPage';
import { ToastProvider } from '../../contexts/ToastContext';
import { NavProvider } from '../../contexts/NavContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { EntitlementsProvider } from '../../contexts/EntitlementsContext';
import { MarketplacesProvider } from '../../contexts/MarketplacesContext';
import { BooksProvider } from '../../contexts/BooksContext';
import { GlobalFiltersProvider } from '../../contexts/GlobalFiltersContext';
import { installMockApi, mockApiResponses } from '../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <NavProvider>
    <ToastProvider>
      <AuthProvider>
        <EntitlementsProvider>
          <MarketplacesProvider>
            <BooksProvider>
              <GlobalFiltersProvider>{children}</GlobalFiltersProvider>
            </BooksProvider>
          </MarketplacesProvider>
        </EntitlementsProvider>
      </AuthProvider>
    </ToastProvider>
  </NavProvider>
);

describe('AutomationPage tier-gating', () => {
  beforeEach(() => {
    // Clean — отдельно настраиваем в каждом тесте.
  });

  it('renders upgrade card when tier=start (automation.rules locked)', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'start' },
    });
    render(
      <Wrap>
        <AutomationPage />
      </Wrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('automation-page-locked')).toBeInTheDocument();
    });
    expect(screen.getByTestId('automation-upgrade-cta')).toBeInTheDocument();
    // Реальная страница (KPIs / list) — НЕ рендерится.
    expect(screen.queryByTestId('automation-page')).toBeNull();
  });

  it('renders normal automation UI when tier=business (unlocked)', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'business' },
    });
    render(
      <Wrap>
        <AutomationPage />
      </Wrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('automation-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('automation-page-locked')).toBeNull();
  });
});
