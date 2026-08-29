-- 0006_accounts_balance.sql — opening balance + a live per-account balance view

alter table public.accounts
  add column if not exists opening_balance_cents bigint not null default 0;

-- balance = opening + sum(credits) - sum(debits); respects RLS on the base tables
create or replace view public.account_balances
with (security_invoker = on) as
select
  a.id            as account_id,
  a.user_id       as user_id,
  a.name          as name,
  a.type          as type,
  a.last4         as last4,
  a.opening_balance_cents,
  a.opening_balance_cents
    + coalesce(sum(case t.direction when 'credit' then t.amount_cents else -t.amount_cents end), 0)
                  as balance_cents
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id;

grant select on public.account_balances to authenticated;
