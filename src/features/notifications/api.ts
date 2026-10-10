import { supabase } from '@/lib/supabase';

/** Web Push on this device. The browser holds the subscription; one
 *  push_subscriptions row (0046) per device mirrors it so a server can send.
 *  One switch per device — nothing here is per-reminder. */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

/** What Settings → Notifications shows. */
export type PushState =
  /** can't subscribe here: `reason` says why (no PushManager is the iPhone
   *  Safari-tab case — push needs the Home Screen app) */
  | { kind: 'unavailable'; reason: 'install' | 'no-worker' | 'not-configured' }
  /** installed, never asked */
  | { kind: 'ask' }
  | { kind: 'denied' }
  | { kind: 'enabled'; endpoint: string }
  /** allowed, but the browser has no subscription (dropped by the browser,
   *  by iOS after a push that showed nothing, or by Turn off) */
  | { kind: 'resubscribe' };

export interface TestResult {
  id: string;
  device_label: string | null;
  outcome: 'sent' | 'gone' | 'failed';
  status: number;
  detail?: string;
}

function isAppleMobile(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function pushApiPresent(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** The worker main.tsx registers in production builds; undefined in dev. */
async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  return navigator.serviceWorker.getRegistration('/');
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function readPushState(): Promise<PushState> {
  // On iPhone/iPad push only exists inside the Home Screen app.
  if (!pushApiPresent() || (isAppleMobile() && !isStandalone())) {
    return { kind: 'unavailable', reason: 'install' };
  }
  if (!VAPID_PUBLIC_KEY) return { kind: 'unavailable', reason: 'not-configured' };
  const reg = await registration();
  if (!reg) return { kind: 'unavailable', reason: 'no-worker' };

  if (Notification.permission === 'denied') return { kind: 'denied' };
  if (Notification.permission === 'default') return { kind: 'ask' };
  const sub = await reg.pushManager.getSubscription();
  return sub ? { kind: 'enabled', endpoint: sub.endpoint } : { kind: 'resubscribe' };
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** "iPhone", "Mac · Chrome" — display only. */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : 'Linux';
  if (isStandalone()) return device;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  return `${device} · ${browser}`;
}

/** Upsert this device's row — also how each launch re-asserts last_seen_at. */
async function saveSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error('The browser returned an incomplete subscription.');
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: json.endpoint,
      p256dh,
      auth,
      device_label: deviceLabel(),
      user_agent: navigator.userAgent,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,endpoint' },
  );
  if (error) throw error;
}

/** Turn notifications on. `permission` is the promise from a
 *  Notification.requestPermission() call the click handler already made —
 *  iOS only honours the prompt when it is requested inside the tap itself,
 *  before anything else is awaited. */
export async function enablePush(permission: Promise<NotificationPermission>): Promise<void> {
  const result = await permission;
  if (result !== 'granted') return; // the state re-read shows "denied" or "ask"
  const reg = await registration();
  if (!reg) throw new Error('No service worker on this page — notifications need a production build.');
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY),
    }));
  await saveSubscription(sub);
}

/** Unsubscribe this browser and delete its row. Used by "Turn off" and by
 *  sign-out, so a signed-out device stops getting pushes. The browser goes
 *  first: if the delete then fails (offline sign-out), the leftover row points
 *  at a dead endpoint, and the next send's 404/410 prunes it — whereas the
 *  other order could leave a live subscription with no row to manage it. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw error;
}

/** The daily summary time for untimed reminders (profiles.digest_time),
 *  as 'HH:MM' in the user's own timezone. Shared by all their devices. */
export async function getDigestTime(): Promise<string> {
  const { data, error } = await supabase.from('profiles').select('digest_time').maybeSingle();
  if (error) throw error;
  return (data?.digest_time as string | undefined)?.slice(0, 5) ?? '09:00';
}

export async function setDigestTime(value: string): Promise<void> {
  if (!/^\d{2}:\d{2}$/.test(value)) throw new Error('Pick a time.');
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Not signed in.');
  const { data, error } = await supabase
    .from('profiles')
    .update({ digest_time: value })
    .eq('id', userId)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Couldn’t save the summary time.');
}

/** On each app launch: refresh this device's row (last_seen_at, and the
 *  endpoint if the browser rotated it). Silent no-op when push is off. */
export async function reassertPush(): Promise<void> {
  if (!pushApiPresent() || Notification.permission !== 'granted') return;
  const sub = await currentSubscription();
  if (sub) await saveSubscription(sub);
}

/** One test notification to each of the caller's own devices (push-test). */
export async function sendTestPush(): Promise<{ sent: number; results: TestResult[] }> {
  const { data, error } = await supabase.functions.invoke('push-test', { body: {} });
  if (error) {
    // A non-2xx surfaces as a generic "non-2xx status code" message — the
    // function's own { error } body says what actually went wrong.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? (error as Error).message);
  }
  return data as { sent: number; results: TestResult[] };
}
