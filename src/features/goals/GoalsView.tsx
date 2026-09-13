import { useState } from 'react';
import { useGoalProgress, useGoalsWithPace } from './hooks';
import { GoalRow } from './GoalRow';
import type { Goal, Pace, StreakPace } from './types';

function needsAttention(pace: Pace | StreakPace): boolean {
  return pace.status === 'behind' || pace.status === 'at-risk';
}

function byTargetDateAsc(a: Goal, b: Goal): number {
  if (!a.target_date && !b.target_date) return 0;
  if (!a.target_date) return 1;
  if (!b.target_date) return -1;
  return a.target_date.localeCompare(b.target_date);
}

export function GoalsView() {
  const { goalsWithPace, isLoading } = useGoalsWithPace();
  const { data: progress } = useGoalProgress();
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (isLoading || !goalsWithPace) {
    return <p className="goals-empty">Loading goals…</p>;
  }

  const active = goalsWithPace.filter((g) => g.goal.status === 'active');
  const attention = active.filter((g) => needsAttention(g.pace));
  const rest = active.filter((g) => !needsAttention(g.pace)).sort((a, b) => byTargetDateAsc(a.goal, b.goal));
  const archived = goalsWithPace
    .filter((g) => g.goal.status === 'achieved' || g.goal.status === 'abandoned')
    .sort((a, b) => (b.goal.achieved_at ?? b.goal.created_at).localeCompare(a.goal.achieved_at ?? a.goal.created_at));

  if (goalsWithPace.length === 0) {
    return (
      <p className="goals-empty">
        No goals yet — a goal is a target, a horizon, and where the progress comes from. Add your first one.
      </p>
    );
  }

  return (
    <div className="goals-view">
      {attention.length > 0 ? (
        <section>
          <div className="goals-section-label">Needs attention</div>
          {attention.map(({ goal, pace }) => (
            <GoalRow key={goal.id} goal={goal} pace={pace} progress={progress ?? []} />
          ))}
        </section>
      ) : (
        <p className="goals-allgood">Nothing needs attention — you're on pace.</p>
      )}

      <section>
        <div className="goals-section-label">Active</div>
        {rest.length === 0 ? (
          <p className="goals-empty">No other active goals.</p>
        ) : (
          rest.map(({ goal, pace }) => (
            <GoalRow key={goal.id} goal={goal} pace={pace} progress={progress ?? []} />
          ))
        )}
      </section>

      {archived.length > 0 && (
        <section>
          <button type="button" className="goals-section-label goals-archive-toggle" onClick={() => setArchiveOpen((v) => !v)}>
            Archive ({archived.length}) {archiveOpen ? '▾' : '▸'}
          </button>
          {archiveOpen &&
            archived.map(({ goal, pace }) => (
              <GoalRow key={goal.id} goal={goal} pace={pace} progress={progress ?? []} />
            ))}
        </section>
      )}
    </div>
  );
}
