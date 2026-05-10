import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { ComparisonPage } from '../ComparisonPage';
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

describe('ComparisonPage — dimension switcher', () => {
  it('renders the dimension select with 7 options', async () => {
    render(
      <Wrap>
        <ComparisonPage />
      </Wrap>,
    );
    const sel = (await screen.findByTestId('comparison-dimension-select')) as HTMLSelectElement;
    expect(sel).toBeInTheDocument();
    const optionValues = Array.from(sel.options).map((o) => o.value);
    expect(optionValues).toEqual([
      'book',
      'campaign',
      'keyword',
      'marketplace',
      'account',
      'placement',
      'match_type',
    ]);
  });

  it('switching dimension to campaign re-renders table with campaign rows', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <ComparisonPage />
      </Wrap>,
    );
    const sel = (await screen.findByTestId('comparison-dimension-select')) as HTMLSelectElement;

    // Default is "book" — Test Book row should be visible
    expect((await screen.findAllByText(/Test Book/i)).length).toBeGreaterThan(0);

    // Switch dimension to "campaign"
    await user.selectOptions(sel, 'campaign');

    // After switch, Test Campaign row should appear
    expect((await screen.findAllByText(/Test Campaign/i)).length).toBeGreaterThan(0);
  });

  it('switching dimension to keyword re-renders table with keyword rows', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <ComparisonPage />
      </Wrap>,
    );
    const sel = (await screen.findByTestId('comparison-dimension-select')) as HTMLSelectElement;

    await user.selectOptions(sel, 'keyword');

    // mockApiResponses includes keyword "test keyword"
    expect((await screen.findAllByText(/test keyword/i)).length).toBeGreaterThan(0);
  });
});
