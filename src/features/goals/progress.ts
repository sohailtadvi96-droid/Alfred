import { dateKey } from './pace';
import type { Goal, GoalProgress, GoalProgressInput } from './types';

/** Shapes the raw `goal_progress` ledger (plus, for milestone goals, the
 *  goal's own checklist) into what `computePace` needs — the one place that
 *  knows how each goal type turns a log into a current "actual". */
export function deriveProgress(goal: Goal, rows: GoalProgress[]): GoalProgressInput {
  const goalRows = rows.filter((r) => r.goal_id === goal.id);

  if (goal.type === 'streak') {
    const lastUpdatedAt = goalRows.length ? goalRows[goalRows.length - 1].occurred_on : null;
    return { kind: 'streak', completions: goalRows.map((r) => r.occurred_on), lastUpdatedAt };
  }

  if (goal.type === 'milestone') {
    const doneDates = (goal.milestones ?? [])
      .map((m) => m.done_at)
      .filter((d): d is string => !!d)
      .sort();
    const actual = (goal.milestones ?? []).filter((m) => m.done).length;
    return { kind: 'value', actual, lastUpdatedAt: doneDates.at(-1) ?? null };
  }

  const actual = goalRows.reduce((sum, r) => sum + r.value, 0);
  const lastUpdatedAt = goalRows.length ? goalRows[goalRows.length - 1].occurred_on : null;
  return { kind: 'value', actual, lastUpdatedAt };
}

/** A small cumulative series for the sparkline — running total for count/
 *  value, a 28-day done/not-done strip for streak, cumulative milestones hit
 *  for milestone goals. */
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
