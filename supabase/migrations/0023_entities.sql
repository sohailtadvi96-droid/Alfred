-- 0023_entities.sql
-- Phase 3a — counterparty identity, key mapping. NOT the lending ledger
-- (deferred to 0024). Supersedes the original plan's "extend people with
-- entity_type/default_category/resolved_at" — that's a one-row-per-vpa
-- model and the data is many-to-many (26 of 879 vpa_prefix values map to
-- more than one payee; conversely the same payee already appears under
-- multiple prefixes in the CURRENT people/ferrari_shops tables — see the
-- merges below). entity_keys is a proper join table so one entity can
-- hold many keys and a key is claimed by at most one entity (the unique
-- constraint).
--
-- people and ferrari_shops are left in place, populated, unread after
-- this migration — nothing is dropped. merchant_rules is untouched; it
-- stays the category-pinning mechanism, orthogonal to identity.

create table public.entities (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  display_name    text not null,
  entity_type     text not null check (entity_type in ('person', 'merchant', 'self')),
  default_category text,
  is_family       boolean not null default false,
  is_ferrari      boolean not null default false,
  notes           text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.entities enable row level security;
create policy "entities owner all" on public.entities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger entities_set_updated_at before update on public.entities
  for each row execute function public.set_updated_at();

create table public.entity_keys (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entity_id   uuid not null references public.entities(id) on delete cascade,
  key_type    text not null check (key_type in ('vpa_prefix', 'merchant_name', 'counterparty')),
  key_value   text not null,
  confidence  text not null check (confidence in ('exact', 'prefix')),
  created_at  timestamptz not null default now(),
  unique (user_id, key_type, key_value)
);

alter table public.entity_keys enable row level security;
create policy "entity_keys owner all" on public.entity_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index entity_keys_entity_idx on public.entity_keys (entity_id);

comment on column public.entity_keys.confidence is
  'exact = not a truncated prefix; cannot silently collide with an unrelated payee. prefix = a 14-char ICICI-truncated VPA, which can and does collide across unrelated payees. Neither value means "uniquely identifies this entity" — one entity may legitimately hold several exact keys (e.g. the same merchant under two distinct, genuinely different, untruncated VPAs — Mumbai Metro appears under both mml3afc@sbi, len 11, and mml3ncmc@sbi, len 12, both correctly exact). "exact" is a collision-risk statement, not a uniqueness guarantee.';

-- ============================================================
-- Migrate `people`. MERGE by (user_id, display_name), not row-per-row —
-- the source data already contains the many-to-many case this table
-- exists to fix: "Shubham Verule" has two rows, one per vpa
-- (9403677977@ybl, shubham.p.veru). A naive 1:1 copy recreates the exact
-- problem.
-- ============================================================
with grouped as (
  select user_id, display_name, bool_or(is_family) as is_family,
         (array_agg(note order by note nulls last))[1] as note,
         min(created_at) as created_at
  from public.people
  group by user_id, display_name
), inserted as (
  insert into public.entities (user_id, display_name, entity_type, is_family, notes, created_at, resolved_at)
  select user_id, display_name, 'person', is_family, note, created_at, now()
  from grouped
  returning id, user_id, display_name
)
insert into public.entity_keys (user_id, entity_id, key_type, key_value, confidence)
select p.user_id, i.id, 'vpa_prefix', p.vpa,
       case when length(p.vpa) = 14 then 'prefix' else 'exact' end
from public.people p
join inserted i on i.user_id = p.user_id and i.display_name = p.display_name
on conflict (user_id, key_type, key_value) do nothing;

-- ============================================================
-- Migrate `ferrari_shops`, same merge rule. Five names collapse: Dharmendra,
-- Guru Kripa, Mahammad S, Nazim Uddin, Salvi Prakash each have 2 vpas.
-- ============================================================
with grouped as (
  select user_id, display_name, min(created_at) as created_at
  from public.ferrari_shops
  group by user_id, display_name
), inserted as (
  insert into public.entities (user_id, display_name, entity_type, is_ferrari, created_at, resolved_at)
  select user_id, display_name, 'merchant', true, created_at, now()
  from grouped
  returning id, user_id, display_name
)
insert into public.entity_keys (user_id, entity_id, key_type, key_value, confidence)
select f.user_id, i.id, 'vpa_prefix', f.vpa,
       case when length(f.vpa) = 14 then 'prefix' else 'exact' end
from public.ferrari_shops f
join inserted i on i.user_id = f.user_id and i.display_name = f.display_name
on conflict (user_id, key_type, key_value) do nothing;

-- Pre-existing misclassification, migrated as-is per instruction — flagged,
-- not fixed. Both pinned prefixes for "Guru Kripa" and the sole pinned
-- prefix for "PCO Khan" also carry transactions for a different payee
-- name in the raw ledger (confirmed in conversation: q959268521@ybl and
-- q352469970@ybl both also show "Mrs Padmin"; q699301324@ybl also shows
-- "Mahammad S"). The My Ferrari tier is being applied to transactions
-- that aren't actually these two shops. Not unpicked here — that's a
-- queue-UI job (Step 3/4), and it can't be done blind from a migration.
update public.entities set notes =
  'Ambiguous: prefixes q959268521@ybl and q352469970@ybl also carry transactions for ''Mrs Padmin'' in the raw ledger. The My Ferrari tier may be misapplied to her spending too. Not disambiguated during migration — needs review in the resolution queue.'
where display_name = 'Guru Kripa' and entity_type = 'merchant';

update public.entities set notes =
  'Ambiguous: prefix q699301324@ybl also carries transactions for ''Mahammad S'' in the raw ledger. The My Ferrari tier may be misapplied. Not disambiguated during migration — needs review in the resolution queue.'
where display_name = 'PCO Khan' and entity_type = 'merchant';

-- ============================================================
-- merchant_rules audit: identities that are effectively already resolved
-- (a category pin exists) but have no people/ferrari_shops row at all.
-- Display names come from merchant_rules.merchant where set, otherwise
-- derived from transaction_flows.merchant_display for that key (checked
-- in conversation, not guessed). Two more many-to-many merges surfaced
-- here: Gangapur Wines (2 vpas) and Pop Tates (2 vpas) — merchant_rules
-- itself already agrees on the merchant name for both Gangapur Wines
-- rows, which is what caught it.
-- ============================================================
with defs(display_name, entity_type, default_category, notes) as (
  values
    ('Priyanka S', 'person', 'rent_household',
     'The landlord — pinned in merchant_rules (rent_household, 11 txns, ~₹1,33,483) but had no people row until this migration.'),
    ('Dimple Wines', 'merchant', 'alcohol', null),
    ('M S Mondys', 'merchant', 'dineout_stays', null),
    ('Imperia Salon', 'merchant', 'health_personal', null),
    ('House of Flavours', 'merchant', 'dineout_stays', null),
    ('Chak De Belgium', 'merchant', 'dineout_stays', null),
    ('Gangapur Wines', 'merchant', 'alcohol', null),
    ('Pop Tates', 'merchant', 'dineout_stays', null),
    ('Faraaz Lucknowi', 'merchant', 'dineout_stays', null),
    ('Baba Restaurant', 'merchant', 'dineout_stays', null),
    ('Jaihind', 'merchant', 'dineout_stays', null),
    ('Sai Laxmi', 'merchant', 'local_merchant', null)
),
inserted as (
  insert into public.entities (user_id, display_name, entity_type, default_category, notes, resolved_at)
  select u.id, d.display_name, d.entity_type, d.default_category, d.notes, now()
  from defs d cross join auth.users u
  returning id, user_id, display_name
),
keydefs(display_name, key_type, key_value) as (
  values
    ('Priyanka S', 'vpa_prefix', '8169849526@axl'),
    ('Dimple Wines', 'vpa_prefix', 'bharatpe.90500'),
    ('M S Mondys', 'vpa_prefix', 'eazypay.ntb110'),
    ('Imperia Salon', 'vpa_prefix', 'imperiasalonan'),
    ('House of Flavours', 'vpa_prefix', 'paytmqr5846oq0'),
    ('Chak De Belgium', 'vpa_prefix', 'paytmqr6b72oj@'),
    ('Gangapur Wines', 'vpa_prefix', 'paytmqr1mxgmq5'),
    ('Gangapur Wines', 'vpa_prefix', 'q250142930@ybl'),
    ('Pop Tates', 'vpa_prefix', 'poptatessakina'),
    ('Pop Tates', 'vpa_prefix', 'poptatestimess'),
    ('Faraaz Lucknowi', 'vpa_prefix', 'q136970485@ybl'),
    ('Baba Restaurant', 'vpa_prefix', 'q150216065@ybl'),
    ('Jaihind', 'counterparty', 'JAIHIND'),
    ('Sai Laxmi', 'counterparty', 'SAI LAXMI E')
)
insert into public.entity_keys (user_id, entity_id, key_type, key_value, confidence)
select i.user_id, i.id, k.key_type, k.key_value,
       case when k.key_type = 'vpa_prefix' and length(k.key_value) = 14 then 'prefix' else 'exact' end
from keydefs k
join inserted i on i.display_name = k.display_name
on conflict (user_id, key_type, key_value) do nothing;
