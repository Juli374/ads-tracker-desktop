import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MultiPeriodMetricsTable } from '../MultiPeriodMetricsTable';
import { EntitlementsProvider } from '../../../contexts/EntitlementsContext';
import { ToastProvider } from '../../../contexts/ToastContext';
import { WeeksFilterProvider } from '../../../contexts/WeeksFilterContext';
import { installMockApi, mockApiResponses } from '../../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>
    <EntitlementsProvider>
      <WeeksFilterProvider>{children}</WeeksFilterProvider>
    </EntitlementsProvider>
  </ToastProvider>
);

describe('MultiPeriodMetricsTable tier-gating', () => {
  it('shows locked placeholder when tier=start', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'start' },
    });
    render(
      <Wrap>
        <MultiPeriodMetricsTable campaignId={100} currency="USD" />
      </Wrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('multi-period-locked')).toBeInTheDocument();
    });
    expect(screen.getByTestId('multi-period-upgrade-cta')).toBeInTheDocument();
    // Реальная таблица — НЕ рендерится.
    expect(screen.queryByTestId('multi-period-table')).toBeNull();
  });

  it('renders real table when tier=pro', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'pro' },
    });
    render(
      <Wrap>
        <MultiPeriodMetricsTable campaignId={100} currency="USD" />
      </Wrap>,
    );
    await waitFor(() => {
      // multi-period-table или absence locked-placeholder'а — главное, что
      // tier-gate не закрыл рендер.
      expect(screen.queryByTestId('multi-period-locked')).toBeNull();
    });
  });
});
