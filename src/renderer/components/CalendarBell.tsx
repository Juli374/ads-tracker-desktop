import React, { useEffect, useRef, useState } from 'react';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { calendarApi, type CalendarEvent } from '../api/calendar';

const POLL_MS = 5 * 60 * 1000;

export const CalendarBell: React.FC = () => {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const list = await calendarApi.upcoming();
        if (cancelled) return;
        setEvents(Array.isArray(list) ? list : []);
        setUnsupported(false);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          setUnsupported(true);
          setEvents([]);
          return;
        }
        setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (unsupported) return null;

  const count = events?.length ?? 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="
          relative h-7 w-7 flex items-center justify-center rounded-md
          text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100
          transition-colors
        "
        aria-label={t('calendarBell.aria')}
      >
        <CalendarIcon size={14} />
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
        )}
      </button>

      {open && (
        <div className="
          absolute right-0 top-9 z-40 w-80
          bg-white border border-zinc-200 rounded-lg shadow-card overflow-hidden
        ">
          <div className="px-4 py-2.5 border-b border-zinc-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-900">{t('calendarBell.title')}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-zinc-400 hover:text-zinc-700"
              aria-label={t('calendarBell.closeAria')}
            >
              <X size={12} />
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading && !events ? (
              <div className="px-4 py-6 text-xs text-zinc-400 text-center">{t('calendarBell.loading')}</div>
            ) : !events || events.length === 0 ? (
              <div className="px-4 py-6 text-xs text-zinc-400 text-center">
                {t('calendarBell.empty')}
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {events.slice(0, 10).map((e) => (
                  <li key={e.id} className="px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-zinc-900 truncate">{e.title}</span>
                      <span className="text-[10px] text-zinc-500 tabular-nums">
                        {(e.event_date ?? '').slice(0, 10)}
                      </span>
                    </div>
                    {e.description && (
                      <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">
                        {e.description}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
