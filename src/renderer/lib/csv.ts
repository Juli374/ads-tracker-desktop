// RFC 4180 экранирование: оборачиваем в кавычки если есть запятая, кавычка,
// перевод строки, и удваиваем внутренние кавычки.
export const csvEscape = (v: unknown): string => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(
  rows: Array<Record<string, unknown>>,
  columns: string[],
): string {
  const header = columns.join(',');
  const body = rows
    .map((r) => columns.map((c) => csvEscape(r[c])).join(','))
    .join('\n');
  return rows.length === 0 ? header : `${header}\n${body}`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
