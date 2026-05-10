/**
 * Phase J.2 Lane B — bulk-action tests for CampaignDetailsPage TargetsTab.
 *
 * Цели:
 *  - Убедиться, что select-all + ×N приводит к одному POST'у на bulk endpoint.
 *  - Bulk delta-modal POSTит { delta } а не { multiplier }.
 *  - Bulk move-modal POSTит { ad_group_id }.
 *  - Bulk add-negative POSTит { campaign_id } или { list_id }.
 *  - CampaignPlacements рендерит editor + при наличии данных — таблицу.
 *
 * Каждый тест мокает несколько keywords (3+) чтобы select-all + bulk
 * был осмысленным.
 */
import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { MainLayout } from '../../components/MainLayout';
import { ToastProvider } from '../../contexts/ToastContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { MarketplacesProvider } from '../../contexts/MarketplacesContext';
import { BooksProvider } from '../../contexts/BooksContext';
import { GlobalFiltersProvider } from '../../contexts/GlobalFiltersContext';
import { installMockApi, mockApiResponses } from '../../../test/mockApi';
import type { ApiRequestPayload, ApiResponse, DesktopApi } from '../../../shared/ipc';

// Build a custom mockResponses pack that exposes 5 keywords + ad-groups.
const buildResponses = () => {
  const base = mockApiResponses();
  return {
    ...base,
    '/api/campaigns/100/ad-groups': [
      { id: 1000, campaign_id: 100, name: 'AG-1', default_bid: 0.5, state: 'enabled', targets_count: 5 },
      { id: 1001, campaign_id: 100, name: 'AG-2', default_bid: 0.5, state: 'enabled', targets_count: 0 },
    ],
    '/api/campaigns/100/targets': [
      { id: 5000, ad_group_id: 1000, campaign_id: 100, keyword_text: 'kw1', match_type: 'exact', bid: 0.5, state: 'enabled' },
      { id: 5001, ad_group_id: 1000, campaign_id: 100, keyword_text: 'kw2', match_type: 'exact', bid: 0.5, state: 'enabled' },
      { id: 5002, ad_group_id: 1000, campaign_id: 100, keyword_text: 'kw3', match_type: 'phrase', bid: 0.6, state: 'enabled' },
      { id: 5003, ad_group_id: 1000, campaign_id: 100, keyword_text: 'kw4', match_type: 'broad', bid: 0.7, state: 'enabled' },
      { id: 5004, ad_group_id: 1000, campaign_id: 100, keyword_text: 'kw5', match_type: 'exact', bid: 0.4, state: 'enabled' },
    ],
  };
};

// Spy installer: возвращает request-spy для проверки fact-of-call.
type ReqSpy = ReturnType<typeof vi.fn<[ApiRequestPayload], Promise<ApiResponse>>>;
const installSpyApi = (responses: Record<string, unknown>): ReqSpy => {
  installMockApi({ responses });
  // Replace the request fn with a spy that records every call but still
  // returns the canned response. We re-wire via the same lookup so default
  // behaviour matches installMockApi.
  const spy = vi.fn(async (payload: ApiRequestPayload): Promise<ApiResponse> => {
    const data = responses[payload.path];
    if (data === undefined) return { status: 404, ok: false, data: null, error: 'Not mocked' };
    return { status: 200, ok: true, data };
  });
  // Cast through unknown — DesktopApi.request имеет generic, тестовый spy
  // совместим в runtime, но не структурно.
  (window as unknown as { api: DesktopApi }).api.request = spy as unknown as DesktopApi['request'];
  return spy as unknown as ReqSpy;
};

beforeEach(() => {
  installMockApi({ responses: buildResponses() });
});

const renderApp = () =>
  render(
    <ToastProvider>
      <AuthProvider>
        <MarketplacesProvider>
          <BooksProvider>
            <GlobalFiltersProvider>
              <MainLayout />
            </GlobalFiltersProvider>
          </BooksProvider>
        </MarketplacesProvider>
      </AuthProvider>
    </ToastProvider>,
  );

const goToTargetsTab = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByTestId('dashboard-page');
  await user.click(screen.getByTestId('nav-campaigns'));
  await screen.findByTestId('campaigns-page');
  await user.click(await screen.findByText('Test Campaign'));
  await screen.findAllByRole('heading', { name: 'Test Campaign' });
  await user.click(screen.getByTestId('details-tab-targets'));
  await screen.findByTestId('targets-select-all');
};

describe('CampaignDetailsPage bulk operations', () => {
  it('select-all + apply ×0.8 multiplier hits /api/targets/bulk-update-bid once', async () => {
    const spy = installSpyApi(buildResponses());
    const user = userEvent.setup();
    renderApp();
    await goToTargetsTab(user);

    // select-all (5 keywords)
    await user.click(screen.getByTestId('targets-select-all'));
    expect(await screen.findByTestId('targets-bulk-bar')).toBeInTheDocument();

    // Заменяем default 1.10 на 0.8
    const multInput = screen.getByTestId('targets-bulk-bid-multiplier') as HTMLInputElement;
    await user.clear(multInput);
    await user.type(multInput, '0.8');
    await user.click(screen.getByTestId('targets-bulk-apply-multiplier'));

    await waitFor(() => {
      const bulkCalls = spy.mock.calls.filter(
        (c) => c[0].path === '/api/targets/bulk-update-bid',
      );
      expect(bulkCalls).toHaveLength(1);
      const body = bulkCalls[0][0].body as { target_ids: number[]; multiplier: number };
      expect(body.target_ids).toHaveLength(5);
      expect(body.multiplier).toBeCloseTo(0.8);
    });
  });

  it('bulk delta-modal POSTs { delta } to /api/targets/bulk-update-bid', async () => {
    const spy = installSpyApi(buildResponses());
    const user = userEvent.setup();
    renderApp();
    await goToTargetsTab(user);

    // select first 2 rows
    await user.click(screen.getByTestId('targets-row-checkbox-5000'));
    await user.click(screen.getByTestId('targets-row-checkbox-5001'));
    await user.click(screen.getByTestId('targets-bulk-open-delta'));

    await screen.findByTestId('bulk-delta-modal');
    const input = screen.getByTestId('bulk-delta-input') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '0.10');
    await user.click(screen.getByTestId('bulk-delta-apply'));

    await waitFor(() => {
      const calls = spy.mock.calls.filter((c) => c[0].path === '/api/targets/bulk-update-bid');
      expect(calls.length).toBeGreaterThanOrEqual(1);
      const body = calls[calls.length - 1][0].body as {
        target_ids: number[];
        delta?: number;
        multiplier?: number;
      };
      expect(body.target_ids).toEqual([5000, 5001]);
      expect(body.delta).toBeCloseTo(0.1);
      expect(body.multiplier).toBeUndefined();
    });
  });

  it('bulk move-modal POSTs { ad_group_id } to /api/targets/bulk-move', async () => {
    const spy = installSpyApi(buildResponses());
    const user = userEvent.setup();
    renderApp();
    await goToTargetsTab(user);

    await user.click(screen.getByTestId('targets-row-checkbox-5002'));
    await user.click(screen.getByTestId('targets-bulk-open-move'));

    const select = (await screen.findByTestId('bulk-move-select')) as HTMLSelectElement;
    await user.selectOptions(select, '1001');
    await user.click(screen.getByTestId('bulk-move-apply'));

    await waitFor(() => {
      const calls = spy.mock.calls.filter((c) => c[0].path === '/api/targets/bulk-move');
      expect(calls).toHaveLength(1);
      const body = calls[0][0].body as { target_ids: number[]; ad_group_id: number };
      expect(body.target_ids).toEqual([5002]);
      expect(body.ad_group_id).toBe(1001);
    });
  });

  it('bulk add-negative (campaign-level) POSTs { campaign_id } to /api/targets/bulk-add-negative', async () => {
    const spy = installSpyApi(buildResponses());
    const user = userEvent.setup();
    renderApp();
    await goToTargetsTab(user);

    await user.click(screen.getByTestId('targets-row-checkbox-5003'));
    await user.click(screen.getByTestId('targets-row-checkbox-5004'));
    await user.click(screen.getByTestId('targets-bulk-open-negative'));

    await screen.findByTestId('bulk-negative-modal');
    // Default scope = 'campaign' radio; just submit.
    await user.click(screen.getByTestId('bulk-negative-apply'));

    await waitFor(() => {
      const calls = spy.mock.calls.filter(
        (c) => c[0].path === '/api/targets/bulk-add-negative',
      );
      expect(calls).toHaveLength(1);
      const body = calls[0][0].body as {
        target_ids: number[];
        campaign_id?: number;
        list_id?: number;
        match_type: string;
      };
      expect(body.target_ids).toEqual([5003, 5004]);
      expect(body.campaign_id).toBe(100);
      expect(body.list_id).toBeUndefined();
      expect(body.match_type).toBe('exact');
    });
  });

  it('CampaignPlacements editor renders 3 inputs and per-week table from mock', async () => {
    const user = userEvent.setup();
    renderApp();
    await goToTargetsTab(user);

    // 3 inputs (TOS/PP/ROS) + per-week table from /api/campaigns/100/placement-history mock.
    expect(await screen.findByTestId('placements-editor')).toBeInTheDocument();
    expect(screen.getByTestId('placements-input-top_of_search')).toBeInTheDocument();
    expect(screen.getByTestId('placements-input-product_pages')).toBeInTheDocument();
    expect(screen.getByTestId('placements-input-rest_of_search')).toBeInTheDocument();

    // History fetch is async (Promise wrapped in graceful-404). Wait for the
    // table to appear (mock seeds /api/campaigns/100/placement-history).
    await waitFor(() => {
      expect(screen.getByTestId('placements-history-table')).toBeInTheDocument();
    });
  });
});
