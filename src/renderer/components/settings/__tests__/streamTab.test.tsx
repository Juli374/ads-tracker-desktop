import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { StreamTab } from '../StreamTab';
import { ToastProvider } from '../../../contexts/ToastContext';
import { installMockApi } from '../../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

beforeEach(() => {
  installMockApi({
    responses: {
      '/api/marketing-stream/sync/status': {
        isRunning: false,
      },
      '/api/marketing-stream/sync/stats': {
        totalEvents: 0,
        last24h: 0,
        last7d: 0,
        byMessageType: {},
      },
      '/api/marketing-stream/sync/history': { runs: [] },
      '/api/marketing-stream/sync/audit': { entries: [] },
    },
  });
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
});
