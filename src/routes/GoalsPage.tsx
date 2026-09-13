import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { GoalsView } from '@/features/goals/GoalsView';
import { NewGoalDialog } from '@/features/goals/NewGoalDialog';
import { useGoals } from '@/features/goals/hooks';

export function GoalsPage() {
  const [newGoalOpen, setNewGoalOpen] = useState(false);
  const { data: goals } = useGoals();
  const activeCount = (goals ?? []).filter((g) => g.status === 'active').length;

  return (
    <>
      <TopBar
        title="Goals"
        crumb="05 / MODULE"
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
        <GoalsView />
      </div>
      <NewGoalDialog open={newGoalOpen} onOpenChange={setNewGoalOpen} />
    </>
  );
}
