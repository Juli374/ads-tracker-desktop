// Phase L.2 Lane B — Renderer API for Auto-Negativator.
//
// Thin wrapper around window.api.autoNeg.* — keeps the typed contract in one
// place and lets components import { autoNegApi } without sprinkling
// `window.api.autoNeg` calls everywhere (easier to mock in tests).

import type {
  AutoNegScanResult,
  AutoNegState,
  AutoNegThresholds,
} from '../../shared/ipc';

export const autoNegApi = {
  getState(): Promise<AutoNegState> {
    return window.api.autoNeg.getState();
  },
  toggle(enabled: boolean): Promise<AutoNegState> {
    return window.api.autoNeg.toggle(enabled);
  },
  runNow(): Promise<AutoNegScanResult> {
    return window.api.autoNeg.runNow();
  },
  getSettings(): Promise<AutoNegThresholds> {
    return window.api.autoNeg.getSettings();
  },
  setSettings(thresholds: AutoNegThresholds): Promise<AutoNegThresholds> {
    return window.api.autoNeg.setSettings(thresholds);
  },
  /** Subscribe to push state updates from main. Returns unsubscribe. */
  onStateChange(handler: (state: AutoNegState) => void): () => void {
    return window.api.autoNeg.onStateChange(handler);
  },
};
