// push-dispatch — the scheduled sender. pg_cron's _push_dispatch_tick (0047)
// POSTs here once a minute while something is due; this function claims the
// due rows (push_claim_due, service role), sends each one through
// jsr:@negrel/webpush, and reports every result back (push_mark_result),
// which marks the claim sent/failed and prunes dead devices.
//
//   supabase secrets set PUSH_DISPATCH_SECRET=...   (plus VAPID_KEYS_JWK, VAPID_SUBJECT)
//   supabase functions deploy push-dispatch
//
// Called via POST /functions/v1/push-dispatch with
//   Authorization: Bearer <PUSH_DISPATCH_SECRET>
// The platform JWT gate is off (verify_jwt = false — the caller is pg_net, not
// a signed-in user); the bearer is checked here, in constant time, against the
// function secret, which must equal the Vault secret push_dispatch_secret.
// → { claimed, sent, failed, gone, removed }
// 503 { error: 'not configured' } when a secret is missing; 401 on a bad bearer.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const LATE_LIMIT_MS = 2 * 60 * 60 * 1000; // a send more than 2h past fire_at is dropped

interface Claim {
  claim_id: number;
  attempts: number;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  kind: string;
  reminder_id: string | null;
  occurrence_date: string;
  fire_at: string;
  title: string;
  body: string;
  tag: string;
  url_path: string;
}

/** Constant-time string equality: compare SHA-256 digests (fixed length) byte by byte. */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const secret = Deno.env.get('PUSH_DISPATCH_SECRET');
  const keysJwk = Deno.env.get('VAPID_KEYS_JWK');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!secret || !keysJwk || !subject) return json({ error: 'not configured' }, 503);

  const presented = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!(await safeEqual(presented, secret))) return json({ error: 'unauthorized' }, 401);

  let appServer: webpush.ApplicationServer;
  let appOrigin: string;
  try {
    appOrigin = new URL(subject).origin; // VAPID_SUBJECT is the app's own URL
    const vapidKeys = await webpush.importVapidKeys(JSON.parse(keysJwk));
    appServer = await webpush.ApplicationServer.new({ contactInformation: subject, vapidKeys });
  } catch (err) {
    return json({ error: 'VAPID secrets could not be loaded', detail: String(err) }, 500);
  }

  // Service role: claims span every user. Everything it may do is behind the
  // two security-definer functions, which only service_role can execute.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc('push_claim_due');
  if (error) return json({ error: error.message }, 500);
  const claims = (data ?? []) as Claim[];

  const outcomes = await Promise.all(
    claims.map(async (c) => {
      // Declarative Web Push shape, same as push-test; public/sw.js parses it too.
      const message = JSON.stringify({
        web_push: 8030,
        notification: {
          title: c.title,
          body: c.body,
          navigate: new URL(c.url_path, appOrigin).href,
          tag: c.tag,
          lang: 'en',
          dir: 'ltr',
          silent: false,
        },
      });
      // The push service may hold a message for an offline device; never past
      // the 2-hour late limit.
      const ttl = Math.max(60, Math.floor((Date.parse(c.fire_at) + LATE_LIMIT_MS - Date.now()) / 1000));

      let status = 201;
      let detail: string | null = null;
      try {
        await appServer
          .subscribe({ endpoint: c.endpoint, keys: { p256dh: c.p256dh, auth: c.auth } })
          .pushTextMessage(message, { ttl, urgency: webpush.Urgency.High });
      } catch (err) {
        const response = err instanceof webpush.PushMessageError ? err.response : null;
        status = response?.status ?? 0;
        detail = response
          ? (await response.text().catch(() => '')).slice(0, 300) || response.statusText
          : String(err);
      }

      const { data: outcome, error: markError } = await supabase.rpc('push_mark_result', {
        p_claim_id: c.claim_id,
        p_http_status: status,
        p_error: detail,
      });
      if (markError) return 'mark-error';
      return outcome as string;
    }),
  );

  const count = (o: string) => outcomes.filter((x) => x === o).length;
  return json({
    claimed: claims.length,
    sent: count('sent'),
    failed: count('failed'),
    gone: count('gone'),
    removed: count('removed'),
    mark_errors: count('mark-error'),
  });
});
