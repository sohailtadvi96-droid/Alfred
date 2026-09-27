import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { ReminderSheet, type SheetRequest } from '@/features/reminders/ReminderSheet';
import { RemindersView } from '@/features/reminders/RemindersView';
import { todayTally } from '@/features/reminders/StatStrip';
import { useRemindersToday } from '@/features/reminders/hooks';

export function RemindersPage() {
  const { data: rows } = useRemindersToday();
  const { done, total } = todayTally(rows ?? []);
  const [sheet, setSheet] = useState<SheetRequest | null>(null);

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
            <button className="btn primary" onClick={() => setSheet({ kind: 'create' })}>
              New reminder
            </button>
          </>
        }
      />
      <div className="wrap">
        <RemindersView onOpenSheet={setSheet} />
      </div>
      <ReminderSheet request={sheet} onClose={() => setSheet(null)} />
    </>
  );
}
