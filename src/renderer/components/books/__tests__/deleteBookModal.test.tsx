import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import { DeleteBookModal } from '../DeleteBookModal';
import { ToastProvider } from '../../../contexts/ToastContext';

import { installMockApi } from '../../../../test/mockApi';

const mockBook = {
  id: 2,
  title: 'Book to Delete',
  subtitle: null,
  cover_image: null,
  amazon_link: null,
  trim_size: null,
  interior_type: null,
  page_count: 50,
  account: null,
  publication_date: null,
};

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

beforeEach(() => {
  installMockApi({
    responses: {
      [`/api/books/${mockBook.id}/archive`]: { message: 'Archived' },
    },
  });
});

describe('DeleteBookModal', () => {
  it('renders with correct testid', () => {
    render(
      <Wrap>
        <DeleteBookModal book={mockBook} onClose={vi.fn()} onDone={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByTestId('book-delete-modal')).toBeInTheDocument();
  });

  it('shows book title', () => {
    render(
      <Wrap>
        <DeleteBookModal book={mockBook} onClose={vi.fn()} onDone={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByText('Book to Delete')).toBeInTheDocument();
  });

  it('calls onClose when cancel button clicked', () => {
    const onClose = vi.fn();
    render(
      <Wrap>
        <DeleteBookModal book={mockBook} onClose={onClose} onDone={vi.fn()} />
      </Wrap>,
    );
    fireEvent.click(screen.getByText('modals.delete.cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('archives book and calls onDone on success', async () => {
    const onClose = vi.fn();
    const onDone = vi.fn();
    render(
      <Wrap>
        <DeleteBookModal book={mockBook} onClose={onClose} onDone={onDone} />
      </Wrap>,
    );
    fireEvent.click(screen.getByText('modals.delete.archive'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
