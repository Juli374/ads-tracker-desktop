import React, { useState } from 'react';
import { useBooks } from '../../../contexts/BooksContext';
import { booksApi, Book } from '../../../api/books';
import { BookListPanel } from './BookListPanel';
import { BookDetailsPanel } from './BookDetailsPanel';
import { useApiQuery } from '../../../lib/useApiQuery';

export const BooksSettingsTab: React.FC = () => {
  const { list, loading: booksLoading, refetch } = useBooks();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selectedBookQuery = useApiQuery(
    () => (selectedId != null ? booksApi.get(selectedId) : Promise.resolve(null as unknown as Book)),
    [selectedId],
    { enabled: selectedId != null },
  );

  const handleSelect = (book: Book) => {
    setSelectedId(book.id);
  };

  const handleRefresh = () => {
    refetch();
    if (selectedId != null) {
      selectedBookQuery.refetch();
    }
  };

  const selectedBook = selectedBookQuery.data ?? (selectedId != null ? list.find((b) => b.id === selectedId) ?? null : null);

  return (
    <div
      className="flex border border-zinc-200 rounded-xl overflow-hidden bg-white"
      style={{ minHeight: 480 }}
      data-testid="settings-books-tab"
    >
      <div className="w-64 flex-shrink-0 border-r border-zinc-200">
        <BookListPanel
          books={list}
          loading={booksLoading}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </div>
      <div className="flex-1 min-w-0">
        <BookDetailsPanel
          book={selectedBook}
          onRefresh={handleRefresh}
        />
      </div>
    </div>
  );
};
