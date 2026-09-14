import { useNavigate } from 'react-router-dom';
import { money, monthKey } from '@/lib/format';
import { useCategoryBars } from './hooks';
import type { CategoryBarDatum } from './types';

function Bar({ datum, maxCents, onOpen }: { datum: CategoryBarDatum; maxCents: number; onOpen: () => void }) {
  const pct = maxCents > 0 ? Math.max(2, (datum.cents / maxCents) * 100) : 0;
  const fillClass = datum.isUnresolved ? 'unresolved' : datum.isTransfer ? 'transfer' : '';

  return (
    <button type="button" className="insight-bar-row" onClick={onOpen}>
      <div className="insight-bar-row-h">
        <span className="insight-bar-label">
          {datum.label}
          {datum.isUnresolved && <span className="insight-tag unresolved">unresolved</span>}
        </span>
        <span className="insight-bar-meta">
          {money(datum.cents, true)} · {datum.count} txn{datum.count === 1 ? '' : 's'}
        </span>
      </div>
      <div className="insight-bar-track">
        <div className={`insight-bar-fill ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
}

export function CategoryBars({ month }: { month: string }) {
  const { data, isLoading } = useCategoryBars(month);
  const navigate = useNavigate();

  function openCategory(slug: string) {
    const p = new URLSearchParams();
    if (month !== monthKey()) p.set('month', month);
    p.set('flow', 'debit');
    p.set('category', slug);
    navigate({ pathname: '/expenses/transactions', search: `?${p.toString()}` });
  }

  if (isLoading || !data) return <div className="ledger-empty">Loading…</div>;

  if (data.expense.length === 0 && data.transfer.length === 0) {
    return (
      <div className="ledger-empty">
        <strong>No expense data yet this month.</strong>
      </div>
    );
  }

  const maxExpense = Math.max(...data.expense.map((d) => d.cents), 0);
  const maxTransfer = Math.max(...data.transfer.map((d) => d.cents), 0);

  return (
    <div className="insight-panel">
      <h4 className="insight-section-label">Expense categories</h4>
      <div className="insight-bars">
        {data.expense.map((d) => (
          <Bar key={`${d.direction}:${d.slug}`} datum={d} maxCents={maxExpense} onOpen={() => openCategory(d.slug)} />
        ))}
      </div>

      {data.transfer.length > 0 && (
        <>
          <h4 className="insight-section-label muted">Transfers — excluded from spend</h4>
          <div className="insight-bars">
            {data.transfer.map((d) => (
              <Bar
                key={`${d.direction}:${d.slug}`}
                datum={d}
                maxCents={maxTransfer}
                onOpen={() => openCategory(d.slug)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
