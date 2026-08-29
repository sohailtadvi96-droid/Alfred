-- 0001_init.sql — profile + shared helpers
-- Run order: 0001 → 0002 → 0003 → 0004 → 0005

create extension if not exists pgcrypto with schema extensions;

-- updated_at trigger helper, reused by every table with an updated_at column
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  ground text not null default 'ink',
  custom_ground jsonb,
  sidebar_collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "own profile - select" on public.profiles
  for select using (auth.uid() = id);
create policy "own profile - insert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "own profile - update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- auto-create a profile row on sign-up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
