import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { Modal, ModalBody, ModalFooter } from '../Modal';

describe('Modal', () => {
  it('renders title and children when open=true', () => {
    render(
      <Modal open onClose={vi.fn()} title="Edit campaign" data-testid="m">
        <ModalBody>Body content here</ModalBody>
      </Modal>,
    );
    expect(screen.getByText('Edit campaign')).toBeInTheDocument();
    expect(screen.getByText('Body content here')).toBeInTheDocument();
    // Renders via portal into document.body — but RTL screen queries the
    // whole document, so the assertion above suffices.
  });

  it('renders nothing when open=false', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Hidden">
        <ModalBody>Should not appear</ModalBody>
      </Modal>,
    );
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
    expect(screen.queryByText('Should not appear')).not.toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Esc test">
        <ModalBody>x</ModalBody>
      </Modal>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when overlay is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Overlay test" data-testid="overlay-modal">
        <ModalBody>x</ModalBody>
        <ModalFooter>
          <button type="button">OK</button>
        </ModalFooter>
      </Modal>,
    );
    // The element with data-testid is the overlay itself (the dialog div).
    const overlay = screen.getByTestId('overlay-modal');
    await user.pointer({ keys: '[MouseLeft>]', target: overlay });
    await user.pointer({ keys: '[/MouseLeft]', target: overlay });
    expect(onClose).toHaveBeenCalled();
  });

  it('does NOT call onClose when clicking inside the card', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Inside click">
        <ModalBody>
          <button type="button">Inner button</button>
        </ModalBody>
      </Modal>,
    );
    await user.click(screen.getByText('Inner button'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('respects closeOnEsc=false', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="No esc" closeOnEsc={false}>
        <ModalBody>x</ModalBody>
      </Modal>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('respects closeOnOverlay=false', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal
        open
        onClose={onClose}
        title="No overlay close"
        closeOnOverlay={false}
        data-testid="no-overlay"
      >
        <ModalBody>x</ModalBody>
      </Modal>,
    );
    const overlay = screen.getByTestId('no-overlay');
    await user.pointer({ keys: '[MouseLeft>]', target: overlay });
    await user.pointer({ keys: '[/MouseLeft]', target: overlay });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sets data-modal-open on body while open', () => {
    const { rerender } = render(
      <Modal open onClose={vi.fn()} title="Body flag">
        <ModalBody>x</ModalBody>
      </Modal>,
    );
    expect(document.body.dataset.modalOpen).toBe('true');

    rerender(
      <Modal open={false} onClose={vi.fn()} title="Body flag">
        <ModalBody>x</ModalBody>
      </Modal>,
    );
    expect(document.body.dataset.modalOpen).toBeUndefined();
  });
});
