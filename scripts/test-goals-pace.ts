/**
 * Assertion script for the Goals pace engine (src/features/goals/pace.ts).
 * The formulas (direction inversion, divide-by-zero guards, streak windows,
 * staleness) were judgment calls beyond what the build spec specified, so
 * this pins down the behaviour.
 *
 *   node --import ./scripts/register-ts.mjs scripts/test-goals-pace.ts
 */

import { computePace } from '../src/features/goals/pace.ts';
import type { Goal, Pace, StreakPace } from '../src/features/goals/types.ts';

let failures = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.log(`  FAIL: ${msg}`);
  }
}

function mkGoal(overrides: Partial<Goal>): Goal {
  return {
    id: 'g1',
    title: 'Test goal',
    type: 'count',
    target: 12,
    unit: 'books',
    direction: 'up',
    start_date: '2026-01-01',
    target_date: '2026-12-31',
    source: { kind: 'manual' },
    module_id: null,
    status: 'active',
    milestones: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    achieved_at: null,
    ...overrides,
  };
}

function asPace(p: Pace | StreakPace): Pace {
  return p as Pace;
}
function asStreak(p: Pace | StreakPace): StreakPace {
  return p as StreakPace;
}

// ---------- up-direction thresholds ----------
{
  console.log('up-direction thresholds (mid-year, target 12, half elapsed => expected 6)');
  const goal = mkGoal({});
  const today = new Date('2026-07-02T00:00:00'); // ~50.1% through the year

  const ahead = computePace(goal, { kind: 'value', actual: 7, lastUpdatedAt: null }, today);
  assert(asPace(ahead).status === 'ahead', `actual 7 vs expected ~6 should be ahead, got ${asPace(ahead).status}`);

  const onTrack = computePace(goal, { kind: 'value', actual: 5.5, lastUpdatedAt: null }, today);
  assert(asPace(onTrack).status === 'on-track', `actual 5.5 vs expected ~6 should be on-track, got ${asPace(onTrack).status}`);

  const behind = computePace(goal, { kind: 'value', actual: 4, lastUpdatedAt: null }, today);
  assert(asPace(behind).status === 'behind', `actual 4 vs expected ~6 should be behind, got ${asPace(behind).status}`);

  const atRisk = computePace(goal, { kind: 'value', actual: 1, lastUpdatedAt: null }, today);
  assert(asPace(atRisk).status === 'at-risk', `actual 1 vs expected ~6 should be at-risk, got ${asPace(atRisk).status}`);
}

// ---------- divide-by-zero guards (goal just started) ----------
{
  console.log('divide-by-zero guard at elapsed=0 (start of goal)');
  const goal = mkGoal({ start_date: '2026-01-01', target_date: '2026-12-31' });
  const today = new Date('2026-01-01T00:00:00');

  const zeroZero = computePace(goal, { kind: 'value', actual: 0, lastUpdatedAt: null }, today);
  assert(asPace(zeroZero).paceRatio === 1, `0 actual / 0 expected should read as neutral (ratio 1), got ${asPace(zeroZero).paceRatio}`);

  const someAlready = computePace(goal, { kind: 'value', actual: 3, lastUpdatedAt: null }, today);
  assert(asPace(someAlready).status === 'ahead', `any progress against 0 expected should be ahead, got ${asPace(someAlready).status}`);
  assert(
    asPace(someAlready).paceRatio !== Infinity && Number.isFinite(asPace(someAlready).paceRatio as number),
    'paceRatio must be capped, not Infinity',
  );
}

// ---------- direction: down (stay under a cap) ----------
{
  console.log('direction "down" inverts the ratio, not the thresholds');
  const goal = mkGoal({ type: 'value', direction: 'down', target: 25000, unit: '₹', start_date: '2026-09-01', target_date: '2026-09-30' });
  const today = new Date('2026-09-16T00:00:00'); // ~50% through the month, expected ~12500

  const wellUnder = computePace(goal, { kind: 'value', actual: 5000, lastUpdatedAt: null }, today);
  assert(asPace(wellUnder).status === 'ahead', `spending 5000 of an expected-under-12500 cap should be ahead, got ${asPace(wellUnder).status}`);

  const overCap = computePace(goal, { kind: 'value', actual: 20000, lastUpdatedAt: null }, today);
  assert(
    asPace(overCap).status === 'at-risk' || asPace(overCap).status === 'behind',
    `spending 20000 against an expected 12500 cap should read as behind/at-risk, got ${asPace(overCap).status}`,
  );

  const alreadyOverTarget = computePace(goal, { kind: 'value', actual: 26000, lastUpdatedAt: null }, today);
  assert(
    asPace(alreadyOverTarget).requiredRateLabel === null || asPace(alreadyOverTarget).requiredRateLabel !== 'Target reached',
    'a down-goal already over its cap must not read as "Target reached"',
  );
}

// ---------- open-ended (no target_date) ----------
{
  console.log('open-ended goal computes no pace');
  const goal = mkGoal({ target_date: null });
  const p = asPace(computePace(goal, { kind: 'value', actual: 4, lastUpdatedAt: null }, new Date('2026-06-01')));
  assert(p.status === 'no-deadline', `expected no-deadline, got ${p.status}`);
  assert(p.paceRatio === null, 'paceRatio must be null for an open-ended goal');
  assert(p.requiredRate === null, 'requiredRate must be null for an open-ended goal');
}

// ---------- achieved vs overdue ----------
{
  console.log('achieved and overdue requiredRate labels');
  const goal = mkGoal({ target: 10, start_date: '2026-01-01', target_date: '2026-06-30' });

  const achieved = asPace(computePace(goal, { kind: 'value', actual: 10, lastUpdatedAt: null }, new Date('2026-03-01')));
  assert(achieved.requiredRateLabel === 'Target reached', `expected "Target reached", got ${achieved.requiredRateLabel}`);
  assert(achieved.requiredRate === 0, 'requiredRate should be 0 once achieved');

  const overdue = asPace(computePace(goal, { kind: 'value', actual: 4, lastUpdatedAt: null }, new Date('2026-07-15')));
  assert(overdue.requiredRateLabel === 'Past target date', `expected "Past target date", got ${overdue.requiredRateLabel}`);
  assert(overdue.requiredRate === null, 'requiredRate should be null once overdue and not achieved');
}

// ---------- required-rate currency formatting ----------
{
  console.log('required-rate label uses currency formatting for ₹ units');
  const goal = mkGoal({
    type: 'value',
    target: 1000000,
    unit: '₹',
    start_date: '2026-01-01',
    target_date: '2026-12-31',
  });
  const p = asPace(computePace(goal, { kind: 'value', actual: 100000, lastUpdatedAt: null }, new Date('2026-07-02')));
  assert(
    !!p.requiredRateLabel && p.requiredRateLabel.startsWith('₹') && p.requiredRateLabel.includes(','),
    `expected an Indian-grouped ₹ required-rate label, got ${p.requiredRateLabel}`,
  );
}

// ---------- streak: current/best streak + trailing window ----------
{
  console.log('streak current/best streak and 4-week completion rate');
  const goal = mkGoal({ type: 'streak', target: 4, start_date: '2026-01-01', target_date: null });
  const today = new Date('2026-02-01T00:00:00');

  // done every day for the 5 days up to and including today, then a 3-day
  // gap further back that should NOT be part of the current streak.
  const completions = ['2026-01-28', '2026-01-29', '2026-01-30', '2026-01-31', '2026-02-01', '2026-01-10', '2026-01-11'];
  const p = asStreak(computePace(goal, { kind: 'streak', completions, lastUpdatedAt: '2026-02-01' }, today));
  assert(p.status === 'streak', `expected streak status, got ${p.status}`);
  assert(p.currentStreak === 5, `expected current streak 5, got ${p.currentStreak}`);
  assert(p.bestStreak >= 5, `best streak should be at least the current streak, got ${p.bestStreak}`);

  // today not yet logged — streak should count back from yesterday, not
  // read as broken.
  const noTodayYet = asStreak(
    computePace(goal, { kind: 'streak', completions: ['2026-01-30', '2026-01-31'], lastUpdatedAt: '2026-01-31' }, today),
  );
  assert(noTodayYet.currentStreak === 2, `open "today" shouldn't break the streak, expected 2, got ${noTodayYet.currentStreak}`);
}

// ---------- staleness ----------
{
  console.log('staleness guard');
  const goal = mkGoal({});
  const today = new Date('2026-06-01T00:00:00');

  const fresh = asPace(computePace(goal, { kind: 'value', actual: 3, lastUpdatedAt: '2026-05-20' }, today));
  assert(!fresh.stale, 'a 12-day-old update should not be flagged stale');

  const old = asPace(computePace(goal, { kind: 'value', actual: 3, lastUpdatedAt: '2026-03-01' }, today));
  assert(old.stale, 'a 92-day-old update should be flagged stale');

  const never = asPace(computePace(goal, { kind: 'value', actual: 0, lastUpdatedAt: null }, today));
  assert(!never.stale, 'a goal with no progress yet should not be flagged stale (nothing to go stale)');
}

console.log(failures === 0 ? '\nPASS' : `\nFAIL — ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
