import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Book } from '../../../api/books';

interface Props {
  books: Book[];
  loading: boolean;
  selectedId: number | null;
  onSelect(book: Book): void;
}

export const BookListPanel: React.FC<Props> = ({ books, loading, selectedId, onSelect }) => {
  const { t } = useTranslation('settings');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return books.filter((b) => {
      if (!showArchived && b.archived) return false;
      if (showArchived && !b.archived) return false;
      if (q && !b.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [books, search, showArchived]);

  return (
    <div className="flex flex-col h-full" data-testid="book-list-panel">
      <div className="p-3 border-b border-zinc-100 space-y-2">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('booksTab.search')}
            className="w-full h-7 pl-7 pr-2 text-xs rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
          />
        </div>
        <div className="flex gap-1">
          <TabBtn active={!showArchived} onClick={() => setShowArchived(false)}>
            {t('booksTab.active')}
          </TabBtn>
          <TabBtn active={showArchived} onClick={() => setShowArchived(true)}>
            {t('booksTab.archived')}
          </TabBtn>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-zinc-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-xs text-zinc-400 text-center">{t('booksTab.noBooks')}</div>
        ) : (
          filtered.map((book) => (
            <button
              key={book.id}
              type="button"
              onClick={() => onSelect(book)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2.5 border-b border-zinc-50 transition-colors ${
                selectedId === book.id
                  ? 'bg-zinc-900 text-white'
                  : 'hover:bg-zinc-50 text-zinc-900'
              }`}
            >
              {book.cover_image ? (
                <img
                  src={book.cover_image}
                  alt=""
                  className="w-6 h-8 object-cover rounded-sm flex-shrink-0"
                />
              ) : (
                <div className="w-6 h-8 bg-zinc-200 rounded-sm flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{book.title}</div>
                {book.account && (
                  <div className={`text-[10px] truncate ${selectedId === book.id ? 'text-zinc-300' : 'text-zinc-400'}`}>
                    {book.account}
                  </div>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

const TabBtn: React.FC<{
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-2 h-6 text-[11px] font-medium rounded transition-colors ${
      active ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-900 border border-zinc-200'
    }`}
  >
    {children}
  </button>
);
