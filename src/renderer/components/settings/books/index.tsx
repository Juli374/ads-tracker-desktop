import React, {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowRight,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBooks } from '../../../contexts/BooksContext';
import { booksApi, Book, BookCreate, BookUpdate } from '../../../api/books';
import { useToast } from '../../../contexts/ToastContext';
import { useNav } from '../../../contexts/NavContext';
import { ApiError } from '../../../api/client';
import { Card, EmptyState } from '../../ui';
import { parseCsv } from './csvParser';

/**
 * Phase J.3 Lane C — Settings → Books tab.
 *
 * Replaces the previous master-detail panel with a flat editable table:
 *   • inline edit for title / author / language / series_name
 *     (commits on blur; ESC reverts; Enter blurs the field)
 *   • bulk-select + bulk-delete with confirm dialog
 *   • CSV import (header row required; per-row create via Promise.allSettled
 *     so partial failures don't block the rest)
 *   • "Open detail" — navigates to the Books drill-down page
 *     (via useNav().navigate('books', { bookId }))
 *
 * Backed by `booksApi.update / create / delete` (one HTTP per row — no native
 * bulk endpoint on the backend). State updates are optimistic for the inline
 * edit case (re-render right after PUT resolves).
 */

type EditingField = { id: number; field: keyof BookUpdate };

const PER_PAGE = 50;

export const BooksSettingsTab: React.FC = () => {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const nav = useNav();
  const { list, loading, refetch } = useBooks();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<EditingField | null>(null);
  const [draft, setDraft] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset selection if list shrinks (book deleted elsewhere).
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<number>();
      const ids = new Set(list.map((b) => b.id));
      prev.forEach((id) => {
        if (ids.has(id)) next.add(id);
      });
      return next;
    });
  }, [list]);

  const visible = useMemo(
    () => list.filter((b) => !b.archived).slice(0, PER_PAGE),
    [list],
  );

  const allVisibleSelected =
    visible.length > 0 && visible.every((b) => selected.has(b.id));

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (visible.every((b) => prev.has(b.id))) {
        const next = new Set(prev);
        visible.forEach((b) => next.delete(b.id));
        return next;
      }
      const next = new Set(prev);
      visible.forEach((b) => next.add(b.id));
      return next;
    });
  }, [visible]);

  const toggleOne = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const beginEdit = (book: Book, field: keyof BookUpdate) => {
    setEditing({ id: book.id, field });
    setDraft(stringFromBook(book, field) ?? '');
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft('');
  };

  const commitEdit = async () => {
    if (!editing) return;
    const { id, field } = editing;
    const book = list.find((b) => b.id === id);
    if (!book) {
      cancelEdit();
      return;
    }
    const original = stringFromBook(book, field) ?? '';
    const trimmed = draft.trim();
    if (trimmed === original) {
      cancelEdit();
      return;
    }
    setSavingId(id);
    try {
      const payload: BookUpdate = { [field]: trimmed === '' ? null : trimmed };
      await booksApi.update(id, payload);
      toast.success(t('booksTab.saveSuccess'));
      await refetch();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t('booksTab.saveFailed'),
      );
    } finally {
      setSavingId(null);
      cancelEdit();
    }
  };

  const openDetail = (book: Book) => {
    nav.navigate('books', { bookId: book.id });
  };

  const triggerImport = () => fileInputRef.current?.click();

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-uploading the same file
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('booksTab.importFailed'));
      return;
    }
    let rows: BookCreate[];
    try {
      rows = parseCsv(text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('booksTab.importFailed'));
      return;
    }
    if (rows.length === 0) {
      toast.info(t('booksTab.importEmpty'));
      return;
    }
    setImporting(true);
    try {
      const result = await booksApi.bulkCreate(rows);
      if (result.failed.length === 0) {
        toast.success(
          t('booksTab.importPartial', {
            created: result.created.length,
            total: rows.length,
            failed: 0,
          }),
        );
      } else {
        toast.error(
          t('booksTab.importPartial', {
            created: result.created.length,
            total: rows.length,
            failed: result.failed.length,
          }),
        );
      }
      await refetch();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t('booksTab.importFailed'),
      );
    } finally {
      setImporting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selected);
      const result = await booksApi.bulkDelete(ids);
      if (result.failed.length === 0) {
        toast.success(t('booksTab.deleteSuccess', { count: result.deleted.length }));
      } else {
        toast.error(
          t('booksTab.deletePartial', {
            deleted: result.deleted.length,
            total: ids.length,
            failed: result.failed.length,
          }),
        );
      }
      setSelected(new Set());
      await refetch();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t('booksTab.saveFailed'),
      );
    } finally {
      setBulkDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="settings-books-tab">
      <Card title={t('booksTab.headerTitle')}>
        <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-500 flex-1">
            {t('booksTab.headerHint')}
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="hidden"
              data-testid="settings-books-csv-input"
            />
            <button
              type="button"
              onClick={triggerImport}
              disabled={importing}
              data-testid="settings-books-import-csv"
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-md
                text-xs font-medium text-zinc-700
                border border-zinc-200 bg-white
                hover:bg-zinc-50 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {importing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Upload size={12} />
              )}
              {importing ? t('booksTab.importing') : t('booksTab.importCsv')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={selected.size === 0 || bulkDeleting}
              data-testid="settings-books-bulk-delete"
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-md
                text-xs font-medium text-red-600
                border border-red-200 bg-white
                hover:bg-red-50 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              <Trash2 size={12} />
              {t('booksTab.bulkDelete')}
            </button>
          </div>
        </div>
        <p
          className="px-5 py-1.5 border-b border-zinc-100 text-[11px] text-zinc-400"
          data-testid="settings-books-import-hint"
        >
          {t('booksTab.importCsvHint')}
        </p>

        <div className="overflow-x-auto">
          <table
            className="w-full text-xs text-zinc-700"
            data-testid="settings-books-table"
          >
            <thead>
              <tr className="border-b border-zinc-100 text-[11px] text-zinc-400 uppercase tracking-wide">
                <th className="px-5 py-2.5 w-8">
                  <input
                    type="checkbox"
                    aria-label={t('booksTab.selectAll')}
                    data-testid="settings-books-select-all"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    disabled={visible.length === 0}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  {t('booksTab.fields.title')}
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  {t('booksTab.fields.author')}
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  {t('booksTab.fields.language')}
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  {t('booksTab.fields.series')}
                </th>
                <th className="px-3 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-t border-zinc-100">
                    <td colSpan={6} className="px-5 py-3">
                      <div className="h-4 bg-zinc-100 animate-pulse rounded" />
                    </td>
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState title={t('booksTab.noBooks')} />
                  </td>
                </tr>
              ) : (
                visible.map((book) => (
                  <BookRow
                    key={book.id}
                    book={book}
                    selected={selected.has(book.id)}
                    onToggle={() => toggleOne(book.id)}
                    onOpenDetail={() => openDetail(book)}
                    saving={savingId === book.id}
                    editing={editing && editing.id === book.id ? editing : null}
                    draft={draft}
                    onDraftChange={setDraft}
                    onBeginEdit={(field) => beginEdit(book, field)}
                    onCommit={commitEdit}
                    onCancel={cancelEdit}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {selected.size > 0 && (
          <div
            className="px-5 py-2 border-t border-zinc-100 text-[11px] text-zinc-500"
            data-testid="settings-books-selection-summary"
          >
            {t('booksTab.selected', { count: selected.size })}
          </div>
        )}
      </Card>

      {confirmDelete && (
        <ConfirmDialog
          count={selected.size}
          busy={bulkDeleting}
          onConfirm={handleBulkDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function stringFromBook(book: Book, field: keyof BookUpdate): string | null {
  const v = book[field as keyof Book];
  if (v == null) return null;
  if (typeof v === 'string') return v;
  return String(v);
}

interface RowProps {
  book: Book;
  selected: boolean;
  saving: boolean;
  editing: EditingField | null;
  draft: string;
  onToggle(): void;
  onOpenDetail(): void;
  onBeginEdit(field: keyof BookUpdate): void;
  onCommit(): void;
  onCancel(): void;
  onDraftChange(v: string): void;
}

const BookRow: React.FC<RowProps> = ({
  book,
  selected,
  saving,
  editing,
  draft,
  onToggle,
  onOpenDetail,
  onBeginEdit,
  onCommit,
  onCancel,
  onDraftChange,
}) => {
  const { t } = useTranslation('settings');
  return (
    <tr
      className="border-t border-zinc-100 hover:bg-zinc-50"
      data-testid={`settings-books-row-${book.id}`}
    >
      <td className="px-5 py-2 align-middle">
        <input
          type="checkbox"
          aria-label={`Select ${book.title}`}
          checked={selected}
          onChange={onToggle}
          data-testid={`settings-books-row-${book.id}-checkbox`}
        />
      </td>
      <EditableCell
        book={book}
        field="title"
        editing={editing}
        draft={draft}
        onBeginEdit={onBeginEdit}
        onCommit={onCommit}
        onCancel={onCancel}
        onDraftChange={onDraftChange}
        saving={saving}
      />
      <EditableCell
        book={book}
        field="author"
        editing={editing}
        draft={draft}
        onBeginEdit={onBeginEdit}
        onCommit={onCommit}
        onCancel={onCancel}
        onDraftChange={onDraftChange}
        saving={saving}
      />
      <EditableCell
        book={book}
        field="book_language"
        editing={editing}
        draft={draft}
        onBeginEdit={onBeginEdit}
        onCommit={onCommit}
        onCancel={onCancel}
        onDraftChange={onDraftChange}
        saving={saving}
      />
      <EditableCell
        book={book}
        field="series_name"
        editing={editing}
        draft={draft}
        onBeginEdit={onBeginEdit}
        onCommit={onCommit}
        onCancel={onCancel}
        onDraftChange={onDraftChange}
        saving={saving}
      />
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={onOpenDetail}
          aria-label={t('booksTab.openDetail')}
          title={t('booksTab.openDetail')}
          data-testid={`settings-books-row-${book.id}-open-detail`}
          className="
            inline-flex items-center justify-center h-7 w-7 rounded-md
            text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors
          "
        >
          <ArrowRight size={13} />
        </button>
      </td>
    </tr>
  );
};

interface CellProps {
  book: Book;
  field: keyof BookUpdate;
  editing: EditingField | null;
  draft: string;
  saving: boolean;
  onBeginEdit(field: keyof BookUpdate): void;
  onCommit(): void;
  onCancel(): void;
  onDraftChange(v: string): void;
}

const EditableCell: React.FC<CellProps> = ({
  book,
  field,
  editing,
  draft,
  saving,
  onBeginEdit,
  onCommit,
  onCancel,
  onDraftChange,
}) => {
  const isEditing = editing?.field === field;
  const display = stringFromBook(book, field) ?? '—';

  if (isEditing) {
    return (
      <td className="px-3 py-1.5">
        <input
          type="text"
          autoFocus
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
          data-testid={`settings-books-row-${book.id}-${field}-input`}
          className="
            w-full h-7 px-2 text-xs rounded
            border border-zinc-300 bg-white text-zinc-900
            focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
          "
        />
      </td>
    );
  }

  return (
    <td
      className="px-3 py-2 cursor-text"
      onClick={() => !saving && onBeginEdit(field)}
      data-testid={`settings-books-row-${book.id}-${field}-cell`}
    >
      <span className={display === '—' ? 'text-zinc-400' : ''}>
        {display}
      </span>
      {saving && (
        <Loader2
          size={11}
          className="inline-block ml-1.5 text-zinc-400 animate-spin"
        />
      )}
    </td>
  );
};

interface ConfirmProps {
  count: number;
  busy: boolean;
  onConfirm(): void;
  onCancel(): void;
}

const ConfirmDialog: React.FC<ConfirmProps> = ({
  count,
  busy,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation('settings');
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="settings-books-delete-confirm"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40"
    >
      <div className="bg-white rounded-xl shadow-xl border border-zinc-200 max-w-sm w-full mx-4 p-5">
        <h3 className="text-sm font-semibold text-zinc-900">
          {t('booksTab.deleteConfirmTitle', { count })}
        </h3>
        <p className="text-xs text-zinc-500 mt-2">{t('booksTab.deleteConfirmBody')}</p>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="
              inline-flex items-center h-8 px-3 rounded-md
              text-xs font-medium text-zinc-700
              border border-zinc-200 bg-white
              hover:bg-zinc-50 disabled:opacity-50
            "
          >
            {t('booksTab.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            data-testid="settings-books-delete-confirm-button"
            className="
              inline-flex items-center gap-1.5 h-8 px-3 rounded-md
              text-xs font-medium text-white
              bg-red-600 hover:bg-red-700 disabled:opacity-50
            "
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {t('booksTab.confirmDelete')}
          </button>
        </div>
      </div>
    </div>
  );
};
