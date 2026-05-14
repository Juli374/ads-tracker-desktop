// Phase L Lane A — Listing Studio.
//
// AI-assisted rewrite of a book's title, subtitle, description, bullets and
// A+ angles. Pro-tier; whole page is wrapped in `<LockedFeature>` so a `start`
// user sees the upsell CTA instead of the editor.
//
// Flow:
//   1. ASIN picker (sourced from the global BooksContext)
//   2. Task tabs (Title / Subtitle / Description / Bullets / A+)
//   3. Side-by-side current vs proposed with a Regenerate button + guidance
//   4. Variant history stored in localStorage per (asin, task)
//   5. Apply → PUT /api/books/:id with the relevant field
//      (only for title / subtitle / description — bullets and A+ live on
//      Amazon, not in our DB, so those tasks omit the Apply button)
//
// We deliberately keep the data flow simple: one selected book, one selected
// task. Switching either resets the proposed pane but preserves history.

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, PageHeader, ErrorBanner } from '../components/ui';
import { Button } from '../components/ui/Button';
import { LockedFeature } from '../components/LockedFeature';
import { useEntitlement } from '../hooks/useEntitlement';
import { useBooks } from '../contexts/BooksContext';
import { useToast } from '../contexts/ToastContext';
import { booksApi, type Book, type BookUpdate } from '../api/books';
import { aiApi } from '../api/ai';
import { ApiError } from '../api/client';
import { ListingTaskTabs, type ListingTask } from '../components/listing/ListingTaskTabs';
import { ListingSideBySide } from '../components/listing/ListingSideBySide';
import {
  ListingVariantHistory,
  loadVariants,
  appendVariant,
  clearVariants,
  type VariantEntry,
} from '../components/listing/ListingVariantHistory';

/** Whether a task can be applied to a book via PUT /api/books/:id. */
function isApplicableTask(task: ListingTask): task is 'title' | 'subtitle' | 'description' {
  return task === 'title' || task === 'subtitle' || task === 'description';
}

function currentTextFor(book: Book | undefined, task: ListingTask): string {
  if (!book) return '';
  switch (task) {
    case 'title':
      return book.title || '';
    case 'subtitle':
      return book.subtitle || '';
    case 'description':
      // Books API doesn't currently surface long-form description; we just leave
      // it blank until the backend extends the row. Author can still paste
      // their existing description into the guidance field if they want diff'ing.
      return '';
    case 'bullets':
    case 'aPlus':
      return '';
  }
}

function asinOf(book: Book): string | undefined {
  // A book may have multiple ASINs (one per marketplace). For the AI prompt we
  // just want a representative one — the first active ASIN wins.
  const active = book.asins?.find((a) => a.is_active);
  return (active ?? book.asins?.[0])?.asin;
}

export const ListingStudioPage: React.FC = () => {
  const { on: featureOn } = useEntitlement('ai.title_generator');
  if (!featureOn) {
    return (
      <div data-testid="listing-studio-page-locked" className="space-y-4">
        <PageHeader
          title="Listing Studio"
          subtitle="Rewrite your book's listing copy with AI assistance."
        />
        <Card>
          <div className="p-8 text-center space-y-3">
            <Sparkles className="mx-auto text-violet-500" size={28} />
            <h3 className="text-lg font-semibold text-zinc-900">
              Listing Studio is a Pro feature
            </h3>
            <p className="text-sm text-zinc-500 max-w-md mx-auto">
              Generate optimized titles, subtitles, descriptions, bullets, and A+ angles
              for your KDP books in one click.
            </p>
            <LockedFeature feature="ai.title_generator" mode="dim">
              <Button
                variant="primary"
                size="md"
                data-testid="listing-studio-upgrade-cta"
              >
                Upgrade to Pro
              </Button>
            </LockedFeature>
          </div>
        </Card>
      </div>
    );
  }
  return <ListingStudioInner />;
};

const ListingStudioInner: React.FC = () => {
  const { t: _t } = useTranslation('books');
  const toast = useToast();
  const { list: books, loading: booksLoading, error: booksError } = useBooks();
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [task, setTask] = useState<ListingTask>('title');
  const [guidance, setGuidance] = useState('');
  const [proposed, setProposed] = useState('');
  const [rationale, setRationale] = useState<string | undefined>(undefined);
  const [model, setModel] = useState<string | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [variants, setVariants] = useState<VariantEntry[]>([]);

  // Auto-select first book once books load.
  useEffect(() => {
    if (selectedBookId == null && books.length > 0) {
      setSelectedBookId(books[0].id);
    }
  }, [books, selectedBookId]);

  const selectedBook = useMemo(
    () => books.find((b) => b.id === selectedBookId),
    [books, selectedBookId],
  );
  const asin = selectedBook ? asinOf(selectedBook) ?? `book-${selectedBook.id}` : '';
  const currentText = currentTextFor(selectedBook, task);

  // Load variants when (asin, task) changes; reset proposed pane.
  useEffect(() => {
    if (!asin) {
      setVariants([]);
      return;
    }
    setVariants(loadVariants(asin, task));
    setProposed('');
    setRationale(undefined);
    setModel(undefined);
    setGenerateError(null);
  }, [asin, task]);

  const onRegenerate = async () => {
    if (!selectedBook) {
      toast.error('Pick a book first');
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    setProposed('');
    setRationale(undefined);
    try {
      const result = await aiApi.generate({
        task,
        asin,
        currentText: currentText || undefined,
        guidance: guidance.trim() || undefined,
        // Phase M.2 — let main merge per-series brand-voice override on top
        // of the base profile. Books without a series fall through to base.
        seriesName: selectedBook.series_name ?? undefined,
      });
      setProposed(result.text);
      setRationale(result.rationale);
      setModel(result.model);
      // Persist to localStorage.
      const entry: VariantEntry = {
        text: result.text,
        rationale: result.rationale,
        model: result.model,
        createdAt: new Date().toISOString(),
      };
      const nextVariants = appendVariant(asin, task, entry);
      setVariants(nextVariants);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setGenerateError(message);
    } finally {
      setGenerating(false);
    }
  };

  const onApply = async () => {
    if (!selectedBook || !proposed || !isApplicableTask(task)) return;
    setApplying(true);
    try {
      const patch: BookUpdate = {};
      if (task === 'title') patch.title = proposed;
      else if (task === 'subtitle') patch.subtitle = proposed;
      // `description` field not on BookUpdate yet (backend extension needed).
      // For now we surface a friendly hint and only PUT title/subtitle.
      if (task === 'description') {
        toast.error(
          'Saving description requires a backend update — copy the text and paste it into Amazon for now.',
        );
        return;
      }
      await booksApi.update(selectedBook.id, patch);
      toast.success(`Applied new ${task} to "${selectedBook.title}"`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      toast.error(`Failed to apply: ${message}`);
    } finally {
      setApplying(false);
    }
  };

  const onRestoreVariant = (entry: VariantEntry) => {
    setProposed(entry.text);
    setRationale(entry.rationale);
    setModel(entry.model);
    setGenerateError(null);
  };

  const onClearHistory = () => {
    if (!asin) return;
    clearVariants(asin, task);
    setVariants([]);
  };

  return (
    <div data-testid="listing-studio-page" className="space-y-4">
      <PageHeader
        title="Listing Studio"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={12} className="text-violet-500" />
            AI-assisted rewrite for your KDP listings
          </span>
        }
      />

      {booksError && (
        <ErrorBanner message={`Failed to load books: ${booksError}`} />
      )}

      <Card data-testid="listing-studio-controls">
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium text-zinc-600">Book:</label>
            <select
              data-testid="listing-studio-asin-picker"
              disabled={booksLoading || books.length === 0}
              value={selectedBookId ?? ''}
              onChange={(e) => setSelectedBookId(Number(e.target.value) || null)}
              className="
                h-8 px-2.5 text-sm rounded-md border border-zinc-300 bg-white
                focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100
                disabled:opacity-50
              "
            >
              {books.length === 0 && <option>No books available</option>}
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} {asinOf(b) ? `(${asinOf(b)})` : ''}
                </option>
              ))}
            </select>

            <ListingTaskTabs active={task} onChange={setTask} />
          </div>

          <div className="flex items-center gap-2">
            <input
              data-testid="listing-studio-guidance"
              type="text"
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              placeholder='Optional guidance e.g. "focus on thriller readers, avoid clichés"'
              className="
                flex-1 h-8 px-2.5 text-sm rounded-md border border-zinc-300 bg-white
                placeholder:text-zinc-400 focus:outline-none focus:border-violet-500
                focus:ring-2 focus:ring-violet-100
              "
            />
            <Button
              variant="primary"
              size="sm"
              onClick={onRegenerate}
              disabled={generating || !selectedBook}
              data-testid="listing-studio-regenerate"
              leftIcon={generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            >
              {generating ? 'Generating…' : 'Regenerate'}
            </Button>
          </div>

          {generateError && (
            <div
              data-testid="listing-studio-error"
              className="flex items-start gap-2 px-3 py-2 rounded-md border border-amber-300 bg-amber-50 text-xs text-amber-900"
            >
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{generateError}</span>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-4">
        <Card data-testid="listing-studio-output">
          <div className="p-4 space-y-3">
            <ListingSideBySide
              current={currentText}
              proposed={proposed}
              modelLabel={model}
              rationale={rationale}
              loading={generating}
            />
            <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
              <p className="text-[11px] text-zinc-400 inline-flex items-center gap-1">
                <AlertTriangle size={10} />
                Amazon TOS requires authors to disclose AI-assisted content.
              </p>
              {isApplicableTask(task) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onApply}
                  disabled={applying || !proposed.trim() || !selectedBook}
                  data-testid="listing-studio-apply"
                  leftIcon={applying ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                >
                  {applying ? 'Applying…' : 'Apply to book'}
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <ListingVariantHistory
              variants={variants}
              onRestore={onRestoreVariant}
              onClear={onClearHistory}
            />
          </div>
        </Card>
      </div>
    </div>
  );
};
