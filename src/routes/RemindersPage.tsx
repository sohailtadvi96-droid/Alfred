import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { ReminderSheet, type SheetRequest } from '@/features/reminders/ReminderSheet';
import { RemindersView } from '@/features/reminders/RemindersView';
import { todayTally } from '@/features/reminders/today';
import { useRemindersToday } from '@/features/reminders/hooks';
import { useNewReminderKey } from '@/features/reminders/keys';

export function RemindersPage() {
  const { data: rows } = useRemindersToday();
  const { done, total } = todayTally(rows ?? []);
  const [sheet, setSheet] = useState<SheetRequest | null>(null);
  useNewReminderKey(() => setSheet({ kind: 'create' }));

  return (
    <>
      <TopBar
        title="Reminders"
        crumb="06 / MODULE"
        showWallet={false}
        action={
          <>
            <span className="goals-cap-hint rem-top-tally">
              {done} / {total} done today
            </span>
            <button className="btn primary" aria-keyshortcuts="N" onClick={() => setSheet({ kind: 'create' })}>
              New reminder
            </button>
          </>
        }
      />
      <div className="wrap rem-wrap">
        <RemindersView onOpenSheet={setSheet} />
      </div>
      <ReminderSheet request={sheet} onClose={() => setSheet(null)} />
    </>
  );
}
