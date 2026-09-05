# design-search

Fans a text query out to free image-search APIs, normalises every hit to one
shape, and returns them together. Powers the Design module's **Discover** tab.

The app calls it with `supabase.functions.invoke('design-search', { body })` —
JWT-verified, so only a signed-in ALFRED session can reach it.

## Providers

| Source | Key | Notes |
| --- | --- | --- |
| Unsplash | `UNSPLASH_ACCESS_KEY` | [unsplash.com/developers](https://unsplash.com/developers) — free "Demo" app, 50 req/hr |
| Pexels | `PEXELS_API_KEY` | [pexels.com/api](https://www.pexels.com/api/) — free, 200 req/hr |
| Openverse | *(none)* | works anonymously; set `OPENVERSE_TOKEN` to raise the rate limit ([api.openverse.org](https://api.openverse.org/)) |

A provider with no key is skipped and reported to the UI as `not configured`
(the source chip shows "no key") — the others still return.

## Deploy

```bash
supabase functions deploy design-search
supabase secrets set UNSPLASH_ACCESS_KEY=xxx PEXELS_API_KEY=xxx
# optional:
supabase secrets set OPENVERSE_TOKEN=xxx
```

## Request / response

```jsonc
// POST body
{ "q": "brutalist dashboard", "sources": ["unsplash","pexels","openverse"], "page": 1 }

// 200
{
  "query": "brutalist dashboard",
  "page": 1,
  "results": [
    { "id": "unsplash:abc", "source": "unsplash", "thumb_url": "…", "image_url": "…",
      "link_url": "https://unsplash.com/photos/abc", "title": "…", "author": "…",
      "author_url": "…", "license": null, "width": 4000, "height": 3000 }
  ],
  "sources": {
    "unsplash": { "count": 24, "error": null },
    "pexels":   { "count": 0,  "error": "not configured" },
    "openverse":{ "count": 18, "error": null }
  }
}
```

`page` is clamped to 1–20. Results are interleaved by source so no single
provider dominates the top of the grid.

## Not included

Dribbble, Behance, Pinterest and Awwwards have no usable public search API
(Dribbble's is OAuth + own-shots-only, Behance's was retired in 2020, Pinterest's
is own-pins/ads only, Awwwards has none). Reaching them needs a paid aggregator
(SerpApi / Apify) — add it as another provider in `providers.ts` when wanted.
