-- 0041_reminders_rpcs.sql — Reminders module, RPC surface (R2).
-- Everything here is security invoker (the default — no `security definer`
-- anywhere in this file): reminders/reminder_completions/goals/goal_progress/
-- office_journal/profiles all carry the standard owner-all RLS, so running
-- as the caller is enough, same reasoning as goal_current_value/goal_pace.
-- Reads are `language sql stable` where a single query suffices,
-- `plpgsql stable` where a walk-back loop is needed (reminder_streak,
-- reminders_today's per-row streak); writes are `plpgsql volatile`.

-- ---------- reminder_occurs_on: pure schedule, ignores status ----------
-- Whether a recurring reminder's rule would put a card on date d, with no
-- regard for whether it's active/paused/archived (reminders_today filters
-- status itself) and no regard for completions. Always false for a
-- one_time reminder — it has no recurring schedule to evaluate.
create or replace function public.reminder_occurs_on(r public.reminders, d date)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when r.kind <> 'recurring' then false
    when d < r.start_date then false
    when r.end_date is not null and d > r.end_date then false
    else case r.freq
      when 'daily' then true
      when 'weekly' then extract(isodow from d)::smallint = any (r.weekdays)
      when 'monthly' then extract(day from d)::smallint = least(
        r.month_day,
        extract(day from (date_trunc('month', d) + interval '1 month' - interval '1 day'))::smallint
      )
      when 'every_n_days' then mod((d - r.start_date)::int, r.interval_n::int) = 0
      else false
    end
  end;
$$;

revoke all on function public.reminder_occurs_on(public.reminders, date) from public;
grant execute on function public.reminder_occurs_on(public.reminders, date) to authenticated;

-- ---------- reminder_satisfied: module-satisfied check ----------
-- Whether another module's own data already marks date d done for this
-- reminder, independent of any tick. office_journal today; the whitelist
-- on reminders.satisfied_by is the only thing that can grow this CASE.
-- Same "non-empty body" rule as goal_current_value's journal_streak branch
-- — an autosaved-on-blur empty entry never counts as journalled.
create or replace function public.reminder_satisfied(r public.reminders, d date)
returns boolean
language sql
stable
set search_path = public
as $$
  select case r.satisfied_by
    when 'office_journal' then exists (
      select 1 from public.office_journal j
      where j.user_id = r.user_id and j.entry_date = d and btrim(j.body) <> ''
    )
    else false
  end;
$$;

revoke all on function public.reminder_satisfied(public.reminders, date) from public;
grant execute on function public.reminder_satisfied(public.reminders, date) to authenticated;

-- ---------- reminder_streak: consecutive scheduled occurrences ----------
-- Walks backward from p_today over this reminder's own scheduled days only
-- (unscheduled days don't exist for the streak). Returns null for a
-- one_time reminder — it has no streak concept. An 'excused' day (written
-- by reminder_resume) is stepped over, not counted and not a break. Today
-- itself, if scheduled and not yet done, doesn't break the streak (it's
-- still open) but doesn't add to it either. Anything else on a past
-- scheduled day — 'skipped', or no completion and not module-satisfied —
-- stops the walk. Bounded to 400 days back so an old reminder with a long
-- gap can't make this an unbounded scan.
create or replace function public.reminder_streak(p_id uuid, p_today date default public.user_today())
returns int
language plpgsql
stable
set search_path = public
as $$
declare
  v_r public.reminders%rowtype;
  v_lower date;
  v_d date;
  v_streak int := 0;
  v_status text;
begin
  select * into v_r from public.reminders where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'reminder_streak: reminder % not found', p_id;
  end if;

  if v_r.kind <> 'recurring' then
    return null;
  end if;

  v_lower := greatest(v_r.start_date, p_today - 400);
  v_d := p_today;
  while v_d >= v_lower loop
    if not public.reminder_occurs_on(v_r, v_d) then
      v_d := v_d - 1;
      continue;
    end if;

    select status into v_status
    from public.reminder_completions
    where reminder_id = p_id and occurrence_date = v_d;

    if v_status = 'excused' then
      v_d := v_d - 1;
      continue;
    end if;

    if v_status = 'done' or public.reminder_satisfied(v_r, v_d) then
      v_streak := v_streak + 1;
      v_d := v_d - 1;
      continue;
    end if;

    if v_d = p_today then
      -- today is still open: doesn't count, doesn't break.
      v_d := v_d - 1;
      continue;
    end if;

    -- a past scheduled day that's 'skipped' or simply missing: the streak ends here.
    exit;
  end loop;

  return v_streak;
end;
$$;

revoke all on function public.reminder_streak(uuid, date) from public;
grant execute on function public.reminder_streak(uuid, date) to authenticated;

-- ---------- reminders_today: everything for one day's page ----------
-- Three row shapes, unioned: (a) a recurring reminder occurring on p_date;
-- (b) an open one_time reminder due on or before p_date with no completion
-- yet (an overdue one carries forward — is_overdue = due_date < p_date);
-- (c) a one_time reminder whose completion's local completed_at date is
-- p_date (the "done today" case, even if the reminder itself was overdue
-- from an earlier day). A skipped recurring occurrence is still returned
-- (completion_status = 'skipped') so the client can choose to hide it —
-- this function doesn't hide anything status-wise except paused/archived
-- reminders and snoozed one_time ones.
create or replace function public.reminders_today(p_date date default public.user_today())
returns table (
  id uuid,
  kind text,
  title text,
  notes text,
  freq text,
  weekdays smallint[],
  month_day smallint,
  interval_n smallint,
  time_of_day time,
  due_date date,
  due_time time,
  satisfied_by text,
  goal_id uuid,
  counts_as_task boolean,
  occurrence_date date,
  completion_status text,
  completed_at timestamptz,
  is_done boolean,
  done_via text,
  is_overdue boolean,
  due_state text,
  streak int
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz text;
  v_today date := public.user_today();
  v_local_time time;
begin
  select coalesce(p.timezone, 'Asia/Kolkata') into v_tz from public.profiles p where p.id = auth.uid();
  v_tz := coalesce(v_tz, 'Asia/Kolkata');
  v_local_time := (now() at time zone v_tz)::time;

  return query
  with occ as (
    -- (a) recurring, occurring today
    select
      r.id, r.kind, r.title, r.notes, r.freq, r.weekdays, r.month_day, r.interval_n, r.time_of_day,
      r.due_date, r.due_time, r.satisfied_by, r.goal_id, r.counts_as_task,
      p_date as occurrence_date,
      c.status as completion_status,
      c.completed_at,
      (coalesce(c.status = 'done', false) or public.reminder_satisfied(r, p_date)) as is_done,
      case
        when c.status = 'done' then 'tick'
        when public.reminder_satisfied(r, p_date) then 'module'
        else null
      end as done_via,
      false as is_overdue
    from public.reminders r
    left join public.reminder_completions c
      on c.reminder_id = r.id and c.occurrence_date = p_date
    where r.user_id = auth.uid()
      and r.kind = 'recurring'
      and r.status = 'active'
      and public.reminder_occurs_on(r, p_date)

    union all

    -- (b) one-time, open, due on or before p_date, no completion yet
    select
      r.id, r.kind, r.title, r.notes, r.freq, r.weekdays, r.month_day, r.interval_n, r.time_of_day,
      r.due_date, r.due_time, r.satisfied_by, r.goal_id, r.counts_as_task,
      r.due_date as occurrence_date,
      null::text as completion_status,
      null::timestamptz as completed_at,
      false as is_done,
      null::text as done_via,
      (r.due_date < p_date) as is_overdue
    from public.reminders r
    where r.user_id = auth.uid()
      and r.kind = 'one_time'
      and r.status = 'active'
      and r.due_date <= p_date
      and not exists (select 1 from public.reminder_completions c where c.reminder_id = r.id)
      and (r.snoozed_until is null or r.snoozed_until <= now())

    union all

    -- (c) one-time, completed, and the completion's local date is p_date
    select
      r.id, r.kind, r.title, r.notes, r.freq, r.weekdays, r.month_day, r.interval_n, r.time_of_day,
      r.due_date, r.due_time, r.satisfied_by, r.goal_id, r.counts_as_task,
      c.occurrence_date,
      c.status as completion_status,
      c.completed_at,
      true as is_done,
      'tick' as done_via,
      false as is_overdue
    from public.reminders r
    join public.reminder_completions c on c.reminder_id = r.id
    where r.user_id = auth.uid()
      and r.kind = 'one_time'
      and c.status = 'done'
      and (c.completed_at at time zone v_tz)::date = p_date
  )
  select
    occ.id, occ.kind, occ.title, occ.notes, occ.freq, occ.weekdays, occ.month_day, occ.interval_n,
    occ.time_of_day, occ.due_date, occ.due_time, occ.satisfied_by, occ.goal_id, occ.counts_as_task,
    occ.occurrence_date, occ.completion_status, occ.completed_at, occ.is_done, occ.done_via, occ.is_overdue,
    case
      when occ.is_done then 'done'
      when occ.is_overdue then 'overdue'
      when p_date = v_today and coalesce(occ.due_time, occ.time_of_day) <= v_local_time then 'due_now'
      else 'later'
    end as due_state,
    case when occ.kind = 'recurring' then public.reminder_streak(occ.id, p_date) else null end as streak
  from occ
  order by occ.is_overdue desc, coalesce(occ.due_time, occ.time_of_day) nulls last, occ.title;
end;
$$;

revoke all on function public.reminders_today(date) from public;
grant execute on function public.reminders_today(date) to authenticated;

-- ---------- reminders_upcoming: the next N days ----------
create or replace function public.reminders_upcoming(p_days int default 7)
returns table (
  occurrence_date date,
  id uuid,
  kind text,
  title text,
  "time" time,
  freq text,
  satisfied_by text
)
language sql
stable
set search_path = public
as $$
  select gs.occurrence_date, r.id, r.kind, r.title, r.time_of_day as "time", r.freq, r.satisfied_by
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

  select r.due_date as occurrence_date, r.id, r.kind, r.title, r.due_time as "time", r.freq, r.satisfied_by
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

-- ---------- reminder_complete ----------
-- Ticks a reminder done for an occurrence. For one_time, the occurrence is
-- always its own due_date — p_date is ignored, matching "a due_date reminder
-- has exactly one occurrence, whenever you happen to tick it". A
-- module-satisfied recurring reminder has no tick UI and can't be ticked
-- here either, so a caller trying anyway gets a clear error instead of a
-- completion row nothing will ever read as authoritative. If the reminder
-- is linked to a MANUAL streak goal, this also logs that day's
-- goal_progress row — same columns/shape as toggleStreakDay in
-- src/features/goals/api.ts (goal_id, occurred_on, value=1; user_id and
-- note are left to their defaults), and only if that goal doesn't already
-- have a row for the day, so calling this twice never duplicates it.
create or replace function public.reminder_complete(p_id uuid, p_date date default public.user_today())
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_r public.reminders%rowtype;
  v_occ date;
  v_goal_id uuid;
begin
  select * into v_r from public.reminders where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'reminder_complete: reminder % not found', p_id;
  end if;

  if v_r.satisfied_by is not null then
    raise exception 'reminder_complete: "%" is module-satisfied and cannot be ticked manually', v_r.title;
  end if;

  v_occ := case when v_r.kind = 'one_time' then v_r.due_date else p_date end;

  insert into public.reminder_completions (reminder_id, occurrence_date, status, completed_at)
  values (p_id, v_occ, 'done', now())
  on conflict (reminder_id, occurrence_date)
  do update set status = 'done', completed_at = now();

  select g.id into v_goal_id
  from public.goals g
  where g.id = v_r.goal_id and g.user_id = auth.uid()
    and g.type = 'streak' and g.source ->> 'kind' = 'manual';

  if v_goal_id is not null and not exists (
    select 1 from public.goal_progress where goal_id = v_goal_id and occurred_on = v_occ
  ) then
    insert into public.goal_progress (goal_id, occurred_on, value)
    values (v_goal_id, v_occ, 1);
  end if;
end;
$$;

revoke all on function public.reminder_complete(uuid, date) from public;
grant execute on function public.reminder_complete(uuid, date) to authenticated;

-- ---------- _reminder_unlog_goal: internal helper ----------
-- Not part of the client-facing surface — nothing in src/ calls this
-- directly. reminder_uncomplete and reminder_skip both need to remove a
-- day's goal_progress row for a linked manual streak goal (skip included:
-- flipping an already-'done' occurrence to 'skipped' must undo the log
-- exactly like uncompleting it would), so that one piece of logic is
-- factored here once instead of duplicated and risking drift between the
-- two callers. Still security invoker like every function in this file —
-- it's granted execute the same as the others only because it's called
-- from other invoker functions running as `authenticated`, not because
-- it's meant to be called on its own.
create or replace function public._reminder_unlog_goal(r public.reminders, d date)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_goal_id uuid;
begin
  select g.id into v_goal_id
  from public.goals g
  where g.id = r.goal_id and g.user_id = auth.uid()
    and g.type = 'streak' and g.source ->> 'kind' = 'manual';

  if v_goal_id is not null then
    delete from public.goal_progress where goal_id = v_goal_id and occurred_on = d;
  end if;
end;
$$;

revoke all on function public._reminder_unlog_goal(public.reminders, date) from public;
grant execute on function public._reminder_unlog_goal(public.reminders, date) to authenticated;

-- ---------- reminder_uncomplete ----------
-- The exact inverse of reminder_complete: removes the completion, and (for
-- a linked manual streak goal) that day's goal_progress row, mirroring
-- toggleStreakDay's delete branch.
create or replace function public.reminder_uncomplete(p_id uuid, p_date date default public.user_today())
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_r public.reminders%rowtype;
  v_occ date;
begin
  select * into v_r from public.reminders where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'reminder_uncomplete: reminder % not found', p_id;
  end if;

  v_occ := case when v_r.kind = 'one_time' then v_r.due_date else p_date end;

  delete from public.reminder_completions
  where reminder_id = p_id and occurrence_date = v_occ;

  perform public._reminder_unlog_goal(v_r, v_occ);
end;
$$;

revoke all on function public.reminder_uncomplete(uuid, date) from public;
grant execute on function public.reminder_uncomplete(uuid, date) to authenticated;

-- ---------- reminder_skip ----------
-- Recurring only — a one_time reminder that isn't going to happen gets
-- deleted, not skipped, so this raises for kind='one_time'. Marks the
-- occurrence 'skipped' (a miss: it breaks reminder_streak, unlike a paused
-- day, which is 'excused' and doesn't). Also unlogs any goal_progress row
-- for a linked manual streak goal — a skip called on an occurrence that
-- was previously ticked 'done' must undo that day's log, the same as
-- reminder_uncomplete would; calling _reminder_unlog_goal unconditionally
-- is a no-op when there was nothing to remove.
create or replace function public.reminder_skip(p_id uuid, p_date date default public.user_today())
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_r public.reminders%rowtype;
begin
  select * into v_r from public.reminders where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'reminder_skip: reminder % not found', p_id;
  end if;

  if v_r.kind <> 'recurring' then
    raise exception 'reminder_skip: "%" is one_time, not recurring', v_r.title;
  end if;

  insert into public.reminder_completions (reminder_id, occurrence_date, status, completed_at)
  values (p_id, p_date, 'skipped', now())
  on conflict (reminder_id, occurrence_date)
  do update set status = 'skipped', completed_at = now();

  perform public._reminder_unlog_goal(v_r, p_date);
end;
$$;

revoke all on function public.reminder_skip(uuid, date) from public;
grant execute on function public.reminder_skip(uuid, date) to authenticated;

-- ---------- reminder_pause / reminder_resume ----------
create or replace function public.reminder_pause(p_id uuid)
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  update public.reminders
  set status = 'paused', paused_at = now()
  where id = p_id and user_id = auth.uid();

  if not found then
    raise exception 'reminder_pause: reminder % not found', p_id;
  end if;
end;
$$;

revoke all on function public.reminder_pause(uuid) from public;
grant execute on function public.reminder_pause(uuid) to authenticated;

-- Backfills 'excused' for every day the rule was scheduled while paused —
-- from paused_at's local date up to (but not including) today, since today
-- isn't over yet — so reminder_streak steps over the whole pause instead of
-- treating it as a string of misses. on conflict do nothing: a day that
-- already has a completion (e.g. someone paused mid-day after already
-- ticking it) keeps whatever it had.
create or replace function public.reminder_resume(p_id uuid)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_r public.reminders%rowtype;
  v_tz text;
  v_from date;
  v_today date := public.user_today();
  v_d date;
begin
  select * into v_r from public.reminders where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'reminder_resume: reminder % not found', p_id;
  end if;
  if v_r.paused_at is null then
    raise exception 'reminder_resume: "%" is not paused', v_r.title;
  end if;

  select coalesce(p.timezone, 'Asia/Kolkata') into v_tz from public.profiles p where p.id = auth.uid();
  v_tz := coalesce(v_tz, 'Asia/Kolkata');
  v_from := (v_r.paused_at at time zone v_tz)::date;

  v_d := v_from;
  while v_d <= v_today - 1 loop
    if public.reminder_occurs_on(v_r, v_d) then
      insert into public.reminder_completions (reminder_id, occurrence_date, status, completed_at)
      values (p_id, v_d, 'excused', now())
      on conflict (reminder_id, occurrence_date) do nothing;
    end if;
    v_d := v_d + 1;
  end loop;

  update public.reminders
  set status = 'active', paused_at = null
  where id = p_id;
end;
$$;

revoke all on function public.reminder_resume(uuid) from public;
grant execute on function public.reminder_resume(uuid) to authenticated;
