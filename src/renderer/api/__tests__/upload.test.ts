import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from '../client';
import { uploadFile } from '../upload';
import type { MediaUploadResponse } from '../../../shared/ipc';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name = 'photo.jpg', type = 'image/jpeg', content = 'fake-content'): File {
  return new File([content], name, { type });
}

/**
 * Stub FileReader so it fires onload synchronously with a base64 data-URL.
 * Returns a restore function.
 */
function stubFileReader(base64Data = 'ZmFrZQ==') {
  const OriginalFileReader = globalThis.FileReader;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  class MockFileReader extends EventTarget {
    result: string | null = null;
    error: DOMException | null = null;
    onload: ((ev: ProgressEvent) => void) | null = null;
    onerror: ((ev: ProgressEvent) => void) | null = null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    readAsDataURL(_blob: Blob) {
      this.result = `data:image/jpeg;base64,${base64Data}`;
      // fire synchronously so tests don't need to await timers
      if (this.onload) {
        this.onload({ target: this } as unknown as ProgressEvent);
      }
    }

    // satisfy interface (not called in these tests)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    readAsArrayBuffer(_blob: Blob) { /* noop */ }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    readAsBinaryString(_blob: Blob) { /* noop */ }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    readAsText(_blob: Blob, _enc?: string) { /* noop */ }
    abort() { /* noop */ }
  }

  // @ts-expect-error replacing global
  globalThis.FileReader = MockFileReader;

  return () => {
    globalThis.FileReader = OriginalFileReader;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('uploadFile', () => {
  let restoreFileReader: () => void;

  beforeEach(() => {
    restoreFileReader = stubFileReader('ZmFrZQ==');
  });

  afterEach(() => {
    restoreFileReader();
    vi.restoreAllMocks();
  });

  it('resolves with response data on a successful upload', async () => {
    const mockResponse: MediaUploadResponse<{ url: string }> = {
      ok: true,
      status: 200,
      data: { url: 'https://cdn.example.com/cover.jpg' },
    };

    const mediaUploadSpy = vi.fn().mockResolvedValue(mockResponse);
    vi.stubGlobal('api', { mediaUpload: mediaUploadSpy });

    const file = makeFile('cover.jpg', 'image/jpeg');
    const result = await uploadFile<{ url: string }>('/api/books/1/cover', file, 'cover');

    expect(result).toEqual({ url: 'https://cdn.example.com/cover.jpg' });

    // Verify the payload shape forwarded to IPC
    expect(mediaUploadSpy).toHaveBeenCalledOnce();
    const [payload] = mediaUploadSpy.mock.calls[0];
    expect(payload.path).toBe('/api/books/1/cover');
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0]).toMatchObject({
      field: 'cover',
      name: 'cover.jpg',
      contentType: 'image/jpeg',
      base64: 'ZmFrZQ==',
    });
  });

  it('includes additional formFields in the payload', async () => {
    const mockResponse: MediaUploadResponse<{ id: number }> = {
      ok: true,
      status: 201,
      data: { id: 42 },
    };

    const mediaUploadSpy = vi.fn().mockResolvedValue(mockResponse);
    vi.stubGlobal('api', { mediaUpload: mediaUploadSpy });

    const file = makeFile('report.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await uploadFile<{ id: number }>(
      '/api/royalties/upload',
      file,
      'file',
      { marketplace: 'US', month: '2026-04' },
    );

    const [payload] = mediaUploadSpy.mock.calls[0];
    expect(payload.formFields).toEqual({ marketplace: 'US', month: '2026-04' });
  });

  it('throws ApiError with correct status when server returns 4xx', async () => {
    const mockResponse: MediaUploadResponse<null> = {
      ok: false,
      status: 422,
      data: null,
      error: 'Unsupported file type',
    };

    vi.stubGlobal('api', {
      mediaUpload: vi.fn(async () => mockResponse),
    });

    const file = makeFile('bad.txt', 'text/plain');

    await expect(uploadFile('/api/books/1/cover', file)).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      message: 'Unsupported file type',
    });

    let caughtError: unknown;
    try {
      await uploadFile('/api/books/1/cover', file);
    } catch (e) {
      caughtError = e;
    }
    expect(caughtError).toBeInstanceOf(ApiError);
  });
});
