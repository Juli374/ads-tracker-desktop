import { formatDate } from './format';

export type RangeId = '7d' | '30d' | '90d' | 'mtd' | 'ytd' | 'lastMonth';

// Список id'ов диапазона. Метки берутся через t(`ranges.${id}`) из common.json
// в местах использования (RangePicker, ComparisonPage).
export const RANGE_IDS: RangeId[] = ['7d', '30d', '90d', 'mtd', 'ytd', 'lastMonth'];

export interface RangeOption {
  id: RangeId;
  label: string;
}

/**
 * Backwards-compat: возвращает id-only список с placeholder label = id.
 * Места которые используют это (RangePicker default), должны вызывать
 * `t('ranges.<id>')` и не полагаться на label из этого массива.
 */
export const RANGES: RangeOption[] = RANGE_IDS.map((id) => ({ id, label: id }));

export function dateRangeFor(range: RangeId): { from: string; to: string } {
  const today = new Date();
  const to = formatDate(today);
  if (range === 'mtd') {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return { from: formatDate(first), to };
  }
  if (range === 'ytd') {
    const first = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    return { from: formatDate(first), to };
  }
  if (range === 'lastMonth') {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    return { from: formatDate(first), to: formatDate(last) };
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - days + 1);
  return { from: formatDate(from), to };
}
