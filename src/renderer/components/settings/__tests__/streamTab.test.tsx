import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { StreamTab } from '../StreamTab';
import { ToastProvider } from '../../../contexts/ToastContext';
import { installMockApi } from '../../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

function buildHistory(count: number) {
  const runs = Array.from({ length: count }, (_, i) => ({
    id: `r${i + 1}`,
    startedAt: new Date(Date.UTC(2026, 4, 11, 10, 0, 0) - i * 60_000).toISOString(),
    completedAt: new Date(Date.UTC(2026, 4, 11, 10, 1, 0) - i * 60_000).toISOString(),
    status: 'success' as const,
    eventsProcessed: 100 + i,
  }));
  return { runs };
}

function defaultMocks(extra: Record<string, unknown> = {}) {
  installMockApi({
    responses: {
      '/api/marketing-stream/sync/status': { isRunning: false },
      '/api/marketing-stream/sync/stats': {
        totalEvents: 0,
        last24h: 0,
        last7d: 0,
        byMessageType: {},
      },
      '/api/marketing-stream/sync/history': { runs: [] },
      '/api/marketing-stream/sync/audit': { entries: [] },
      ...extra,
    },
  });
}

beforeEach(() => {
  defaultMocks();
});

describe('StreamTab', () => {
  it('renders the tab title', async () => {
    render(
      <Wrap>
        <StreamTab />
      </Wrap>,
    );
    expect(await screen.findByTestId('settings-stream-tab')).toBeInTheDocument();
    // t() returns the key in test env
    expect(await screen.findByText('stream.title')).toBeInTheDocument();
  });

  it('renders empty states for history and audit', async () => {
    render(
      <Wrap>
        <StreamTab />
      </Wrap>,
    );
    // History table present
    expect(await screen.findByTestId('stream-history-table')).toBeInTheDocument();
    // Audit panel present
    expect(await screen.findByTestId('stream-audit-panel')).toBeInTheDocument();
    // Empty state keys
    expect(await screen.findByText('stream.history.empty')).toBeInTheDocument();
    expect(await screen.findByText('stream.audit.empty')).toBeInTheDocument();
  });

  describe('countdown ticker', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('schedules a 1-second interval while nextRunAt is set', async () => {
      // Verify the ticker mechanic by spying on setInterval — the i18n mock
      // returns bare keys (no interpolation), so we can't assert on the
      // rendered countdown text. Instead, we confirm that StreamTab schedules
      // a 1-second interval when nextRunAt is non-null, and clears it on
      // unmount.
      const now = new Date('2026-05-11T10:00:00.000Z').getTime();
      const nextRunAt = new Date(now + 65_000).toISOString();

      defaultMocks({
        '/api/marketing-stream/sync/status': { isRunning: false, nextRunAt },
      });

      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

      const { unmount } = render(
        <Wrap>
          <StreamTab />
        </Wrap>,
      );

      // Wait for queries to resolve and the countdown line to mount.
      await screen.findByTestId('stream-countdown');

      // The tick effect schedules setInterval(_, 1000). It can also be set
      // by other things (React DevTools), so just check at least one call has
      // a 1000-ms cadence.
      const oneSecondCalls = setIntervalSpy.mock.calls.filter(
        ([, ms]) => ms === 1000,
      );
      expect(oneSecondCalls.length).toBeGreaterThanOrEqual(1);

      // Cleanup on unmount clears the interval.
      unmount();
      expect(clearIntervalSpy).toHaveBeenCalled();

      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('history pagination', () => {
    it('paginates when more than 20 runs are returned', async () => {
      defaultMocks({
        '/api/marketing-stream/sync/history': buildHistory(45),
      });

      render(
        <Wrap>
          <StreamTab />
        </Wrap>,
      );
      await screen.findByTestId('stream-history-table');
      // Pagination component renders a "1 / 3" label (Math.ceil(45/20) = 3).
      const pageLabel = await screen.findByText(/1 \/ 3/);
      expect(pageLabel).toBeInTheDocument();
    });

    it('does not render Pagination when total fits one page', async () => {
      defaultMocks({
        '/api/marketing-stream/sync/history': buildHistory(5),
      });

      render(
        <Wrap>
          <StreamTab />
        </Wrap>,
      );
      await screen.findByTestId('stream-history-table');
      // Pagination component returns null when pages <= 1.
      expect(screen.queryByText(/1 \/ 1/)).not.toBeInTheDocument();
    });
  });
});
