-- 0029_design_enrichment.sql
-- Design module: motion support, cached media, and enrichment (palette / caption /
-- embedding) on design_items. Also relaxes two not-null constraints from 0011 that
-- predate the capture flow, and introduces a per-user Inbox board.
--
-- Renumber before pushing if 0026–0028 have not landed: `ls supabase/migrations`
-- and take the next free number for this file and the storage one.

-- ---------------------------------------------------------------------------
-- Extension
-- ---------------------------------------------------------------------------

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Relax 0011 constraints
-- ---------------------------------------------------------------------------

-- A page-only save has no image URL until design-ingest unfurls it.
alter table public.design_items
  alter column image_url drop not null;

-- ---------------------------------------------------------------------------
-- Inbox board
-- ---------------------------------------------------------------------------
-- board_id stays not-null. Saves without a chosen board land in the user's Inbox,
-- so nothing is ever unfiled-and-invisible.

alter table public.design_boards
  add column if not exists is_inbox boolean not null default false;

create unique index if not exists design_boards_one_inbox_idx
  on public.design_boards (user_id)
  where is_inbox;

create or replace function public.design_inbox_board()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  board_id uuid;
begin
  select id into board_id
    from public.design_boards
   where user_id = auth.uid() and is_inbox
   limit 1;

  if board_id is null then
    insert into public.design_boards (user_id, name, is_inbox)
    values (auth.uid(), 'Inbox', true)
    returning id into board_id;
  end if;

  return board_id;
end;
$$;

grant execute on function public.design_inbox_board() to authenticated;

-- Backfill one Inbox per user who already has boards.
insert into public.design_boards (user_id, name, is_inbox)
select distinct user_id, 'Inbox', true
  from public.design_boards
 where user_id not in (
   select user_id from public.design_boards where is_inbox
 );

-- ---------------------------------------------------------------------------
-- Enrichment columns
-- ---------------------------------------------------------------------------

alter table public.design_items
  add column if not exists media_type text not null default 'image',
  add column if not exists poster_url text,
  add column if not exists thumb_path text,
  add column if not exists medium text,
  add column if not exists colors jsonb,
  add column if not exists caption text,
  -- text-embedding-3-small (1536). Swapping models means a new column, not an
  -- alter — the dimension is baked into the index below.
  add column if not exists embedding extensions.vector(1536),
  add column if not exists enrich_status text not null default 'pending',
  add column if not exists enrich_error text,
  add column if not exists enriched_at timestamptz;

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------

alter table public.design_items
  drop constraint if exists design_items_media_type_check;
alter table public.design_items
  add constraint design_items_media_type_check
  check (media_type in ('image', 'video', 'gif'));

-- Adding a medium later = drop + re-add this constraint in a new migration.
alter table public.design_items
  drop constraint if exists design_items_medium_check;
alter table public.design_items
  add constraint design_items_medium_check
  check (medium is null or medium in (
    'identity', 'packaging', 'editorial', 'motion', 'type', 'web', 'illustration', 'other'
  ));

alter table public.design_items
  drop constraint if exists design_items_enrich_status_check;
alter table public.design_items
  add constraint design_items_enrich_status_check
  check (enrich_status in ('pending', 'running', 'done', 'failed', 'skipped'));

-- An item must resolve to something displayable once enrichment finishes.
alter table public.design_items
  drop constraint if exists design_items_media_present_check;
alter table public.design_items
  add constraint design_items_media_present_check
  check (
    enrich_status <> 'done'
    or image_url is not null
    or thumb_path is not null
  );

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Everything saved before this migration predates the ingest function: mark it
-- skipped so a retry sweep doesn't pick it up. Re-enrich on demand later.
update public.design_items
   set media_type    = 'image',
       enrich_status = 'skipped'
 where enrich_status = 'pending';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists design_items_medium_idx
  on public.design_items (user_id, medium)
  where medium is not null;

create index if not exists design_items_enrich_status_idx
  on public.design_items (enrich_status)
  where enrich_status in ('pending', 'running', 'failed');

-- Cosine similarity search. HNSW builds slowly but queries well; the table is
-- small enough today that build cost is irrelevant.
create index if not exists design_items_embedding_idx
  on public.design_items
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);
