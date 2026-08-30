import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { money } from '@/lib/format';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { MonthNav } from '@/features/expenses/MonthNav';
import { TransactionList } from '@/features/expenses/TransactionList';
import { useExpenseFilters } from '@/features/expenses/useExpenseFilters';
import { useTransactions } from '@/features/expenses/hooks';

export function TransactionsPage() {
  const { month, filter, setMonth, patch } = useExpenseFilters();
  const { data: txns } = useTransactions({ ...filter, month });

  let debited = 0;
  let credited = 0;
  for (const t of txns ?? []) {
    if (t.direction === 'credit') credited += t.amount_cents;
    else debited += t.amount_cents;
  }

  return (
    <>
      <TopBar
        title="Transactions"
        crumb="01 / EXPENSES"
        showWallet={false}
        action={
          <Link className="btn sec" to={{ pathname: '/expenses', search: window.location.search }}>
            ‹ Back to dashboard
          </Link>
        }
      />
      <div className="wrap expenses">
        <div className="expenses-head">
          <MonthNav month={month} onChange={setMonth} />
        </div>

        <div className="ledger-summary">
          <div className="ls-item out">
            <span className="ls-l">Total debited</span>
            <span className="ls-v">
              −<AnimatedNumber value={debited} format={(c) => money(c, true)} />
            </span>
          </div>
          <div className="ls-item in">
            <span className="ls-l">Total credited</span>
            <span className="ls-v">
              +<AnimatedNumber value={credited} format={(c) => money(c, true)} />
            </span>
          </div>
          <div className="ls-item">
            <span className="ls-l">Net</span>
            <span className="ls-v">
              <AnimatedNumber value={credited - debited} format={(c) => money(c, true)} />
            </span>
          </div>
        </div>

        <TransactionList
          filter={{ ...filter, month }}
          onFilterChange={(f) =>
            patch({ direction: f.direction, category: f.category, accountId: f.accountId })
          }
        />
      </div>
    </>
  );
}
