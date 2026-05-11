import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { BooksSettingsTab } from '../books';
import { ToastProvider } from '../../../contexts/ToastContext';
import { AuthProvider } from '../../../contexts/AuthContext';
import { BooksProvider } from '../../../contexts/BooksContext';
import { NavProvider, useNav } from '../../../contexts/NavContext';
import type { NavFilters } from '../../../contexts/NavContext';

import { installMockApi, mockApiResponses } from '../../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>
    <AuthProvider>
      <NavProvider>
        <BooksProvider>{children}</BooksProvider>
      </NavProvider>
    </AuthProvider>
  </ToastProvider>
);

// We surface the live `useNav()` value into the test so the click assertion
// can read the page id directly, instead of trying to spy on the navigate fn
// (which is hard because NavProvider memoises the value object and consumers
// close over `nav.navigate` at handler-fire time).
const navRef: { current: { page: string; filters: NavFilters } } = {
  current: { page: 'settings', filters: {} },
};
const NavCapture: React.FC = () => {
  const nav = useNav();
  navRef.current = { page: nav.page, filters: nav.filters };
  return null;
};

beforeEach(() => {
  installMockApi({ responses: mockApiResponses() });
  navRef.current = { page: 'settings', filters: {} };
});

describe('BooksSettingsTab', () => {
  it('renders the books table with the seeded book', async () => {
    render(
      <Wrap>
        <BooksSettingsTab />
      </Wrap>,
    );
    expect(await screen.findByTestId('settings-books-tab')).toBeInTheDocument();
    expect(await screen.findByTestId('settings-books-table')).toBeInTheDocument();
    expect(await screen.findByText('Test Book')).toBeInTheDocument();
  });

  it('disables bulk-delete when nothing is selected', async () => {
    render(
      <Wrap>
        <BooksSettingsTab />
      </Wrap>,
    );
    const btn = (await screen.findByTestId(
      'settings-books-bulk-delete',
    )) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('saves an inline title edit via booksApi.update', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <BooksSettingsTab />
      </Wrap>,
    );
    // Wait for the row to appear
    await screen.findByText('Test Book');
    const cell = screen.getByTestId('settings-books-row-1-title-cell');
    await user.click(cell);
    const input = (await screen.findByTestId(
      'settings-books-row-1-title-input',
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Updated Title' } });
    fireEvent.blur(input);

    await waitFor(() => {
      const requestMock = (window.api.request as unknown) as ReturnType<typeof vi.fn>;
      const calls = requestMock.mock.calls.map((c) => c[0]);
      const put = calls.find(
        (c: { method: string; path: string }) =>
          c.method === 'PUT' && c.path === '/api/books/1',
      );
      expect(put).toBeDefined();
      expect((put as { body?: { title?: string } }).body?.title).toBe(
        'Updated Title',
      );
    });
  });

  it('selects all visible rows when the header checkbox is toggled', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <BooksSettingsTab />
      </Wrap>,
    );
    const all = (await screen.findByTestId(
      'settings-books-select-all',
    )) as HTMLInputElement;
    await user.click(all);
    // Selection summary appears
    expect(
      await screen.findByTestId('settings-books-selection-summary'),
    ).toBeInTheDocument();
    // Bulk-delete is now enabled
    const btn = screen.getByTestId(
      'settings-books-bulk-delete',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('navigates to books drill on Open detail click', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <NavCapture />
        <BooksSettingsTab />
      </Wrap>,
    );
    await screen.findByText('Test Book');
    const openBtn = screen.getByTestId('settings-books-row-1-open-detail');
    await user.click(openBtn);
    await waitFor(() => {
      expect(navRef.current.page).toBe('books');
      expect(navRef.current.filters).toEqual({ bookId: 1 });
    });
  });
});
