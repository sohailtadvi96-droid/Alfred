import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { GoalsView } from '@/features/goals/GoalsView';
import { NewGoalDialog } from '@/features/goals/NewGoalDialog';
import { useGoals } from '@/features/goals/hooks';
import { ReminderSheet, type SheetRequest } from '@/features/reminders/ReminderSheet';

export function GoalsPage() {
  const [newGoalOpen, setNewGoalOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetRequest | null>(null);
  const { data: goals } = useGoals();
  const activeCount = (goals ?? []).filter((g) => g.status === 'active').length;

  return (
    <>
      <TopBar
        title="Goals"
        crumb="05 / MODULE"
        phoneAction={
          <button type="button" className="hbtn primary" onClick={() => setNewGoalOpen(true)} aria-label="New goal">
            <Icon name="plus" size={18} />
          </button>
        }
        showWallet={false}
        action={
          <>
            <span className="goals-cap-hint">{activeCount} / 7 active</span>
            <button className="btn primary" onClick={() => setNewGoalOpen(true)}>
              New goal
            </button>
          </>
        }
      />
      <div className="wrap goals-wrap">
        <GoalsView onOpenReminderSheet={setSheet} />
      </div>
      <NewGoalDialog open={newGoalOpen} onOpenChange={setNewGoalOpen} />
      <ReminderSheet request={sheet} onClose={() => setSheet(null)} />
    </>
  );
}
