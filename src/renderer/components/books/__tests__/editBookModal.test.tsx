import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import { EditBookModal } from '../EditBookModal';
import { ToastProvider } from '../../../contexts/ToastContext';

import { installMockApi } from '../../../../test/mockApi';

const mockBook = {
  id: 1,
  title: 'Test Book',
  subtitle: null,
  cover_image: null,
  amazon_link: null,
  trim_size: null,
  interior_type: null,
  page_count: 100,
  account: 'Test Account',
  publication_date: null,
};

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

beforeEach(() => {
  installMockApi({
    responses: {
      [`/api/books/${mockBook.id}`]: { message: 'Updated' },
    },
  });
});

describe('EditBookModal', () => {
  it('renders with correct testid and title field', () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <Wrap>
        <EditBookModal book={mockBook} onClose={onClose} onSaved={onSaved} />
      </Wrap>,
    );
    expect(screen.getByTestId('book-edit-modal')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Book')).toBeInTheDocument();
  });

  it('calls onClose when cancel button clicked', () => {
    const onClose = vi.fn();
    render(
      <Wrap>
        <EditBookModal book={mockBook} onClose={onClose} onSaved={vi.fn()} />
      </Wrap>,
    );
    fireEvent.click(screen.getByText('modals.edit.cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape pressed', () => {
    const onClose = vi.fn();
    render(
      <Wrap>
        <EditBookModal book={mockBook} onClose={onClose} onSaved={vi.fn()} />
      </Wrap>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('submits form and calls onSaved on success', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <Wrap>
        <EditBookModal book={mockBook} onClose={onClose} onSaved={onSaved} />
      </Wrap>,
    );
    const titleInput = screen.getByDisplayValue('Test Book');
    fireEvent.change(titleInput, { target: { value: 'Updated Title' } });
    // click the submit button (type="submit") to trigger form onSubmit
    const submitBtn = screen.getAllByRole('button').find(
      (b) => b.getAttribute('type') === 'submit'
    );
    expect(submitBtn).toBeDefined();
    fireEvent.click(submitBtn as HTMLElement);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
