// design-ingest — resolves media for a design_items row: when the row has no
// image_url, unfurls link_url's Open Graph / Twitter Card tags to find one;
// either way, caches the fetched bytes in the design-media bucket AS-IS, then
// runs AI enrichment (caption/tags/colors/embedding) against a Storage-
// transformed rendition of that cache, never the raw original.
//
// Deliberately no resize/re-encode on ingest — resizing is a read-time
// concern, handled by Supabase Storage's image-transform endpoint
// (/storage/v1/render/image/authenticated/...?width=&quality=) both for the
// frontend (Step 5) and for the vision call below, not something this
// function computes and stores itself. (This wasn't the original plan — see
// docs/DESIGN.md gotchas for why: no image codec, WASM or native-canvas,
// survives this edge runtime.) A gif gets the same treatment — stored as-is
// (0032 added image/gif to the bucket's mime allowlist), not thumbnailed —
// with the transform endpoint tried first for a static frame at read time.
// Confirmed by testing: it doesn't actually work on a real animated gif (the
// download call throws), so both the vision call below and the grid (Step
// 5) fall back to the original animated file — the vision call sends it as
// the image directly, the grid just renders the gif.
//
//   supabase functions deploy design-ingest
//   supabase secrets set OPENAI_API_KEY=...
//
// Called via POST /functions/v1/design-ingest { item_id }. Invoked by
// design-capture and design-retry, both through EdgeRuntime.waitUntil —
// never awaited by the caller, so nothing here can assume a client is still
// listening for the response. verify_jwt is off (this is machine-to-machine,
// there's no user session), so the handler itself checks the Authorization
// header against the service-role key and rejects anything else — nothing
// holding only a user JWT can reach this directly, only design-capture and
// design-retry, which hold the real secret. Runs under the service role:
// RLS does not apply, so every read/write below is scoped by the row's own
// id / user_id, never by an auth context.
//
// Media resolution and AI enrichment are two separate writes, deliberately —
// a vision/embedding failure must not discard a thumbnail that's already
// safely cached. The row can end 'done' after the first write with no
// caption/embedding if OPENAI_API_KEY is missing or the model call fails —
// enrich_error carries why, thumb_path is untouched either way.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from '../_shared/cors.ts';
import { type Dimensions, parseImageDimensions } from '../_shared/imageDimensions.ts';

const FETCH_TIMEOUT_MS = 20_000;
const AI_TIMEOUT_MS = 30_000;
const BUCKET = 'design-media';
const VISION_MODEL = 'gpt-4o-mini';
const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dims — baked into the HNSW index (0029)
const RENDITION_WIDTH = 800;
const ALLOWED_MEDIUMS = [
  'identity', 'packaging', 'editorial', 'motion', 'type', 'web', 'illustration', 'other',
] as const;

// Fixed vocabulary the vision model picks from — no invented tags. Without
// this the tag cloud fills with one-off single-use terms that never work as
// filters (free-text search covers anything this list misses). 12 per
// category, deliberately excluding generic aesthetic adjectives (modern,
// clean, minimal, sleek, elegant, professional, bold, beautiful) — those
// describe nothing distinguishing. See docs/DESIGN.md for the full writeup.
const ALLOWED_TAGS = [
  // style
  'brutalist', 'swiss style', 'art deco', 'art nouveau', 'bauhaus', 'memphis', 'y2k', 'grunge',
  'psychedelic', 'flat design', 'skeuomorphic', 'maximalist',
  // colour family
  'monochrome', 'black and white', 'pastel', 'neon', 'earth tones', 'jewel tones', 'muted palette',
  'high contrast', 'warm tones', 'cool tones', 'duotone', 'metallic',
  // mood
  'playful', 'nostalgic', 'moody', 'serene', 'energetic', 'whimsical', 'somber', 'dreamy', 'edgy',
  'cozy', 'futuristic', 'raw',
  // technique
  'hand drawn', 'collage', 'photography', '3d render', 'gradient', 'texture', 'grid layout',
  'asymmetric layout', 'line art', 'halftone', 'glitch effect', 'paper cutout',
  // subject
  'portrait', 'product shot', 'landscape', 'architecture', 'interior space', 'fashion', 'food',
  'abstract shapes', 'figure illustration', 'nature', 'cityscape', 'still life',
] as const;

// A default Deno fetch gets 403'd by a good number of sites.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

type MediaType = 'image' | 'video' | 'gif';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000; // avoid a call-stack blowout from String.fromCharCode(...hugeArray)
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

interface VisionResult {
  caption: string;
  tags: string[];
  medium: (typeof ALLOWED_MEDIUMS)[number] | null;
  colors: { hex: string; pct: number }[];
}

function stripJsonFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

async function callVisionModel(
  imageBytes: Uint8Array,
  contentType: string,
  apiKey: string,
): Promise<VisionResult> {
  const prompt = `You are labeling an image for a personal design-inspiration library. Respond with strict JSON only — no markdown fences, no commentary: {"caption": string, "tags": string[], "medium": string, "colors": [{"hex": string, "pct": number}]}.
- caption: one sentence describing subject, style and mood.
- tags: choose exactly 5-8 terms from this fixed list only — do not invent terms, do not use anything outside it: ${ALLOWED_TAGS.join(', ')}.
- medium: exactly one of: ${ALLOWED_MEDIUMS.join(', ')}.
- colors: the 5 dominant colors as hex codes with approximate share (0-1), sorted by pct descending.`;

  const res = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: VISION_MODEL,
        response_format: { type: 'json_object' },
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${contentType};base64,${bytesToBase64(imageBytes)}` } },
            ],
          },
        ],
      }),
    },
    AI_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error(`Vision call failed: ${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  if (typeof raw !== 'string') throw new Error('Vision response missing content.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = JSON.parse(stripJsonFences(raw)); // strict json_object mode shouldn't need this, but parse defensively
  }

  const p = parsed as Partial<VisionResult>;
  if (typeof p.caption !== 'string' || !Array.isArray(p.tags) || !Array.isArray(p.colors)) {
    throw new Error('Vision response failed shape validation.');
  }
  const medium =
    typeof p.medium === 'string' && (ALLOWED_MEDIUMS as readonly string[]).includes(p.medium)
      ? (p.medium as VisionResult['medium'])
      : null;

  return {
    caption: p.caption,
    // Defensive, same as medium below — the prompt says "this list only"
    // but nothing stops a model from ignoring it.
    tags: p.tags.filter(
      (t): t is string => typeof t === 'string' && (ALLOWED_TAGS as readonly string[]).includes(t),
    ),
    medium,
    colors: p.colors.filter(
      (c): c is { hex: string; pct: number } =>
        !!c && typeof c.hex === 'string' && typeof c.pct === 'number',
    ),
  };
}

async function embedText(text: string, apiKey: string): Promise<number[]> {
  const res = await fetchWithTimeout(
    'https://api.openai.com/v1/embeddings',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    },
    AI_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error(`Embedding call failed: ${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`);
  }
  const data = await res.json();
  const embedding = data.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error('Embedding response missing vector.');
  return embedding;
}

interface OgTags {
  ogImage?: string;
  ogVideo?: string;
  ogVideoType?: string;
  ogVideoPoster?: string;
  twitterImage?: string;
}

// Deliberately not a full HTML parser — edge functions don't have DOMParser,
// and og/twitter tags are always flat self-closing <meta> elements in practice.
function parseOgTags(html: string): OgTags {
  const tags: OgTags = {};
  const nameRe = /(?:property|name)\s*=\s*["']([^"']+)["']/i;
  const contentRe = /content\s*=\s*["']([^"']*)["']/i;

  for (const match of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = match[0];
    const name = tag.match(nameRe)?.[1]?.toLowerCase();
    const content = tag.match(contentRe)?.[1];
    if (!name || !content) continue;

    switch (name) {
      case 'og:image':
      case 'og:image:url':
        tags.ogImage ??= content;
        break;
      case 'og:video':
      case 'og:video:url':
      case 'og:video:secure_url':
        tags.ogVideo ??= content;
        break;
      case 'og:video:type':
        tags.ogVideoType = content;
        break;
      case 'og:video:poster':
        tags.ogVideoPoster ??= content;
        break;
      case 'twitter:image':
      case 'twitter:image:src':
        tags.twitterImage ??= content;
        break;
    }
  }
  return tags;
}

function resolveUrl(base: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

function isGifUrl(url: string): boolean {
  return /\.gif(?:[?#]|$)/i.test(url);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // verify_jwt is off (see file header — this is invoked machine-to-machine,
  // there's no user session in play), so the platform gate lets any request
  // through regardless of who's asking. This is the actual gate: only a
  // caller holding the service-role key gets past it. design-capture and
  // design-retry are the only things that should ever call this directly —
  // a browser holding just a user JWT cannot reach this function.
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey || req.headers.get('Authorization') !== `Bearer ${serviceRoleKey}`) {
    return json({ error: 'Forbidden.' }, 403);
  }

  let payload: { item_id?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const item_id = typeof payload.item_id === 'string' ? payload.item_id : '';
  if (!item_id) return json({ error: 'Provide item_id.' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // The very first write, before any fetch/parse that could throw — otherwise
  // a failure upstream of this line leaves the row silently stuck at
  // whatever status design-capture wrote, with no error recorded anywhere.
  await supabase.from('design_items').update({ enrich_status: 'running' }).eq('id', item_id);

  // Hoisted above the try so the catch block can still see how far we got —
  // e.g. a still resolved via unfurl but never reached (the media fetch
  // itself 403s) should still record where it came from on the failed row,
  // not just on a row that reaches 'done'.
  let mediaType: MediaType = 'image';
  let posterUrl: string | null = null;
  // The URL of the single still frame we'll actually download and cache.
  let stillUrl: string | null = null;

  try {
    const { data: item, error: loadError } = await supabase
      .from('design_items')
      .select('id, user_id, image_url, link_url, tags, medium')
      .eq('id', item_id)
      .single();
    if (loadError || !item) throw new Error(loadError?.message ?? 'Item not found.');

    stillUrl = item.image_url ?? null;

    if (!stillUrl) {
      if (!item.link_url) throw new Error('Item has neither image_url nor link_url.');

      const pageRes = await fetchWithTimeout(item.link_url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!pageRes.ok) throw new Error(`Fetching ${item.link_url} failed: ${pageRes.status}`);
      const tags = parseOgTags(await pageRes.text());

      if (tags.ogVideo || tags.ogVideoType) {
        mediaType = 'video';
        const poster = tags.ogVideoPoster ?? tags.ogImage ?? tags.twitterImage;
        posterUrl = poster ? resolveUrl(item.link_url, poster) : null;
        stillUrl = posterUrl;
      } else {
        const candidate = tags.ogImage ?? tags.twitterImage;
        if (!candidate) throw new Error('No og:video, og:image, or twitter:image found.');
        stillUrl = resolveUrl(item.link_url, candidate);
      }
    }

    if (mediaType !== 'video' && stillUrl && isGifUrl(stillUrl)) mediaType = 'gif';

    let thumbPath: string | null = null;
    // Null for gif (not parsed — see parseImageDimensions) or when the
    // header didn't match any parser, e.g. a truncated download.
    let dimensions: Dimensions | null = null;

    if (stillUrl) {
      const mediaHeaders: Record<string, string> = {
        'User-Agent': USER_AGENT,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      };
      // fetch() coerces header values to strings, so an unconditional
      // `Referer: item.link_url ?? undefined` would send the literal
      // string "undefined" when there's no link_url to reference.
      if (item.link_url) mediaHeaders.Referer = item.link_url;

      const mediaRes = await fetchWithTimeout(stillUrl, { headers: mediaHeaders });
      if (!mediaRes.ok) throw new Error(`Fetching media ${stillUrl} failed: ${mediaRes.status}`);
      const bytes = new Uint8Array(await mediaRes.arrayBuffer());
      if (mediaType !== 'gif') dimensions = parseImageDimensions(bytes);

      // No resize/re-encode (see file header) — cache the original bytes as
      // uploaded. A gif is stored as-is too, not thumbnailed: no codec in
      // this runtime can decode/re-encode one, so there's nothing to
      // attempt — 0032 added image/gif to the bucket's mime allowlist for
      // exactly this. The vision model and the grid each get a static
      // frame via Storage's transform endpoint at read time instead.
      const declaredType = mediaRes.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      const uploadContentType =
        mediaType === 'gif'
          ? 'image/gif'
          : declaredType === 'image/png'
            ? 'image/png'
            : declaredType === 'image/webp'
              ? 'image/webp'
              : 'image/jpeg';
      const ext =
        uploadContentType === 'image/gif'
          ? 'gif'
          : uploadContentType === 'image/png'
            ? 'png'
            : uploadContentType === 'image/webp'
              ? 'webp'
              : 'jpg';
      thumbPath = `${item.user_id}/${item_id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(thumbPath, bytes, { contentType: uploadContentType, upsert: true });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
    } else if (mediaType !== 'video') {
      throw new Error('No media resolved for this item.');
    }

    // Video with no discoverable poster: design_items_media_present_check
    // requires image_url or thumb_path once enrich_status='done', and per
    // DESIGN.md this stays null rather than substituting something else — so
    // this genuinely can't reach 'done'. Fail clearly instead of letting the
    // constraint reject the update with a confusing postgres error.
    if (mediaType === 'video' && !thumbPath && !item.image_url) {
      throw new Error('Video has no resolvable poster image (og:image/og:video:poster/twitter:image all missing).');
    }

    // Persisted now, ahead of the AI call below — a vision/embedding failure
    // must not lose a thumbnail that's already safely uploaded. thumbPath is
    // guaranteed non-null here: every path that could leave it null already
    // threw above (a plain "no media resolved" throw, or the video-poster
    // check just above).
    const { error: mediaUpdateError } = await supabase
      .from('design_items')
      .update({
        // image_url is provenance for a still, not a video poster — poster_url
        // already owns that role for video, so leave image_url untouched there.
        ...(mediaType !== 'video' ? { image_url: stillUrl } : {}),
        media_type: mediaType,
        poster_url: posterUrl,
        thumb_path: thumbPath,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
      })
      .eq('id', item_id);
    if (mediaUpdateError) throw new Error(mediaUpdateError.message);

    // Step 4 — AI enrichment, against a Storage-transformed rendition of
    // thumbPath (never the cached original — see file header). Its own
    // try/catch so a failure here records enrich_status='failed' without
    // touching the media fields just written above.
    try {
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openaiKey) throw new Error('OPENAI_API_KEY is not set.');

      let renditionBytes: Uint8Array;
      let renditionType: string;
      let usedTransformFallback = false;
      try {
        const { data: transformedBlob, error: transformError } = await supabase.storage
          .from(BUCKET)
          .download(thumbPath, { transform: { width: RENDITION_WIDTH, quality: 80 } });
        if (transformError || !transformedBlob) {
          throw new Error(transformError?.message ?? 'no data returned');
        }
        renditionBytes = new Uint8Array(await transformedBlob.arrayBuffer());
        renditionType = transformedBlob.type || 'image/webp';
      } catch (transformErr) {
        usedTransformFallback = true;
        // gif is documented as a supported transform input, but confirmed
        // by testing: it throws on a real animated gif. Only gif gets a
        // fallback here — send the original animated file straight to the
        // vision model rather than failing enrichment outright. Any other
        // media type failing here is a real problem, not a format gap.
        if (mediaType !== 'gif') {
          throw new Error(
            `Transform fetch failed: ${transformErr instanceof Error ? transformErr.message : String(transformErr)}`,
          );
        }
        const { data: originalBlob, error: originalError } = await supabase.storage
          .from(BUCKET)
          .download(thumbPath);
        if (originalError || !originalBlob) {
          throw new Error(`Original gif fetch failed: ${originalError?.message ?? 'no data returned'}`);
        }
        renditionBytes = new Uint8Array(await originalBlob.arrayBuffer());
        renditionType = 'image/gif';
      }

      const vision = await callVisionModel(renditionBytes, renditionType, openaiKey);

      const existingTags: string[] = Array.isArray(item.tags) ? item.tags : [];
      const mergedTags = Array.from(new Set([...existingTags, ...vision.tags]));
      // A medium chosen in the extension is the user's explicit choice and
      // outranks the model — only fill it in when the row doesn't have one.
      const medium = item.medium ?? vision.medium ?? null;

      const embedding = await embedText(`${vision.caption} ${vision.tags.join(' ')}`, openaiKey);

      const { error: enrichUpdateError } = await supabase
        .from('design_items')
        .update({
          caption: vision.caption,
          tags: mergedTags,
          colors: vision.colors,
          medium,
          embedding,
          enrich_status: 'done',
          enrich_error: null,
          enriched_at: new Date().toISOString(),
        })
        .eq('id', item_id);
      if (enrichUpdateError) throw new Error(enrichUpdateError.message);

      return json({
        ok: true,
        item_id,
        media_type: mediaType,
        thumb_path: thumbPath,
        enriched: true,
        // Which input the vision call actually saw, and whether it came
        // from Storage's transform or the animated-original fallback — see
        // the catch just above. Cheap to keep; the only way to tell from
        // the response which path a gif actually took.
        vision_input_type: renditionType,
        vision_used_transform_fallback: usedTransformFallback,
        vision_input_bytes: renditionBytes.length,
      });
    } catch (enrichErr) {
      const enrichMessage = enrichErr instanceof Error ? enrichErr.message : String(enrichErr);
      console.error(`design-ingest enrichment failed for ${item_id}:`, enrichMessage);
      await supabase
        .from('design_items')
        .update({ enrich_status: 'failed', enrich_error: enrichMessage })
        .eq('id', item_id);
      return json({ error: enrichMessage, item_id, media_type: mediaType, thumb_path: thumbPath }, 500);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`design-ingest failed for ${item_id}:`, message);
    await supabase
      .from('design_items')
      .update({
        // Same provenance write-back as the success path — most valuable
        // exactly when something failed after a still was already resolved
        // but before it could be fetched/cached (e.g. a 403 on the media URL).
        ...(mediaType !== 'video' && stillUrl ? { image_url: stillUrl } : {}),
        enrich_status: 'failed',
        enrich_error: message,
      })
      .eq('id', item_id);
    return json({ error: message }, 500);
  }
});
