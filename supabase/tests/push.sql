-- Push subscriptions (0046) verification. Runs as two local test users
-- inside one transaction that is ROLLED BACK at the end — nothing here
-- persists. Same harness as reminders.sql: users are created as postgres,
-- then every check runs as `authenticated` with request.jwt.claim.sub set,
-- so RLS is what's being tested, not bypassed.
--
-- Run: docker exec -i supabase_db_<project_id> psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/push.sql

begin;

\echo '=== setup: two fake local test users ==='
insert into auth.users (id) values
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

-- =====================================================================
\echo '=== 1. owner can insert; user_id defaults to the caller ==='
insert into public.push_subscriptions (endpoint, p256dh, auth, device_label, user_agent)
values ('https://push.example/a', 'p256dh-1', 'auth-1', 'iPhone', 'test-agent');

do $$
declare v_row public.push_subscriptions%rowtype;
begin
  select * into v_row from public.push_subscriptions where endpoint = 'https://push.example/a';
  assert found, 'owner should read back their own row';
  assert v_row.user_id = '22222222-2222-2222-2222-222222222222', 'user_id should default to auth.uid()';
  assert v_row.failure_count = 0, 'failure_count should start at 0';
  assert v_row.last_seen_at is not null, 'last_seen_at should default to now()';
  raise notice 'PASS: owner inserts, reads back, user_id defaulted';
end $$;

-- =====================================================================
\echo '=== 2. the unique key upserts (same statement shape as the client) ==='
insert into public.push_subscriptions (endpoint, p256dh, auth, device_label, user_agent)
values ('https://push.example/a', 'p256dh-2', 'auth-2', 'iPhone', 'test-agent-2')
on conflict (user_id, endpoint) do update
  set p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent,
      last_seen_at = now();

do $$
declare v_n int; v_p256dh text;
begin
  select count(*), max(p256dh) into v_n, v_p256dh
  from public.push_subscriptions where endpoint = 'https://push.example/a';
  assert v_n = 1, format('re-subscribing the same endpoint should keep one row, got %s', v_n);
  assert v_p256dh = 'p256dh-2', 'the upsert should replace the keys';
  raise notice 'PASS: (user_id, endpoint) upserts instead of duplicating';
end $$;

do $$
begin
  insert into public.push_subscriptions (endpoint, p256dh, auth)
  values ('https://push.example/a', 'x', 'y');
  raise exception 'a plain insert of a duplicate endpoint should have failed';
exception when unique_violation then
  raise notice 'PASS: a plain duplicate insert is rejected by the unique key';
end $$;

-- =====================================================================
\echo '=== 3. another user sees nothing and can change nothing ==='
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);

do $$
declare v_n int;
begin
  select count(*) into v_n from public.push_subscriptions;
  assert v_n = 0, format('another user should see no rows, saw %s', v_n);

  update public.push_subscriptions set failure_count = 99 where endpoint = 'https://push.example/a';
  get diagnostics v_n = row_count;
  assert v_n = 0, format('another user''s update should match no rows, matched %s', v_n);

  delete from public.push_subscriptions where endpoint = 'https://push.example/a';
  get diagnostics v_n = row_count;
  assert v_n = 0, format('another user''s delete should match no rows, matched %s', v_n);
  raise notice 'PASS: another user cannot read, update or delete the row';
end $$;

do $$
begin
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('22222222-2222-2222-2222-222222222222', 'https://push.example/forged', 'x', 'y');
  raise exception 'inserting a row for someone else should have been refused';
exception when insufficient_privilege then
  raise notice 'PASS: inserting a row owned by someone else is refused by RLS';
end $$;

-- the unique key is per user, so the same endpoint can exist for both
insert into public.push_subscriptions (endpoint, p256dh, auth)
values ('https://push.example/a', 'p256dh-b', 'auth-b');

-- =====================================================================
\echo '=== 4. owner can delete their row; the other user''s row is untouched ==='
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

do $$
declare v_n int;
begin
  update public.push_subscriptions set failure_count = 0 where endpoint = 'https://push.example/a';
  get diagnostics v_n = row_count;
  assert v_n = 1, format('owner''s update should touch exactly their own row, touched %s', v_n);

  delete from public.push_subscriptions where endpoint = 'https://push.example/a';
  get diagnostics v_n = row_count;
  assert v_n = 1, format('owner''s delete should remove exactly their own row, removed %s', v_n);

  select count(*) into v_n from public.push_subscriptions;
  assert v_n = 0, format('owner should have no rows left, has %s', v_n);
  raise notice 'PASS: owner deletes their own row only';
end $$;

reset role;
do $$
declare v_n int;
begin
  select count(*) into v_n from public.push_subscriptions
  where user_id = '33333333-3333-3333-3333-333333333333';
  assert v_n = 1, format('the other user''s row should survive, found %s', v_n);
  raise notice 'PASS: the other user''s row with the same endpoint survives';
end $$;

\echo '=== all blocks passed; rolling back now ==='
rollback;
