import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { PeopleManager } from '@/features/expenses/PeopleManager';

export function PeoplePage() {
  return (
    <>
      <TopBar
        title="Family & shops"
        crumb="01 / EXPENSES"
        showWallet={false}
        action={
          <Link className="btn sec" to={{ pathname: '/expenses', search: window.location.search }}>
            ‹ Back to dashboard
          </Link>
        }
      />
      <div className="wrap expenses">
        <PeopleManager />
      </div>
    </>
  );
}
