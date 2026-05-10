import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import { ToastProvider } from '../../../../contexts/ToastContext';
import { installMockApi } from '../../../../../test/mockApi';
import { ScheduleProfilesPanel } from '../ScheduleProfilesPanel';
import { CoverageGrid } from '../CoverageGrid';
import type { ScheduleProfile, CoverageDay } from '../../../../api/reportsQueue';

// reportsQueueApi is mocked at module level so we can control setScheduleProfile
vi.mock('../../../../api/reportsQueue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../api/reportsQueue')>();
  return {
    ...actual,
    reportsQueueApi: {
      ...actual.reportsQueueApi,
      setScheduleProfile: vi.fn().mockResolvedValue({ message: 'ok' }),
    },
  };
});

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

beforeEach(() => {
  installMockApi();
});

describe('ScheduleProfilesPanel', () => {
  it('renders profile rows with data-testid and toggle changes optimistically', async () => {
    const profiles: ScheduleProfile[] = [
      { profileId: 'p-001', accountName: 'US Store', scheduled: false },
      { profileId: 'p-002', accountName: 'UK Store', scheduled: true },
    ];

    const onProfilesChange = vi.fn();

    render(
      <Wrap>
        <ScheduleProfilesPanel profiles={profiles} onProfilesChange={onProfilesChange} />
      </Wrap>,
    );

    // Both rows rendered with correct test IDs
    expect(screen.getByTestId('search-term-schedule-row-p-001')).toBeInTheDocument();
    expect(screen.getByTestId('search-term-schedule-row-p-002')).toBeInTheDocument();

    // Toggle the first profile (currently not scheduled)
    const toggleBtn = screen
      .getByTestId('search-term-schedule-row-p-001')
      .querySelector('[role="switch"]') as HTMLButtonElement;

    expect(toggleBtn).not.toBeNull();
    fireEvent.click(toggleBtn);

    // onProfilesChange called with updated list
    await waitFor(() => {
      expect(onProfilesChange).toHaveBeenCalledOnce();
      const updated: ScheduleProfile[] = onProfilesChange.mock.calls[0][0];
      const changed = updated.find((p) => p.profileId === 'p-001');
      expect(changed?.scheduled).toBe(true);
    });
  });
});

describe('CoverageGrid', () => {
  it('renders coverage grid with data-testid when days are provided', () => {
    const today = new Date().toISOString().slice(0, 10);
    const days: CoverageDay[] = [
      { date: today, profileId: 'p-001', hasData: true },
      { date: today, profileId: 'p-002', hasData: false },
    ];

    render(
      <Wrap>
        <CoverageGrid days={days} />
      </Wrap>,
    );

    // Grid container rendered
    expect(screen.getByTestId('search-term-coverage-grid')).toBeInTheDocument();

    // Profile rows present
    expect(screen.getByTestId('search-term-coverage-row-p-001')).toBeInTheDocument();
    expect(screen.getByTestId('search-term-coverage-row-p-002')).toBeInTheDocument();

    // At least one green cell (hasData=true) and one grey cell (hasData=false)
    const greenCells = document.querySelectorAll('.bg-emerald-400');
    const greyCells = document.querySelectorAll('.bg-zinc-100');
    expect(greenCells.length).toBeGreaterThan(0);
    expect(greyCells.length).toBeGreaterThan(0);
  });

  it('renders empty state when no days provided', () => {
    render(
      <Wrap>
        <CoverageGrid days={[]} />
      </Wrap>,
    );

    // No grid
    expect(screen.queryByTestId('search-term-coverage-grid')).toBeNull();
    // Empty state key rendered
    expect(screen.getByText('searchTerm.coverage.empty')).toBeInTheDocument();
  });
});
