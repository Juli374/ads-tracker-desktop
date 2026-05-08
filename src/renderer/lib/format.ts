// Backend возвращает currency как символ ($, €, £, ¥). ISO_TO_SYMBOL — на случай если придёт ISO-код.
const ISO_TO_SYMBOL: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'A$', INR: '₹',
};

export function symbolFor(currency?: string | null): string {
  if (!currency) return '$';
  return ISO_TO_SYMBOL[currency.toUpperCase()] ?? currency;
}

export const fmtNumber = (n: number, max = 0) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: max }).format(n);

export const fmtMoney = (n: number, currency?: string | null) => {
  const sign = n < 0 ? '-' : '';
  return `${sign}${symbolFor(currency)}${fmtNumber(Math.abs(n))}`;
};

export const fmtMoneyPrecise = (n: number, currency?: string | null) => {
  const sign = n < 0 ? '-' : '';
  return `${sign}${symbolFor(currency)}${fmtNumber(Math.abs(n), 2)}`;
};

export const fmtPct = (n: number, digits = 1) =>
  `${n.toFixed(digits)}%`;

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
