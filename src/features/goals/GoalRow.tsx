import { FormEvent, useState } from 'react';
import { Icon } from '@/components/Icon';
import { errMessage } from '@/lib/errors';
import { dateKey } from './pace';
import { fractionLabel } from './format';
import { sparklineSeries } from './progress';
import { PaceDot } from './PaceDot';
import { ProgressBar } from './ProgressBar';
import { Sparkline } from './Sparkline';
import {
  useAddMilestone,
  useAddProgress,
  useDeleteGoal,
  useRemoveMilestone,
  useSaveGoal,
  useSetGoalStatus,
  useToggleMilestone,
  useToggleStreakDay,
} from './hooks';
import type { Goal, GoalProgress, Pace, StreakPace } from './types';

function paceLabel(pace: Pace | StreakPace): string {
  switch (pace.status) {
    case 'ahead':
      return 'Ahead';
    case 'on-track':
      return 'On track';
    case 'behind':
      return 'Behind';
    case 'at-risk':
      return 'At risk';
    case 'streak':
      return `${pace.currentStreak}-day streak`;
    case 'no-deadline':
      return 'No deadline';
  }
}

export function GoalRow({
  goal,
  pace,
  progress,
}: {
  goal: Goal;
  pace: Pace | StreakPace;
  progress: GoalProgress[];
}) {
  const [open, setOpen] = useState(false);
  const todayKey = dateKey(new Date());
  const [logAmount, setLogAmount] = useState('1');
  const [logDate, setLogDate] = useState(todayKey);
  const [streakDate, setStreakDate] = useState(todayKey);
  const [newMilestone, setNewMilestone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addProgress = useAddProgress();
  const setStatus = useSetGoalStatus();
  const deleteGoal = useDeleteGoal();
  const toggleMilestone = useToggleMilestone();
  const addMilestone = useAddMilestone();
  const removeMilestone = useRemoveMilestone();
  const toggleStreak = useToggleStreakDay();
  const saveGoal = useSaveGoal();

  const [title, setTitle] = useState(goal.title);
  const [target, setTarget] = useState(String(goal.target));
  const [unit, setUnit] = useState(goal.unit ?? '');
  const [targetDate, setTargetDate] = useState(goal.target_date ?? '');

  const isStreak = pace.status === 'streak';
  const doneCount = goal.type === 'milestone' ? (goal.milestones ?? []).filter((m) => m.done).length : 0;
  const actual = isStreak ? doneCount : (pace as Pace).actual;
  const target_ = goal.type === 'milestone' ? (goal.milestones?.length ?? goal.target) : goal.target;
  const doneToday = progress.some((r) => r.goal_id === goal.id && r.occurred_on === todayKey);
  const streakDateDone = progress.some((r) => r.goal_id === goal.id && r.occurred_on === streakDate);

  // milestone target is derived from the checklist length (kept in sync by
  // setMilestones) and its input stays disabled, so it's never part of "dirty"
  const dirty =
    title.trim() !== goal.title ||
    (goal.type !== 'milestone' && Number(target) !== goal.target) ||
    (unit || null) !== goal.unit ||
    (targetDate || null) !== goal.target_date;

  async function saveEdits() {
    setError(null);
    try {
      await saveGoal.mutateAsync({
        id: goal.id,
        title,
        type: goal.type,
        target: goal.type === 'milestone' ? goal.target : Number(target) || goal.target,
        unit: unit || null,
        direction: goal.direction,
        start_date: goal.start_date,
        target_date: targetDate || null,
        module_id: goal.module_id,
      });
    } catch (err) {
      setError(errMessage(err, 'Could not save changes.'));
    }
  }

  async function logProgress(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(logAmount);
    if (!Number.isFinite(value) || value === 0) return;
    try {
      await addProgress.mutateAsync({ goalId: goal.id, value, occurredOn: logDate });
      setLogAmount('1');
    } catch (err) {
      setError(errMessage(err, 'Could not log progress.'));
    }
  }

  async function submitMilestone(e: FormEvent) {
    e.preventDefault();
    if (!newMilestone.trim()) return;
    setError(null);
    try {
      await addMilestone.mutateAsync({ goal, label: newMilestone });
      setNewMilestone('');
    } catch (err) {
      setError(errMessage(err, 'Could not add the step.'));
    }
  }

  return (
    <div className="goal-row" data-status={goal.status}>
      <button type="button" className="goal-row-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <PaceDot pace={pace} />
        <span className="goal-row-title">{goal.title}</span>
        <span className="goal-row-mid">
          {!isStreak && <ProgressBar actual={actual} target={target_} status={pace.status} />}
          <span className="goal-row-fraction">
            {isStreak
              ? `${(pace as StreakPace).currentStreak}-day streak · best ${(pace as StreakPace).bestStreak}`
              : fractionLabel(goal, actual)}
          </span>
        </span>
        <span className="goal-row-pacelabel">{paceLabel(pace)}</span>
        <Icon name="chevron" size={13} className={open ? 'goal-row-chevron open' : 'goal-row-chevron'} />
      </button>

      {open && (
        <div className="goal-row-body">
          <div className="goal-row-spark">
            <Sparkline series={sparklineSeries(goal, progress)} />
          </div>

          {!isStreak && (pace as Pace).requiredRateLabel && (
            <p className="goal-row-required">{(pace as Pace).requiredRateLabel}</p>
          )}
          {isStreak && (
            <p className="goal-row-required">
              Trailing 4 weeks: {Math.round((pace as StreakPace).completionRate4wk * 100)}% of target
            </p>
          )}
          <p className="goal-row-source">Source: Manual</p>

          {goal.type === 'milestone' && (
            <>
              <ul className="goal-milestones">
                {(goal.milestones ?? [])
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((m) => (
                    <li key={m.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={m.done}
                          disabled={goal.status !== 'active'}
                          onChange={() => toggleMilestone.mutate({ goal, milestoneId: m.id })}
                        />
                        {m.label}
                      </label>
                      {goal.status === 'active' && (
                        <button
                          type="button"
                          className="btn ghost sm"
                          aria-label={`Remove ${m.label}`}
                          onClick={() => removeMilestone.mutate({ goal, milestoneId: m.id })}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
              {goal.status === 'active' && (
                <form className="goal-log" onSubmit={submitMilestone}>
                  <input
                    className="input"
                    value={newMilestone}
                    onChange={(e) => setNewMilestone(e.target.value)}
                    placeholder="Add a step"
                  />
                  <button className="btn sec sm" type="submit" disabled={addMilestone.isPending || !newMilestone.trim()}>
                    Add
                  </button>
                </form>
              )}
            </>
          )}

          {(goal.type === 'count' || goal.type === 'value') && goal.status === 'active' && (
            <form className="goal-log" onSubmit={logProgress}>
              <input
                className="input goal-log-input"
                type="number"
                step="any"
                value={logAmount}
                onChange={(e) => setLogAmount(e.target.value)}
                aria-label="Amount to log"
              />
              <input
                className="input goal-log-date"
                type="date"
                value={logDate}
                max={todayKey}
                onChange={(e) => setLogDate(e.target.value)}
                aria-label="Date to log against"
              />
              <button className="btn sec sm" type="submit" disabled={addProgress.isPending}>
                Log progress
              </button>
            </form>
          )}

          {goal.type === 'streak' && goal.status === 'active' && (
            <div className="goal-log">
              <button
                type="button"
                className={doneToday ? 'btn primary sm' : 'btn sec sm'}
                onClick={() => toggleStreak.mutate({ goalId: goal.id, occurredOn: todayKey })}
                disabled={toggleStreak.isPending}
              >
                {doneToday ? 'Done today ✓' : 'Mark today done'}
              </button>
              <input
                className="input goal-log-date"
                type="date"
                value={streakDate}
                max={todayKey}
                onChange={(e) => setStreakDate(e.target.value)}
                aria-label="Another day to mark"
              />
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => toggleStreak.mutate({ goalId: goal.id, occurredOn: streakDate })}
                disabled={toggleStreak.isPending || streakDate === todayKey}
              >
                {streakDateDone ? 'Unmark that day' : 'Mark that day done'}
              </button>
            </div>
          )}

          <div className="goal-edit field-row">
            <div className="field">
              <label htmlFor={`title-${goal.id}`}>Title</label>
              <input id={`title-${goal.id}`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`target-${goal.id}`}>Target</label>
              <input
                id={`target-${goal.id}`}
                className="input"
                type="number"
                value={goal.type === 'milestone' ? goal.target : target}
                disabled={goal.type === 'milestone'}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`unit-${goal.id}`}>Unit</label>
              <input id={`unit-${goal.id}`} className="input" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`due-${goal.id}`}>Target date</label>
              <input
                id={`due-${goal.id}`}
                className="input"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="field err">{error}</p>}
          {dirty && (
            <button className="btn sec sm" type="button" onClick={saveEdits} disabled={saveGoal.isPending || !title.trim()}>
              Save changes
            </button>
          )}

          <div className="goal-row-actions">
            {goal.status === 'active' && (
              <>
                <button className="btn sec sm" type="button" onClick={() => setStatus.mutate({ id: goal.id, status: 'paused' })}>
                  Pause
                </button>
                <button
                  className="btn sec sm"
                  type="button"
                  onClick={() => setStatus.mutate({ id: goal.id, status: 'achieved' })}
                >
                  Mark achieved
                </button>
              </>
            )}
            {goal.status === 'paused' && (
              <button className="btn sec sm" type="button" onClick={() => setStatus.mutate({ id: goal.id, status: 'active' })}>
                Resume
              </button>
            )}
            {(goal.status === 'active' || goal.status === 'paused') && (
              <button
                className="btn neg sm"
                type="button"
                onClick={() => setStatus.mutate({ id: goal.id, status: 'abandoned' })}
              >
                Abandon
              </button>
            )}
            {(goal.status === 'achieved' || goal.status === 'abandoned') && (
              <button className="btn ghost sm" type="button" onClick={() => deleteGoal.mutate(goal.id)}>
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
