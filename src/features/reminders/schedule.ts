import type { Reminder, ReminderDraft } from './types';

/** Pure formatting and form validation. No date math about "today" lives
 *  here -- describeSchedule only ever renders what's already on the row
 *  (start/end/due dates, weekday numbers, a time-of-day string), and
 *  validateDraft only checks the draft's own fields against each other, the
 *  same shape rules 0040 enforces at the DB. Neither ever asks what day it
 *  is -- that's user_today()'s job, server-side, per plan §2 rule 5. */

const WEEKDAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const shortDateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const onceDateFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/** Postgres `time` comes back as "HH:MM:SS" -- drop the seconds. */
export function formatTime(t: string): string {
  return t.slice(0, 5);
}

/** A local calendar-date string parsed as a plain date, no timezone shift --
 *  same `${dateStr}T00:00:00` convention as office/datetime.ts's dueLabel. */
function parseDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

function formatShortDate(dateStr: string): string {
  return shortDateFmt.format(parseDateOnly(dateStr));
}

function formatOnceDate(dueDate: string, dueTime: string | null): string {
  const d = onceDateFmt.format(parseDateOnly(dueDate));
  return dueTime ? `${d}, ${formatTime(dueTime)}` : d;
}

function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

function isWeekdaysOnly(days: number[]): boolean {
  const sorted = [...days].sort((a, b) => a - b);
  return sorted.length === 5 && sorted.every((d, i) => d === i + 1);
}

type ScheduleFields = Pick<
  Reminder,
  'kind' | 'freq' | 'weekdays' | 'month_day' | 'interval_n' | 'time_of_day' | 'due_date' | 'due_time' | 'end_date'
>;

/** "Daily at 10:00", "Mon · Wed · Fri at 07:00", "Weekdays at 09:00" (when
 *  weekdays is exactly 1-5), "Every 3 days", "Monthly on the 31st (last day
 *  in shorter months)", "Once · Fri 2 Oct, 16:00" -- with " · until 31 Dec"
 *  appended whenever end_date is set. */
export function describeSchedule(r: ScheduleFields): string {
  const timeSuffix = r.time_of_day ? ` at ${formatTime(r.time_of_day)}` : '';
  const untilSuffix = r.end_date ? ` · until ${formatShortDate(r.end_date)}` : '';

  if (r.kind === 'one_time') {
    const when = r.due_date ? formatOnceDate(r.due_date, r.due_time) : 'no date set';
    return `Once · ${when}`;
  }

  switch (r.freq) {
    case 'daily':
      return `Daily${timeSuffix}${untilSuffix}`;
    case 'weekly': {
      const days = r.weekdays ?? [];
      const label = isWeekdaysOnly(days) ? 'Weekdays' : days.map((d) => WEEKDAY_ABBR[d - 1]).join(' · ');
      return `${label}${timeSuffix}${untilSuffix}`;
    }
    case 'monthly': {
      const day = r.month_day ?? 1;
      const clampNote = day >= 29 ? ' (last day in shorter months)' : '';
      return `Monthly on the ${ordinal(day)}${clampNote}${timeSuffix}${untilSuffix}`;
    }
    case 'every_n_days':
      return `Every ${r.interval_n} day${r.interval_n === 1 ? '' : 's'}${timeSuffix}${untilSuffix}`;
    default:
      return 'No schedule set';
  }
}

type ScheduleShortFields = Pick<Reminder, 'kind' | 'freq' | 'weekdays' | 'month_day' | 'interval_n' | 'due_time'>;

/** The same schedule, without the time-of-day or "until" trailer -- for a
 *  recurring row's own meta line, which shows the time as a separate leading
 *  piece ("{time} · {describeScheduleShort}") and would otherwise say it
 *  twice. A one_time row has no separate time piece in its meta line, so
 *  this embeds due_time itself instead of ever leaving a caller to render a
 *  bare "—" next to it when there's no time. */
export function describeScheduleShort(r: ScheduleShortFields): string {
  if (r.kind === 'one_time') return r.due_time ? `${formatTime(r.due_time)} · one-time` : 'one-time';
  switch (r.freq) {
    case 'daily':
      return 'Daily';
    case 'weekly': {
      const days = r.weekdays ?? [];
      return isWeekdaysOnly(days) ? 'Weekdays' : days.map((d) => WEEKDAY_ABBR[d - 1]).join(' · ');
    }
    case 'monthly':
      return `Monthly · ${ordinal(r.month_day ?? 1)}`;
    case 'every_n_days':
      return `Every ${r.interval_n}d`;
    default:
      return 'No schedule';
  }
}

export type ReminderDraftErrors = Partial<
  Record<'due_date' | 'freq' | 'weekdays' | 'month_day' | 'end_date' | 'satisfied_by', string>
>;

/** Mirrors 0040's own check constraints (reminders_one_time_shape,
 *  reminders_recurring_shape, reminders_weekly_days, reminders_monthly_day,
 *  reminders_date_range) so the form can fail before the DB does, with a
 *  message next to the actual field instead of a raw constraint-violation
 *  error. Returns an empty object when the draft is valid. */
export function validateDraft(d: ReminderDraft): ReminderDraftErrors {
  const errors: ReminderDraftErrors = {};

  if (d.kind === 'one_time') {
    if (!d.due_date) errors.due_date = 'Pick a due date.';
    if (d.satisfied_by) errors.satisfied_by = 'Only a recurring reminder can be done automatically.';
  } else {
    if (!d.freq) errors.freq = 'Pick how often this repeats.';
    if (d.freq === 'weekly' && (d.weekdays?.length ?? 0) === 0) {
      errors.weekdays = 'Pick at least one day.';
    }
    if (d.freq === 'monthly' && !d.month_day) {
      errors.month_day = 'Pick a day of the month.';
    }
  }

  if (d.start_date && d.end_date && d.end_date < d.start_date) {
    errors.end_date = 'End date must be on or after the start date.';
  }

  return errors;
}
