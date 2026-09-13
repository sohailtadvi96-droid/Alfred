-- 0017_merchant_field_contract.sql
-- Phase 0 (expenses insights plan) follow-up. Two renames, no data rewrite:
--
-- 1. `merchant_raw` never held raw data — engineImport.ts always wrote the
--    *classified* display label into it (c.merchant from categorize.ts's
--    classify(), which can be a structural label like "ATM"/"Dot Syndicate"
--    or a merchant_rules alias, not the untouched narration). The real raw
--    narration has lived in `raw_snippet` since 0013. `counterparty` already
--    holds the pre-alias extracted payee segment. So the three-column
--    contract ALFRED actually wants already exists — `merchant_raw` just had
--    the wrong name for what it stores. Rename it to `merchant_display` so
--    the name stops promising something it doesn't deliver. Every current
--    reader (transaction list, review queue, "always X as Y" rule creation)
--    already wants the classified label, so this is a pure rename — no
--    behaviour change, and the 15 rows that diverge from `counterparty`
--    (ATM/FEE/INTEREST/salary channel matches — verified via matched_by =
--    'channel') are correct as-is once the column name stops lying about it.
--
-- 2. `vpa` is capped at 14 characters by ICICI in the statement PDF itself
--    (verified against fixtures/statement-categorised.csv — the ground-truth
--    narration, independent of our parser). It is a prefix, not a resolvable
--    VPA. Renamed to `vpa_prefix` so a future ingest source that supplies
--    full, untruncated VPAs (Gmail, SMS, Account Aggregator) can't be typo'd
--    into the same column and silently fail to join against these rows.
--
-- Note: `people.vpa`, `ferrari_shops.vpa`, and `merchant_rules.match_value`
-- (match_type = 'vpa') hold the *same* truncated-prefix values (see the 0013
-- seed data — e.g. 'prithvideshmuk' with no @bank suffix) and have the
-- identical naming problem. Left unrenamed here — that's a larger, separate
-- change touching every UI surface under People/Ferrari, and belongs with
-- Phase 3 (counterparty resolution) rather than this cleanup.

alter table public.transactions
  rename column merchant_raw to merchant_display;

alter table public.transactions
  rename column vpa to vpa_prefix;

alter index if exists idx_txn_vpa rename to idx_txn_vpa_prefix;

comment on column public.transactions.raw_snippet is
  'Complete, untransformed narration string as extracted from the source (PDF/SMS/email). Ground truth — never sliced, aliased, or reclassified. The only field guaranteed to survive a taxonomy change.';
comment on column public.transactions.counterparty is
  'Extracted payee/counterparty segment, pre-alias. Set once at parse time (categorize.ts normalize()); not touched by merchant_rules overrides.';
comment on column public.transactions.merchant_display is
  'Classified/display label: counterparty after merchant_rules aliasing and structural overrides (e.g. "ATM", "Dot Syndicate"). This is what the UI shows — not raw data. For the untouched narration, use raw_snippet.';
comment on column public.transactions.vpa_prefix is
  'UPI VPA as printed in the ICICI statement narration, capped at 14 characters by the bank itself — a PREFIX, not a full resolvable VPA (the handle suffix is frequently cut mid-domain). Do not assume uniqueness; do not treat as a stable identifier without also checking merchant_normalized for collisions. A future ingest source with full VPAs needs its own column, not this one.';

-- ============================================================
-- ingest_transactions — same JSON contract from the client (still keyed
-- 'merchant_raw' / 'vpa' in the payload; only the destination columns
-- change), now targeting the renamed columns.
-- ============================================================
create or replace function public.ingest_transactions(p_source_type text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inserted int := 0;
  r jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_source_type not in ('gmail','statement','aa','sms','manual') then
    raise exception 'unknown source_type %', p_source_type;
  end if;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    insert into public.transactions (
      user_id, occurred_at, amount_cents, currency, direction,
      merchant_display, merchant_normalized, category, account_id,
      source_type, source_ref, raw_snippet,
      channel, counterparty, vpa_prefix, remark, matched_by, confidence
    )
    values (
      v_uid,
      coalesce((r->>'occurred_at')::timestamptz, now()),
      (r->>'amount_cents')::bigint,
      coalesce(nullif(r->>'currency',''), 'INR'),
      r->>'direction',
      r->>'merchant_raw',
      nullif(lower(coalesce(r->>'merchant_normalized', r->>'merchant_raw', '')), ''),
      coalesce(
        nullif(r->>'category',''),
        public.categorize(coalesce(r->>'merchant_raw',''), r->>'direction')
      ),
      nullif(r->>'account_id','')::uuid,
      p_source_type,
      nullif(r->>'external_ref',''),
      r->>'raw_snippet',
      nullif(r->>'channel',''),
      nullif(r->>'counterparty',''),
      nullif(r->>'vpa',''),
      nullif(r->>'remark',''),
      nullif(r->>'matched_by',''),
      nullif(r->>'confidence','')
    )
    on conflict (user_id, source_type, source_ref) do nothing;
    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.ingest_transactions(text, jsonb) from public;
grant execute on function public.ingest_transactions(text, jsonb) to authenticated;

-- ============================================================
-- recategorize_all — update the column reference. (The 'misc'/'person'
-- slugs it targets were retired in 0014/0015, so this is effectively a
-- no-op against current data, but it must keep compiling.)
-- ============================================================
create or replace function public.recategorize_all()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  with upd as (
    update public.transactions t
    set category = public.categorize(coalesce(t.merchant_display, ''), t.direction),
        updated_at = now()
    where t.user_id = v_uid
      and (
        (t.direction = 'debit'  and t.category = 'misc') or
        (t.direction = 'credit' and t.category = 'person')
      )
      and public.categorize(coalesce(t.merchant_display, ''), t.direction) <> t.category
    returning 1
  )
  select count(*) into v_count from upd;

  return v_count;
end;
$$;

revoke all on function public.recategorize_all() from public;
grant execute on function public.recategorize_all() to authenticated;
