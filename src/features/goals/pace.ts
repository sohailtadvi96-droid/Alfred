import { formatAmount } from './format';
import type { Goal, GoalDirection, GoalProgressInput, Pace, PaceStatus, StreakPace } from './types';

const MS_PER_DAY = 86_400_000;
const STALE_DAYS = 30;
const DAYS_PER_MONTH = 30.44;

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MS_PER_DAY;
}

function isStale(lastUpdatedAt: string | null, today: Date): boolean {
  if (!lastUpdatedAt) return false;
  return daysBetween(new Date(lastUpdatedAt), today) > STALE_DAYS;
}

/** actual vs expected, direction-adjusted so >=1 always means "good" — for
 *  `down` goals (stay under a number) the comparison inverts per the ratio,
 *  not the thresholds. Capped so a fresh/zero-denominator goal reads as
 *  comfortably ahead rather than Infinity. */
function paceRatioFor(direction: GoalDirection, actual: number, expected: number): number {
  const raw =
    direction === 'up'
      ? expected === 0
        ? actual === 0
          ? 1
          : 3
        : actual / expected
      : actual === 0
        ? 3
        : expected / actual;
  return Math.min(Math.max(raw, 0), 3);
}

function statusFromRatio(ratio: number): PaceStatus {
  if (ratio >= 1.0) return 'ahead';
  if (ratio >= 0.85) return 'on-track';
  if (ratio >= 0.6) return 'behind';
  return 'at-risk';
}

function computeValuePace(goal: Goal, actual: number, lastUpdatedAt: string | null, today: Date): Pace {
  const stale = isStale(lastUpdatedAt, today);

  if (!goal.target_date) {
    return {
      status: 'no-deadline',
      paceRatio: null,
      actual,
      expected: null,
      requiredRate: null,
      requiredRateLabel: null,
      stale,
    };
  }

  const start = new Date(`${goal.start_date}T00:00:00`);
  const end = new Date(`${goal.target_date}T00:00:00`);
  const totalDays = Math.max(1, daysBetween(start, end));
  const elapsedDays = Math.min(totalDays, Math.max(0, daysBetween(start, today)));
  const elapsed = elapsedDays / totalDays;
  const expected = goal.target * elapsed;

  const paceRatio = paceRatioFor(goal.direction, actual, expected);
  const status = statusFromRatio(paceRatio);
  const achieved = goal.direction === 'up' ? actual >= goal.target : actual <= goal.target;
  const overdue = daysBetween(today, end) < 0;

  let requiredRate: number | null = null;
  let requiredRateLabel: string | null = null;
  if (achieved) {
    requiredRate = 0;
    requiredRateLabel = 'Target reached';
  } else if (overdue) {
    requiredRateLabel = 'Past target date';
  } else {
    const remainingMonths = Math.max(daysBetween(today, end), 1) / DAYS_PER_MONTH;
    const remaining = goal.direction === 'up' ? goal.target - actual : actual - goal.target;
    requiredRate = Math.max(0, remaining) / remainingMonths;
    requiredRateLabel = `${formatAmount(requiredRate, goal.unit ?? 'units')}/month to finish on time`;
  }

  return { status, paceRatio, actual, expected, requiredRate, requiredRateLabel, stale };
}

/** Current/best streak count individual days, trailing-window completion
 *  rate is checked against `goal.target` treated as a per-week frequency
 *  (matches the "Gym 4×/week" example; a daily streak is just target=7). */
function computeStreakPace(
  goal: Goal,
  completions: string[],
  lastUpdatedAt: string | null,
  today: Date,
): StreakPace {
  const stale = isStale(lastUpdatedAt, today);
  const done = new Set(completions);

  let currentStreak = 0;
  const cursor = new Date(today);
  if (!done.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (done.has(dateKey(cursor))) {
    currentStreak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const sorted = [...done].sort();
  let bestStreak = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    const gap = i === 0 ? 1 : daysBetween(new Date(`${sorted[i - 1]}T00:00:00`), new Date(`${sorted[i]}T00:00:00`));
    run = gap === 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
  }
  bestStreak = Math.max(bestStreak, currentStreak);

  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - 27);
  const windowStartKey = dateKey(windowStart);
  const todayKey = dateKey(today);
  const inWindow = completions.filter((d) => d >= windowStartKey && d <= todayKey).length;
  const completionRate4wk = goal.target > 0 ? inWindow / (goal.target * 4) : 0;

  return { status: 'streak', currentStreak, bestStreak, completionRate4wk, stale };
}

export function computePace(goal: Goal, progress: GoalProgressInput, today: Date): Pace | StreakPace {
  if (progress.kind === 'streak') {
    return computeStreakPace(goal, progress.completions, progress.lastUpdatedAt, today);
  }
  return computeValuePace(goal, progress.actual, progress.lastUpdatedAt, today);
}
