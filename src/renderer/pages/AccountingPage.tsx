import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('accounting');
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
        const [a, txs] = await Promise.all([
          accountingApi.listAccounts(),
          accountingApi.listTransactions({ limit: 100 }),
        ]);
        if (cancelled) return;
        setAccounts(Array.isArray(a) ? a : []);
        setTx(normalizeTransactions(txs));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          setUnsupported(true);
          setAccounts([]);
          setTx([]);
          return;
        }
        toast.error(err instanceof ApiError ? err.message : t('errors.load'));
        setAccounts([]);
        setTx([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="space-y-6" data-testid="accounting-page">
      <PageHeader
        title={t('title')}
        subtitle={unsupported ? t('subtitle.unsupported') : t('subtitle.default')}
      />

      {unsupported && <ErrorBanner message={t('errors.unsupportedBanner')} />}

      {!unsupported && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Kpi
              label={t('kpi.accounts')}
              value={fmtNumber(totals.accountsCount)}
              loading={loading && !accounts}
            />
            <Kpi
              label={t('kpi.totalBalance')}
              value={fmtMoney(totals.totalBalance)}
              loading={loading && !accounts}
              tone={totals.totalBalance < 0 ? 'negative' : 'default'}
            />
            <Kpi
              label={t('kpi.transactions')}
              value={fmtNumber(totals.txCount)}
              loading={loading && !tx}
            />
          </div>

          <Card title={t('accounts.cardTitle')}>
            {loading && !accounts ? (
              <LoadingRow />
            ) : !accounts || accounts.length === 0 ? (
              <EmptyState title={t('accounts.empty')} />
            ) : (
              <table className="w-full text-sm table-sticky-head">
                <thead>
                  <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-2 font-medium">{t('accounts.th.name')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('accounts.th.type')}</th>
                    <th className="text-right px-3 py-2 font-medium">{t('accounts.th.balance')}</th>
                    <th className="text-right px-5 py-2 font-medium">{t('accounts.th.currency')}</th>
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

          <Card title={t('transactions.cardTitle')}>
            {loading && !tx ? (
              <LoadingRow />
            ) : !tx || tx.length === 0 ? (
              <EmptyState title={t('transactions.empty')} />
            ) : (
              <table className="w-full text-sm table-sticky-head">
                <thead>
                  <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-2 font-medium">{t('transactions.th.date')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('transactions.th.account')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('transactions.th.category')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('transactions.th.description')}</th>
                    <th className="text-right px-5 py-2 font-medium">{t('transactions.th.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tx.map((tr) => (
                    <tr key={tr.id} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                      <td className="px-5 py-2.5 text-[11px] text-zinc-500 tabular-nums">
                        {(tr.date ?? '').slice(0, 10)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-700">
                        {tr.account_name ?? `#${tr.account_id}`}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-zinc-600">
                        {tr.category_name ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-700 truncate max-w-md">
                        {tr.description ?? '—'}
                      </td>
                      <td className="px-5 py-2.5 text-xs text-right tabular-nums">
                        <span
                          className={
                            tr.type === 'expense'
                              ? 'text-red-600'
                              : tr.type === 'income'
                              ? 'text-emerald-600'
                              : 'text-zinc-700'
                          }
                        >
                          {tr.type === 'expense' ? '−' : tr.type === 'income' ? '+' : ''}
                          {fmtMoney(Math.abs(tr.amount), tr.currency)}
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
