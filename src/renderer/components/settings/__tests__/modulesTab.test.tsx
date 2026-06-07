// Phase R — Modules catalog UI. Mocks the activation hook + entitlements + toast
// so we can assert rendering and the toggle/enable-all/reset wiring directly.
// (react-i18next is globally mocked in src/test/setup.ts → t(key) => key, so we
// assert on data-testids rather than translated text.)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const spies = vi.hoisted(() => ({
  // These return resolved promises — the component chains `.then()` on them.
  setModuleActive: vi.fn(() => Promise.resolve()),
  setManyModules: vi.fn(() => Promise.resolve()),
  resetModules: vi.fn(() => Promise.resolve()),
  markModulesSeen: vi.fn(() => Promise.resolve()),
  // Only ads_core active; isOn=false → start tier (ai module fully locked).
  isModuleActive: vi.fn((id: string) => id === 'ads_core'),
  isOn: vi.fn(() => false),
}));

vi.mock('../../../hooks/useModuleActivation', () => ({
  useModuleActivation: () => ({
    isModuleActive: spies.isModuleActive,
    setModuleActive: spies.setModuleActive,
    setManyModules: spies.setManyModules,
    resetModules: spies.resetModules,
    markModulesSeen: spies.markModulesSeen,
    newModuleIds: [],
    state: { modules: {}, newModuleIds: [] },
  }),
}));
vi.mock('../../../contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isOn: spies.isOn }),
}));
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { ModulesTab } from '../ModulesTab';

beforeEach(() => {
  spies.setModuleActive.mockClear();
  spies.setManyModules.mockClear();
  spies.resetModules.mockClear();
  spies.markModulesSeen.mockClear();
});

describe('ModulesTab', () => {
  it('renders grouped module rows and marks modules seen on mount', () => {
    render(<ModulesTab />);
    expect(screen.getByTestId('modules-tab')).toBeInTheDocument();
    expect(screen.getByTestId('module-row-core')).toBeInTheDocument();
    expect(screen.getByTestId('module-row-ads_core')).toBeInTheDocument();
    expect(screen.getByTestId('module-row-analytics')).toBeInTheDocument();
    expect(screen.getByTestId('module-row-ai')).toBeInTheDocument();
    expect(spies.markModulesSeen).toHaveBeenCalled();
  });

  it('core toggle is disabled (always on)', () => {
    render(<ModulesTab />);
    expect(screen.getByTestId('module-toggle-core')).toBeDisabled();
  });

  it('a fully-locked module (ai on start tier) has a disabled toggle', () => {
    render(<ModulesTab />);
    expect(screen.getByTestId('module-toggle-ai')).toBeDisabled();
  });

  it('toggling a free non-core module calls setModuleActive', () => {
    render(<ModulesTab />);
    fireEvent.click(screen.getByTestId('module-toggle-analytics'));
    expect(spies.setModuleActive).toHaveBeenCalledWith('analytics', true, 'user');
  });

  it('enable-all sends entitled non-core ids and excludes locked ones', () => {
    render(<ModulesTab />);
    fireEvent.click(screen.getByTestId('modules-enable-all'));
    expect(spies.setManyModules).toHaveBeenCalledTimes(1);
    const [ids, enabled, source] = spies.setManyModules.mock.calls[0] as unknown as [
      string[],
      boolean,
      string,
    ];
    expect(enabled).toBe(true);
    expect(source).toBe('enable_all');
    expect(ids).toContain('analytics'); // free module included
    expect(ids).not.toContain('ai'); // locked module excluded
    expect(ids).not.toContain('core'); // core never toggled
  });

  it('reset requires an inline confirm before calling resetModules', () => {
    render(<ModulesTab />);
    // Confirm button not present until reset clicked.
    expect(screen.queryByTestId('modules-reset-confirm')).toBeNull();
    fireEvent.click(screen.getByTestId('modules-reset'));
    fireEvent.click(screen.getByTestId('modules-reset-confirm'));
    expect(spies.resetModules).toHaveBeenCalledTimes(1);
  });
});
