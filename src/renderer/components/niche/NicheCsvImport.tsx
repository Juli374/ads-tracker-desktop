// Phase M.1 — Niche Explorer: CSV import card.
//
// Renderer-side file picker (<input type="file">) + FileReader read. The same
// pattern is used by L.4 ReverseAsinPanel — we avoid a new IPC channel because
// the renderer can do everything we need directly.
//
// The picker is mode-agnostic: caller passes a `parse(text) → rows` adapter so
// the same component services both the "by keyword" tab (parseNicheKeywordCsv)
// and the "by ASIN" tab (parseReverseAsinCsv from L.4).

import React, { useCallback, useRef } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props<T> {
  /** Parse-and-tag adapter. Throws on malformed CSV. */
  onParsed(rows: T[]): void;
  parse(text: string): T[];
  /** Disabled while a previous import is in progress. */
  importing: boolean;
  setImporting(importing: boolean): void;
  /** Error surfaced inline — caller renders a toast separately if desired. */
  onError(message: string): void;
  'data-testid'?: string;
}

/**
 * Read a File as a UTF-8 text string. Wraps FileReader in a Promise so the
 * caller can `await` it. Used instead of File.text() because jsdom (our test
 * environment) doesn't implement File.text() consistently.
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('File could not be read as text'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsText(file);
  });
}

export function NicheCsvImport<T>({
  onParsed,
  parse,
  importing,
  setImporting,
  onError,
  'data-testid': testId,
}: Props<T>): React.ReactElement {
  const { t } = useTranslation('research');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileChosen = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset input immediately so re-picking the same file fires onChange again.
      event.target.value = '';
      if (!file) return;
      setImporting(true);
      try {
        const text = await readFileAsText(file);
        const parsed = parse(text);
        onParsed(parsed);
      } catch (err) {
        const message =
          err instanceof Error
            ? // ParseError attaches an optional hint; we surface it inline.
              ((err as { hint?: string }).hint
                ? `${err.message} — ${(err as { hint?: string }).hint}`
                : err.message)
            : String(err);
        onError(t('import.parseError', { message }));
      } finally {
        setImporting(false);
      }
    },
    [parse, onParsed, onError, setImporting, t],
  );

  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <button
        type="button"
        onClick={onPickFile}
        disabled={importing}
        data-testid="niche-csv-import-btn"
        className="
          inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium
          rounded-md border border-zinc-200 bg-white text-zinc-700
          hover:bg-zinc-50 transition-colors disabled:opacity-50
        "
      >
        {importing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
        {importing ? t('import.importing') : t('import.csvButton')}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onFileChosen}
        className="hidden"
        data-testid="niche-csv-file-input"
      />
      <p className="text-[11px] text-zinc-400 mt-0.5 max-w-md">{t('import.hint')}</p>
    </div>
  );
}
