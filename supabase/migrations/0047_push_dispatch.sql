-- 0047_push_dispatch.sql — Web Push, phone track P3: scheduled dispatch.
--
-- Every minute pg_cron calls _push_dispatch_tick(). If anything is due and
-- unsent it POSTs (pg_net) to the push-dispatch Edge Function, which calls
-- push_claim_due() with the service role, sends each claimed row, and reports
-- back through push_mark_result(). What counts as due lives in exactly one
-- place, _push_due(p_now), which reuses reminder_occurs_on / reminder_satisfied
-- (0041) — no schedule logic is restated here.
--
-- Rules (decided in P3, see docs/alfred-phone-p0-findings.md):
--   - every active reminder pushes to every subscribed device; reminders.channel
--     stays unread
--   - timed reminders: one push per occurrence at its fire time — recurring at
--     time_of_day, one-time at the later of due_time and snoozed_until; no re-nudge
--   - a send more than 2 hours past its fire time is dropped
--   - untimed reminders: one digest per local day at profiles.digest_time
--   - nothing for an occurrence that is done/skipped/excused, a paused/archived
--     reminder, a module-satisfied day, or a fire time that had already passed
--     when the reminder (or the device's subscription) was created
--
-- The Edge Function URL and the shared bearer secret are NOT in this file:
-- they are Vault secrets (push_dispatch_url, push_dispatch_secret) set by hand
-- per environment. Until both exist the tick returns quietly.

-- ---------- extensions ----------
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------- profiles.digest_time ----------
alter table public.profiles
  add column digest_time time not null default '09:00';

comment on column public.profiles.digest_time is
  'Local time (profiles.timezone) of the daily Web Push digest of untimed '
  'reminders. Edited in Settings → Notifications. Default 09:00.';

-- ---------- per-user time helpers ----------
-- user_timezone(u): the one place the "no profile/timezone → Asia/Kolkata"
-- default lives. user_today_for(u): that user's local date. user_today() is
-- redefined on top of them with identical behaviour (0040's body inlined the
-- same coalesce for auth.uid()).
create or replace function public.user_timezone(p_user uuid)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce((select timezone from public.profiles where id = p_user), 'Asia/Kolkata');
$$;

create or replace function public.user_today_for(p_user uuid)
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone public.user_timezone(p_user))::date;
$$;

create or replace function public.user_today()
returns date
language sql
stable
set search_path = public
as $$
  select public.user_today_for(auth.uid());
$$;

revoke all on function public.user_timezone(uuid) from public, anon;
revoke all on function public.user_today_for(uuid) from public, anon;
grant execute on function public.user_timezone(uuid) to authenticated, service_role;
grant execute on function public.user_today_for(uuid) to authenticated, service_role;

-- ---------- push_subscriptions.first_failure_at ----------
alter table public.push_subscriptions
  add column first_failure_at timestamptz;

comment on column public.push_subscriptions.first_failure_at is
  'When the current run of consecutive failed sends began (null after a '
  'success). push_mark_result removes the subscription once failure_count '
  'reaches 5 AND the run has lasted at least 24 hours.';

-- ---------- push_sends: the send ledger ----------
create table public.push_sends (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  kind text not null check (kind in ('reminder', 'digest', 'test')),
  reminder_id uuid references public.reminders(id) on delete cascade,
  occurrence_date date not null,
  fire_at timestamptz not null,
  title text not null,
  body text not null default '',
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'failed')),
  http_status int,
  error text,
  attempts smallint not null default 1 check (attempts >= 1),
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'reminder') = (reminder_id is not null)),
  constraint push_sends_once unique nulls not distinct
    (subscription_id, kind, reminder_id, occurrence_date, fire_at)
);
create index push_sends_stuck on public.push_sends (claimed_at) where status = 'claimed';
create index push_sends_user on public.push_sends (user_id, created_at);

create trigger push_sends_set_updated_at
before update on public.push_sends
for each row execute function public.set_updated_at();

-- Owner may READ their ledger; every write goes through the service-role
-- functions below (a deliberate exception to the owner-all convention).
alter table public.push_sends enable row level security;
create policy "push_sends owner select" on public.push_sends
  for select
  using (auth.uid() = user_id);

comment on table public.push_sends is
  'Web Push send ledger: one row per (device, occurrence) claimed for sending. '
  'The unique key makes a claim happen once even if cron runs overlap; '
  'written only by push_claim_due / push_mark_result (service role).';
comment on column public.push_sends.id is 'Claim id; what push_mark_result is called with.';
comment on column public.push_sends.user_id is 'Owner (the subscription''s user).';
comment on column public.push_sends.subscription_id is
  'The device sent to. Cascades: deleting a dead subscription drops its ledger rows.';
comment on column public.push_sends.kind is
  'reminder (one timed occurrence), digest (the daily untimed summary) or test.';
comment on column public.push_sends.reminder_id is 'The reminder, for kind=reminder; null otherwise.';
comment on column public.push_sends.occurrence_date is
  'The local date of the occurrence (one-time: due_date) or of the digest.';
comment on column public.push_sends.fire_at is
  'The instant the push was due. Part of the unique key, so an edited time or '
  'a new snooze sends again; a second digest on the same local day never does.';
comment on column public.push_sends.title is 'Notification title as claimed.';
comment on column public.push_sends.body is 'Notification body as claimed.';
comment on column public.push_sends.status is
  'claimed (being sent), sent (push service accepted it) or failed.';
comment on column public.push_sends.http_status is
  'Push service HTTP status of the last attempt; 0 when there was no response.';
comment on column public.push_sends.error is 'Failure detail, if any.';
comment on column public.push_sends.attempts is
  'Claims so far. A claim stuck >5 minutes is re-claimed up to 3 attempts in all.';
comment on column public.push_sends.claimed_at is 'When the current attempt was claimed.';
comment on column public.push_sends.sent_at is 'When the push service accepted the message.';
comment on column public.push_sends.created_at is 'When the first claim was made.';
comment on column public.push_sends.updated_at is 'Last write; set_updated_at() trigger.';

-- ---------- _push_due: what is due at p_now, for every user ----------
-- One row per occurrence that should be (or should have been) pushed with a
-- fire time in (p_now - 2h, p_now]: timed reminders, and each user's daily
-- digest of untimed ones. Ignores devices and the ledger — see
-- _push_unclaimed. Local dates/times are each user's own profiles.timezone;
-- today and yesterday are both considered so a window crossing local
-- midnight is covered.
create or replace function public._push_due(p_now timestamptz)
returns table (
  user_id uuid,
  kind text,
  reminder_id uuid,
  occurrence_date date,
  fire_at timestamptz,
  title text,
  body text
)
language sql
stable
set search_path = public
as $$
  with u as (
    select p.id as user_id, public.user_timezone(p.id) as tz, p.digest_time
    from public.profiles p
  ),
  days as (
    select u.user_id, u.tz, u.digest_time, ((p_now at time zone u.tz)::date - k) as day
    from u cross join generate_series(0, 1) as k
  ),
  timed as (
    -- recurring: one occurrence per scheduled day, at time_of_day
    select r.user_id, r.id as reminder_id, days.day as occurrence_date,
           ((days.day + r.time_of_day) at time zone days.tz) as fire_at,
           r.title, r.created_at, days.tz
    from days
    join public.reminders r on r.user_id = days.user_id
    where r.kind = 'recurring'
      and r.status = 'active'
      and r.time_of_day is not null
      and public.reminder_occurs_on(r, days.day)
      and not exists (
        select 1 from public.reminder_completions c
        where c.reminder_id = r.id and c.occurrence_date = days.day
      )
      and not public.reminder_satisfied(r, days.day)
    union all
    -- one-time: once, at the later of its due time and any snooze
    select r.user_id, r.id, r.due_date,
           greatest((r.due_date + r.due_time) at time zone u.tz, r.snoozed_until),
           r.title, r.created_at, u.tz
    from u
    join public.reminders r on r.user_id = u.user_id
    where r.kind = 'one_time'
      and r.status = 'active'
      and r.due_time is not null
      and not exists (select 1 from public.reminder_completions c where c.reminder_id = r.id)
      and not public.reminder_satisfied(r, r.due_date)
  ),
  digest_slots as (
    select days.user_id, days.day, ((days.day + days.digest_time) at time zone days.tz) as fire_at
    from days
  ),
  digest_items as (
    select s.user_id, s.day, s.fire_at, r.title,
           (r.kind = 'one_time' and r.due_date < s.day) as overdue, r.created_at
    from digest_slots s
    join public.reminders r on r.user_id = s.user_id
    where s.fire_at <= p_now
      and s.fire_at > p_now - interval '2 hours'
      and r.status = 'active'
      and r.created_at <= s.fire_at
      and (
        (r.kind = 'recurring'
          and r.time_of_day is null
          and public.reminder_occurs_on(r, s.day)
          and not exists (
            select 1 from public.reminder_completions c
            where c.reminder_id = r.id and c.occurrence_date = s.day
          )
          and not public.reminder_satisfied(r, s.day))
        or
        (r.kind = 'one_time'
          and r.due_time is null
          and r.due_date <= s.day
          and not exists (select 1 from public.reminder_completions c where c.reminder_id = r.id)
          and (r.snoozed_until is null or r.snoozed_until <= s.fire_at))
      )
  )
  select t.user_id, 'reminder', t.reminder_id, t.occurrence_date, t.fire_at, t.title,
         'Due ' || to_char(t.fire_at at time zone t.tz, 'HH24:MI')
  from timed t
  where t.fire_at <= p_now
    and t.fire_at > p_now - interval '2 hours'
    and t.created_at <= t.fire_at
  union all
  select i.user_id, 'digest', null::uuid, i.day, i.fire_at,
         case when count(*) = 1 then 'Today: 1 reminder' else 'Today: ' || count(*) || ' reminders' end,
         array_to_string(
           (array_agg(i.title order by i.overdue desc, i.created_at, i.title))[1:3], ' · '
         ) || case when count(*) > 3 then ' · +' || (count(*) - 3) || ' more' else '' end
  from digest_items i
  group by i.user_id, i.day, i.fire_at;
$$;

-- ---------- _push_unclaimed: due × devices, minus the ledger ----------
-- A device only gets occurrences whose fire time is at or after it
-- subscribed (no backlog burst on first enable). Reminder rows dedupe on the
-- exact fire_at; a digest is once per device per local day whatever its time.
create or replace function public._push_unclaimed(p_now timestamptz)
returns table (
  user_id uuid,
  subscription_id uuid,
  kind text,
  reminder_id uuid,
  occurrence_date date,
  fire_at timestamptz,
  title text,
  body text
)
language sql
stable
set search_path = public
as $$
  select d.user_id, s.id, d.kind, d.reminder_id, d.occurrence_date, d.fire_at, d.title, d.body
  from public._push_due(p_now) d
  join public.push_subscriptions s on s.user_id = d.user_id and s.created_at <= d.fire_at
  where not exists (
    select 1 from public.push_sends x
    where x.subscription_id = s.id
      and x.kind = d.kind
      and x.reminder_id is not distinct from d.reminder_id
      and x.occurrence_date = d.occurrence_date
      and (x.fire_at = d.fire_at or d.kind = 'digest')
  );
$$;

revoke all on function public._push_due(timestamptz) from public, anon, authenticated;
revoke all on function public._push_unclaimed(timestamptz) from public, anon, authenticated;

-- ---------- push_claim_due: the sender's one call ----------
-- Claims everything due and unsent at p_now and returns ONLY the rows this
-- call claimed, with what the sender needs. Overlapping calls can't both
-- claim a row: the insert is on conflict do nothing against push_sends_once,
-- and a re-claim is an UPDATE whose WHERE is re-checked after the row lock.
-- A claim left 'claimed' for more than 5 minutes (the sender died) is
-- re-claimed while it is still due, up to 3 attempts; otherwise it is failed.
create or replace function public.push_claim_due(p_now timestamptz default now())
returns table (
  claim_id bigint,
  attempts smallint,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  kind text,
  reminder_id uuid,
  occurrence_date date,
  fire_at timestamptz,
  title text,
  body text,
  tag text,
  url_path text
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_reclaimed bigint[];
  v_new bigint[];
begin
  -- stuck and not worth retrying: out of attempts, or no longer due (done,
  -- late, deleted...) — fail them so they stop being stuck
  update public.push_sends x
  set status = 'failed',
      error = case when x.attempts >= 3 then 'abandoned: still unsent after 3 attempts'
                   else 'abandoned: no longer due' end
  where x.status = 'claimed'
    and x.claimed_at < p_now - interval '5 minutes'
    and (
      x.attempts >= 3
      or not exists (
        select 1 from public._push_due(p_now) d
        where d.user_id = x.user_id and d.kind = x.kind
          and d.reminder_id is not distinct from x.reminder_id
          and d.occurrence_date = x.occurrence_date and d.fire_at = x.fire_at
      )
    );

  with r as (
    update public.push_sends x
    set attempts = x.attempts + 1, claimed_at = p_now
    where x.status = 'claimed'
      and x.claimed_at < p_now - interval '5 minutes'
      and x.attempts < 3
    returning x.id
  )
  select coalesce(array_agg(r.id), '{}') into v_reclaimed from r;

  with i as (
    insert into public.push_sends
      (user_id, subscription_id, kind, reminder_id, occurrence_date, fire_at, title, body, claimed_at)
    select n.user_id, n.subscription_id, n.kind, n.reminder_id, n.occurrence_date, n.fire_at,
           n.title, n.body, p_now
    from public._push_unclaimed(p_now) n
    on conflict do nothing
    returning id
  )
  select coalesce(array_agg(i.id), '{}') into v_new from i;

  return query
  select x.id, x.attempts, s.id, s.endpoint, s.p256dh, s.auth, x.kind, x.reminder_id,
         x.occurrence_date, x.fire_at, x.title, x.body,
         case when x.kind = 'reminder' then 'reminder:' || x.reminder_id || ':' || x.occurrence_date
              else x.kind || ':' || x.occurrence_date end,
         '/reminders'::text
  from public.push_sends x
  join public.push_subscriptions s on s.id = x.subscription_id
  where x.id = any (v_reclaimed || v_new)
  order by x.id;
end;
$$;

-- ---------- push_mark_result: the sender's report for one claim ----------
-- 2xx → sent, and the device's failure run resets. 404/410 → the device is
-- gone: its subscription (and, by cascade, its ledger rows) is deleted. Any
-- other status (0 = no response) → failed, failure_count + 1; the device is
-- removed once that run reaches 5 failures spanning at least 24 hours.
-- Returns 'sent' | 'gone' | 'failed' | 'removed' | 'unknown' (not a live claim).
create or replace function public.push_mark_result(
  p_claim_id bigint,
  p_http_status int,
  p_error text default null,
  p_now timestamptz default now()
)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok boolean := p_http_status between 200 and 299;
  v_sub uuid;
  v_count int;
  v_first timestamptz;
begin
  update public.push_sends
  set status = case when v_ok then 'sent' else 'failed' end,
      http_status = p_http_status,
      error = case when v_ok then null else left(p_error, 500) end,
      sent_at = case when v_ok then p_now end
  where id = p_claim_id and status = 'claimed'
  returning subscription_id into v_sub;

  if v_sub is null then
    return 'unknown';
  end if;

  if v_ok then
    update public.push_subscriptions
    set last_success_at = p_now, failure_count = 0, first_failure_at = null
    where id = v_sub;
    return 'sent';
  end if;

  if p_http_status in (404, 410) then
    delete from public.push_subscriptions where id = v_sub;
    return 'gone';
  end if;

  update public.push_subscriptions
  set failure_count = failure_count + 1,
      last_failure_at = p_now,
      last_failure_status = p_http_status,
      -- a run starts at the first failure after a success (push-test resets
      -- failure_count without knowing about first_failure_at)
      first_failure_at = case when failure_count = 0 or first_failure_at is null then p_now
                              else first_failure_at end
  where id = v_sub
  returning failure_count, first_failure_at into v_count, v_first;

  if v_count >= 5 and p_now - v_first >= interval '24 hours' then
    delete from public.push_subscriptions where id = v_sub;
    return 'removed';
  end if;
  return 'failed';
end;
$$;

revoke all on function public.push_claim_due(timestamptz) from public, anon, authenticated;
revoke all on function public.push_mark_result(bigint, int, text, timestamptz) from public, anon, authenticated;
grant execute on function public.push_claim_due(timestamptz) to service_role;
grant execute on function public.push_mark_result(bigint, int, text, timestamptz) to service_role;

-- ---------- the cron tick ----------
-- Cheap when idle: if nothing is unclaimed and nothing is stuck it returns
-- without touching Vault or the network. Otherwise it reads the function URL
-- and bearer secret from Vault and fires one async POST (pg_net); the Edge
-- Function does the claiming. Missing Vault secrets → return quietly, so the
-- job is harmless until they are set by hand.
create or replace function public._push_dispatch_tick()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public._push_unclaimed(now()))
     and not exists (
       select 1 from public.push_sends
       where status = 'claimed' and claimed_at < now() - interval '5 minutes'
     ) then
    return;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'push_dispatch_url' limit 1;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'push_dispatch_secret' limit 1;
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function public._push_dispatch_tick() from public, anon, authenticated;

-- every minute; cron.schedule upserts by job name, so re-running is harmless
select cron.schedule('alfred-push-dispatch', '* * * * *', 'select public._push_dispatch_tick()');
