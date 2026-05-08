import { formatDate } from './format';

export type RangeId = '7d' | '30d' | '90d' | 'mtd' | 'ytd';

export interface RangeOption {
  id: RangeId;
  label: string;
}

export const RANGES: RangeOption[] = [
  { id: '7d', label: '7 дней' },
  { id: '30d', label: '30 дней' },
  { id: '90d', label: '90 дней' },
  { id: 'mtd', label: 'MTD' },
  { id: 'ytd', label: 'YTD' },
];

export function dateRangeFor(range: RangeId): { from: string; to: string } {
  const today = new Date();
  const to = formatDate(today);
  // Используем UTC-конструкторы чтобы результат не зависел от часового пояса
  // машины — backend оперирует UTC-датами и расчёт стабилен в тестах.
  if (range === 'mtd') {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return { from: formatDate(first), to };
  }
  if (range === 'ytd') {
    const first = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    return { from: formatDate(first), to };
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - days + 1);
  return { from: formatDate(from), to };
}
