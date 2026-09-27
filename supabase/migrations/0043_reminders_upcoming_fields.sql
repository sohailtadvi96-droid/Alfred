-- 0043_reminders_upcoming_fields.sql — Reminders module (R5).
-- reminders_upcoming (0041) returned just enough for a bare "weekly"-style
-- label; the Upcoming tab wants the same describeScheduleShort() the rest
-- of the UI uses (so "Gym" reads "Mon · Wed · Fri", not just "weekly"),
-- which needs weekdays/month_day/interval_n/due_time too. 0041 is already
-- pushed, so this is a new migration rather than an edit to it — Postgres
-- also requires a drop when a function's RETURNS TABLE shape changes,
-- CREATE OR REPLACE alone won't do it.
drop function public.reminders_upcoming(int);

create or replace function public.reminders_upcoming(p_days int default 7)
returns table (
  occurrence_date date,
  id uuid,
  kind text,
  title text,
  "time" time,
  freq text,
  satisfied_by text,
  weekdays smallint[],
  month_day smallint,
  interval_n smallint,
  due_time time
)
language sql
stable
set search_path = public
as $$
  select
    gs.occurrence_date, r.id, r.kind, r.title, r.time_of_day as "time", r.freq, r.satisfied_by,
    r.weekdays, r.month_day, r.interval_n, r.due_time
  from generate_series(
    (public.user_today() + 1)::timestamp,
    (public.user_today() + p_days)::timestamp,
    interval '1 day'
  ) as gs(occurrence_date)
  cross join public.reminders r
  where r.user_id = auth.uid()
    and r.kind = 'recurring'
    and r.status = 'active'
    and public.reminder_occurs_on(r, gs.occurrence_date::date)

  union all

  select
    r.due_date as occurrence_date, r.id, r.kind, r.title, r.due_time as "time", r.freq, r.satisfied_by,
    r.weekdays, r.month_day, r.interval_n, r.due_time
  from public.reminders r
  where r.user_id = auth.uid()
    and r.kind = 'one_time'
    and r.status = 'active'
    and r.due_date between public.user_today() + 1 and public.user_today() + p_days
    and not exists (select 1 from public.reminder_completions c where c.reminder_id = r.id)

  order by 1, "time" nulls last, title;
$$;

revoke all on function public.reminders_upcoming(int) from public;
grant execute on function public.reminders_upcoming(int) to authenticated;
