export type ReminderKind = 'one_time' | 'recurring';
export type ReminderFreq = 'daily' | 'weekly' | 'monthly' | 'every_n_days';
export type ReminderStatus = 'active' | 'paused' | 'archived';
export type ReminderChannel = 'rail' | 'telegram' | 'email' | 'webpush';
/** Whitelisted at the DB (reminders_satisfied_by_check, 0040). The only
 *  module wired up so far — reminder_satisfied (0041) dispatches on it. */
export type ReminderSatisfiedBy = 'office_journal';
export type ReminderCompletionStatus = 'done' | 'skipped' | 'excused';
export type ReminderDoneVia = 'tick' | 'module';
export type ReminderDueState = 'later' | 'due_now' | 'overdue' | 'done';

/** reminders table row -- mirrors 0040's altered shape (the 0033 goal-nudge
 *  columns replaced with these). user_id is never surfaced to the client,
 *  same as Goal/OfficeTask. */
export interface Reminder {
  id: string;
  goal_id: string | null;
  title: string;
  kind: ReminderKind;
  channel: ReminderChannel;
  snoozed_until: string | null;
  status: ReminderStatus;
  notes: string | null;
  /** one_time only */
  due_date: string | null;
  /** one_time only, optional */
  due_time: string | null;
  /** recurring only */
  freq: ReminderFreq | null;
  interval_n: number;
  /** recurring, freq='weekly' only -- ISO weekday numbers, 1=Monday..7=Sunday */
  weekdays: number[] | null;
  /** recurring, freq='monthly' only -- 1-31, clamped to the real last day of a shorter month */
  month_day: number | null;
  /** recurring only, optional */
  time_of_day: string | null;
  /** recurring only -- the every_n_days anchor and the schedule's earliest occurrence */
  start_date: string | null;
  /** recurring only, optional */
  end_date: string | null;
  paused_at: string | null;
  /** recurring only -- null means a manual tick marks the day done */
  satisfied_by: ReminderSatisfiedBy | null;
  counts_as_task: boolean;
  created_at: string;
  updated_at: string;
}

/** reminders_today row -- mirrors its return table exactly (0041). */
export interface ReminderToday {
  id: string;
  kind: ReminderKind;
  title: string;
  notes: string | null;
  freq: ReminderFreq | null;
  weekdays: number[] | null;
  month_day: number | null;
  interval_n: number;
  time_of_day: string | null;
  due_date: string | null;
  due_time: string | null;
  satisfied_by: ReminderSatisfiedBy | null;
  goal_id: string | null;
  counts_as_task: boolean;
  /** the day this row is for -- due_date for one_time, p_date for recurring */
  occurrence_date: string;
  completion_status: ReminderCompletionStatus | null;
  completed_at: string | null;
  is_done: boolean;
  done_via: ReminderDoneVia | null;
  is_overdue: boolean;
  due_state: ReminderDueState;
  /** null for a one_time row -- reminder_streak has no concept of one for it */
  streak: number | null;
}

/** reminders_upcoming row -- mirrors its return table exactly (0041,
 *  widened by 0043 to carry enough fields for describeScheduleShort). */
export interface ReminderUpcoming {
  occurrence_date: string;
  id: string;
  kind: ReminderKind;
  title: string;
  time: string | null;
  freq: ReminderFreq | null;
  satisfied_by: ReminderSatisfiedBy | null;
  weekdays: number[] | null;
  month_day: number | null;
  interval_n: number;
  due_time: string | null;
}

/** reminder_history row -- mirrors its return table exactly (0042). One row
 *  per (recurring reminder, day) over the requested window. */
export type ReminderHistoryState = 'unscheduled' | 'done' | 'module' | 'skipped' | 'excused' | 'missed' | 'open';
export interface ReminderHistoryRow {
  reminder_id: string;
  d: string;
  state: ReminderHistoryState;
}

/** Form input for create/update -- the union of one_time and recurring
 *  fields, same "one struct, kind picks which half matters" shape as the
 *  reminders table itself (0040's shape checks). validateDraft in
 *  schedule.ts mirrors those checks so the form fails before the DB does. */
export interface ReminderDraft {
  title: string;
  notes: string;
  kind: ReminderKind;
  goal_id: string | null;
  /** omitted -- the DB trigger defaults it from kind (true for one_time, false for recurring) */
  counts_as_task?: boolean;
  // one_time
  due_date: string | null;
  due_time: string | null;
  // recurring
  freq: ReminderFreq | null;
  interval_n: number;
  weekdays: number[];
  month_day: number | null;
  time_of_day: string | null;
  start_date: string | null;
  end_date: string | null;
  satisfied_by: ReminderSatisfiedBy | null;
}
