import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { ReportsPage } from '../ReportsPage';
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

describe('ReportsPage — Hourly tab', () => {
  it('renders Hourly tab in tab strip and switches to heatmap', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <ReportsPage />
      </Wrap>,
    );

    expect(await screen.findByTestId('reports-tab-hourly')).toBeInTheDocument();
    expect(await screen.findByTestId('reports-tab-budget_pacing')).toBeInTheDocument();

    await user.click(screen.getByTestId('reports-tab-hourly'));

    // Hourly card visible after click
    expect(await screen.findByTestId('reports-hourly-card')).toBeInTheDocument();
    expect(await screen.findByTestId('reports-hourly-heatmap')).toBeInTheDocument();
    // Metric toggle has 4 metrics
    expect(screen.getByTestId('reports-hourly-metric-spend')).toBeInTheDocument();
    expect(screen.getByTestId('reports-hourly-metric-sales')).toBeInTheDocument();
    expect(screen.getByTestId('reports-hourly-metric-orders')).toBeInTheDocument();
    expect(screen.getByTestId('reports-hourly-metric-acos')).toBeInTheDocument();
    // 7×24 = 168 cells rendered
    const heatmap = screen.getByTestId('reports-hourly-heatmap');
    const cellButtons = within(heatmap).getAllByTestId(/^reports-hourly-cell-/);
    expect(cellButtons.length).toBe(168);
  });

  it('clicking a heatmap cell shows drill-down summary', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <ReportsPage />
      </Wrap>,
    );

    await user.click(await screen.findByTestId('reports-tab-hourly'));
    await screen.findByTestId('reports-hourly-heatmap');

    // Click a known cell — Friday 14:00 in test data is dow=4, hour=14
    await user.click(screen.getByTestId('reports-hourly-cell-4-14'));
    expect(await screen.findByTestId('reports-hourly-drill')).toBeInTheDocument();
  });
});

describe('ReportsPage — Budget Pacing tab', () => {
  it('renders Budget Pacing card with 3+ campaign rows', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <ReportsPage />
      </Wrap>,
    );

    await user.click(await screen.findByTestId('reports-tab-budget_pacing'));

    expect(await screen.findByTestId('reports-pacing-card')).toBeInTheDocument();
    // 3 campaigns from mock
    expect(await screen.findByTestId('reports-pacing-row-100')).toBeInTheDocument();
    expect(await screen.findByTestId('reports-pacing-row-101')).toBeInTheDocument();
    expect(await screen.findByTestId('reports-pacing-row-102')).toBeInTheDocument();
    // Status badges include over/on/under pacing
    expect(
      screen.getAllByTestId(/^reports-pacing-status-/).length,
    ).toBeGreaterThanOrEqual(3);
  });
});
