// Phase L.2 Lane B — AutoNegativatorPanel renderer tests.
//
// What we assert:
//   - Panel renders the toggle / status row / Run-now / sliders after mount.
//   - Clicking the toggle calls `autoNeg.toggle(true)` exactly once.
//   - Clicking Run-now calls `autoNeg.runNow()` exactly once.
//
// Renderer tests rely on the global mockApi (window.api.autoNeg.*) and don't
// touch the main process at all.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { installMockApi } from '../../../../test/mockApi';
import { ToastProvider } from '../../../contexts/ToastContext';
import { AutoNegativatorPanel } from '../AutoNegativatorPanel';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

describe('AutoNegativatorPanel', () => {
  it('renders toggle, run-now button and threshold sliders after initial load', async () => {
    installMockApi({
      autoNegState: {
        enabled: false,
        lastRunAt: null,
        lastRecommendationCount: 0,
        nextRunAt: null,
        lastError: null,
      },
    });
    render(
      <Wrap>
        <AutoNegativatorPanel />
      </Wrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('auto-neg-panel')).toBeInTheDocument();
    });
    expect(screen.getByTestId('auto-neg-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('auto-neg-run-now')).toBeInTheDocument();
    expect(screen.getByTestId('auto-neg-min-clicks')).toBeInTheDocument();
    expect(screen.getByTestId('auto-neg-acos-mult')).toBeInTheDocument();
    expect(screen.getByTestId('auto-neg-min-orders')).toBeInTheDocument();
  });

  it('toggle button calls autoNeg.toggle(true) when starting from disabled', async () => {
    installMockApi({
      autoNegState: {
        enabled: false,
        lastRunAt: null,
        lastRecommendationCount: 0,
        nextRunAt: null,
        lastError: null,
      },
    });
    const user = userEvent.setup();
    render(
      <Wrap>
        <AutoNegativatorPanel />
      </Wrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('auto-neg-panel')).toBeInTheDocument();
    });
    const toggle = window.api.autoNeg.toggle as ReturnType<typeof vi.fn>;
    await user.click(screen.getByTestId('auto-neg-toggle'));
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledWith(true);
  });

  it('Run-now button calls autoNeg.runNow exactly once', async () => {
    installMockApi({
      autoNegScanResult: {
        added: 3,
        inspected: 42,
        skipped: 0,
        errors: [],
      },
    });
    const user = userEvent.setup();
    render(
      <Wrap>
        <AutoNegativatorPanel />
      </Wrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('auto-neg-panel')).toBeInTheDocument();
    });

    const runNow = window.api.autoNeg.runNow as ReturnType<typeof vi.fn>;
    await user.click(screen.getByTestId('auto-neg-run-now'));
    await waitFor(() => {
      expect(runNow).toHaveBeenCalledTimes(1);
    });
    // After the scan, the result summary should be visible.
    await waitFor(() => {
      expect(screen.getByTestId('auto-neg-last-scan-result')).toBeInTheDocument();
    });
  });
});
