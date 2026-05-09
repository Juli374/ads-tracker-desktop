import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, X, ChevronRight, ChevronDown, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  negativeListsApi,
  type NegativeList,
  type NegativeListItem,
  type NegativeListWithItems,
} from '../api/negativeLists';
import { Card, EmptyState, LoadingRow } from './ui';
import { useToast } from '../contexts/ToastContext';
import { useBooks } from '../contexts/BooksContext';

export const NegativeListsTab: React.FC = () => {
  const { t } = useTranslation('negatives');
  const toast = useToast();
  const { list: books } = useBooks();
  const [lists, setLists] = useState<NegativeList[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setUnsupported(false);
      try {
        const data = await negativeListsApi.list({ includeGlobal: true });
        setLists(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          setUnsupported(true);
          setLists([]);
          return;
        }
        toast.error(err instanceof ApiError ? err.message : t('lists.loadFailed'));
        setLists([]);
      } finally {
        setLoading(false);
      }
    },
    [toast, t],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (unsupported) {
    return (
      <Card title={t('lists.cardTitle')}>
        <div className="px-5 py-8 text-center text-sm text-zinc-500">
          {t('lists.unsupported')}
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={t('lists.cardTitle')}
      rightSlot={
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 transition-colors"
        >
          <Plus size={12} />
          {t('lists.create')}
        </button>
      }
    >
      {loading && !lists ? (
        <LoadingRow />
      ) : !lists || lists.length === 0 ? (
        <EmptyState
          title={t('lists.empty')}
          hint={t('lists.emptyHint')}
        />
      ) : (
        <ul className="divide-y divide-zinc-100">
          {lists.map((l) => (
            <ListRow
              key={l.id}
              list={l}
              expanded={expandedId === l.id}
              onToggle={() => setExpandedId(expandedId === l.id ? null : l.id)}
              onDeleted={() => {
                setLists((prev) => prev?.filter((x) => x.id !== l.id) ?? prev);
                if (expandedId === l.id) setExpandedId(null);
              }}
              onItemsChanged={() => load()}
            />
          ))}
        </ul>
      )}

      {creating && (
        <CreateListModal
          books={books.map((b) => ({ id: b.id, title: b.title }))}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </Card>
  );
};

const ListRow: React.FC<{
  list: NegativeList;
  expanded: boolean;
  onToggle(): void;
  onDeleted(): void;
  onItemsChanged(): void;
}> = ({ list, expanded, onToggle, onDeleted, onItemsChanged }) => {
  const { t } = useTranslation('negatives');
  const toast = useToast();
  const [items, setItems] = useState<NegativeListItem[] | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newKw, setNewKw] = useState('');
  const [newMatch, setNewMatch] = useState<'exact' | 'phrase'>('exact');

  useEffect(() => {
    if (!expanded || items != null) return;
    setItemsLoading(true);
    negativeListsApi
      .get(list.id)
      .then((res: NegativeListWithItems) => {
        setItems(Array.isArray(res.items) ? res.items : []);
      })
      .catch((err) => {
        toast.error(err instanceof ApiError ? err.message : t('lists.loadItemsFailed'));
        setItems([]);
      })
      .finally(() => setItemsLoading(false));
  }, [expanded, items, list.id, toast, t]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const list_kw = Array.from(
      new Set(
        newKw
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    );
    if (list_kw.length === 0) return;
    setAdding(true);
    try {
      await negativeListsApi.addItems(
        list.id,
        list_kw.map((keyword) => ({ keyword, matchType: newMatch })),
      );
      toast.success(t('lists.addedCount', { count: list_kw.length }));
      setNewKw('');
      setItems(null);
      onItemsChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('lists.addFailed'));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (item: NegativeListItem) => {
    try {
      await negativeListsApi.removeItem(item.id);
      setItems((prev) => prev?.filter((x) => x.id !== item.id) ?? prev);
      onItemsChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('lists.removeFailed'));
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('lists.deleteConfirm', { name: list.name }))) return;
    try {
      await negativeListsApi.delete(list.id);
      toast.success(t('lists.deleted'));
      onDeleted();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('lists.deleteFailed'));
    }
  };

  const isGlobal = list.isGlobal || list.bookId == null;

  return (
    <li>
      <div
        className="flex items-center gap-2 px-5 py-2.5 hover:bg-zinc-50/60 cursor-pointer"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown size={13} className="text-zinc-400 flex-shrink-0" />
        ) : (
          <ChevronRight size={13} className="text-zinc-400 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-900 truncate">{list.name}</span>
            {isGlobal && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                <Globe size={10} />
                {t('lists.global')}
              </span>
            )}
            {list.isDefault && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600">
                {t('lists.default')}
              </span>
            )}
          </div>
          {list.description && (
            <div className="text-[11px] text-zinc-500 truncate mt-0.5">{list.description}</div>
          )}
        </div>
        <div className="text-xs text-zinc-500 tabular-nums">
          {t('lists.itemsCount', { count: list.itemCount })}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          className="
            h-6 w-6 flex items-center justify-center rounded
            text-zinc-400 hover:text-red-600 hover:bg-red-50
            transition-colors
          "
          aria-label={t('lists.deleteAria', { name: list.name })}
          title={t('lists.deleteTitle')}
        >
          <X size={12} />
        </button>
      </div>

      {expanded && (
        <div className="bg-zinc-50/40 border-y border-zinc-100 px-5 py-3 space-y-3">
          <form onSubmit={handleAdd} className="space-y-2">
            <textarea
              value={newKw}
              onChange={(e) => setNewKw(e.target.value)}
              placeholder={t('lists.addPlaceholder')}
              rows={2}
              className="
                w-full px-3 py-2 text-xs rounded-md
                border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400
                focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
                font-mono resize-y min-h-[60px]
              "
              disabled={adding}
            />
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex bg-white border border-zinc-200 rounded-md p-0.5">
                {(['exact', 'phrase'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setNewMatch(m)}
                    disabled={adding}
                    className={`
                      px-2.5 h-6 text-[11px] font-medium rounded transition-colors
                      ${newMatch === m
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-600 hover:text-zinc-900'}
                    `}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={adding || !newKw.trim()}
                className="
                  inline-flex items-center gap-1 h-7 px-2.5 rounded-md
                  bg-zinc-900 text-white text-[11px] font-medium
                  hover:bg-zinc-800 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {adding ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                {t('lists.addSubmit')}
              </button>
            </div>
          </form>

          {itemsLoading ? (
            <LoadingRow />
          ) : !items || items.length === 0 ? (
            <div className="text-xs text-zinc-400 py-2 text-center">{t('lists.itemsEmpty')}</div>
          ) : (
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="group flex items-center gap-2 py-1 px-2 rounded hover:bg-white"
                >
                  <span className="text-xs font-mono text-zinc-900 flex-1 truncate">
                    {item.keyword}
                  </span>
                  <span className="text-[10px] text-zinc-500 uppercase">
                    {item.matchType}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(item)}
                    className="
                      h-5 w-5 flex items-center justify-center rounded
                      text-zinc-400 hover:text-red-600 hover:bg-red-50
                      opacity-0 group-hover:opacity-100 transition-opacity
                    "
                    aria-label={t('lists.removeItemAria', { keyword: item.keyword })}
                  >
                    <X size={10} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
};

const CreateListModal: React.FC<{
  books: Array<{ id: number; title: string }>;
  onClose(): void;
  onCreated(): void;
}> = ({ books, onClose, onCreated }) => {
  const { t } = useTranslation('negatives');
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [bookId, setBookId] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.body.dataset.modalOpen = 'true';
    return () => {
      delete document.body.dataset.modalOpen;
    };
  }, []);

  useEffect(() => {
    const onWinKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onWinKey);
    return () => window.removeEventListener('keydown', onWinKey);
  }, [submitting, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t('create.errors.nameRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await negativeListsApi.create({
        name: trimmed,
        description: description.trim() || undefined,
        bookId: bookId === '' ? null : bookId,
      });
      toast.success(t('create.created'));
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('create.errors.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-zinc-900/20 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden"
      >
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-900 tracking-tight">
            {t('create.title')}
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
            aria-label={t('create.closeAria')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">{t('create.fields.name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder={t('create.fields.namePlaceholder')}
              className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              {t('create.fields.description')}{' '}
              <span className="text-zinc-400 font-normal">{t('create.fields.descriptionOptional')}</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('create.fields.descriptionPlaceholder')}
              className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              {t('create.fields.scope')}
            </label>
            <select
              value={bookId}
              onChange={(e) => setBookId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full h-9 px-2 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
            >
              <option value="">{t('create.fields.scopeGlobal')}</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {t('create.fields.scopeBook', { title: b.title })}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 px-3 text-xs font-medium rounded-md text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            {t('create.actions.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-8 px-4 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {t('create.actions.submit')}
          </button>
        </div>
      </form>
    </div>
  );
};
