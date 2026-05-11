import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { AIAdvisorPanel } from '../AIAdvisorPanel';
import { ToastProvider } from '../../../contexts/ToastContext';
import type { ApiRequestPayload, ApiResponse, AiStreamChunk, AiStreamStartPayload } from '../../../../shared/ipc';
import type { CampaignAnalyticsItem } from '../../../api/metrics';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

const CAMPAIGN: CampaignAnalyticsItem = {
  campaign_id: 100,
  amazon_campaign_id: 'C100',
  campaign_name: 'Test Campaign',
  campaign_type: 'sp',
  targeting_type: 'manual',
  book_id: 1,
  book_title: 'Test Book',
  book_cover: null,
  marketplace: 'USA',
  currency: 'USD',
  impressions: 100,
  clicks: 10,
  cost: 5,
  sales: 20,
  orders: 1,
  ctr: 10,
  cpc: 0.5,
  cr: 10,
  acos: 25,
  profit: 5,
};

describe('AIAdvisorPanel', () => {
  let chunkHandler: ((chunk: AiStreamChunk) => void) | null = null;
  let streamStartSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    chunkHandler = null;
    streamStartSpy = vi.fn();
  });

  const installApi = (historyResponse: ApiResponse) => {
    const requestImpl = vi.fn(async (payload: ApiRequestPayload): Promise<ApiResponse> => {
      if (payload.path.startsWith('/api/ai-advisor/campaign/') && payload.path.endsWith('/history')) {
        return historyResponse;
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
      ai: {
        streamStart: streamStartSpy as unknown as (p: AiStreamStartPayload) => Promise<void>,
        streamCancel: vi.fn(async () => undefined),
        onStreamChunk: vi.fn((handler: (chunk: AiStreamChunk) => void) => {
          chunkHandler = handler;
          return () => {
            chunkHandler = null;
          };
        }),
      },
    };
  };

  it('shows graceful unavailable banner when history endpoint returns 404', async () => {
    installApi({ ok: false, status: 404, data: null, error: 'Not Found' });

    render(
      <Wrap>
        <AIAdvisorPanel campaign={CAMPAIGN} onClose={() => undefined} />
      </Wrap>,
    );

    expect(await screen.findByTestId('ai-advisor-panel')).toBeInTheDocument();
    expect(await screen.findByTestId('ai-advisor-unavailable')).toBeInTheDocument();
  });

  it('renders streamed assistant chunks into the message bubble', async () => {
    const user = userEvent.setup();
    installApi({
      ok: true,
      status: 200,
      data: { conversationId: null, messages: [] },
    });

    render(
      <Wrap>
        <AIAdvisorPanel campaign={CAMPAIGN} onClose={() => undefined} />
      </Wrap>,
    );

    const input = await screen.findByTestId('ai-advisor-input');
    await user.type(input, 'How do I fix ACOS?');
    await user.click(screen.getByTestId('ai-advisor-send'));

    // streamStart should have been called with the right path + body.
    await waitFor(() => {
      expect(streamStartSpy).toHaveBeenCalled();
    });
    const startedWith = streamStartSpy.mock.calls[0][0] as AiStreamStartPayload;
    expect(startedWith.path).toBe('/api/ai-advisor/message');
    expect((startedWith.body as { campaign_id: number; message: string }).message).toBe(
      'How do I fix ACOS?',
    );

    // Simulate chunks coming back from main.
    expect(chunkHandler).not.toBeNull();
    await act(async () => {
      chunkHandler!({ streamId: startedWith.streamId, data: { type: 'text_delta', text: 'Lower ' } });
      chunkHandler!({ streamId: startedWith.streamId, data: { type: 'text_delta', text: 'bids.' } });
      chunkHandler!({ streamId: startedWith.streamId, data: { type: 'done' } });
    });

    // The assistant bubble should contain the streamed text.
    await waitFor(() => {
      const assistantBubble = screen.getByTestId('ai-advisor-msg-assistant');
      expect(assistantBubble.textContent ?? '').toContain('Lower bids.');
    });
  });
});
