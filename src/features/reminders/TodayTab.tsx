import { useState } from 'react';
import { errMessage } from '@/lib/errors';
import { DoneTodayRow, ReminderRow } from './ReminderRow';
import { useReminderRules, useRemindersToday, useUserToday } from './hooks';
import { describeSchedule } from './schedule';

const MAX_NOT_SCHEDULED_SHOWN = 2;

export function TodayTab() {
  const { data: rows, isLoading, error, refetch } = useRemindersToday();
  const { data: rules } = useReminderRules();
  const { data: today } = useUserToday();
  const [doneOpen, setDoneOpen] = useState(true);

  if (isLoading) {
    return (
      <div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rem-skel-row" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rem-error">
        <span>Couldn’t load reminders — {errMessage(error)}</span>
        <button type="button" className="btn sec sm" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const all = rows ?? [];

  if (all.length === 0) {
    return <div className="rem-empty">Nothing due today.</div>;
  }

  const overdue = all.filter((r) => r.kind === 'one_time' && r.is_overdue);
  const daily = all.filter((r) => r.kind === 'recurring' && r.completion_status !== 'skipped' && !r.is_done);
  const oneTimeToday = all.filter((r) => r.kind === 'one_time' && !r.is_overdue && !r.is_done);
  const done = all.filter((r) => r.is_done);

  // From ALL of today's recurring rows, not just `daily` -- a rule that's
  // scheduled today but already done (or skipped) still belongs here; it
  // must not show up as "not scheduled today" just because the Daily
  // section itself filters it out for display.
  const scheduledTodayIds = new Set(all.filter((r) => r.kind === 'recurring').map((r) => r.id));
  const notScheduledToday = (rules ?? []).filter(
    (r) => r.kind === 'recurring' && r.status === 'active' && !scheduledTodayIds.has(r.id),
  );

  return (
    <div>
      {overdue.length > 0 && (
        <section>
          <div className="rem-section-label tone-neg">
            <span>Overdue</span>
          </div>
          {overdue.map((r) => (
            <ReminderRow key={r.id} row={r} today={today} />
          ))}
        </section>
      )}

      <section>
        <div className="rem-section-label">
          <span>Daily</span>
          {notScheduledToday.length > 0 && (
            <span className="rem-section-note">
              {notScheduledToday
                .slice(0, MAX_NOT_SCHEDULED_SHOWN)
                .map((r) => `${r.title} · ${describeSchedule(r)} — not scheduled today`)
                .join('  ·  ')}
              {notScheduledToday.length > MAX_NOT_SCHEDULED_SHOWN &&
                `  +${notScheduledToday.length - MAX_NOT_SCHEDULED_SHOWN} more`}
            </span>
          )}
        </div>
        {daily.length === 0 ? (
          <div className="rem-empty">Nothing recurring due today.</div>
        ) : (
          daily.map((r) => <ReminderRow key={r.id} row={r} today={today} />)
        )}
      </section>

      {oneTimeToday.length > 0 && (
        <section>
          <div className="rem-section-label">
            <span>Today · one-time</span>
          </div>
          {oneTimeToday.map((r) => (
            <ReminderRow key={r.id} row={r} today={today} />
          ))}
        </section>
      )}

      {done.length > 0 && (
        <section>
          <button
            type="button"
            className="rem-section-label rem-done-toggle"
            onClick={() => setDoneOpen((v) => !v)}
          >
            <span>
              Done today ({done.length}) {doneOpen ? '▾' : '▸'}
            </span>
          </button>
          {doneOpen && done.map((r) => <DoneTodayRow key={r.id} row={r} />)}
        </section>
      )}
    </div>
  );
}
