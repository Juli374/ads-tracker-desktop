import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { OperationsCenterPage } from '../OperationsCenterPage';
import { ToastProvider } from '../../contexts/ToastContext';
import { NavProvider } from '../../contexts/NavContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { MarketplacesProvider } from '../../contexts/MarketplacesContext';
import { BooksProvider } from '../../contexts/BooksContext';
import { GlobalFiltersProvider } from '../../contexts/GlobalFiltersContext';
import { installMockApi, mockApiResponses } from '../../../test/mockApi';
import type { ApiRequestPayload, ApiResponse } from '../../../shared/ipc';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <NavProvider>
    <ToastProvider>
      <AuthProvider>
        <MarketplacesProvider>
          <BooksProvider>
            <GlobalFiltersProvider>{children}</GlobalFiltersProvider>
          </BooksProvider>
        </MarketplacesProvider>
      </AuthProvider>
    </ToastProvider>
  </NavProvider>
);

describe('OperationsCenterPage — DnD + edit modal + KPI', () => {
  beforeEach(() => {
    installMockApi({
      responses: {
        ...mockApiResponses(),
        '/api/tasks': [
          { id: 1, title: 'Pending task', status: 'todo', priority: 'medium' },
          { id: 2, title: 'In flight', status: 'in_progress', priority: 'high' },
          { id: 3, title: 'Stuck', status: 'blocked', priority: 'urgent' },
          { id: 4, title: 'Shipped', status: 'done', priority: 'low' },
        ],
      },
    });
  });

  it('renders KPI tiles with totals and 4 DnD columns', async () => {
    render(
      <Wrap>
        <OperationsCenterPage />
      </Wrap>,
    );

    expect(await screen.findByTestId('operations-page')).toBeInTheDocument();

    // KPI block with 4 tiles.
    const kpi = await screen.findByTestId('operations-kpi');
    expect(kpi).toBeInTheDocument();

    // 4 DnD columns rendered with droppable test ids.
    expect(await screen.findByTestId('operations-column-todo')).toBeInTheDocument();
    expect(screen.getByTestId('operations-column-in_progress')).toBeInTheDocument();
    expect(screen.getByTestId('operations-column-blocked')).toBeInTheDocument();
    expect(screen.getByTestId('operations-column-done')).toBeInTheDocument();

    // Cards are draggable.
    expect(await screen.findByTestId('task-card-1')).toHaveAttribute('data-task-status', 'todo');
    expect(screen.getByTestId('task-card-2')).toHaveAttribute('data-task-status', 'in_progress');
  });

  it('opens edit modal on pencil click and saves a task', async () => {
    const user = userEvent.setup();

    // Capture PUT requests so we know the modal calls the right endpoint.
    const apiRecord = vi.fn(async (payload: ApiRequestPayload): Promise<ApiResponse> => {
      const responses = mockApiResponses();
      const baseTasks = [
        { id: 1, title: 'Pending task', status: 'todo', priority: 'medium' },
      ];
      if (payload.path === '/api/tasks' && payload.method === 'GET') {
        return { ok: true, status: 200, data: baseTasks };
      }
      if (payload.path === '/api/tasks/1' && payload.method === 'PUT') {
        return { ok: true, status: 200, data: { message: 'updated' } };
      }
      const data = (responses as Record<string, unknown>)[payload.path];
      if (data === undefined) return { ok: false, status: 404, data: null, error: 'nf' };
      return { ok: true, status: 200, data };
    }) as unknown as <T>(p: ApiRequestPayload) => Promise<ApiResponse<T>>;

    (window as unknown as { api: unknown }).api = {
      app: { getInfo: vi.fn(), getApiBaseUrl: vi.fn() },
      auth: { getToken: vi.fn(async () => 'tok'), setToken: vi.fn(), clearToken: vi.fn() },
      request: apiRecord,
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

    render(
      <Wrap>
        <OperationsCenterPage />
      </Wrap>,
    );

    await screen.findByTestId('task-card-1');

    // Open edit modal via pencil button.
    await user.click(screen.getByTestId('task-edit-1'));
    expect(await screen.findByTestId('edit-task-modal')).toBeInTheDocument();

    // Change title and save.
    const titleInput = screen.getByTestId('edit-task-title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated title');
    await user.click(screen.getByTestId('edit-task-save'));

    await waitFor(() => {
      const putCall = (apiRecord as unknown as { mock: { calls: Array<[ApiRequestPayload]> } }).mock.calls.find(
        ([p]) => p.path === '/api/tasks/1' && p.method === 'PUT',
      );
      expect(putCall).toBeDefined();
      expect((putCall![0].body as { title: string }).title).toBe('Updated title');
    });
  });

  it('drag-drop card to another column triggers PUT /status', async () => {
    const apiRecord = vi.fn(async (payload: ApiRequestPayload): Promise<ApiResponse> => {
      if (payload.path === '/api/tasks' && payload.method === 'GET') {
        return {
          ok: true,
          status: 200,
          data: [{ id: 7, title: 'To move', status: 'todo' }],
        };
      }
      if (payload.path === '/api/tasks/7/status' && payload.method === 'PUT') {
        return { ok: true, status: 200, data: { message: 'ok' } };
      }
      return { ok: true, status: 200, data: null };
    }) as unknown as <T>(p: ApiRequestPayload) => Promise<ApiResponse<T>>;

    (window as unknown as { api: unknown }).api = {
      app: { getInfo: vi.fn(), getApiBaseUrl: vi.fn() },
      auth: { getToken: vi.fn(async () => 'tok'), setToken: vi.fn(), clearToken: vi.fn() },
      request: apiRecord,
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

    render(
      <Wrap>
        <OperationsCenterPage />
      </Wrap>,
    );

    const card = await screen.findByTestId('task-card-7');
    const targetCol = screen.getByTestId('operations-column-in_progress');

    // Simulate HTML5 DnD events. react-dnd HTML5Backend hooks into these.
    await act(async () => {
      const dataTransfer = new DataTransfer();
      fireEvent.dragStart(card, { dataTransfer });
      fireEvent.dragEnter(targetCol, { dataTransfer });
      fireEvent.dragOver(targetCol, { dataTransfer });
      fireEvent.drop(targetCol, { dataTransfer });
      fireEvent.dragEnd(card, { dataTransfer });
    });

    await waitFor(
      () => {
        const putCall = (apiRecord as unknown as { mock: { calls: Array<[ApiRequestPayload]> } }).mock.calls.find(
          ([p]) => p.path === '/api/tasks/7/status' && p.method === 'PUT',
        );
        expect(putCall).toBeDefined();
        expect((putCall![0].body as { status: string }).status).toBe('in_progress');
      },
      { timeout: 4000 },
    );
  });
});
