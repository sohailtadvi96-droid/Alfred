import { shortDate, signedMoney } from '@/lib/format';
import type { Direction } from './categories';
import { RecategoriseMenu } from './RecategoriseMenu';
import { useAccounts, useCategories, useDeleteTransaction, useTransactions } from './hooks';
import type { TxnFilter } from './api';

export function TransactionList({
  filter,
  onFilterChange,
}: {
  filter: TxnFilter;
  onFilterChange: (f: TxnFilter) => void;
}) {
  const { data: txns, isLoading, error } = useTransactions(filter);
  const { data: accounts } = useAccounts();
  const cats = useCategories();
  const del = useDeleteTransaction();

  const uniqueCats = Array.from(new Map(cats.all.map((c) => [c.slug, c])).values());

  const accountName = (id: string | null) => {
    if (!id) return '—';
    const a = accounts?.find((x) => x.id === id);
    return a ? `${a.name}${a.last4 ? ` ··${a.last4}` : ''}` : '—';
  };

  return (
    <div className="txn-panel">
      <div className="txn-filters">
        <select
          className="input sm-select"
          value={filter.direction ?? ''}
          onChange={(e) =>
            onFilterChange({ ...filter, direction: (e.target.value || undefined) as Direction | undefined })
          }
        >
          <option value="">All flows</option>
          <option value="debit">Money out</option>
          <option value="credit">Money in</option>
        </select>
        <select
          className="input sm-select"
          value={filter.category ?? ''}
          onChange={(e) => onFilterChange({ ...filter, category: e.target.value || undefined })}
        >
          <option value="">All categories</option>
          {uniqueCats.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          className="input sm-select"
          value={filter.accountId ?? ''}
          onChange={(e) => onFilterChange({ ...filter, accountId: e.target.value || undefined })}
        >
          <option value="">All accounts</option>
          {(accounts ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="ledger">
        {error ? (
          <div className="ledger-empty">Couldn’t load transactions. Try again.</div>
        ) : isLoading ? (
          <div className="ledger-empty">Loading…</div>
        ) : !txns || txns.length === 0 ? (
          <div className="ledger-empty">
            <strong>Nothing on the books for this month.</strong>
            <span>Add one by hand, or wait for the Gmail sync (coming next).</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Merchant</th>
                <th>Category</th>
                <th>Account</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id}>
                  <td className="dt">{shortDate(t.occurred_at)}</td>
                  <td className="mc">
                    {t.merchant_raw || <span style={{ color: 'var(--text-faint)' }}>—</span>}
                    {t.note && <span className="mc-note">{t.note}</span>}
                  </td>
                  <td>
                    <RecategoriseMenu txn={t} />
                  </td>
                  <td className="dt">{accountName(t.account_id)}</td>
                  <td className={`am${t.direction === 'credit' ? ' in' : ''}`}>
                    {signedMoney(t.amount_cents, t.direction)}
                  </td>
                  <td className="am-actions">
                    <button
                      className="row-x"
                      onClick={() => {
                        if (confirm(`Delete this ${cats.label(t.category, t.direction)} transaction?`))
                          del.mutate(t.id);
                      }}
                      data-tip="Delete"
                      aria-label="Delete transaction"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
