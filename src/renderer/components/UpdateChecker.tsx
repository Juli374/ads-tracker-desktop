import React, { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { Card } from './ui';
import { useToast } from '../contexts/ToastContext';
import type { UpdateStatus } from '../../shared/ipc';

// Public-release scaffold. Сейчас main отдаёт enabled=false → UI рисует
// «отключено». Когда подключим electron-updater, badge оживёт сам.
export const UpdateChecker: React.FC = () => {
  const toast = useToast();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!window.api?.update) return;
    window.api.update
      .getStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const handleCheck = async () => {
    if (!window.api?.update) {
      toast.error('Update IPC недоступен');
      return;
    }
    setChecking(true);
    try {
      const next = await window.api.update.check();
      setStatus(next);
      if (!next.enabled) {
        toast.info('Auto-update пока выключен (scaffold).');
      } else if (next.state === 'available') {
        toast.success(`Доступно обновление ${next.version}`);
      } else if (next.state === 'not-available') {
        toast.success('Установлена последняя версия');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось проверить');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card title="Обновления">
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2
            size={14}
            className={status?.enabled ? 'text-emerald-600' : 'text-zinc-400'}
          />
          <span className="text-sm text-zinc-900">
            Текущая версия: {status?.current_version ?? '—'}
          </span>
        </div>
        <div className="text-xs text-zinc-500">
          {status?.enabled
            ? `Состояние: ${status.state}${status.version ? ` (${status.version})` : ''}`
            : 'Auto-update — scaffold (electron-updater пока не подключён). Архитектура готова: main/updater.ts, IPC update:getStatus / update:check, контракт в shared/ipc.ts.'}
        </div>
        <button
          type="button"
          onClick={handleCheck}
          disabled={checking}
          className="
            inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium
            text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
          Проверить обновления
        </button>
      </div>
    </Card>
  );
};
