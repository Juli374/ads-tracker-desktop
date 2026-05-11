import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { ProfilePage } from '../ProfilePage';
import { profileApi } from '../../api/profile';
import { ToastProvider } from '../../contexts/ToastContext';
import type {
  ApiRequestPayload,
  ApiResponse,
  MediaUploadPayload,
  MediaUploadResponse,
} from '../../../shared/ipc';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

const PROFILE = {
  id: 1,
  email: 'me@example.com',
  full_name: 'Old Name',
  role: 'user',
  avatar: null,
};

describe('ProfilePage', () => {
  let requestSpy: ReturnType<typeof vi.fn>;
  let mediaUploadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    requestSpy = vi.fn(async (payload: ApiRequestPayload): Promise<ApiResponse> => {
      if (payload.path === '/api/profile' && payload.method === 'GET') {
        return { ok: true, status: 200, data: { user: PROFILE } };
      }
      if (payload.path === '/api/profile' && payload.method === 'PUT') {
        const body = payload.body as { full_name: string };
        return {
          ok: true,
          status: 200,
          data: { message: 'ok', user: { ...PROFILE, full_name: body.full_name } },
        };
      }
      return { ok: false, status: 404, data: null, error: 'nf' };
    });

    mediaUploadSpy = vi.fn(async (_payload: MediaUploadPayload): Promise<MediaUploadResponse> => ({
      ok: true,
      status: 200,
      data: { message: 'ok', user: { ...PROFILE, avatar: 'https://example.com/avatar.jpg' } },
    }));

    vi.stubGlobal('api', {
      app: { getInfo: vi.fn(), getApiBaseUrl: vi.fn() },
      auth: { getToken: vi.fn(async () => 'tok'), setToken: vi.fn(), clearToken: vi.fn() },
      request: requestSpy,
      onDeepLink: vi.fn(() => () => undefined),
      shell: { openExternal: vi.fn() },
      mediaUpload: mediaUploadSpy,
      localRoyalty: {
        listUploads: vi.fn(async () => []),
        listRecords: vi.fn(async () => []),
        getSummary: vi.fn(async () => ({})),
        import: vi.fn(),
        delete: vi.fn(),
        filePath: vi.fn(async () => '/'),
      },
      update: { getStatus: vi.fn(async () => ({ state: 'idle', enabled: false })), check: vi.fn() },
      ai: { streamStart: vi.fn(), streamCancel: vi.fn(), onStreamChunk: vi.fn(() => () => undefined) },
    });
  });

  it('renders the page with sections, fullname input, and save button after profile load', async () => {
    render(
      <Wrap>
        <ProfilePage />
      </Wrap>,
    );

    expect(await screen.findByTestId('profile-page')).toBeInTheDocument();

    // Wait for the loaded form (rendered only when profile is fetched).
    await waitFor(
      () => {
        expect(screen.getByTestId('profile-fullname-input')).toBeInTheDocument();
        expect(screen.getByTestId('profile-save-btn')).toBeInTheDocument();
        expect(screen.getByTestId('profile-avatar-input')).toBeInTheDocument();
        expect(screen.getByTestId('profile-avatar-upload-btn')).toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    const input = screen.getByTestId('profile-fullname-input') as HTMLInputElement;
    expect(input.value).toBe('Old Name');

    // The GET /api/profile call should have happened.
    const getCall = (requestSpy.mock.calls as Array<[ApiRequestPayload]>).find(
      ([p]) => p.path === '/api/profile' && p.method === 'GET',
    );
    expect(getCall).toBeDefined();
  });

  it('profileApi.update calls PUT /api/profile with full_name', async () => {
    // Direct API-level test: verifies the api layer hits the right endpoint.
    // This complements the page test (which only verifies rendering) without
    // depending on jsdom synthetic-event quirks.
    const result = await profileApi.update({ full_name: 'New Name' });
    expect(result.full_name).toBe('New Name');

    const putCall = (requestSpy.mock.calls as Array<[ApiRequestPayload]>).find(
      ([p]) => p.path === '/api/profile' && p.method === 'PUT',
    );
    expect(putCall).toBeDefined();
    expect((putCall![0].body as { full_name: string }).full_name).toBe('New Name');
  });

  it('profileApi.uploadAvatar invokes mediaUpload with /api/profile/avatar', async () => {
    const file = new File(['data'], 'avatar.png', { type: 'image/png' });
    const updated = await profileApi.uploadAvatar(file);
    expect(updated.avatar).toBe('https://example.com/avatar.jpg');

    expect(mediaUploadSpy).toHaveBeenCalled();
    const call = mediaUploadSpy.mock.calls[0][0] as MediaUploadPayload;
    expect(call.path).toBe('/api/profile/avatar');
    expect(call.files[0].field).toBe('avatar');
    expect(call.files[0].name).toBe('avatar.png');
  });
});
