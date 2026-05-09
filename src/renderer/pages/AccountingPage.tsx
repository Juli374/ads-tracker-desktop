import React, { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import {
  accountingApi,
  normalizeTransactions,
  type Account,
  type Transaction,
} from '../api/accounting';
import {
  Card,
  EmptyState,
  ErrorBanner,
  Kpi,
  LoadingRow,
  PageHeader,
} from '../components/ui';
import { fmtMoney, fmtNumber } from '../lib/format';
import { useToast } from '../contexts/ToastContext';

export const AccountingPage: React.FC = () => {
  const toast = useToast();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [tx, setTx] = useState<Transaction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setUnsupported(false);
      try {
        const [a, t] = await Promise.all([
          accountingApi.listAccounts(),
          accountingApi.listTransactions({ limit: 100 }),
        ]);
        if (cancelled) return;
        setAccounts(Array.isArray(a) ? a : []);
        setTx(normalizeTransactions(t));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          setUnsupported(true);
          setAccounts([]);
          setTx([]);
          return;
        }
        toast.error(err instanceof ApiError ? err.message : 'Не удалось загрузить бухгалтерию');
        setAccounts([]);
        setTx([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const totals = useMemo(() => {
    const totalBalance = (accounts ?? []).reduce(
      (acc, a) => acc + (a.current_balance ?? 0),
      0,
    );
    return {
      accountsCount: accounts?.length ?? 0,
      totalBalance,
      txCount: tx?.length ?? 0,
    };
  }, [accounts, tx]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Бухгалтерия"
        subtitle={unsupported ? 'Endpoint недоступен' : 'Read-only просмотр счетов и транзакций'}
      />

      {unsupported && (
        <ErrorBanner message="Endpoint /api/accounting/* вернул 401/403/404." />
      )}

      {!unsupported && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Kpi
              label="Счетов"
              value={fmtNumber(totals.accountsCount)}
              loading={loading && !accounts}
            />
            <Kpi
              label="Баланс (сумма)"
              value={fmtMoney(totals.totalBalance)}
              loading={loading && !accounts}
              tone={totals.totalBalance < 0 ? 'negative' : 'default'}
            />
            <Kpi
              label="Транзакций (последних)"
              value={fmtNumber(totals.txCount)}
              loading={loading && !tx}
            />
          </div>

          <Card title="Счета">
            {loading && !accounts ? (
              <LoadingRow />
            ) : !accounts || accounts.length === 0 ? (
              <EmptyState title="Нет счетов" />
            ) : (
              <table className="w-full text-sm table-sticky-head">
                <thead>
                  <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-2 font-medium">Имя</th>
                    <th className="text-left px-3 py-2 font-medium">Тип</th>
                    <th className="text-right px-3 py-2 font-medium">Баланс</th>
                    <th className="text-right px-5 py-2 font-medium">Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                      <td className="px-5 py-2.5 text-xs text-zinc-900 font-medium">{a.name}</td>
                      <td className="px-3 py-2.5 text-[11px] text-zinc-600">{a.type ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-right tabular-nums">
                        <span
                          className={
                            (a.current_balance ?? 0) < 0 ? 'text-red-600' : 'text-zinc-900'
                          }
                        >
                          {fmtMoney(a.current_balance, a.currency)}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-[11px] text-zinc-500 text-right uppercase">
                        {a.currency ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Последние транзакции">
            {loading && !tx ? (
              <LoadingRow />
            ) : !tx || tx.length === 0 ? (
              <EmptyState title="Нет транзакций" />
            ) : (
              <table className="w-full text-sm table-sticky-head">
                <thead>
                  <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-2 font-medium">Дата</th>
                    <th className="text-left px-3 py-2 font-medium">Счёт</th>
                    <th className="text-left px-3 py-2 font-medium">Категория</th>
                    <th className="text-left px-3 py-2 font-medium">Описание</th>
                    <th className="text-right px-5 py-2 font-medium">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {tx.map((t) => (
                    <tr key={t.id} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                      <td className="px-5 py-2.5 text-[11px] text-zinc-500 tabular-nums">
                        {(t.date ?? '').slice(0, 10)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-700">
                        {t.account_name ?? `#${t.account_id}`}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-zinc-600">
                        {t.category_name ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-700 truncate max-w-md">
                        {t.description ?? '—'}
                      </td>
                      <td className="px-5 py-2.5 text-xs text-right tabular-nums">
                        <span
                          className={
                            t.type === 'expense'
                              ? 'text-red-600'
                              : t.type === 'income'
                              ? 'text-emerald-600'
                              : 'text-zinc-700'
                          }
                        >
                          {t.type === 'expense' ? '−' : t.type === 'income' ? '+' : ''}
                          {fmtMoney(Math.abs(t.amount), t.currency)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
