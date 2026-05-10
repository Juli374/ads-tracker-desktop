import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp } from 'lucide-react';
import { booksApi, BsrPoint } from '../../api/books';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { BsrModal } from './BsrModal';

interface Props {
  bookId: number;
  bookTitle: string;
  marketplace: string;
  latestBsr?: number | null;
}

export const BsrSparklineCell: React.FC<Props> = ({
  bookId,
  bookTitle,
  marketplace,
  latestBsr,
}) => {
  const { t } = useTranslation('books');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<BsrPoint[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setOpen(true);
    if (points) return; // already fetched
    setLoading(true);
    try {
      const res = await booksApi.bsrHistory(bookId, { marketplace });
      setPoints(res.points);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('bsr.loadFailed'));
      setPoints([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        data-testid={`bsr-cell-${bookId}-${marketplace}`}
        className="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-900 transition-colors"
        title={t('bsr.title')}
      >
        <TrendingUp size={11} className="text-zinc-400" />
        {latestBsr != null ? (
          <span className="font-mono tabular-nums">#{latestBsr.toLocaleString()}</span>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </button>
      {open && (
        <BsrModal
          bookTitle={bookTitle}
          marketplace={marketplace}
          points={points}
          loading={loading}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};
