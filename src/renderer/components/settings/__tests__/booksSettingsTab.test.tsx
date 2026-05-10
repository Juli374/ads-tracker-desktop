import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { BooksSettingsTab } from '../books';
import { ToastProvider } from '../../../contexts/ToastContext';
import { AuthProvider } from '../../../contexts/AuthContext';
import { BooksProvider } from '../../../contexts/BooksContext';

import { installMockApi, mockApiResponses } from '../../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>
    <AuthProvider>
      <BooksProvider>{children}</BooksProvider>
    </AuthProvider>
  </ToastProvider>
);

beforeEach(() => {
  installMockApi({ responses: mockApiResponses() });
});

describe('BooksSettingsTab', () => {
  it('renders split-grid with both panels', async () => {
    render(
      <Wrap>
        <BooksSettingsTab />
      </Wrap>,
    );
    expect(await screen.findByTestId('settings-books-tab')).toBeInTheDocument();
    expect(screen.getByTestId('book-list-panel')).toBeInTheDocument();
    expect(screen.getByTestId('book-details-panel')).toBeInTheDocument();
  });

  it('shows placeholder when no book selected', async () => {
    render(
      <Wrap>
        <BooksSettingsTab />
      </Wrap>,
    );
    await screen.findByTestId('settings-books-tab');
    expect(screen.getByText('booksTab.detailsPlaceholder')).toBeInTheDocument();
  });

  it('shows the books list', async () => {
    render(
      <Wrap>
        <BooksSettingsTab />
      </Wrap>,
    );
    expect(await screen.findByText('Test Book')).toBeInTheDocument();
  });
});
