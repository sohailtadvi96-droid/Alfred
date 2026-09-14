-- 0025_queue_name_breakdown.sql
-- Step 4 needs "every distinct name under an ambiguous prefix with its own
-- transaction count and total" — 0024's unresolved_counterparties() only
-- returned an array of names, not per-name stats. Adding name_breakdown
-- (jsonb array of {name, txn_count, total_cents}), populated for the
-- ambiguous section only — the unresolved section's sample_names stays a
-- plain informational array, since it isn't resolved per-name yet.
--
-- Return shape changed, so this drops and recreates rather than
-- CREATE OR REPLACE (Postgres doesn't allow OR REPLACE to change a
-- function's RETURNS TABLE column list).

drop function if exists public.unresolved_counterparties(integer);

create function public.unresolved_counterparties(p_min_txns integer default 2)
returns table (
  queue_section text,
  key_value text,
  key_length integer,
  sample_names text[],
  txn_count bigint,
  total_cents bigint,
  first_seen timestamptz,
  last_seen timestamptz,
  current_category text,
  is_ambiguous boolean,
  ambiguity_state text,
  entity_id uuid,
  entity_display_name text,
  name_breakdown jsonb
)
language sql
stable
set search_path = public
as $$
  with unresolved as (
    select
      'unresolved'::text as queue_section,
      t.vpa_prefix as key_value,
      length(t.vpa_prefix) as key_length,
      array_agg(distinct t.merchant_normalized) as sample_names,
      count(*) as txn_count,
      sum(t.amount_cents) as total_cents,
      min(t.occurred_at) as first_seen,
      max(t.occurred_at) as last_seen,
      mode() within group (order by t.category) as current_category,
      (count(distinct t.merchant_normalized) > 1) as is_ambiguous,
      null::text as ambiguity_state,
      null::uuid as entity_id,
      null::text as entity_display_name,
      null::jsonb as name_breakdown
    from public.transaction_flows t
    where t.user_id = auth.uid()
      and t.vpa_prefix is not null
      and t.vpa_prefix <> ''
      and not exists (
        select 1 from public.entity_keys k
        where k.user_id = t.user_id
          and k.key_type = 'vpa_prefix'
          and k.key_value = t.vpa_prefix
      )
    group by t.vpa_prefix
    having count(*) >= p_min_txns
  ),
  ambiguous as (
    select
      'ambiguous'::text as queue_section,
      k.key_value,
      length(k.key_value) as key_length,
      array_agg(distinct t.merchant_normalized) as sample_names,
      count(t.id) as txn_count,
      coalesce(sum(t.amount_cents), 0) as total_cents,
      min(t.occurred_at) as first_seen,
      max(t.occurred_at) as last_seen,
      mode() within group (order by t.category) as current_category,
      true as is_ambiguous,
      k.ambiguity_state,
      e.id as entity_id,
      e.display_name as entity_display_name,
      (
        select jsonb_agg(jsonb_build_object('name', x.name, 'txn_count', x.cnt, 'total_cents', x.total_cents) order by x.cnt desc)
        from (
          select t2.merchant_normalized as name, count(*) as cnt, sum(t2.amount_cents) as total_cents
          from public.transaction_flows t2
          where t2.vpa_prefix = k.key_value and t2.user_id = k.user_id
          group by t2.merchant_normalized
        ) x
      ) as name_breakdown
    from public.entity_keys k
    join public.entities e on e.id = k.entity_id
    left join public.transaction_flows t
      on t.vpa_prefix = k.key_value and t.user_id = k.user_id
    where k.user_id = auth.uid()
      and k.key_type = 'vpa_prefix'
      and k.ambiguity_state = 'needs_review'
    group by k.user_id, k.key_value, k.ambiguity_state, e.id, e.display_name
  )
  select * from (
    select * from unresolved
    union all
    select * from ambiguous
  ) combined
  order by (queue_section = 'unresolved'), txn_count desc, total_cents desc;
$$;

revoke all on function public.unresolved_counterparties(integer) from public;
grant execute on function public.unresolved_counterparties(integer) to authenticated;

-- ============================================================
-- counterparty_queue_stats() — the numbers unresolved_counterparties()
-- itself can't give the progress line: how many keys are ALREADY
-- resolved (no row returned for those — that's the point), and how many
-- are permanent one-off singletons never queued at all. Ambiguous must
-- never be folded into "resolved" — that's exactly how it goes unnoticed.
-- ============================================================
create or replace function public.counterparty_queue_stats(p_min_txns integer default 2)
returns table (
  total_repeating_keys bigint,
  resolved_count bigint,
  ambiguous_count bigint,
  unresolved_count bigint,
  singleton_keys bigint
)
language sql
stable
set search_path = public
as $$
  with per_key as (
    select t.vpa_prefix, count(*) as txns
    from public.transaction_flows t
    where t.user_id = auth.uid()
      and t.vpa_prefix is not null
      and t.vpa_prefix <> ''
    group by t.vpa_prefix
  ),
  repeating as (
    select * from per_key where txns >= p_min_txns
  ),
  ambiguous_keys as (
    select k.key_value
    from public.entity_keys k
    where k.user_id = auth.uid()
      and k.key_type = 'vpa_prefix'
      and k.ambiguity_state = 'needs_review'
  )
  select
    (select count(*) from repeating) as total_repeating_keys,
    (
      select count(*) from repeating r
      where exists (
        select 1 from public.entity_keys k
        where k.user_id = auth.uid() and k.key_type = 'vpa_prefix' and k.key_value = r.vpa_prefix
      )
      and r.vpa_prefix not in (select key_value from ambiguous_keys)
    ) as resolved_count,
    (select count(*) from ambiguous_keys) as ambiguous_count,
    (
      select count(*) from repeating r
      where not exists (
        select 1 from public.entity_keys k
        where k.user_id = auth.uid() and k.key_type = 'vpa_prefix' and k.key_value = r.vpa_prefix
      )
    ) as unresolved_count,
    (select count(*) from per_key where txns < p_min_txns) as singleton_keys;
$$;

revoke all on function public.counterparty_queue_stats(integer) from public;
grant execute on function public.counterparty_queue_stats(integer) to authenticated;
