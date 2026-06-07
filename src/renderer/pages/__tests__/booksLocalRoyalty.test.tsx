import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';

import { BooksPage } from '../BooksPage';
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

// BooksPage uses a 30d range by default → `to` = today. Put the local royalty
// upload in the CURRENT month so it falls inside that window regardless of when
// the suite runs.
const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

// Cloud summary: book_id 1, ads cost = 50, cloud royalty = 80.
// If BooksPage used the cloud royalty (the U8 bug), TACoS would be
// 50/80*100 = 62.5%. With local royalty = 250 it must be 50/250*100 = 20.0%.
const BY_BOOK = {
  date_from: '2026-05-01',
  date_to: '2026-05-31',
  attribution_window: '7d',
  books: [
    {
      book_id: 1,
      title: 'Test Book',
      cover_image: null,
      account: 'Test',
      marketplace: 'USA',
      currency: 'USD',
      impressions: 1000,
      clicks: 100,
      cost: 50,
      sales: 200,
      orders: 10,
      ctr: 10,
      cpc: 0.5,
      acos: 25,
      royalty: 80, // cloud royalty — should be REPLACED by local
      profit: 30,
    },
  ],
};

function seedLocalRoyalty(records: unknown[]) {
  (window as unknown as { api: Record<string, unknown> }).api.localRoyalty = {
    listUploads: vi.fn(async () => [
      {
        id: 7,
        account_id: 1,
        marketplace: 'USA',
        target_month: currentMonth,
        uploaded_at: `${currentMonth}-02T00:00:00Z`,
        total_units: 10,
        total_royalty: 250,
        total_revenue: 600,
      },
    ]),
    listRecords: vi.fn(async (id: number) => (id === 7 ? records : [])),
    getSummary: vi.fn(async () => null),
    import: vi.fn(),
    delete: vi.fn(),
    filePath: vi.fn(async () => '/tmp/r.json'),
  };
}

describe('BooksPage — local royalty drives Royalty/TACoS (U8)', () => {
  beforeEach(() => {
    installMockApi({
      responses: {
        ...mockApiResponses(),
        '/api/metrics/summary/by-book': BY_BOOK,
        '/api/ratings/all-books': { ratings: [] },
        // /api/books default (mockApiResponses) has book id 1, page_count 100.
      },
    });
  });

  it('shows TACoS computed from imported local royalty, not the cloud value', async () => {
    // Local royalty for book_id 1 = 250 (matched by book_id).
    seedLocalRoyalty([
      {
        id: 1,
        upload_id: 7,
        asin: 'B0LOCAL001',
        book_id: 1,
        book_title: 'Test Book',
        marketplace: 'USA',
        target_month: currentMonth,
        units: 10,
        royalty: 250,
        revenue: 600,
        currency: 'USD',
      },
    ]);

    render(
      <Wrap>
        <BooksPage />
      </Wrap>,
    );

    const row = await screen.findByTestId('book-row-1');
    // TACoS = cost/royalty*100 = 50/250*100 = 20.0% (NOT cloud's 62.5%).
    // This is the U8 fix: TACoS is driven by the imported local royalty (250),
    // not the cloud summary's royalty (80, which would give 62.5%).
    expect(within(row).getByText('20.0%')).toBeInTheDocument();
    expect(within(row).queryByText('62.5%')).not.toBeInTheDocument();
  });

  it('falls back to title match when the local record has no book_id', async () => {
    seedLocalRoyalty([
      {
        id: 1,
        upload_id: 7,
        asin: 'B0LOCAL001',
        book_id: null, // legacy row → match by title instead
        book_title: 'Test Book',
        marketplace: 'USA',
        target_month: currentMonth,
        units: 10,
        royalty: 250,
        revenue: 600,
        currency: 'USD',
      },
    ]);

    render(
      <Wrap>
        <BooksPage />
      </Wrap>,
    );

    const row = await screen.findByTestId('book-row-1');
    expect(within(row).getByText('20.0%')).toBeInTheDocument();
  });

  it('keeps cloud royalty when no local royalty exists for the book (graceful)', async () => {
    // Local store available but empty for this book.
    seedLocalRoyalty([]);

    render(
      <Wrap>
        <BooksPage />
      </Wrap>,
    );

    const row = await screen.findByTestId('book-row-1');
    // No local match → cloud royalty 80 retained → TACoS = 50/80*100 = 62.5%.
    expect(within(row).getByText('62.5%')).toBeInTheDocument();
  });
});
