-- 0044_reminder_goal_links.sql — Reminders × Goals (R6).
-- A tick now feeds any MANUAL streak or count goal a reminder is linked to,
-- not just a streak goal — and every row it writes is traceable back to the
-- reminder that wrote it, so unlogging (uncomplete/skip) never touches a
-- hand-logged entry. reminder_complete/_reminder_unlog_goal are restated in
-- full (0041 is already pushed and immutable); reminder_uncomplete and
-- reminder_skip are untouched — they already just call _reminder_unlog_goal.

-- ---------- goal_progress: which reminder (if any) wrote this row ----------
alter table public.goal_progress
  add column source_reminder_id uuid references public.reminders(id) on delete set null;
create index goal_progress_source_reminder on public.goal_progress (source_reminder_id, occurred_on);
comment on column public.goal_progress.source_reminder_id is
  'Null for a hand-logged row (addProgress/toggleStreakDay). Set by reminder_complete when the'
  ' row was written by ticking a linked reminder — _reminder_unlog_goal deletes only rows it'
  ' matches here, so a hand-logged entry for the same day is never touched.';

-- ---------- reminder_complete ----------
-- Ticks a reminder done for an occurrence. For one_time, the occurrence is
-- always its own due_date — p_date is ignored, matching "a due_date reminder
-- has exactly one occurrence, whenever you happen to tick it". A
-- module-satisfied recurring reminder has no tick UI and can't be ticked
-- here either, so a caller trying anyway gets a clear error instead of a
-- completion row nothing will ever read as authoritative.
--
-- If the reminder is linked to a MANUAL goal, this also logs progress —
-- computed goals (journal_streak/tasks_completed/savings_target) read their
-- own sources and are left alone entirely:
--   streak goal — at most one row per day, same as the hand-tick UI
--     (toggleStreakDay) enforces; a day already logged, hand-logged or by
--     this same reminder, is left alone rather than duplicated.
--   count goal  — one row per completed occurrence (value 1), guarded only
--     against this same reminder double-logging the same occurrence on a
--     repeat call — unrelated same-day entries (hand-logged or from another
--     reminder) are untouched, since a count goal can legitimately have
--     several increments in one day.
-- Either way the row carries source_reminder_id = p_id, which is what lets
-- _reminder_unlog_goal take it back out later without guessing.
create or replace function public.reminder_complete(p_id uuid, p_date date default public.user_today())
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_r public.reminders%rowtype;
  v_occ date;
  v_goal public.goals%rowtype;
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

  if v_r.goal_id is not null then
    select * into v_goal from public.goals
      where id = v_r.goal_id and user_id = auth.uid() and source ->> 'kind' = 'manual';

    if found and v_goal.type = 'streak' then
      if not exists (
        select 1 from public.goal_progress where goal_id = v_goal.id and occurred_on = v_occ
      ) then
        insert into public.goal_progress (goal_id, occurred_on, value, source_reminder_id)
        values (v_goal.id, v_occ, 1, p_id);
      end if;
    elsif found and v_goal.type = 'count' then
      if not exists (
        select 1 from public.goal_progress
        where goal_id = v_goal.id and occurred_on = v_occ and source_reminder_id = p_id
      ) then
        insert into public.goal_progress (goal_id, occurred_on, value, source_reminder_id)
        values (v_goal.id, v_occ, 1, p_id);
      end if;
    end if;
  end if;
end;
$$;

revoke all on function public.reminder_complete(uuid, date) from public;
grant execute on function public.reminder_complete(uuid, date) to authenticated;

-- ---------- _reminder_unlog_goal: internal helper ----------
-- Widened from streak-only to streak-or-count, matching reminder_complete
-- above. Deletes only rows this reminder itself wrote (source_reminder_id =
-- r.id) for the given day — a hand-logged row, or one from a different
-- reminder linked to the same goal, is never touched.
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
    and g.source ->> 'kind' = 'manual' and g.type in ('streak', 'count');

  if v_goal_id is not null then
    delete from public.goal_progress
    where goal_id = v_goal_id and source_reminder_id = r.id and occurred_on = d;
  end if;
end;
$$;

revoke all on function public._reminder_unlog_goal(public.reminders, date) from public;
grant execute on function public._reminder_unlog_goal(public.reminders, date) to authenticated;
