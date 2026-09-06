import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { ReviewQueue } from '@/features/expenses/ReviewQueue';

export function ReviewPage() {
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
        <ReviewQueue />
      </div>
    </>
  );
}
