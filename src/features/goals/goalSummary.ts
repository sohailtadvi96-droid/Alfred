import { shortDate } from '@/lib/format';
import { formatAmount, ofLabel } from './format';
import { savingsWhy } from './savingsPlanView';
import type { Goal, GoalCadence, GoalPace, PaceStatus, SavingsPlanResult } from './types';

/** Presentation logic for a goal row's two reads -- the one-line "why" in the
 *  collapsed row and the verdict panel in the expanded one. Pure: no I/O, no
 *  React. Savings goals take their read from the plan (savingsPlanView); every
 *  other kind from goal_pace. */

export type VerdictTone = 'ok' | 'warn' | 'bad' | 'neutral';

export function toneOf(status: PaceStatus): VerdictTone {
  if (status === 'ahead' || status === 'on-track') return 'ok';
  if (status === 'behind') return 'warn';
  if (status === 'at-risk') return 'bad';
  return 'neutral';
}

const PERIOD: Record<GoalCadence, string> = {
  none: '',
  weekly: 'this week',
  monthly: 'this month',
  quarterly: 'this quarter',
};

function isSavings(goal: Goal): boolean {
  return goal.source.kind === 'savings_target';
}

/** The single short line a collapsed row may add under its title. Only where
 *  it changes the read: a goal that is ahead / on track adds nothing (the dot
 *  and label already say so), and the line never restates the status word. */
export function whyLine(goal: Goal, pace: GoalPace | null, plan: SavingsPlanResult | undefined): string | null {
  if (goal.status !== 'active') return null;
  if (isSavings(goal)) return savingsWhy(plan);
  if (!pace || goal.type === 'milestone' || goal.type === 'streak') return null;
  if (pace.status !== 'behind' && pace.status !== 'at-risk') return null;

  const period = PERIOD[goal.cadence];
  if (period) return `${ofLabel(goal, Math.round(pace.actual * 10) / 10)} ${period}`;
  if (pace.expectedByToday != null) {
    const gap = Math.abs(pace.expectedByToday - pace.actual);
    return `${formatAmount(Math.round(gap * 10) / 10, goal.unit)} ${goal.direction === 'down' ? 'over' : 'behind'} pace`;
  }
  return null;
}

export interface Verdict {
  tone: VerdictTone;
  /** the "so what", stated as a fact rather than the header's status word */
  main: string;
  /** expected / actual / projected, where the pace engine has them */
  sub: string | null;
}

function paceNumbers(goal: Goal, pace: GoalPace): string {
  const parts = [
    `Expected by today: ${pace.expectedByToday != null ? formatAmount(pace.expectedByToday, goal.unit) : '—'}`,
    `Actual: ${formatAmount(pace.actual, goal.unit)}`,
  ];
  if (pace.projectedEnd) parts.push(`Projected: ${shortDate(`${pace.projectedEnd}T00:00:00`)}`);
  return parts.join(' · ');
}

/** The verdict for everything that is not an active savings goal (that one is
 *  the plan's own headline, see SavingsPlan.tsx). */
export function verdictOf(goal: Goal, pace: GoalPace | null): Verdict {
  if (goal.type === 'milestone') {
    const steps = goal.milestones ?? [];
    return { tone: 'neutral', main: `${steps.filter((m) => m.done).length} of ${steps.length} steps done.`, sub: null };
  }
  if (!pace) return { tone: 'neutral', main: "Progress isn't available right now.", sub: null };

  // a savings goal that is not active has no plan to read; goal_pace's linear
  // expectation would mislead, so only the plain net is stated
  if (isSavings(goal)) {
    return {
      tone: 'neutral',
      main: `${formatAmount(pace.actual, goal.unit)} net so far this month, against a ${formatAmount(goal.target, goal.unit)} target.`,
      sub: null,
    };
  }

  if (goal.type === 'streak') {
    return {
      tone: toneOf(pace.status),
      main: `${Math.round(pace.actual)} of ${Math.round(pace.expectedByToday ?? 0)} check-ins in the last 4 weeks.`,
      sub: `Aiming for ${goal.target} a week.`,
    };
  }

  const period = PERIOD[goal.cadence];
  const so = `${ofLabel(goal, pace.actual)}${period ? ` ${period}` : ''}`;

  if (pace.expectedByToday == null) {
    return { tone: toneOf(pace.status), main: `${so}.`, sub: 'No deadline set, so there is no pace to compare against.' };
  }

  const delta = pace.actual - pace.expectedByToday;
  const size = formatAmount(Math.round(Math.abs(delta) * 10) / 10, goal.unit);
  const down = goal.direction === 'down';
  let main: string;
  if (pace.status === 'ahead') {
    main = `${size} ${down ? 'under' : 'ahead of'} where you'd be by today — ${so}.`;
  } else if (pace.status === 'on-track') {
    main = `Right about where you'd be by today — ${so}.`;
  } else {
    main = `${size} ${down ? 'over' : 'behind'} where you'd be by today — ${so}.`;
  }
  return { tone: toneOf(pace.status), main, sub: paceNumbers(goal, pace) };
}
