import { FormEvent, useState } from 'react';
import { Icon } from '@/components/Icon';
import { errMessage } from '@/lib/errors';
import { dateKey, sparklineSeries } from './progress';
import { fractionLabel, paceStatusLabel } from './format';
import { GoalVerdict } from './GoalVerdict';
import { verdictOf, whyLine } from './goalSummary';
import { PaceDot } from './PaceDot';
import { ProgressBar } from './ProgressBar';
import { SavingsDetail, SavingsVerdict } from './SavingsPlan';
import { Sparkline } from './Sparkline';
import {
  useAddMilestone,
  useAddProgress,
  useDeleteGoal,
  useRemoveMilestone,
  useSaveGoal,
  useSavingsPlan,
  useSetGoalStatus,
  useToggleMilestone,
  useToggleStreakDay,
} from './hooks';
import type { Goal, GoalPace, GoalProgress, GoalSourceKind, GoalStatus } from './types';

const SOURCE_LABEL: Record<GoalSourceKind, string> = {
  manual: 'Manual',
  journal_streak: 'Journal streak',
  tasks_completed: 'Tasks completed',
  savings_target: 'Savings target (income − spend, from Expenses)',
};

/** An inactive goal has no pace to speak of -- its row says where it stands instead. */
const STATUS_WORD: Record<Exclude<GoalStatus, 'active'>, string> = {
  paused: 'Paused',
  achieved: 'Achieved',
  abandoned: 'Abandoned',
};

/** A goal row in three readings of the same goal:
 *   collapsed -- one scannable line: dot, title (+ at most one short "why"),
 *                compact progress, status label;
 *   expanded  -- three zones in a fixed order: VERDICT (the so-what, biggest),
 *                DETAIL (what backs it up, and any manual logging), ACTIONS
 *                (Edit toggle + lifecycle, quiet). */
export function GoalRow({
  goal,
  pace,
  progress,
}: {
  goal: Goal;
  /** for an active savings goal, `status` is already the plan's (see useGoalsWithPace) */
  pace: GoalPace | null;
  progress: GoalProgress[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
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
  // Enabled only for an active savings goal. It is the same cache entry the list
  // already fetched for the header status, so this costs no extra RPC.
  const planQuery = useSavingsPlan(goal);

  const [title, setTitle] = useState(goal.title);
  const [target, setTarget] = useState(String(goal.target));
  const [unit, setUnit] = useState(goal.unit ?? '');
  const [targetDate, setTargetDate] = useState(goal.target_date ?? '');

  const isActive = goal.status === 'active';
  const isMilestone = goal.type === 'milestone';
  const isStreak = goal.type === 'streak';
  const isManualSource = goal.source.kind === 'manual';
  const isSavings = goal.source.kind === 'savings_target';
  const doneCount = isMilestone ? (goal.milestones ?? []).filter((m) => m.done).length : 0;
  const actual = isMilestone ? doneCount : (pace?.actual ?? 0);
  const target_ = isMilestone ? (goal.milestones?.length ?? goal.target) : goal.target;
  const doneToday = progress.some((r) => r.goal_id === goal.id && r.occurred_on === todayKey);
  const streakDateDone = progress.some((r) => r.goal_id === goal.id && r.occurred_on === streakDate);

  const why = whyLine(goal, pace, planQuery.data);
  const statusLabel = !isActive ? STATUS_WORD[goal.status as Exclude<GoalStatus, 'active'>] : pace ? paceStatusLabel(pace.status) : 'Checklist';

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
      setEditing(false);
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

  // The sparkline reads the manual ledger (goal_progress). A computed goal
  // never writes one, so it would only ever show its empty state -- and that
  // read as "not enough history" right above a fully populated plan.
  const showSparkline = isManualSource || isMilestone;

  return (
    <div className="goal-row" data-status={goal.status}>
      <button type="button" className="goal-row-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {isActive && pace ? <PaceDot status={pace.status} /> : <span className="goal-pace-dot pace-no-deadline" aria-hidden="true" />}
        <span className="goal-row-titleblock">
          <span className="goal-row-title">{goal.title}</span>
          {why && <span className="goal-row-why">{why}</span>}
        </span>
        <span className="goal-row-mid">
          {!isStreak && <ProgressBar actual={actual} target={target_} status={isActive ? (pace?.status ?? 'no-deadline') : 'no-deadline'} />}
          <span className="goal-row-fraction">
            {isStreak && pace
              ? `${Math.round(pace.actual)} / ${Math.round(pace.expectedByToday ?? 0)} in the last 4 weeks`
              : fractionLabel(goal, actual)}
          </span>
        </span>
        <span className="goal-row-pacelabel">{statusLabel}</span>
        <Icon name="chevron" size={13} className={open ? 'goal-row-chevron open' : 'goal-row-chevron'} />
      </button>

      {open && (
        <div className="goal-row-body">
          {/* ZONE 1 — verdict */}
          <section className="goal-zone goal-zone-verdict" aria-label="Verdict">
            {isSavings && isActive ? <SavingsVerdict query={planQuery} /> : <GoalVerdict {...verdictOf(goal, pace)} />}
          </section>

          {/* ZONE 2 — detail */}
          <section className="goal-zone goal-zone-detail" aria-label="Detail">
            {showSparkline && (
              <div className="goal-row-spark">
                <Sparkline series={sparklineSeries(goal, progress)} />
              </div>
            )}

            {isSavings && isActive && <SavingsDetail query={planQuery} />}

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
                            disabled={!isActive}
                            onChange={() => toggleMilestone.mutate({ goal, milestoneId: m.id })}
                          />
                          {m.label}
                        </label>
                        {isActive && (
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
                {isActive && (
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

            {(goal.type === 'count' || goal.type === 'value') && isActive && isManualSource && (
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

            {goal.type === 'streak' && isActive && isManualSource && (
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

            {/* reassurance, not a headline */}
            <p className="goal-note">
              Source: {SOURCE_LABEL[goal.source.kind]}.
              {!isManualSource && !isMilestone && isActive && ' Tracked automatically — no manual logging needed.'}
            </p>
          </section>

          {error && <p className="field err">{error}</p>}

          {/* ZONE 3 — actions */}
          <section className="goal-zone goal-zone-actions" aria-label="Actions">
            <div className="goal-actions">
              <button className="btn ghost sm" type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
                {editing ? 'Close edit' : 'Edit'}
              </button>
              {isActive && (
                <>
                  <button className="btn ghost sm" type="button" onClick={() => setStatus.mutate({ id: goal.id, status: 'paused' })}>
                    Pause
                  </button>
                  <button className="btn ghost sm" type="button" onClick={() => setStatus.mutate({ id: goal.id, status: 'achieved' })}>
                    Mark achieved
                  </button>
                </>
              )}
              {goal.status === 'paused' && (
                <button className="btn ghost sm" type="button" onClick={() => setStatus.mutate({ id: goal.id, status: 'active' })}>
                  Resume
                </button>
              )}
              {(isActive || goal.status === 'paused') && (
                <button
                  className="btn ghost sm goal-abandon"
                  type="button"
                  onClick={() => setStatus.mutate({ id: goal.id, status: 'abandoned' })}
                >
                  Abandon
                </button>
              )}
              {(goal.status === 'achieved' || goal.status === 'abandoned') && (
                <button className="btn ghost sm goal-abandon" type="button" onClick={() => deleteGoal.mutate(goal.id)}>
                  Delete
                </button>
              )}
            </div>

            {editing && (
              <div className="goal-edit">
                <div className="field-row">
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
                {dirty && (
                  <button className="btn sec sm" type="button" onClick={saveEdits} disabled={saveGoal.isPending || !title.trim()}>
                    Save changes
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
