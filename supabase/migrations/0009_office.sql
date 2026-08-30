-- 0009_office.sql — Work / Office-work tab: local tasks, meetings and notes.
-- Google Calendar events are pulled client-side and NOT stored here; only
-- things you enter by hand live in these tables.

create table public.office_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  notes text,
  due_date date,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'open' check (status in ('open','done')),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index office_tasks_user on public.office_tasks (user_id, status, due_date);
create trigger office_tasks_set_updated_at before update on public.office_tasks
for each row execute function public.set_updated_at();

create table public.office_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  attendees text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index office_events_user on public.office_events (user_id, starts_at);
create trigger office_events_set_updated_at before update on public.office_events
for each row execute function public.set_updated_at();

create table public.office_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null,
  pinned boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index office_notes_user on public.office_notes (user_id, archived, pinned);
create trigger office_notes_set_updated_at before update on public.office_notes
for each row execute function public.set_updated_at();

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['office_tasks','office_events','office_notes'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      create policy "%1$s owner all" on public.%1$s
        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    $f$, t);
  end loop;
end $$;
