-- 0046_push_subscriptions.sql — Web Push, phone track P2.
-- One row per (user, browser push subscription): the endpoint and keys a
-- device hands back from pushManager.subscribe(), so a server can encrypt
-- and send to it. Written by the client (Settings → Notifications, and a
-- re-assert on every app launch); read and failure-stamped by the push-test
-- Edge Function under the caller's own JWT, so the standard owner-all RLS is
-- the whole security model. One switch per device — nothing here is
-- per-reminder, and reminders.channel stays unread.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device_label text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count int not null default 0 check (failure_count >= 0),
  last_failure_at timestamptz,
  last_failure_status int,
  unique (user_id, endpoint)
);

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions owner all" on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.push_subscriptions is
  'One row per device (browser push subscription) that has turned on '
  'notifications. Deleted on sign-out from that device, on "Turn off", and '
  'when the push service answers 404/410 (the subscription is gone).';
comment on column public.push_subscriptions.id is
  'Row id; what a send result is reported against.';
comment on column public.push_subscriptions.user_id is
  'Owner. Defaults to auth.uid(); the owner-all RLS policy keys on it.';
comment on column public.push_subscriptions.endpoint is
  'PushSubscription.endpoint — the push service URL to POST to (e.g. '
  'web.push.apple.com for an iPhone, fcm.googleapis.com for Chrome). '
  'Unique per user; a re-subscribe on the same device upserts on it.';
comment on column public.push_subscriptions.p256dh is
  'PushSubscription keys.p256dh — the device''s ECDH public key '
  '(base64url), used to encrypt the payload (RFC 8291).';
comment on column public.push_subscriptions.auth is
  'PushSubscription keys.auth — the device''s auth secret (base64url), '
  'used to encrypt the payload (RFC 8291).';
comment on column public.push_subscriptions.device_label is
  'Human label for the device ("iPhone", "Mac · Chrome"), derived from the '
  'user agent at subscribe time. Display only.';
comment on column public.push_subscriptions.user_agent is
  'navigator.userAgent at the last subscribe or re-assert. Diagnostics only.';
comment on column public.push_subscriptions.created_at is
  'When this device first subscribed.';
comment on column public.push_subscriptions.updated_at is
  'Last write of any kind; maintained by the set_updated_at() trigger.';
comment on column public.push_subscriptions.last_seen_at is
  'Last time the app on this device re-asserted the subscription (every '
  'launch while notifications are allowed). A stale value means the app '
  'has not been opened there for a while.';
comment on column public.push_subscriptions.last_success_at is
  'Last time the push service accepted a message for this endpoint.';
comment on column public.push_subscriptions.failure_count is
  'Consecutive failed sends that were not 404/410 (those delete the row). '
  'Reset to 0 by the next success.';
comment on column public.push_subscriptions.last_failure_at is
  'When the most recent failed send happened.';
comment on column public.push_subscriptions.last_failure_status is
  'HTTP status of the most recent failed send (e.g. 429, 500), or 0 when '
  'the request never got a response.';
