-- 0010_office_journal.sql — the Office tab becomes a dated journal.
-- office_notes gains an optional entry_date (null = a running "quick note" on
-- the calendar landing; a date = a note pinned to that day's page).
-- office_journal holds one free-text entry per calendar day.

alter table public.office_notes add column if not exists entry_date date;
create index if not exists office_notes_date
  on public.office_notes (user_id, entry_date) where entry_date is not null;

create table public.office_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);
create trigger office_journal_set_updated_at before update on public.office_journal
for each row execute function public.set_updated_at();

alter table public.office_journal enable row level security;
create policy "office_journal owner all" on public.office_journal
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
