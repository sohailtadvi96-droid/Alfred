-- 0038_savings_target_source.sql — Goals Phase B, part 1: the savings meter.
-- Adds 'savings_target' to the source.kind whitelist and a matching branch in
-- goal_current_value. Nothing else: goal_pace is untouched (a value goal with
-- cadence='monthly' already takes its recurring branch and calls
-- goal_current_value(goal, month_start, today)), and savings_plan is 0039.

-- ---------- whitelist: one more kind ----------
-- Same drop-and-re-add as 0033 (the constraint has its own name for exactly
-- this). Existing rows are all manual / journal_streak / tasks_completed, so
-- it validates clean.
alter table public.goals drop constraint goals_source_kind_check;
alter table public.goals
  add constraint goals_source_kind_check
  check (source ->> 'kind' in ('manual', 'journal_streak', 'tasks_completed', 'savings_target'));

-- ---------- goal_current_value: + savings_target ----------
-- create or replace keeps the 0034 grants, but the whole body is restated
-- because SQL functions can't be patched — the three existing branches are
-- copied verbatim from 0034.
--
-- savings_target = income minus spend over [p_from, p_to], in RUPEES (cents /
-- 100.0, matching goals.target). It reads transaction_flows only, per the
-- rule that no total is computed off transactions.direction:
--   * spend  — flow_kind = 'expense' debits, unsigned amounts subtracted.
--   * income — flow_kind = 'income' credits whose category is in
--              source.income_categories (a jsonb array of slugs). With no such
--              key the default is salary + income. money_received is not in
--              the default, so it never counts — a P2P credit is a
--              reimbursement or a loan coming back, not earnings (one ₹5L row
--              in August would otherwise swamp the meter).
--   * excluded_from_spend rows (internal transfer legs, transfer-kind
--     categories) are dropped from both sides.
-- An explicit empty array is honoured (count no income); only an absent or
-- non-array key falls back to the default. `coalesce(array(select …), default)`
-- would NOT do that — array(subquery) over zero rows is '{}', not null, so the
-- default would never apply.
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
