-- 0013_categorize_engine.sql
-- Adapts the "expense-tracker-setup" brief (02a-schema.sql / 02b-migration.sql)
-- to ALFRED's actual schema. Strictly additive — no DROP, no DELETE, no TRUNCATE.
--
-- Differences from the brief's 02a/02b and why:
--  * ALFRED already has transactions.direction ('debit'|'credit', NOT NULL,
--    populated on every row). The engine speaks 'DR'|'CR'; the app maps at the
--    boundary (features/expenses/taxonomy.ts). So NOTHING here touches direction,
--    and 02b's "strip money in/out from category name" steps do not apply.
--  * ALFRED already has a `categories` table (0007: id/slug/label/direction/
--    color/is_system). We do NOT replace it — we add a `kind` column and seed
--    the engine's taxonomy as system rows (slugs), keyed as ALFRED expects.
--  * `people` / `ferrari_shops` / `merchant_rules` are new, but RLS-scoped per
--    user (user_id default auth.uid()) like every other ALFRED table.
--  * Seeds run for the existing user(s) via `cross join auth.users` since a
--    migration has no auth.uid() context.

-- ============================================================
-- 1. transactions — parsed fields from the engine
-- ============================================================
alter table public.transactions
  add column if not exists channel      text,
  add column if not exists counterparty text,
  add column if not exists vpa          text,
  add column if not exists remark       text,
  add column if not exists matched_by   text,
  add column if not exists confidence   text;

create index if not exists idx_txn_vpa on public.transactions (user_id, vpa);

-- ============================================================
-- 2. people — user-managed family list, keyed on VPA
-- ============================================================
create table if not exists public.people (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vpa          text not null,
  display_name text,
  is_family    boolean not null default false,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, vpa)
);
create index if not exists idx_people_family on public.people (user_id) where is_family;

drop trigger if exists people_set_updated_at on public.people;
create trigger people_set_updated_at before update on public.people
  for each row execute function public.set_updated_at();

alter table public.people enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='people' and policyname='people owner all') then
    create policy "people owner all" on public.people
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- seed (family + frequent non-family payees) for existing user(s)
insert into public.people (user_id, vpa, display_name, is_family, note)
select u.id, s.vpa, s.display_name, s.is_family, s.note
from auth.users u
cross join (values
  ('tadvianjum73@o','Anjum Tadvi',   true,  'seeded'),
  ('jahangir.tadvi','Jahangir Tadvi',true,  'seeded'),
  ('shounaktadvi-1','Shounak Tadvi', true,  'seeded'),
  ('nayanatadvi196','Nayana Tadvi',  true,  'seeded'),
  ('adwaithshetty4','Adwaith',       false, null),
  ('prachibaveja20','Prachi',        false, null),
  ('prithvideshmuk','Pruthvi',       false, null),
  ('8308242406@ybl','Paritosh',      false, null),
  ('shubham.p.veru','Shubham Verule',false, null),
  ('9403677977@ybl','Shubham Verule',false, null),
  ('ayushm0101-1@o','Ayush',         false, null),
  ('kanadenikhil95','Nikhil',        false, null),
  ('9867763843@pth','Arnab',         false, null),
  ('devdalvi714@ok','Dev Dalvi',     false, null),
  ('drishtiswar001','Drishti',       false, null)
) as s(vpa, display_name, is_family, note)
on conflict (user_id, vpa) do nothing;

-- ============================================================
-- 3. ferrari_shops — pinned merchant QRs for the "My Ferrari" tier
-- ============================================================
create table if not exists public.ferrari_shops (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vpa          text not null,
  display_name text,
  added_by     text not null default 'seed' check (added_by in ('seed','manual','detector')),
  created_at   timestamptz not null default now(),
  unique (user_id, vpa)
);

alter table public.ferrari_shops enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ferrari_shops' and policyname='ferrari_shops owner all') then
    create policy "ferrari_shops owner all" on public.ferrari_shops
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

insert into public.ferrari_shops (user_id, vpa, display_name)
select u.id, s.vpa, s.display_name
from auth.users u
cross join (values
  ('paytm.s20l53x@','Mahammad S'), ('q959268521@ybl','Guru Kripa'),
  ('q699301324@ybl','PCO Khan'),   ('q352469970@ybl','Guru Kripa'),
  ('paytmqr6w0av5@','Dharmendra'), ('paytm.s28e4p0@','Nazim Uddin'),
  ('paytm.s24gzy8@','Dharmendra'), ('q844291349@ybl','Nizam Pan'),
  ('paytmqr5d3v1o@','Salvi Prakash'),('yespay.bizs.bi','Nasir Husain'),
  ('paytmqr70j253@','Nazim Uddin'),('gpay-121967272','Faiyaj'),
  ('q132663479@ybl','Sanjay Bhu'), ('q215059646@ybl','Mahammad S'),
  ('paytmqrtv8ktii','Salvi Prakash'),('q042303250@ybl','Anas Khan'),
  ('q110287100@ybl','New Kohinoor'),('paytmqr6tecnd@','Safi Khan')
) as s(vpa, display_name)
on conflict (user_id, vpa) do nothing;

-- ============================================================
-- 4. merchant_rules — learned category pins (engine Tier 0)
--    Distinct from ALFRED's regex `category_rules`; the engine's overrides
--    Map is exact-match on vpa OR uppercased counterparty.
-- ============================================================
create table if not exists public.merchant_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  match_type  text not null check (match_type in ('vpa','counterparty')),
  match_value text not null,
  category    text not null,           -- engine category NAME (mapped to slug at read time)
  merchant    text,
  source      text not null default 'manual' check (source in ('manual','ai','seed')),
  created_at  timestamptz not null default now(),
  unique (user_id, match_type, match_value)
);

alter table public.merchant_rules enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='merchant_rules' and policyname='merchant_rules owner all') then
    create policy "merchant_rules owner all" on public.merchant_rules
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

insert into public.merchant_rules (user_id, match_type, match_value, category, merchant, source)
select u.id, s.match_type, s.match_value, s.category, s.merchant, 'seed'
from auth.users u
cross join (values
  ('vpa','8169849526@axl','Rent & Household','Priyanka (household/rent)'),
  ('vpa','poptatestimess','Dineout & Stays','Pop Tates'),
  ('vpa','poptatessakina','Dineout & Stays','Pop Tates'),
  ('vpa','q136970485@ybl','Dineout & Stays','Faraaz Lucknowi'),
  ('vpa','imperiasalonan','Health & Personal','Imperia Salon'),
  ('vpa','paytmqr5846oq0','Dineout & Stays','House of Flavours'),
  ('vpa','eazypay.ntb110','Dineout & Stays','M S Mondys'),
  ('vpa','paytmqr6b72oj@','Dineout & Stays','Chak De Belgium'),
  ('vpa','q150216065@ybl','Dineout & Stays','Baba Restaurant'),
  ('counterparty','JAIHIND','Dineout & Stays','Jai Hind'),
  ('counterparty','SAI LAXMI E','Local Merchant','Sai Laxmi')
) as s(match_type, match_value, category, merchant)
on conflict (user_id, match_type, match_value) do nothing;

-- ============================================================
-- 5. categories — add `kind`, seed the engine taxonomy as system slugs
--    (ALFRED's categories are keyed (slug, direction); expense/transfer slugs
--     get a debit row, income slugs a credit row, catch-alls both.)
-- ============================================================
alter table public.categories
  add column if not exists kind text check (kind in ('expense','income','transfer'));

insert into public.categories (user_id, slug, label, direction, color, sort, is_system, kind)
select null, s.slug, s.label, s.direction, s.color, s.sort, true, s.kind
from (values
  ('salary',             'Salary',              'credit', '#6E9B5F', 1,  'income'),
  ('income',             'Income',              'credit', '#6E9B5F', 2,  'income'),
  ('money_received',     'Money Received',      'credit', '#7FA86B', 3,  'income'),
  ('rent_household',     'Rent & Household',    'debit',  '#BC6250', 10, 'expense'),
  ('dineout_stays',      'Dineout & Stays',     'debit',  '#C86B54', 11, 'expense'),
  ('food_delivery',      'Food Delivery',       'debit',  '#D6994F', 12, 'expense'),
  ('grocery',            'Grocery',             'debit',  '#8D9E79', 13, 'expense'),
  ('alcohol',            'Alcohol',             'debit',  '#93839F', 14, 'expense'),
  ('my_ferrari',         'My Ferrari',          'debit',  '#B5524A', 15, 'expense'),
  ('daily_spends',       'Daily Spends',        'debit',  '#7E97AB', 16, 'expense'),
  ('local_merchant',     'Local Merchant',      'debit',  '#BF8B84', 17, 'expense'),
  ('cab_transport',      'Cab & Transport',     'debit',  '#6E8CA8', 18, 'expense'),
  ('ticket_booking',     'Ticket Booking',      'debit',  '#D99A5B', 19, 'expense'),
  ('online_shopping',    'Online Shopping',     'debit',  '#7E97AB', 20, 'expense'),
  ('subscriptions',      'Subscriptions',       'debit',  '#93839F', 21, 'expense'),
  ('work_software',      'Work & Software',     'debit',  '#6E9B5F', 22, 'expense'),
  ('bills_recharge',     'Bills & Recharge',    'debit',  '#C08E5A', 23, 'expense'),
  ('health_personal',    'Health & Personal',   'debit',  '#A9736B', 24, 'expense'),
  ('entertainment',      'Entertainment',       'debit',  '#9683A8', 25, 'expense'),
  ('fuel',               'Fuel',                'debit',  '#C08E5A', 26, 'expense'),
  ('bank_charges',       'Bank Charges',        'debit',  '#8195A6', 27, 'expense'),
  ('cash_withdrawal',    'Cash Withdrawal',     'debit',  '#8195A6', 40, 'transfer'),
  ('family',             'Family',              'debit',  '#BF8B84', 41, 'transfer'),
  ('person_transactions','Person Transactions', 'debit',  '#B98A86', 42, 'transfer'),
  ('card_unclassified',  'Card — Unclassified', 'debit',  '#6E6656', 98, 'expense'),
  ('uncategorised',      'Uncategorised',       'debit',  '#6E6656', 99, 'expense')
) as s(slug, label, direction, color, sort, kind)
on conflict do nothing;

-- expense/catch-all slugs also need a credit row (merchant refunds keep the
-- merchant category with direction = 'credit')
insert into public.categories (user_id, slug, label, direction, color, sort, is_system, kind)
select null, c.slug, c.label, 'credit', c.color, c.sort, true, c.kind
from public.categories c
where c.user_id is null
  and c.direction = 'debit'
  and c.kind in ('expense')
on conflict do nothing;

-- ============================================================
-- 6. ingest_transactions — persist the engine's parsed fields.
--    Client now runs categorise() and supplies category (a slug) + fields;
--    the SQL fallback (public.categorize) stays for rows that arrive bare.
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
      merchant_raw, merchant_normalized, category, account_id,
      source_type, source_ref, raw_snippet,
      channel, counterparty, vpa, remark, matched_by, confidence
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
