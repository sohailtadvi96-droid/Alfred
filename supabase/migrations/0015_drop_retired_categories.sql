-- 0015_drop_retired_categories.sql
-- Finishes the taxonomy cutover. 0014 shipped twice: the version applied to the
-- cloud DB was the earlier "archive" one (added categories.archived, flagged the
-- retired system rows, remapped transactions). It never deleted the rows,
-- remapped category_rules, or repointed the SQL fallback. This does that.
--
-- Safe to run now: transactions are already off the retired slugs (0014's
-- archive version handled that); the UPDATEs below are idempotent no-ops if so.

-- 1. transactions — belt and braces (0 rows if 0014 already moved them) -----
update public.transactions set category = 'dineout_stays'       where category = 'dineout';
update public.transactions set category = 'person_transactions' where category = 'person' and direction = 'debit';
update public.transactions set category = 'money_received'      where category = 'person' and direction = 'credit';
update public.transactions set category = 'uncategorised'       where category in ('refund', 'misc');

-- 2. category_rules — system + user rows -----------------------------------
update public.category_rules set category = 'dineout_stays'       where category = 'dineout';
update public.category_rules set category = 'uncategorised'       where category = 'refund';
update public.category_rules set category = 'person_transactions' where category = 'person' and direction = 'debit';
update public.category_rules set category = 'money_received'      where category = 'person' and direction = 'credit';
update public.category_rules set category = 'uncategorised'       where category = 'misc';

-- 3. SQL fallback default → live slugs -----------------------------------
create or replace function public.categorize(p_merchant text, p_direction text)
returns text
language sql
stable
as $$
  select coalesce(
    (
      select r.category
      from public.category_rules r
      where r.direction = p_direction
        and (r.user_id is null or r.user_id = auth.uid())
        and (
          (r.match_type = 'contains' and p_merchant ilike '%' || r.pattern || '%') or
          (r.match_type = 'equals'   and lower(p_merchant) = lower(r.pattern)) or
          (r.match_type = 'regex'    and p_merchant ~* r.pattern)
        )
      order by (r.user_id is not null) desc, r.priority asc
      limit 1
    ),
    case when p_direction = 'credit' then 'money_received' else 'uncategorised' end
  );
$$;

-- 4. delete every retired category row — system and user-owned -----------
--    (concepts moved: dineout->dineout_stays, person->person_transactions/
--     money_received, refund/misc->uncategorised; no transaction references
--     them any more)
delete from public.categories where slug in ('dineout', 'person', 'refund', 'misc');

-- categories.archived stays: unused now, but harmless, and dropping a column
-- an already-deployed client might still select is not worth the risk.
