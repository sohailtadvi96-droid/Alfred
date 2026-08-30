import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { money } from '@/lib/format';
import { useAccountBalances } from '@/features/expenses/hooks';
import { useExpenseFilters } from '@/features/expenses/useExpenseFilters';
import { MonthNav } from '@/features/expenses/MonthNav';
import { FlowToggle } from '@/features/expenses/FlowToggle';
import { MonthDashboard } from '@/features/expenses/MonthDashboard';
import { AddTransactionDialog } from '@/features/expenses/AddTransactionDialog';
import { AddCategoryDialog } from '@/features/expenses/AddCategoryDialog';

export function ExpensesPage() {
  const { month, flow, setMonth, setFlow } = useExpenseFilters();
  const [addOpen, setAddOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
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
          <FlowToggle value={flow} onChange={setFlow} />
          <button className="btn sec sm" onClick={() => setCatOpen(true)}>
            Add category
          </button>
        </div>

        <MonthDashboard month={month} flow={flow} />
      </div>

      <AddTransactionDialog open={addOpen} onOpenChange={setAddOpen} />
      <AddCategoryDialog open={catOpen} onOpenChange={setCatOpen} />
    </>
  );
}
