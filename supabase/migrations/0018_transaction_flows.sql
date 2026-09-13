-- 0018_transaction_flows.sql
-- Phase 1 (expenses insights plan) — transfers out of spend.
--
-- Investigation (see conversation, not repeated in full here) found the
-- plan's assumptions were half right:
--  * cash_withdrawal was already kind='transfer' since 0013.
--  * self_transfer / credit_card_payment did not exist as slugs at all.
--  * family and person_transactions were ALSO already kind='transfer'
--    since 0013's original seed — which is wrong under this plan's own
--    definition of transfer (movement between the user's own accounts).
--    Leaving them as transfer would silently exclude ₹6,359 of September's
--    real (if unattributed) spend and break the ₹15,409 target. Corrected
--    here on explicit confirmation.
--  * The same-amount/48h pairing heuristic finds exactly one candidate in
--    the whole dataset today, and it's a false positive (unrelated
--    pre-existing categories on both legs). pair_internal_transfers() is
--    defined but deliberately not invoked by this migration — it's run
--    manually, checked against evidence, before it's trusted on real data.

-- ============================================================
-- 1. Taxonomy correction
-- ============================================================
update public.categories
set kind = 'expense'
where user_id is null
  and slug in ('family', 'person_transactions')
  and kind = 'transfer';

update public.categories
set kind = 'transfer'
where user_id is null
  and slug = 'cash_withdrawal';

insert into public.categories (user_id, slug, label, direction, color, sort, is_system, kind)
values
  (null, 'self_transfer',      'Self Transfer',       'debit', '#8195A6', 43, true, 'transfer'),
  (null, 'credit_card_payment','Credit Card Payment', 'debit', '#8195A6', 44, true, 'transfer')
on conflict do nothing;

-- credit-side rows too (a self-transfer's incoming leg, or a CC payment
-- refund, keep the same category with direction = 'credit')
insert into public.categories (user_id, slug, label, direction, color, sort, is_system, kind)
select null, slug, label, 'credit', color, sort, true, kind
from public.categories
where user_id is null
  and direction = 'debit'
  and slug in ('self_transfer', 'credit_card_payment')
on conflict do nothing;

-- ============================================================
-- 2. Pairing columns
-- ============================================================
alter table public.transactions
  add column if not exists transfer_group_id uuid,
  add column if not exists is_internal boolean not null default false;

create index if not exists transactions_transfer_group_idx
  on public.transactions (user_id, transfer_group_id)
  where transfer_group_id is not null;

-- ============================================================
-- 3. pair_internal_transfers() — NOT called by this migration.
--    Run manually: select public.pair_internal_transfers();
--    Returns full detail (paired + skipped) rather than a bare count, so
--    the result can be checked against manual inspection before trusting
--    it on real data — the September/whole-dataset check found only one
--    candidate pair, and it was a false positive.
--
--    "Nearest in time" ambiguity: if a debit has 2+ unclaimed credit
--    candidates, the two closest are compared by their distance FROM THE
--    DEBIT; if those two distances are within 1 hour of each other, the
--    "nearest" pick isn't a confident choice, so the debit is skipped and
--    reported rather than guessed.
-- ============================================================
create or replace function public.pair_internal_transfers()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_paired jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_gid uuid;
  d record;
  cand record;
  v_best_credit uuid;
  v_best_secs numeric;
  v_second_secs numeric;
  v_count int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  for d in
    select id, account_id, amount_cents, occurred_at
    from public.transactions
    where user_id = v_uid
      and direction = 'debit'
      and transfer_group_id is null
    order by occurred_at
  loop
    v_best_credit := null;
    v_best_secs := null;
    v_second_secs := null;
    v_count := 0;

    for cand in
      select c.id, abs(extract(epoch from c.occurred_at - d.occurred_at)) as secs
      from public.transactions c
      where c.user_id = v_uid
        and c.direction = 'credit'
        and c.transfer_group_id is null
        and c.account_id <> d.account_id
        and c.amount_cents = d.amount_cents
        and c.occurred_at between d.occurred_at - interval '48 hours'
                              and d.occurred_at + interval '48 hours'
      order by abs(extract(epoch from c.occurred_at - d.occurred_at))
    loop
      v_count := v_count + 1;
      if v_count = 1 then
        v_best_credit := cand.id;
        v_best_secs := cand.secs;
      elsif v_count = 2 then
        v_second_secs := cand.secs;
      end if;
    end loop;

    if v_count = 0 then
      continue;
    elsif v_count > 1 and (v_second_secs - v_best_secs) < 3600 then
      v_skipped := v_skipped || jsonb_build_object(
        'debit_id', d.id,
        'amount_cents', d.amount_cents,
        'occurred_at', d.occurred_at,
        'candidate_count', v_count,
        'reason', 'ambiguous — two or more credit candidates within 1h of each other'
      );
    else
      v_gid := gen_random_uuid();
      update public.transactions set transfer_group_id = v_gid, is_internal = true where id = d.id;
      update public.transactions set transfer_group_id = v_gid, is_internal = true where id = v_best_credit;
      v_paired := v_paired || jsonb_build_object(
        'debit_id', d.id,
        'credit_id', v_best_credit,
        'amount_cents', d.amount_cents,
        'occurred_at', d.occurred_at
      );
    end if;
  end loop;

  return jsonb_build_object(
    'paired_count', jsonb_array_length(v_paired), 'paired', v_paired,
    'skipped_count', jsonb_array_length(v_skipped), 'skipped', v_skipped
  );
end;
$$;

revoke all on function public.pair_internal_transfers() from public;
grant execute on function public.pair_internal_transfers() to authenticated;

-- ============================================================
-- 4. transaction_flows — the only place spend/income/transfer totals may
--    be computed from. security_invoker mirrors account_balances (0006):
--    the view runs with the QUERYING user's own permissions, so RLS on
--    `transactions` (and `categories`) applies exactly as if queried
--    directly — no security definer, no RLS bypass.
-- ============================================================
create or replace view public.transaction_flows
with (security_invoker = on) as
select
  t.*,
  coalesce(
    uc.kind,
    sc.kind,
    case when t.direction = 'credit' then 'income' else 'expense' end
  ) as flow_kind,
  (t.is_internal or coalesce(uc.kind, sc.kind) = 'transfer') as excluded_from_spend
from public.transactions t
left join public.categories uc
  on uc.slug = t.category and uc.direction = t.direction and uc.user_id = t.user_id
left join public.categories sc
  on sc.slug = t.category and sc.direction = t.direction and sc.user_id is null;

grant select on public.transaction_flows to authenticated;
