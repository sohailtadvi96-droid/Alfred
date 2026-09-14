-- 0026_recurring_series.sql
-- Phase 7 (expenses insights plan) — recurring detection. Last phase in
-- the plan. Supersedes the plan's own Phase 7 section where it conflicts:
-- it assumed a fixed 30/90/365-day interval rule and a single global
-- amount tolerance, both shown wrong against real data in conversation —
-- see the Step 1 investigation for the evidence (Google Play is two
-- subscriptions 34% apart under one truncated merchant name; rent's
-- cumulative 34% drift is really a max 16.8% per-step jump once its
-- entity's incidental noise — a cake, unlabeled transfers — is excluded).

create table public.recurring_series (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entity_id         uuid references public.entities(id) on delete set null,
  match_key         text not null, -- merchant_normalized fallback; always populated (even for entity-keyed rows) for a readable label
  category          text,
  median_cents      bigint not null,
  interval_days     integer not null,
  occurrence_count  integer not null,
  first_seen        date not null,
  last_seen         date not null,
  next_expected     date,
  status            text not null default 'active' check (status in ('active', 'lapsed', 'cancelled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.recurring_series enable row level security;
create policy "recurring_series owner all" on public.recurring_series
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger recurring_series_set_updated_at before update on public.recurring_series
  for each row execute function public.set_updated_at();

create index recurring_series_entity_idx on public.recurring_series (user_id, entity_id) where entity_id is not null;

comment on column public.recurring_series.entity_id is
  'Preferred key when the transactions resolve to an entity via entity_keys. Null means keyed on match_key (merchant_normalized) instead — ICICI truncates merchant names to ~10 chars, so the raw string is a weaker, more collision-prone key than entity identity. A later counterparty resolution can re-key a match_key series onto an entity by re-running detect_recurring_series() after the queue resolves it.';
comment on column public.recurring_series.median_cents is
  'Robust to the one-off noise real payees carry (e.g. an incidental transfer mixed into a landlord''s payment history) — median, not mean, and computed only over the amount-consistent cluster the detector found, not every transaction under the key.';

-- ============================================================
-- detect_recurring_series() — NOT invoked automatically. Run manually
-- and check against known ground truth before trusting it.
--
-- Method (validated against real data in conversation, not assumed):
--   1. Group debits by entity_id where transaction_flows.vpa_prefix
--      resolves via entity_keys, else by merchant_normalized.
--   2. Within each group, sort by amount and chain-cluster: start a new
--      cluster whenever the next amount exceeds the previous by more
--      than 25% (a "gaps and islands" window-function pattern, not a
--      fixed anchor — this is what lets rent's cumulative 34% drift
--      survive as one series, since no single step in it exceeds 16.8%,
--      while still splitting Google Play's two subscriptions, which are
--      34% apart in one step).
--   3. Keep clusters with 3+ occurrences whose date gaps (sorted
--      chronologically within the cluster) have a median of at least
--      5 days (excludes same-day/setup noise) and where at least half
--      the gaps fall within 50% of that median (tolerates one late/early
--      payment — rent's one 50-day gap among otherwise ~25-31 day gaps —
--      without accepting genuinely irregular person-to-person payments).
--   4. Upsert: match an existing row by (entity_id, or match_key when
--      entity_id is null) AND median within the same 25% tolerance —
--      not exact equality, since a drifting series' median moves between
--      runs. A row whose status is 'cancelled' is left untouched and
--      excluded from the returned count — a dismissed series must not
--      resurrect itself. status flips to 'lapsed' when last_seen is
--      older than interval_days * 1.5, recomputed fresh each run.
-- ============================================================
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
             max(entity_id) as entity_id,
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

revoke all on function public.detect_recurring_series() from public;
grant execute on function public.detect_recurring_series() to authenticated;
