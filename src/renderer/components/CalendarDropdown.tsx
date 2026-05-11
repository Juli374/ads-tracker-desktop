import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { calendarApi, type CalendarEvent } from '../api/calendar';
import { AddEventModal } from './AddEventModal';

const POLL_MS = 5 * 60 * 1000;

interface MonthGrid {
  year: number;
  month: number; // 0-indexed
  cells: Array<{
    date: Date;
    iso: string; // YYYY-MM-DD
    inMonth: boolean;
    isToday: boolean;
    isInNext7Days: boolean;
  }>;
}

function buildMonthGrid(year: number, month: number): MonthGrid {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysOut = new Date(today);
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

  const firstOfMonth = new Date(year, month, 1);
  // Start grid on Monday of week containing day-1.
  const firstDayWeekday = firstOfMonth.getDay(); // 0=Sun, 1=Mon
  const offset = firstDayWeekday === 0 ? -6 : 1 - firstDayWeekday;
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() + offset);

  const cells: MonthGrid['cells'] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const iso = isoDate(date);
    cells.push({
      date,
      iso,
      inMonth: date.getMonth() === month,
      isToday: isoDate(today) === iso,
      isInNext7Days: date >= today && date < sevenDaysOut,
    });
  }
  return { year, month, cells };
}

function isoDate(d: Date): string {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

export const CalendarDropdown: React.FC = () => {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
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
      if (addOpen) return;
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, addOpen]);

  const reload = async () => {
    try {
      const list = await calendarApi.upcoming();
      setEvents(Array.isArray(list) ? list : []);
    } catch {
      // silent
    }
  };

  if (unsupported) return null;

  const grid = useMemo(() => buildMonthGrid(view.year, view.month), [view]);
  const dateToEvents = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    (events ?? []).forEach((evt) => {
      const iso = (evt.event_date ?? '').slice(0, 10);
      if (!iso) return;
      const arr = map.get(iso) ?? [];
      arr.push(evt);
      map.set(iso, arr);
    });
    return map;
  }, [events]);

  const visibleEvents = useMemo(() => {
    const list = events ?? [];
    if (selectedDate) {
      return list.filter((e) => (e.event_date ?? '').slice(0, 10) === selectedDate);
    }
    return list;
  }, [events, selectedDate]);

  const count = events?.length ?? 0;

  const prevMonth = () =>
    setView((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 }));
  const nextMonth = () =>
    setView((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 }));

  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
    new Date(view.year, view.month, 1),
  );
  const weekdayKeys: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="calendar-dropdown-trigger"
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
        <div
          data-testid="calendar-dropdown"
          className="
            absolute right-0 top-9 z-40 w-[640px]
            bg-white border border-zinc-200 rounded-lg shadow-card overflow-hidden
            grid grid-cols-[1fr_240px]
          "
        >
          <div className="border-r border-zinc-100">
            <div className="px-3 py-2 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={prevMonth}
                  data-testid="calendar-prev-month"
                  className="h-6 w-6 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                  aria-label={t('calendarBell.prevMonthAria')}
                >
                  <ChevronLeft size={12} />
                </button>
                <span className="text-xs font-medium text-zinc-900 px-1.5 capitalize" data-testid="calendar-month-label">
                  {monthLabel}
                </span>
                <button
                  type="button"
                  onClick={nextMonth}
                  data-testid="calendar-next-month"
                  className="h-6 w-6 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                  aria-label={t('calendarBell.nextMonthAria')}
                >
                  <ChevronRight size={12} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                data-testid="calendar-add-event"
                className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium text-white bg-zinc-900 hover:bg-zinc-800"
              >
                <Plus size={10} />
                {t('calendarBell.add')}
              </button>
            </div>

            <div className="grid grid-cols-7 px-3 pt-2 pb-1 gap-px text-[10px] uppercase tracking-wider text-zinc-400">
              {weekdayKeys.map((wd) => (
                <span key={wd} className="text-center">{t(`calendarBell.weekdays.${wd}`)}</span>
              ))}
            </div>
            <div data-testid="calendar-grid" className="grid grid-cols-7 px-3 pb-3 gap-px">
              {grid.cells.map((cell) => {
                const evtsForDay = dateToEvents.get(cell.iso) ?? [];
                const isSelected = cell.iso === selectedDate;
                const tone = !cell.inMonth
                  ? 'text-zinc-300'
                  : cell.isToday
                  ? 'text-zinc-900 font-semibold'
                  : cell.isInNext7Days
                  ? 'text-zinc-900'
                  : 'text-zinc-600';
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => setSelectedDate(isSelected ? null : cell.iso)}
                    data-testid={`calendar-cell-${cell.iso}`}
                    className={`
                      relative h-9 text-[11px] tabular-nums rounded-sm
                      hover:bg-zinc-100 transition-colors
                      ${isSelected ? 'bg-zinc-900 text-white hover:bg-zinc-800' : ''}
                      ${cell.isInNext7Days && !isSelected && cell.inMonth ? 'bg-violet-50/70' : ''}
                      ${cell.isToday && !isSelected ? 'ring-1 ring-violet-400' : ''}
                    `}
                  >
                    <span className={isSelected ? '' : tone}>{cell.date.getDate()}</span>
                    {evtsForDay.length > 0 && (
                      <span
                        className={`absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full ${
                          isSelected ? 'bg-white' : 'bg-emerald-500'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col">
            <div className="px-3 py-2 border-b border-zinc-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-900">
                {selectedDate ? selectedDate : t('calendarBell.title')}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-zinc-400 hover:text-zinc-700"
                aria-label={t('calendarBell.closeAria')}
              >
                <X size={12} />
              </button>
            </div>
            <div className="flex-1 max-h-[260px] overflow-y-auto">
              {loading && !events ? (
                <div className="px-3 py-6 text-xs text-zinc-400 text-center">{t('calendarBell.loading')}</div>
              ) : !visibleEvents || visibleEvents.length === 0 ? (
                <div className="px-3 py-6 text-xs text-zinc-400 text-center">
                  {t('calendarBell.empty')}
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {visibleEvents.slice(0, 10).map((e) => (
                    <li key={e.id} className="px-3 py-2.5">
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
        </div>
      )}

      {addOpen && (
        <AddEventModal
          defaultDate={selectedDate ?? undefined}
          onClose={() => setAddOpen(false)}
          onCreated={reload}
        />
      )}
    </div>
  );
};
