// Phase L.2 Lane B — Auto-Negativator settings + control panel.
//
// Renders in the "Auto-Negativator" sub-tab of AutomationPage. The page itself
// guards entitlements (`automation.rules` → Business tier), so this panel
// assumes the feature is unlocked and just renders the controls.
//
// State flow:
//   - On mount: call getState() + getSettings() in parallel; subscribe to
//     `onStateChange` for push updates from main when a scan finishes.
//   - Toggle: optimistic UI — flip switch, call `toggle(enabled)`, revert on
//     error.
//   - Sliders: local state; debounce-save on commit via `setSettings`.
//   - Run-now: disabled while in-flight (prevents double-clicks).

import React, { useEffect, useState } from 'react';
import { Loader2, Play, Sparkles, ToggleLeft, ToggleRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  AutoNegScanResult,
  AutoNegState,
} from '../../../shared/ipc';
import { autoNegApi } from '../../api/autoNeg';
import { Card } from '../ui/Card';
import { useToast } from '../../contexts/ToastContext';
import { fmtNumber } from '../../lib/format';

interface ThresholdsForm {
  minClicks: number;
  minAcosMultiplier: number;
  minOrdersForAcos: number;
}

export const AutoNegativatorPanel: React.FC = () => {
  const { t } = useTranslation('automation');
  const toast = useToast();
  const [state, setState] = useState<AutoNegState | null>(null);
  const [form, setForm] = useState<ThresholdsForm | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [lastScan, setLastScan] = useState<AutoNegScanResult | null>(null);
  const [loading, setLoading] = useState(true);

  // Initial load + push subscription.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, settings] = await Promise.all([
          autoNegApi.getState(),
          autoNegApi.getSettings(),
        ]);
        if (cancelled) return;
        setState(s);
        setForm({
          minClicks: settings.minClicks,
          minAcosMultiplier: settings.minAcosMultiplier,
          minOrdersForAcos: settings.minOrdersForAcos,
        });
      } catch (err) {
        if (!cancelled) {
          toast.error(t('autoNeg.errors.loadFailed'));
          // eslint-disable-next-line no-console
          console.warn('[AutoNeg] initial load failed:', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const unsub = autoNegApi.onStateChange((next) => {
      setState(next);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [toast, t]);

  const handleToggle = async () => {
    if (!state) return;
    const target = !state.enabled;
    // Optimistic — flip UI immediately; revert if backend throws.
    setState({ ...state, enabled: target });
    try {
      const next = await autoNegApi.toggle(target);
      setState(next);
      toast.success(target ? t('autoNeg.enabled') : t('autoNeg.disabled'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[AutoNeg] toggle failed:', err);
      setState({ ...state, enabled: !target });
      toast.error(t('autoNeg.errors.toggleFailed'));
    }
  };

  const handleRunNow = async () => {
    if (runningNow) return;
    setRunningNow(true);
    try {
      const result = await autoNegApi.runNow();
      setLastScan(result);
      // Refresh state after run completes — main эмитнет push, но дополнительно
      // подстраховываемся explicit fetch'ем.
      const next = await autoNegApi.getState();
      setState(next);
      if (result.errors.length > 0) {
        toast.error(
          t('autoNeg.runWithErrors', { count: result.added, errors: result.errors.length }),
        );
      } else {
        toast.success(
          t('autoNeg.runSuccess', { count: result.added, inspected: result.inspected }),
        );
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[AutoNeg] runNow failed:', err);
      toast.error(t('autoNeg.errors.runFailed'));
    } finally {
      setRunningNow(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!form || savingSettings) return;
    setSavingSettings(true);
    try {
      const next = await autoNegApi.setSettings({
        minClicks: form.minClicks,
        minAcosMultiplier: form.minAcosMultiplier,
        minOrdersForAcos: form.minOrdersForAcos,
      });
      setForm({
        minClicks: next.minClicks,
        minAcosMultiplier: next.minAcosMultiplier,
        minOrdersForAcos: next.minOrdersForAcos,
      });
      toast.success(t('autoNeg.settingsSaved'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[AutoNeg] saveSettings failed:', err);
      toast.error(t('autoNeg.errors.saveSettingsFailed'));
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading || !state || !form) {
    return (
      <Card data-testid="auto-neg-panel-loading">
        <div className="px-5 py-8 text-center text-sm text-zinc-500">
          {t('autoNeg.loading')}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="auto-neg-panel">
      <Card>
        <div className="px-5 py-4 space-y-4">
          {/* Header + toggle */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-md bg-amber-50 flex items-center justify-center flex-shrink-0">
                <Sparkles size={16} className="text-amber-600" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">
                  {t('autoNeg.title')}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {t('autoNeg.subtitle')}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggle}
              data-testid="auto-neg-toggle"
              aria-label={
                state.enabled ? t('autoNeg.toggleOffAria') : t('autoNeg.toggleOnAria')
              }
              aria-pressed={state.enabled}
              className={`
                inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium
                transition-colors
                ${state.enabled
                  ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}
              `}
            >
              {state.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              {state.enabled ? t('autoNeg.on') : t('autoNeg.off')}
            </button>
          </div>

          {/* Status row */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-zinc-100">
            <StatusCell
              label={t('autoNeg.status.lastRun')}
              value={formatTimestamp(state.lastRunAt) ?? t('autoNeg.status.never')}
            />
            <StatusCell
              label={t('autoNeg.status.lastCount')}
              value={
                <span data-testid="auto-neg-last-count">
                  {fmtNumber(state.lastRecommendationCount)}
                </span>
              }
            />
            <StatusCell
              label={t('autoNeg.status.nextRun')}
              value={formatTimestamp(state.nextRunAt) ?? t('autoNeg.status.notScheduled')}
            />
          </div>

          {state.lastError && (
            <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <span className="font-medium">{t('autoNeg.lastErrorLabel')}: </span>
              <span data-testid="auto-neg-last-error">{state.lastError}</span>
            </div>
          )}

          {/* Run-now */}
          <div className="flex items-center justify-end pt-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={handleRunNow}
              disabled={runningNow}
              data-testid="auto-neg-run-now"
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium
                bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50
                disabled:cursor-not-allowed transition-colors
              "
            >
              {runningNow ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Play size={12} />
              )}
              {runningNow ? t('autoNeg.scanning') : t('autoNeg.runNow')}
            </button>
          </div>

          {lastScan && (
            <div
              className="text-[11px] text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2"
              data-testid="auto-neg-last-scan-result"
            >
              {t('autoNeg.scanSummary', {
                added: lastScan.added,
                inspected: lastScan.inspected,
                skipped: lastScan.skipped,
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Thresholds */}
      <Card title={t('autoNeg.thresholds.title')}>
        <div className="px-5 py-4 space-y-5">
          <ThresholdSlider
            id="auto-neg-min-clicks"
            label={t('autoNeg.thresholds.minClicks')}
            hint={t('autoNeg.thresholds.minClicksHint')}
            min={1}
            max={100}
            step={1}
            value={form.minClicks}
            onChange={(v) => setForm({ ...form, minClicks: v })}
          />
          <ThresholdSlider
            id="auto-neg-acos-mult"
            label={t('autoNeg.thresholds.minAcosMultiplier')}
            hint={t('autoNeg.thresholds.minAcosMultiplierHint')}
            min={1}
            max={5}
            step={0.1}
            value={form.minAcosMultiplier}
            onChange={(v) => setForm({ ...form, minAcosMultiplier: v })}
            valueLabel={(v) => `${v.toFixed(1)}×`}
          />
          <ThresholdSlider
            id="auto-neg-min-orders"
            label={t('autoNeg.thresholds.minOrdersForAcos')}
            hint={t('autoNeg.thresholds.minOrdersForAcosHint')}
            min={0}
            max={20}
            step={1}
            value={form.minOrdersForAcos}
            onChange={(v) => setForm({ ...form, minOrdersForAcos: v })}
          />
          <div className="flex items-center justify-end pt-3 border-t border-zinc-100">
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={savingSettings}
              data-testid="auto-neg-save-settings"
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium
                bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50
                disabled:cursor-not-allowed transition-colors
              "
            >
              {savingSettings ? t('autoNeg.saving') : t('autoNeg.saveSettings')}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
};

const StatusCell: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div>
    <div className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">
      {label}
    </div>
    <div className="text-xs text-zinc-900 tabular-nums mt-0.5">{value}</div>
  </div>
);

const ThresholdSlider: React.FC<{
  id: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  valueLabel?: (v: number) => string;
}> = ({ id, label, hint, min, max, step, value, onChange, valueLabel }) => {
  const display = valueLabel ? valueLabel(value) : String(value);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-xs font-medium text-zinc-900">
          {label}
        </label>
        <span
          data-testid={`${id}-value`}
          className="text-xs font-semibold tabular-nums text-zinc-900"
        >
          {display}
        </span>
      </div>
      <input
        id={id}
        data-testid={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-1.5 accent-amber-600"
      />
      <div className="text-[10px] text-zinc-500 mt-1">{hint}</div>
    </div>
  );
};

function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const d = new Date(t);
  // YYYY-MM-DD HH:mm local — короткий формат для plate'а.
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yy}-${mm}-${dd} ${hh}:${mi}`;
}
