import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { ReviewQueue } from '@/features/expenses/ReviewQueue';
import { CounterpartyQueue } from '@/features/expenses/CounterpartyQueue';

type Tab = 'confidence' | 'counterparties';

export function ReviewPage() {
  const [tab, setTab] = useState<Tab>('confidence');

  return (
    <>
      <TopBar
        title="Review queue"
        crumb="01 / EXPENSES"
        showWallet={false}
        action={
          <Link className="btn sec" to={{ pathname: '/expenses', search: window.location.search }}>
            ‹ Back to dashboard
          </Link>
        }
      />
      <div className="wrap expenses">
        <div className="txn-filters" style={{ marginBottom: 16 }}>
          <button className={`chip${tab === 'confidence' ? ' on' : ''}`} onClick={() => setTab('confidence')}>
            Low confidence
          </button>
          <button className={`chip${tab === 'counterparties' ? ' on' : ''}`} onClick={() => setTab('counterparties')}>
            Counterparties
          </button>
        </div>
        {tab === 'confidence' ? <ReviewQueue /> : <CounterpartyQueue />}
      </div>
    </>
  );
}
