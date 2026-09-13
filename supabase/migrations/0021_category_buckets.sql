-- 0021_category_buckets.sql
-- Phase 5 (expenses insights plan) — needs/wants axis.
--
-- bucket applies to expense-kind categories only. Income and transfer rows
-- (and the two low-confidence catch-alls, card_unclassified/uncategorised)
-- stay null on purpose — null means "not applicable" or "not yet resolved",
-- not "forgot to bucket this". The UI and any aggregate must treat it that
-- way: an explicit unbucketed segment, never silently dropped or folded
-- into "need" by default.
--
-- person_transactions is deliberately left null too: the largest rows
-- under it are one-off transfers to named individuals (₹9,910, ₹6,500,
-- ₹6,000...), not consumption — closer to lending money than a want/need.
-- Bucketing it would be a guess dressed up as data; Phase 3's counterparty
-- resolution is what actually answers this, not a taxonomy default.

alter table public.categories
  add column bucket text check (bucket in ('need', 'want', 'obligation', 'invest'));

-- ============================================================
-- Seed system rows. Matches both direction variants of a slug (a refund
-- keeps its category on the credit side, still kind = 'expense') —
-- bucket follows kind, not direction.
-- ============================================================
update public.categories set bucket = 'need'
where user_id is null and kind = 'expense'
  and slug in ('grocery', 'rent_household', 'bills_recharge', 'cab_transport', 'fuel', 'health_personal');

update public.categories set bucket = 'want'
where user_id is null and kind = 'expense'
  and slug in (
    'food_delivery', 'dineout_stays', 'alcohol', 'online_shopping', 'entertainment',
    'daily_spends', 'local_merchant', 'subscriptions', 'ticket_booking', 'my_ferrari'
  );

update public.categories set bucket = 'obligation'
where user_id is null and kind = 'expense'
  and slug in ('bank_charges', 'family');

-- invest: no slug maps here yet — no SIP/savings/investment category
-- exists in this taxonomy. Left for when one does.

-- card_unclassified, uncategorised, person_transactions: left null, on purpose (see above).

-- ============================================================
-- upsert_category — accepts bucket so per-user overrides work. One
-- person's alcohol is a want, another's transport is an obligation. A
-- user row shadowing a system row carries its own bucket (or null, if
-- they haven't set one — falls back to the system default via the
-- shadowing rule already in resolveCategories()).
-- ============================================================
create or replace function public.upsert_category(
  p_slug text, p_label text, p_direction text, p_color text, p_sort int default 100,
  p_bucket text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_direction not in ('debit','credit') then raise exception 'bad direction'; end if;
  if p_bucket is not null and p_bucket not in ('need','want','obligation','invest') then
    raise exception 'bad bucket %', p_bucket;
  end if;
  insert into public.categories (user_id, slug, label, direction, color, sort, bucket)
  values (v_uid, p_slug, coalesce(nullif(p_label, ''), p_slug), p_direction, p_color, coalesce(p_sort, 100), p_bucket)
  on conflict (user_id, slug, direction) where user_id is not null
  do update set label = excluded.label, color = excluded.color, sort = excluded.sort, bucket = excluded.bucket;
end $$;

revoke all on function public.upsert_category(text, text, text, text, int, text) from public;
grant execute on function public.upsert_category(text, text, text, text, int, text) to authenticated;

-- the old 5-arg signature is superseded — drop it so there's exactly one
-- upsert_category to call (PostgREST resolves overloads by argument
-- names in the request body, and a stale 5-arg version left around would
-- silently accept calls that omit bucket and never persist it).
drop function if exists public.upsert_category(text, text, text, text, int);
