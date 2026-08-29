-- 0003_secrets.sql — Secrets vault
-- Server-side encryption: pgcrypto (pgp_sym_*) with a key held in Supabase Vault.
-- One-time setup in the SQL editor after this migration:
--   select vault.create_secret('<LONG-RANDOM-STRING>', 'alfred_secret_key');

create table public.secrets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null,
  username text,
  url text,
  tags text[] not null default '{}',
  secret_ciphertext bytea not null,
  notes_ciphertext bytea,
  last_revealed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index secrets_user_label on public.secrets (user_id, label);
create trigger secrets_set_updated_at
before update on public.secrets
for each row execute function public.set_updated_at();

create table public.webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  label text,
  created_at timestamptz not null default now()
);

create table public.secret_access_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  secret_id uuid references public.secrets(id) on delete set null,
  action text not null check (action in ('reveal','copy','create','update','delete')),
  at timestamptz not null default now()
);
create index secret_access_log_user_at on public.secret_access_log (user_id, at desc);

alter table public.secrets              enable row level security;
alter table public.webauthn_credentials enable row level security;
alter table public.secret_access_log    enable row level security;

create policy "secrets owner all" on public.secrets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "webauthn owner all" on public.webauthn_credentials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "access log owner read" on public.secret_access_log
  for select using (auth.uid() = user_id);
create policy "access log owner insert" on public.secret_access_log
  for insert with check (auth.uid() = user_id);

-- key accessor (Vault)
create or replace function public._alfred_key()
returns text
language sql
stable
security definer
set search_path = vault, public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'alfred_secret_key' limit 1;
$$;

-- upsert (encrypts server-side)
create or replace function public.secret_upsert(
  p_id uuid,
  p_label text,
  p_username text,
  p_url text,
  p_tags text[],
  p_secret text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_key text := public._alfred_key();
  v_id uuid := p_id;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_key is null then raise exception 'alfred_secret_key not set in Vault'; end if;

  if v_id is null then
    insert into public.secrets (user_id, label, username, url, tags, secret_ciphertext, notes_ciphertext)
    values (
      v_uid, p_label, p_username, p_url, coalesce(p_tags, '{}'),
      pgp_sym_encrypt(p_secret, v_key),
      case when p_notes is null then null else pgp_sym_encrypt(p_notes, v_key) end
    )
    returning id into v_id;
    insert into public.secret_access_log (user_id, secret_id, action) values (v_uid, v_id, 'create');
  else
    update public.secrets set
      label = p_label, username = p_username, url = p_url, tags = coalesce(p_tags, '{}'),
      secret_ciphertext = pgp_sym_encrypt(p_secret, v_key),
      notes_ciphertext = case when p_notes is null then null else pgp_sym_encrypt(p_notes, v_key) end
    where id = v_id and user_id = v_uid;
    insert into public.secret_access_log (user_id, secret_id, action) values (v_uid, v_id, 'update');
  end if;

  return v_id;
end;
$$;

-- reveal (decrypts server-side, logs it)
create or replace function public.secret_reveal(p_id uuid)
returns table (secret text, notes text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_key text := public._alfred_key();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_key is null then raise exception 'alfred_secret_key not set in Vault'; end if;

  update public.secrets set last_revealed_at = now() where id = p_id and user_id = v_uid;
  insert into public.secret_access_log (user_id, secret_id, action) values (v_uid, p_id, 'reveal');

  return query
    select
      pgp_sym_decrypt(s.secret_ciphertext, v_key),
      case when s.notes_ciphertext is null then null else pgp_sym_decrypt(s.notes_ciphertext, v_key) end
    from public.secrets s
    where s.id = p_id and s.user_id = v_uid;
end;
$$;

revoke all on function public._alfred_key() from public, anon, authenticated;
revoke all on function public.secret_upsert(uuid, text, text, text, text[], text, text) from public;
revoke all on function public.secret_reveal(uuid) from public;
grant execute on function public.secret_upsert(uuid, text, text, text, text[], text, text) to authenticated;
grant execute on function public.secret_reveal(uuid) to authenticated;
