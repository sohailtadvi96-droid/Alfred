import * as DM from '@radix-ui/react-dropdown-menu';
import { Link } from 'react-router-dom';
import { timeLabel } from '@/features/office/datetime';
import {
  useCompleteReminder,
  useRescheduleReminder,
  useSkipReminder,
  useSnoozeReminder,
  useUncompleteReminder,
} from './hooks';
import { describeScheduleShort, formatTime } from './schedule';
import type { ReminderToday } from './types';

/** UTC-anchored so a Y-M-D string can be diffed/offset without any local
 *  timezone reinterpretation -- these operate on dates the server already
 *  gave us (occurrence_date, user_today()), never on `new Date()`. */
function daysBetween(fromDateStr: string, toDateStr: string): number {
  const a = Date.parse(`${fromDateStr}T00:00:00Z`);
  const b = Date.parse(`${toDateStr}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function RowMenu({ row, today }: { row: ReminderToday; today: string | undefined }) {
  const skip = useSkipReminder();
  const snooze = useSnoozeReminder();
  const reschedule = useRescheduleReminder();

  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button type="button" className="rem-row-menu-btn" aria-label={`More actions for ${row.title}`}>
          ⋯
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content className="menu" align="end" sideOffset={6}>
          {row.kind === 'recurring' ? (
            <DM.Item className="menu-item" onSelect={() => skip.mutate({ id: row.id })}>
              Skip today
            </DM.Item>
          ) : (
            <>
              <DM.Item
                className="menu-item"
                onSelect={() =>
                  snooze.mutate({ id: row.id, until: new Date(Date.now() + 3_600_000).toISOString() })
                }
              >
                Snooze 1h
              </DM.Item>
              <DM.Item
                className="menu-item"
                onSelect={() =>
                  snooze.mutate({ id: row.id, until: new Date(Date.now() + 3 * 3_600_000).toISOString() })
                }
              >
                Snooze 3h
              </DM.Item>
              <DM.Item
                className="menu-item"
                disabled={!today}
                onSelect={() => today && reschedule.mutate({ id: row.id, dueDate: addDaysToDateString(today, 1) })}
              >
                Move to tomorrow
              </DM.Item>
            </>
          )}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

/** An active (not-yet-done) row for the Overdue / Daily / Today sections. */
export function ReminderRow({ row, today }: { row: ReminderToday; today: string | undefined }) {
  const complete = useCompleteReminder();
  const timeStr = row.due_time ?? row.time_of_day;
  // one_time already embeds its own time (or its absence) in describeScheduleShort;
  // only a recurring row needs a separate leading time piece.
  const meta =
    row.kind === 'one_time'
      ? describeScheduleShort(row)
      : `${timeStr ? formatTime(timeStr) : '—'} · ${describeScheduleShort(row)}`;
  const daysLate = row.is_overdue && today ? daysBetween(row.occurrence_date, today) : null;

  return (
    <div className={`rem-row${row.is_overdue ? ' tone-neg' : ''}`}>
      <div className="rem-row-head">
        {row.satisfied_by ? (
          <span className="rem-auto-dot" aria-hidden="true" />
        ) : (
          <button
            type="button"
            className="rem-tick"
            onClick={() => complete.mutate({ id: row.id, occurrenceDate: row.occurrence_date })}
            aria-label={`Mark ${row.title} done`}
          >
            <span className={`rem-tick-shape ${row.kind === 'recurring' ? 'square' : 'circle'}`} />
          </button>
        )}

        <div className="rem-row-titleblock">
          <span className="rem-row-title">{row.title}</span>
          {row.kind === 'one_time' && (
            <span className="rem-row-sub">{row.counts_as_task ? 'Counts as a task' : 'Not counted'}</span>
          )}
          {row.notes && <span className="rem-row-sub">{row.notes}</span>}
        </div>

        <span className="rem-row-meta">{meta}</span>

        <div className="rem-row-badges">
          {row.kind === 'recurring' && !!row.streak && (
            <span className="rem-streak">{row.streak}d</span>
          )}
          {row.satisfied_by && (
            <>
              <span className="tag">Auto</span>
              <Link className="rem-write-link" to={`/work/day/${row.occurrence_date}`}>
                Write →
              </Link>
            </>
          )}
        </div>

        {daysLate != null && daysLate > 0 ? (
          <span className="rem-row-status tone-neg">{daysLate}d late</span>
        ) : row.due_state === 'due_now' ? (
          <span className="rem-row-status">
            <span className="rem-due-dot" aria-hidden="true" />
            Due now
          </span>
        ) : timeStr ? (
          <span className="rem-row-status tone-faint">Later</span>
        ) : null}

        <RowMenu row={row} today={today} />
      </div>
    </div>
  );
}

/** A compact, already-done row for the Done Today list. */
export function DoneTodayRow({ row }: { row: ReminderToday }) {
  const uncomplete = useUncompleteReminder();
  const isModule = row.done_via === 'module';
  const time = row.completed_at ? timeLabel(row.completed_at) : '';
  const meta = isModule
    ? `${time} · auto`
    : `${time} · ${row.kind === 'one_time' ? 'one-time' : 'habit'} · ${
        row.counts_as_task ? 'counted as task' : 'not a task'
      }`;

  return (
    <div className="rem-done-row">
      <span className="rem-done-title">{row.title}</span>
      <span className="rem-done-meta">{meta}</span>
      {!isModule && (
        <button
          type="button"
          className="rem-undo"
          onClick={() => uncomplete.mutate({ id: row.id, occurrenceDate: row.occurrence_date })}
        >
          Undo
        </button>
      )}
    </div>
  );
}
