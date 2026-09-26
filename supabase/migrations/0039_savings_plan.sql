-- 0039_savings_plan.sql — Goals Phase B, part 2: the savings coach.
-- savings_plan(goal) answers "what would it take to hit this savings_target
-- this month, and is it even possible?" It never writes and never stores a
-- total: every figure is recomputed on read.
--
-- Plain SQL, stable, security INVOKER (same reasoning as 0020/0034/0035 —
-- every table it reads is owner-all RLS, so running as the caller is enough).
-- Reads transaction_flows for spend, goal_current_value (0034/0038) for the
-- meter, and recurring_series for the subscriptions list. It does NOT call
-- detect_recurring_series() (security definer, manual-only).
--
-- Returns jsonb. null = no such goal for this caller (same convention as
-- goal_current_value). {"error": …} = the goal exists but this function can't
-- plan for it (wrong source.kind, or a cadence other than monthly).
--
-- ---------- the gap, and the honest projection ----------
-- goal_pace's expectation is linear (target × elapsed fraction) and is
-- knowingly wrong for a lump-sum salary, so the truthful month-end number
-- lives here:
--   meter_to_date      goal_current_value over [month start, as_of]
--   as_of              the LAST TRANSACTION DAY in the current month, never
--                      today — same rule as lib/periodComparison.ts: a ledger
--                      that stops at the 20th must not read as a collapse
--   remaining_net_avg  for each of the last 3 complete months, the meter over
--                      the SAME day-span (day N+1 … month end), averaged. It is
--                      the meter itself, so income_categories and the
--                      money_received exclusion apply identically
--   projected_month_end = meter_to_date + remaining_net_avg
--   gap                target − meter_to_date          (floored at 0)
--   projected_gap      target − projected_month_end    (floored at 0)
-- Cuts are packed against projected_gap: it is the month-end number the goal
-- is judged on. Recoverable amounts are full-month figures, so for a partly
-- elapsed month they are an upper bound.
--
-- ---------- the ranking pool ----------
-- Debits in want-bucket categories, the bucket read as
-- coalesce(uc.bucket, sc.bucket) through the same user/system shadow-row joins
-- transaction_flows uses (0018/0019), plus person_transactions (no bucket)
-- under the approved threshold-only rule: rows of ₹1,000 and up are lending-
-- shaped and never enter the pool. person_transactions is ONE pooled line,
-- never per payee (most payees are one-offs).
--
-- Per category, over COMPLETE months only (the ledger's first partial month
-- and the current month are both out; months with no spend count as 0):
--   avg_last3 / txns_per_month / avg_ticket   over the last 3 complete months
--   floor         lowest complete-month total in the whole complete history
--   data_points   how many complete months the floor rests on
--   trend         average of the last 2 complete months vs the earlier ones
--                 (±10% band = flat)
--   recoverable   max(0, avg_last3 − floor)
--   lever         'frequency' when avg_ticket < ₹300, else 'ticket_size'
-- A floor of 0 (a category that was skipped entirely in some month) makes the
-- whole average recoverable — that is the honest "you have done without it".
--
-- ---------- packing and feasibility ----------
-- Lines ranked by recoverable desc; each takes min(recoverable, gap left), so
-- no category is ever pushed below its own floor. feasible when total
-- recoverable covers projected_gap, else infeasible with the shortfall (what
-- cuts cannot find — the earn / extend side). No complete month at all →
-- insufficient_history.
create or replace function public.savings_plan(p_goal_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with
  g as (
    select id, target, cadence, source ->> 'kind' as kind
    from public.goals
    where id = p_goal_id and user_id = auth.uid()
  ),
  -- BEGIN shared pool (also run standalone against prod to sanity-check the figures)
  tz as (
    select coalesce((select timezone from public.profiles where id = auth.uid()), 'UTC') as name
  ),
  cur as (
    select date_trunc('month', now() at time zone tz.name)::date as m_start,
           (date_trunc('month', now() at time zone tz.name) + interval '1 month' - interval '1 day')::date as m_end,
           (now() at time zone tz.name)::date as today
    from tz
  ),
  ledger as (
    select min(occurred_at::date) as first_day
    from public.transaction_flows
    where user_id = auth.uid()
  ),
  -- first complete month = the ledger's first month only if it starts on the
  -- 1st, else the month after; last complete month = the month before now.
  bounds as (
    select case when l.first_day is null then null
                when l.first_day = date_trunc('month', l.first_day)::date then l.first_day
                else (date_trunc('month', l.first_day) + interval '1 month')::date
           end as first_m,
           (cur.m_start - interval '1 month')::date as last_m
    from ledger l cross join cur
  ),
  months as (
    select mm::date as m_start,
           (mm + interval '1 month' - interval '1 day')::date as m_end,
           row_number() over (order by mm desc) as recency  -- 1 = most recent complete month
    from bounds b,
         generate_series(b.first_m::timestamp, b.last_m::timestamp, interval '1 month') mm
  ),
  pool as (
    select f.category as cat, f.amount_cents, mo.m_start
    from public.transaction_flows f
    join months mo on f.occurred_at::date between mo.m_start and mo.m_end
    left join public.categories uc
      on uc.slug = f.category and uc.direction = f.direction and uc.user_id = f.user_id
    left join public.categories sc
      on sc.slug = f.category and sc.direction = f.direction and sc.user_id is null
    where f.user_id = auth.uid()
      and f.direction = 'debit'
      and f.flow_kind = 'expense'
      and not f.excluded_from_spend
      and (coalesce(uc.bucket, sc.bucket) = 'want' or f.category = 'person_transactions')
      and (f.category <> 'person_transactions' or f.amount_cents < 100000)
  ),
  grid as (
    select c.cat, mo.m_start, mo.recency
    from (select distinct cat from pool) c cross join months mo
  ),
  cat_month as (  -- zero-filled: a month with no spend is a 0, not a gap
    select gr.cat, gr.recency,
           coalesce(sum(p.amount_cents), 0) as cents,
           count(p.amount_cents) as n
    from grid gr
    left join pool p on p.cat = gr.cat and p.m_start = gr.m_start
    group by gr.cat, gr.recency
  ),
  stats as (
    select cat,
           count(*) as data_points,
           min(cents) / 100.0 as floor_r,
           sum(cents) filter (where recency <= 3) / 100.0 as t3,
           sum(n) filter (where recency <= 3) as n3,
           count(*) filter (where recency <= 3) as m3,
           avg(cents) filter (where recency <= 2) / 100.0 as l2,
           avg(cents) filter (where recency > 2) / 100.0 as earlier
    from cat_month
    group by cat
  ),
  lines as (
    select cat, data_points, floor_r, t3, n3, m3, l2, earlier,
           t3 / m3 as avg3,
           greatest(0, t3 / m3 - floor_r) as rec
    from stats
  ),
  -- END shared pool
  asof as (
    select coalesce(
             (select max(f.occurred_at::date) from public.transaction_flows f
              where f.user_id = auth.uid() and f.occurred_at::date between cur.m_start and cur.today),
             cur.m_start - 1) as d,
           cur.m_start, cur.m_end
    from cur
  ),
  meter as (
    select public.goal_current_value(p_goal_id, asof.m_start, asof.d) as mtd from asof
  ),
  -- same day-span (day N+1 … month end) in each of the last 3 complete months
  rem as (
    select public.goal_current_value(p_goal_id, mo.m_start + (asof.d - asof.m_start + 1), mo.m_end) as net
    from months mo cross join asof
    where mo.recency <= 3
  ),
  gapc as (
    select g.target,
           meter.mtd,
           coalesce((select avg(net) from rem), 0) as rem_avg,
           (select count(*) from rem) as rem_months,
           meter.mtd + coalesce((select avg(net) from rem), 0) as projected
    from g cross join meter
  ),
  gapf as (
    select *, greatest(0, target - mtd) as gap, greatest(0, target - projected) as pgap from gapc
  ),
  ranked as (
    select l.*,
           row_number() over (order by rec desc, cat) as rk,
           coalesce(sum(rec) over (order by rec desc, cat rows between unbounded preceding and 1 preceding), 0) as cum_before
    from lines l
  ),
  packed as (
    select r.*, greatest(0, least(r.rec, gapf.pgap - r.cum_before)) as cut
    from ranked r cross join gapf
  ),
  subs as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'match_key', match_key,
             'median_cents', median_cents,
             'interval_days', interval_days,
             'occurrence_count', occurrence_count,
             'last_seen', last_seen,
             'next_expected', next_expected
           ) order by median_cents desc, match_key), '[]'::jsonb) as list
    from public.recurring_series
    where user_id = auth.uid() and status = 'active' and category = 'subscriptions'
  ),
  totals as (
    select coalesce(sum(avg3), 0) as avg3, coalesce(sum(floor_r), 0) as floors,
           coalesce(sum(rec), 0) as rec, coalesce(sum(cut), 0) as cut,
           (select count(*) from months) as data_points
    from packed
  )
  select case
    when g.kind is distinct from 'savings_target' then jsonb_build_object('error', 'not_a_savings_target')
    when g.cadence <> 'monthly' then jsonb_build_object('error', 'unsupported_cadence', 'cadence', g.cadence)
    else jsonb_build_object(
      'goal_id', g.id,
      'period', jsonb_build_object('start', asof.m_start, 'end', asof.m_end, 'as_of', asof.d),
      'target', g.target,
      'meter_to_date', round(gapf.mtd, 2),
      'gap', round(gapf.gap, 2),
      'projection', jsonb_build_object(
        'method', 'meter to date + average net over the same day-span of the last 3 complete months',
        'months_used', gapf.rem_months,
        'remaining_net_avg', round(gapf.rem_avg, 2),
        'projected_month_end', round(gapf.projected, 2),
        'projected_gap', round(gapf.pgap, 2)
      ),
      'history', jsonb_build_object(
        'data_points', totals.data_points,
        'first_complete_month', (select min(m_start) from months),
        'last_complete_month', (select max(m_start) from months)
      ),
      'pool', jsonb_build_object(
        'avg_last3_total', round(totals.avg3, 2),
        'floors_total', round(totals.floors, 2),
        'recoverable_total', round(totals.rec, 2),
        'suggested_cut_total', round(totals.cut, 2),
        'lines', coalesce((select jsonb_agg(jsonb_build_object(
            'rank', p.rk,
            'category', p.cat,
            'pooled', p.cat = 'person_transactions',
            'total_last3', round(p.t3, 2),
            'avg_last3', round(p.avg3, 2),
            'txns_per_month', round(p.n3::numeric / p.m3, 1),
            'avg_ticket', round(p.t3 / nullif(p.n3, 0), 2),
            'floor', round(p.floor_r, 2),
            'data_points', p.data_points,
            'trend', jsonb_build_object(
              'last2_avg', round(p.l2, 2),
              'earlier_avg', round(p.earlier, 2),
              'delta_pct', case when p.earlier > 0 then round((p.l2 - p.earlier) / p.earlier * 100, 0) end,
              'direction', case
                when p.earlier is null then null
                when p.earlier = 0 then case when p.l2 > 0 then 'up' else 'flat' end
                when (p.l2 - p.earlier) / p.earlier > 0.10 then 'up'
                when (p.l2 - p.earlier) / p.earlier < -0.10 then 'down'
                else 'flat' end
            ),
            'recoverable', round(p.rec, 2),
            'lever', case when p.t3 / nullif(p.n3, 0) < 300 or p.n3 = 0 then 'frequency' else 'ticket_size' end,
            'suggested_cut', round(p.cut, 2)
          ) order by p.rk) from packed p), '[]'::jsonb)
      ),
      'feasibility', case
        when totals.data_points = 0 then 'insufficient_history'
        when totals.rec >= gapf.pgap then 'feasible'
        else 'infeasible' end,
      'already_on_track', gapf.pgap = 0,
      'shortfall', case when totals.data_points > 0 and totals.rec < gapf.pgap
                        then round(gapf.pgap - totals.rec, 2) end,
      'subscriptions', subs.list
    ) end
  from g
  cross join asof
  cross join gapf
  cross join totals
  cross join subs;
$$;

revoke all on function public.savings_plan(uuid) from public;
grant execute on function public.savings_plan(uuid) to authenticated;
