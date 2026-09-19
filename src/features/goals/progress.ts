import type { Goal, GoalProgress } from './types';

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A small cumulative series for the sparkline -- running total for count/
 *  value, a 28-day done/not-done strip for streak, cumulative milestones hit
 *  for milestone goals. Reads the raw ledger directly: goal_pace's `actual`
 *  is a single current-period number, not a time series, so the sparkline
 *  stays client-side rather than going through the RPC. Only meaningful for
 *  source.kind === 'manual' goals -- a journal_streak/tasks_completed goal
 *  has no goal_progress rows at all, so this renders "not enough history". */
export function sparklineSeries(goal: Goal, rows: GoalProgress[]): number[] {
  if (goal.type === 'streak') {
    const done = new Set(rows.filter((r) => r.goal_id === goal.id).map((r) => r.occurred_on));
    const cursor = new Date();
    cursor.setDate(cursor.getDate() - 27);
    const days: number[] = [];
    for (let i = 0; i < 28; i++) {
      days.push(done.has(dateKey(cursor)) ? 1 : 0);
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  if (goal.type === 'milestone') {
    const doneOrder = (goal.milestones ?? [])
      .filter((m) => m.done_at)
      .sort((a, b) => (a.done_at as string).localeCompare(b.done_at as string));
    let sum = 0;
    return doneOrder.map(() => ++sum);
  }

  const sorted = rows.filter((r) => r.goal_id === goal.id).sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  let sum = 0;
  return sorted.map((r) => (sum += r.value));
}
