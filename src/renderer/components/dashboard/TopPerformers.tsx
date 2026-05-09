import React, { useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type {
  TopPerformersData,
  BookPerformerItem,
  CampaignPerformerItem,
} from '../../api/metrics';
import { fmtMoney, fmtPct, fmtNumber } from '../../lib/format';
import { LoadingRow, EmptyState } from '../ui';
import { useNav } from '../../contexts/NavContext';
import { useGlobalFilters } from '../../contexts/GlobalFiltersContext';

interface Props {
  data: TopPerformersData | null;
  loading?: boolean;
}

type Tab = 'books' | 'campaigns';

export const TopPerformers: React.FC<Props> = ({ data, loading }) => {
  const [tab, setTab] = useState<Tab>('books');
  const { navigate } = useNav();
  const { setBookId } = useGlobalFilters();

  const winners = tab === 'books' ? data?.books.winners ?? [] : data?.campaigns.winners ?? [];
  const losers = tab === 'books' ? data?.books.losers ?? [] : data?.campaigns.losers ?? [];

  const onBookClick = (b: BookPerformerItem) => {
    setBookId(b.id);
    navigate('books');
  };

  const onCampaignClick = () => {
    // Полноценная навигация в Campaign Details — Фаза 3.
    navigate('campaigns');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="inline-flex items-center bg-zinc-100 rounded-md p-0.5">
          {(['books', 'campaigns'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-label={
                t === 'books' ? 'Лидеры по книгам' : 'Лидеры по кампаниям'
              }
              className={`
                px-3 h-7 text-xs font-medium rounded
                transition-colors
                ${tab === t
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'}
              `}
            >
              {t === 'books' ? 'Книги' : 'Кампании'}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <LoadingRow />
      ) : !data || (winners.length === 0 && losers.length === 0) ? (
        <EmptyState title="Недостаточно данных за период" />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Column
            title="Лидеры"
            icon={<TrendingUp size={13} className="text-emerald-600" />}
            tone="positive"
          >
            {tab === 'books'
              ? (winners as BookPerformerItem[]).map((b) => (
                  <BookRow key={b.id} item={b} onClick={() => onBookClick(b)} />
                ))
              : (winners as CampaignPerformerItem[]).map((c) => (
                  <CampaignRow key={c.id} item={c} onClick={onCampaignClick} />
                ))}
          </Column>

          <Column
            title="Аутсайдеры"
            icon={<TrendingDown size={13} className="text-red-600" />}
            tone="negative"
          >
            {tab === 'books'
              ? (losers as BookPerformerItem[]).map((b) => (
                  <BookRow key={b.id} item={b} onClick={() => onBookClick(b)} />
                ))
              : (losers as CampaignPerformerItem[]).map((c) => (
                  <CampaignRow key={c.id} item={c} onClick={onCampaignClick} />
                ))}
          </Column>
        </div>
      )}
    </div>
  );
};

const Column: React.FC<{
  title: string;
  icon: React.ReactNode;
  tone: 'positive' | 'negative';
  children?: React.ReactNode;
}> = ({ title, icon, children }) => (
  <div>
    <div className="flex items-center gap-1.5 mb-2 text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
      {icon}
      {title}
    </div>
    <ul className="space-y-1">{children}</ul>
  </div>
);

const ProfitBadge: React.FC<{ value: number }> = ({ value }) => {
  const positive = value >= 0;
  return (
    <span
      className={`text-xs font-semibold tabular-nums ${
        positive ? 'text-emerald-600' : 'text-red-600'
      }`}
    >
      {positive ? '+' : ''}
      {fmtMoney(value)}
    </span>
  );
};

const BookRow: React.FC<{ item: BookPerformerItem; onClick: () => void }> = ({
  item,
  onClick,
}) => (
  <li>
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-zinc-50 transition-colors text-left group"
    >
      {item.cover_image ? (
        <img
          src={item.cover_image}
          alt=""
          className="w-7 h-9 object-cover rounded-sm border border-zinc-200 flex-shrink-0"
        />
      ) : (
        <div className="w-7 h-9 rounded-sm bg-zinc-100 border border-zinc-200 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-zinc-900 truncate group-hover:text-zinc-950">
          {item.title}
        </div>
        <div className="text-[10px] text-zinc-500 tabular-nums mt-0.5 flex gap-2">
          <span>{fmtMoney(item.spend)} spend</span>
          <span>·</span>
          <span>{fmtNumber(item.orders)} orders</span>
          <span>·</span>
          <span>{item.acos > 0 ? fmtPct(item.acos) : '—'} ACOS</span>
        </div>
      </div>
      <ProfitBadge value={item.profit} />
    </button>
  </li>
);

const CampaignRow: React.FC<{ item: CampaignPerformerItem; onClick: () => void }> = ({
  item,
  onClick,
}) => (
  <li>
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-zinc-50 transition-colors text-left group"
    >
      <div className="w-7 h-7 rounded-md bg-zinc-100 border border-zinc-200 flex items-center justify-center flex-shrink-0 text-[10px] font-semibold text-zinc-600 uppercase">
        {item.campaign_type?.slice(0, 2) ?? '—'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-zinc-900 truncate group-hover:text-zinc-950">
          {item.name}
        </div>
        <div className="text-[10px] text-zinc-500 tabular-nums mt-0.5 flex gap-2">
          <span className="truncate max-w-[120px]">{item.book_title}</span>
          <span>·</span>
          <span>{item.marketplace}</span>
          <span>·</span>
          <span>{item.acos > 0 ? fmtPct(item.acos) : '—'} ACOS</span>
        </div>
      </div>
      <ProfitBadge value={item.profit} />
    </button>
  </li>
);
