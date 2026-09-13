-- 0016_goals.sql — Goals module, Phase 1 (manual goals only).
-- A goal stores intent (target + horizon + source), never progress computed
-- from another module. `goal_progress` is the append-only ledger behind
-- manual count/value/streak goals: each row is either an increment (count/
-- value, summed) or a single day's completion (streak, one row per day).
-- Milestone goals need no ledger — their checklist lives on `goals.milestones`.

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  type text not null check (type in ('count', 'value', 'milestone', 'streak')),
  target numeric not null check (target > 0),
  unit text,
  direction text not null default 'up' check (direction in ('up', 'down')),
  start_date date not null default current_date,
  target_date date,
  source jsonb not null default '{"kind":"manual"}',
  module_id text check (
    module_id is null or module_id in ('expenses', 'work', 'design', 'invest', 'health', 'goals', 'travel')
  ),
  status text not null default 'active' check (status in ('active', 'achieved', 'paused', 'abandoned')),
  milestones jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  achieved_at timestamptz
);
create index goals_user on public.goals (user_id, status, target_date);
create trigger goals_set_updated_at before update on public.goals
for each row execute function public.set_updated_at();

create table public.goal_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  value numeric not null default 1,
  occurred_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index goal_progress_goal on public.goal_progress (user_id, goal_id, occurred_on desc);
-- Streak goals log at most one completion row per day; count/value goals may
-- log several increments on the same day. That's a per-type rule, not a
-- blanket one, so it's enforced in api.ts (upsert-by-day for streak) rather
-- than a table-wide unique constraint.

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['goals', 'goal_progress'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      create policy "%1$s owner all" on public.%1$s
        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    $f$, t);
  end loop;
end $$;
