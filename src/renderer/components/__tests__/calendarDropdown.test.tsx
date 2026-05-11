import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { CalendarDropdown } from '../CalendarDropdown';
import { ToastProvider } from '../../contexts/ToastContext';
import type { ApiRequestPayload, ApiResponse } from '../../../shared/ipc';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

describe('CalendarDropdown', () => {
  beforeEach(() => {
    const events = [
      { id: 11, title: 'Demo event', event_date: '2026-05-15', importance: 'medium' },
    ];
    const requestImpl = vi.fn(async (payload: ApiRequestPayload): Promise<ApiResponse> => {
      if (payload.path === '/api/calendar/upcoming-events') {
        return { ok: true, status: 200, data: events };
      }
      if (payload.path === '/api/calendar/events' && payload.method === 'POST') {
        return { ok: true, status: 200, data: { id: 99, message: 'created' } };
      }
      return { ok: false, status: 404, data: null, error: 'nf' };
    }) as unknown as <T>(p: ApiRequestPayload) => Promise<ApiResponse<T>>;

    (window as unknown as { api: unknown }).api = {
      app: { getInfo: vi.fn(), getApiBaseUrl: vi.fn() },
      auth: { getToken: vi.fn(async () => 'tok'), setToken: vi.fn(), clearToken: vi.fn() },
      request: requestImpl,
      onDeepLink: vi.fn(() => () => undefined),
      shell: { openExternal: vi.fn() },
      mediaUpload: vi.fn(),
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
    };
  });

  it('opens mini-month grid with 42 cells and weekday header', async () => {
    const user = userEvent.setup();
    render(
      <Wrap>
        <CalendarDropdown />
      </Wrap>,
    );

    // Trigger the dropdown.
    await user.click(await screen.findByTestId('calendar-dropdown-trigger'));

    expect(await screen.findByTestId('calendar-dropdown')).toBeInTheDocument();
    const grid = await screen.findByTestId('calendar-grid');
    expect(grid).toBeInTheDocument();

    // 42 cells (6 weeks × 7 days) — match by data-testid prefix.
    const cells = Array.from(grid.querySelectorAll('[data-testid^="calendar-cell-"]'));
    expect(cells.length).toBe(42);

    // Month label visible.
    expect(screen.getByTestId('calendar-month-label')).toBeInTheDocument();
  });

  it('AddEventModal posts /api/calendar/events on submit', async () => {
    const user = userEvent.setup();
    const apiRequestSpy = (window.api.request as unknown as ReturnType<typeof vi.fn>);

    render(
      <Wrap>
        <CalendarDropdown />
      </Wrap>,
    );

    await user.click(await screen.findByTestId('calendar-dropdown-trigger'));
    await user.click(await screen.findByTestId('calendar-add-event'));

    expect(await screen.findByTestId('add-event-modal')).toBeInTheDocument();

    const titleInput = screen.getByTestId('add-event-title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Launch promo');

    await user.click(screen.getByTestId('add-event-submit'));

    await waitFor(() => {
      const postCall = (apiRequestSpy.mock.calls as Array<[ApiRequestPayload]>).find(
        ([p]) => p.path === '/api/calendar/events' && p.method === 'POST',
      );
      expect(postCall).toBeDefined();
      expect((postCall![0].body as { title: string }).title).toBe('Launch promo');
    });
  });
});
