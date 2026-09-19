// design-backfill-dimensions — fills in width/height (0036) for design_items
// rows that predate that column, or that were ingested before it existed.
// Re-parses the already-cached bytes at thumb_path in the design-media
// bucket — never re-fetches the original source URL, and never re-runs the
// vision/embedding calls in design-ingest, so this costs bandwidth (one
// Storage download per row) and nothing else. Not wired to any UI button —
// like pair_internal_transfers()/detect_recurring_series(), it's a manual,
// re-runnable sweep: invoke it (with a signed-in user's JWT) and check the
// response, repeating while `has_more` is true.
//
//   supabase functions deploy design-backfill-dimensions
//   curl -X POST "$SUPABASE_URL/functions/v1/design-backfill-dimensions" \
//        -H "Authorization: Bearer <user JWT>" -H "Content-Type: application/json" -d '{}'
//
// Called via POST /functions/v1/design-backfill-dimensions { limit?: number }.
// JWT-verified (default Supabase behaviour — no verify_jwt override in
// config.toml for this function): only a signed-in ALFRED session can reach
// it, and every read/write below goes through an anon-key client carrying
// that session's own token, so RLS (and the matching storage policies) keep
// it scoped to the caller's own rows/objects — no service role involved.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from '../_shared/cors.ts';
import { parseImageDimensions } from '../_shared/imageDimensions.ts';

const BUCKET = 'design-media';
const DEFAULT_LIMIT = 200; // storage downloads only, no AI calls — generous per invocation

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

  let payload: { limit?: unknown };
  try {
    payload = await req.json();
  } catch {
    payload = {}; // an empty/absent body is fine — limit just falls back to DEFAULT_LIMIT
  }
  const limit =
    typeof payload.limit === 'number' && payload.limit > 0 ? Math.min(payload.limit, 1000) : DEFAULT_LIMIT;

  // Anon-key client with the caller's own bearer token forwarded — same
  // pattern as design-retry. RLS scopes the select/update below to this
  // user's own rows, and the "design media owner read" storage policy
  // scopes the download the same way — no service role needed since
  // nothing here touches another user's data.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  // gif is excluded up front — parseImageDimensions never recognizes one
  // (see its own file header for why), so downloading gif bytes here would
  // just be a wasted round trip. One extra row than `limit` so `has_more`
  // can be reported without a second count query.
  const { data: rows, error: selectError } = await supabase
    .from('design_items')
    .select('id, thumb_path')
    .is('width', null)
    .not('thumb_path', 'is', null)
    .neq('media_type', 'gif')
    .order('created_at', { ascending: true })
    .limit(limit + 1);
  if (selectError) return json({ error: selectError.message }, 500);

  const hasMore = (rows?.length ?? 0) > limit;
  const batch = (rows ?? []).slice(0, limit) as { id: string; thumb_path: string }[];

  let updated = 0;
  let unparsed = 0;
  const failures: { id: string; error: string }[] = [];

  for (const row of batch) {
    try {
      const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(row.thumb_path);
      if (downloadError || !blob) throw new Error(downloadError?.message ?? 'no data returned');

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const dims = parseImageDimensions(bytes);
      if (!dims) {
        unparsed++;
        continue;
      }

      const { error: updateError } = await supabase
        .from('design_items')
        .update({ width: dims.width, height: dims.height })
        .eq('id', row.id);
      if (updateError) throw new Error(updateError.message);
      updated++;
    } catch (err) {
      failures.push({ id: row.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return json({
    ok: true,
    scanned: batch.length,
    updated,
    unparsed, // downloaded fine, but the header didn't match any parser (truncated/corrupt cache)
    failed: failures.length,
    failures,
    has_more: hasMore,
  });
});
