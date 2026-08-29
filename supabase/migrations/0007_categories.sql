-- 0007_categories.sql — user-editable categories (label + colour); system defaults seeded.
-- transactions.category / category_rules.category stay as text slugs; this table adds
-- label + colour + the ability to add your own. A user row shadows a system row of the
-- same (slug, direction).

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,   -- null = system default
  slug text not null,
  label text not null,
  direction text not null check (direction in ('debit','credit')),
  color text not null default '#8D9E79',
  sort int not null default 100,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index categories_sys_uniq  on public.categories (slug, direction) where user_id is null;
create unique index categories_user_uniq on public.categories (user_id, slug, direction) where user_id is not null;
create index categories_lookup on public.categories (direction, sort);

alter table public.categories enable row level security;
create policy "categories read" on public.categories
  for select using (user_id is null or auth.uid() = user_id);
create policy "categories write" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select on public.categories to authenticated;

-- system defaults (safe to re-run)
delete from public.categories where is_system;
insert into public.categories (user_id, slug, label, direction, color, sort, is_system) values
  (null,'online_shopping','Online shopping','debit','#7E97AB',10,true),
  (null,'dineout','Dineout','debit','#BC6250',20,true),
  (null,'grocery','Grocery','debit','#8D9E79',30,true),
  (null,'alcohol','Alcohol','debit','#93839F',40,true),
  (null,'person','Person','debit','#BF8B84',50,true),
  (null,'ticket_booking','Ticket booking','debit','#D6994F',60,true),
  (null,'misc','Misc','debit','#6E8CA8',70,true),
  (null,'person','Person','credit','#BF8B84',10,true),
  (null,'refund','Refund','credit','#6E9B5F',20,true);

-- add a new category, or override a system one (same slug + direction)
create or replace function public.upsert_category(
  p_slug text, p_label text, p_direction text, p_color text, p_sort int default 100
) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_direction not in ('debit','credit') then raise exception 'bad direction'; end if;
  insert into public.categories (user_id, slug, label, direction, color, sort)
  values (v_uid, p_slug, coalesce(nullif(p_label, ''), p_slug), p_direction, p_color, coalesce(p_sort, 100))
  on conflict (user_id, slug, direction) where user_id is not null
  do update set label = excluded.label, color = excluded.color, sort = excluded.sort;
end $$;
revoke all on function public.upsert_category(text, text, text, text, int) from public;
grant execute on function public.upsert_category(text, text, text, text, int) to authenticated;

-- remove a user category (system ones stay)
create or replace function public.delete_category(p_slug text, p_direction text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  delete from public.categories where user_id = v_uid and slug = p_slug and direction = p_direction;
end $$;
revoke all on function public.delete_category(text, text) from public;
grant execute on function public.delete_category(text, text) to authenticated;
