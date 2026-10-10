// push-test — sends one test notification to every device the CALLER has
// subscribed (push_subscriptions), and reports how each one went. Runs under
// the caller's own JWT so RLS limits it to their own rows — never the service
// role. Also the trial of jsr:@negrel/webpush (RFC 8291 encryption + RFC 8292
// VAPID on Web Crypto) before the scheduled sender (P3) is built on it.
//
//   supabase secrets set --env-file <file with VAPID_KEYS_JWK, VAPID_SUBJECT>
//   supabase functions deploy push-test
//
// Called via POST /functions/v1/push-test   {}
// → { sent, results: [{ id, device_label, outcome: 'sent'|'gone'|'failed', status, detail? }] }
// A 404/410 from the push service means the subscription is dead: that row is
// deleted. Any other failure bumps failure_count / last_failure_*; a success
// stamps last_success_at and resets failure_count.
// 503 { error: 'not configured' } when the VAPID secrets are missing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { corsHeaders } from '../_shared/cors.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  device_label: string | null;
  failure_count: number;
}

interface Result {
  id: string;
  device_label: string | null;
  outcome: 'sent' | 'gone' | 'failed';
  status: number;
  detail?: string;
}

/** Where a tap on the test notification lands: the app the request came from
 *  (so a local preview opens the local app), else the VAPID subject — which is
 *  the production app URL. */
function reminderUrl(req: Request, subject: string): string {
  for (const candidate of [req.headers.get('Origin'), subject]) {
    try {
      const url = new URL(candidate ?? '');
      if (url.protocol === 'https:' || url.protocol === 'http:') return new URL('/reminders', url.origin).href;
    } catch {
      /* try the next one */
    }
  }
  return '/reminders';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header.' }, 401);

  const keysJwk = Deno.env.get('VAPID_KEYS_JWK');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!keysJwk || !subject) return json({ error: 'not configured' }, 503);

  let appServer: webpush.ApplicationServer;
  try {
    const vapidKeys = await webpush.importVapidKeys(JSON.parse(keysJwk));
    appServer = await webpush.ApplicationServer.new({ contactInformation: subject, vapidKeys });
  } catch (err) {
    return json({ error: 'VAPID_KEYS_JWK could not be loaded', detail: String(err) }, 500);
  }

  // Anon-key client with the caller's own bearer token forwarded — RLS keeps
  // every read and write below to the caller's own rows.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: rows, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, device_label, failure_count')
    .order('created_at');
  if (error) return json({ error: error.message }, 500);

  // Declarative Web Push shape (https://webkit.org/blog/16535/meet-declarative-web-push/);
  // public/sw.js parses the same JSON, so every browser shows the same thing.
  const message = JSON.stringify({
    web_push: 8030,
    notification: {
      title: 'Alfred',
      body: 'Test notification — tap to open Reminders.',
      navigate: reminderUrl(req, subject),
      tag: 'alfred-test',
      lang: 'en',
      dir: 'ltr',
      silent: false,
    },
  });

  const results = await Promise.all(
    (rows as SubscriptionRow[]).map(async (row): Promise<Result> => {
      const base = { id: row.id, device_label: row.device_label };
      try {
        await appServer
          .subscribe({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } })
          .pushTextMessage(message, { ttl: 300, urgency: webpush.Urgency.High });
        await supabase
          .from('push_subscriptions')
          .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
          .eq('id', row.id);
        return { ...base, outcome: 'sent', status: 201 };
      } catch (err) {
        const response = err instanceof webpush.PushMessageError ? err.response : null;
        const status = response?.status ?? 0;
        const detail = response
          ? (await response.text().catch(() => '')).slice(0, 300) || response.statusText
          : String(err);

        // 404/410: the push service has forgotten this subscription for good.
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', row.id);
          return { ...base, outcome: 'gone', status, detail };
        }
        await supabase
          .from('push_subscriptions')
          .update({
            failure_count: row.failure_count + 1,
            last_failure_at: new Date().toISOString(),
            last_failure_status: status,
          })
          .eq('id', row.id);
        return { ...base, outcome: 'failed', status, detail };
      }
    }),
  );

  return json({ sent: results.filter((r) => r.outcome === 'sent').length, results });
});
