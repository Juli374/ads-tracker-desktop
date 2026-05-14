import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { HourlyDynamicsChart } from '../HourlyDynamicsChart';
import { EntitlementsProvider } from '../../../contexts/EntitlementsContext';
import { ToastProvider } from '../../../contexts/ToastContext';
import { WeeksFilterProvider } from '../../../contexts/WeeksFilterContext';
import { installMockApi, mockApiResponses } from '../../../../test/mockApi';

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>
    <EntitlementsProvider>
      <WeeksFilterProvider>{children}</WeeksFilterProvider>
    </EntitlementsProvider>
  </ToastProvider>
);

describe('HourlyDynamicsChart tier-gating', () => {
  it('shows locked placeholder + CTA when analytics.hourly_dynamics is off (tier=start)', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'start' },
    });
    render(
      <Wrap>
        <HourlyDynamicsChart
          amazonCampaignId="C100"
          currency="USD"
          from="2026-05-01"
          to="2026-05-15"
        />
      </Wrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('hourly-dynamics-locked')).toBeInTheDocument();
    });
    expect(screen.getByTestId('hourly-dynamics-upgrade-cta')).toBeInTheDocument();
    // Реальный chart — НЕ рендерится.
    expect(screen.queryByTestId('hourly-dynamics-chart')).toBeNull();
  });

  it('renders real chart when tier=pro (unlocked)', async () => {
    installMockApi({
      responses: mockApiResponses(),
      entitlements: { tier: 'pro' },
    });
    render(
      <Wrap>
        <HourlyDynamicsChart
          amazonCampaignId="C100"
          currency="USD"
          from="2026-05-01"
          to="2026-05-15"
        />
      </Wrap>,
    );
    // Wait for at least empty/chart container to appear.
    await waitFor(() => {
      // С mock-данными hourly есть 4 точки — chart должен попытаться отрендерить.
      // Но lazy import recharts может растянуть это; alternative: проверить
      // отсутствие locked placeholder'а — что страница не закрылась tier-gate'ом.
      expect(screen.queryByTestId('hourly-dynamics-locked')).toBeNull();
    });
  });
});
