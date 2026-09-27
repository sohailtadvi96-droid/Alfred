import { forwardRef, FormEvent, useState } from 'react';
import * as RD from '@radix-ui/react-dialog';
import { errMessage } from '@/lib/errors';
import { SwitchRow } from '@/components/SwitchRow';
import { useGoals } from '@/features/goals/hooks';
import { useCreateReminder, useUpdateReminder, useUserToday } from './hooks';
import { describeSchedule, type ReminderDraftErrors, validateDraft } from './schedule';
import { modeToFreq, sameDaySet, scheduleModeFor, ScheduleFields, type ScheduleMode } from './ScheduleFields';
import type { Reminder, ReminderDraft, ReminderSatisfiedBy } from './types';

export type SheetRequest = { kind: 'create'; prefillTitle?: string } | { kind: 'edit'; reminder: Reminder };

interface FormState {
  kind: 'one_time' | 'recurring';
  title: string;
  notes: string;
  notesOpen: boolean;
  goalId: string;
  countsAsTask: boolean;
  countsAsTaskTouched: boolean;
  // one_time
  dueDate: string;
  dueTime: string;
  // recurring (shape matches ScheduleFields' ScheduleValue)
  scheduleMode: ScheduleMode;
  weekdays: number[];
  monthDay: string;
  intervalN: string;
  timeOfDay: string;
  startDate: string;
  noEnd: boolean;
  endDate: string;
  satisfiedBy: ReminderSatisfiedBy | '';
}

function initialState(request: SheetRequest, today: string): FormState {
  if (request.kind === 'edit') {
    const r = request.reminder;
    return {
      kind: r.kind,
      title: r.title,
      notes: r.notes ?? '',
      notesOpen: !!r.notes,
      goalId: r.goal_id ?? '',
      countsAsTask: r.counts_as_task,
      countsAsTaskTouched: true,
      dueDate: r.due_date ?? today,
      dueTime: r.due_time ?? '',
      scheduleMode: r.kind === 'recurring' ? scheduleModeFor(r) : 'daily',
      weekdays: r.weekdays ?? [],
      monthDay: r.month_day ? String(r.month_day) : '',
      intervalN: r.interval_n && r.interval_n >= 2 ? String(r.interval_n) : '2',
      timeOfDay: r.time_of_day ?? '',
      startDate: r.start_date ?? today,
      noEnd: !r.end_date,
      endDate: r.end_date ?? '',
      satisfiedBy: r.satisfied_by ?? '',
    };
  }
  return {
    kind: 'one_time',
    title: request.prefillTitle ?? '',
    notes: '',
    notesOpen: false,
    goalId: '',
    countsAsTask: true,
    countsAsTaskTouched: false,
    dueDate: today,
    dueTime: '',
    scheduleMode: 'daily',
    weekdays: [],
    monthDay: '',
    intervalN: '2',
    timeOfDay: '',
    startDate: today,
    noEnd: true,
    endDate: '',
    satisfiedBy: '',
  };
}

function buildDraft(s: FormState): ReminderDraft {
  const freq = s.kind === 'recurring' ? modeToFreq(s.scheduleMode) : null;
  const weekdays = s.scheduleMode === 'weekdays' ? [1, 2, 3, 4, 5] : s.scheduleMode === 'custom' ? s.weekdays : [];
  return {
    title: s.title,
    notes: s.notes,
    kind: s.kind,
    goal_id: s.goalId || null,
    counts_as_task: s.countsAsTask,
    due_date: s.kind === 'one_time' ? s.dueDate || null : null,
    due_time: s.kind === 'one_time' ? s.dueTime || null : null,
    freq,
    interval_n: s.scheduleMode === 'every_n_days' ? Math.max(2, Number(s.intervalN) || 2) : 1,
    weekdays,
    month_day: s.scheduleMode === 'monthly' ? Number(s.monthDay) || null : null,
    time_of_day: s.kind === 'recurring' ? s.timeOfDay || null : null,
    start_date: s.kind === 'recurring' ? s.startDate || null : null,
    end_date: s.kind === 'recurring' && !s.noEnd ? s.endDate || null : null,
    satisfied_by: s.kind === 'recurring' ? s.satisfiedBy || null : null,
  };
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`field${error ? ' bad' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="err">{error}</span>}
    </div>
  );
}

export function ReminderSheet({ request, onClose }: { request: SheetRequest | null; onClose: () => void }) {
  return (
    <RD.Root open={!!request} onOpenChange={(v) => !v && onClose()}>
      <RD.Portal>
        <RD.Overlay className="rem-sheet-overlay" />
        {request && (
          <ReminderSheetForm
            key={request.kind === 'edit' ? request.reminder.id : 'create'}
            request={request}
            onClose={onClose}
          />
        )}
      </RD.Portal>
    </RD.Root>
  );
}

// Radix's DialogPortal clones its single child to attach a ref (for focus
// trapping/exit-animation bookkeeping) -- a plain function component here
// can't accept that ref and React warns, so this forwards it straight
// through to the actual DOM node (RD.Content).
const ReminderSheetForm = forwardRef<HTMLDivElement, { request: SheetRequest; onClose: () => void }>(
  function ReminderSheetForm({ request, onClose }, ref) {
  const { data: today } = useUserToday();
  const { data: allGoals } = useGoals();
  const create = useCreateReminder();
  const update = useUpdateReminder();

  const [s, setS] = useState<FormState>(() => initialState(request, today ?? ''));
  const [fieldErrors, setFieldErrors] = useState<ReminderDraftErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const isEdit = request.kind === 'edit';
  const original = isEdit ? request.reminder : null;

  function patchState(next: Partial<FormState>) {
    setS((prev) => ({ ...prev, ...next }));
  }

  function setKind(kind: 'one_time' | 'recurring') {
    patchState({ kind, ...(s.countsAsTaskTouched ? {} : { countsAsTask: kind === 'one_time' }) });
  }

  function setCountsAsTask(v: boolean) {
    patchState({ countsAsTask: v, countsAsTaskTouched: true });
  }

  function onGoalChange(id: string) {
    const goal = (allGoals ?? []).find((g) => g.id === id);
    patchState({
      goalId: id,
      ...(goal?.source.kind === 'journal_streak' && s.kind === 'recurring' ? { satisfiedBy: 'office_journal' } : {}),
    });
  }

  const currentFreq = s.kind === 'recurring' ? modeToFreq(s.scheduleMode) : null;
  const currentWeekdays = s.scheduleMode === 'weekdays' ? [1, 2, 3, 4, 5] : s.scheduleMode === 'custom' ? s.weekdays : [];
  const scheduleChanged =
    isEdit &&
    original?.kind === 'recurring' &&
    (original.freq !== currentFreq ||
      !sameDaySet(original.weekdays ?? [], currentWeekdays) ||
      (currentFreq === 'monthly' && original.month_day !== (Number(s.monthDay) || null)) ||
      (currentFreq === 'every_n_days' && original.interval_n !== Math.max(2, Number(s.intervalN) || 2)));

  const draft = buildDraft(s);
  const goalOptions = (allGoals ?? []).filter((g) => g.status === 'active' || g.id === s.goalId);
  // A tick only ever feeds a manual streak/count goal or shows as "auto" for
  // a journal_streak one (0044) -- any other computed source (tasks_completed,
  // savings_target) or a manual value/milestone goal can't use a reminder at
  // all, so it's offered disabled rather than silently doing nothing if picked.
  const eligibleGoals = goalOptions.filter(
    (g) => (g.source.kind === 'manual' && (g.type === 'streak' || g.type === 'count')) || g.source.kind === 'journal_streak',
  );
  const ineligibleGoals = goalOptions.filter((g) => !eligibleGoals.includes(g));
  const linkedGoalTitle = s.goalId ? goalOptions.find((g) => g.id === s.goalId)?.title : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errors = validateDraft(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      if (!isEdit) {
        await create.mutateAsync(draft);
      } else {
        const patch: Partial<ReminderDraft> = { ...draft };
        if (scheduleChanged && today) patch.start_date = today;
        await update.mutateAsync({ id: original!.id, patch });
      }
      onClose();
    } catch (err) {
      setServerError(errMessage(err, 'Could not save this reminder.'));
    }
  }

  const saving = create.isPending || update.isPending;

  return (
    <RD.Content ref={ref} className="rem-sheet" aria-describedby={undefined}>
      <div className="rem-sheet-head">
        <div className="rem-sheet-crumb">06 / REMINDERS</div>
        <RD.Title asChild>
          <div className="rem-sheet-title">{isEdit ? 'Edit reminder' : 'New reminder'}</div>
        </RD.Title>
      </div>

      <form id="reminder-sheet-form" className="rem-sheet-body" onSubmit={onSubmit}>
        <div className="field">
          <label>Type</label>
          {isEdit ? (
            <div className="rem-type-readonly">{s.kind === 'one_time' ? 'One-time' : 'Repeating'}</div>
          ) : (
            <div className="seg">
              <button type="button" className={s.kind === 'one_time' ? 'on' : ''} onClick={() => setKind('one_time')}>
                One-time
              </button>
              <button type="button" className={s.kind === 'recurring' ? 'on' : ''} onClick={() => setKind('recurring')}>
                Repeating
              </button>
            </div>
          )}
        </div>

        <Field label="Title" htmlFor="rem-title">
          <input
            id="rem-title"
            className="input"
            value={s.title}
            onChange={(e) => patchState({ title: e.target.value })}
            placeholder="e.g. Call Rahul"
            autoFocus
          />
        </Field>

        {s.notesOpen ? (
          <Field label="Notes" htmlFor="rem-notes">
            <input
              id="rem-notes"
              className="input"
              value={s.notes}
              onChange={(e) => patchState({ notes: e.target.value })}
              placeholder="Optional"
            />
          </Field>
        ) : (
          <button type="button" className="rem-add-note" onClick={() => patchState({ notesOpen: true })}>
            + Add note
          </button>
        )}

        {s.kind === 'one_time' ? (
          <div className="field-row">
            <Field label="Date" htmlFor="rem-due-date" error={fieldErrors.due_date}>
              <input
                id="rem-due-date"
                type="date"
                className="input"
                value={s.dueDate}
                onChange={(e) => patchState({ dueDate: e.target.value })}
              />
            </Field>
            <Field label="Time (optional)" htmlFor="rem-due-time">
              <input
                id="rem-due-time"
                type="time"
                className="input"
                value={s.dueTime}
                onChange={(e) => patchState({ dueTime: e.target.value })}
              />
            </Field>
          </div>
        ) : (
          <>
            <ScheduleFields
              value={s}
              onChange={patchState}
              errors={fieldErrors}
              summarySuffix={linkedGoalTitle ? ` → ${linkedGoalTitle}` : undefined}
            />

            <Field label="Done automatically when" htmlFor="rem-satisfied-by">
              <select
                id="rem-satisfied-by"
                className="input"
                value={s.satisfiedBy}
                onChange={(e) => patchState({ satisfiedBy: e.target.value as ReminderSatisfiedBy | '' })}
              >
                <option value="">Never — I tick it myself</option>
                <option value="office_journal">Today's journal is written</option>
              </select>
            </Field>

            {scheduleChanged && (
              <div className="rem-warn">Changing the days restarts this streak.</div>
            )}
          </>
        )}

        <Field label="Link to goal" htmlFor="rem-goal">
          <select id="rem-goal" className="input" value={s.goalId} onChange={(e) => onGoalChange(e.target.value)}>
            <option value="">None</option>
            {eligibleGoals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
            {ineligibleGoals.map((g) => (
              <option key={g.id} value={g.id} disabled>
                {g.title} — Tracks itself — ticks don't feed it
              </option>
            ))}
          </select>
        </Field>

        <SwitchRow
          id="rem-counts-as-task"
          label="Counts as a task"
          hint="Counts toward the 15 tasks/week goal when on."
          checked={s.countsAsTask}
          onChange={setCountsAsTask}
        />

        {s.kind === 'one_time' && (
          <div className="rem-summary">
            <div>
              {describeSchedule(draft)}
              {linkedGoalTitle ? ` → ${linkedGoalTitle}` : ''}
            </div>
          </div>
        )}

        {serverError && <div className="rem-server-error">{serverError}</div>}
      </form>

      <div className="rem-sheet-footer">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" form="reminder-sheet-form" className="btn primary" disabled={saving || !s.title.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </RD.Content>
  );
  },
);
