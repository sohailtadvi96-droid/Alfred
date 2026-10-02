import { useGoalPace, useGoals } from '@/features/goals/hooks';
import { todayTally } from './today';
import type { ReminderToday } from './types';

/** Three home-tile-style stat cards. Reuses .home-tile/.home-tile-title/
 *  .home-tile-stat-value/.home-tile-stat-label/.goal-bar as-is (same visual
 *  language as the Home board) -- these are static info cards, not links,
 *  so there's no .home-tile-link overlay and no data-module icon chip.
 *  .rem-stats overrides .home-tile's Home-board sizing to a compact ~88px. */
export function StatStrip({ rows }: { rows: ReminderToday[] }) {
  const { done, total } = todayTally(rows);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;

  const { data: goals } = useGoals();
  const tasksGoal = goals?.find((g) => g.source.kind === 'tasks_completed');
  const { data: tasksPace } = useGoalPace(tasksGoal);

  // Only a genuinely positive streak counts as "the" streak -- a 0-streak
  // reminder isn't a streak to show off, so it must not win the reduce and
  // force the card to name it instead of reading "no streaks yet".
  const recurring = rows.filter((r) => r.kind === 'recurring');
  const topStreak = recurring.reduce<ReminderToday | null>(
    (best, r) => ((r.streak ?? 0) > (best?.streak ?? 0) ? r : best),
    null,
  );

  return (
    <div className="rem-stats">
      <div className="home-tile" style={{ borderLeftColor: 'var(--base)' }}>
        <div className="home-tile-title">{allDone ? 'Today · all done' : 'Today'}</div>
        <div className="home-tile-stat-value">
          {done} / {total}
        </div>
        <div className="goal-bar">
          <div
            className="goal-bar-fill"
            style={{ width: `${pct}%`, background: allDone ? 'var(--pos)' : 'var(--base)' }}
          />
        </div>
      </div>

      {tasksGoal && (
        <div className="home-tile" style={{ borderLeftColor: 'var(--m-goals)' }}>
          <div className="home-tile-title">Tasks this week</div>
          <div className="home-tile-stat-value">
            {Math.round(tasksPace?.actual ?? 0)} / {tasksGoal.target}
          </div>
          <div className="home-tile-stat-label">one-time reminders count here</div>
        </div>
      )}

      <div className="home-tile" style={{ borderLeftColor: 'var(--c-ochre)' }}>
        <div className="home-tile-title">Longest streak</div>
        <div className="home-tile-stat-value">{topStreak ? `${topStreak.streak}d` : '—'}</div>
        <div className="home-tile-stat-label">{topStreak ? topStreak.title : 'no streaks yet'}</div>
      </div>
    </div>
  );
}
