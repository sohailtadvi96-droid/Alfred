import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { money, monthKey } from '@/lib/format';
import { useAccountBalances } from '@/features/expenses/hooks';
import { MonthNav } from '@/features/expenses/MonthNav';
import { MonthDashboard } from '@/features/expenses/MonthDashboard';
import { AccountsWallet } from '@/features/expenses/AccountsWallet';
import { TransactionList } from '@/features/expenses/TransactionList';
import { AddTransactionDialog } from '@/features/expenses/AddTransactionDialog';
import { AddCategoryDialog } from '@/features/expenses/AddCategoryDialog';
import type { TxnFilter } from '@/features/expenses/api';

export function ExpensesPage() {
  const [month, setMonth] = useState(monthKey());
  const [addOpen, setAddOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [filter, setFilter] = useState<Omit<TxnFilter, 'month'>>({});
  const { data: balances } = useAccountBalances();

  const total = (balances ?? []).reduce((s, a) => s + a.balance_cents, 0);

  return (
    <>
      <TopBar
        title="Expenses"
        crumb="01 / MODULE"
        walletValue={balances && balances.length > 0 ? money(total, true) : '—'}
        onWalletAdd={() => setAddOpen(true)}
        action={
          <button className="btn primary" onClick={() => setAddOpen(true)}>
            Add transaction
          </button>
        }
      />
      <div className="wrap expenses">
        <div className="expenses-head">
          <MonthNav month={month} onChange={setMonth} />
          <button className="btn sec sm" onClick={() => setCatOpen(true)}>
            Add category
          </button>
        </div>

        <MonthDashboard month={month} />

        <div className="expenses-grid">
          <TransactionList
            filter={{ ...filter, month }}
            onFilterChange={(f) =>
              setFilter({ category: f.category, direction: f.direction, accountId: f.accountId })
            }
          />
          <AccountsWallet />
        </div>
      </div>

      <AddTransactionDialog open={addOpen} onOpenChange={setAddOpen} />
      <AddCategoryDialog open={catOpen} onOpenChange={setCatOpen} />
    </>
  );
}
