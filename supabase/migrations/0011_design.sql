-- 0011_design.sql — Design module: a personal inspiration library.
-- Boards hold visual references captured by URL (an image link, plus an
-- optional page link back to the source). Free-form tags cross-cut every
-- board. No file uploads — the app only stores URLs.

create table public.design_boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index design_boards_user on public.design_boards (user_id, created_at desc);
create trigger design_boards_set_updated_at before update on public.design_boards
for each row execute function public.set_updated_at();

create table public.design_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  board_id uuid not null references public.design_boards(id) on delete cascade,
  title text,
  image_url text not null,
  link_url text,
  source text,          -- hostname of link_url / image_url, for the little chip
  note text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index design_items_board on public.design_items (user_id, board_id, created_at desc);
create index design_items_tags on public.design_items using gin (tags);
create trigger design_items_set_updated_at before update on public.design_items
for each row execute function public.set_updated_at();

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['design_boards','design_items'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      create policy "%1$s owner all" on public.%1$s
        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    $f$, t);
  end loop;
end $$;
