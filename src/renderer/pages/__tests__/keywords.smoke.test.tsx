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
  // Phase J.5 Lane E: persisted filters now live in localStorage. Clear
  // between tests so the noise filter (enabled-by-default) doesn't bleed
  // state into a test that assumes the unfiltered shape.
  window.localStorage.clear();
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

  it('виртуализация: 5000 mock-строк рендерится быстро и в DOM попадает только видимое окно', async () => {
    const keywords = Array.from({ length: 5000 }, (_, i) => ({
      keyword_id: `kw-${i}`,
      keyword_text: `keyword ${i}`,
      match_type: 'exact',
      target_type: 'keyword',
      campaign_id: 100 + (i % 5),
      campaign_name: `Campaign ${i % 5}`,
      ad_group_id: 1000 + (i % 5),
      ad_group_name: `AG-${i % 5}`,
      book_id: 1,
      book_title: 'Test Book',
      book_cover: null,
      marketplace: 'USA',
      currency: 'USD',
      target_id: 5000 + i,
      bid: 0.5,
      status: 'enabled',
      impressions: 100,
      clicks: 10,
      cost: i, // varied so sort yields stable order
      sales: 20,
      orders: 1,
      ctr: 10,
      cpc: 0.5,
      cr: 10,
      acos: 25,
      profit: 3,
    }));

    installMockApi({
      responses: {
        ...mockApiResponses(),
        '/api/metrics/summary/by-keyword': {
          date_from: '2026-05-01',
          date_to: '2026-05-15',
          attribution_window: '7d',
          total_count: 5000,
          keywords,
        },
      },
    });

    // Disable noise filter so the perf path exercises all 5000 rows
    // (with default settings, low-CPC mock rows would mostly be hidden).
    window.localStorage.setItem(
      'keywords:filters',
      JSON.stringify({
        matchFilter: 'all',
        statusFilter: 'all',
        sortKey: 'cost',
        noise: {
          enabled: false,
          minTargets: 30,
          maxCpc: 0.2,
          hideLowVolume: false,
        },
      }),
    );

    const t0 = performance.now();
    render(
      <Wrap>
        <KeywordsPage />
      </Wrap>,
    );
    await screen.findByTestId('keywords-page');
    await screen.findByTestId('keywords-virtual-container');
    const elapsed = performance.now() - t0;

    // jsdom render is slow (often 1-2s for our app shell + 5000-row
    // payload). The bound is generous because what we're really proving
    // here is that virtualization works — see the DOM-count assertion
    // below. Without virtualization, mounting 5000 row elements on jsdom
    // routinely takes 10+ seconds, so 5s comfortably distinguishes the
    // virtualized path. In a real browser this same render is sub-200ms.
    expect(elapsed).toBeLessThan(5000);

    // Virtualization invariant: spacer reflects 5000 rows, but DOM only
    // contains the visible window. With ~640px viewport / 40px row
    // height + 8 overscan we expect ~24 rows, far below 5000.
    const renderedRows = document.querySelectorAll(
      '[data-testid^="keyword-row-"]',
    );
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(100);
  });

  it('bulk-select: клик по select-all показывает bulk toolbar с pause/resume/change-bid', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <KeywordsPage />
      </Wrap>,
    );

    await screen.findByTestId('keywords-page');
    await screen.findByText('test keyword');

    const selectAll = await screen.findByTestId('keywords-select-all');
    await user.click(selectAll);

    expect(
      await screen.findByTestId('keywords-bulk-toolbar'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('bulk-pause')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-resume')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-change-bid')).toBeInTheDocument();
  });
});
