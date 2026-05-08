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
  if (range === 'mtd') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: formatDate(first), to };
  }
  if (range === 'ytd') {
    const first = new Date(today.getFullYear(), 0, 1);
    return { from: formatDate(first), to };
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const from = new Date(today);
  from.setDate(from.getDate() - days + 1);
  return { from: formatDate(from), to };
}
