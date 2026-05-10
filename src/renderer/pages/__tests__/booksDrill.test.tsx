import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

beforeEach(() => {
  installMockApi({
    responses: {
      ...mockApiResponses(),
      '/api/ratings/all-books': { ratings: [] },
      '/api/metrics/summary/by-campaign': {
        date_from: '2026-05-01',
        date_to: '2026-05-15',
        attribution_window: '7d',
        total_count: 1,
        campaigns: [
          {
            campaign_id: 100,
            amazon_campaign_id: 'C100',
            campaign_name: 'Test Campaign USA',
            campaign_type: 'sp',
            targeting_type: 'manual',
            status: 'enabled',
            book_id: 1,
            book_title: 'Test Book',
            book_cover: null,
            marketplace: 'USA',
            currency: 'USD',
            impressions: 1000,
            clicks: 100,
            cost: 50,
            sales: 200,
            orders: 10,
            ctr: 10,
            cpc: 0.5,
            cr: 10,
            acos: 25,
            profit: 150,
          },
        ],
      },
    },
  });
});

describe('BooksPage drill navigation', () => {
  it('renders list level by default', async () => {
    render(
      <Wrap>
        <BooksPage />
      </Wrap>,
    );
    expect(await screen.findByTestId('books-page')).toBeInTheDocument();
    expect(await screen.findByText('Test Book')).toBeInTheDocument();
  });

  it('drills to marketplaces panel when book row clicked', async () => {
    render(
      <Wrap>
        <BooksPage />
      </Wrap>,
    );
    const row = await screen.findByTestId('book-row-1');
    fireEvent.click(row);
    expect(await screen.findByTestId('books-marketplaces-panel')).toBeInTheDocument();
  });

  it('shows breadcrumb after drilling to marketplaces', async () => {
    render(
      <Wrap>
        <BooksPage />
      </Wrap>,
    );
    const row = await screen.findByTestId('book-row-1');
    fireEvent.click(row);
    expect(await screen.findByTestId('book-breadcrumb-list')).toBeInTheDocument();
    expect(await screen.findByTestId('book-breadcrumb-marketplaces')).toBeInTheDocument();
  });

  it('drills to campaigns panel when marketplace clicked', async () => {
    render(
      <Wrap>
        <BooksPage />
      </Wrap>,
    );
    const row = await screen.findByTestId('book-row-1');
    fireEvent.click(row);

    // Wait for the marketplaces panel to finish loading and show marketplace buttons
    const panel = await screen.findByTestId('books-marketplaces-panel');
    const usaButton = await waitFor(() => {
      const btns = within(panel).getAllByRole('button');
      const btn = btns.find((b) => b.textContent?.includes('USA'));
      if (!btn) throw new Error('USA button not found yet');
      return btn;
    });
    fireEvent.click(usaButton);

    expect(await screen.findByTestId('books-campaigns-panel')).toBeInTheDocument();
  });

  it('navigates back to list via breadcrumb', async () => {
    render(
      <Wrap>
        <BooksPage />
      </Wrap>,
    );
    const row = await screen.findByTestId('book-row-1');
    fireEvent.click(row);

    const breadcrumbList = await screen.findByTestId('book-breadcrumb-list');
    fireEvent.click(breadcrumbList);

    expect(await screen.findByTestId('book-row-1')).toBeInTheDocument();
  });
});
