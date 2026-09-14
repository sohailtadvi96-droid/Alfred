-- 0024_ambiguous_keys.sql
-- Amendment to Phase 3a Step 3: the queue is two sections, not one filter.
-- UNRESOLVED (no entity_keys row yet) and AMBIGUOUS (a key IS claimed, but
-- the transactions under it still show more than one distinct payee name)
-- are different situations that need different UI and must never be
-- conflated in progress reporting.
--
-- ambiguity_state is a stored decision, not an inference re-run on every
-- query — it must survive re-import/recategorization and only change when
-- the user explicitly resolves it (same_entity or separated). 'separated'
-- needs entity_id to go nullable: the key stays in entity_keys forever as
-- a tombstone (so it's never re-suggested or silently reclaimed) but no
-- longer points at the entity it was wrongly pinned to — the individual
-- payee names get their own merchant_name keys instead.

alter table public.entity_keys
  alter column entity_id drop not null;

alter table public.entity_keys
  add column ambiguity_state text not null default 'unknown'
    check (ambiguity_state in ('unknown', 'same_entity', 'separated', 'needs_review'));

comment on column public.entity_keys.ambiguity_state is
  'unknown = never checked for multi-payee collision (most keys land here and stay here — it is not a queue state). needs_review = the transactions under this key show more than one distinct merchant_normalized; surfaces in the AMBIGUOUS section of the resolution queue regardless of whether entity_id is otherwise resolved, and stays there until explicitly resolved. same_entity = user confirmed one payee under a drifting name; key stays attached. separated = user confirmed multiple payees; entity_id is nulled and the key is retired permanently — never reattached, never resurfaces.';

-- Flag every already-migrated vpa_prefix key where the underlying
-- transaction data shows more than one distinct merchant_normalized.
-- Confirmed in conversation: Guru Kripa's two keys and PCO Khan's one
-- (3 rows total) — computed here rather than hand-listed so any other
-- pre-existing collision in the 0023 migration is caught too, not just
-- the ones already noticed.
update public.entity_keys k
set ambiguity_state = 'needs_review'
where k.key_type = 'vpa_prefix'
  and (
    select count(distinct t.merchant_normalized)
    from public.transaction_flows t
    where t.vpa_prefix = k.key_value and t.user_id = k.user_id
  ) > 1;

-- ============================================================
-- unresolved_counterparties() — two sections in one result set,
-- queue_section tells the UI which. Both read transaction_flows only
-- (never transactions.direction).
-- ============================================================
create or replace function public.unresolved_counterparties(p_min_txns integer default 2)
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
  entity_display_name text
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
      null::text as entity_display_name
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
      e.display_name as entity_display_name
    from public.entity_keys k
    join public.entities e on e.id = k.entity_id
    left join public.transaction_flows t
      on t.vpa_prefix = k.key_value and t.user_id = k.user_id
    where k.user_id = auth.uid()
      and k.key_type = 'vpa_prefix'
      and k.ambiguity_state = 'needs_review'
    group by k.key_value, k.ambiguity_state, e.id, e.display_name
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
