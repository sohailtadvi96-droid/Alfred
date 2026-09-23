-- 0037_design_item_boards.sql
-- Boards go from exclusive to multi-membership. design_items.board_id stays
-- exactly as it is — an item's HOME (the Inbox, for anything captured) — and
-- this table records the ADDITIONAL boards an item also appears in. It is a
-- supplement, not a replacement: nothing here is ever required for an item to
-- exist or be shown, and an item with no rows here behaves exactly as before.
--
-- Written by design-capture (medium routing), the Sort Inbox sweep and the
-- per-card board picker. None of those touch design_items.board_id.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.design_item_boards (
  item_id  uuid not null references public.design_items(id)  on delete cascade,
  board_id uuid not null references public.design_boards(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (item_id, board_id)
);

-- The primary key serves "which boards is this item in"; this serves the
-- other direction, "which items are in this board" (board contents, counts).
create index design_item_boards_board on public.design_item_boards (board_id, item_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Deliberate departure from the usual `user_id default auth.uid()` + owner-all
-- pattern: there is no user_id column here, ownership is the item's. Reads and
-- deletes need the item to be the caller's; a write additionally needs the
-- BOARD to be the caller's, so a row can never link an item into someone
-- else's board.

alter table public.design_item_boards enable row level security;

create policy "design_item_boards owner all" on public.design_item_boards
  for all
  using (
    exists (
      select 1 from public.design_items i
       where i.id = design_item_boards.item_id and i.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.design_items i
       where i.id = design_item_boards.item_id and i.user_id = auth.uid()
    )
    and exists (
      select 1 from public.design_boards b
       where b.id = design_item_boards.board_id and b.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Board contents
-- ---------------------------------------------------------------------------
-- A board's items are the UNION of items homed there (board_id) and items
-- cross-listed into it. One OR/EXISTS select rather than a UNION of two
-- selects: an item that is somehow both (a redundant row for its own home
-- board) still comes back once, and design_items' vector/jsonb columns never
-- have to be compared. security invoker (the default) — RLS on both tables
-- applies to the caller, exactly as a direct select would.

create or replace function public.design_board_items(p_board_id uuid)
returns setof public.design_items
language sql
stable
set search_path = public
as $$
  select i.*
    from public.design_items i
   where i.board_id = p_board_id
      or exists (
        select 1 from public.design_item_boards m
         where m.item_id = i.id and m.board_id = p_board_id
      )
   order by i.created_at desc;
$$;

grant execute on function public.design_board_items(uuid) to authenticated;
