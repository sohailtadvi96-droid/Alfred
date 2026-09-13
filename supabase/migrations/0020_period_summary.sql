-- 0020_period_summary.sql
-- Phase 4 (expenses insights plan) — honest comparisons, part A.
--
-- Reads transaction_flows exclusively, per Phase 1's rule that no query
-- outside that view computes a total from transactions.direction. Returns
-- expense/income/transfer as separate rows — the plan's own draft had
-- `and not excluded_from_spend` in the where clause, which would silently
-- drop transfers from the result entirely; the caller decides what to do
-- with each flow_kind, this function doesn't pre-filter.
--
-- Plain SQL function, no `security definer` — transaction_flows already
-- runs security_invoker, so this stays consistent: auth.uid() resolves to
-- the calling user and RLS applies exactly as if queried directly.
create or replace function public.period_summary(p_from date, p_to date)
returns table (flow_kind text, total_cents bigint, txn_count bigint)
language sql
stable
set search_path = public
as $$
  select
    flow_kind,
    sum(amount_cents)::bigint as total_cents,
    count(*)::bigint as txn_count
  from public.transaction_flows
  where user_id = auth.uid()
    and occurred_at::date between p_from and p_to
  group by flow_kind;
$$;

revoke all on function public.period_summary(date, date) from public;
grant execute on function public.period_summary(date, date) to authenticated;
