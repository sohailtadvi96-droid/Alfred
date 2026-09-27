import { TopBar } from '@/components/TopBar';
import { RemindersView } from '@/features/reminders/RemindersView';
import { todayTally } from '@/features/reminders/StatStrip';
import { useRemindersToday } from '@/features/reminders/hooks';

export function RemindersPage() {
  const { data: rows } = useRemindersToday();
  const { done, total } = todayTally(rows ?? []);

  return (
    <>
      <TopBar
        title="Reminders"
        crumb="06 / MODULE"
        showWallet={false}
        action={
          <>
            <span className="goals-cap-hint">
              {done} / {total} done today
            </span>
            <span data-tip="Coming in R5">
              <button className="btn primary" disabled>
                New reminder
              </button>
            </span>
          </>
        }
      />
      <div className="wrap">
        <RemindersView />
      </div>
    </>
  );
}
