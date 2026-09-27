import { FormEvent, useState } from 'react';
import { Icon } from '@/components/Icon';
import { errMessage } from '@/lib/errors';
import type { SheetRequest } from '@/features/reminders/ReminderSheet';
import {
  emptyScheduleValue,
  scheduleValueFromReminder,
  scheduleValueToFields,
  type ScheduleValue,
} from '@/features/reminders/ScheduleFields';
import { describeScheduleShort } from '@/features/reminders/schedule';
import {
  useCreateReminder,
  useRemindersToday,
  useReminderRules,
  useUpcoming,
  useUpdateReminder,
} from '@/features/reminders/hooks';
import { dateKey, sparklineSeries } from './progress';
import { fractionLabel, paceStatusLabel } from './format';
import { GoalVerdict } from './GoalVerdict';
import { verdictOf, whyLine } from './goalSummary';
import { PaceDot } from './PaceDot';
import { ProgressBar } from './ProgressBar';
import { RemindMeRow } from './RemindMeRow';
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
  onOpenReminderSheet,
  onGoalDeleted,
}: {
  goal: Goal;
  /** for an active savings goal, `status` is already the plan's (see useGoalsWithPace) */
  pace: GoalPace | null;
  progress: GoalProgress[];
  onOpenReminderSheet: (req: SheetRequest) => void;
  /** called right after a successful delete, only when the goal had a
   *  (non-archived) linked reminder -- the row is gone by then, so the
   *  parent is what shows the "kept" notice. */
  onGoalDeleted: (info: { id: string; title: string }) => void;
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

  // ---------- reminder link (R6) ----------
  // Streak goals, manual count goals, and journal_streak goals (whose
  // reminder completes itself) can carry a "Remind me" reminder. Value and
  // milestone goals, and any other computed source, can't.
  const isJournalStreak = goal.source.kind === 'journal_streak';
  const canRemind = isActive && (isStreak || (goal.type === 'count' && isManualSource) || isJournalStreak);

  const { data: allReminders } = useReminderRules();
  const { data: todayReminders } = useRemindersToday();
  const { data: upcomingReminders } = useUpcoming();
  const createReminder = useCreateReminder();
  const updateReminder = useUpdateReminder();
  const linkedReminder = allReminders?.find((r) => r.goal_id === goal.id && r.status !== 'archived');

  const [remindMe, setRemindMe] = useState(!!linkedReminder);
  const [schedule, setSchedule] = useState<ScheduleValue>(() =>
    linkedReminder ? scheduleValueFromReminder(linkedReminder, todayKey) : emptyScheduleValue(isStreak ? 'daily' : 'custom', todayKey),
  );

  function startEditing() {
    setEditing(true);
    setRemindMe(!!linkedReminder);
    setSchedule(
      linkedReminder
        ? scheduleValueFromReminder(linkedReminder, todayKey)
        : emptyScheduleValue(isStreak ? 'daily' : 'custom', todayKey),
    );
  }

  const scheduleDirty =
    remindMe &&
    linkedReminder &&
    JSON.stringify({ ...schedule, weekdays: [...schedule.weekdays].sort() }) !==
      JSON.stringify({ ...scheduleValueFromReminder(linkedReminder, todayKey), weekdays: [...(linkedReminder.weekdays ?? [])].sort() });
  const remindMeDirty = canRemind && (remindMe !== !!linkedReminder || scheduleDirty);

  // next occurrence: today's own row (if not already done) beats the
  // nearest upcoming one -- both already server-computed, no date math here.
  const todayRow = todayReminders?.find((r) => r.id === linkedReminder?.id);
  const nextUpcoming = upcomingReminders?.find((r) => r.id === linkedReminder?.id);
  const nextOccurrenceLabel = todayRow && !todayRow.is_done ? 'today' : nextUpcoming ? nextUpcoming.occurrence_date : null;

  // milestone target is derived from the checklist length (kept in sync by
  // setMilestones) and its input stays disabled, so it's never part of "dirty"
  const dirty =
    title.trim() !== goal.title ||
    (goal.type !== 'milestone' && Number(target) !== goal.target) ||
    (unit || null) !== goal.unit ||
    (targetDate || null) !== goal.target_date ||
    remindMeDirty;

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

      if (remindMeDirty && remindMe) {
        const f = scheduleValueToFields(schedule);
        const satisfiedBy = isJournalStreak ? ('office_journal' as const) : null;
        if (linkedReminder) {
          await updateReminder.mutateAsync({
            id: linkedReminder.id,
            patch: { ...f, satisfied_by: satisfiedBy },
          });
        } else {
          await createReminder.mutateAsync({
            title: title.trim(),
            notes: '',
            kind: 'recurring',
            goal_id: goal.id,
            due_date: null,
            due_time: null,
            freq: f.freq,
            weekdays: f.weekdays,
            month_day: f.month_day,
            interval_n: f.interval_n,
            time_of_day: f.time_of_day,
            start_date: f.start_date || todayKey,
            end_date: f.end_date,
            satisfied_by: satisfiedBy,
            counts_as_task: false,
          });
        }
      }

      setEditing(false);
    } catch (err) {
      setError(errMessage(err, 'Could not save changes.'));
    }
  }

  async function handleDelete() {
    const reminderToKeep = linkedReminder ? { id: linkedReminder.id, title: linkedReminder.title } : null;
    await deleteGoal.mutateAsync(goal.id);
    if (reminderToKeep) onGoalDeleted(reminderToKeep);
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

            {linkedReminder && (
              <p className="goal-reminder-line">
                Reminder · {describeScheduleShort(linkedReminder)} · {linkedReminder.satisfied_by ? 'auto' : 'tick'}
                {nextOccurrenceLabel && ` · next ${nextOccurrenceLabel}`}
                {' — '}
                <button
                  type="button"
                  className="goal-reminder-edit"
                  onClick={() => onOpenReminderSheet({ kind: 'edit', reminder: linkedReminder })}
                >
                  Edit
                </button>
              </p>
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
              <button className="btn ghost sm" type="button" onClick={() => (editing ? setEditing(false) : startEditing())} aria-expanded={editing}>
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
                <button className="btn ghost sm goal-abandon" type="button" onClick={() => void handleDelete()}>
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

                {canRemind && (
                  <RemindMeRow
                    checked={remindMe}
                    onToggle={setRemindMe}
                    value={schedule}
                    onChange={(patch) => setSchedule((prev) => ({ ...prev, ...patch }))}
                    autoNote={isJournalStreak ? 'Completes itself when you write the journal.' : undefined}
                  />
                )}

                {dirty && (
                  <button
                    className="btn sec sm"
                    type="button"
                    onClick={saveEdits}
                    disabled={saveGoal.isPending || createReminder.isPending || updateReminder.isPending || !title.trim()}
                  >
                    {createReminder.isPending || updateReminder.isPending ? 'Saving…' : 'Save changes'}
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
