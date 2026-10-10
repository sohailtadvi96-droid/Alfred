-- Web Push scheduled dispatch (0047) verification. Same harness as
-- reminders.sql / push.sql: one transaction, ROLLED BACK at the end. Every
-- claim uses a fixed p_now — never the real clock — and every reminder is
-- inserted with an explicit created_at/start_date, so the result doesn't
-- depend on the day this runs.
--
-- Users: A in Asia/Kolkata (UTC+5:30, two devices), B in America/New_York
-- (US DST ends Sun 2026-11-01), C in Asia/Tokyo (UTC+9). Steps run in
-- chronological order; after each claim the rows are reported back as sent
-- through push_mark_result, as the push-dispatch function would.
--
-- Run: docker exec -i supabase_db_<project_id> psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/push_dispatch.sql

begin;

\echo '=== setup: three users, four devices, reminders ==='
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-00000000000a'),
  ('b0000000-0000-0000-0000-00000000000b'),
  ('c0000000-0000-0000-0000-00000000000c');
update public.profiles set timezone = 'Asia/Kolkata' where id = 'a0000000-0000-0000-0000-00000000000a';
update public.profiles set timezone = 'America/New_York' where id = 'b0000000-0000-0000-0000-00000000000b';
update public.profiles set timezone = 'Asia/Tokyo' where id = 'c0000000-0000-0000-0000-00000000000c';

insert into public.push_subscriptions (id, user_id, endpoint, p256dh, auth, device_label, created_at) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'https://push.example/a1', 'k', 'a', 'A phone',  '2026-01-01'),
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'https://push.example/a2', 'k', 'a', 'A laptop', '2026-01-01'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'https://push.example/b1', 'k', 'a', 'B phone',  '2026-01-01'),
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'https://push.example/c1', 'k', 'a', 'C phone',  '2026-01-01');

-- A's reminders. ids: d1.. timed, d2.. silent cases, d3.. late/new, d4.. untimed
insert into public.reminders (id, user_id, title, kind, freq, time_of_day, start_date, created_at, status, satisfied_by) values
  ('d1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Evening walk',  'recurring', 'daily', '18:30', '2026-01-01', '2026-01-01', 'active',   null),
  ('d2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Done one',      'recurring', 'daily', '18:30', '2026-01-01', '2026-01-01', 'active',   null),
  ('d2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Skipped one',   'recurring', 'daily', '18:30', '2026-01-01', '2026-01-01', 'active',   null),
  ('d2000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'Excused one',   'recurring', 'daily', '18:30', '2026-01-01', '2026-01-01', 'active',   null),
  ('d2000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-00000000000a', 'Paused one',    'recurring', 'daily', '18:30', '2026-01-01', '2026-01-01', 'paused',   null),
  ('d2000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000000a', 'Archived one',  'recurring', 'daily', '18:30', '2026-01-01', '2026-01-01', 'archived', null),
  ('d2000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-00000000000a', 'Journal',       'recurring', 'daily', '18:30', '2026-01-01', '2026-01-01', 'active',   'office_journal'),
  ('d3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Early pill',    'recurring', 'daily', '06:00', '2026-01-01', '2026-01-01', 'active',   null),
  ('d3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Afternoon',     'recurring', 'daily', '16:20', '2026-01-01', '2026-01-01', 'active',   null),
  ('d3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'Too late',      'recurring', 'daily', '16:10', '2026-01-01', '2026-01-01', 'active',   null),
  ('d3000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-00000000000a', 'Made late',     'recurring', 'daily', '18:30', '2026-01-01', '2026-11-10 18:45+05:30', 'active', null),
  ('d4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Water plants',  'recurring', 'daily', null,    '2026-01-01', '2026-01-01', 'active',   null),
  ('d4000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'Done untimed',  'recurring', 'daily', null,    '2026-01-01', '2026-01-01', 'active',   null),
  ('d4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-00000000000a', 'Added at 9:30', 'recurring', 'daily', null,    '2026-01-01', '2026-11-10 09:30+05:30', 'active', null);

update public.reminders set paused_at = '2026-11-01' where id = 'd2000000-0000-0000-0000-000000000004';

insert into public.reminders (id, user_id, title, kind, due_date, due_time, snoozed_until, created_at) values
  ('d1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Call bank', 'one_time', '2026-11-10', '10:00', '2026-11-10 11:00+05:30', '2026-01-01'),
  ('d4000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Pay rent',  'one_time', '2026-11-09', null,    null,                     '2026-01-01');

insert into public.reminder_completions (user_id, reminder_id, occurrence_date, status) values
  ('a0000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-000000000001', '2026-11-10', 'done'),
  ('a0000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-000000000002', '2026-11-10', 'skipped'),
  ('a0000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-000000000003', '2026-11-10', 'excused'),
  ('a0000000-0000-0000-0000-00000000000a', 'd4000000-0000-0000-0000-000000000003', '2026-11-10', 'done');

insert into public.office_journal (user_id, entry_date, body) values
  ('a0000000-0000-0000-0000-00000000000a', '2026-11-10', 'Wrote today.');

insert into public.reminders (id, user_id, title, kind, freq, time_of_day, start_date, created_at) values
  ('db000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'NY coffee', 'recurring', 'daily', '08:00', '2026-01-01', '2026-01-01'),
  ('dc000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'Tokyo run', 'recurring', 'daily', '07:00', '2026-01-01', '2026-01-01');

-- every step's claims land here, tagged with the step name
create temp table claims as
select ''::text as step, c.* from public.push_claim_due('2000-01-01') c limit 0;

-- A's steps look at A's two devices only: other users' reminders can fall due
-- at the same instant (18:30 IST on 10 Nov is 08:00 EST in New York)
create temp view a_claims as
select * from claims
where subscription_id in ('a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002');

-- claim at p_now, keep the rows, and report each back as sent (201)
create or replace function pg_temp.step(p_step text, p_now timestamptz) returns int
language plpgsql as $$
declare v_n int; r record;
begin
  insert into claims select p_step, c.* from public.push_claim_due(p_now) c;
  get diagnostics v_n = row_count;
  for r in select claim_id from claims where step = p_step loop
    perform public.push_mark_result(r.claim_id, 201, null, p_now);
  end loop;
  return v_n;
end $$;

-- =====================================================================
\echo '=== 1. DST zone: New York fires at 08:00 local before and after the clocks change ==='
do $$
declare n int;
begin
  perform pg_temp.step('ny-edt-early', '2026-10-30 11:59+00');
  select count(*) into n from claims where step = 'ny-edt-early' and subscription_id = 'b1000000-0000-0000-0000-000000000001';
  assert n = 0, format('11:59Z on 30 Oct is 07:59 EDT — nothing yet, got %s', n);

  perform pg_temp.step('ny-edt', '2026-10-30 12:00+00');
  select count(*) into n from claims where step = 'ny-edt' and subscription_id = 'b1000000-0000-0000-0000-000000000001'
    and reminder_id = 'db000000-0000-0000-0000-000000000001' and occurrence_date = '2026-10-30';
  assert n = 1, format('12:00Z on 30 Oct is 08:00 EDT — expected the NY reminder, got %s', n);

  perform pg_temp.step('ny-est-wrong', '2026-11-02 12:00+00');
  select count(*) into n from claims where step = 'ny-est-wrong' and subscription_id = 'b1000000-0000-0000-0000-000000000001';
  assert n = 0, format('12:00Z on 2 Nov is 07:00 EST — must not fire, got %s', n);

  perform pg_temp.step('ny-est', '2026-11-02 13:00+00');
  select count(*) into n from claims where step = 'ny-est' and subscription_id = 'b1000000-0000-0000-0000-000000000001'
    and occurrence_date = '2026-11-02';
  assert n = 1, format('13:00Z on 2 Nov is 08:00 EST — expected the NY reminder, got %s', n);
  raise notice 'PASS: a DST-zone user fires at 08:00 local on both sides of the clock change';
end $$;

-- =====================================================================
\echo '=== 2. another timezone: Tokyo fires at 07:00 JST (22:00Z the day before) ==='
do $$
declare n int;
begin
  perform pg_temp.step('tokyo-early', '2026-11-09 21:59+00');
  select count(*) into n from claims where step = 'tokyo-early' and subscription_id = 'c1000000-0000-0000-0000-000000000001';
  assert n = 0, format('06:59 JST — nothing yet, got %s', n);

  perform pg_temp.step('tokyo', '2026-11-09 22:00+00');
  select count(*) into n from claims where step = 'tokyo' and subscription_id = 'c1000000-0000-0000-0000-000000000001'
    and occurrence_date = '2026-11-10';
  assert n = 1, format('07:00 JST on 10 Nov — expected the Tokyo reminder, got %s', n);
  raise notice 'PASS: a user in another timezone fires at their own local time and local date';
end $$;

-- =====================================================================
\echo '=== 3. digest: nothing at 08:59, exactly once at 09:00, never again that day ==='
do $$
declare n int; v_titles text[]; v_bodies text[]; v_tags text[]; v_subs int;
begin
  perform pg_temp.step('a-0859', '2026-11-10 08:59+05:30');
  select count(*) into n from a_claims where step = 'a-0859';
  assert n = 0, format('08:59 IST — nothing should be claimed, got %s', n);

  perform pg_temp.step('a-0900', '2026-11-10 09:00+05:30');
  select count(*), count(distinct subscription_id), array_agg(distinct title), array_agg(distinct body), array_agg(distinct tag)
    into n, v_subs, v_titles, v_bodies, v_tags
  from a_claims where step = 'a-0900';
  assert n = 2 and v_subs = 2, format('09:00 — one digest per device (2), got %s rows over %s devices', n, v_subs);
  assert (select bool_and(kind = 'digest') from a_claims where step = 'a-0900'), '09:00 should claim only the digest';
  assert v_titles = array['Today: 2 reminders'], format('digest title %s', v_titles);
  -- overdue one-time first; the done one and the one added after 09:00 are left out
  assert v_bodies = array['Pay rent · Water plants'], format('digest body %s', v_bodies);
  assert v_tags = array['digest:2026-11-10'], format('digest tag %s', v_tags);
  assert (select bool_and(url_path = '/reminders') from a_claims where step = 'a-0900'), 'tap should open /reminders';
  raise notice 'PASS: 08:59 nothing; 09:00 one digest per device with only the open untimed items';

  perform pg_temp.step('a-0900-again', '2026-11-10 09:00+05:30');
  select count(*) into n from a_claims where step = 'a-0900-again';
  assert n = 0, format('a second claim at 09:00 should return nothing, got %s', n);

  perform pg_temp.step('a-0930', '2026-11-10 09:30+05:30');
  select count(*) into n from a_claims where step = 'a-0930';
  assert n = 0, format('09:30 — still nothing (digest is once a day; 06:00 is >2h late), got %s', n);
  raise notice 'PASS: a second claim returns nothing; a >2h-late reminder (06:00 at 09:00) was dropped';
end $$;

-- the daily digest is once per device per local day even if the time changes
update public.profiles set digest_time = '10:15' where id = 'a0000000-0000-0000-0000-00000000000a';
do $$
declare n int;
begin
  perform pg_temp.step('a-1015', '2026-11-10 10:15+05:30');
  select count(*) into n from a_claims where step = 'a-1015' and kind = 'digest';
  assert n = 0, format('moving digest_time after it was sent must not send a second digest, got %s', n);
  raise notice 'PASS: moving digest_time later the same day does not send a second digest';
end $$;
update public.profiles set digest_time = '09:00' where id = 'a0000000-0000-0000-0000-00000000000a';

-- =====================================================================
\echo '=== 4. a snoozed one-time reminder fires at snoozed_until, not at due_time ==='
do $$
declare n int;
begin
  perform pg_temp.step('a-1059', '2026-11-10 10:59+05:30');
  select count(*) into n from a_claims where step = 'a-1059';
  assert n = 0, format('10:59 — due 10:00 but snoozed to 11:00, nothing yet, got %s', n);

  perform pg_temp.step('a-1100', '2026-11-10 11:00+05:30');
  select count(*) into n from a_claims where step = 'a-1100'
    and reminder_id = 'd1000000-0000-0000-0000-000000000002' and fire_at = '2026-11-10 11:00+05:30';
  assert n = 2, format('11:00 — the snoozed one-time on both devices, got %s', n);
  assert (select count(*) from a_claims where step = 'a-1100') = 2, 'only the snoozed reminder at 11:00';
  raise notice 'PASS: snoozed one-time fires at snoozed_until';
end $$;

-- =====================================================================
\echo '=== 5. the 2-hour late limit ==='
do $$
declare n int;
begin
  perform pg_temp.step('a-1819', '2026-11-10 18:19+05:30');
  select count(*) into n from a_claims where step = 'a-1819' and reminder_id = 'd3000000-0000-0000-0000-000000000002';
  assert n = 2, format('16:20 claimed at 18:19 (1h59m late) should still send, got %s', n);
  select count(*) into n from a_claims where step = 'a-1819' and reminder_id = 'd3000000-0000-0000-0000-000000000003';
  assert n = 0, format('16:10 claimed at 18:19 (2h09m late) should be dropped, got %s', n);
  raise notice 'PASS: under 2h late sends, over 2h late is dropped';
end $$;

-- =====================================================================
\echo '=== 6. a timed reminder fires at its time and not before; every silent case stays silent ==='
do $$
declare n int; v_ids uuid[]; v_tags text[];
begin
  perform pg_temp.step('a-1829', '2026-11-10 18:29+05:30');
  select count(*) into n from a_claims where step = 'a-1829';
  assert n = 0, format('18:29 — nothing yet, got %s', n);

  perform pg_temp.step('a-1830', '2026-11-10 18:30+05:30');
  select array_agg(distinct reminder_id), array_agg(distinct tag), count(*) into v_ids, v_tags, n
  from a_claims where step = 'a-1830';
  assert v_ids = array['d1000000-0000-0000-0000-000000000001'::uuid],
    format('18:30 — only "Evening walk" (done, skipped, excused, paused, archived, journal-satisfied all silent), got %s', v_ids);
  assert n = 2, format('one row per device, got %s', n);
  assert v_tags = array['reminder:d1000000-0000-0000-0000-000000000001:2026-11-10'], format('tag %s', v_tags);
  raise notice 'PASS: fires at 18:30 not 18:29; done/skipped/excused/paused/archived/journal are silent; two devices one row each';

  perform pg_temp.step('a-1850', '2026-11-10 18:50+05:30');
  select count(*) into n from a_claims where step = 'a-1850';
  assert n = 0, format('18:50 — "Made late" was created at 18:45, after its 18:30 fire time: silent, got %s', n);
  raise notice 'PASS: a reminder created after its fire time had passed is silent';
end $$;

-- =====================================================================
\echo '=== 7. an edited time sends again (once) ==='
update public.reminders set time_of_day = '19:00' where id = 'd1000000-0000-0000-0000-000000000001';
do $$
declare n int;
begin
  -- not marked as sent: step 8 uses these claims as "the sender died"
  insert into claims select 'a-1900', c.* from public.push_claim_due('2026-11-10 19:00+05:30') c;
  select count(*) into n from a_claims where step = 'a-1900'
    and reminder_id = 'd1000000-0000-0000-0000-000000000001' and fire_at = '2026-11-10 19:00+05:30';
  assert n = 2, format('19:00 — the edited reminder sends again on both devices, got %s', n);
  select count(*) into n from public.push_claim_due('2026-11-10 19:00+05:30');
  assert n = 0, format('a second claim at 19:00 returns nothing, got %s', n);
  raise notice 'PASS: editing the time sends the new occurrence once';
end $$;

-- =====================================================================
\echo '=== 8. a stuck claim is re-claimed after 5 minutes, at most 3 attempts ==='
do $$
declare n int; v_att smallint;
begin
  select count(*) into n from public.push_claim_due('2026-11-10 19:04+05:30');
  assert n = 0, format('4 minutes in — not stuck yet, got %s', n);

  select count(*), max(attempts) into n, v_att from public.push_claim_due('2026-11-10 19:06+05:30');
  assert n = 2 and v_att = 2, format('19:06 — both re-claimed as attempt 2, got %s rows, attempt %s', n, v_att);
  select count(*), max(attempts) into n, v_att from public.push_claim_due('2026-11-10 19:12+05:30');
  assert n = 2 and v_att = 3, format('19:12 — attempt 3, got %s rows, attempt %s', n, v_att);
  select count(*) into n from public.push_claim_due('2026-11-10 19:18+05:30');
  assert n = 0, format('19:18 — out of attempts, nothing returned, got %s', n);
  select count(*) into n from public.push_sends
  where reminder_id = 'd1000000-0000-0000-0000-000000000001' and fire_at = '2026-11-10 19:00+05:30'
    and status = 'failed' and error like 'abandoned%';
  assert n = 2, format('both are failed as abandoned, got %s', n);
  raise notice 'PASS: stuck claims re-claimed after 5 minutes up to 3 attempts, then failed';
end $$;

-- =====================================================================
\echo '=== 9. push_mark_result: success, gone, and removal after 5 failures over 24h ==='
insert into public.push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at) values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'https://push.example/flaky', 'k', 'a', '2026-01-01'),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'https://push.example/gone',  'k', 'a', '2026-01-01');
do $$
declare v_id bigint; v text; i int; v_sub public.push_subscriptions%rowtype;
begin
  -- 410: gone
  insert into public.push_sends (user_id, subscription_id, kind, occurrence_date, fire_at, title)
  values ('a0000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000002', 'test', '2026-11-11', '2026-11-11 09:00+00', 't')
  returning id into v_id;
  v := public.push_mark_result(v_id, 410, 'expired', '2026-11-11 09:00+00');
  assert v = 'gone', format('410 should be gone, got %s', v);
  assert not exists (select 1 from public.push_subscriptions where id = 'e2000000-0000-0000-0000-000000000002'), '410 deletes the subscription';

  -- five failures inside an hour: kept
  for i in 1..5 loop
    insert into public.push_sends (user_id, subscription_id, kind, occurrence_date, fire_at, title)
    values ('a0000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000001', 'test', '2026-11-11',
            '2026-11-11 09:00+00'::timestamptz + make_interval(mins => i), 't')
    returning id into v_id;
    v := public.push_mark_result(v_id, 500, 'boom', '2026-11-11 09:00+00'::timestamptz + make_interval(mins => i));
    assert v = 'failed', format('failure %s should be failed, got %s', i, v);
  end loop;
  select * into v_sub from public.push_subscriptions where id = 'e1000000-0000-0000-0000-000000000001';
  assert v_sub.failure_count = 5 and v_sub.last_failure_status = 500, 'five failures recorded';

  -- a success resets the run
  insert into public.push_sends (user_id, subscription_id, kind, occurrence_date, fire_at, title)
  values ('a0000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000001', 'test', '2026-11-11', '2026-11-11 10:00+00', 't')
  returning id into v_id;
  v := public.push_mark_result(v_id, 201, null, '2026-11-11 10:00+00');
  select * into v_sub from public.push_subscriptions where id = 'e1000000-0000-0000-0000-000000000001';
  assert v = 'sent' and v_sub.failure_count = 0 and v_sub.first_failure_at is null, 'a success resets the failure run';

  -- a new run: four failures, then a fifth 25 hours after the first → removed
  for i in 1..4 loop
    insert into public.push_sends (user_id, subscription_id, kind, occurrence_date, fire_at, title)
    values ('a0000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000001', 'test', '2026-11-12',
            '2026-11-12 09:00+00'::timestamptz + make_interval(mins => i), 't')
    returning id into v_id;
    perform public.push_mark_result(v_id, 0, 'no response', '2026-11-12 09:00+00'::timestamptz + make_interval(mins => i));
  end loop;
  insert into public.push_sends (user_id, subscription_id, kind, occurrence_date, fire_at, title)
  values ('a0000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000001', 'test', '2026-11-13', '2026-11-13 10:01+00', 't')
  returning id into v_id;
  v := public.push_mark_result(v_id, 0, 'no response', '2026-11-13 10:01+00');
  assert v = 'removed', format('5th consecutive failure 25h after the first should remove, got %s', v);
  assert not exists (select 1 from public.push_subscriptions where id = 'e1000000-0000-0000-0000-000000000001'), 'removed';

  v := public.push_mark_result(-1, 201);
  assert v = 'unknown', format('a non-claim is unknown, got %s', v);
  raise notice 'PASS: 2xx sent and resets; 404/410 deletes; 5 failures over >=24h removes; fewer or faster keeps';
end $$;

-- =====================================================================
\echo '=== 10. the tick is a no-op without Vault secrets ==='
do $$
declare v_before bigint; v_after bigint;
begin
  assert not exists (select 1 from vault.decrypted_secrets where name in ('push_dispatch_url', 'push_dispatch_secret')),
    'this test expects no dispatch secrets in the local Vault';
  select count(*) into v_before from net.http_request_queue;
  perform public._push_dispatch_tick();
  select count(*) into v_after from net.http_request_queue;
  assert v_after = v_before, 'no secrets → no HTTP request queued';
  assert exists (select 1 from cron.job where jobname = 'alfred-push-dispatch' and schedule = '* * * * *'),
    'the cron job is scheduled every minute';
  raise notice 'PASS: tick returns quietly without Vault secrets; cron job scheduled every minute';
end $$;

-- =====================================================================
\echo '=== 11. user_today_for / user_today agree ==='
do $$
begin
  assert public.user_today_for('b0000000-0000-0000-0000-00000000000b') = (now() at time zone 'America/New_York')::date,
    'user_today_for uses the user''s own timezone';
  assert public.user_today_for('00000000-0000-0000-0000-000000000000') = (now() at time zone 'Asia/Kolkata')::date,
    'unknown user falls back to Asia/Kolkata, as user_today always did';
  raise notice 'PASS: user_today_for reads each user''s timezone with the old fallback';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);
do $$
declare n int; v_mine int;
begin
  assert public.user_today() = public.user_today_for('a0000000-0000-0000-0000-00000000000a'), 'user_today = user_today_for(auth.uid())';

  -- push_sends: owner reads own rows only, writes nothing
  select count(*) into n from public.push_sends;
  select count(*) into v_mine from public.push_sends where user_id = 'a0000000-0000-0000-0000-00000000000a';
  assert n > 0 and n = v_mine, format('A should see only A''s ledger rows (%s of %s)', v_mine, n);
  begin
    insert into public.push_sends (subscription_id, kind, occurrence_date, fire_at, title)
    values ('a1000000-0000-0000-0000-000000000001', 'test', '2026-11-20', now(), 'x');
    raise exception 'owner insert into push_sends should be refused';
  exception when insufficient_privilege then null;
  end;
  update public.push_sends set status = 'sent' where user_id = 'a0000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  assert n = 0, format('owner update should match nothing, matched %s', n);

  -- the dispatch functions are not callable by a signed-in user
  begin
    perform public.push_claim_due('2026-11-10 09:00+05:30');
    raise exception 'authenticated must not execute push_claim_due';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.push_mark_result(1, 201);
    raise exception 'authenticated must not execute push_mark_result';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: user_today unchanged; push_sends is owner read-only; dispatch functions refused to authenticated';
end $$;

reset role;
set local role service_role;
do $$
declare n int;
begin
  select count(*) into n from public.push_claim_due('2000-01-01');
  assert n = 0, 'service_role can execute push_claim_due';
  raise notice 'PASS: service_role can execute push_claim_due';
end $$;
reset role;

\echo '=== all blocks passed; rolling back now ==='
rollback;
