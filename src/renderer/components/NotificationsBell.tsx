import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  notificationsApi,
  Notification,
} from '../api/notifications';
import { ApiError } from '../api/client';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';

const POLL_MS = 60_000;
const LIST_LIMIT = 20;

function shouldDisable(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

export const NotificationsBell: React.FC = () => {
  const { t } = useTranslation('alerts');
  const toast = useToast();
  const { status: authStatus } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const fetchUnread = useCallback(async () => {
    if (disabledRef.current || authStatus !== 'authenticated') return;
    try {
      const res = await notificationsApi.unreadCount();
      setUnread(res.total ?? 0);
    } catch (err) {
      if (err instanceof ApiError && shouldDisable(err.status)) {
        setDisabled(true);
      }
    }
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    fetchUnread();
    const id = setInterval(fetchUnread, POLL_MS);
    return () => clearInterval(id);
  }, [authStatus, fetchUnread]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await notificationsApi.list({ limit: LIST_LIMIT });
      setItems(res.notifications ?? []);
    } catch (err) {
      if (err instanceof ApiError && shouldDisable(err.status)) {
        setDisabled(true);
        setOpen(false);
        return;
      }
      toast.error(
        err instanceof ApiError ? err.message : t('bell.loadFailed'),
      );
    } finally {
      setLoadingList(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const onToggle = () => {
    if (disabled) return;
    const next = !open;
    setOpen(next);
    if (next) fetchList();
  };

  const onMarkRead = async (n: Notification) => {
    if (n.is_read) return;
    try {
      await notificationsApi.markRead(n.id);
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, is_read: 1 } : i)));
      setUnread((u) => Math.max(0, u - 1));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('bell.updateFailed'));
    }
  };

  const onMarkAll = async () => {
    try {
      await notificationsApi.markAllRead();
      setItems((prev) => prev.map((i) => ({ ...i, is_read: 1 })));
      setUnread(0);
      toast.success(t('bell.markAllSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('bell.updateFailed'));
    }
  };

  if (disabled) {
    return (
      <button
        className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-300 cursor-not-allowed"
        title={t('bell.unavailable')}
        disabled
      >
        <Bell size={14} strokeWidth={2} />
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        className="relative h-7 w-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
        aria-label={t('bell.aria')}
        aria-expanded={open}
      >
        <Bell size={14} strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-40 w-80 bg-white border border-zinc-200 rounded-lg shadow-card overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-100 flex items-center justify-between">
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              {t('bell.title')}
              {unread > 0 && (
                <span className="ml-1.5 text-red-500 normal-case">{unread}</span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={onMarkAll}
                className="
                  inline-flex items-center gap-1 text-[10px] text-zinc-500
                  hover:text-zinc-900 transition-colors
                "
              >
                <CheckCheck size={10} />
                {t('bell.markAll')}
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {loadingList ? (
              <div className="px-4 py-6 flex items-center justify-center">
                <Loader2 size={14} className="animate-spin text-zinc-400" />
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-zinc-400">
                {t('bell.empty')}
              </div>
            ) : (
              items.map((n) => (
                <NotificationItem key={n.id} n={n} onMarkRead={onMarkRead} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const NotificationItem: React.FC<{
  n: Notification;
  onMarkRead: (n: Notification) => void;
}> = ({ n, onMarkRead }) => {
  const { t } = useTranslation('alerts');
  const isRead = !!n.is_read;

  const relative = (iso: string): string => {
    const ts = new Date(iso).getTime();
    if (!Number.isFinite(ts)) return iso;
    const diff = Date.now() - ts;
    if (diff < 60_000) return t('bell.relative.justNow');
    if (diff < 3_600_000) {
      return t('bell.relative.minutesAgo', { count: Math.round(diff / 60_000) });
    }
    if (diff < 86_400_000) {
      return t('bell.relative.hoursAgo', { count: Math.round(diff / 3_600_000) });
    }
    if (diff < 7 * 86_400_000) {
      return t('bell.relative.daysAgo', { count: Math.round(diff / 86_400_000) });
    }
    return iso.slice(0, 10);
  };

  return (
    <button
      onClick={() => onMarkRead(n)}
      className={`
        w-full text-left px-3 py-2.5 border-b border-zinc-100 last:border-b-0
        hover:bg-zinc-50 transition-colors
        ${isRead ? 'opacity-60' : ''}
      `}
      disabled={isRead}
    >
      <div className="flex items-start gap-2.5">
        {!isRead && (
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-zinc-900 truncate">{n.title}</div>
          {n.message && (
            <div className="text-[11px] text-zinc-600 mt-0.5 line-clamp-2">
              {n.message}
            </div>
          )}
          {n.created_at && (
            <div className="text-[10px] text-zinc-400 mt-1">
              {relative(n.created_at)}
            </div>
          )}
        </div>
      </div>
    </button>
  );
};
