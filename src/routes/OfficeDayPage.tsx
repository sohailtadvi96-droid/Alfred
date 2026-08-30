import { Navigate, useParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { DayView } from '@/features/office/DayView';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function OfficeDayPage() {
  const { date = '' } = useParams();
  if (!DATE_RE.test(date)) return <Navigate to="/work" replace />;

  return (
    <>
      <TopBar title="Office" crumb="03 / WORK" showWallet={false} />
      <div className="wrap work">
        <DayView date={date} />
      </div>
    </>
  );
}
