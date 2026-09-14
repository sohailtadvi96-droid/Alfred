// design-retry — re-invokes design-ingest for one design_items row, on the
// caller's behalf. Exists so nothing but a signed-in ALFRED session (or
// design-capture) can ever reach design-ingest: that function checks its
// Authorization header against the service-role key and rejects anything
// else, so a browser holding only a user JWT can't call it directly —
// this is the one thing that can, and only after confirming the row is
// actually the caller's own.
//
//   supabase functions deploy design-retry
//
// Called via POST /functions/v1/design-retry { item_id }.
// JWT-verified: only a signed-in ALFRED session can reach it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from '../_shared/cors.ts';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header.' }, 401);

  let payload: { item_id?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const item_id = typeof payload.item_id === 'string' ? payload.item_id : '';
  if (!item_id) return json({ error: 'Provide item_id.' }, 400);

  // Anon-key client with the caller's own bearer token forwarded — RLS
  // enforces user_id, same pattern as design-capture. Never the service
  // role here; that's design-ingest's job, invoked below.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  // Ownership check and the synchronous state transition in one round
  // trip: under RLS this UPDATE only ever touches a row the caller owns,
  // so zero rows back means either it doesn't exist or it isn't theirs —
  // either way, 404, not a distinction worth leaking. Setting
  // enrich_status='running' here (not left to design-ingest's own first
  // write) means the row is already in that state by the time this
  // responds, so the frontend's poll-while-pending logic picks it up
  // immediately instead of racing the background invoke below.
  const { data: item, error } = await supabase
    .from('design_items')
    .update({ enrich_status: 'running', enrich_error: null })
    .eq('id', item_id)
    .select('id')
    .single();
  if (error || !item) return json({ error: 'Item not found.' }, 404);

  // Fire-and-forget, same as design-capture's own handoff — design-ingest
  // does real work (unfurl, download, vision, embedding) and this request
  // must return fast. The frontend already polls pending/running items.
  EdgeRuntime.waitUntil(
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/design-ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The one credential design-ingest actually accepts now — see its
        // own file header.
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ item_id }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.error(`design-ingest invoke returned ${res.status} for ${item_id}: ${body.slice(0, 300)}`);
        }
      })
      .catch((e) => {
        console.error(`design-ingest invoke failed (network error) for ${item_id}`, e);
      }),
  );

  return json({ ok: true, item_id });
});
