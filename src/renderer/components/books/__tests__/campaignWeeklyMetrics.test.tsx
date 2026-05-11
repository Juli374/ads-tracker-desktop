import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { CampaignWeeklyMetrics } from '../CampaignWeeklyMetrics';
import { ToastProvider } from '../../../contexts/ToastContext';
import { installMockApi, mockApiResponses } from '../../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

beforeEach(() => {
  installMockApi({
    responses: {
      ...mockApiResponses(),
      // Provide multi-week dataset so the transposed table reveals
      // its column ordering (newest week first).
      '/api/metrics/summary/weekly': {
        date_from: '2026-04-15',
        date_to: '2026-05-15',
        attribution_window: '7d',
        weekly: [
          {
            week_start: '2026-04-20',
            week_end: '2026-04-26',
            impressions: 800,
            clicks: 80,
            spend: 40,
            sales: 160,
            orders: 8,
            ctr: 10,
            cpc: 0.5,
            cr: 10,
            acos: 25,
            roi: 4,
            royalty: 64,
            profit: 24,
          },
          {
            week_start: '2026-05-04',
            week_end: '2026-05-10',
            impressions: 1200,
            clicks: 120,
            spend: 60,
            sales: 240,
            orders: 12,
            ctr: 10,
            cpc: 0.5,
            cr: 10,
            acos: 25,
            roi: 4,
            royalty: 96,
            profit: 36,
          },
        ],
      },
    },
  });
});

describe('CampaignWeeklyMetrics', () => {
  it('renders the transposed weekly table with metric rows and week columns', async () => {
    render(
      <Wrap>
        <CampaignWeeklyMetrics bookId={1} weeks={4} currency="USD" />
      </Wrap>,
    );

    // Wait for fetch to settle and table to mount.
    expect(
      await screen.findByTestId('campaign-weekly-metrics'),
    ).toBeInTheDocument();

    // The 6 metric rows must render.
    expect(screen.getByTestId('weekly-row-spend')).toBeInTheDocument();
    expect(screen.getByTestId('weekly-row-sales')).toBeInTheDocument();
    expect(screen.getByTestId('weekly-row-orders')).toBeInTheDocument();
    expect(screen.getByTestId('weekly-row-acos')).toBeInTheDocument();
    expect(screen.getByTestId('weekly-row-roi')).toBeInTheDocument();
    expect(screen.getByTestId('weekly-row-royalty')).toBeInTheDocument();
  });

  it('orders week columns newest → oldest', async () => {
    render(
      <Wrap>
        <CampaignWeeklyMetrics bookId={1} weeks={4} currency="USD" />
      </Wrap>,
    );

    await screen.findByTestId('campaign-weekly-metrics');

    // Header cells: first metric label, then week labels in MM-DD form.
    // Newest week (2026-05-04 → "05-04") must come before older (2026-04-20 → "04-20").
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    const idxNewer = headers.findIndex((h) => h === '05-04');
    const idxOlder = headers.findIndex((h) => h === '04-20');
    expect(idxNewer).toBeGreaterThan(-1);
    expect(idxOlder).toBeGreaterThan(-1);
    expect(idxNewer).toBeLessThan(idxOlder);
  });

  it('shows empty state when backend returns no weeks', async () => {
    installMockApi({
      responses: {
        ...mockApiResponses(),
        '/api/metrics/summary/weekly': {
          date_from: '2026-05-01',
          date_to: '2026-05-15',
          attribution_window: '7d',
          weekly: [],
        },
      },
    });

    render(
      <Wrap>
        <CampaignWeeklyMetrics bookId={1} weeks={4} currency="USD" />
      </Wrap>,
    );

    // The empty path renders an EmptyState inside the same testid wrapper.
    // We assert the wrapper renders (the only positive signal i18n-mocked
    // tests get is "the component didn't blow up and chose the empty
    // branch"), and that no metric rows are present.
    const root = await screen.findByTestId('campaign-weekly-metrics');
    expect(root).toBeInTheDocument();
    expect(screen.queryByTestId('weekly-row-spend')).not.toBeInTheDocument();
  });
});
