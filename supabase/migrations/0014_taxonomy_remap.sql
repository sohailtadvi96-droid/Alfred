-- 0014_taxonomy_remap.sql — retire the pre-engine category set.
--
-- 0013 added the engine's 25 system categories. Four old slugs describe a
-- concept the engine now renames or splits. Every transaction and every rule is
-- moved onto the new slugs first, then the old category rows are deleted and the
-- SQL fallback is pointed at live slugs, so nothing is left referencing them.
--
--   dineout            -> dineout_stays
--   person  (debit)    -> person_transactions
--   person  (credit)   -> money_received
--   refund             -> uncategorised
--   misc               -> uncategorised
--
-- The four slugs 0013 left alone on purpose (grocery, alcohol, ticket_booking,
-- online_shopping) keep their existing rows and colours.

-- 1. move existing transactions off the retired slugs ---------------------
update public.transactions set category = 'dineout_stays'
  where category = 'dineout';

update public.transactions set category = 'person_transactions'
  where category = 'person' and direction = 'debit';

update public.transactions set category = 'money_received'
  where category = 'person' and direction = 'credit';

update public.transactions set category = 'uncategorised'
  where category in ('refund', 'misc');

-- 2. move categorisation rules (system + any user rows) ------------------
update public.category_rules set category = 'dineout_stays' where category = 'dineout';
update public.category_rules set category = 'uncategorised' where category = 'refund';
update public.category_rules set category = 'person_transactions'
  where category = 'person' and direction = 'debit';
update public.category_rules set category = 'money_received'
  where category = 'person' and direction = 'credit';
update public.category_rules set category = 'uncategorised' where category = 'misc';

-- 3. point the SQL fallback at live slugs -------------------------------
--    (public.categorize returns these when no rule matches; the client engine
--     never emits the retired slugs, but a bare SMS/Shortcuts insert can)
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

-- 4. delete the retired category rows (both directions of `person`) -----
delete from public.categories
  where user_id is null and slug in ('dineout', 'person', 'refund', 'misc');
