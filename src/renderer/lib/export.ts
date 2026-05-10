import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';

/**
 * Generic helpers for exporting tabular data to Excel and PDF in the renderer.
 *
 * Excel: uses SheetJS (xlsx). Data is an array of plain objects + ordered list
 * of column keys. Each object's columns are stringified by xlsx automatically.
 *
 * PDF: uses jspdf core (no autoTable). We render a simple title + table with
 * fixed column widths. For 100+ rows we paginate manually. Suitable for KPI
 * snapshots; for large data prefer Excel.
 */

export interface ExportColumn {
  key: string;
  label: string;
  width?: number; // PDF: in mm; Excel: ignored (auto-fit not used).
  align?: 'left' | 'right';
}

export function downloadExcel<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns: ExportColumn[],
  sheetName = 'Sheet1',
): void {
  const data = rows.map((r) => {
    const out: Record<string, unknown> = {};
    columns.forEach((c) => {
      out[c.label] = r[c.key];
    });
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(data, {
    header: columns.map((c) => c.label),
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

export function downloadPdf<T extends Record<string, unknown>>(
  filename: string,
  title: string,
  rows: T[],
  columns: ExportColumn[],
  options: { subtitle?: string; pageSize?: 'a4' | 'letter' } = {},
): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: options.pageSize ?? 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const lineHeight = 5;
  const headerHeight = 6;

  doc.setFontSize(14);
  doc.text(title, margin, margin + 6);
  let y = margin + 12;

  if (options.subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(options.subtitle, margin, y);
    doc.setTextColor(0);
    y += 5;
  }

  // Column widths: use explicit width if provided, otherwise distribute evenly.
  const totalExplicit = columns.reduce((s, c) => s + (c.width ?? 0), 0);
  const remaining = pageWidth - margin * 2 - totalExplicit;
  const autoCols = columns.filter((c) => c.width == null).length;
  const autoWidth = autoCols > 0 ? Math.max(20, remaining / autoCols) : 0;

  const colWidths = columns.map((c) => c.width ?? autoWidth);

  // Header row
  const drawHeader = () => {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(244, 244, 245);
    doc.rect(margin, y - headerHeight + 1, pageWidth - margin * 2, headerHeight, 'F');
    let x = margin + 1;
    columns.forEach((c, i) => {
      const w = colWidths[i];
      const label = c.label;
      const xText = c.align === 'right' ? x + w - 1 : x + 1;
      doc.text(label, xText, y - 1, {
        align: c.align === 'right' ? 'right' : 'left',
      });
      x += w;
    });
    doc.setFont('helvetica', 'normal');
  };

  drawHeader();
  y += 2;

  doc.setFontSize(8);
  rows.forEach((row) => {
    if (y + lineHeight > pageHeight - margin) {
      doc.addPage();
      y = margin + 6;
      drawHeader();
      y += 2;
    }
    let x = margin + 1;
    columns.forEach((c, i) => {
      const w = colWidths[i];
      const value = row[c.key];
      const text =
        value == null ? '—' : typeof value === 'number' ? String(value) : String(value);
      const xText = c.align === 'right' ? x + w - 1 : x + 1;
      doc.text(text, xText, y + lineHeight - 1, {
        align: c.align === 'right' ? 'right' : 'left',
        maxWidth: w - 2,
      });
      x += w;
    });
    y += lineHeight;
  });

  doc.save(filename);
}
