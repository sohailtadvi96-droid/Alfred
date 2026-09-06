-- 0014_taxonomy_remap.sql — fold the pre-engine category set into the engine taxonomy.
--
-- 0013 added the engine's 25 system categories. Four old slugs describe a concept
-- that the engine now splits or renames, so their transactions move and the old
-- rows are hidden. Nothing is deleted — a stale reference anywhere still resolves,
-- it just stops showing up in the picker.
--
--   dineout            -> dineout_stays
--   person  (debit)    -> person_transactions
--   person  (credit)   -> money_received
--   refund             -> uncategorised
--   misc               -> uncategorised
--
-- The four slugs 0013 left alone on purpose (grocery, alcohol, ticket_booking,
-- online_shopping) keep their existing rows and colours.

-- 1. hide-flag on categories -------------------------------------------------
alter table public.categories add column if not exists archived boolean not null default false;

-- 2. move existing transactions off the retired slugs ----------------------
update public.transactions set category = 'dineout_stays'
  where category = 'dineout';

update public.transactions set category = 'person_transactions'
  where category = 'person' and direction = 'debit';

update public.transactions set category = 'money_received'
  where category = 'person' and direction = 'credit';

update public.transactions set category = 'uncategorised'
  where category in ('refund', 'misc');

-- 3. keep the SQL-side default rules pointing at live slugs ----------------
--    (0005 seeds these with user_id = null; a rule aimed at a hidden category
--     would silently resurrect the slug on the next insert-time categorise())
update public.category_rules set category = 'dineout_stays'
  where user_id is null and category = 'dineout';

update public.category_rules set category = 'uncategorised'
  where user_id is null and category = 'refund';

-- 4. hide the retired rows (both directions of `person`) -------------------
update public.categories set archived = true
  where user_id is null and slug in ('dineout', 'person', 'refund', 'misc');
