-- 0019_flow_kind_null_fix.sql
-- Found during Phase 1 verification: transaction_flows.excluded_from_spend
-- came back NULL (not false) for any transaction whose category has
-- kind IS NULL — a legacy gap from before 0013 fully backfilled `kind`
-- (alcohol, grocery, online_shopping, ticket_booking, plus a few per-user
-- shadow rows). SQL three-valued logic: `coalesce(uc.kind, sc.kind) =
-- 'transfer'` is NULL, not false, when both sides are null, so `is_internal
-- or NULL` is NULL rather than false. flow_kind itself is unaffected (it
-- has its own direction-based fallback), but a future query written as
-- `where not excluded_from_spend` instead of `where flow_kind = 'expense'`
-- would silently drop these rows. Fixing both the root cause (backfill the
-- obviously-expense system categories) and the view (defensive `is true`).

update public.categories
set kind = 'expense'
where user_id is null
  and kind is null
  and slug in ('alcohol', 'grocery', 'online_shopping', 'ticket_booking');

create or replace view public.transaction_flows
with (security_invoker = on) as
select
  t.*,
  coalesce(
    uc.kind,
    sc.kind,
    case when t.direction = 'credit' then 'income' else 'expense' end
  ) as flow_kind,
  (t.is_internal or coalesce(uc.kind, sc.kind) = 'transfer') is true as excluded_from_spend
from public.transactions t
left join public.categories uc
  on uc.slug = t.category and uc.direction = t.direction and uc.user_id = t.user_id
left join public.categories sc
  on sc.slug = t.category and sc.direction = t.direction and sc.user_id is null;

grant select on public.transaction_flows to authenticated;
