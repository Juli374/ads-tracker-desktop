import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle, Info, BellOff } from 'lucide-react';
import { metricsApi, type AlertItem } from '../../api/metrics';
import { ApiError } from '../../api/client';
import { LoadingRow } from '../ui';

interface Props {
  from?: string;
  to?: string;
  attribution?: '1d' | '7d' | '14d' | '30d';
  marketplaces?: string[];
  bookIds?: number[];
  accounts?: string[];
}

const severityIcon = (sev: string) => {
  if (sev === 'critical' || sev === 'error')
    return <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />;
  if (sev === 'warning' || sev === 'warn')
    return <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />;
  return <Info size={14} className="text-sky-500 flex-shrink-0 mt-0.5" />;
};

export const AlertsWidget: React.FC<Props> = ({
  from,
  to,
  attribution = '14d',
  marketplaces,
  bookIds,
  accounts,
}) => {
  const { t } = useTranslation('dashboard');
  const [alerts, setAlerts] = useState<AlertItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUnsupported(false);
    metricsApi
      .alerts({ from, to, attribution, marketplaces, bookIds, accounts })
      .then((res) => {
        if (cancelled) return;
        setAlerts(Array.isArray(res?.alerts) ? res.alerts : []);
      })
      .catch((err) => {
        if (cancelled) return;
        // 401/403/404 — endpoint недоступен или not-yet-deployed: показываем пустое
        // состояние без error toast, чтобы не шуметь.
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          setUnsupported(true);
          setAlerts([]);
          return;
        }
        setAlerts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, attribution, marketplaces, bookIds, accounts]);

  if (loading && alerts == null) {
    return <LoadingRow />;
  }

  if (unsupported) {
    return (
      <div className="text-xs text-zinc-400 py-3 text-center flex flex-col items-center gap-1.5">
        <BellOff size={14} />
        {t('alerts.unavailable')}
      </div>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <div className="text-xs text-zinc-400 py-3 text-center">{t('alerts.empty')}</div>
    );
  }

  return (
    <ul className="space-y-2">
      {alerts.slice(0, 5).map((a) => (
        <li key={a.id} className="flex items-start gap-2">
          {severityIcon(a.severity)}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-zinc-900 truncate">{a.title}</div>
            {a.message && (
              <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">
                {a.message}
              </div>
            )}
          </div>
        </li>
      ))}
      {alerts.length > 5 && (
        <li className="text-[11px] text-zinc-400 pt-1">
          {t('alerts.moreCount', { count: alerts.length - 5 })}
        </li>
      )}
    </ul>
  );
};
