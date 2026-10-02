-- 0045_reminders_office.sql — Reminders × Office, and the tasks_completed
-- timezone fix (R7). Two independent pieces:
--
--   1. done_today_feed — the union OfficeDayPage's done-today list reads
--      instead of assembling itself from office_tasks alone.
--   2. goal_current_value, restated in full a third time (0034 → 0038 →
--      here, SQL functions can't be patched) — only the tasks_completed
--      branch changes; every other branch below is copied byte-for-byte
--      from 0038's live body.
--
-- Both read done-ness by the LOCAL calendar day (profiles.timezone), not
-- done_at::date/completed_at::date, which is the UTC day — see the R0
-- latent-bug note and the R7 parity check (run against prod before this
-- migration was written): 2 of 7 live task completions were misattributed
-- by a day under the old UTC-date logic, though no existing weekly
-- tasks_completed total actually changes, since both land in the same
-- calendar week either way.

-- ---------- done_today_feed ----------
create or replace function public.done_today_feed(p_date date default public.user_today())
returns table (
  source text,
  id uuid,
  title text,
  completed_at timestamptz,
  counts_as_task boolean,
  reminder_kind text
)
language sql
stable
set search_path = public
as $$
  with tz as (
    select coalesce((select timezone from public.profiles where id = auth.uid()), 'Asia/Kolkata') as tz
  )
  select 'task' as source, t.id, t.title, t.done_at as completed_at, true as counts_as_task, null::text as reminder_kind
  from public.office_tasks t, tz
  where t.user_id = auth.uid() and t.status = 'done' and t.done_at is not null
    and (t.done_at at time zone tz.tz)::date = p_date

  union all

  select 'reminder' as source, r.id, r.title, rc.completed_at, r.counts_as_task, r.kind as reminder_kind
  from public.reminder_completions rc
  join public.reminders r on r.id = rc.reminder_id
  cross join tz
  where r.user_id = auth.uid() and rc.status = 'done'
    and (rc.completed_at at time zone tz.tz)::date = p_date

  order by completed_at;
$$;

revoke all on function public.done_today_feed(date) from public;
grant execute on function public.done_today_feed(date) to authenticated;

-- ---------- goal_current_value ----------
-- manual / journal_streak / savings_target branches: unchanged from 0038,
-- copied verbatim. tasks_completed: office_tasks counted by the LOCAL day
-- of done_at (was done_at::date, the UTC day), plus counts_as_task
-- reminder completions by the LOCAL day of completed_at (new, 0044 made
-- this countable at all).
create or replace function public.goal_current_value(p_goal_id uuid, p_from date, p_to date)
returns numeric
language sql
stable
set search_path = public
as $$
  with tz as (
    select coalesce((select timezone from public.profiles where id = auth.uid()), 'Asia/Kolkata') as tz
  )
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
    -- keyed off done_at (recurring: completed_at), not due_date: a task/
    -- reminder can be completed on a different day than it was due, or have
    -- no due date at all. Both sides are counted by LOCAL day, not UTC.
    when 'tasks_completed' then (
      (
        select count(*) from public.office_tasks, tz
        where user_id = auth.uid() and status = 'done' and done_at is not null
          and (done_at at time zone tz.tz)::date between p_from and p_to
      ) + (
        select count(*)
        from public.reminder_completions rc
        join public.reminders r on r.id = rc.reminder_id
        cross join tz
        where r.user_id = auth.uid() and rc.status = 'done' and r.counts_as_task
          and (rc.completed_at at time zone tz.tz)::date between p_from and p_to
      )
    )::numeric
    when 'savings_target' then (
      select coalesce(sum(case
          when f.flow_kind = 'income'  and f.direction = 'credit' and f.category = any (s.income_slugs) then  f.amount_cents
          when f.flow_kind = 'expense' and f.direction = 'debit'                                        then -f.amount_cents
        end), 0) / 100.0
      from public.transaction_flows f
      cross join (
        select case when jsonb_typeof(g.source -> 'income_categories') = 'array'
                    then array(select jsonb_array_elements_text(g.source -> 'income_categories'))
                    else array['salary', 'income']
               end as income_slugs
        from public.goals g
        where g.id = p_goal_id and g.user_id = auth.uid()
      ) s
      where f.user_id = auth.uid()
        and not f.excluded_from_spend
        and f.occurred_at::date between p_from and p_to
    )
    else null
  end;
$$;

revoke all on function public.goal_current_value(uuid, date, date) from public;
grant execute on function public.goal_current_value(uuid, date, date) to authenticated;
