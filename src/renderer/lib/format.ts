// Backend возвращает currency как символ ($, €, £, ¥). ISO_TO_SYMBOL — на случай если придёт ISO-код.
const ISO_TO_SYMBOL: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'A$', INR: '₹',
};

export function symbolFor(currency?: string | null): string {
  if (!currency) return '$';
  return ISO_TO_SYMBOL[currency.toUpperCase()] ?? currency;
}

// Все форматтеры безопасны по отношению к null/undefined/NaN/Infinity:
// возвращают '—' если значение невалидно. Это важно, потому что бэкенд
// иногда возвращает поля как undefined (e.g. tacos на пустых периодах),
// и любой Number.toFixed на них кидает ErrorBoundary.
const isFiniteNumber = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);

export const fmtNumber = (n: number | null | undefined, max = 0) => {
  if (!isFiniteNumber(n)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: max }).format(n);
};

export const fmtMoney = (n: number | null | undefined, currency?: string | null) => {
  if (!isFiniteNumber(n)) return '—';
  const sign = n < 0 ? '-' : '';
  // Phase Q.5+ — show 2 decimals always. Round-to-dollar (the previous default)
  // hid real values like $204.73 as "$205" in KPI tiles and tables, which is
  // sloppy for a financial tool. fmtMoneyPrecise stays as an explicit alias.
  return `${sign}${symbolFor(currency)}${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n))}`;
};

export const fmtMoneyPrecise = (n: number | null | undefined, currency?: string | null) => {
  if (!isFiniteNumber(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return `${sign}${symbolFor(currency)}${formatted}`;
};

export const fmtPct = (n: number | null | undefined, digits = 1) => {
  if (!isFiniteNumber(n)) return '—';
  return `${n.toFixed(digits)}%`;
};

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
