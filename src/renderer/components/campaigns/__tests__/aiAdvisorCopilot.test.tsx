// Phase M.3 — AIAdvisorPanel "Co-pilot" mode tests.
//
// Covers:
//   1. Mode toggle is present and renders both tabs.
//   2. Switching to Co-pilot loads targets, analyse → table renders.
//   3. Selecting subset + Apply → POST /api/amazon-ads/targets/bulk-update with
//      correct { updates } (pause as state:'PAUSED', lower as absolute bid).
//   4. Locked state (tier=start) renders upgrade nudge instead of co-pilot UI.
//
// We use installMockApi for the entitlements wiring and stub ai.generate +
// /api/campaigns/100/targets manually to drive the panel.

import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { AIAdvisorPanel } from '../AIAdvisorPanel';
import { ToastProvider } from '../../../contexts/ToastContext';
import { EntitlementsProvider } from '../../../contexts/EntitlementsContext';
import { installMockApi } from '../../../../test/mockApi';
import type { CampaignAnalyticsItem } from '../../../api/metrics';
import type { ApiRequestPayload, ApiResponse } from '../../../../shared/ipc';

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

const TARGETS = [
  {
    id: 5000,
    ad_group_id: 1000,
    campaign_id: 100,
    keyword_text: 'crockpot recipes',
    match_type: 'exact',
    bid: 0.5,
    state: 'enabled',
  },
  {
    id: 5001,
    ad_group_id: 1000,
    campaign_id: 100,
    keyword_text: 'slow cooker dinner',
    match_type: 'phrase',
    bid: 0.75,
    state: 'enabled',
  },
  {
    id: 5002,
    ad_group_id: 1000,
    campaign_id: 100,
    keyword_text: 'easy crockpot meal',
    match_type: 'broad',
    bid: 0.9,
    state: 'enabled',
  },
];

const ADVICE_JSON = JSON.stringify([
  {
    target_id: 5000,
    action: 'lower',
    multiplier: 0.8,
    reason: 'High ACOS — reduce by 20%',
  },
  {
    target_id: 5001,
    action: 'pause',
    reason: 'Zero orders on 100 clicks',
  },
  {
    target_id: 5002,
    action: 'raise',
    delta: 0.1,
    reason: 'Strong CR — push up by $0.10',
  },
]);

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>
    <EntitlementsProvider>{children}</EntitlementsProvider>
  </ToastProvider>
);

interface ApiCall {
  path: string;
  method?: string;
  body?: unknown;
}

describe('AIAdvisorPanel Co-pilot mode', () => {
  let apiCalls: ApiCall[];

  beforeEach(() => {
    apiCalls = [];
  });

  const setup = (opts: {
    tier?: 'start' | 'pro';
    targetsResponse?: ApiResponse;
    historyResponse?: ApiResponse;
    aiText?: string;
  } = {}) => {
    const { tier = 'pro', aiText = ADVICE_JSON } = opts;
    const targetsResponse: ApiResponse =
      opts.targetsResponse ?? { ok: true, status: 200, data: TARGETS };
    const historyResponse: ApiResponse =
      opts.historyResponse ?? {
        ok: true,
        status: 200,
        data: { conversationId: null, messages: [] },
      };

    installMockApi({ entitlements: { tier } });

    // Override request to track calls + serve targets / bulk endpoints.
    // We assign directly to window.api.request (not via cast) so the override
    // actually takes effect.
    const requestImpl = vi.fn(async (payload: ApiRequestPayload): Promise<ApiResponse> => {
      apiCalls.push({
        path: payload.path,
        method: payload.method,
        body: payload.body,
      });
      if (payload.path === '/api/campaigns/100/targets') {
        return targetsResponse;
      }
      if (payload.path.startsWith('/api/ai-advisor/campaign/')) {
        return historyResponse;
      }
      // Real bulk route — POST /api/amazon-ads/targets/bulk-update with body
      // { updates: [{ target_id, bid?, state? }] }. Echo each update back as a
      // success in `results` so the BulkUpdateResponse shape is honoured (the
      // hook branches on `failed`/`errors`, never the top-level `success`).
      if (payload.path === '/api/amazon-ads/targets/bulk-update') {
        const updates =
          (payload.body as { updates?: Array<{ target_id: number; bid?: number; state?: string }> })
            ?.updates ?? [];
        return {
          ok: true,
          status: 200,
          data: {
            success: true,
            total: updates.length,
            succeeded: updates.length,
            failed: 0,
            results: updates.map((u) => ({
              target_id: u.target_id,
              old_bid: null,
              new_bid: u.bid ?? null,
              old_status: 'enabled',
              new_state: u.state ?? null,
              campaign_id: 100,
              name: `#${u.target_id}`,
            })),
            errors: [],
          },
        };
      }
      return { ok: false, status: 404, data: null, error: 'Not mocked' };
    });
    const api = (window as unknown as { api: Record<string, unknown> }).api;
    api.request = requestImpl as unknown as typeof window.api.request;
    (api.ai as { generate: unknown }).generate = vi.fn(async () => ({
      text: aiText,
      model: 'claude-opus-4-7',
    })) as unknown as typeof window.api.ai.generate;
  };

  it('renders mode toggle with Chat (default) and Co-pilot tabs', async () => {
    setup({ tier: 'pro' });
    render(
      <Wrap>
        <AIAdvisorPanel campaign={CAMPAIGN} onClose={() => undefined} />
      </Wrap>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ai-advisor-mode-toggle')).toBeInTheDocument();
    });
    expect(screen.getByTestId('ai-advisor-mode-chat')).toBeInTheDocument();
    expect(screen.getByTestId('ai-advisor-mode-copilot')).toBeInTheDocument();
    // Chat is the default mode → the chat textarea is mounted.
    expect(screen.getByTestId('ai-advisor-input')).toBeInTheDocument();
    // Co-pilot body NOT yet mounted.
    expect(screen.queryByTestId('ai-advisor-copilot')).toBeNull();
  });

  it('switches to co-pilot, fetches targets, analyses and renders the table', async () => {
    setup({ tier: 'pro' });
    const user = userEvent.setup();
    render(
      <Wrap>
        <AIAdvisorPanel campaign={CAMPAIGN} onClose={() => undefined} />
      </Wrap>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ai-advisor-mode-copilot')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('ai-advisor-mode-copilot'));

    // Co-pilot body should mount and trigger targets fetch.
    await waitFor(() => {
      expect(screen.getByTestId('ai-advisor-copilot')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(apiCalls.some((c) => c.path === '/api/campaigns/100/targets')).toBe(true);
    });

    // Analyse button enabled once targets load.
    const analyzeBtn = await screen.findByTestId('copilot-analyze');
    await waitFor(() => {
      expect(analyzeBtn).not.toBeDisabled();
    });
    await user.click(analyzeBtn);

    // Wait for table to render with all 3 rows.
    await waitFor(() => {
      expect(screen.getByTestId('copilot-table')).toBeInTheDocument();
    });
    expect(screen.getByTestId('copilot-row-5000')).toBeInTheDocument();
    expect(screen.getByTestId('copilot-row-5001')).toBeInTheDocument();
    expect(screen.getByTestId('copilot-row-5002')).toBeInTheDocument();
    // Each row carries the action badge.
    expect(screen.getByTestId('copilot-badge-lower')).toBeInTheDocument();
    expect(screen.getByTestId('copilot-badge-pause')).toBeInTheDocument();
    expect(screen.getByTestId('copilot-badge-raise')).toBeInTheDocument();
  });

  it('applies selected rows via POST /api/amazon-ads/targets/bulk-update', async () => {
    setup({ tier: 'pro' });
    const user = userEvent.setup();
    render(
      <Wrap>
        <AIAdvisorPanel campaign={CAMPAIGN} onClose={() => undefined} />
      </Wrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('ai-advisor-mode-copilot')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('ai-advisor-mode-copilot'));
    await waitFor(() => {
      expect(screen.getByTestId('copilot-analyze')).not.toBeDisabled();
    });
    await user.click(screen.getByTestId('copilot-analyze'));
    await waitFor(() => {
      expect(screen.getByTestId('copilot-table')).toBeInTheDocument();
    });

    // Default: all 3 rows pre-selected. Deselect the 'raise' row so we only
    // apply { lower(5000), pause(5001) }.
    await user.click(screen.getByTestId('copilot-select-5002'));

    // Apply → confirm modal → confirm.
    await user.click(screen.getByTestId('copilot-apply'));
    expect(screen.getByTestId('copilot-confirm')).toBeInTheDocument();
    await user.click(screen.getByTestId('copilot-confirm-apply'));

    // Pause (applyState) and bid (applyBids) may post as SEPARATE calls to the
    // same route, so flatten `updates` across every bulk-update POST and assert
    // the resolved items appear somewhere in the union.
    type Upd = { target_id: number; bid?: number; state?: 'ENABLED' | 'PAUSED' };
    const allUpdates = (): Upd[] =>
      apiCalls
        .filter((c) => c.path === '/api/amazon-ads/targets/bulk-update')
        .flatMap((c) => ((c.body as { updates?: Upd[] })?.updates ?? []));

    // At least one POST must hit the real bulk route (and ONLY that route).
    await waitFor(() => {
      expect(
        apiCalls.some((c) => c.path === '/api/amazon-ads/targets/bulk-update'),
      ).toBe(true);
    });

    // Pause advice (5001) → state-only update { target_id, state:'PAUSED' }.
    await waitFor(() => {
      const pause = allUpdates().find((u) => u.target_id === 5001);
      expect(pause).toBeDefined();
      expect(pause!.state).toBe('PAUSED');
      expect(pause!.bid).toBeUndefined();
    });

    // Lower advice (5000, ×0.8) → absolute rounded bid 0.5 * 0.8 = 0.40, NO state.
    await waitFor(() => {
      const bid = allUpdates().find((u) => u.target_id === 5000);
      expect(bid).toBeDefined();
      expect(bid!.bid).toBe(0.4);
      expect(bid!.state).toBeUndefined();
    });

    // The deselected 'raise' row (5002) must NOT be applied.
    expect(allUpdates().some((u) => u.target_id === 5002)).toBe(false);

    // Old per-action routes must never be hit.
    expect(apiCalls.some((c) => c.path === '/api/targets/bulk-pause')).toBe(false);
    expect(apiCalls.some((c) => c.path === '/api/targets/bulk-update-bid')).toBe(false);
  });

  it('renders upgrade nudge when ai.bid_copilot is locked (tier=start)', async () => {
    setup({ tier: 'start' });
    const user = userEvent.setup();
    render(
      <Wrap>
        <AIAdvisorPanel campaign={CAMPAIGN} onClose={() => undefined} />
      </Wrap>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ai-advisor-mode-copilot')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('ai-advisor-mode-copilot'));

    await waitFor(() => {
      expect(screen.getByTestId('copilot-locked')).toBeInTheDocument();
    });
    // Analyse button MUST NOT render in locked state.
    expect(screen.queryByTestId('copilot-analyze')).toBeNull();
    // No targets fetch should happen when locked.
    expect(apiCalls.some((c) => c.path === '/api/campaigns/100/targets')).toBe(false);
  });
});
