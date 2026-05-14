import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { CoverQAModal } from '../CoverQAModal';
import { ToastProvider } from '../../../contexts/ToastContext';
import type { CoverQAReport } from '../../../../shared/ipc';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

function makeReport(overrides: Partial<CoverQAReport> = {}): CoverQAReport {
  return {
    width: 1600,
    height: 2560,
    aspectRatio: 1.6,
    dpi: 0,
    format: 'png',
    colorSpace: 'srgb',
    fileSize: 250 * 1024,
    checks: [
      {
        id: 'dimensions.ebook',
        passed: true,
        severity: 'info',
        message: 'Dimensions OK: 1600x2560',
      },
      {
        id: 'aspectRatio',
        passed: true,
        severity: 'info',
        message: 'Aspect ratio 1.60:1 is inside KDPs valid range',
      },
      {
        id: 'fileSize',
        passed: true,
        severity: 'info',
        message: 'File size OK: 250 KB',
      },
    ],
    ...overrides,
  };
}

/**
 * Replace globalThis.FileReader with a sync implementation so the renderer's
 * `readFileAsBase64()` resolves on the next microtask. Returns a restore fn.
 */
function stubFileReader(base64Data = 'ZmFrZQ==') {
  const Original = globalThis.FileReader;
  /* eslint-disable @typescript-eslint/no-unused-vars */
  class MockFileReader extends EventTarget {
    result: string | null = null;
    error: DOMException | null = null;
    onload: ((ev: ProgressEvent) => void) | null = null;
    onerror: ((ev: ProgressEvent) => void) | null = null;
    readAsDataURL(_blob: Blob) {
      this.result = `data:image/png;base64,${base64Data}`;
      if (this.onload) {
        this.onload({ target: this } as unknown as ProgressEvent);
      }
    }
    readAsArrayBuffer(_blob: Blob) { /* noop */ }
    readAsBinaryString(_blob: Blob) { /* noop */ }
    readAsText(_blob: Blob, _enc?: string) { /* noop */ }
    abort() { /* noop */ }
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
  // @ts-expect-error replacing global
  globalThis.FileReader = MockFileReader;
  return () => {
    globalThis.FileReader = Original;
  };
}

let restoreFileReader: () => void;

beforeEach(() => {
  restoreFileReader = stubFileReader();
  // Default `coverQa.check` returns the happy-path report.
  (window as unknown as { api: unknown }).api = {
    coverQa: {
      check: vi.fn().mockResolvedValue(makeReport()),
    },
  };
});

afterEach(() => {
  restoreFileReader();
  vi.restoreAllMocks();
});

describe('CoverQAModal', () => {
  it('renders with correct testid and shows the dropzone when no file picked', () => {
    render(
      <Wrap>
        <CoverQAModal onClose={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByTestId('cover-qa-modal')).toBeInTheDocument();
    expect(screen.getByTestId('cover-qa-dropzone')).toBeInTheDocument();
  });

  it('calls coverQa.check after a file is selected and displays the returned checks', async () => {
    const checkSpy = vi.fn().mockResolvedValue(
      makeReport({
        checks: [
          {
            id: 'dimensions.ebook',
            passed: false,
            severity: 'error',
            message: 'Cover too small',
            suggestion: 'Re-export larger',
          },
          {
            id: 'aspectRatio',
            passed: true,
            severity: 'info',
            message: 'Aspect ratio OK',
          },
        ],
      }),
    );
    (window as unknown as { api: unknown }).api = {
      coverQa: { check: checkSpy },
    };

    render(
      <Wrap>
        <CoverQAModal onClose={vi.fn()} />
      </Wrap>,
    );

    const fakeFile = new File(['hello-cover'], 'cover.png', { type: 'image/png' });
    const input = screen.getByTestId('cover-qa-file-input') as HTMLInputElement;
    // userEvent.upload handles the file-input edge cases that bare
    // fireEvent.change misses (e.g. populating `e.target.files`).
    const user = userEvent.setup();
    await user.upload(input, fakeFile);

    await waitFor(() => expect(checkSpy).toHaveBeenCalled());

    expect(checkSpy).toHaveBeenCalledWith(
      expect.objectContaining({ base64: expect.any(String), target: 'ebook' }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('cover-qa-check-dimensions.ebook')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Cover too small/i)).toBeInTheDocument();
    expect(screen.getByTestId('cover-qa-errors-count')).toBeInTheDocument();
  });

  it('shows a "Use anyway" button when onProceed is provided and forwards the file', async () => {
    const onProceed = vi.fn();
    render(
      <Wrap>
        <CoverQAModal
          onClose={vi.fn()}
          onProceed={onProceed}
          initialFile={new File(['x'], 'cover.png', { type: 'image/png' })}
        />
      </Wrap>,
    );

    // Wait until QA finishes (loading flag flips back to false ⇒ proceed
    // button becomes enabled). We detect that by the absence of the inline
    // analysing spinner via the checks list testid appearing.
    const proceed = await screen.findByTestId('cover-qa-proceed');
    await waitFor(() => expect(screen.getByTestId('cover-qa-checks')).toBeInTheDocument());
    await waitFor(() => expect(proceed).not.toBeDisabled());

    await act(async () => {
      proceed.click();
    });

    expect(onProceed).toHaveBeenCalledTimes(1);
    expect(onProceed.mock.calls[0][0]).toBeInstanceOf(File);
  });
});
