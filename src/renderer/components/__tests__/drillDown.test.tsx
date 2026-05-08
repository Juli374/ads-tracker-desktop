import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { MainLayout } from '../MainLayout';
import { ToastProvider } from '../../contexts/ToastContext';
import { AuthProvider } from '../../contexts/AuthContext';

import { installMockApi, mockApiResponses } from '../../../test/mockApi';

beforeEach(() => {
  installMockApi({ responses: mockApiResponses() });
});

const renderApp = () =>
  render(
    <ToastProvider>
      <AuthProvider>
        <MainLayout />
      </AuthProvider>
    </ToastProvider>,
  );

describe('drill-down navigation', () => {
  it('Books → Campaigns: клик по строке книги переключает на Campaigns с фильтром по книге', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /Книги/ }));
    // Page heading H1 = «Книги»
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Книги' })).toBeInTheDocument(),
    );
    // Test Book row appears
    await waitFor(() => expect(screen.getByText('Test Book')).toBeInTheDocument());

    // Find the table row containing 'Test Book' and click it (not chevron)
    const bookCell = screen.getByText('Test Book');
    await user.click(bookCell);

    // After drill-down: page heading is «Кампании» and book chip rendered
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Кампании' })).toBeInTheDocument();
    });
    // Chip with 📕 Test Book inside campaign filter
    await waitFor(() => {
      const chip = screen.getByTitle('Сбросить фильтр по книге');
      expect(within(chip).getByText(/Test Book/)).toBeInTheDocument();
    });
  });

  it('Campaigns → SearchTerms: клик по строке кампании переключает на SearchTerms с chip-кампанией', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /Кампании/ }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Кампании' })).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByText('Test Campaign')).toBeInTheDocument());

    await user.click(screen.getByText('Test Campaign'));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Поисковые запросы' }),
      ).toBeInTheDocument();
    });
    await waitFor(() => {
      const chip = screen.getByTitle('Сбросить фильтр по кампании');
      expect(within(chip).getByText(/кампания #100/)).toBeInTheDocument();
    });
  });
});
