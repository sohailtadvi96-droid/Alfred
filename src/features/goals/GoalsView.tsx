import { useState } from 'react';
import { useArchiveReminder } from '@/features/reminders/hooks';
import type { SheetRequest } from '@/features/reminders/ReminderSheet';
import { useGoalProgress, useGoalsWithPace } from './hooks';
import { GoalRow } from './GoalRow';
import type { Goal, GoalPace } from './types';

/** Milestone goals carry pace: null and never need pace-based attention —
 *  their own checklist UI is the only signal they need. */
function needsAttention(pace: GoalPace | null): boolean {
  return pace != null && (pace.status === 'behind' || pace.status === 'at-risk');
}

function byTargetDateAsc(a: Goal, b: Goal): number {
  if (!a.target_date && !b.target_date) return 0;
  if (!a.target_date) return 1;
  if (!b.target_date) return -1;
  return a.target_date.localeCompare(b.target_date);
}

export function GoalsView({ onOpenReminderSheet }: { onOpenReminderSheet: (req: SheetRequest) => void }) {
  const { goalsWithPace, isLoading } = useGoalsWithPace();
  const { data: progress } = useGoalProgress();
  const [pausedOpen, setPausedOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  // A deleted goal's row is gone, so this is the only place left to tell the
  // user its reminder is still around (0040's FK keeps it, goal_id -> null).
  const [keptReminder, setKeptReminder] = useState<{ id: string; title: string } | null>(null);
  const archiveReminder = useArchiveReminder();

  if (isLoading || !goalsWithPace) {
    return <p className="goals-empty">Loading goals…</p>;
  }

  const active = goalsWithPace.filter((g) => g.goal.status === 'active');
  const attention = active.filter((g) => needsAttention(g.pace));
  const rest = active.filter((g) => !needsAttention(g.pace)).sort((a, b) => byTargetDateAsc(a.goal, b.goal));
  // paused goals used to be listed nowhere, so pausing was a one-way door and
  // Resume was unreachable; they get their own folded group, most recently touched first
  const paused = goalsWithPace
    .filter((g) => g.goal.status === 'paused')
    .sort((a, b) => b.goal.updated_at.localeCompare(a.goal.updated_at));
  const archived = goalsWithPace
    .filter((g) => g.goal.status === 'achieved' || g.goal.status === 'abandoned')
    .sort((a, b) => (b.goal.achieved_at ?? b.goal.created_at).localeCompare(a.goal.achieved_at ?? a.goal.created_at));

  const row = (goal: Goal, pace: GoalPace | null) => (
    <GoalRow
      key={goal.id}
      goal={goal}
      pace={pace}
      progress={progress ?? []}
      onOpenReminderSheet={onOpenReminderSheet}
      onGoalDeleted={setKeptReminder}
    />
  );

  if (goalsWithPace.length === 0) {
    return (
      <p className="goals-empty">
        No goals yet — a goal is a target, a horizon, and where the progress comes from. Add your first one.
      </p>
    );
  }

  return (
    <div className="goals-view">
      {keptReminder && (
        <div className="goals-kept-reminder">
          <span>Its reminder ("{keptReminder.title}") was kept.</span>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              archiveReminder.mutate(keptReminder.id);
              setKeptReminder(null);
            }}
          >
            Archive
          </button>
          <button type="button" className="btn ghost sm" onClick={() => setKeptReminder(null)}>
            Dismiss
          </button>
        </div>
      )}

      {attention.length > 0 ? (
        <section>
          <div className="goals-section-label">Needs attention</div>
          {attention.map(({ goal, pace }) => row(goal, pace))}
        </section>
      ) : (
        <p className="goals-allgood">Nothing needs attention — you're on pace.</p>
      )}

      <section>
        <div className="goals-section-label">Active</div>
        {rest.length === 0 ? <p className="goals-empty">No other active goals.</p> : rest.map(({ goal, pace }) => row(goal, pace))}
      </section>

      {paused.length > 0 && (
        <section>
          <button type="button" className="goals-section-label goals-archive-toggle" onClick={() => setPausedOpen((v) => !v)}>
            Paused ({paused.length}) {pausedOpen ? '▾' : '▸'}
          </button>
          {pausedOpen && paused.map(({ goal, pace }) => row(goal, pace))}
        </section>
      )}

      {archived.length > 0 && (
        <section>
          <button type="button" className="goals-section-label goals-archive-toggle" onClick={() => setArchiveOpen((v) => !v)}>
            Archive ({archived.length}) {archiveOpen ? '▾' : '▸'}
          </button>
          {archiveOpen && archived.map(({ goal, pace }) => row(goal, pace))}
        </section>
      )}
    </div>
  );
}
