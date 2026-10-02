import type { ReminderDueState, ReminderKind, ReminderSatisfiedBy, ReminderToday, ReminderUpcoming } from './types';

/** Pure reads over rows the server already computed (reminders_today,
 *  reminders_upcoming). Nothing here asks what day it is -- every date is one
 *  the server handed over (occurrence_date, user_today()), per plan §2 rule 5. */

/** UTC-anchored so a Y-M-D string can be diffed/offset without any local
 *  timezone reinterpretation. */
export function daysBetween(fromDateStr: string, toDateStr: string): number {
  const a = Date.parse(`${fromDateStr}T00:00:00Z`);
  const b = Date.parse(`${toDateStr}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A skipped occurrence is neither "due" nor "done" -- it's dismissed, so it
 *  counts toward neither side of the ratio. The stat strip, the page header
 *  and the Home tile all read this one number. */
export function todayTally(rows: ReminderToday[]): { done: number; total: number } {
  const counted = rows.filter((r) => r.completion_status !== 'skipped');
  return { done: counted.filter((r) => r.is_done).length, total: counted.length };
}

/** Still something to act on today: not done, not skipped. */
export function isOpen(row: ReminderToday): boolean {
  return !row.is_done && row.completion_status !== 'skipped';
}

export interface NextUpItem {
  /** unique per (reminder, occurrence) -- a recurring rule appears once per upcoming day */
  key: string;
  id: string;
  kind: ReminderKind;
  title: string;
  occurrenceDate: string;
  /** 'upcoming' = a later day, shown only when nothing is left today */
  state: Exclude<ReminderDueState, 'done'> | 'upcoming';
  time: string | null;
  satisfiedBy: ReminderSatisfiedBy | null;
  /** today's manual rows only -- a module-satisfied row has no tick, and a
   *  future occurrence isn't completable yet */
  tickable: boolean;
}

const STATE_RANK: Record<'overdue' | 'due_now' | 'later', number> = { overdue: 0, due_now: 1, later: 2 };

/** The Home tile's list: what's left today, soonest first -- overdue (oldest
 *  first), then due now, then later today (timed before untimed). Only when
 *  nothing at all is left today does it fall through to the next upcoming
 *  occurrences, which reminders_upcoming already orders by day then time. */
export function nextUp(
  today: ReminderToday[] | undefined,
  upcoming: ReminderUpcoming[] | undefined,
  limit = 3,
): NextUpItem[] {
  const open = (today ?? []).filter(isOpen);

  if (open.length > 0) {
    const stateOf = (r: ReminderToday) => (r.due_state === 'done' ? 'later' : r.due_state);
    const timeOf = (r: ReminderToday) => r.due_time ?? r.time_of_day;
    return [...open]
      .sort((a, b) => {
        const byState = STATE_RANK[stateOf(a)] - STATE_RANK[stateOf(b)];
        if (byState !== 0) return byState;
        if (stateOf(a) === 'overdue') {
          const byAge = a.occurrence_date.localeCompare(b.occurrence_date);
          if (byAge !== 0) return byAge;
        }
        const ta = timeOf(a);
        const tb = timeOf(b);
        if (ta !== tb) {
          if (ta == null) return 1;
          if (tb == null) return -1;
          return ta.localeCompare(tb);
        }
        return a.title.localeCompare(b.title);
      })
      .slice(0, limit)
      .map((r) => ({
        key: `${r.id}-${r.occurrence_date}`,
        id: r.id,
        kind: r.kind,
        title: r.title,
        occurrenceDate: r.occurrence_date,
        state: stateOf(r),
        time: timeOf(r),
        satisfiedBy: r.satisfied_by,
        tickable: !r.satisfied_by,
      }));
  }

  return (upcoming ?? []).slice(0, limit).map((r) => ({
    key: `${r.id}-${r.occurrence_date}`,
    id: r.id,
    kind: r.kind,
    title: r.title,
    occurrenceDate: r.occurrence_date,
    state: 'upcoming' as const,
    time: r.time,
    satisfiedBy: r.satisfied_by,
    tickable: false,
  }));
}
