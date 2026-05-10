import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import { AddAsinModal } from '../AddAsinModal';
import { ToastProvider } from '../../../contexts/ToastContext';

import { installMockApi } from '../../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

beforeEach(() => {
  installMockApi({
    responses: {
      '/api/books/1/asins': { id: 10, message: 'Created' },
    },
  });
});

describe('AddAsinModal', () => {
  it('renders with correct testid', () => {
    render(
      <Wrap>
        <AddAsinModal bookId={1} onClose={vi.fn()} onSaved={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByTestId('book-add-asin-modal')).toBeInTheDocument();
  });

  it('calls onClose when cancel button clicked', () => {
    const onClose = vi.fn();
    render(
      <Wrap>
        <AddAsinModal bookId={1} onClose={onClose} onSaved={vi.fn()} />
      </Wrap>,
    );
    fireEvent.click(screen.getByText('modals.addAsin.cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(
      <Wrap>
        <AddAsinModal bookId={1} onClose={onClose} onSaved={vi.fn()} />
      </Wrap>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('submits with marketplace and asin and calls onSaved', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(
      <Wrap>
        <AddAsinModal bookId={1} onClose={onClose} onSaved={onSaved} />
      </Wrap>,
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'USA' } });
    fireEvent.change(screen.getByPlaceholderText('B0XXXXXXXXX'), {
      target: { value: 'B01TEST1234' },
    });
    // click submit button to trigger form onSubmit
    const submitBtn = screen.getAllByRole('button').find(
      (b) => b.getAttribute('type') === 'submit'
    );
    expect(submitBtn).toBeDefined();
    fireEvent.click(submitBtn as HTMLElement);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
