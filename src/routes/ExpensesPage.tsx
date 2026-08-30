import { useCallback, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { money } from '@/lib/format';
import { useAccountBalances } from '@/features/expenses/hooks';
import { useExpenseFilters } from '@/features/expenses/useExpenseFilters';
import { PrivacyContext, MASK } from '@/features/expenses/privacy';
import { MonthNav } from '@/features/expenses/MonthNav';
import { FlowToggle } from '@/features/expenses/FlowToggle';
import { MonthDashboard } from '@/features/expenses/MonthDashboard';
import { AddTransactionDialog } from '@/features/expenses/AddTransactionDialog';
import { AddCategoryDialog } from '@/features/expenses/AddCategoryDialog';

const HIDE_KEY = 'alfred-expenses-hide-amounts';

function readHidden() {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

export function ExpensesPage() {
  const { month, flow, setMonth, setFlow } = useExpenseFilters();
  const [addOpen, setAddOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [hidden, setHidden] = useState(readHidden);
  const { data: balances } = useAccountBalances();

  const toggleHidden = useCallback(() => {
    setHidden((h) => {
      const next = !h;
      try {
        localStorage.setItem(HIDE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const total = (balances ?? []).reduce((s, a) => s + a.balance_cents, 0);
  const walletValue = hidden
    ? MASK
    : balances && balances.length > 0
      ? money(total, true)
      : '—';

  return (
    <PrivacyContext.Provider value={{ hidden, toggle: toggleHidden }}>
      <TopBar
        title="Expenses"
        crumb="01 / MODULE"
        walletValue={walletValue}
        onWalletAdd={() => setAddOpen(true)}
        action={
          <>
            <button
              className={`btn sec btn-icon${hidden ? ' on' : ''}`}
              onClick={toggleHidden}
              data-tip={hidden ? 'Show amounts' : 'Hide all amounts'}
              aria-pressed={hidden}
              aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
            >
              <Icon name="eye" size={16} />
            </button>
            <button className="btn primary" onClick={() => setAddOpen(true)}>
              Add transaction
            </button>
          </>
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
    </PrivacyContext.Provider>
  );
}
