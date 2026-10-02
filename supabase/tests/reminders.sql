-- Reminders R2 verification. Runs as a local test user inside one
-- transaction that is ROLLED BACK at the end — nothing here persists.
-- Fixed calendar dates throughout (never real "today"), except the
-- pause/resume block, which is intrinsically today-relative (those RPCs
-- take no override parameter) — it captures public.user_today() once into
-- a variable and derives everything else from that single snapshot, which
-- is safe because now()/user_today() are stable for the whole transaction.
--
-- Calendar anchor used below (confirmed against pg's own extract(isodow)
-- before writing these — never trust a memorised weekday):
--   2026-09-27 Sun, 09-28 Mon, 09-29 Tue, 09-30 Wed, 10-01 Thu, 10-02 Fri,
--   10-05 Mon (next week). 2027-02-27 Sat, 02-28 Sun (2027 is not a leap year).
-- Lesson carried over from R1: separate statements, never sibling
-- data-modifying CTEs feeding each other within one statement.

begin;

\echo '=== setup: fake local test user + profile ==='
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
update public.profiles set timezone = 'Asia/Kolkata'
  where id = '11111111-1111-1111-1111-111111111111';

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

-- =====================================================================
\echo '=== 1. reminder_occurs_on: weekly ==='
insert into public.reminders (id, title, kind, freq, weekdays, start_date)
values ('a0000000-0000-0000-0000-000000000001', 'Gym MWF', 'recurring', 'weekly',
        array[1,3,5]::smallint[], '2026-01-01');

do $$
declare v_r public.reminders%rowtype;
begin
  select * into v_r from public.reminders where id = 'a0000000-0000-0000-0000-000000000001';
  assert public.reminder_occurs_on(v_r, '2026-09-28') = true,  'Mon 28 Sep should occur';
  assert public.reminder_occurs_on(v_r, '2026-09-30') = true,  'Wed 30 Sep should occur';
  assert public.reminder_occurs_on(v_r, '2026-09-29') = false, 'Tue 29 Sep should not occur';
  assert public.reminder_occurs_on(v_r, '2026-09-27') = false, 'Sun 27 Sep should not occur';
  raise notice 'PASS: weekly {1,3,5} occurs only on Mon/Wed/Fri';
end $$;

-- =====================================================================
\echo '=== 2. reminder_occurs_on: monthly, month_day=31 clamps ==='
insert into public.reminders (id, title, kind, freq, month_day, start_date)
values ('a0000000-0000-0000-0000-000000000002', 'Rent', 'recurring', 'monthly', 31, '2026-01-01');

do $$
declare v_r public.reminders%rowtype;
begin
  select * into v_r from public.reminders where id = 'a0000000-0000-0000-0000-000000000002';
  assert public.reminder_occurs_on(v_r, '2026-09-30') = true,  '30-day Sep should clamp to the 30th';
  assert public.reminder_occurs_on(v_r, '2027-02-28') = true,  '28-day Feb 2027 should clamp to the 28th';
  assert public.reminder_occurs_on(v_r, '2026-09-29') = false, '29 Sep is not the clamped day';
  raise notice 'PASS: monthly month_day=31 clamps to the real last day of the month';
end $$;

-- =====================================================================
\echo '=== 3. reminder_occurs_on: every_n_days, anchored to start_date ==='
insert into public.reminders (id, title, kind, freq, interval_n, start_date)
values ('a0000000-0000-0000-0000-000000000003', 'Water plants', 'recurring', 'every_n_days', 3, '2026-09-01');

do $$
declare v_r public.reminders%rowtype;
begin
  select * into v_r from public.reminders where id = 'a0000000-0000-0000-0000-000000000003';
  assert public.reminder_occurs_on(v_r, '2026-09-01') = true,  '1 Sep (start) should occur';
  assert public.reminder_occurs_on(v_r, '2026-09-04') = true,  '4 Sep (+3) should occur';
  assert public.reminder_occurs_on(v_r, '2026-09-07') = true,  '7 Sep (+6) should occur';
  assert public.reminder_occurs_on(v_r, '2026-09-02') = false, '2 Sep should not occur';
  assert public.reminder_occurs_on(v_r, '2026-09-03') = false, '3 Sep should not occur';
  assert public.reminder_occurs_on(v_r, '2026-08-31') = false, 'the day before start should never occur';
  raise notice 'PASS: every_n_days=3 anchored to start_date';
end $$;

-- =====================================================================
\echo '=== 4. reminder_occurs_on: end_date respected ==='
insert into public.reminders (id, title, kind, freq, start_date, end_date)
values ('a0000000-0000-0000-0000-000000000004', 'Course reminder', 'recurring', 'daily',
        '2026-09-01', '2026-09-10');

do $$
declare v_r public.reminders%rowtype;
begin
  select * into v_r from public.reminders where id = 'a0000000-0000-0000-0000-000000000004';
  assert public.reminder_occurs_on(v_r, '2026-08-25') = false, 'before start_date should not occur';
  assert public.reminder_occurs_on(v_r, '2026-09-05') = true,  'within range should occur';
  assert public.reminder_occurs_on(v_r, '2026-09-15') = false, 'after end_date should not occur';
  raise notice 'PASS: end_date bounds a daily recurrence';
end $$;

-- =====================================================================
\echo '=== 5. reminder_streak: consecutive scheduled days, gaps ignored, today-open, skip breaks ==='
insert into public.reminders (id, title, kind, freq, weekdays, start_date)
values ('a0000000-0000-0000-0000-000000000005', 'Gym streak', 'recurring', 'weekly',
        array[1,3,5]::smallint[], '2026-09-01');

insert into public.reminder_completions (reminder_id, occurrence_date, status) values
  ('a0000000-0000-0000-0000-000000000005', '2026-09-28', 'done'),
  ('a0000000-0000-0000-0000-000000000005', '2026-09-30', 'done'),
  ('a0000000-0000-0000-0000-000000000005', '2026-10-02', 'done');

do $$
declare v_streak int;
begin
  -- p_today = the last done day itself: 3 consecutive scheduled days, Tue/Thu never scheduled.
  select public.reminder_streak('a0000000-0000-0000-0000-000000000005', '2026-10-02') into v_streak;
  assert v_streak = 3, format('expected streak 3 on the last done day, got %s', v_streak);

  -- p_today = the next scheduled day (Mon 5 Oct), not yet done: today stays open, doesn't break it.
  select public.reminder_streak('a0000000-0000-0000-0000-000000000005', '2026-10-05') into v_streak;
  assert v_streak = 3, format('an unfinished today should not break the streak, got %s', v_streak);
  raise notice 'PASS: streak=3, unfinished today does not break it';
end $$;

-- remove the middle day entirely -> a missing scheduled day breaks the walk.
delete from public.reminder_completions
where reminder_id = 'a0000000-0000-0000-0000-000000000005' and occurrence_date = '2026-09-30';

do $$
declare v_streak int;
begin
  select public.reminder_streak('a0000000-0000-0000-0000-000000000005', '2026-10-02') into v_streak;
  assert v_streak = 1, format('a missing scheduled day should stop the walk, got %s', v_streak);
  raise notice 'PASS: a missing scheduled day breaks the streak (streak=1)';
end $$;

-- mark that same day 'skipped' instead of missing -> same break, for the same reason.
insert into public.reminder_completions (reminder_id, occurrence_date, status)
values ('a0000000-0000-0000-0000-000000000005', '2026-09-30', 'skipped');

do $$
declare v_streak int;
begin
  select public.reminder_streak('a0000000-0000-0000-0000-000000000005', '2026-10-02') into v_streak;
  assert v_streak = 1, format('a skipped scheduled day should stop the walk, got %s', v_streak);
  raise notice 'PASS: a skipped day breaks the streak (streak=1)';
end $$;

-- =====================================================================
\echo '=== 6. pause -> resume: excused backfill on scheduled days only, streak carries through ==='
-- Intrinsically today-relative (reminder_pause/resume have no override
-- param) — captured once, everything below is derived from that snapshot.
do $$
declare
  v_id uuid := 'a0000000-0000-0000-0000-000000000006';
  v_today date := public.user_today();
  v_pause date := v_today - 10;
  v_r public.reminders%rowtype;
  v_d date;
  v_done_count int := 0;
  v_status text;
  v_paused_at timestamptz;
  v_bad int;
  v_excused int;
  v_streak int;
begin
  insert into public.reminders (id, title, kind, freq, weekdays, start_date)
  values (v_id, 'Gym pause test', 'recurring', 'weekly', array[1,3,5]::smallint[], v_today - 60);

  select * into v_r from public.reminders where id = v_id;

  -- mark the 3 scheduled occurrences right before the pause date as done.
  v_d := v_pause - 1;
  while v_done_count < 3 loop
    if public.reminder_occurs_on(v_r, v_d) then
      insert into public.reminder_completions (reminder_id, occurrence_date, status)
      values (v_id, v_d, 'done');
      v_done_count := v_done_count + 1;
    end if;
    v_d := v_d - 1;
  end loop;

  update public.reminders set status = 'paused', paused_at = v_pause::timestamp where id = v_id;

  perform public.reminder_resume(v_id);

  select status, paused_at into v_status, v_paused_at from public.reminders where id = v_id;
  assert v_status = 'active', 'resume should reactivate the reminder';
  assert v_paused_at is null, 'resume should clear paused_at';

  select count(*) into v_bad
  from public.reminder_completions c
  where c.reminder_id = v_id and c.status = 'excused'
    and (c.occurrence_date < v_pause or c.occurrence_date >= v_today
         or not public.reminder_occurs_on(v_r, c.occurrence_date));
  assert v_bad = 0, 'every excused row must be a scheduled day within [pause, today)';

  select count(*) into v_excused
  from public.reminder_completions where reminder_id = v_id and status = 'excused';
  assert v_excused > 0, 'a 10-day pause should have backfilled at least one excused day';

  select public.reminder_streak(v_id, v_today) into v_streak;
  assert v_streak = 3, format('the pause gap should not break the pre-pause streak, got %s', v_streak);

  raise notice 'PASS: resume backfills % excused day(s) on scheduled dates only; streak carries through at %', v_excused, v_streak;
end $$;

-- =====================================================================
\echo '=== 7. journal-satisfied: is_done flips once office_journal has an entry; complete() raises ==='
insert into public.reminders (id, title, kind, freq, satisfied_by, start_date)
values ('a0000000-0000-0000-0000-000000000007', 'Journal', 'recurring', 'daily', 'office_journal', '2026-01-01');

do $$
declare v_done boolean; v_via text;
begin
  select is_done, done_via into v_done, v_via
  from public.reminders_today('2026-10-05')
  where id = 'a0000000-0000-0000-0000-000000000007';
  assert v_done = false, 'no journal entry yet -> is_done should be false';
  assert v_via is null, 'done_via should be null with nothing done';
  raise notice 'PASS: journal-satisfied is_done=false with no entry';
end $$;

insert into public.office_journal (user_id, entry_date, body)
values ('11111111-1111-1111-1111-111111111111', '2026-10-05', 'wrote something today');

do $$
declare v_done boolean; v_via text;
begin
  select is_done, done_via into v_done, v_via
  from public.reminders_today('2026-10-05')
  where id = 'a0000000-0000-0000-0000-000000000007';
  assert v_done = true, 'a journal entry for the date should flip is_done true';
  assert v_via = 'module', 'done_via should be module, not tick';
  raise notice 'PASS: journal-satisfied is_done=true after an office_journal row';
end $$;

do $$
begin
  begin
    perform public.reminder_complete('a0000000-0000-0000-0000-000000000007', '2026-10-05');
    raise exception 'reminder_complete should have raised for a module-satisfied reminder';
  exception when others then
    if sqlerrm like 'reminder_complete should have raised%' then
      raise;
    end if;
    raise notice 'PASS: reminder_complete raises on a module-satisfied reminder (%)', sqlerrm;
  end;
end $$;

-- =====================================================================
\echo '=== 8. one-time: overdue carries forward; snoozed is hidden; done -> case (c) ==='
insert into public.reminders (id, title, kind, due_date)
values ('a0000000-0000-0000-0000-000000000008', 'Pay plumber', 'one_time', '2026-09-10');

do $$
declare v_overdue boolean; v_state text;
begin
  select is_overdue, due_state into v_overdue, v_state
  from public.reminders_today('2026-09-15')
  where id = 'a0000000-0000-0000-0000-000000000008';
  assert v_overdue = true, 'a one-time reminder due in the past should carry forward as overdue';
  assert v_state = 'overdue', 'due_state should read overdue';
  raise notice 'PASS: overdue one-time carries forward to a later p_date';
end $$;

update public.reminders set snoozed_until = now() + interval '1 day'
where id = 'a0000000-0000-0000-0000-000000000008';

do $$
declare v_hidden boolean;
begin
  select not exists (
    select 1 from public.reminders_today('2026-09-15') where id = 'a0000000-0000-0000-0000-000000000008'
  ) into v_hidden;
  assert v_hidden, 'a reminder snoozed into the future should be hidden from reminders_today';
  raise notice 'PASS: a future-snoozed one-time reminder is hidden';
end $$;

update public.reminders set snoozed_until = now() - interval '1 day'
where id = 'a0000000-0000-0000-0000-000000000008';

select public.reminder_complete('a0000000-0000-0000-0000-000000000008');

do $$
declare v_today date := public.user_today();
declare v_done boolean; v_via text; v_status text;
begin
  select is_done, done_via, completion_status into v_done, v_via, v_status
  from public.reminders_today(v_today)
  where id = 'a0000000-0000-0000-0000-000000000008';
  assert v_done = true, 'after completing, the reminder should show done on the completion day';
  assert v_via = 'tick', 'done_via should be tick';
  assert v_status = 'done', 'completion_status should be done';

  assert not exists (
    select 1 from public.reminders_today('2026-09-15') where id = 'a0000000-0000-0000-0000-000000000008'
  ), 'once completed, it should no longer show as open/overdue on any other date';
  raise notice 'PASS: a completed one-time reminder moves to case (c) on its completion day only';
end $$;

-- =====================================================================
\echo '=== 9. complete/uncomplete on a reminder linked to a manual streak goal ==='
insert into public.goals (id, title, type, target, source)
values ('b0000000-0000-0000-0000-000000000001', 'Gym goal', 'streak', 1, '{"kind":"manual"}');

insert into public.reminders (id, title, kind, due_date, goal_id)
values ('a0000000-0000-0000-0000-000000000009', 'Vitamin D', 'one_time', '2026-09-20',
        'b0000000-0000-0000-0000-000000000001');

do $$
declare v_count int;
begin
  perform public.reminder_complete('a0000000-0000-0000-0000-000000000009');
  perform public.reminder_complete('a0000000-0000-0000-0000-000000000009'); -- twice: idempotent

  select count(*) into v_count
  from public.goal_progress
  where goal_id = 'b0000000-0000-0000-0000-000000000001' and occurred_on = '2026-09-20';
  assert v_count = 1, format('completing twice should not duplicate goal_progress, got %s row(s)', v_count);

  perform public.reminder_uncomplete('a0000000-0000-0000-0000-000000000009');

  select count(*) into v_count
  from public.goal_progress
  where goal_id = 'b0000000-0000-0000-0000-000000000001' and occurred_on = '2026-09-20';
  assert v_count = 0, format('uncomplete should remove the goal_progress row, got %s row(s) left', v_count);

  raise notice 'PASS: complete/uncomplete on a goal-linked reminder writes exactly one goal_progress row, idempotently';
end $$;

-- =====================================================================
\echo '=== 10. reminder_skip unlogs a prior goal_progress row; skip on one-time raises ==='
insert into public.goals (id, title, type, target, source)
values ('b0000000-0000-0000-0000-000000000002', 'Meditation streak goal', 'streak', 1, '{"kind":"manual"}');

insert into public.reminders (id, title, kind, freq, start_date, goal_id)
values ('a0000000-0000-0000-0000-00000000000a', 'Meditate', 'recurring', 'daily', '2026-01-01',
        'b0000000-0000-0000-0000-000000000002');

select public.reminder_complete('a0000000-0000-0000-0000-00000000000a', '2026-09-15');

do $$
declare v_count int;
begin
  select count(*) into v_count from public.goal_progress
  where goal_id = 'b0000000-0000-0000-0000-000000000002' and occurred_on = '2026-09-15';
  assert v_count = 1, format('completing a goal-linked recurring reminder should log one row, got %s', v_count);
  raise notice 'PASS: completing a goal-linked recurring reminder logs goal_progress';
end $$;

select public.reminder_skip('a0000000-0000-0000-0000-00000000000a', '2026-09-15');

do $$
declare v_status text; v_count int;
begin
  select status into v_status from public.reminder_completions
  where reminder_id = 'a0000000-0000-0000-0000-00000000000a' and occurrence_date = '2026-09-15';
  assert v_status = 'skipped', format('expected completion status skipped, got %s', v_status);

  select count(*) into v_count from public.goal_progress
  where goal_id = 'b0000000-0000-0000-0000-000000000002' and occurred_on = '2026-09-15';
  assert v_count = 0, format('skip should have removed the goal_progress row, got %s row(s) left', v_count);

  raise notice 'PASS: skipping a previously-done occurrence flips status to skipped and unlogs goal_progress';
end $$;

do $$
begin
  begin
    -- the one_time "Pay plumber" reminder from block 8.
    perform public.reminder_skip('a0000000-0000-0000-0000-000000000008');
    raise exception 'reminder_skip should have raised for a one_time reminder';
  exception when others then
    if sqlerrm like 'reminder_skip should have raised%' then
      raise;
    end if;
    raise notice 'PASS: reminder_skip raises on a one_time reminder (%)', sqlerrm;
  end;
end $$;

-- =====================================================================
\echo '=== 11. reminder_history: weekly MWF over a fixed 2-week window ==='
insert into public.reminders (id, title, kind, freq, weekdays, start_date)
values ('a0000000-0000-0000-0000-00000000000b', 'History MWF', 'recurring', 'weekly',
        array[1,3,5]::smallint[], '2026-08-01');

insert into public.reminder_completions (reminder_id, occurrence_date, status) values
  ('a0000000-0000-0000-0000-00000000000b', '2026-09-21', 'done'),  -- Mon
  ('a0000000-0000-0000-0000-00000000000b', '2026-09-25', 'done');  -- Fri
  -- 2026-09-23 (Wed) deliberately left with no completion -> missed

do $$
declare v_state text;
begin
  select state into v_state from public.reminder_history(14, '2026-09-27')
    where reminder_id = 'a0000000-0000-0000-0000-00000000000b' and d = '2026-09-21';
  assert v_state = 'done', format('Mon 21 Sep should be done, got %s', v_state);

  select state into v_state from public.reminder_history(14, '2026-09-27')
    where reminder_id = 'a0000000-0000-0000-0000-00000000000b' and d = '2026-09-22';
  assert v_state = 'unscheduled', format('Tue 22 Sep should be unscheduled, got %s', v_state);

  select state into v_state from public.reminder_history(14, '2026-09-27')
    where reminder_id = 'a0000000-0000-0000-0000-00000000000b' and d = '2026-09-23';
  assert v_state = 'missed', format('Wed 23 Sep (scheduled, no completion, past) should be missed, got %s', v_state);

  select state into v_state from public.reminder_history(14, '2026-09-27')
    where reminder_id = 'a0000000-0000-0000-0000-00000000000b' and d = '2026-09-25';
  assert v_state = 'done', format('Fri 25 Sep should be done, got %s', v_state);

  select state into v_state from public.reminder_history(14, '2026-09-27')
    where reminder_id = 'a0000000-0000-0000-0000-00000000000b' and d = '2026-09-27';
  assert v_state = 'unscheduled', format('Sun 27 Sep should be unscheduled, got %s', v_state);

  -- a separate call with p_today = Mon 28 Sep: scheduled, no completion, IS p_today -> open
  select state into v_state from public.reminder_history(14, '2026-09-28')
    where reminder_id = 'a0000000-0000-0000-0000-00000000000b' and d = '2026-09-28';
  assert v_state = 'open', format('Mon 28 Sep as p_today (scheduled, not yet done) should be open, got %s', v_state);

  raise notice 'PASS: reminder_history covers done/unscheduled/missed/open over a weekly MWF window';
end $$;

-- =====================================================================
\echo '=== 12. reminder_history: a module-satisfied day ==='
insert into public.reminders (id, title, kind, freq, satisfied_by, start_date)
values ('a0000000-0000-0000-0000-00000000000c', 'History Journal', 'recurring', 'daily',
        'office_journal', '2026-08-01');

insert into public.office_journal (user_id, entry_date, body)
values ('11111111-1111-1111-1111-111111111111', '2026-09-20', 'wrote something on the 20th');

do $$
declare v_state text;
begin
  select state into v_state from public.reminder_history(30, '2026-09-27')
    where reminder_id = 'a0000000-0000-0000-0000-00000000000c' and d = '2026-09-20';
  assert v_state = 'module', format('20 Sep (journal entry exists) should be module, got %s', v_state);

  select state into v_state from public.reminder_history(30, '2026-09-27')
    where reminder_id = 'a0000000-0000-0000-0000-00000000000c' and d = '2026-09-19';
  assert v_state = 'missed', format('19 Sep (no journal entry, past, scheduled) should be missed, got %s', v_state);

  raise notice 'PASS: reminder_history reports module for a journal-satisfied day';
end $$;

-- =====================================================================
\echo '=== 13. reminder_history: an excused day ==='
insert into public.reminders (id, title, kind, freq, start_date)
values ('a0000000-0000-0000-0000-00000000000d', 'History Excused', 'recurring', 'daily', '2026-08-01');

insert into public.reminder_completions (reminder_id, occurrence_date, status)
values ('a0000000-0000-0000-0000-00000000000d', '2026-09-18', 'excused');

do $$
declare v_state text;
begin
  select state into v_state from public.reminder_history(30, '2026-09-27')
    where reminder_id = 'a0000000-0000-0000-0000-00000000000d' and d = '2026-09-18';
  assert v_state = 'excused', format('18 Sep (excused completion) should be excused, got %s', v_state);

  select state into v_state from public.reminder_history(30, '2026-09-27')
    where reminder_id = 'a0000000-0000-0000-0000-00000000000d' and d = '2026-09-17';
  assert v_state = 'missed', format('17 Sep (scheduled, no completion, past) should be missed, got %s', v_state);

  raise notice 'PASS: reminder_history reports excused for a backfilled paused day';
end $$;

-- =====================================================================
\echo '=== 14. reminder_complete/uncomplete on a manual count goal: +1 per tick, -1 per untick ==='
insert into public.goals (id, title, type, target, source)
values ('c0000000-0000-0000-0000-000000000001', 'Reading sessions', 'count', 10, '{"kind":"manual"}');

insert into public.reminders (id, title, kind, freq, start_date, goal_id)
values ('a0000000-0000-0000-0000-00000000000e', 'Read', 'recurring', 'daily', '2026-01-01',
        'c0000000-0000-0000-0000-000000000001');

select public.reminder_complete('a0000000-0000-0000-0000-00000000000e', '2026-09-15');
select public.reminder_complete('a0000000-0000-0000-0000-00000000000e', '2026-09-16');

do $$
declare v_count int;
begin
  select count(*) into v_count from public.goal_progress
  where goal_id = 'c0000000-0000-0000-0000-000000000001';
  assert v_count = 2, format('two distinct ticks should write two rows, got %s', v_count);

  -- re-tick the same occurrence: idempotent, not a third row
  perform public.reminder_complete('a0000000-0000-0000-0000-00000000000e', '2026-09-15');
  select count(*) into v_count from public.goal_progress
  where goal_id = 'c0000000-0000-0000-0000-000000000001';
  assert v_count = 2, format('re-ticking the same day should not add a third row, got %s', v_count);

  raise notice 'PASS: a count goal gets one row per distinct tick, idempotent per occurrence';
end $$;

select public.reminder_uncomplete('a0000000-0000-0000-0000-00000000000e', '2026-09-15');

do $$
declare v_count int;
begin
  select count(*) into v_count from public.goal_progress
  where goal_id = 'c0000000-0000-0000-0000-000000000001';
  assert v_count = 1, format('untick should remove exactly that day''s row, got %s left', v_count);
  raise notice 'PASS: unticking a count-linked reminder removes exactly one row';
end $$;

-- =====================================================================
\echo '=== 15. streak goal with a pre-existing hand-logged row: tick/untick leave it alone ==='
insert into public.goals (id, title, type, target, source)
values ('c0000000-0000-0000-0000-000000000002', 'Meditate streak', 'streak', 1, '{"kind":"manual"}');

insert into public.reminders (id, title, kind, freq, start_date, goal_id)
values ('a0000000-0000-0000-0000-00000000000f', 'Meditate', 'recurring', 'daily', '2026-01-01',
        'c0000000-0000-0000-0000-000000000002');

-- a hand-logged row, same shape toggleStreakDay writes: no source_reminder_id
insert into public.goal_progress (goal_id, occurred_on, value)
values ('c0000000-0000-0000-0000-000000000002', '2026-09-15', 1);

select public.reminder_complete('a0000000-0000-0000-0000-00000000000f', '2026-09-15');

do $$
declare v_count int; v_source uuid;
begin
  select count(*) into v_count from public.goal_progress
  where goal_id = 'c0000000-0000-0000-0000-000000000002' and occurred_on = '2026-09-15';
  assert v_count = 1, format('ticking a day already hand-logged should not duplicate it, got %s', v_count);

  select source_reminder_id into v_source from public.goal_progress
  where goal_id = 'c0000000-0000-0000-0000-000000000002' and occurred_on = '2026-09-15';
  assert v_source is null, 'the surviving row must still be the hand-logged one (source_reminder_id null)';

  raise notice 'PASS: tick adds nothing when the day is already hand-logged';
end $$;

select public.reminder_uncomplete('a0000000-0000-0000-0000-00000000000f', '2026-09-15');

do $$
declare v_count int;
begin
  select count(*) into v_count from public.goal_progress
  where goal_id = 'c0000000-0000-0000-0000-000000000002' and occurred_on = '2026-09-15';
  assert v_count = 1, format('untick must not remove a hand-logged row it never wrote, got %s left', v_count);
  raise notice 'PASS: untick leaves a hand-logged row alone';
end $$;

-- =====================================================================
\echo '=== 16. skip removes only the reminder''s own row, never another source''s ==='
-- a count goal so two rows can legitimately coexist on the same day: one
-- hand-logged, one from this reminder's own tick.
insert into public.goals (id, title, type, target, source)
values ('c0000000-0000-0000-0000-000000000003', 'Errands', 'count', 10, '{"kind":"manual"}');

insert into public.reminders (id, title, kind, freq, start_date, goal_id)
values ('a0000000-0000-0000-0000-000000000010', 'Errand reminder', 'recurring', 'daily', '2026-01-01',
        'c0000000-0000-0000-0000-000000000003');

insert into public.goal_progress (goal_id, occurred_on, value)
values ('c0000000-0000-0000-0000-000000000003', '2026-09-15', 1);

select public.reminder_complete('a0000000-0000-0000-0000-000000000010', '2026-09-15');

do $$
declare v_count int;
begin
  select count(*) into v_count from public.goal_progress
  where goal_id = 'c0000000-0000-0000-0000-000000000003' and occurred_on = '2026-09-15';
  assert v_count = 2, format('hand-logged row + reminder tick should coexist, got %s', v_count);
end $$;

select public.reminder_skip('a0000000-0000-0000-0000-000000000010', '2026-09-15');

do $$
declare v_count int; v_source uuid;
begin
  select count(*) into v_count from public.goal_progress
  where goal_id = 'c0000000-0000-0000-0000-000000000003' and occurred_on = '2026-09-15';
  assert v_count = 1, format('skip should remove only this reminder''s own row, got %s left', v_count);

  select source_reminder_id into v_source from public.goal_progress
  where goal_id = 'c0000000-0000-0000-0000-000000000003' and occurred_on = '2026-09-15';
  assert v_source is null, 'the row left behind must be the hand-logged one';

  raise notice 'PASS: skip removes only the reminder''s own goal_progress row';
end $$;

-- =====================================================================
\echo '=== 17. a computed-goal link never writes goal_progress ==='
insert into public.goals (id, title, type, target, source)
values ('c0000000-0000-0000-0000-000000000004', 'Journal streak (computed)', 'streak', 1, '{"kind":"journal_streak"}');

insert into public.reminders (id, title, kind, freq, start_date, goal_id)
values ('a0000000-0000-0000-0000-000000000011', 'Journal (goal-linked)', 'recurring', 'daily', '2026-01-01',
        'c0000000-0000-0000-0000-000000000004');

select public.reminder_complete('a0000000-0000-0000-0000-000000000011', '2026-09-16');

do $$
declare v_count int;
begin
  select count(*) into v_count from public.goal_progress
  where goal_id = 'c0000000-0000-0000-0000-000000000004';
  assert v_count = 0, format('a computed-goal link must never write goal_progress, got %s row(s)', v_count);
  raise notice 'PASS: a reminder linked to a computed goal writes nothing to goal_progress';
end $$;

-- =====================================================================
\echo '=== 18. goal_current_value tasks_completed: 00:30 IST counts toward the LOCAL day ==='
insert into public.goals (id, title, type, target, source, cadence)
values ('e0000000-0000-0000-0000-000000000001', 'Tasks parity test', 'count', 100, '{"kind":"tasks_completed"}', 'none');

-- 2026-09-19 19:00:00 UTC = 2026-09-20 00:30 IST
insert into public.office_tasks (title, status, done_at)
values ('Midnight-crossing task', 'done', '2026-09-19 19:00:00+00');

do $$
declare v_new numeric; v_old_utc_day numeric;
begin
  select public.goal_current_value('e0000000-0000-0000-0000-000000000001', '2026-09-20', '2026-09-20') into v_new;
  assert v_new = 1, format('expected 1 task on the correct IST day (Sep 20), got %s', v_new);

  select public.goal_current_value('e0000000-0000-0000-0000-000000000001', '2026-09-19', '2026-09-19') into v_old_utc_day;
  assert v_old_utc_day = 0, format('the old UTC day (Sep 19) should no longer count it, got %s', v_old_utc_day);

  raise notice 'PASS: a task done at 00:30 IST (19:00 UTC the day before) counts on the IST day, not the UTC day';
end $$;

-- =====================================================================
\echo '=== 19. goal_current_value tasks_completed: a reminder completion counts only when counts_as_task ==='
-- tasks_completed sums across ALL of the user's done office_tasks +
-- counts_as_task reminder completions in range, not scoped to one goal --
-- so this uses its own date (22 Sep) to stay clear of block 18's fixture
-- office_task on 20 Sep for the same shared test user.
insert into public.goals (id, title, type, target, source)
values ('e0000000-0000-0000-0000-000000000002', 'Tasks parity test 2', 'count', 100, '{"kind":"tasks_completed"}');

insert into public.reminders (id, title, kind, due_date, counts_as_task)
values ('a0000000-0000-0000-0000-000000000012', 'Counted one-time', 'one_time', '2026-09-22', true);
insert into public.reminders (id, title, kind, due_date, counts_as_task)
values ('a0000000-0000-0000-0000-000000000013', 'Not counted one-time', 'one_time', '2026-09-22', false);

insert into public.reminder_completions (reminder_id, occurrence_date, status, completed_at)
values ('a0000000-0000-0000-0000-000000000012', '2026-09-22', 'done', '2026-09-22 10:00:00+05:30');
insert into public.reminder_completions (reminder_id, occurrence_date, status, completed_at)
values ('a0000000-0000-0000-0000-000000000013', '2026-09-22', 'done', '2026-09-22 10:00:00+05:30');

do $$
declare v_count numeric;
begin
  select public.goal_current_value('e0000000-0000-0000-0000-000000000002', '2026-09-22', '2026-09-22') into v_count;
  assert v_count = 1, format('only the counts_as_task reminder completion should count, got %s', v_count);
  raise notice 'PASS: tasks_completed only counts a reminder completion when counts_as_task is true';
end $$;

-- =====================================================================
\echo '=== 20. done_today_feed: a task and a reminder completion on the same local day, one each, correctly sourced ==='
insert into public.office_tasks (title, status, done_at)
values ('Feed task', 'done', '2026-09-20 06:00:00+05:30');

insert into public.reminders (id, title, kind, due_date, counts_as_task)
values ('a0000000-0000-0000-0000-000000000014', 'Feed reminder', 'one_time', '2026-09-20', true);
insert into public.reminder_completions (reminder_id, occurrence_date, status, completed_at)
values ('a0000000-0000-0000-0000-000000000014', '2026-09-20', 'done', '2026-09-20 07:00:00+05:30');

do $$
declare v_task_count int; v_reminder_count int;
begin
  select count(*) into v_task_count from public.done_today_feed('2026-09-20')
    where source = 'task' and title = 'Feed task';
  assert v_task_count = 1, format('expected exactly one task row in the feed, got %s', v_task_count);

  select count(*) into v_reminder_count from public.done_today_feed('2026-09-20')
    where source = 'reminder' and title = 'Feed reminder';
  assert v_reminder_count = 1, format('expected exactly one reminder row in the feed, got %s', v_reminder_count);

  raise notice 'PASS: done_today_feed shows one task row and one reminder row for the same local day, correctly sourced';
end $$;

\echo '=== all blocks passed; rolling back now ==='
rollback;
