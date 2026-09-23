// design-capture — thin insert for the Design module's capture flow (browser
// extension, share sheet, etc). Runs under the caller's own JWT so RLS
// applies — never the service role. Hands enrichment off to design-ingest
// and returns immediately; it never waits on that call.
//
//   supabase functions deploy design-capture
//
// Called via POST /functions/v1/design-capture
//   { page_url, image_url?, link_url?, title?, medium?, board_id? }
// Board: an explicit board_id wins; else the item is homed in the inbox. An
// explicit medium (with no board_id) additionally CROSS-LISTS the item into the
// board whose name matches it (case-insensitive), if one exists — via a
// design_item_boards row; the item never leaves the inbox.
// JWT-verified: only a signed-in ALFRED session can reach it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from '../_shared/cors.ts';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const ALLOWED_MEDIA = [
  'identity', 'packaging', 'editorial', 'motion', 'type', 'web', 'illustration', 'other',
] as const;
type Medium = (typeof ALLOWED_MEDIA)[number];

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

  let payload: {
    page_url?: unknown;
    image_url?: unknown;
    title?: unknown;
    medium?: unknown;
    board_id?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const page_url = typeof payload.page_url === 'string' ? payload.page_url.trim() : '';
  const image_url = typeof payload.image_url === 'string' ? payload.image_url.trim() : '';
  if (!page_url && !image_url) {
    return json({ error: 'Provide page_url or image_url.' }, 400);
  }

  const medium = typeof payload.medium === 'string' ? (payload.medium as Medium) : undefined;
  if (medium !== undefined && !ALLOWED_MEDIA.includes(medium)) {
    return json({ error: `medium must be one of: ${ALLOWED_MEDIA.join(', ')}` }, 400);
  }

  // Anon-key client with the caller's own bearer token forwarded — RLS
  // enforces user_id, exactly as if the browser had called Supabase directly.
  // Never the service role here; that's design-ingest's job.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  let board_id = typeof payload.board_id === 'string' ? payload.board_id : null;

  // Medium-based cross-listing: ONLY when the caller explicitly sent a medium
  // (the extension's "Save to Alfred as…" choice — a deliberate signal, not an
  // AI guess) and no board_id, which always wins. It happens here, at capture
  // time, and nowhere else: design-ingest's vision call may assign a medium
  // later, but that never adds or moves anything after the fact. This only
  // FINDS the board; board_id stays the inbox (below) and the item is linked
  // into the matched board once it exists. The medium slugs are the board
  // labels lower-cased (Identity, Packaging, …), matched case-insensitively
  // against existing board names — oldest board wins a tie, the inbox is never
  // a target, and no board is ever created. No match (or a failed lookup — a
  // capture must not be lost over routing) simply means no cross-listing.
  let alsoBoardId: string | null = null;
  if (!board_id && medium) {
    const { data: boards, error: boardsError } = await supabase
      .from('design_boards')
      .select('id, name')
      .eq('is_inbox', false)
      .order('created_at', { ascending: true });
    if (boardsError) {
      console.error('design-capture: board lookup for medium routing failed', boardsError.message);
    } else {
      alsoBoardId = boards?.find((b) => b.name.trim().toLowerCase() === medium)?.id ?? null;
    }
  }

  if (!board_id) {
    // design_items.board_id is not-null — an unfiled capture resolves to the
    // caller's inbox board rather than being rejected or stored boardless.
    const { data: inboxBoardId, error: inboxError } = await supabase.rpc('design_inbox_board');
    if (inboxError) return json({ error: inboxError.message }, 500);
    board_id = inboxBoardId as string;
  }

  const { data, error } = await supabase
    .from('design_items')
    .insert({
      image_url: image_url || null,
      link_url: page_url || null,
      title: typeof payload.title === 'string' ? payload.title : null,
      medium: medium ?? null,
      board_id,
      enrich_status: 'pending',
    })
    .select('id')
    .single();

  if (error) return json({ error: error.message }, 400);

  const item_id = data.id as string;

  // The cross-listing goes in after the item exists. If it fails the save
  // still succeeds — the item is safely in the inbox — and the failure is
  // logged (with the ids needed to add it by hand) rather than surfaced.
  let alsoIn: string | null = null;
  if (alsoBoardId) {
    const { error: linkError } = await supabase
      .from('design_item_boards')
      .insert({ item_id, board_id: alsoBoardId });
    if (linkError) {
      console.error(
        `design-capture: cross-listing item ${item_id} into board ${alsoBoardId} failed: ${linkError.message}`,
      );
    } else {
      alsoIn = alsoBoardId;
    }
  }

  // Fire-and-forget. Do NOT await — design-ingest does unfurl + vision +
  // embedding work and this request must return in well under a second.
  // waitUntil keeps the isolate alive after the response is sent so the
  // outbound call actually leaves before Deno tears the function down;
  // without it the fetch would be killed mid-flight.
  EdgeRuntime.waitUntil(
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/design-ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The one credential design-ingest actually accepts — its
        // verify_jwt is off, but it checks this header itself against the
        // service-role key and rejects anything else. See its file header.
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ item_id }),
    })
      .then(async (res) => {
        // fetch only rejects on a network-level failure — a non-2xx response
        // (e.g. a 401 from the platform JWT gate) resolves normally and would
        // otherwise be silently discarded here, never reaching .catch().
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.error(`design-ingest invoke returned ${res.status} for ${item_id}: ${body.slice(0, 300)}`);
        }
      })
      .catch((e) => {
        console.error(`design-ingest invoke failed (network error) for ${item_id}`, e);
      }),
  );

  return json({ id: item_id, also_in: alsoIn }, 201);
});
