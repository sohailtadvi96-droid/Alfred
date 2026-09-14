-- 0030_design_media_storage.sql
-- Private storage bucket backing the Design module: cached thumbnails for every
-- saved item, plus extracted poster frames for video/gif. Written to by the
-- `design-ingest` edge function (service role), read by the owner via signed URLs.
--
-- Path convention: {user_id}/{item_id}.jpg
-- The first path segment is the owner, which is what every policy below keys off.

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'design-media',
  'design-media',
  false,
  10485760, -- 10 MB; thumbnails and poster frames only, never source media
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- Same owner-all shape as the rest of the app, expressed against the path prefix
-- instead of a user_id column. The ingest function uses the service role and
-- bypasses these entirely; they exist for client reads and manual cleanup.

drop policy if exists "design media owner read" on storage.objects;
create policy "design media owner read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'design-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "design media owner insert" on storage.objects;
create policy "design media owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'design-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "design media owner update" on storage.objects;
create policy "design media owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'design-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'design-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "design media owner delete" on storage.objects;
create policy "design media owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'design-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Orphan cleanup
-- ---------------------------------------------------------------------------
-- Deleting a design_item leaves its object behind (storage has no FK to it).
-- This logs the path so a sweep can remove it; doing the delete inline would
-- mean an HTTP call inside a trigger, which is a bad idea.

create table if not exists public.design_media_orphans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path text not null,
  created_at timestamptz not null default now()
);

alter table public.design_media_orphans enable row level security;

drop policy if exists "owner all" on public.design_media_orphans;
create policy "owner all"
  on public.design_media_orphans for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.design_item_media_orphan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.thumb_path is not null then
    insert into public.design_media_orphans (user_id, path)
    values (old.user_id, old.thumb_path);
  end if;
  return old;
end;
$$;

drop trigger if exists design_items_media_orphan on public.design_items;
create trigger design_items_media_orphan
  before delete on public.design_items
  for each row execute function public.design_item_media_orphan();
