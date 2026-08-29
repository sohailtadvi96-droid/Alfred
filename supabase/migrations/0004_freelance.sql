-- 0004_freelance.sql — Work / Freelance module

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  email text,
  billing_address text,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  client_id uuid references public.clients(id) on delete set null,
  description text,
  status text not null default 'prospective'
    check (status in ('prospective','active','delivered','closed','on_hold')),
  rate_type text not null default 'hourly' check (rate_type in ('hourly','fixed')),
  rate_cents bigint,
  fixed_amount_cents bigint,
  currency text not null default 'INR',
  started_on date,
  target_delivery_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();

create table public.project_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  provided boolean not null default false,
  note text
);

create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  status text not null default 'pending' check (status in ('pending','delivered')),
  due_date date,
  delivered_at timestamptz,
  note text
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  entry_date date not null default current_date,
  hours numeric(6,2) not null check (hours > 0),
  note text,
  created_at timestamptz not null default now()
);
create index time_entries_project on public.time_entries (project_id, entry_date);

create table public.invoice_counters (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  year int not null,
  last_seq int not null default 0,
  primary key (user_id, year)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  invoice_number text not null,
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  issue_date date not null default current_date,
  due_date date,
  status text not null default 'draft' check (status in ('draft','sent','paid','overdue')),
  currency text not null default 'INR',
  subtotal_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, invoice_number)
);
create trigger invoices_set_updated_at before update on public.invoices
for each row execute function public.set_updated_at();

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_price_cents bigint not null default 0,
  amount_cents bigint not null default 0,
  position int not null default 0
);

-- next sequential invoice number for the current user + calendar year
create or replace function public.next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_year int := extract(year from current_date)::int;
  v_seq int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.invoice_counters (user_id, year, last_seq)
  values (v_uid, v_year, 1)
  on conflict (user_id, year)
    do update set last_seq = public.invoice_counters.last_seq + 1
  returning last_seq into v_seq;
  return 'ALF-' || v_year || '-' || lpad(v_seq::text, 4, '0');
end;
$$;
revoke all on function public.next_invoice_number() from public;
grant execute on function public.next_invoice_number() to authenticated;

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array[
    'clients','projects','project_assets','deliverables','time_entries',
    'invoice_counters','invoices','invoice_line_items'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      create policy "%1$s owner all" on public.%1$s
        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    $f$, t);
  end loop;
end $$;
