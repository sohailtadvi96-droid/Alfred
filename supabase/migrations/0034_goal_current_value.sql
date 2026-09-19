-- 0034_goal_current_value.sql — pure read: a goal's current value over an
-- explicit date range, dispatched on source->>'kind'.
--
-- Plain SQL function, no `security definer` — same reasoning as 0020's
-- period_summary: every table this touches (goals, goal_progress,
-- office_journal, office_tasks) already carries the standard owner-all RLS
-- policy, so running as the caller (the default, invoker) is enough —
-- auth.uid() resolves to the calling user and RLS applies exactly as if
-- each table were queried directly.
--
-- Deliberately takes p_from/p_to rather than computing "today" or a period
-- itself — period bounds are a goal_pace/goal_periods concern, not this
-- function's. A caller without access to p_goal_id (wrong user, or it
-- doesn't exist) gets a null source->>'kind' lookup, which falls through
-- to the else branch and returns null, not an error.
create or replace function public.goal_current_value(p_goal_id uuid, p_from date, p_to date)
returns numeric
language sql
stable
set search_path = public
as $$
  select case (select source ->> 'kind' from public.goals where id = p_goal_id and user_id = auth.uid())
    when 'manual' then (
      select coalesce(sum(value), 0) from public.goal_progress
      where goal_id = p_goal_id and user_id = auth.uid()
        and occurred_on between p_from and p_to
    )
    -- an empty autosaved row (JournalBox saves on blur even with body='')
    -- must not count as a journalled day — see office/api.ts's own
    -- listRecentJournal(), which filters the same way client-side.
    when 'journal_streak' then (
      select count(distinct entry_date)::numeric from public.office_journal
      where user_id = auth.uid() and btrim(body) <> ''
        and entry_date between p_from and p_to
    )
    -- keyed off done_at, not due_date: a task can be completed on a
    -- different day than it was due, or have no due_date at all.
    when 'tasks_completed' then (
      select count(*)::numeric from public.office_tasks
      where user_id = auth.uid() and status = 'done'
        and done_at::date between p_from and p_to
    )
    else null
  end;
$$;

revoke all on function public.goal_current_value(uuid, date, date) from public;
grant execute on function public.goal_current_value(uuid, date, date) to authenticated;
