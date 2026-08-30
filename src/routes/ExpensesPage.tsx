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
const WALLET_HIDE_KEY = 'alfred-expenses-hide-wallet';

function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function persist(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function ExpensesPage() {
  const { month, flow, setMonth, setFlow } = useExpenseFilters();
  const [addOpen, setAddOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [hidden, setHidden] = useState(() => readFlag(HIDE_KEY));
  const [walletHidden, setWalletHidden] = useState(() => readFlag(WALLET_HIDE_KEY));
  const { data: balances } = useAccountBalances();

  const toggle = useCallback(() => {
    setHidden((h) => {
      persist(HIDE_KEY, !h);
      return !h;
    });
  }, []);
  const toggleWallet = useCallback(() => {
    setWalletHidden((h) => {
      persist(WALLET_HIDE_KEY, !h);
      return !h;
    });
  }, []);

  const total = (balances ?? []).reduce((s, a) => s + a.balance_cents, 0);
  const walletValue = walletHidden
    ? MASK
    : balances && balances.length > 0
      ? money(total, true)
      : '—';

  return (
    <PrivacyContext.Provider value={{ hidden, toggle, walletHidden, toggleWallet }}>
      <TopBar
        title="Expenses"
        crumb="01 / MODULE"
        walletValue={walletValue}
        onWalletAdd={() => setAddOpen(true)}
        action={
          <>
            <button
              className={`btn sec btn-icon${hidden ? ' on' : ''}`}
              onClick={toggle}
              data-tip={hidden ? 'Show money-in amounts' : 'Hide money-in amounts'}
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
