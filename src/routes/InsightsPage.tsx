import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { MonthNav } from '@/features/expenses/MonthNav';
import { LedgerStalenessNote } from '@/features/expenses/LedgerStalenessNote';
import { useExpenseFilters } from '@/features/expenses/useExpenseFilters';
import { CategoryBars } from '@/features/insights/CategoryBars';
import { FrequencyTicket } from '@/features/insights/FrequencyTicket';
import { InsightFeed } from '@/features/insights/InsightFeed';

export function InsightsPage() {
  const { month, setMonth } = useExpenseFilters();

  return (
    <>
      <TopBar
        title="Insights"
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
        <LedgerStalenessNote className="tlabel" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 16 }}>
          <CategoryBars month={month} />
          <FrequencyTicket month={month} />
          <InsightFeed />
        </div>
      </div>
    </>
  );
}
