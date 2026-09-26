import { FormEvent, useState } from 'react';
import { Icon } from '@/components/Icon';
import { errMessage } from '@/lib/errors';
import { shortDate } from '@/lib/format';
import { dateKey, sparklineSeries } from './progress';
import { fractionLabel, formatAmount, paceStatusLabel } from './format';
import { PaceDot } from './PaceDot';
import { ProgressBar } from './ProgressBar';
import { SavingsPlan } from './SavingsPlan';
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
import type { Goal, GoalPace, GoalProgress, GoalSourceKind } from './types';

const SOURCE_LABEL: Record<GoalSourceKind, string> = {
  manual: 'Manual',
  journal_streak: 'Journal streak',
  tasks_completed: 'Tasks completed',
  savings_target: 'Savings target (income − spend, from Expenses)',
};

export function GoalRow({
  goal,
  pace,
  progress,
}: {
  goal: Goal;
  pace: GoalPace | null;
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

  const isMilestone = goal.type === 'milestone';
  const isStreak = goal.type === 'streak';
  const isManualSource = goal.source.kind === 'manual';
  const isSavings = goal.source.kind === 'savings_target';
  const doneCount = isMilestone ? (goal.milestones ?? []).filter((m) => m.done).length : 0;
  const actual = isMilestone ? doneCount : (pace?.actual ?? 0);
  const target_ = isMilestone ? (goal.milestones?.length ?? goal.target) : goal.target;
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
        {pace && <PaceDot status={pace.status} />}
        <span className="goal-row-title">{goal.title}</span>
        <span className="goal-row-mid">
          {!isStreak && <ProgressBar actual={actual} target={target_} status={pace?.status ?? 'no-deadline'} />}
          <span className="goal-row-fraction">
            {isStreak && pace
              ? `${Math.round(pace.actual)} / ${Math.round(pace.expectedByToday ?? 0)} in the last 4 weeks`
              : fractionLabel(goal, actual)}
          </span>
        </span>
        <span className="goal-row-pacelabel">{pace ? paceStatusLabel(pace.status) : 'Checklist'}</span>
        <Icon name="chevron" size={13} className={open ? 'goal-row-chevron open' : 'goal-row-chevron'} />
      </button>

      {open && (
        <div className="goal-row-body">
          <div className="goal-row-spark">
            <Sparkline series={sparklineSeries(goal, progress)} />
          </div>

          {/* goal_pace's linear "expected by today" is knowingly wrong for a lump-sum
              salary, so a savings goal shows the plain net and leaves the projection
              to the plan below. */}
          {pace && isSavings && (
            <p className="goal-row-required">
              Net so far this month: {formatAmount(pace.actual, goal.unit)} of {formatAmount(goal.target, goal.unit)}
            </p>
          )}
          {pace && !isSavings && (
            <p className="goal-row-required">
              Expected by today: {pace.expectedByToday != null ? formatAmount(pace.expectedByToday, goal.unit) : '—'}
              {' · '}Actual: {formatAmount(pace.actual, goal.unit)}
              {pace.projectedEnd && <> · Projected: {shortDate(`${pace.projectedEnd}T00:00:00`)}</>}
            </p>
          )}
          {!isManualSource && !isMilestone && goal.status === 'active' && (
            <p className="goal-row-required">Tracked automatically — no manual logging needed.</p>
          )}
          <p className="goal-row-source">Source: {SOURCE_LABEL[goal.source.kind]}</p>

          {isSavings && goal.status === 'active' && <SavingsPlan goal={goal} />}

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

          {(goal.type === 'count' || goal.type === 'value') && goal.status === 'active' && isManualSource && (
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

          {goal.type === 'streak' && goal.status === 'active' && isManualSource && (
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
            {/* a monthly savings goal renews itself -- a deadline would do nothing */}
            {!isSavings && (
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
            )}
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
