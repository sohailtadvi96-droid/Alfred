-- 0042_reminder_history.sql — Reminders module, history sweep (R5).
-- One row per (recurring reminder, day) over the last p_days days, for the
-- ALL tab's per-rule dot strip. Security invoker like everything else in
-- this module — reminders/reminder_completions/office_journal all carry
-- the standard owner-all RLS, so running as the caller is enough.

-- Offsets from p_today via plain integer subtraction (p_today - n) rather
-- than generate_series over a date/timestamp range — Postgres's date
-- generate_series overload needs a timestamp step, and casting back and
-- forth is more error-prone than just counting backwards.
create or replace function public.reminder_history(p_days int default 30, p_today date default public.user_today())
returns table (reminder_id uuid, d date, state text)
language sql
stable
set search_path = public
as $$
  select
    r.id as reminder_id,
    (p_today - gs.n) as d,
    case
      when not public.reminder_occurs_on(r, p_today - gs.n) then 'unscheduled'
      when c.status = 'excused' then 'excused'
      when c.status = 'skipped' then 'skipped'
      when c.status = 'done' then 'done'
      when public.reminder_satisfied(r, p_today - gs.n) then 'module'
      when (p_today - gs.n) = p_today then 'open'
      else 'missed'
    end as state
  from public.reminders r
  cross join generate_series(0, greatest(p_days, 1) - 1) as gs(n)
  left join public.reminder_completions c
    on c.reminder_id = r.id and c.occurrence_date = (p_today - gs.n)
  where r.user_id = auth.uid()
    and r.kind = 'recurring'
    and r.status <> 'archived'
  order by r.id, d;
$$;

revoke all on function public.reminder_history(int, date) from public;
grant execute on function public.reminder_history(int, date) to authenticated;
