-- 0002_expenses.sql — Expenses module
-- Modular ingestion: source adapters → NormalizedTxn[] → ingest_transactions() → dedupe → categorize → transactions

-- ---------- accounts ----------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text,                         -- bank | credit | cash | wallet
  last4 text,
  created_at timestamptz not null default now()
);

-- ---------- ingestion sources (adapter registry) ----------
create table public.ingestion_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('gmail','statement','aa','sms')),
  name text not null,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'idle',
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- categorisation rules (user_id null = system default) ----------
create table public.category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  match_type text not null default 'contains' check (match_type in ('contains','equals','regex')),
  pattern text not null,
  direction text not null check (direction in ('debit','credit')),
  category text not null,
  priority int not null default 100,
  created_at timestamptz not null default now()
);
create index category_rules_lookup on public.category_rules (direction, priority);

-- ---------- transactions ----------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_at timestamptz not null,
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'INR',
  direction text not null check (direction in ('debit','credit')),
  merchant_raw text,
  merchant_normalized text,
  category text not null default 'misc',
  account_id uuid references public.accounts(id) on delete set null,
  source_type text not null default 'manual'
    check (source_type in ('gmail','statement','aa','sms','manual')),
  source_ref text,
  raw_snippet text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_type, source_ref)
);
create index transactions_user_time on public.transactions (user_id, occurred_at desc);
create index transactions_user_category on public.transactions (user_id, category);

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

-- ---------- gmail sync state (one row per user) ----------
create table public.gmail_sync_state (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  last_history_id text,
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger gmail_sync_state_set_updated_at
before update on public.gmail_sync_state
for each row execute function public.set_updated_at();

-- ---------- RLS ----------
alter table public.accounts          enable row level security;
alter table public.ingestion_sources enable row level security;
alter table public.transactions      enable row level security;
alter table public.gmail_sync_state  enable row level security;
alter table public.category_rules    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['accounts','ingestion_sources','transactions','gmail_sync_state'] loop
    execute format($f$
      create policy "%1$s owner all" on public.%1$s
        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    $f$, t);
  end loop;
end $$;

create policy "category_rules read" on public.category_rules
  for select using (user_id is null or auth.uid() = user_id);
create policy "category_rules write" on public.category_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- categorisation ----------
create or replace function public.categorize(p_merchant text, p_direction text)
returns text
language sql
stable
as $$
  select coalesce(
    (
      select r.category
      from public.category_rules r
      where r.direction = p_direction
        and (r.user_id is null or r.user_id = auth.uid())
        and (
          (r.match_type = 'contains' and p_merchant ilike '%' || r.pattern || '%') or
          (r.match_type = 'equals'   and lower(p_merchant) = lower(r.pattern)) or
          (r.match_type = 'regex'    and p_merchant ~* r.pattern)
        )
      order by (r.user_id is not null) desc, r.priority asc
      limit 1
    ),
    case when p_direction = 'credit' then 'person' else 'misc' end
  );
$$;

-- ---------- ingestion RPC ----------
-- p_rows: jsonb array of NormalizedTxn
--   { occurred_at, amount_cents, currency, direction, merchant_raw,
--     account_id?, external_ref, raw_snippet?, category? }
-- Dedupes on (user_id, source_type, external_ref). Returns rows inserted.
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
      source_type, source_ref, raw_snippet
    )
    values (
      v_uid,
      coalesce((r->>'occurred_at')::timestamptz, now()),
      (r->>'amount_cents')::bigint,
      coalesce(nullif(r->>'currency',''), 'INR'),
      r->>'direction',
      r->>'merchant_raw',
      nullif(lower(r->>'merchant_raw'), ''),
      coalesce(
        nullif(r->>'category',''),
        public.categorize(coalesce(r->>'merchant_raw',''), r->>'direction')
      ),
      nullif(r->>'account_id','')::uuid,
      p_source_type,
      nullif(r->>'external_ref',''),
      r->>'raw_snippet'
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
