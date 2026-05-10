import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import { UploadCoverModal } from '../UploadCoverModal';
import { ToastProvider } from '../../../contexts/ToastContext';
import { installMockApi } from '../../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

beforeEach(() => {
  installMockApi();
  // jsdom does not implement FileReader.readAsDataURL fully — patch it so that
  // uploadFile() can extract base64 from the synthetic File object.
  const realFR = global.FileReader;
  class StubFileReader {
    onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
    onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
    result: string | ArrayBuffer | null = null;
    readAsDataURL(blob: Blob) {
      void blob;
      this.result = 'data:image/png;base64,c3R1Yg==';
      // Defer to microtask so that callers can attach .onload after invoking us.
      queueMicrotask(() => {
        this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
      });
    }
  }
  (global as unknown as { FileReader: unknown }).FileReader = StubFileReader;
  // restore on cleanup so other suites are not affected.
  // @ts-expect-error vitest typing — afterEach will reinstall via beforeEach.
  global.__realFileReader = realFR;
});

describe('UploadCoverModal', () => {
  it('renders with the expected testid', () => {
    render(
      <Wrap>
        <UploadCoverModal bookId={1} onClose={vi.fn()} onUploaded={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByTestId('book-upload-cover-modal')).toBeInTheDocument();
  });

  it('rejects files larger than 10 MB and shows a toast', async () => {
    render(
      <Wrap>
        <UploadCoverModal bookId={1} onClose={vi.fn()} onUploaded={vi.fn()} />
      </Wrap>,
    );
    // Build a fake File whose size > 10 MB. jsdom honours the size constructor opt.
    const big = new File([new Uint8Array(1)], 'too-big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024, configurable: false });

    const input = screen.getByTestId('book-upload-cover-modal').querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    fireEvent.change(input as HTMLInputElement, { target: { files: [big] } });

    // Toast region is rendered into the same container.
    await waitFor(() => {
      expect(screen.getByText(/modals\.uploadCover\.tooLarge/i)).toBeInTheDocument();
    });
  });

  it('calls window.api.mediaUpload and onUploaded on a small file', async () => {
    const onUploaded = vi.fn();
    const onClose = vi.fn();
    render(
      <Wrap>
        <UploadCoverModal bookId={42} onClose={onClose} onUploaded={onUploaded} />
      </Wrap>,
    );
    const small = new File([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' });
    Object.defineProperty(small, 'size', { value: 1024, configurable: false });

    const input = screen.getByTestId('book-upload-cover-modal').querySelector('input[type="file"]');
    fireEvent.change(input as HTMLInputElement, { target: { files: [small] } });

    // Submit form by clicking the upload button.
    const buttons = screen.getAllByRole('button');
    const submit = buttons.find((b) => b.getAttribute('type') === 'submit');
    expect(submit).toBeTruthy();
    fireEvent.click(submit as HTMLElement);

    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    const mediaUpload = (window.api as unknown as { mediaUpload: ReturnType<typeof vi.fn> })
      .mediaUpload;
    expect(mediaUpload).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/books/42/cover' }),
    );
  });

  it('surfaces upload errors from window.api.mediaUpload', async () => {
    installMockApi({
      mediaUploadResponse: { ok: false, status: 413, data: null, error: 'file too large' },
    });
    render(
      <Wrap>
        <UploadCoverModal bookId={1} onClose={vi.fn()} onUploaded={vi.fn()} />
      </Wrap>,
    );
    const small = new File([new Uint8Array([1])], 'tiny.png', { type: 'image/png' });
    Object.defineProperty(small, 'size', { value: 64, configurable: false });

    const input = screen.getByTestId('book-upload-cover-modal').querySelector('input[type="file"]');
    fireEvent.change(input as HTMLInputElement, { target: { files: [small] } });
    const submit = screen.getAllByRole('button').find((b) => b.getAttribute('type') === 'submit');
    fireEvent.click(submit as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText(/file too large/i)).toBeInTheDocument();
    });
  });
});
