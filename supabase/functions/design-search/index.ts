// design-search — fan a query out to free image-search APIs (Unsplash, Pexels,
// Openverse), normalise every hit to one shape, return them together. API keys
// live in Supabase secrets, never in the client.
//
//   supabase functions deploy design-search
//   supabase secrets set UNSPLASH_ACCESS_KEY=... PEXELS_API_KEY=...
//
// Called from the app via supabase.functions.invoke('design-search', {
//   body: { q, sources?: SourceId[], page?: number }
// }). JWT-verified: only a signed-in ALFRED session can reach it.

import { corsHeaders } from '../_shared/cors.ts';
import { NotConfiguredError, PROVIDERS } from './providers.ts';
import { ALL_SOURCES, type SearchResponse, type SourceId } from './types.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let payload: { q?: unknown; sources?: unknown; page?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const q = typeof payload.q === 'string' ? payload.q.trim() : '';
  if (!q) return json({ error: 'Pass a non-empty "q".' }, 400);

  const page = Math.max(1, Math.min(20, Number(payload.page) || 1));

  const requested = Array.isArray(payload.sources)
    ? (payload.sources.filter((s): s is SourceId => ALL_SOURCES.includes(s as SourceId)))
    : ALL_SOURCES;
  const sources = requested.length ? requested : ALL_SOURCES;

  const settled = await Promise.allSettled(
    sources.map((s) => PROVIDERS[s](q, page)),
  );

  const out: SearchResponse = {
    query: q,
    page,
    results: [],
    sources: {} as SearchResponse['sources'],
  };

  settled.forEach((r, i) => {
    const source = sources[i];
    if (r.status === 'fulfilled') {
      out.results.push(...r.value);
      out.sources[source] = { count: r.value.length, error: null };
    } else {
      const err = r.reason;
      out.sources[source] = {
        count: 0,
        error:
          err instanceof NotConfiguredError
            ? 'not configured'
            : err instanceof Error
              ? err.message
              : 'failed',
      };
    }
  });

  // interleave sources so no one provider dominates the top of the grid
  out.results = interleave(sources, out.results);

  return json(out);
});

function interleave(order: SourceId[], items: SearchResponse['results']) {
  const buckets = new Map<SourceId, SearchResponse['results']>();
  for (const s of order) buckets.set(s, []);
  for (const it of items) buckets.get(it.source)?.push(it);
  const woven: SearchResponse['results'] = [];
  let added = true;
  for (let i = 0; added; i++) {
    added = false;
    for (const s of order) {
      const b = buckets.get(s)!;
      if (i < b.length) {
        woven.push(b[i]);
        added = true;
      }
    }
  }
  return woven;
}
