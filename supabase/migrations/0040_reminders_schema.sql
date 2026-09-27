-- 0040_reminders_schema.sql — Reminders module, schema only (R1).
-- Alters the 0033 reminders table — zero rows, zero readers (see R0 in
-- docs/alfred-reminders-plan.md) — from its unused goal-nudge shape
-- (kind = checkin/pace/…, opaque recurrence jsonb, next_fire_at) into the
-- one-time/recurring personal reminder model, and adds the completions
-- ledger plus the user_today() helper the rest of the module reads
-- through. No RPCs yet (reminder_occurs_on / reminders_today / … are R2).

-- ---------- safety guard ----------
-- This migration restructures reminders assuming there is nothing in it to
-- lose. If that's ever not true, fail loudly instead of silently reshaping
-- live data.
do $$
begin
  if exists (select 1 from public.reminders) then
    raise exception '0040 assumes reminders is empty';
  end if;
end $$;

-- ---------- user_today() ----------
-- All reminder date logic goes through this one helper so "today" is
-- always the user's local day (profiles.timezone), never UTC and never the
-- browser's clock (the client's todayKey()/localDateKey() read the device
-- clock and don't know about profiles.timezone at all). Plain SQL, stable,
-- invoker (the default — omitted, same as goal_pace/savings_plan): profiles
-- carries the standard owner-all RLS, so running as the caller is enough.
-- goal_pace / savings_plan keep their own inline timezone lookup for now —
-- not refactored onto this function.
create or replace function public.user_today()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone coalesce(
    (select timezone from public.profiles where id = auth.uid()),
    'Asia/Kolkata'
  ))::date;
$$;

revoke all on function public.user_today() from public;
grant execute on function public.user_today() to authenticated;

-- ---------- reminders: goal-nudge shape -> one-time/recurring shape ----------
drop index public.reminders_user;

alter table public.reminders
  drop column recurrence,
  drop column next_fire_at;

alter table public.reminders
  drop constraint reminders_kind_check,
  alter column kind set not null,
  add constraint reminders_kind_check check (kind in ('one_time', 'recurring'));

alter table public.reminders
  add constraint reminders_status_check check (status in ('active', 'paused', 'archived'));

-- was on delete cascade: a habit's history (and its reminder row) should
-- survive the goal it was created from being deleted, not vanish with it.
alter table public.reminders
  drop constraint reminders_goal_id_fkey,
  add constraint reminders_goal_id_fkey
    foreign key (goal_id) references public.goals(id) on delete set null;

alter table public.reminders
  add column notes text,
  add column due_date date,
  add column due_time time,
  add column freq text check (freq in ('daily', 'weekly', 'monthly', 'every_n_days')),
  add column interval_n smallint not null default 1 check (interval_n >= 1),
  add column weekdays smallint[] check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  add column month_day smallint check (month_day between 1 and 31),
  add column time_of_day time,
  add column start_date date default public.user_today(),
  add column end_date date,
  add column paused_at timestamptz,
  add column satisfied_by text check (satisfied_by in ('office_journal')),
  add column counts_as_task boolean;

-- one-time and recurring are mutually exclusive shapes of the same row —
-- these five checks are what keep a card from being ambiguous about which
-- it is. satisfied_by only makes sense for a recurring occurrence.
alter table public.reminders
  add constraint reminders_one_time_shape check (
    kind <> 'one_time' or (due_date is not null and freq is null and satisfied_by is null)
  ),
  add constraint reminders_recurring_shape check (
    kind <> 'recurring' or (freq is not null and start_date is not null and due_date is null and due_time is null)
  ),
  add constraint reminders_weekly_days check (
    freq is distinct from 'weekly' or cardinality(weekdays) > 0
  ),
  add constraint reminders_monthly_day check (
    freq is distinct from 'monthly' or month_day is not null
  ),
  add constraint reminders_date_range check (
    end_date is null or end_date >= start_date
  );

-- counts_as_task's default depends on kind (another column in the same
-- row), so a plain column default can't express it — a before-insert
-- trigger fills it in only when the caller left it null, then the column
-- is made not null so every row commits to one or the other.
create or replace function public.reminders_default_counts_as_task()
returns trigger
language plpgsql
as $$
begin
  new.counts_as_task := coalesce(new.counts_as_task, new.kind = 'one_time');
  return new;
end;
$$;

create trigger reminders_default_counts_as_task
before insert on public.reminders
for each row execute function public.reminders_default_counts_as_task();

alter table public.reminders
  alter column counts_as_task set not null;

create index reminders_user on public.reminders (user_id, status, kind);
-- reminders_goal (goal_id) and reminders_set_updated_at are unchanged.

comment on table public.reminders is
  'One-time or recurring reminder rules — not one row per occurrence. A '
  'recurring reminder''s occurrences are derived on read (reminder_occurs_on, '
  'R2), never materialised; the only stored completion state is '
  'reminder_completions. due_date/start_date/end_date are local calendar '
  'dates, the same convention as office_tasks.due_date — no timestamptz '
  'conversion, no timezone math at the column level.';
comment on column public.reminders.kind is
  'one_time or recurring — which shape check applies to the row.';
comment on column public.reminders.due_date is
  'One-time only. Local calendar date the reminder is due on.';
comment on column public.reminders.weekdays is
  'ISO weekday numbers, 1=Monday .. 7=Sunday. Recurring, freq=weekly only.';
comment on column public.reminders.start_date is
  'Recurring only. Anchor date for every_n_days and the schedule''s first '
  'possible occurrence.';
comment on column public.reminders.satisfied_by is
  'Recurring only. Null = a manual tick marks the day done. A value names '
  'the module whose own data marks the day done instead (see '
  'reminder_satisfied, R2) — office_journal today, more later.';
comment on column public.reminders.counts_as_task is
  'Whether a completion of this reminder feeds the tasks_completed goal '
  'meter. Defaults true for one_time, false for recurring (see the '
  'reminders_default_counts_as_task trigger) — editable per reminder.';

-- ---------- reminder_completions ----------
create table public.reminder_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  occurrence_date date not null,
  status text not null default 'done' check (status in ('done', 'skipped', 'excused')),
  completed_at timestamptz not null default now(),
  unique (reminder_id, occurrence_date)
);
create index reminder_completions_user on public.reminder_completions (user_id, completed_at);

alter table public.reminder_completions enable row level security;
create policy "reminder_completions owner all" on public.reminder_completions
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.reminders r
      where r.id = reminder_id and r.user_id = auth.uid()
    )
  );

comment on table public.reminder_completions is
  'Append-only ledger: one row per (reminder, occurrence_date) actually '
  'completed — the only materialised state a recurring reminder has. '
  'One-time reminders use occurrence_date = due_date. status=skipped is a '
  'miss (breaks a streak); status=excused is written by reminder_resume '
  '(R2) for the days a rule was paused, so a pause does not break a streak.';
