-- 0027_recurring_series_fix.sql
-- 0026's detect_recurring_series() used max(entity_id) to carry the
-- (constant, since group_key already encodes it) entity_id through the
-- cluster_summary aggregation — uuid has no default MAX aggregate in this
-- Postgres version. Cast through text instead.

create or replace function public.detect_recurring_series()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_found integer := 0;
  v_row record;
  v_existing_id uuid;
  v_existing_status text;
  v_interval integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  for v_row in
    with base as (
      select
        t.id, t.occurred_at, t.amount_cents, t.category, t.merchant_normalized,
        ek.entity_id
      from public.transaction_flows t
      left join public.entity_keys ek
        on ek.key_type = 'vpa_prefix'
       and ek.key_value = t.vpa_prefix
       and ek.user_id = t.user_id
       and ek.entity_id is not null
      where t.user_id = v_uid
        and t.direction = 'debit'
        and t.flow_kind = 'expense'
        and t.merchant_normalized is not null
    ),
    keyed as (
      select *, coalesce(entity_id::text, 'merchant:' || merchant_normalized) as group_key
      from base
    ),
    amount_ordered as (
      select *,
        row_number() over (partition by group_key order by amount_cents, id) as amt_rn,
        lag(amount_cents) over (partition by group_key order by amount_cents, id) as prev_amount
      from keyed
    ),
    flagged as (
      select *,
        case
          when prev_amount is null or prev_amount = 0 then 1
          when amount_cents::numeric / prev_amount > 1.25 then 1
          else 0
        end as is_break
      from amount_ordered
    ),
    clustered as (
      select *,
        sum(is_break) over (partition by group_key order by amt_rn rows unbounded preceding) as cluster_id
      from flagged
    ),
    cluster_summary as (
      select group_key, cluster_id,
             max(entity_id::text)::uuid as entity_id,
             mode() within group (order by merchant_normalized) as match_key,
             mode() within group (order by category) as category,
             count(*) as occurrence_count,
             percentile_cont(0.5) within group (order by amount_cents)::bigint as median_cents,
             min(occurred_at)::date as first_seen,
             max(occurred_at)::date as last_seen
      from clustered
      group by group_key, cluster_id
      having count(*) >= 3
    ),
    date_gaps as (
      select group_key, cluster_id,
             occurred_at::date - lag(occurred_at::date) over (partition by group_key, cluster_id order by occurred_at) as gap_days
      from clustered
    ),
    gap_median as (
      select group_key, cluster_id,
             percentile_cont(0.5) within group (order by gap_days) as median_gap
      from date_gaps
      where gap_days is not null
      group by group_key, cluster_id
    ),
    gap_check as (
      select dg.group_key, dg.cluster_id, gm.median_gap,
             count(*) filter (where dg.gap_days is not null) as n_gaps,
             count(*) filter (
               where dg.gap_days is not null and gm.median_gap > 0
                 and abs(dg.gap_days - gm.median_gap) / gm.median_gap <= 0.5
             ) as consistent_gaps
      from date_gaps dg
      join gap_median gm using (group_key, cluster_id)
      group by dg.group_key, dg.cluster_id, gm.median_gap
    )
    select cs.entity_id, cs.match_key, cs.category, cs.occurrence_count, cs.median_cents,
           cs.first_seen, cs.last_seen, gc.median_gap
    from cluster_summary cs
    join gap_check gc using (group_key, cluster_id)
    where gc.median_gap >= 5
      and gc.consistent_gaps >= ceil(gc.n_gaps / 2.0)
  loop
    v_interval := greatest(1, round(v_row.median_gap)::integer);

    select id, status into v_existing_id, v_existing_status
    from public.recurring_series
    where user_id = v_uid
      and (
        (v_row.entity_id is not null and entity_id = v_row.entity_id)
        or (v_row.entity_id is null and entity_id is null and match_key = v_row.match_key)
      )
      and abs(median_cents - v_row.median_cents)::numeric / greatest(median_cents, 1) <= 0.25
    limit 1;

    if v_existing_id is not null then
      if v_existing_status = 'cancelled' then
        continue; -- dismissed series must not resurrect itself
      end if;
      update public.recurring_series
      set entity_id = v_row.entity_id,
          match_key = v_row.match_key,
          category = v_row.category,
          median_cents = v_row.median_cents,
          interval_days = v_interval,
          occurrence_count = v_row.occurrence_count,
          first_seen = v_row.first_seen,
          last_seen = v_row.last_seen,
          next_expected = v_row.last_seen + v_interval,
          status = case when v_row.last_seen < (current_date - (v_interval * 1.5)) then 'lapsed' else 'active' end
      where id = v_existing_id;
    else
      insert into public.recurring_series (
        user_id, entity_id, match_key, category, median_cents, interval_days,
        occurrence_count, first_seen, last_seen, next_expected, status
      ) values (
        v_uid, v_row.entity_id, v_row.match_key, v_row.category, v_row.median_cents,
        v_interval, v_row.occurrence_count, v_row.first_seen, v_row.last_seen,
        v_row.last_seen + v_interval,
        case when v_row.last_seen < (current_date - (v_interval * 1.5)) then 'lapsed' else 'active' end
      );
    end if;
    v_found := v_found + 1;
  end loop;

  return v_found;
end;
$$;
