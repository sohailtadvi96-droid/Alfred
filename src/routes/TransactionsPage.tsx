import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { MonthNav } from '@/features/expenses/MonthNav';
import { TransactionList } from '@/features/expenses/TransactionList';
import { useExpenseFilters } from '@/features/expenses/useExpenseFilters';

export function TransactionsPage() {
  const { month, filter, setMonth, patch } = useExpenseFilters();

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
