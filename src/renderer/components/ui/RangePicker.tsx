import React, { useEffect } from 'react';
import { RefreshCw, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RANGE_IDS, RangeId } from '../../lib/dateRange';

interface RangePickerProps {
  value: RangeId;
  onChange: (next: RangeId) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  ranges?: RangeId[];
  autoRefresh?: {
    storageKey: string;
    intervalMs?: number;
  };
}

const DEFAULT_INTERVAL_MS = 30_000;

function readAuto(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeAuto(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // ignore
  }
}

export const RangePicker: React.FC<RangePickerProps> = ({
  value,
  onChange,
  onRefresh,
  refreshing = false,
  ranges = RANGE_IDS.slice(0, 3),
  autoRefresh,
}) => {
  const { t } = useTranslation('common');
  const [autoOn, setAutoOn] = React.useState<boolean>(() =>
    autoRefresh ? readAuto(autoRefresh.storageKey) : false,
  );

  useEffect(() => {
    if (!autoRefresh || !autoOn || !onRefresh) return;
    const interval = autoRefresh.intervalMs ?? DEFAULT_INTERVAL_MS;
    const id = setInterval(onRefresh, interval);
    return () => clearInterval(id);
  }, [autoRefresh, autoOn, onRefresh]);

  const toggleAuto = () => {
    if (!autoRefresh) return;
    const next = !autoOn;
    setAutoOn(next);
    writeAuto(autoRefresh.storageKey, next);
  };

  const intervalSeconds = (autoRefresh?.intervalMs ?? DEFAULT_INTERVAL_MS) / 1000;

  return (
    <div className="flex items-center gap-1.5">
      <div className="inline-flex items-center bg-white border border-zinc-200 rounded-md p-0.5">
        {ranges.map((id) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`
              px-2.5 h-7 text-xs font-medium rounded
              transition-colors
              ${value === id
                ? 'bg-zinc-100 text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-900'}
            `}
          >
            {t(`ranges.${id}` as 'ranges.7d')}
          </button>
        ))}
      </div>
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          title={t('rangePicker.refresh')}
          aria-label={t('rangePicker.refreshAria')}
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
        </button>
      )}
      {autoRefresh && onRefresh && (
        <button
          onClick={toggleAuto}
          className={`
            h-7 px-2 flex items-center gap-1.5 rounded-md text-xs font-medium transition-colors
            ${autoOn
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 border border-transparent'}
          `}
          title={
            autoOn
              ? t('rangePicker.autoOnTitle')
              : t('rangePicker.autoOffTitle', { seconds: intervalSeconds })
          }
          aria-pressed={autoOn}
        >
          <Zap size={11} className={autoOn ? 'fill-emerald-500 text-emerald-500' : ''} />
          <span className="font-mono text-[10px]">
            {autoOn ? `${intervalSeconds}s` : t('rangePicker.autoLabel')}
          </span>
        </button>
      )}
    </div>
  );
};
