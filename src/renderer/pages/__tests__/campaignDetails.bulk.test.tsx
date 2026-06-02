/**
 * Phase J.2 Lane B (rewired for #4 "bulk edits reach Amazon") — bulk-action
 * tests for CampaignDetailsPage TargetsTab (KeywordsTable).
 *
 * The old /api/targets/bulk-* contract is GONE. The real wiring now is:
 *  - ×N multiplier  → resolveBids turns it into ABSOLUTE per-target bids, then
 *    ONE POST /api/amazon-ads/targets/bulk-update with body
 *    { updates: [{ target_id, bid }] }. No multiplier/delta field, no state.
 *  - +$N delta      → same route, body.updates carries absolute current+amount.
 *  - move-to-ad-group → DEFERRED. The button renders disabled and fires no call.
 *  - add-negative   → real campaign route POST /api/campaigns/:id/negatives via
 *    negativesApi.addBulkToCampaign, body { keywords:[...], match_type:'Exact' }.
 *
 * Bids in the fixture (0.5/0.5/0.6/0.7/0.4) are chosen so every ×0.8 result is a
 * real change (no 'no-change' skips), keeping the resolved payload deterministic.
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

// Real bulk-update route + the per-item success shape the hook reads
// (succeeded/failed/results/errors). The spy below returns this for the POST so
// the optimistic-apply path completes and the success toast/reload fire.
const BULK_UPDATE_PATH = '/api/amazon-ads/targets/bulk-update';
const CAMPAIGN_NEGATIVES_PATH = '/api/campaigns/100/negatives';

// Build a custom mockResponses pack that exposes 5 keywords + ad-groups, plus
// success responses for the real Amazon-bulk + campaign-negatives routes.
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
    // POST /api/amazon-ads/targets/bulk-update — every selected item "succeeds".
    // succeeded/failed are recomputed by the hook from results/errors lengths,
    // but we return a benign success envelope so nothing reverts.
    [BULK_UPDATE_PATH]: { success: true, total: 5, succeeded: 5, failed: 0, results: [], errors: [] },
    // POST /api/campaigns/100/negatives — bulk add success.
    [CAMPAIGN_NEGATIVES_PATH]: { success: true, results: [] },
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

// Helper: collect every POST body to the bulk-update route.
const bulkUpdateBodies = (spy: ReqSpy) =>
  spy.mock.calls
    .filter((c) => c[0].path === BULK_UPDATE_PATH)
    .map((c) => c[0].body as { updates: Array<{ target_id: number; bid?: number; state?: string }> });

describe('CampaignDetailsPage bulk operations', () => {
  it('select-all + apply ×0.8 sends ONE bulk-update with absolute resolved bids', async () => {
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
      const bodies = bulkUpdateBodies(spy);
      expect(bodies).toHaveLength(1);
    });

    const body = bulkUpdateBodies(spy)[0];
    // current × 0.8, rounded to cents: 0.5→0.40, 0.6→0.48, 0.7→0.56, 0.4→0.32.
    const byId = new Map(body.updates.map((u) => [u.target_id, u]));
    expect(body.updates).toHaveLength(5);
    expect(byId.get(5000)?.bid).toBeCloseTo(0.4);
    expect(byId.get(5001)?.bid).toBeCloseTo(0.4);
    expect(byId.get(5002)?.bid).toBeCloseTo(0.48);
    expect(byId.get(5003)?.bid).toBeCloseTo(0.56);
    expect(byId.get(5004)?.bid).toBeCloseTo(0.32);
    // Each item is a pure { target_id, bid } — no state, no multiplier leakage.
    for (const u of body.updates) {
      expect(u.state).toBeUndefined();
      expect(Object.keys(u).sort()).toEqual(['bid', 'target_id']);
    }
    // Old contract must be fully gone.
    expect((body as Record<string, unknown>).multiplier).toBeUndefined();
    expect((body as Record<string, unknown>).target_ids).toBeUndefined();
  });

  it('bulk delta-modal sends absolute current+amount to bulk-update (no state)', async () => {
    const spy = installSpyApi(buildResponses());
    const user = userEvent.setup();
    renderApp();
    await goToTargetsTab(user);

    // select first 2 rows (both bid 0.5)
    await user.click(screen.getByTestId('targets-row-checkbox-5000'));
    await user.click(screen.getByTestId('targets-row-checkbox-5001'));
    await user.click(screen.getByTestId('targets-bulk-open-delta'));

    await screen.findByTestId('bulk-delta-modal');
    const input = screen.getByTestId('bulk-delta-input') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '0.10');
    await user.click(screen.getByTestId('bulk-delta-apply'));

    await waitFor(() => {
      expect(bulkUpdateBodies(spy).length).toBeGreaterThanOrEqual(1);
    });

    const bodies = bulkUpdateBodies(spy);
    const body = bodies[bodies.length - 1];
    // 0.5 + 0.10 = 0.60 for both rows; payload is absolute, not a delta.
    expect(body.updates).toEqual([
      { target_id: 5000, bid: 0.6 },
      { target_id: 5001, bid: 0.6 },
    ]);
    for (const u of body.updates) expect(u.state).toBeUndefined();
    expect((body as Record<string, unknown>).delta).toBeUndefined();
    expect((body as Record<string, unknown>).multiplier).toBeUndefined();
  });

  it('bulk move-to-ad-group is deferred: button is disabled and fires no call', async () => {
    const spy = installSpyApi(buildResponses());
    const user = userEvent.setup();
    renderApp();
    await goToTargetsTab(user);

    await user.click(screen.getByTestId('targets-row-checkbox-5002'));
    await screen.findByTestId('targets-bulk-bar');

    // Move is not shipped yet — the button renders disabled, no modal/route.
    const moveBtn = screen.getByTestId('targets-bulk-open-move') as HTMLButtonElement;
    expect(moveBtn).toBeDisabled();

    // Clicking a disabled button is a no-op; assert nothing reached the network.
    await user.click(moveBtn);
    expect(screen.queryByTestId('bulk-move-modal')).not.toBeInTheDocument();
    expect(spy.mock.calls.some((c) => c[0].path === '/api/targets/bulk-move')).toBe(false);
    // And it must not sneak a move through the bulk-update route either.
    expect(bulkUpdateBodies(spy)).toHaveLength(0);
  });

  it('bulk add-negative POSTs keywords to the campaign-negatives route', async () => {
    const spy = installSpyApi(buildResponses());
    const user = userEvent.setup();
    renderApp();
    await goToTargetsTab(user);

    // rows 5003 (kw4) + 5004 (kw5)
    await user.click(screen.getByTestId('targets-row-checkbox-5003'));
    await user.click(screen.getByTestId('targets-row-checkbox-5004'));
    await user.click(screen.getByTestId('targets-bulk-open-negative'));

    await screen.findByTestId('bulk-negative-modal');
    // Default scope = 'campaign', default match = exact; just submit.
    await user.click(screen.getByTestId('bulk-negative-apply'));

    await waitFor(() => {
      const calls = spy.mock.calls.filter((c) => c[0].path === CAMPAIGN_NEGATIVES_PATH);
      expect(calls).toHaveLength(1);
    });

    const call = spy.mock.calls.find((c) => c[0].path === CAMPAIGN_NEGATIVES_PATH)!;
    const body = call[0].body as {
      keywords: string[];
      match_type: string;
      sync_to_amazon?: boolean;
    };
    // Real bulk route is negativesApi.addBulkToCampaign → body { keywords,
    // match_type }. Keywords come from the selected targets' keyword_text;
    // match_type is Title-case ('Exact'/'Phrase') per NegativeMatchType.
    expect(body.keywords).toEqual(['kw4', 'kw5']);
    expect(body.match_type).toBe('Exact');
    // NOTE: the bulk campaign-negatives body carries no `sync_to_amazon` flag
    // (single-add negativesApi.add does; the bulk variant omits it and the
    // backend syncs campaign negatives by default). Assert it is NOT a stray
    // truthy field rather than asserting a value the client never sends.
    expect(body.sync_to_amazon).toBeUndefined();
    // The dead bulk route must never be hit.
    expect(spy.mock.calls.some((c) => c[0].path === '/api/targets/bulk-add-negative')).toBe(false);
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
