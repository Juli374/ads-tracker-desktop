import React from 'react';
import { SegmentedControl } from './ui';
import {
  ATTRIBUTION_WINDOWS,
  useGlobalFilters,
  type AttributionWindow,
} from '../contexts/GlobalFiltersContext';

/**
 * Phase Q.4.1 — global attribution toggle.
 *
 * Lifted from PnLPage's local `AttributionToggle` so Dashboard / Reports /
 * Comparison / Books drill all share one user-selected attribution window
 * (was hardcoded to `'14d'` per page — see parity_audit_2026-05-16).
 *
 * Mounted in the topbar (`MainLayout.tsx`) between `<GlobalFilters>` and the
 * `⌘K` palette trigger. Default = `'14d'` (per Phase P.1). Persists to
 * `localStorage` via `GlobalFiltersContext`.
 */
export const GlobalAttributionToggle: React.FC = () => {
  const { filters, setAttribution } = useGlobalFilters();
  return (
    <SegmentedControl<AttributionWindow>
      value={filters.attribution}
      onChange={setAttribution}
      options={ATTRIBUTION_WINDOWS.map((a) => ({
        value: a,
        label: a,
        testId: `global-attribution-${a}`,
      }))}
      size="sm"
      aria-label="Attribution window"
      data-testid="global-attribution-toggle"
    />
  );
};
