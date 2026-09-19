-- 0033_goals_engine.sql — Goals module, computed-progress groundwork.
-- Schema only: no RPCs, no progress computation lives here. Adds the
-- columns/tables the upcoming goal_current_value/goal_pace RPCs will read
-- from — goals stays intent-only (target + horizon + source), same as it
-- was in 0016.

-- ---------- goals: cadence, hierarchy, task linkage, source whitelist ----------
alter table public.goals
  add column cadence text not null default 'none' check (cadence in ('none', 'weekly', 'monthly', 'quarterly')),
  add column parent_goal_id uuid references public.goals(id) on delete set null,
  add column next_task_id uuid references public.office_tasks(id) on delete set null;

-- table-level (not inline) so it has its own name to reference/drop later.
alter table public.goals
  add constraint goals_parent_not_self check (parent_goal_id is null or parent_goal_id <> id);
create index goals_parent on public.goals (parent_goal_id) where parent_goal_id is not null;

-- Mirrors the bucket check-constraint style from 0021: an explicit
-- whitelist so an unrecognised source.kind fails loudly at write time
-- instead of silently reaching a pace RPC that doesn't know what to do
-- with it. Existing rows are all {"kind":"manual"} (0016's column default),
-- so this validates clean against current data.
alter table public.goals
  add constraint goals_source_kind_check check (source ->> 'kind' in ('manual', 'journal_streak', 'tasks_completed'));

-- ---------- goal_periods — frozen per-cadence snapshots ----------
-- One row per (goal, period) once that period closes. target/actual/status
-- are frozen at freeze time — never recomputed after the fact, so a pace
-- RPC's live math can't retroactively rewrite history.
create table public.goal_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  target numeric,
  actual numeric,
  status text,
  frozen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, goal_id, period_start)
);
create index goal_periods_goal on public.goal_periods (user_id, goal_id, period_start desc);
create trigger goal_periods_set_updated_at before update on public.goal_periods
for each row execute function public.set_updated_at();

-- ---------- reminders — general-purpose, not goals-only ----------
-- goal_id is nullable on purpose: a reminder can stand alone (channel/kind
-- cover non-goal use later) or point at a goal, in which case deleting the
-- goal takes its reminders with it.
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete cascade,
  title text not null,
  kind text check (kind in ('checkin', 'deadline', 'pace', 'streak_risk', 'weekly_review')),
  recurrence jsonb,
  next_fire_at timestamptz,
  channel text not null default 'rail' check (channel in ('rail', 'telegram', 'email', 'webpush')),
  snoozed_until timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reminders_user on public.reminders (user_id, status, next_fire_at);
create index reminders_goal on public.reminders (goal_id) where goal_id is not null;
create trigger reminders_set_updated_at before update on public.reminders
for each row execute function public.set_updated_at();

-- ---------- goal_reviews — periodic continue/adjust/drop check-ins ----------
create table public.goal_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  reviewed_on date not null,
  decision text check (decision in ('continue', 'adjust', 'drop')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, goal_id, reviewed_on)
);
create index goal_reviews_goal on public.goal_reviews (user_id, goal_id, reviewed_on desc);
create trigger goal_reviews_set_updated_at before update on public.goal_reviews
for each row execute function public.set_updated_at();

-- ---------- RLS: owner-all on every new table ----------
do $$
declare t text;
begin
  foreach t in array array['goal_periods', 'reminders', 'goal_reviews'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      create policy "%1$s owner all" on public.%1$s
        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    $f$, t);
  end loop;
end $$;

-- ---------- profiles: timezone ----------
-- occurred_on/entry_date/done_at::date are all written using the client's
-- local calendar day; a Postgres-side RPC's now()/current_date runs in UTC
-- by default on Supabase. Without a stored timezone, "today" can disagree
-- by hours between client and server for goal_pace's period boundaries.
alter table public.profiles add column timezone text not null default 'UTC';
